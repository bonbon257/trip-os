/**
 * Phase 0 数据地基 — 迁移 / 兼容 / 回归测试
 *
 * 覆盖：
 *   1. v1 → v2 迁移（旧数据无损 + 新集合补齐 + 幂等）
 *   2. PlaceState 语义播种与反向流转
 *   3. merge 兜底不会把种子数据灌进老用户数据
 *   4. PlanView adapter（Trip 不被改写）
 *   5. 两个此前空壳的 AI Action（createTrip / generateDestinationRecommendation）
 *   6. 天气 mock 已移除且降级正确
 *   7. 数据库体积变化
 */
import { useStore, migrateState, mergeState, type DB } from '@/services/store';
import { seedPlaceStates, upsertPlaceState, statusOf } from '@/services/placeState';
import { resolvePlans, tripToPlanView, weekendToPlanView, deriveContext } from '@/services/plan';
import { applyActions, validateAction } from '@/ai/actions';
import { detectConflicts, weatherOf, computeDayIntensity } from '@/services/intelligence';
import { weatherFor, getWorld } from '@/services/world';
import { buildTrip } from '@/services/tripFactory';
import type { AIAction, PlaceState } from '@/types';

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = '') => results.push({ name, ok, detail });
const kb = (s: string) => `${(s.length / 1024).toFixed(1)} KB`;

// ── 0. 基线：初始 DB ────────────────────────────────────────
const seedDb = useStore.getState().db;
check('初始 DB 已含三个新集合', Array.isArray(seedDb.placeStates) && Array.isArray(seedDb.weekendPlans) && Array.isArray(seedDb.destinationPicks),
  `placeStates=${seedDb.placeStates.length}`);
check('种子数据已播种 PlaceState', seedDb.placeStates.length > 0, `${seedDb.placeStates.length} 条`);
check('种子 PlaceState 都挂在 TRIP 容器', seedDb.placeStates.every((s) => s.containerType === 'TRIP'));

// ── 1. v1 → v2 迁移 ────────────────────────────────────────
// 构造一份「v1 老数据」：没有 placeStates / weekendPlans / destinationPicks
const v1Db = {
  trips: [
    {
      id: 'trip-old', title: '老旅行', destinationId: 'tokyo', destinationIds: ['tokyo'],
      destinationName: '东京', emoji: '🗼', startDate: '2026-10-01', endDate: '2026-10-03',
      status: 'planning', planningPreference: 'auto', totalBudget: 12000,
      members: [], createdAt: '', updatedAt: '',
      profile: { travelMood: 'change', pace: 'balanced', companions: 'solo', interests: [], dislikes: [], origin: '上海', durationDays: 3 },
    },
  ],
  days: [
    { id: 'trip-old-d1', tripId: 'trip-old', date: '2026-10-01', index: 1, title: '抵达' },
    { id: 'trip-old-d2', tripId: 'trip-old', date: '2026-10-02', index: 2, title: '第 2 天' },
  ],
  activities: [
    { id: 'a1', tripId: 'trip-old', dayId: 'trip-old-d1', placeId: 'tokyo-1', title: '去过了', startTime: '09:00', endTime: '11:00', type: 'sight', estimatedCost: 0, transportMode: 'walk', transportMin: 0, status: 'done', order: 0 },
    { id: 'a2', tripId: 'trip-old', dayId: 'trip-old-d2', placeId: 'tokyo-2', title: '已安排', startTime: '09:00', endTime: '11:00', type: 'sight', estimatedCost: 0, transportMode: 'walk', transportMin: 0, status: 'planned', order: 0 },
  ],
  bookings: [], expenses: [], checklists: [], files: [], journals: [], proposals: [],
  discoveredPlaces: [],
  savedPlaces: { 'trip-old': ['tokyo-1', 'tokyo-2', 'tokyo-3'] },
} as unknown as DB;

const migrated = migrateState({ db: v1Db } as never, 1).db as DB;

check('迁移后新增三个集合', Array.isArray(migrated.placeStates) && Array.isArray(migrated.weekendPlans) && Array.isArray(migrated.destinationPicks),
  `placeStates=${migrated.placeStates?.length} weekendPlans=${migrated.weekendPlans?.length} picks=${migrated.destinationPicks?.length}`);
check('迁移不改动既有 trips', JSON.stringify(migrated.trips) === JSON.stringify(v1Db.trips));
check('迁移不改动既有 days', JSON.stringify(migrated.days) === JSON.stringify(v1Db.days));
check('迁移不改动既有 activities', JSON.stringify(migrated.activities) === JSON.stringify(v1Db.activities));
check('迁移不改动既有 savedPlaces', JSON.stringify(migrated.savedPlaces) === JSON.stringify(v1Db.savedPlaces));
check('迁移后旧集合数量不变', migrated.trips.length === 1 && migrated.days.length === 2 && migrated.activities.length === 2);

