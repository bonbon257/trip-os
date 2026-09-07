// ─────────────────────────────────────────────────────────────
// World Intelligence — Provider 接口层
//
// Phase 0 只定义接口 + Null 实现，不接具体供应商。
// 目的：把「未来能接」变成架构事实，而不是现在硬编码假数据。
//
// 铁律：没有 Provider → 返回 null / 空数组。
//       禁止用静态数据伪造天气、活动、新店等实时信息。
// ─────────────────────────────────────────────────────────────

import type { WeatherDay } from '@/types/decision';

export interface GeoPoint {
  lng: number;
  lat: number;
}

export interface PoiResult {
  id: string;
  name: string;
  address?: string;
  lng?: number;
  lat?: number;
  category?: string;
  /** 供应商原始类型串，便于后续映射到 Place.category */
  rawType?: string;
}

export type RouteMode = 'driving' | 'walking' | 'transit';

export interface RouteResult {
  distanceM: number;
  durationMin: number;
  mode: RouteMode;
}

export interface WorldEvent {
  id: string;
  title: string;
  city?: string;
  startDate?: string;
  endDate?: string;
  venue?: string;
  category?: string;
}

// ── 各能力 Provider ──────────────────────────────────────────
// 命名对齐方案：WorldDataProvider / POIProvider / SearchProvider
//              / EventProvider / RestaurantProvider

export interface PoiProvider {
  search(q: { keyword: string; city?: string; limit?: number }): Promise<PoiResult[]>;
  nearby(q: { lng: number; lat: number; radius?: number; keyword?: string; limit?: number }): Promise<PoiResult[]>;
}

export interface SearchProvider {
  suggest(q: { keyword: string; city?: string }): Promise<string[]>;
}

export interface RestaurantProvider {
  restaurants(q: {
    city?: string;
    lng?: number;
    lat?: number;
    radius?: number;
    limit?: number;
  }): Promise<PoiResult[]>;
}

export interface EventProvider {
  list(q: { city: string; from?: string; to?: string; limit?: number }): Promise<WorldEvent[]>;
}

export interface GeocodeProvider {
  toPoint(q: { address: string; city?: string }): Promise<GeoPoint | null>;
  toAddress(q: GeoPoint): Promise<string | null>;
}

export interface RouteProvider {
  plan(q: { from: GeoPoint; to: GeoPoint; mode: RouteMode }): Promise<RouteResult | null>;
}

export interface WeatherProvider {
  forecast(q: { lng: number; lat: number; dates: string[] }): Promise<WeatherDay[] | null>;
}

/** 供应商无关的聚合入口。任一能力都可以是 null（未接入 / 未配置 key） */
export interface WorldDataProvider {
  name: string;
  poi: PoiProvider | null;
  search: SearchProvider | null;
  restaurant: RestaurantProvider | null;
  events: EventProvider | null;
  geocode: GeocodeProvider | null;
  route: RouteProvider | null;
  weather: WeatherProvider | null;
}
