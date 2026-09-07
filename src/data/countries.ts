import { DESTINATIONS } from './destinations';
import type { Destination } from '@/types';

/**
 * 国家 → 城市
 * ────────────────────────────────────────────────────────────
 *
 * 解决「我下个月想去日本，但不知道去哪」这类输入：
 * 国家本身不是可去的目的地，必须展开成该国城市候选（东京 / 大阪 / 冲绳…）。
 *
 * 数据来源：DESTINATIONS 里 country 字段真实存在的值，不手写城市清单。
 *   —— 当前池里：日本（东京/大阪/冲绳）、韩国（首尔/釜山）、泰国（曼谷/清迈）、
 *      新加坡（新加坡）。京都 / 北海道 / 福冈 在池里没有真实数据，
 *      因此**不会**被列出来（不编造目的地）。
 *
 * 中国故意不作为「国家实体」匹配：池里 388 个国内城市都是中国，
 * 把「中国」当成发现实体没有意义（等于推荐 388 个城市）。
 * 「国内 / 境内」只作为 scope 约束，走 inferTravelScope。
 */

export interface CountryEntity {
  country: string;
  /** 命中的原始文本 */
  matched: string;
  cities: Destination[];
}

/** 国家别名（小写用于英文匹配） */
const COUNTRY_ALIASES: Record<string, string[]> = {
  日本: ['日本', '霓虹', 'japan'],
  韩国: ['韩国', '南韩', 'korea'],
  泰国: ['泰国', 'thailand'],
  新加坡: ['新加坡', 'singapore'],
};

/** 池里真实存在的海外国家（按城市数降序，保证「日本」优先于更小众的国家） */
const COUNTRIES_IN_POOL: string[] = (() => {
  const counts = new Map<string, number>();
  for (const d of DESTINATIONS) {
    if (d.scope !== 'international') continue;
    counts.set(d.country, (counts.get(d.country) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
})();

export function citiesOfCountry(country: string): Destination[] {
  return DESTINATIONS.filter((d) => d.country === country);
}

/** 池里有哪些海外国家（供 UI / 测试使用） */
export function availableCountries(): string[] {
  return [...COUNTRIES_IN_POOL];
}

/**
 * 从文本中识别国家。
 * 返回按「别名长度」优先的第一个命中，避免「去日本」里的「日本」被更短的词抢走。
 */
export function matchCountryInText(text: string): CountryEntity | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  const lower = t.toLowerCase();

  let best: { country: string; matched: string } | null = null;
  for (const country of COUNTRIES_IN_POOL) {
    for (const alias of COUNTRY_ALIASES[country] ?? [country]) {
      const hit = lower.includes(alias.toLowerCase());
      if (!hit) continue;
      if (!best || alias.length > best.matched.length) {
        best = { country, matched: alias };
      }
    }
  }
  if (!best) return null;
  return { country: best.country, matched: best.matched, cities: citiesOfCountry(best.country) };
}
