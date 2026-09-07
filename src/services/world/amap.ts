/**
 * AMap World Provider —— 把高德真实能力接到 WorldDataProvider 接口上。
 *
 * 当前只接 weather（天气），其余能力保持 null（未接入 / 未配置 key 时安全降级）。
 * 所有调用都走后端代理 /api/map/*，前端永远看不到高德 Key。
 *
 * 铁律：天气是真实数据，失败就返回 null/[]，绝不伪造。
 */
import type { WeatherDay } from '@/types/decision';
import { getWorld, nullWorld, setWorld } from './index';
import type { WeatherProvider, WorldDataProvider } from './types';

export const amapWeatherProvider: WeatherProvider = {
  async forecast({ lng, lat, dates }) {
    try {
      const res = await fetch(`/api/map/weather?lng=${lng}&lat=${lat}`);
      if (!res.ok) return null;
      const json = (await res.json()) as { ok: boolean; days?: WeatherDay[] };
      if (!json.ok || !Array.isArray(json.days)) return null;
      const hit = json.days.filter((d) => dates.includes(d.date));
      return hit.length ? hit : null;
    } catch {
      // 离线 / 后端未起 / 解析失败 → 优雅降级
      return null;
    }
  },
};

/** 在应用启动时调用一次：把真实天气 Provider 装进 World（其余能力仍是 nullWorld 的 null） */
export function installAmapWorld(): void {
  const cur = getWorld();
  const next: WorldDataProvider = {
    ...nullWorld,
    name: 'amap',
    weather: cur.weather ?? amapWeatherProvider,
  };
  setWorld(next);
}

/** 按坐标取天气（异步，UI 用）。无 Provider 或未配置 → 空数组 */
export async function weatherForCoords(lng: number, lat: number, dates: string[]): Promise<WeatherDay[]> {
  const w = getWorld().weather;
  if (!w) return [];
  const r = await w.forecast({ lng, lat, dates });
  return r ?? [];
}
