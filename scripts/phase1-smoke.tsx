/**
 * Phase 1 —— 统一计划层读写 Action 测试
 *
 * 覆盖 Phase 1 第 1 步追加的三个 store action：
 *   setPlaceState / createWeekendPlan / updateWeekendPlan
 *
 * 原则：这些 action 只做「写」，读逻辑复用 services/placeState.ts 与 services/plan.ts 的纯函数。
 */
import { useStore } from '@/services/store';
import { statusOf, placeStatesOf } from '@/services/placeState';
import { resolvePlans, getPlanView } from '@/services/plan';

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = '') => results.push({ name, ok, detail });

const store = () => useStore.getState();

// ── 1. setPlaceState ────────────────────────────────────────
const trip = store().db.trips[0];
const tripId = trip.id;
const placeId = 'phase1-test-place';

store().setPlaceState({ containerType: 'TRIP', containerId: tripId, placeId, status: 'WANTED' });
check('setPlaceState 写入新状态', statusOf(store().db, 'TRIP', tripId, placeId) === 'WANTED',
  String(statusOf(store().db, 'TRIP', tripId, placeId)));

// 正向流转
store().setPlaceState({ containerType: 'TRIP', containerId: tripId, placeId, status: 'CANDIDATE' });
store().setPlaceState({ containerType: 'TRIP', containerId: tripId, placeId, status: 'PLANNED' });
store().setPlaceState({ containerType: 'TRIP', containerId: tripId, placeId, status: 'VISITED' });
check('正向流转到 VISITED', statusOf(store().db, 'TRIP', tripId, placeId) === 'VISITED',
  String(statusOf(store().db, 'TRIP', tripId, placeId)));

// 反向流转（「今天不想去了」）
store().setPlaceState({ containerType: 'TRIP', containerId: tripId, placeId, status: 'CANDIDATE' });
check('反向流转 VISITED→CANDIDATE 允许', statusOf(store().db, 'TRIP', tripId, placeId) === 'CANDIDATE',
  String(statusOf(store().db, 'TRIP', tripId, placeId)));

// 不产生重复记录
const count = placeStatesOf(store().db, 'TRIP', tripId).filter((s) => s.placeId === placeId).length;
check('反复 setPlaceState 不产生重复记录', count === 1, `${count} 条`);

// WEEKEND 容器
const wkndId = store().createWeekendPlan({ weekendOf: '2026-09-12' });
store().setPlaceState({ containerType: 'WEEKEND', containerId: wkndId, placeId: 'p-wk', status: 'WANTED' });
check('WEEKEND 容器也能写状态', statusOf(store().db, 'WEEKEND', wkndId, 'p-wk') === 'WANTED',
  String(statusOf(store().db, 'WEEKEND', wkndId, 'p-wk')));
check('TRIP 与 WEEKEND 状态互不干扰',
  statusOf(store().db, 'TRIP', tripId, 'p-wk') === undefined);

// ── 2. createWeekendPlan ────────────────────────────────────
const id1 = store().createWeekendPlan({ weekendOf: '2026-09-19' });
const plan1 = store().db.weekendPlans.find((w) => w.id === id1);
check('createWeekendPlan 返回 id 且落库', Boolean(plan1), plan1?.id ?? '未找到');
check('weekendOf 正确', plan1?.weekendOf === '2026-09-19', String(plan1?.weekendOf));
check('endDate 默认 weekendOf + 1 天', plan1?.endDate === '2026-09-20', String(plan1?.endDate));
check('homeCity 取 settings 默认值', plan1?.homeCity === store().settings.homeCity, String(plan1?.homeCity));
check('初始 status 为 exploring', plan1?.status === 'exploring', String(plan1?.status));
check('初始 placeIds / activityIds 为空', plan1?.placeIds.length === 0 && plan1?.activityIds.length === 0);

// 幂等
const id2 = store().createWeekendPlan({ weekendOf: '2026-09-19' });
check('同一周末重复创建是幂等的', id2 === id1, `${id1} / ${id2}`);
const weekendCount = store().db.weekendPlans.filter((w) => w.weekendOf === '2026-09-19').length;
check('同一周末只有一条计划', weekendCount === 1, `${weekendCount} 条`);

// 自定义字段
const id3 = store().createWeekendPlan({ weekendOf: '2026-09-26', homeCity: '杭州', title: '杭州周末' });
const plan3 = store().db.weekendPlans.find((w) => w.id === id3);
check('可指定 homeCity 与 title', plan3?.homeCity === '杭州' && plan3?.title === '杭州周末',
  `${plan3?.title}@${plan3?.homeCity}`);

// ── 3. updateWeekendPlan ────────────────────────────────────
store().updateWeekendPlan(id1, { status: 'planned', placeIds: ['p-a', 'p-b'] });
const updated = store().db.weekendPlans.find((w) => w.id === id1);
check('updateWeekendPlan 改 status', updated?.status === 'planned', String(updated?.status));
check('updateWeekendPlan 改 placeIds', updated?.placeIds.join(',') === 'p-a,p-b', updated?.placeIds.join(','));
check('updateWeekendPlan 刷新 updatedAt', Boolean(updated?.updatedAt));

store().updateWeekendPlan(id1, { note: '想轻松一点' });
check('updateWeekendPlan 是 patch 语义（不清空其它字段）',
  store().db.weekendPlans.find((w) => w.id === id1)?.placeIds.length === 2);

// ── 4. 与 PlanView 层的联动 ─────────────────────────────────
const plans = resolvePlans(store().db);
const weekendPlans = plans.filter((p) => p.type === 'WEEKEND');
check('resolvePlans 能读到 WeekendPlan', weekendPlans.length >= 3, `${weekendPlans.length} 个周末计划`);
check('WeekendPlan 的 context 是 WEEKEND', weekendPlans.every((p) => p.context === 'WEEKEND'));

const view = getPlanView(store().db, id3);
check('getPlanView 能按 id 命中 WeekendPlan', view?.type === 'WEEKEND' && view?.location === '杭州',
  `${view?.type}/${view?.location}`);
check('getPlanView 仍能命中 Trip', getPlanView(store().db, tripId)?.type === 'TRIP');

// ── 5. 既有数据未被破坏 ─────────────────────────────────────
check('既有 trips 未被影响', store().db.trips.length >= 3, `${store().db.trips.length} 个`);
check('既有 activities 未被影响', store().db.activities.length > 0, `${store().db.activities.length} 项`);
check('Phase 0 播种的 placeStates 仍在', store().db.placeStates.length > 0, `${store().db.placeStates.length} 条`);

// ── 输出 ────────────────────────────────────────────────────
let failed = 0;
for (const r of results) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  · ${r.detail}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} checks ok`);
process.exit(failed ? 1 : 0);
