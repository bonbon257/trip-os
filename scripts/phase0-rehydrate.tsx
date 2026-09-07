/**
 * Phase 0 —— 真实升级路径测试
 *
 * 模拟 localStorage 里已经存在一份 v1 数据，然后再加载 store。
 * 这验证的是老用户下次打开页面时的【实际行为】全链路：
 *
 *   persist rehydrate
 *     → 发现 version(1) !== options.version(2)
 *     → migrate() 播种 placeStates
 *     → merge() 字段级合并
 *     → setItem() 回写为 v2
 *
 * 与 phase0-smoke 的区别：那边直接调 migrateState/mergeState 函数，
 * 这里走的是 zustand 真正的装配流程，能验证「migrate 确实被触发」。
 */

// ⚠️ 必须在 import store 之前写入 localStorage
const v1Db = {
  trips: [
    {
      id: 'trip-old', title: '老用户的旅行', destinationId: 'tokyo', destinationIds: ['tokyo'],
      destinationName: '东京', emoji: '🗼', startDate: '2026-10-01', endDate: '2026-10-03',
      status: 'planning', planningPreference: 'auto', totalBudget: 12000,
      members: [], createdAt: '', updatedAt: '',
      profile: {
        travelMood: 'change', pace: 'balanced', companions: 'solo',
        interests: [], dislikes: [], origin: '上海', durationDays: 3,
      },
    },
  ],
  days: [
    { id: 'trip-old-d1', tripId: 'trip-old', date: '2026-10-01', index: 1, title: '抵达' },
    { id: 'trip-old-d2', tripId: 'trip-old', date: '2026-10-02', index: 2, title: '第 2 天' },
  ],
  activities: [
    { id: 'a1', tripId: 'trip-old', dayId: 'trip-old-d1', placeId: 'tokyo-1', title: '去过的地方', startTime: '09:00', endTime: '11:00', type: 'sight', estimatedCost: 0, transportMode: 'walk', transportMin: 0, status: 'done', order: 0 },
    { id: 'a2', tripId: 'trip-old', dayId: 'trip-old-d2', placeId: 'tokyo-2', title: '已排期', startTime: '09:00', endTime: '11:00', type: 'sight', estimatedCost: 0, transportMode: 'walk', transportMin: 0, status: 'planned', order: 0 },
  ],
  bookings: [], expenses: [], checklists: [], files: [], journals: [], proposals: [],
  discoveredPlaces: [],
  savedPlaces: { 'trip-old': ['tokyo-1', 'tokyo-2', 'tokyo-3'] },
  // 注意：没有 placeStates / weekendPlans / destinationPicks —— 这就是 v1 的样子
};

globalThis.localStorage.setItem(
  'trip-os:v1',
  JSON.stringify({
    state: {
      db: v1Db,
      activeTripId: 'trip-old',
      quiz: { step: 0, answers: {}, result: null, recs: [], pickedId: null, updatedAt: '' },
      settings: {
        name: '老用户', homeCity: '北京', confirmHighRisk: true,
        showIntensityHints: true, useLLM: false, aiAssist: false,
      },
    },
    version: 1,
  }),
);

const { useStore, STATE_VERSION } = await import('@/services/store');
// persist 回写 setItem 走微任务，等一拍再校验落盘结果
await new Promise((r) => setTimeout(r, 0));

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = '') => results.push({ name, ok, detail });

const s = useStore.getState();
const db = s.db;
const st = (p: string) => db.placeStates.find((x) => x.placeId === p)?.status;

// ── 老数据必须原样保留 ──────────────────────────────────────
check('保留老 Trip（数量与内容）', db.trips.length === 1 && db.trips[0].id === 'trip-old', db.trips[0]?.title);
check('保留 activeTripId', s.activeTripId === 'trip-old', String(s.activeTripId));
check('保留用户设置', s.settings.homeCity === '北京' && s.settings.name === '老用户', `${s.settings.name}@${s.settings.homeCity}`);
check('保留 days', db.days.length === 2, `${db.days.length} 天`);
check('保留 activities', db.activities.length === 2, `${db.activities.length} 项`);
check('保留 savedPlaces', (db.savedPlaces['trip-old'] ?? []).length === 3);

// ── 新集合必须自动补齐 ──────────────────────────────────────
check('自动补齐 placeStates', db.placeStates.length === 3, `${db.placeStates.length} 条`);
check('自动补齐 weekendPlans', Array.isArray(db.weekendPlans) && db.weekendPlans.length === 0);
check('自动补齐 destinationPicks', Array.isArray(db.destinationPicks) && db.destinationPicks.length === 0);

// ── PlaceState 语义正确 ─────────────────────────────────────
check('done 的地点 → VISITED', st('tokyo-1') === 'VISITED', String(st('tokyo-1')));
check('已排期的地点 → PLANNED', st('tokyo-2') === 'PLANNED', String(st('tokyo-2')));
check('仅收藏的地点 → WANTED', st('tokyo-3') === 'WANTED', String(st('tokyo-3')));

// ── 不能被种子数据污染 ──────────────────────────────────────
check('没有混入种子 Trip', db.trips.every((t) => t.id === 'trip-old'), `${db.trips.length} 个 trip`);
check('没有混入种子 Activity', db.activities.every((a) => a.tripId === 'trip-old'), `${db.activities.length} 项`);

// ── 已回写为最新版本号 ───────────────────────────────────────
let written = null;
try {
  written = JSON.parse(globalThis.localStorage.getItem('trip-os:v1') ?? 'null');
} catch {
  written = null;
}
check('已回写 localStorage', written !== null);
check(
  `回写版本号为 v${STATE_VERSION}`,
  written?.version === STATE_VERSION,
  `version=${written?.version}`,
);
check('回写内容含 placeStates', Array.isArray(written?.state?.db?.placeStates), `${written?.state?.db?.placeStates?.length} 条`);

// 注：重复加载 / 幂等性由 phase0-smoke 的「迁移幂等」一项覆盖，
// 这里不重复 import（esbuild 对带 query 的动态 import 解析不稳定）。

// ── 输出 ────────────────────────────────────────────────────
let failed = 0;
for (const r of results) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  · ${r.detail}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} checks ok`);
process.exit(failed ? 1 : 0);
