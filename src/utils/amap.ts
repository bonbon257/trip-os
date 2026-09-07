// ─────────────────────────────────────────────────────────────
// 高德地图 URI 工具
// 用于「去这里 / 选路线 / 打车」等场景，跳转到高德 App 或网页做
// 导航与打车。坐标优先（lng,lat,name），缺坐标时退化为纯名称。
// ─────────────────────────────────────────────────────────────
import type { Place } from '@/types';

export interface RouteEndpoint {
  name: string;
  lng?: number;
  lat?: number;
}

/** 从 Place 构造起终点（坐标缺省时退回纯名称） */
export function placeToEndpoint(p: Place): RouteEndpoint {
  return { name: p.name, lng: p.lng, lat: p.lat };
}

function enc(s: string) {
  return encodeURIComponent(s);
}

/**
 * 高德导航 / 打车 URI。
 * - from 仅在有真实坐标时才有意义，否则省略（高德用当前定位作起点）
 * - to 必填，有坐标用「lng,lat,name」，否则用「name」回退
 * - mode=car 打开驾车路线，高德 App 内可直接切换到「打车」
 */
export function amapNavUrl(
  from?: RouteEndpoint | null,
  to?: RouteEndpoint | null,
  mode: 'car' | 'bus' | 'walk' | 'bike' = 'car',
): string {
  const params: string[] = [];

  if (from && from.name && from.lng != null && from.lat != null) {
    params.push(`from=${from.lng},${from.lat},${enc(from.name)}`);
  }
  if (to && to.name) {
    const toPart =
      to.lng != null && to.lat != null
        ? `${to.lng},${to.lat},${enc(to.name)}`
        : enc(to.name);
    params.push(`to=${toPart}`);
  }
  params.push(`mode=${mode}&coordinate=gaode&callnative=1`);
  return `https://uri.amap.com/navigation?${params.join('&')}`;
}
