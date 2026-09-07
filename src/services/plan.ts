// ─────────────────────────────────────────────────────────────
// PlanView —— 统一计划视图（Read-time normalization / Adapter）
//
// 目标：让系统可以用同一种方式理解 Trip 和 WeekendPlan，
//       而不是到处 `db.trips.find(...)` 直接依赖 Trip。
//
// 铁律：
//   · 这是【只读视图】，不回写、不做 Trip → Plan 的数据迁移。
//   · 不改 Trip 的任何字段或语义；Trip 仍是旅行场景的写时实体。
//   · WeekendPlan 原生实现 PlanView；Trip 通过 adapter 转成 PlanView。
//
// Context 只用于告诉 Decision Engine「用户在什么场景下做决定」，
// 三者共用同一套 Place / Activity / Decision / World Intelligence。
// ─────────────────────────────────────────────────────────────

import type { DB } from '@/services/store';
import type { ContextType, ID, PlanType, PlanView, Trip, WeekendPlan } from '@/types';

/**
 * 计划类型 → 决策场景。
 * NOW 目前没有产生者（来自 Phase 2+ 的 Now / 即时场景），
 * 但类型上已保留，避免未来加场景时改动所有签名。
 */
export function deriveContext(type: PlanType): ContextType {
  return type === 'WEEKEND' ? 'WEEKEND' : 'TRAVEL';
}

/** Trip → PlanView（adapter）。只读，不改 Trip */
export function tripToPlanView(trip: Trip): PlanView {
  return {
    id: trip.id,
    type: 'TRIP',
    title: trip.title,
    context: deriveContext('TRIP'),
    status: trip.status,
    startDate: trip.startDate,
    endDate: trip.endDate,
    location: trip.destinationName,
    metadata: {
      destinationId: trip.destinationId,
      destinationIds: trip.destinationIds ?? [trip.destinationId],
      planningPreference: trip.planningPreference,
      totalBudget: trip.totalBudget,
      memberCount: trip.members.length,
    },
  };
}

/** WeekendPlan → PlanView（原生实现） */
export function weekendToPlanView(w: WeekendPlan): PlanView {
  return {
    id: w.id,
    type: 'WEEKEND',
    title: w.title,
    context: deriveContext('WEEKEND'),
    status: w.status,
    startDate: w.weekendOf,
    endDate: w.endDate,
    location: w.homeCity,
    metadata: {
      placeIds: w.placeIds,
      activityIds: w.activityIds,
      note: w.note,
    },
  };
}

/**
 * 统一读取全部计划：Trip（经 adapter）+ WeekendPlan。
 * 按 startDate 升序（无日期的排最后）。排列策略交给调用方按需过滤。
 */
export function resolvePlans(db: DB): PlanView[] {
  const trips = (db.trips ?? []).map(tripToPlanView);
  const weekends = (db.weekendPlans ?? []).map(weekendToPlanView);
  const rank = (p: PlanView) => p.startDate ?? '9999-12-31';
  return [...trips, ...weekends].sort((a, b) => rank(a).localeCompare(rank(b)));
}

/** 按场景过滤计划 */
export const plansByContext = (db: DB, context: ContextType): PlanView[] =>
  resolvePlans(db).filter((p) => p.context === context);

/** 取单个计划视图（Trip 或 WeekendPlan 都能命中） */
export function getPlanView(db: DB, id: ID): PlanView | null {
  const trip = db.trips?.find((t) => t.id === id);
  if (trip) return tripToPlanView(trip);
  const weekend = db.weekendPlans?.find((w) => w.id === id);
  if (weekend) return weekendToPlanView(weekend);
  return null;
}
