import { useStore } from '@/services/store';
import { upcomingSaturday } from '@/utils/date';
import { spotToPlace, type WeekendSpot } from './weekendPoi';

export interface AddResult {
  planId: string;
  weekendOf: string;
}

/**
 * 把周末地点加入「这周末」计划。
 * 所有周末场景（转盘/搜索/小红书/自定义）统一走这个入口，避免各页面重复实现。
 * 同一周末计划幂等（createWeekendPlan 按 weekendOf 去重），重复加同一地点不重复。
 */
export function addToWeekendPlan(spot: WeekendSpot, cityKey: string): AddResult {
  const { createWeekendPlan, updateWeekendPlan, setPlaceState, addDiscoveredPlace, db } =
    useStore.getState();
  const weekendOf = upcomingSaturday();
  const planId = createWeekendPlan({ weekendOf });

  const place = spotToPlace(spot, cityKey);
  addDiscoveredPlace(place, 'WEEKEND');

  const current = db.weekendPlans.find((x) => x.id === planId);
  const placeIds = current?.placeIds.includes(place.id)
    ? current.placeIds
    : [...(current?.placeIds ?? []), place.id];
  updateWeekendPlan(planId, { placeIds, status: 'planned' });
  setPlaceState({ containerType: 'WEEKEND', containerId: planId, placeId: place.id, status: 'WANTED' });

  return { planId, weekendOf };
}
