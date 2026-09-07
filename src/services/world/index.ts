import type { WeatherDay } from '@/types/decision';
import type { WorldDataProvider } from './types';

export * from './types';

/**
 * Null Provider —— 所有能力都未接入。
 * 这是 Phase 0 的默认实现：任何调用都安全返回「无数据」，
 * 绝不返回伪造内容。
 */
export const nullWorld: WorldDataProvider = {
  name: 'null',
  poi: null,
  search: null,
  restaurant: null,
  events: null,
  geocode: null,
  route: null,
  weather: null,
};

let current: WorldDataProvider = nullWorld;

/** 取当前 World Provider（默认 nullWorld） */
export function getWorld(): WorldDataProvider {
  return current;
}

/** 注入真实实现（高德 / 其它供应商）。Phase 1 接线时调用，业务代码无需感知供应商 */
export function setWorld(p: WorldDataProvider): void {
  current = p;
}

// ── 天气：同步便捷入口 ───────────────────────────────────────
/**
 * 取某目的地若干日期的天气。
 *
 * Phase 0：没有真实 WeatherProvider → 返回空数组。
 * 这里【刻意不】用任何方式生成模拟天气（此前是用 destinationId.length
 * 播种伪造晴雨，已在 Phase 0 删除）。
 *
 * 消费方必须优雅降级：
 *   · 没有天气 → 不生成 weatherRisk 冲突
 *   · 没有天气 → UI 不显示天气模块
 *   · 其余排期 / 预算 / 强度逻辑不受影响
 */
export function weatherFor(_destinationId: string, _dates: string[]): WeatherDay[] {
  return [];
}