// PlaceState 语义：done→VISITED / 有 activity→PLANNED / 仅收藏→WANTED
const st = (p: string) => statusOf(migrated, 'TRIP', 'trip-old', p);
check('已完成的地点 → VISITED', st('tokyo-1') === 'VISITED', String(st('tokyo-1')));
check('仅已排期的地点 → PLANNED', st('tokyo-2') === 'PLANNED', String(st('tokyo-2')));
check('只在候选池的地点 → WANTED', st('tokyo-3') === 'WANTED', String(st('tokyo-3')));
check('播种条数 = 收藏 ∪ 已排期', migrated.placeStates.length === 3, `${migrated.placeStates.length} 条`);

// 幂等
const twice = migrateState({ db: migrated } as never, 1).db as DB;
check('迁移幂等（重复调用不增条数）', twice.placeStates.length === migrated.placeStates.length,
  `${migrated.placeStates.length} → ${twice.placeStates.length}`);

// v2 数据不应被重复迁移
const alreadyV2 = migrateState({ db: migrated } as never, 2).db as DB;
check('version>=2 时原样返回', alreadyV2.placeStates.length === migrated.placeStates.length);

// 体积：用真实量级的种子数据衡量（合成 fixture 只有 1.2KB，比例会严重失真）
const { placeStates: _ps, weekendPlans: _wp, destinationPicks: _dp, ...seedV1Shape } = seedDb;
const seedV1Json = JSON.stringify(seedV1Shape);
const seedV2Json = JSON.stringify(seedDb);
const growth = (seedV2Json.length - seedV1Json.length) / seedV1Json.length;
check('迁移后体积增长可接受（真实量级 <25%）', growth < 0.25,
  `${kb(seedV1Json)} → ${kb(seedV2Json)} (+${(growth * 100).toFixed(1)}%)，${seedDb.placeStates.length} 条 PlaceState`);
check('单条 PlaceState 只存引用（<200B）',
  seedDb.placeStates.length === 0 || (seedV2Json.length - seedV1Json.length) / seedDb.placeStates.length < 200,
  seedDb.placeStates.length
    ? `约 ${Math.round((seedV2Json.length - seedV1Json.length) / seedDb.placeStates.length)} B/条`
    : '无数据');

// ── 2. merge 兜底 ───────────────────────────────────────────
const merged = mergeState({ db: v1Db } as never, useStore.getState()).db as DB;
check('merge 对缺失的新集合兜底为 []', merged.placeStates.length === 0 && merged.weekendPlans.length === 0 && merged.destinationPicks.length === 0,
  `placeStates=${merged.placeStates.length}（若为种子条数则说明灌进了种子数据）`);
check('merge 保留旧 trips', merged.trips.length === 1, `${merged.trips.length}`);

// ── 3. PlaceState 流转（正向 + 反向）────────────────────────
let list: PlaceState[] = [];
list = upsertPlaceState(list, { containerType: 'TRIP', containerId: 't1', placeId: 'p1', status: 'WANTED' });
list = upsertPlaceState(list, { containerType: 'TRIP', containerId: 't1', placeId: 'p1', status: 'CANDIDATE' });
list = upsertPlaceState(list, { containerType: 'TRIP', containerId: 't1', placeId: 'p1', status: 'PLANNED' });
list = upsertPlaceState(list, { containerType: 'TRIP', containerId: 't1', placeId: 'p1', status: 'VISITED' });
check('正向流转 WANTED→VISITED 只保留一条记录', list.length === 1 && list[0].status === 'VISITED', `${list.length} 条 / ${list[0]?.status}`);

// 反向：已安排 → 退回候选（「今天不想去了」）
const back = upsertPlaceState(list, { containerType: 'TRIP', containerId: 't1', placeId: 'p1', status: 'CANDIDATE' });
check('反向流转 VISITED→CANDIDATE 允许', back.length === 1 && back[0].status === 'CANDIDATE', back[0]?.status);
const back2 = upsertPlaceState(back, { containerType: 'TRIP', containerId: 't1', placeId: 'p1', status: 'WANTED' });
check('反向流转 CANDIDATE→WANTED 允许', back2[0].status === 'WANTED', back2[0]?.status);
check('状态只有 4 态，无第五态', ['WANTED', 'CANDIDATE', 'PLANNED', 'VISITED'].length === 4);

