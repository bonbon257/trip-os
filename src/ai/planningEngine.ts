/**
 * 统一旅行规划引擎（Planning Engine）
 * ────────────────────────────────────────────────────────────
 * 这是「AI 规划」唯一的规则生成来源，AI Planner（AIPlanPage）与 AI Assistant
 * （AIPanel / AssistantPage，经 orchestrator）都从这里拿方案骨架。
 *
 * 设计约束（来自产品规则）：
 *   1. 候选池只由真实数据构成 —— 精编 CURATED ∪ 用户/搜索发现的 discovered ∪
 *      攻略里引用的真实地点。AI 只从候选池里「选」，绝不「编」。
 *   2. 禁止 type:'free'（自由活动 / 自由时间）作为缺数据的兜底占位。
 *      池不足时方案就少排，UI 提示「暂无更多真实地点」，不伪造活动。
 *   3. 真实 POI 获取能力（高德）由 poiSource.ensureCandidatePool 在规划前注入
 *      discovered 池，所以哈尔滨这类没有手工 CURATED 的目的地也能规划。
 *
 * 注意：本文件是纯逻辑（无 react / DOM 依赖），前端与服务端脚本都可复用。
 */
import type { Day, Intensity, Place, Trip } from '@/types';
import type { ActivitySpec } from '@/ai/actions';
import type { DB } from '@/services/store';
import { getDestination } from '@/data/destinations';
import { getPlacesForTrip, resolveCityIds } from '@/data/places';
import { getGuide } from '@/data/guides';
import { transportEstimate } from '@/services/recommendation';
import { addMinutes } from '@/utils/date';

export interface DayPlan {
  dayId: string;
  title: string;
  intensity: Intensity;
  specs: ActivitySpec[];
}

const SLOTS_BY_PACE: Record<Trip['profile']['pace'], number> = {
  intense: 6,
  balanced: 4,
  focused: 2.5,
  free: 1.5,
};

/** 给地点按「你的偏好」打分：兴趣命中为主，负向偏好降权 */
export function rankPlaces(places: Place[], trip: Trip): Place[] {
  const interests = new Set(trip.profile.interests);
  const dislikes = new Set(trip.profile.dislikes);
  return [...places].sort((a, b) => score(b) - score(a));

  function score(p: Place) {
    let s = 0;
    p.tags.forEach((t) => {
      if (interests.has(t)) s += 3;
    });
    s += (p.rating ?? 4) - 4;
    if (dislikes.has('crowds') && p.tags.includes('niche')) s += 1.2;
    if (dislikes.has('highCost')) s -= p.avgCost / 400;
    if (dislikes.has('walking') && p.durationMin >= 180) s -= 0.6;
    if (dislikes.has('checkin') && p.category === 'sight') s -= 0.4;
    if (dislikes.has('rush') && p.durationMin >= 240) s -= 0.5;
    return s;
  }
}

/** 主要景区（fullDay 显式标记，或停留 ≥5h）独占一天 */
const isFullDay = (p: Place) => p.fullDay ?? p.durationMin >= 300;

/**
 * 统一的真实候选池：精编 ∪ 已发现 ∪ 攻略引用的真实地点。
 * 攻略里若引用了「候选池里不存在」的地点（数据没对齐），该 stop 直接跳过，
 * 绝不临时生成一个假地点补齐。
 */
export function getCandidatePool(db: DB, trip: { destinationIds?: string[]; destinationId: string }): Place[] {
  const cityIds = resolveCityIds(trip);
  const curated = getPlacesForTrip(trip);
  const discovered = (db.travelDiscoveredPlaces ?? []).filter((p) => cityIds.includes(p.destinationId));

  // 攻略引用的真实地点 id（只用于「确认这些 id 已在池中」，不引入池外数据）
  const guideIds = new Set<string>();
  cityIds.forEach((id) => {
    const g = getGuide(id);
    g?.playbooks.forEach((pb) => pb.days.forEach((d) => d.stops.forEach((s) => s.placeId && guideIds.add(s.placeId))));
  });

  const byId = new Map<string, Place>();
  [...curated, ...discovered].forEach((p) => {
    if (!byId.has(p.id)) byId.set(p.id, p);
  });
  // 攻略引用的地点若已在 curated/discovered 中，已纳入；不在则忽略（不编造）。
  void guideIds;

  return [...byId.values()];
}

/**
 * 生成旅行方案骨架：Structured Data + 规则引擎（LLM 只负责解释与微调）。
 * 首日抵达 / 末日回程自动减负，整天型地点独占一天。
 *
 * 无真实地点可排时：方案里就只有抵达/回程/用餐这类必要项，不插入任何
 * 「自由时间 / 自由活动」占位 —— 有没有得玩由真实候选池决定，不由规则编造。
 */
