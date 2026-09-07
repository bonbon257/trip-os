// ─────────────────────────────────────────────────────────────
// Trip OS — Travel Lifecycle（集中派生层）
//
// 设计原则（与产品 IA 一致）：
//   · 状态判断「派生为主、字段为辅」——所有 lifecycle 状态都基于现有
//     Trip / 行程 / 预订 / 清单 / 冲突 等数据实时派生，不新增冗余持久字段。
//   · 唯一例外（尚未引入）：若后续发现「行程已确认(PLANNED)」仅靠现有数据
//     无法稳定判断，再评估加最小字段 Trip.planConfirmedAt。当前阶段纯派生。
//   · 本文件是生命周期判断的唯一真相来源，页面组件禁止自行推断状态，
//     只调用 deriveTripLifecycle / deriveRouteLifecycle。
// ─────────────────────────────────────────────────────────────

import type { Activity, Booking, Checklist, Conflict, Day, Trip } from '@/types';
import type { Preparation } from '@/services/intelligence';
import { diffDays, todayISO } from '@/utils/date';

export type LifecycleStatus =
  | 'NO_TRIP'
  | 'EXPLORING'
  | 'COMPARING'
  | 'DESTINATION_SELECTED'
  | 'PLANNING'
  | 'PLANNED'
  | 'PREPARING'
  | 'TRAVELING'
  | 'COMPLETED';

export interface LifecycleProgress {
  label: string;
  value: number;
  total?: number;
  /** 0–1 */
  ratio: number;
}

export interface LifecycleInfo {
  status: LifecycleStatus;
  /** 短状态标签，如「规划中」「准备中」 */
  label: string;
  /** 当前状态一句话文案 */
  currentState: string;
  /** 下一步该做什么 */
  nextAction: string;
  /** 单一主操作（权重最高） */
  primaryCta: { label: string; to: string };
  /** 次要操作 */
  secondary: { label: string; to: string }[];
  /** 进度（可选） */
  progress?: LifecycleProgress;
}

/** 短状态标签，供各处徽章复用 */
export const STATUS_LABEL: Record<LifecycleStatus, string> = {
  NO_TRIP: '还没有旅行',
  EXPLORING: '探索中',
  COMPARING: '比较中',
  DESTINATION_SELECTED: '目的地已定',
  PLANNING: '规划中',
  PLANNED: '行程已定',
  PREPARING: '准备中',
  TRAVELING: '旅行中',
  COMPLETED: '已完成',
};

/** 前置态（无 Trip）的静态文案，由路由派生 */
const PRE_TRIP_COPY: Partial<
  Record<LifecycleStatus, { currentState: string; nextAction: string; primaryCta: { label: string; to: string } }>
> = {
  EXPLORING: {
    currentState: '正在寻找目的地',
    nextAction: '选一个感兴趣的目的地',
    primaryCta: { label: '看推荐', to: '/destinations' },
  },
  COMPARING: {
    currentState: '正在比较目的地',
    nextAction: '确定这次去哪',
    primaryCta: { label: '去对比', to: '/compare' },
  },
  DESTINATION_SELECTED: {
    currentState: '目的地已经确定',
    nextAction: '开始规划行程',
    primaryCta: { label: '开始规划', to: '/trips/new' },
  },
};

export interface LifecycleInput {
  trip: Trip;
  days: Day[];
  activities: Activity[];
  bookings: Booking[];
  checklists: Checklist[];
  conflicts: Conflict[];
  /** 准备度（PREPARING 进度用，可选） */
  preparation?: Preparation;
  /** 当前日期，默认今天；便于测试注入 */
  today?: string;
}

const PREPARE_WINDOW_DAYS = 30;

/**
 * 由现有数据派生一次旅行的生命周期状态与下一步动作。
 * 纯函数、可测试、可扩展——新增状态只需在此处加分支。
 */
