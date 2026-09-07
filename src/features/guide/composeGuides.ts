import { useStore } from '@/services/store';
import { getPlace } from '@/data/places';
import { getDestination } from '@/data/destinations';
import { addDays, todayISO } from '@/utils/date';
import type { GuideContent, ID, PlaybookDay } from '@/types';
import { resolveGuideContent } from './guidePool';

export interface ComposeResult {
  tripId: ID;
  created: boolean;
  dayCount: number;
  activityCount: number;
  skipped: number;
  destinationIds: ID[];
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

/** 把一个玩法（PlaybookDay[]）追加进指定 Trip：补 Day + Activity，不新建第二套结构 */
function appendPlaybook(
  tripId: ID,
  destId: ID,
  days: PlaybookDay[],
  titlePrefix: string,
): { days: number; activities: number; skipped: number } {
  let dayIds = useStore
    .getState()
    .db.days.filter((d) => d.tripId === tripId)
    .sort((a, b) => a.index - b.index)
    .map((d) => d.id);

  let activityCount = 0;
  let skipped = 0;

  days.forEach((pbDay, di) => {
    let dayId = dayIds[di];
    if (!dayId) {
      useStore.getState().addDay(tripId);
      dayIds = useStore
        .getState()
        .db.days.filter((d) => d.tripId === tripId)
        .sort((a, b) => a.index - b.index)
        .map((d) => d.id);
      dayId = dayIds[di];
    }
    if (!dayId) return;
    useStore.getState().updateDay(dayId, { title: `${titlePrefix}·${pbDay.title}` });

    pbDay.stops.forEach((stop) => {
      const place = getPlace(destId, stop.placeId);
      if (!place) {
        skipped += 1; // 真实 POI 缺失：跳过，绝不编造
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

  return { days: days.length, activities: activityCount, skipped };
}

/**
 * 组合多条攻略 → 一次真实旅行计划（Guide Context → AI Core 之前的「人肉组合」）。
 *
 * 多条 Guide Content 的可执行部分（PlaybookDay[]）依次追加进同一个 Trip：
 *  - 目的地：取所有攻略涉及的 destinationIds 并集；
 *  - 没有可执行玩法的攻略（纯主题卡）只提供目的地灵感，不生成 Activity；
 *  - 严格复用既有 Trip / Day / Activity，缺真实 POI 的 stop 跳过并计入 skipped。
 */
export function composeGuides(guideIds: ID[]): ComposeResult {
  const guides = guideIds
    .map((id) => resolveGuideContent(id))
    .filter((g): g is GuideContent => Boolean(g));

  const destinationIds = Array.from(new Set(guides.flatMap((g) => g.destinationIds)));
  const execs = guides
    .map((g) => ({
      g,
      destId: g.playbookRef?.destinationId ?? g.destinationIds[0],
      days: g.days,
    }))
    .filter((e) => e.days && e.days.length > 0 && e.destId);

  const totalDays = execs.reduce((n, e) => n + e.days!.length, 0) || destinationIds.length || 1;
  const startDate = addDays(todayISO(), 14);
  const endDate = addDays(startDate, Math.max(0, totalDays - 1));

  const firstDest = getDestination(destinationIds[0]);
  const trip = useStore.getState().createTrip({
    destinationIds,
    startDate,
    endDate,
    totalBudget: firstDest
      ? Math.round((firstDest.dailyCost.low + firstDest.dailyCost.high) * totalDays)
      : 0,
    planningPreference: 'auto',
    profile: {
      travelMood: 'change',
      pace: 'balanced',
      companions: 'solo',
      interests: firstDest?.tags.slice(0, 4) ?? [],
      dislikes: [],
      origin: '当地',
      durationDays: totalDays,
    },
  });
  const tripId = trip.id;

  let dayCount = 0;
  let activityCount = 0;
  let skipped = 0;
  execs.forEach((e) => {
    const r = appendPlaybook(tripId, e.destId as ID, e.days!, e.g.title);
    dayCount += r.days;
    activityCount += r.activities;
    skipped += r.skipped;
  });

  return {
    tripId,
    created: true,
    dayCount,
    activityCount,
    skipped,
    destinationIds,
  };
}
