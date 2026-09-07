import type {
  Activity,
  Booking,
  Checklist,
  Conflict,
  Day,
  DayIntensity,
  Expense,
  FileAsset,
  Intensity,
  Place,
  Trip,
} from '@/types';
import type { WeatherDay } from '@/types/decision';
import { addMinutes, diffDays, durationText, toMinutes, todayISO } from '@/utils/date';
import { kmBetween } from './route';
import { money } from '@/utils/format';

// ── 每日强度 ────────────────────────────────────────────────
export function computeDayIntensity(
  acts: Activity[],
  _placeOf?: (id?: string) => Place | undefined,
): DayIntensity {
  const activeMinutes = acts.reduce(
    (s, a) => s + Math.max(0, toMinutes(a.endTime) - toMinutes(a.startTime)),
    0,
  );
  const transitMinutes = acts.reduce((s, a) => s + (a.transportMin ?? 0), 0);
  const count = acts.filter((a) => a.type !== 'transport').length;
  const raw = count * 9 + (activeMinutes / 60) * 5.5 + (transitMinutes / 60) * 4.5;
  const score = Math.round(Math.min(100, raw));
  const level: Intensity = score < 35 ? 'low' : score < 65 ? 'medium' : 'high';
  return { dayId: acts[0]?.dayId ?? '', score, level, activityCount: count, activeMinutes, transitMinutes };
}

export const intensityOf = (day: Day, acts: Activity[], placeOf: (id?: string) => Place | undefined): Intensity =>
  day.intensityOverride ?? computeDayIntensity(acts, placeOf).level;

/**
 * 取某一天的天气。没有数据返回 null。
 *
 * Phase 0 已删除此处的模拟天气生成器——它曾用 destinationId.length 播种
 * 伪造晴雨与降雨概率，属于「用假数据冒充实时信息」。
 * 原则：没有真实天气数据 → null，不伪造。
 *
 * 消费方必须优雅降级：
 *   · 无天气 → 不生成 weatherRisk 冲突（见 detectConflicts）
 *   · 无天气 → UI 显示「暂无预报」（TodayPage 已处理）
 *   · 其余排期 / 预算 / 强度 / 冲突检测逻辑完全不受影响
 *
 * 真实天气接入后由 `services/world` 的 WeatherProvider 提供数据。
 */
export const weatherOf = (days: WeatherDay[], date: string): WeatherDay | null =>
  days.find((d) => d.date === date) ?? null;

// ── 冲突 / 风险检测（Travel Intelligence）────────────────────
interface IntelligenceInput {
  trip: Trip;
  days: Day[];
  activities: Activity[];
  bookings: Booking[];
  expenses: Expense[];
  files: FileAsset[];
  checklists: Checklist[];
  placeOf: (id?: string) => Place | undefined;
  weather: WeatherDay[];
}