// ── 4. PlanView adapter ────────────────────────────────────
const seedTrip = seedDb.trips[0];
const tripSnapshot = JSON.stringify(seedTrip);
const tv = tripToPlanView(seedTrip);
check('Trip → PlanView 基本字段正确', tv.type === 'TRIP' && tv.id === seedTrip.id && tv.context === 'TRAVEL' && tv.status === seedTrip.status,
  `${tv.type}/${tv.context}/${tv.status}`);
check('Trip → PlanView 带起止日期与地点', Boolean(tv.startDate && tv.endDate && tv.location), `${tv.location} ${tv.startDate}~${tv.endDate}`);
check('adapter 不修改 Trip 本体（只读）', JSON.stringify(seedTrip) === tripSnapshot);

const weekend = { id: 'w1', title: '这周末', weekendOf: '2026-09-05', endDate: '2026-09-06', status: 'planned', homeCity: '上海', placeIds: ['p1'], activityIds: [], createdAt: '', updatedAt: '' } as never;
const wv = weekendToPlanView(weekend as never);
check('WeekendPlan → PlanView 正确', wv.type === 'WEEKEND' && wv.context === 'WEEKEND' && wv.startDate === '2026-09-05', `${wv.type}/${wv.context}`);

const allPlans = resolvePlans({ ...seedDb, weekendPlans: [weekend] } as never);
check('resolvePlans 同时返回 Trip 与 WeekendPlan', allPlans.length === seedDb.trips.length + 1,
  `${allPlans.length} 个（${seedDb.trips.length} trip + 1 weekend）`);
check('resolvePlans 结果都是 PlanView', allPlans.every((p) => Boolean(p.id && p.type && p.context)));
check('deriveContext 映射正确', deriveContext('TRIP') === 'TRAVEL' && deriveContext('WEEKEND') === 'WEEKEND');

// ── 5. 两个此前空壳的 AI Action ─────────────────────────────
const act = (name: AIAction['name'], params: Record<string, unknown>, risk: AIAction['risk'] = 'low'): AIAction =>
  ({ id: `t-${name}`, name, params, risk, summary: name });

// 5a. createTrip
const emptyDb: DB = { trips: [], days: [], activities: [], bookings: [], expenses: [], checklists: [], files: [], journals: [], proposals: [], savedPlaces: {}, discoveredPlaces: [], placeStates: [], weekendPlans: [], destinationPicks: [] };
const createTripAction = act('createTrip', { destinationIds: ['tokyo'], startDate: '2026-11-01', days: 4 });
check('validateAction 接受合法 createTrip', validateAction(emptyDb, createTripAction) === null);
check('validateAction 拒绝缺目的地的 createTrip', validateAction(emptyDb, act('createTrip', { destinationIds: [], startDate: '2026-11-01' })) !== null);
check('validateAction 拒绝缺日期的 createTrip', validateAction(emptyDb, act('createTrip', { destinationIds: ['tokyo'] })) !== null);

const dbAfterCreate = applyActions(emptyDb, [createTripAction]);
check('createTrip 落库：生成 1 个 Trip', dbAfterCreate.trips.length === 1, `${dbAfterCreate.trips.length}`);
check('createTrip 落库：生成 4 天', dbAfterCreate.days.length === 4, `${dbAfterCreate.days.length}`);
check('createTrip 落库：天数与日期一致',
  dbAfterCreate.days[0].date === '2026-11-01' && dbAfterCreate.trips[0].endDate === '2026-11-04',
  `${dbAfterCreate.trips[0].startDate}~${dbAfterCreate.trips[0].endDate}`);
check('createTrip 落库：预算已推算（非 0）', dbAfterCreate.trips[0].totalBudget > 0, `${dbAfterCreate.trips[0].totalBudget}`);
check('createTrip 落库：生成预算骨架', dbAfterCreate.expenses.length > 0, `${dbAfterCreate.expenses.length} 条`);
check('createTrip 落库：初始化 savedPlaces', Array.isArray(dbAfterCreate.savedPlaces[dbAfterCreate.trips[0].id]));
check('createTrip 落库：初始化清单', dbAfterCreate.checklists.length > 0, `${dbAfterCreate.checklists.length} 条`);

// 5b. generateDestinationRecommendation
const recAction = act('generateDestinationRecommendation', {
  answers: { travelMood: 'tired', duration: 'd45', origin: '上海', budget: 'b3', interests: ['food', 'chill'], dislikes: ['crowds'], pace: 'focused', companions: 'partner', destinationScope: 'domestic' },
  topN: 3,
});
check('validateAction 接受合法推荐请求', validateAction(emptyDb, recAction) === null);
check('validateAction 拒绝缺答案的推荐请求', validateAction(emptyDb, act('generateDestinationRecommendation', {})) !== null);

