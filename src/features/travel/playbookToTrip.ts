import { useStore } from '@/services/store';
import { getPlace } from '@/data/places';
import { getGuide } from '@/data/guides';
import { getDestination } from '@/data/destinations';
import { addDays, todayISO } from '@/utils/date';
import type { Playbook } from '@/types';

export interface ApplyPlaybookResult {
  tripId: string;
  /** 是否本次新创建了 Trip（否则是加入已有 Trip） */
  created: boolean;
  dayCount: number;
  activityCount: number;
  /** 因缺少真实 POI 而被跳过的 stop 数（绝不编造补齐） */
  skipped: number;
}

/**
 * 把攻略里的某个玩法（Playbook）映射成一次真实旅行计划。
 *
 * 复用既有 Trip / Day / Activity 实体，不新建第二套计划结构：
 *  - 目的地已有 Trip → 直接加入该 Trip（按玩法天数追加 Day + Activity）；
 *  - 没有 → 走 store.createTrip 建一个（复用 buildTrip 的建 Trip 逻辑）。
 *  - 每个 PlaybookDay → 一个 Trip Day；每个 PlaybookStop → 一次 createActivity。
 *
 * 真实数据原则：stop.placeId 必须能在 CURATED / 真实地点池解析，否则跳过该站，
 * 绝不临时编造 POI 补齐页面。返回 skipped 计数供 UI 提示。
 */
export function applyPlaybookToTrip(destinationId: string, playbookId: string): ApplyPlaybookResult {
  const guide = getGuide(destinationId);
  const playbook: Playbook | undefined = guide?.playbooks.find((p) => p.id === playbookId);
  if (!playbook) throw new Error(`guide/playbook not found: ${destinationId}/${playbookId}`);

  // 始终从实时 store 读，避免拿到 createTrip 之前的旧快照
  const existing = useStore.getState().db.trips.find((t) => t.destinationId === destinationId);

  let tripId: string;
  let created = false;
  if (existing) {
    tripId = existing.id;
  } else {
    const dest = getDestination(destinationId);
    const startDate = addDays(todayISO(), 14);
    const endDate = addDays(startDate, Math.max(0, playbook.durationDays - 1));
    const trip = useStore.getState().createTrip({
      destinationIds: [destinationId],
      startDate,
      endDate,
      totalBudget: dest ? Math.round((dest.dailyCost.low + dest.dailyCost.high) * playbook.durationDays) : 0,
      planningPreference: 'auto',
      profile: {
        travelMood: 'change',
        pace: 'balanced',
        companions: 'solo',
        interests: dest?.tags.slice(0, 4) ?? [],
        dislikes: [],
        origin: '当地',
        durationDays: playbook.durationDays,
      },
    });
    tripId = trip.id;
    created = true;
  }

  // 确保 Trip 有足够的 Day（玩法几天就至少几天）
  const need = playbook.durationDays;
  let dayIds = useStore
    .getState()
    .db.days.filter((d) => d.tripId === tripId)
    .sort((a, b) => a.index - b.index)
    .map((d) => d.id);
  while (dayIds.length < need) {
    useStore.getState().addDay(tripId);
    dayIds = useStore
      .getState()
      .db.days.filter((d) => d.tripId === tripId)
      .sort((a, b) => a.index - b.index)
      .map((d) => d.id);
  }

  // 把玩法每天标题写到对应 Trip Day（覆盖 buildTrip 默认的「抵达 / 回程」）
  playbook.days.forEach((pbDay, di) => {
    const dayId = dayIds[di];
    if (dayId) useStore.getState().updateDay(dayId, { title: pbDay.title });
  });

  // 把每个 PlaybookDay 的 stops 映射成 Activity
  let activityCount = 0;
  let skipped = 0;
  playbook.days.forEach((pbDay, di) => {
    const dayId = dayIds[di];
    if (!dayId) return;
    pbDay.stops.forEach((stop) => {
      const place = getPlace(destinationId, stop.placeId);
      if (!place) {
        // 真实 POI 缺失：跳过，不编造
        skipped += 1;
        return;
      }
      useStore.getState().createActivity({
        dayId,
        placeId: place.id,
        title: place.name,
        startTime: stop.time,
        type: place.category,
        estimatedCost: place.avgCost,
        transportMode: stop.transportFromPrevious?.mode ?? 'walk',
        transportMin: stop.transportFromPrevious?.min ?? 0,
        note: stop.transportFromPrevious
          ? `从上一站${transportLabel(stop.transportFromPrevious.mode)}约 ${stop.transportFromPrevious.min} 分钟`
          : undefined,
      });
      activityCount += 1;
    });
  });

  return { tripId, created, dayCount: need, activityCount, skipped };
}

function transportLabel(mode: string): string {
  switch (mode) {
    case 'taxi':
      return '打车';
    case 'train':
      return '地铁/火车';
    case 'transit':
      return '公共交通';
    case 'walk':
      return '步行';
    case 'car':
      return '自驾';
    case 'flight':
      return '飞机';
    default:
      return '前往';
  }
}

/** 目的地是否已有攻略（供 UI 决定是否展示攻略区块） */
export function hasGuide(destinationId: string): boolean {
  return Boolean(getGuide(destinationId));
}