export function detectConflicts(input: IntelligenceInput): Conflict[] {
  const { trip, days, activities, bookings, expenses, placeOf, weather } = input;
  const out: Conflict[] = [];
  const push = (c: Omit<Conflict, 'id' | 'tripId'>) =>
    out.push({ id: `${c.type}-${c.dayId ?? 'trip'}-${out.length}`, tripId: trip.id, ...c });

  // 预算
  const forecastTotal = expenses.reduce((s, e) => s + e.amount, 0);
  if (forecastTotal > trip.totalBudget) {
    push({
      type: 'budgetOverrun',
      level: 'error',
      message: `预计超预算 ${money(forecastTotal - trip.totalBudget)}（预计支出 ${money(forecastTotal)} / 预算 ${money(trip.totalBudget)}）`,
      suggestion: '让 AI 帮你找出可削减与可替代的项目',
      suggestedIntent: '预算超了',
    });
  }

  const sorted = [...days].sort((a, b) => a.index - b.index);
  const levels: Record<string, Intensity> = {};

  sorted.forEach((day) => {
    const acts = activities
      .filter((a) => a.dayId === day.id && a.status !== 'skipped')
      .sort((a, b) => a.order - b.order);
    if (!acts.length) return;
    levels[day.id] = day.intensityOverride ?? computeDayIntensity(acts, placeOf).level;

    acts.forEach((a, i) => {
      const prev = acts[i - 1];
      // 时间冲突：上一站结束 + 交通 > 本活动开始
      if (prev) {
        const earliest = addMinutes(prev.endTime, a.transportMin ?? 0);
        if (toMinutes(a.startTime) < toMinutes(earliest)) {
          push({
            type: 'timeOverlap',
            dayId: day.id,
            level: 'error',
            message: `「${a.title}」${a.startTime} 开始，但上一站最早 ${earliest} 才能结束（含 ${a.transportMin} min 交通）`,
            suggestion: `把「${a.title}」推迟到 ${earliest} 之后`,
            suggestedIntent: '帮我优化今天的顺序',
          });
        }
      }
      // 交通过久
      if ((a.transportMin ?? 0) >= 60) {
        push({
          type: 'longTransit',
          dayId: day.id,
          level: 'warn',
          message: `前往「${a.title}」需要 ${durationText(a.transportMin ?? 0)}，路上时间偏长`,
          suggestion: '考虑把这一天拆成两个区域分别游玩',
          suggestedIntent: '帮我优化今天的顺序',
        });
      }
      // 距离过远
      const prevPlace = prev ? placeOf(prev.placeId) : undefined;
      const place = placeOf(a.placeId);
      if (prevPlace && place) {
        const km = kmBetween(prevPlace, place);
        if (km >= 8) {
          push({
            type: 'farDistance',
            dayId: day.id,
            level: 'warn',
            message: `「${prevPlace.name}」与「${place.name}」相距约 ${km.toFixed(1)} km，相邻安排偏分散`,
            suggestion: '把同区域的地点排在一起',
            suggestedIntent: '帮我优化今天的顺序',
          });
        }
      }
      // 营业时间
      if (place?.open && place.close && place.open !== '00:00') {
        if (toMinutes(a.startTime) < toMinutes(place.open)) {
          push({
            type: 'openHours',
            dayId: day.id,
            level: 'warn',
            message: `「${place.name}」${place.open} 才开门，${a.startTime} 到不了`,
            suggestion: `调整到 ${place.open} 之后`,
            suggestedIntent: '我不想早起',
          });
        } else if (toMinutes(a.endTime) > toMinutes(place.close)) {
          push({
            type: 'openHours',
            dayId: day.id,
            level: 'warn',
            message: `「${place.name}」${place.close} 关门，行程结束时间 ${a.endTime} 晚于营业时间`,
            suggestion: '把这项提前，或缩短停留',
          });
        }
      }
      // 预约时间
      const booking = bookings.find(
        (b) => b.placeId && b.placeId === a.placeId && b.startTime?.startsWith(day.date),
      );
      if (booking?.startTime) {
        const bt = booking.startTime.slice(11, 16);
        if (bt !== a.startTime) {
          push({
            type: 'bookingClash',
            dayId: day.id,
            level: 'warn',
            message: `「${a.title}」预约时间是 ${bt}，行程里写的是 ${a.startTime}`,
            suggestion: `把行程时间对齐到 ${bt}`,
          });
        }
      }
    });

    // 行程过密
    const count = acts.filter((a) => a.type !== 'transport').length;
    const transit = acts.reduce((s, a) => s + (a.transportMin ?? 0), 0);
    if (count >= 5) {
      push({
        type: 'denseDay',
        dayId: day.id,
        level: transit >= 90 ? 'warn' : 'info',
        message: `Day ${day.index} 有 ${count} 个地点，预计移动 ${durationText(transit)}，行程偏满`,
        suggestion: '减少一个地点，或把其中一个挪到别的日子',
        suggestedIntent: '太累了',
      });
    }

    // 天气风险（无天气数据则整段跳过 —— 不猜测、不伪造）
    const w = weatherOf(weather, day.date);
    if (w && w.rain >= 60) {
      const outdoor = acts.filter((a) => {
        const p = placeOf(a.placeId);
        return p && !p.indoor;
      });
      if (outdoor.length) {
        push({
          type: 'weatherRisk',
          dayId: day.id,
          level: 'warn',
          message: `Day ${day.index} 降雨概率 ${w.rain}%，有 ${outdoor.length} 个户外安排`,
          suggestion: '把户外活动换成室内备选',
          suggestedIntent: '今天下雨',
        });
      }
    }
  });

  // 连续高强度
  sorted.forEach((day, i) => {
    const prev = sorted[i - 1];
    if (!prev) return;
    if (levels[day.id] === 'high' && levels[prev.id] === 'high') {
      push({
        type: 'consecutiveHigh',
        dayId: day.id,
        level: 'info',
        message: `Day ${prev.index} 与 Day ${day.index} 连续高强度`,
        suggestion: `建议 Day ${day.index} 保留更多自由时间`,
        suggestedIntent: '太累了',
      });
    }
  });

  return out;
}