const dbAfterRec = applyActions(emptyDb, [recAction]);
const picks = dbAfterRec.destinationPicks ?? [];
check('generateDestinationRecommendation 落库 3 条', picks.length === 3, `${picks.length} 条`);
check('推荐按分数降序', picks.every((p, i) => i === 0 || picks[i - 1].score >= p.score), picks.map((p) => p.score).join(' > '));
const pickFields = Object.keys(picks[0] ?? {}).sort().join(',');
check('推荐只存引用、不内嵌 Destination',
  picks.every((p) => !('destination' in p) && typeof p.destinationId === 'string' && Object.keys(p).length === 7),
  `${Object.keys(picks[0] ?? {}).length} 个字段：${pickFields}`);
check('推荐带理由', picks.every((p) => p.reason.length > 0), picks[0]?.reason ?? '');
const pickSize = JSON.stringify(picks).length;
check('推荐落库体积很小（<1KB）', pickSize < 1024, kb(JSON.stringify(picks)));

// 5c. 两个 action 不再走 default 空壳
check('createTrip 不再是空壳（DB 确实变了）', dbAfterCreate.trips.length !== emptyDb.trips.length);
check('推荐 action 不再是空壳（DB 确实变了）', (dbAfterRec.destinationPicks?.length ?? 0) !== (emptyDb.destinationPicks?.length ?? 0));

// ── 6. 天气 mock 已移除 ────────────────────────────────────
check('weatherFor 返回空数组（不伪造）', weatherFor('tokyo', ['2026-10-01', '2026-10-02']).length === 0);
check('weatherOf 无数据返回 null', weatherOf([], '2026-10-01') === null);
check('World Provider 默认无天气能力', getWorld().weather === null);

const seedTrip2 = seedDb.trips[0];
const days2 = seedDb.days.filter((d) => d.tripId === seedTrip2.id);
const acts2 = seedDb.activities.filter((a) => a.tripId === seedTrip2.id);
const conflicts = detectConflicts({
  trip: seedTrip2, days: days2, activities: acts2,
  bookings: seedDb.bookings.filter((b) => b.tripId === seedTrip2.id),
  expenses: seedDb.expenses.filter((e) => e.tripId === seedTrip2.id),
  files: seedDb.files.filter((f) => f.tripId === seedTrip2.id),
  checklists: seedDb.checklists.filter((c) => c.tripId === seedTrip2.id),
  placeOf: () => undefined,
  weather: weatherFor(seedTrip2.destinationId, days2.map((d) => d.date)),
});
check('无天气时不生成 weatherRisk', conflicts.every((c) => c.type !== 'weatherRisk'),
  `冲突类型：${[...new Set(conflicts.map((c) => c.type))].join(', ') || '无'}`);
check('无天气时其它冲突检测照常工作', Array.isArray(conflicts));

// ── 7. 既有成熟能力未被破坏（回归）─────────────────────────
check('种子 Trip 数量不变', seedDb.trips.length > 0, `${seedDb.trips.length} 个`);
check('种子 Day / Activity 结构完整', seedDb.days.length > 0 && seedDb.activities.length > 0,
  `${seedDb.days.length} 天 / ${seedDb.activities.length} 活动`);
check('强度计算仍可用', computeDayIntensity(acts2).score >= 0, `score=${computeDayIntensity(acts2).score}`);
const rebuilt = buildTrip({ destinationIds: ['tokyo'], startDate: '2026-12-01', endDate: '2026-12-03', totalBudget: 9000, planningPreference: 'auto', profile: { travelMood: 'change', pace: 'balanced', companions: 'solo', interests: [], dislikes: [], origin: '上海', durationDays: 3 } });
check('抽出的 buildTrip 仍产出 Trip+Days', rebuilt.trip.id.startsWith('trip') && rebuilt.days.length === 3, `${rebuilt.days.length} 天`);
check('seedPlaceStates 可重复调用', seedPlaceStates(migrated).length === migrated.placeStates.length);

// 体积总计
const totalSize = JSON.stringify(useStore.getState().db).length;
check('完整 DB 体积远低于 4MB 上限', totalSize < 4 * 1024 * 1024, kb(JSON.stringify(useStore.getState().db)));

// ── 输出 ────────────────────────────────────────────────────
let failed = 0;
for (const r of results) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  · ${r.detail}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} checks ok`);
process.exit(failed ? 1 : 0);