export function deriveTripLifecycle(input: LifecycleInput): LifecycleInfo {
  const { trip, days, activities, bookings, checklists, conflicts } = input;
  const today = input.today ?? todayISO();
  const id = trip.id;

  // 1) 硬状态：直接来自 Trip.status（已有持久字段，复用）
  if (trip.status === 'traveling') {
    const todayDay = days.find((d) => d.date === today);
    return {
      status: 'TRAVELING',
      label: STATUS_LABEL.TRAVELING,
      currentState: `${trip.destinationName} · Day ${todayDay ? todayDay.index : '?'}`,
      nextAction: '前往下一站',
      primaryCta: { label: '打开今天', to: `/trips/${id}/today` },
      secondary: [
        { label: '看地图', to: `/trips/${id}/map` },
        { label: '看行程', to: `/trips/${id}/itinerary` },
        { label: '问 AI', to: `/trips/${id}/assistant` },
      ],
    };
  }
  if (trip.status === 'completed') {
    return {
      status: 'COMPLETED',
      label: STATUS_LABEL.COMPLETED,
      currentState: '旅行已经结束',
      nextAction: '整理成 Journey',
      primaryCta: { label: '整理 Journey', to: `/trips/${id}/journey` },
      secondary: [{ label: '看回忆', to: `/trips/${id}/journey` }],
    };
  }

  // 2) planning 分支：基于行程 / 预订 / 清单 / 冲突派生
  const filledDays = days.filter((d) => activities.some((a) => a.dayId === d.id)).length;
  const hasActivities = activities.length > 0;
  const errorConflicts = conflicts.filter((c) => c.level === 'error').length;
  const confirmedBookings = bookings.filter((b) => b.status === 'confirmed').length;
  const checklistItems = checklists.flatMap((c) => c.items);
  const checklistStarted = checklistItems.length > 0;

  // DESTINATION_SELECTED：刚选完去哪，但还没排任何活动
  if (!hasActivities) {
    return {
      status: 'DESTINATION_SELECTED',
      label: STATUS_LABEL.DESTINATION_SELECTED,
      currentState: `${trip.destinationName} 已确定，还没开始排行程`,
      nextAction: '开始规划行程',
      primaryCta: { label: '开始规划', to: `/trips/${id}/itinerary` },
      secondary: [
        { label: 'AI 规划', to: `/trips/${id}/plan` },
        { label: '看怎么玩', to: `/destinations/${trip.destinationId}` },
      ],
      progress: { label: '行程', value: 0, total: days.length, ratio: 0 },
    };
  }

  // PLANNED（纯派生）：每天都有活动 + 无 error 级冲突 + (有确认预订 或 清单已起步)
  const allDaysFilled = days.length > 0 && filledDays === days.length;
  const plannedByDerived = allDaysFilled && errorConflicts === 0 && (confirmedBookings > 0 || checklistStarted);

  // PREPARING：已定稿且距出发 ≤ 30 天（仍非 traveling）
  const daysToStart = diffDays(today, trip.startDate);
  if (plannedByDerived && daysToStart <= PREPARE_WINDOW_DAYS) {
    const prep = input.preparation;
    return {
      status: 'PREPARING',
      label: STATUS_LABEL.PREPARING,
      currentState: `距离出发还有 ${Math.max(daysToStart, 0)} 天`,
      nextAction: '完成剩余准备事项',
      primaryCta: { label: '查看出发准备', to: `/trips/${id}/checklist` },
      secondary: [
        { label: '预订', to: `/trips/${id}/bookings` },
        { label: '文件', to: `/trips/${id}/files` },
        { label: 'AI 提醒', to: `/trips/${id}/assistant` },
      ],
      progress: prep ? { label: '准备度', value: prep.score, ratio: prep.score / 100 } : undefined,
    };
  }

  if (plannedByDerived) {
    return {
      status: 'PLANNED',
      label: STATUS_LABEL.PLANNED,
      currentState: '行程已经完成，准备出发',
      nextAction: '完成出发准备',
      primaryCta: { label: '去准备', to: `/trips/${id}/checklist` },
      secondary: [
        { label: '看行程', to: `/trips/${id}/itinerary` },
        { label: '看预算', to: `/trips/${id}/budget` },
        { label: '预订', to: `/trips/${id}/bookings` },
      ],
      progress: { label: '行程', value: days.length, total: days.length, ratio: 1 },
    };
  }

  // PLANNING（默认）
  return {
    status: 'PLANNING',
    label: STATUS_LABEL.PLANNING,
    currentState: `正在规划 ${trip.destinationName} ${days.length} 日行程`,
    nextAction: '继续规划行程',
    primaryCta: { label: '继续规划', to: `/trips/${id}/itinerary` },
    secondary: [
      { label: '看地图', to: `/trips/${id}/map` },
      { label: '看预算', to: `/trips/${id}/budget` },
      { label: 'AI 规划', to: `/trips/${id}/plan` },
    ],
    progress: {
      label: '行程',
      value: filledDays,
      total: days.length,
      ratio: days.length ? filledDays / days.length : 0,
    },
  };
}

/**
 * 前置态（无 Trip）由当前路由派生，不持久化。
 * 用于探索 / 对比 / 详情页顶部状态横幅。
 */
export function deriveRouteLifecycle(pathname: string): LifecycleStatus | null {
  if (pathname.startsWith('/compare')) return 'COMPARING';
  if (pathname.startsWith('/destinations/')) return 'DESTINATION_SELECTED';
  if (
    pathname.startsWith('/quiz') ||
    pathname.startsWith('/random') ||
    pathname === '/destinations' ||
    pathname.startsWith('/destinations?')
  ) {
    return 'EXPLORING';
  }
  return null;
}

/** 取前置态的静态文案（无 Trip 时使用） */
export function preTripCopy(status: LifecycleStatus) {
  return PRE_TRIP_COPY[status];
}