// ── 准备度 ──────────────────────────────────────────────────
export interface Preparation {
  score: number;
  done: string[];
  todo: string[];
}

export function preparationOf(
  trip: Trip,
  days: Day[],
  activities: Activity[],
  bookings: Booking[],
  checklists: Checklist[],
  files: FileAsset[],
): Preparation {
  const done: string[] = [];
  const todo: string[] = [];
  let score = 0;

  const hasBooking = (type: Booking['type'], status: Booking['status'] = 'confirmed') =>
    bookings.some((b) => b.tripId === trip.id && b.type === type && b.status === status);

  if (hasBooking('flight') || hasBooking('train')) {
    score += 22;
    done.push('往返交通已确认');
  } else {
    todo.push('确定往返大交通');
  }

  if (hasBooking('hotel')) {
    score += 18;
    done.push('住宿已确认');
  } else {
    todo.push('预订住宿');
  }

  const pendingBookings = bookings.filter((b) => b.tripId === trip.id && b.status === 'pending');
  if (!pendingBookings.length) {
    score += 12;
    done.push('没有待确认的预订');
  } else {
    todo.push(`${pendingBookings.length} 项预订待确认`);
  }

  const items = checklists.flatMap((c) => c.items);
  if (items.length) {
    const ratio = items.filter((i) => i.done).length / items.length;
    score += Math.round(ratio * 24);
    const left = items.filter((i) => !i.done).length;
    if (left) todo.push(`清单还剩 ${left} 项`);
    else done.push('准备清单已完成');
  } else {
    todo.push('生成准备清单');
  }

  const filled = days.filter((d) => activities.filter((a) => a.dayId === d.id).length >= 2).length;
  const fillRatio = days.length ? filled / days.length : 0;
  score += Math.round(fillRatio * 16);
  if (fillRatio < 1) todo.push(`还有 ${days.length - filled} 天没排行程`);
  else done.push('每日行程已排好');

  if (files.some((f) => f.tripId === trip.id)) {
    score += 8;
    done.push('重要文件已归档');
  } else {
    todo.push('上传机票 / 酒店凭证');
  }

  return { score: Math.min(100, score), done, todo };
}

// ── 当前进度（旅行中）───────────────────────────────────────
export interface NowContext {
  today: Day | undefined;
  current: Activity | undefined;
  next: Activity | undefined;
  minutesToNext: number;
  freeSlots: { start: string; end: string; minutes: number }[];
  isTravelingToday: boolean;
}

const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

export function nowContext(days: Day[], activities: Activity[], date = todayISO()): NowContext {
  const today = days.find((d) => d.date === date);
  if (!today) return { today: undefined, current: undefined, next: undefined, minutesToNext: 0, freeSlots: [], isTravelingToday: false };
  const acts = activities
    .filter((a) => a.dayId === today.id && a.status !== 'skipped')
    .sort((a, b) => a.order - b.order);
  const t = nowMinutes();
  const current = acts.find((a) => toMinutes(a.startTime) <= t && t < toMinutes(a.endTime));
  const next = acts.find((a) => toMinutes(a.startTime) > t);
  const minutesToNext = next ? toMinutes(next.startTime) - t : 0;

  const freeSlots: NowContext['freeSlots'] = [];
  let cursor = t;
  acts.forEach((a) => {
    const s = toMinutes(a.startTime);
    if (s - cursor >= 45) freeSlots.push({ start: `${Math.floor(cursor / 60)}:${`${cursor % 60}`.padStart(2, '0')}`, end: a.startTime, minutes: s - cursor });
    cursor = Math.max(cursor, toMinutes(a.endTime));
  });

  return { today, current, next, minutesToNext, freeSlots, isTravelingToday: acts.length > 0 };
}

export const countdownText = (trip: Trip, today = todayISO()) => {
  const d = diffDays(today, trip.startDate);
  if (trip.status === 'completed') return '已结束';
  if (d > 0) return `${d} 天后出发`;
  if (d === 0) return '今天出发';
  const left = diffDays(today, trip.endDate);
  return trip.status === 'traveling' ? `旅行中 · 还剩 ${Math.max(left, 0)} 天` : '进行中';
};
