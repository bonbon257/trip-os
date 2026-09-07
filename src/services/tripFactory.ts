// ─────────────────────────────────────────────────────────────
// Trip 构建（纯函数）
//
// Phase 0 从 store.ts 原样抽出，供两处复用：
//   · store.createTrip（用户走表单创建）
//   · ai/actions 的 createTrip Action（自然语言创建旅行）
//
// 这是【纯搬移】，逻辑与抽离前逐行一致，不引入行为变化。
// 抽出来的原因：避免 Action 层复制一份建 Trip 逻辑，两边以后各自漂移。
// ─────────────────────────────────────────────────────────────

import type {
  Activity,
  Day,
  Expense,
  ExpenseCategory,
  ExpenseStatus,
  PlanningPreference,
  Trip,
  TripMember,
  TripProfile,
} from '@/types';
import { getDestination } from '@/data/destinations';
import { transportEstimate } from './recommendation';
import { addMinutes, dateRange, diffDays } from '@/utils/date';
import { uid } from '@/utils/id';

export interface NewTripInput {
  destinationIds: string[];
  startDate: string;
  endDate: string;
  totalBudget: number;
  planningPreference: PlanningPreference;
  profile: TripProfile;
  members?: TripMember[];
  title?: string;
}

/**
 * 多城市天数分摊：按各城市 idealDays 比例把总天数分到每个城市（每城至少 1 天）。
 * 返回与天数等长的城市 id 数组，顺序即走法顺序。
 */
export function distributeCities(cityIds: string[], totalDays: number): string[] {
  const n = cityIds.length;
  if (n === 0) return [];
  if (n === 1 || totalDays <= 0) return Array(Math.max(0, totalDays)).fill(cityIds[0]);
  const weights = cityIds.map((id) => {
    const d = getDestination(id);
    return d ? Math.max(1, (d.idealDays.min + d.idealDays.max) / 2) : 3;
  });
  const sumW = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (w / sumW) * totalDays);
  const floor = raw.map((r) => Math.max(1, Math.floor(r)));
  let remainder = totalDays - floor.reduce((a, b) => a + b, 0);
  // 天数不够（< 城市数）：从天数最多的城市依次收回，直到凑够
  while (remainder < 0) {
    let mi = 0;
    for (let i = 1; i < n; i++) if (floor[i] > floor[mi]) mi = i;
    if (floor[mi] <= 1) break;
    floor[mi] -= 1;
    remainder += 1;
  }
  // 天数富余：按小数部分从大到小补
  const fracIdx = raw
    .map((r, i) => ({ i, f: r - Math.floor(r) }))
    .sort((a, b) => b.f - a.f);
  let k = 0;
  while (remainder > 0) {
    floor[fracIdx[k % n].i] += 1;
    remainder -= 1;
    k += 1;
  }
  const result: string[] = [];
  for (let i = 0; i < n; i++) for (let d = 0; d < floor[i]; d++) result.push(cityIds[i]);
  return result;
}

/** 依据目的地结构化数据生成初始预算骨架（可解释、可编辑，不是写死数字） */
export function seedExpenses(trip: Trip): Expense[] {
  const dest = getDestination(trip.destinationId);
  if (!dest) return [];
  const nights = Math.max(1, diffDays(trip.startDate, trip.endDate));
  const days = nights + 1;
  const mid = (dest.dailyCost.low + dest.dailyCost.high) / 2;
  const rows: [string, ExpenseCategory, number][] = [
    ['往返大交通', 'transport', Math.round(dest.dailyCost.low * 2.2)],
    ['住宿', 'stay', Math.round(mid * 0.42 * nights)],
    ['餐饮', 'food', Math.round(mid * 0.33 * days)],
    ['门票与娱乐', 'ticket', Math.round(mid * 0.18 * days)],
  ];
  return rows.map(([title, category, amount]) => ({
    id: uid('ex'),
    tripId: trip.id,
    title,
    category,
    amount,
    status: 'planned' as ExpenseStatus,
  }));
}

export interface BuiltTrip {
  trip: Trip;
  days: Day[];
  /** 多城市切换日自动插入的跨城交通 */
  transitActs: Activity[];
  expenses: Expense[];
}

/**
 * 由输入构建一次旅行的全部初始数据。纯函数，不碰 store、不产生副作用。
 * 调用方负责把结果并入 DB（store 用 set，Action 用返回新 DB）。
 */
export function buildTrip(input: NewTripInput): BuiltTrip {
  const cityIds = input.destinationIds.length ? input.destinationIds : [input.destinationIds[0] ?? ''];
  const dests = cityIds
    .map((id) => getDestination(id))
    .filter(Boolean) as NonNullable<ReturnType<typeof getDestination>>[];
  const primary = cityIds[0] ?? '';
  const dest = getDestination(primary);
  const tripId = uid('trip');
  const dateList = dateRange(input.startDate, input.endDate);
  const cityDist = distributeCities(cityIds, dateList.length);

  const days: Day[] = dateList.map((date, i) => ({
    id: `${tripId}-d${i + 1}`,
    tripId,
    date,
    index: i + 1,
    destinationId: cityDist[i],
    title: i === 0 ? '抵达' : i === dateList.length - 1 ? '回程' : `第 ${i + 1} 天`,
  }));

  const trip: Trip = {
    id: tripId,
    title:
      input.title ??
      (cityIds.length > 1
        ? `${dests.map((d) => d.name).join(' · ')} ${new Date(input.startDate).getFullYear()}`
        : `${dest?.name ?? '旅行'} ${new Date(input.startDate).getFullYear()}`),
    destinationId: primary,
    destinationIds: cityIds,
    destinationName: cityIds.length > 1 ? dests.map((d) => d.name).join(' · ') : dest?.name ?? '未命名',
    emoji: dest?.emoji ?? '🧳',
    startDate: input.startDate,
    endDate: input.endDate,
    status: 'planning',
    planningPreference: input.planningPreference,
    totalBudget: input.totalBudget,
    members:
      input.members ?? [{ id: 'u-me', name: '我', avatar: '🦊', role: 'owner' } as TripMember],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profile: input.profile,
  };

  // 城市切换日：自动插入一段跨城交通（用 TransportService 估算方式 / 时长）
  const transitActs: Activity[] = [];
  days.forEach((d, i) => {
    if (i === 0 || !cityDist[i] || cityDist[i] === cityDist[i - 1]) return;
    const fromCity = getDestination(cityDist[i - 1]);
    const toCity = getDestination(cityDist[i]);
    if (!fromCity || !toCity) return;
    const est = transportEstimate(fromCity.name, toCity);
    transitActs.push({
      id: uid('act'),
      tripId,
      dayId: d.id,
      title: `${fromCity.name} → ${toCity.name}`,
      startTime: '09:00',
      endTime: addMinutes('09:00', Math.round(est.hours * 60)),
      type: 'transport',
      estimatedCost: est.cost,
      transportMode: est.mode,
      transportMin: Math.round(est.hours * 60),
      fromName: fromCity.name,
      toName: toCity.name,
      status: 'planned',
      order: 0,
    });
  });

  return { trip, days, transitActs, expenses: seedExpenses(trip) };
}
