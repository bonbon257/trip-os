import type { Place, TransportMode } from '@/types';

/** Mock 地图画布 0–100 对应的城市实际尺度：1 单位 ≈ 0.3 km（无真实坐标时的兜底） */
const KM_PER_UNIT = 0.3;

/**
 * 真实经纬度球面距离（km）。两地都有 lat/lng 时可用，否则返回 null。
 *
 * 注意这是「直线距离」而非真实路径长度：
 *   真实驾车 / 公交时长需要异步的 RouteProvider（高德 /api/map/route），
 *   而 estimateTransit 在 buildActivity / reflowDay / planGenerator 里都是同步调用，
 *   改成异步会牵动整条排期链路。因此 Phase 1 先接直线距离（比画布估算准确得多），
 *   真实路径时长留到 Phase 2 的 RouteProvider 接入。
 */
export function geoKmBetween(
  a: { lat?: number; lng?: number },
  b: { lat?: number; lng?: number },
): number | null {
  const la1 = a.lat;
  const ln1 = a.lng;
  const la2 = b.lat;
  const ln2 = b.lng;
  if (
    typeof la1 !== 'number' ||
    typeof ln1 !== 'number' ||
    typeof la2 !== 'number' ||
    typeof ln2 !== 'number'
  ) {
    return null;
  }
  const R = 6371;
  const dLat = ((la2 - la1) * Math.PI) / 180;
  const dLng = ((ln2 - ln1) * Math.PI) / 180;
  const rad1 = (la1 * Math.PI) / 180;
  const rad2 = (la2 * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad1) * Math.cos(rad2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const canvasDistance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** 两地距离（km）：优先真实经纬度，缺坐标时回退 mock 画布 */
export const kmBetween = (
  a: { x: number; y: number; lat?: number; lng?: number },
  b: { x: number; y: number; lat?: number; lng?: number },
) => geoKmBetween(a, b) ?? canvasDistance(a, b) * KM_PER_UNIT;

export interface TransitEstimate {
  mode: TransportMode;
  minutes: number;
  km: number;
}

/** 依据两地距离估算交通方式与耗时（真实地图接入后由 Map Service 覆盖实现） */
export function estimateTransit(from?: Place | null, to?: Place | null): TransitEstimate {
  if (!from || !to) return { mode: 'walk', minutes: 0, km: 0 };
  const km = kmBetween(from, to);
  if (km <= 1) {
    return { mode: 'walk', minutes: Math.max(5, Math.round((km / 4.5) * 60)), km };
  }
  if (km <= 9) {
    return { mode: 'transit', minutes: Math.round((km / 18) * 60) + 8, km };
  }
  return { mode: 'taxi', minutes: Math.round((km / 24) * 60) + 5, km };
}

/** 最近邻 + 2-opt 简化的路线排序建议：不改动原数组，返回新顺序与节省的分钟数 */
export function optimizeOrder(places: Place[]): { order: Place[]; savedMinutes: number } {
  if (places.length <= 3) return { order: places, savedMinutes: 0 };
  const transitOf = (list: Place[]) =>
    list.reduce((sum, p, i) => (i === 0 ? 0 : sum + estimateTransit(list[i - 1], p).minutes), 0);

  const before = transitOf(places);
  const remaining = [...places.slice(1)];
  const route: Place[] = [places[0]];
  while (remaining.length) {
    const last = route[route.length - 1];
    let bestIdx = 0;
    let best = Infinity;
    remaining.forEach((p, i) => {
      const d = canvasDistance(last, p);
      if (d < best) {
        best = d;
        bestIdx = i;
      }
    });
    route.push(remaining.splice(bestIdx, 1)[0]);
  }
  const after = transitOf(route);
  return { order: route, savedMinutes: Math.max(0, before - after) };
}
