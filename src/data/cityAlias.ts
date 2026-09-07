import { CN_CITIES } from './cities-cn';
import { DESTINATIONS } from './destinations';
import { allCnDestinations, shortCityName } from './destinations-cn';
import type { Destination } from '@/types';

/**
 * 城市实体识别
 * ────────────────────────────────────────────────────────────
 *
 * 为什么需要这个文件：
 *   cities-cn.ts 是高德行政区划自动生成的，直辖市的名字是「北京城区」「上海城区」
 *   （adcode 110100 / 310100 的官方名）。而旧的匹配是
 *   `text.includes(d.name)` —— 即「文本必须包含城市全名」，于是
 *
 *       "北京有什么好玩的".includes("北京城区")  ===  false
 *
 *   北京因此永远识别不出来，只能被当成出发地（它在 taxonomy 的 ORIGINS 里）。
 *   这就是「说北京却推荐了别的地方」的根因。
 *
 * 这里的做法：为每个城市生成一组别名（全名 / 规范名 / 去后缀短名），
 * 再做「双向 + 最长优先」匹配，并用后缀守卫避免误伤。
 *
 * 守卫例子：
 *   「广州北京路好吃」 → 「北京」后面紧跟「路」，判定为道路名，不识别为北京市
 *   「南京路步行街」   → 「南京」后跟「路」，不识别为南京市
 */

export interface CityEntity {
  id: string;
  /** 规范展示名（已去掉「城区」等后缀） */
  name: string;
  country: string;
  scope: 'domestic' | 'international';
  lat: number;
  lng: number;
  /** 命中的原始文本片段，便于调试与 UI 回显 */
  matched: string;
}

/** @deprecated 用 destinations-cn 的 shortCityName，保证识别名与展示名一致 */
function stripSuffix(name: string): string {
  return shortCityName(name);
}

/**
 * 紧跟在匹配之后出现这些字，说明命中片段是一个更长地名 / 道路 / 场馆的一部分，
 * 不是城市本身。（注意：不含「市」，因为 fullName 本身就带「市」）
 */
const CONTINUATION_GUARD = [
  '路',
  '街',
  '巷',
  '道',
  '店',
  '馆',
  '寺',
  '塔',
  '桥',
  '站',
  '市场',
  '大学',
  '公园',
  '广场',
  '机场',
  '博物馆',
];

interface AliasEntry {
  alias: string;
  entity: Omit<CityEntity, 'matched'>;
}

let aliasCache: AliasEntry[] | null = null;

function buildAliases(): AliasEntry[] {
  if (aliasCache) return aliasCache;
  const list: AliasEntry[] = [];
  const seen = new Set<string>();

  const push = (alias: string, entity: Omit<CityEntity, 'matched'>) => {
    if (!alias || alias.length < 2) return;
    const key = `${alias}|${entity.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.push({ alias, entity });
  };

  // 1) 国内 388 城：name 可能是「北京城区」，短名剥后缀得到「北京」
  for (const c of CN_CITIES) {
    const base: Omit<CityEntity, 'matched'> = {
      id: c.id,
      name: stripSuffix(c.name),
      country: '中国',
      scope: 'domestic',
      lat: c.lat,
      lng: c.lng,
    };
    push(c.name, base);
    push(c.fullName, base);
    push(stripSuffix(c.name), base);
    push(stripSuffix(c.fullName), base);
  }

  // 2) 精修目的地（含海外）：东京 / 大阪 / 首尔 / 曼谷 …
  for (const d of DESTINATIONS) {
    const base: Omit<CityEntity, 'matched'> = {
      id: d.id,
      name: d.name,
      country: d.country,
      scope: d.scope,
      lat: d.lat,
      lng: d.lng,
    };
    push(d.name, base);
  }

  // 长别名优先，保证「北京城区」胜过「北京」
  aliasCache = list.sort((a, b) => b.alias.length - a.alias.length);
  return aliasCache;
}

function findAll(text: string, alias: string): number[] {
  const out: number[] = [];
  let from = 0;
  for (;;) {
    const i = text.indexOf(alias, from);
    if (i < 0) break;
    out.push(i);
    from = i + 1;
  }
  return out;
}

/** 命中片段后面是否紧跟「更长地名」的后缀 */
function guarded(text: string, start: number, alias: string): boolean {
  const after = text.slice(start + alias.length);
  return CONTINUATION_GUARD.some((g) => after.startsWith(g));
}

/**
 * 从文本中识别城市。
 *
 * @param text 用户输入
 * @param limit 最多返回几个（默认 3）
 */
export function matchCitiesInText(text: string, limit = 3): CityEntity[] {
  const t = (text ?? '').trim();
  if (!t) return [];

  interface Hit {
    start: number;
    len: number;
    alias: string;
    entity: Omit<CityEntity, 'matched'>;
  }
  const hits: Hit[] = [];

  for (const { alias, entity } of buildAliases()) {
    for (const start of findAll(t, alias)) {
      if (guarded(t, start, alias)) continue;
      hits.push({ start, len: alias.length, alias, entity });
    }
  }
  if (hits.length === 0) return [];

  // 同一起点取最长；再按起点贪心剔掉重叠区间
  hits.sort((a, b) => a.start - b.start || b.len - a.len);

  const out: CityEntity[] = [];
  let cursor = -1;
  for (const h of hits) {
    if (h.start < cursor) continue; // 与已接受的更长命中重叠
    if (out.some((e) => e.id === h.entity.id)) continue;
    out.push({ ...h.entity, matched: h.alias });
    cursor = h.start + h.len;
    if (out.length >= limit) break;
  }
  return out;
}

/** 按 id 找到完整 Destination（用于详情页 / 推荐） */
export function destinationOfCity(id: string): Destination | undefined {
  return (
    DESTINATIONS.find((d) => d.id === id) ?? allCnDestinations().find((d) => d.id === id)
  );
}
