import { CN_CITIES, type CnCity } from './cities-cn';
import type { Destination } from '@/types';

/**
 * 国内城市库适配层
 * ────────────────────────────────────────────────────────────
 * CN_CITIES 是脚本生成的结构化数据（388 个地级市，来自高德）。
 * 这里把它适配成推荐引擎认识的 Destination 形状，
 * 好处是 services/recommendation.ts 完全不用改。
 *
 * 注意：这里是**确定性规则**，不是模型在运行时推荐。
 * 这样每个城市的分数依然可解释、结果可复现。
 */

const EMOJI_BY_TAG: [string, string][] = [
  ['island', '🏝️'],
  ['themePark', '🎡'],
  ['onsen', '♨️'],
  ['outdoor', '🥾'],
  ['nature', '⛰️'],
  ['snow', '❄️'],
  ['nightlife', '🌃'],
  ['art', '🎨'],
  ['museum', '🏺'],
  ['architecture', '🏛️'],
  ['shopping', '🛍️'],
  ['coffee', '☕'],
  ['food', '🍜'],
  ['photo', '📷'],
  ['citywalk', '🚶'],
];

const TAG_LABEL: Record<string, string> = {
  chill: '躺平',
  food: '美食',
  shopping: '逛街',
  nature: '自然',
  citywalk: '城市漫游',
  coffee: '咖啡',
  architecture: '建筑',
  art: '艺术',
  museum: '博物馆',
  photo: '拍照',
  nightlife: '夜生活',
  themePark: '主题乐园',
  niche: '小众',
  outdoor: '户外',
  onsen: '温泉',
  island: '海岛',
};

function emojiFor(tags: string[]): string {
  for (const [tag, emoji] of EMOJI_BY_TAG) {
    if (tags.includes(tag)) return emoji;
  }
  return '📍';
}

/** 生成一句话简介：把标签翻译成人话，而不是模板腔 */
function summaryFor(city: CnCity): string {
  const t = city.tags;
  const label = (k: string) => TAG_LABEL[k] ?? k;
  const mains = t.slice(0, 3).map(label);

  if (city.curated && city.highlights.length) {
    return `${city.province.replace(/省|市|自治区|维吾尔|壮族|回族|特别行政区/g, '')}的${mains.join('、')}目的地。${city.highlights.slice(0, 3).join('、')}是这里的主角。`;
  }
  return `${city.name}在${city.province.replace(/省|市|自治区|维吾尔|壮族|回族|特别行政区/g, '')}，以${mains.join('、')}见长。适合不赶时间、愿意慢下来看看的人。`;
}

/** 玩法骨架：按标签排 4 步，最后一天永远留白 */
function playbookFor(city: CnCity): string[] {
  const t = city.tags;
  const steps: string[] = [];
  if (t.includes('island')) steps.push('环岛 / 海边发呆');
  if (t.includes('nature') || t.includes('outdoor')) steps.push('进山或自然景区走一趟');
  if (t.includes('architecture') || t.includes('museum')) steps.push('看古迹 / 逛博物馆');
  if (t.includes('food')) steps.push('找本地人常去的馆子');
  if (t.includes('citywalk') || t.includes('coffee')) steps.push('老城街区 + 咖啡馆慢慢逛');
  if (t.includes('nightlife')) steps.push('晚上出去走走');
  if (t.includes('art') || t.includes('niche')) steps.push('找一个小众展览或独立小店');
  if (t.includes('shopping')) steps.push('商圈逛街');
  if (t.includes('onsen')) steps.push('泡个温泉');
  const picked = steps.slice(0, 3);
  while (picked.length < 3) picked.push('随意走走，看当天心情');
  return [...picked, '留白，不安排'];
}

/** 负面标签：让「不喜欢」的用户能被正确劝退 */
function antiTagsFor(city: CnCity): string[] {
  const out: string[] = [];
  if (city.intensity === 'high') out.push('earlyRise', 'rush');
  if (city.cost === 3) out.push('highCost');
  if (city.isCapital) out.push('crowds');
  if (city.region === '西北' || city.region === '西南') out.push('longTransit');
  return Array.from(new Set(out));
}