export function generatePlan(trip: Trip, days: Day[], places: Place[]): DayPlan[] {
  if (!days.length) return [];
  const ranked = rankPlaces(places, trip);
  const pool = [...ranked];
  const dislikes = new Set(trip.profile.dislikes);
  const startHour = dislikes.has('earlyRise') ? '10:00' : '09:30';

  let perDay = SLOTS_BY_PACE[trip.profile.pace] ?? 4;
  if (dislikes.has('rush')) perDay -= 1;
  if (dislikes.has('walking')) perDay -= 0.5;
  if (dislikes.has('planning')) perDay -= 0.5;
  perDay = Math.max(1.5, perDay);

  const plans: DayPlan[] = [];
  const n = days.length;

  days.forEach((day, i) => {
    const isFirst = i === 0;
    const isLast = i === n - 1;
    let quota = Math.round(isFirst || isLast ? Math.min(perDay, 2.5) : perDay);
    if (n <= 2) quota = Math.max(quota, 2);

    const specs: ActivitySpec[] = [];
    let cursor = startHour;

    // 城市切换：跨城交通（多城市行程）。createTrip 已在原始天插入，这里在 AI 重建时重算
    const prevDay = days[i - 1];
    if (
      !isFirst &&
      prevDay &&
      day.destinationId &&
      prevDay.destinationId &&
      day.destinationId !== prevDay.destinationId
    ) {
      const fromCity = getDestination(prevDay.destinationId);
      const toCity = getDestination(day.destinationId);
      if (fromCity && toCity) {
        const est = transportEstimate(fromCity.name, toCity);
        specs.push({
          title: `${fromCity.name} → ${toCity.name}`,
          startTime: cursor,
          durationMin: Math.round(est.hours * 60),
          type: 'transport',
          estimatedCost: est.cost,
          fromName: fromCity.name,
          toName: toCity.name,
        });
        cursor = addMinutes(cursor, Math.round(est.hours * 60));
      }
    }

    if (isFirst) {
      specs.push({
        title: `抵达${trip.destinationName} · 入住酒店`,
        startTime: cursor,
        durationMin: 90,
        type: 'stay',
        note: `从${trip.profile.origin}抵达，办理入住`,
        fromName: trip.profile.origin,
        toName: trip.destinationName,
      });
      cursor = addMinutes(cursor, 90);
    }

    // 整天型地点优先占用中间的日子
    if (!isFirst && !isLast && pool.length) {
      const fullIdx = pool.findIndex(isFullDay);
      if (fullIdx >= 0) {
        const place = pool.splice(fullIdx, 1)[0];
        specs.push({
          title: place.name,
          placeId: place.id,
          startTime: dislikes.has('earlyRise') ? '09:30' : '09:00',
          durationMin: place.durationMin,
          type: place.category,
          pinned: true,
          note: place.requiredBooking ? '需要提前预约' : '建议单独安排一整天',
        });
        plans.push({
          dayId: day.id,
          title: `${place.name} 一日`,
          intensity: 'high',
          specs,
        });
        return;
      }
    }

    const picked: Place[] = [];
    let guard = 0;
    const limit = pool.length + 2;
    while (picked.length < Math.max(1, Math.round(quota)) && pool.length && guard++ < limit) {
      const place = pool.shift()!;
      // 整天型地点留给后面的整天，这里先绕开（guard 防止全部为整天型时死循环）
      if (isFullDay(place) && !isLast) {
        pool.push(place);
        continue;
      }
      picked.push(place);
    }

    picked.forEach((place, idx) => {
      // 每天中午安排一顿饭
      if (idx > 0 && toMin(cursor) >= 12 * 60 && toMin(cursor) <= 14 * 60) {
        specs.push({ title: '午餐', startTime: cursor, durationMin: 75, type: 'food', estimatedCost: Math.round(place.avgCost * 0.6) || 120 });
        cursor = addMinutes(cursor, 75);
      }
      specs.push({
        title: place.name,
        placeId: place.id,
        startTime: cursor,
        durationMin: place.durationMin,
        type: place.category,
        note: place.requiredBooking ? '需要提前预约' : undefined,
      });
      cursor = addMinutes(cursor, place.durationMin + 20);
    });

    // 注意：不再插入 type:'free'（自由时间 / 自由活动）占位。
    // 若真实候选池不足，这一天就是「抵达 + 少量真实地点 + 回程」，
    // 有没有自由留白由用户自己决定，规划引擎不替它编一个活动。

    if (isLast) {
      specs.push({
        title: `${trip.destinationName} → ${trip.profile.origin}`,
        startTime: cursor,
        durationMin: 90,
        type: 'transport',
        note: '前往机场 / 车站，准备返程',
        fromName: trip.destinationName,
        toName: trip.profile.origin,
      });
    } else {
      specs.push({ title: '晚餐', startTime: clampEvening(cursor), durationMin: 90, type: 'food', estimatedCost: 180 });
    }

    const mainCount = picked.length;
    const intensity: Intensity =
      mainCount >= 5 ? 'high' : mainCount >= 3 ? 'medium' : 'low';

    plans.push({
      dayId: day.id,
      title: dayTitle(picked, isFirst, isLast),
      intensity,
      specs,
    });
  });

  return plans;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const clampEvening = (cursor: string) => {
  const m = toMin(cursor);
  if (m < 17 * 60 + 30) return '18:00';
  if (m > 20 * 60) return '20:00';
  return cursor;
};

function dayTitle(picked: Place[], isFirst: boolean, isLast: boolean) {
  if (isLast && !picked.length) return '回程';
  const names = picked.slice(0, 2).map((p) => p.name.replace(/（.*?）|\(.*?\)/g, ''));
  if (isFirst) return `抵达 + ${names[0] ?? '周边'}`;
  if (isLast) return `${names[0] ?? '周边'} + 回程`;
  return names.join(' + ') || '周边探索';
}