function cautionsFor(city: CnCity): string[] {
  const out: string[] = [];
  if (city.isCapital) out.push('节假日人流较大，热门点位建议错峰');
  const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const off = all.filter((m) => !city.season.includes(m));
  if (off.length >= 6) {
    out.push(`${off.slice(0, 3).join('、')}月不是最佳季节，景色会打折扣`);
  }
  if (city.intensity === 'high') out.push('部分景点需要早起或徒步，体力要求高');
  if (city.region === '西北') out.push('路途较长，建议预留路上时间');
  return out.slice(0, 3);
}

/**
 * 去掉行政后缀：「北京城区」→「北京」、「乌鲁木齐市」→「乌鲁木齐」。
 * 与 cityAlias.ts 共用，保证「识别到的名字」和「展示的名字」是同一个。
 *
 * 注意不含「州」：兰州 / 广州 / 随州 的「州」是名字的一部分，
 * 剥掉会变成「兰 / 广 / 随」，反而制造新的误匹配（「随便走走」会命中「随」）。
 * 「自治州」单独处理。
 */
const SUFFIXES = [
  '特别行政区',
  '自治州',
  '自治县',
  '自治旗',
  '地区',
  '城区',
  '新区',
  '市',
  '县',
  '盟',
];

export function shortCityName(name: string): string {
  for (const s of SUFFIXES) {
    // 结果至少保留 2 个字，避免把「随州」这类名字剥成单字
    if (name.length > s.length + 1 && name.endsWith(s)) return name.slice(0, -s.length);
  }
  return name;
}

/** CnCity → Destination */
export function cnCityToDestination(city: CnCity): Destination {
  return {
    id: city.id,
    /**
     * 展示名剥掉行政后缀。
     * cities-cn.ts 由高德行政区划自动生成，直辖市的名字是「北京城区」「上海城区」，
     * 直接拿 city.name 会让界面上出现「北京城区」这种说法。
     */
    name: shortCityName(city.name),
    country: '中国',
    scope: 'domestic',
    lat: city.lat,
    lng: city.lng,
    emoji: emojiFor(city.tags),
    summary: summaryFor(city),
    budgetLevel: city.cost,
    dailyCost: { low: city.dailyLow, high: city.dailyHigh },
    idealDays: { min: city.idealMin, max: city.idealMax },
    intensity: city.intensity,
    tags: city.tags,
    antiTags: antiTagsFor(city),
    bestSeasons: city.season,
    highlights: city.highlights.length ? city.highlights : city.tags.map((t) => TAG_LABEL[t] ?? t),
    cautions: cautionsFor(city),
    playbook: playbookFor(city),
  };
}

/** 全部国内城市（惰性转换 + 缓存，避免启动时算 388 个对象） */
let cache: Destination[] | null = null;
export function allCnDestinations(): Destination[] {
  if (!cache) cache = CN_CITIES.map(cnCityToDestination);
  return cache;
}

export function cnCityById(id: string): Destination | undefined {
  return allCnDestinations().find((d) => d.id === id);
}

const appealMap = new Map<string, number>(CN_CITIES.map((c) => [c.id, c.appeal]));
const provinceMap = new Map<string, string>(CN_CITIES.map((c) => [c.id, c.province]));
const regionMap = new Map<string, string>(CN_CITIES.map((c) => [c.id, c.region]));

/** 国内城市所属省份，非国内城市返回 null */
export function cnProvinceOf(destinationId: string): string | null {
  return provinceMap.get(destinationId) ?? null;
}

/** 大区：华东 / 西南 / 西北 …，非国内城市返回 null */
export function cnRegionOf(destinationId: string): string | null {
  return regionMap.get(destinationId) ?? null;
}

/** 目的地吸引力：0.5（普通地级市）~ 1.0（精修目的地）。非国内城市默认 1.0 */
export function appealOf(destinationId: string): number {
  return appealMap.get(destinationId) ?? 1.0;
}

export const CN_CITY_COUNT = CN_CITIES.length;
