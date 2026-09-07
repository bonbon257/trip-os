import { matchCitiesInText, type CityEntity } from '@/data/cityAlias';
import { matchCountryInText } from '@/data/countries';
import type { Destination } from '@/types';

/**
 * 意图识别管线
 * ────────────────────────────────────────────────────────────
 *
 * 取代旧的「关键词硬匹配 → 固定跳某个页面」。
 *
 * 旧实现的问题（intent.ts）：
 *   · 只输出 scene / mode / energy，**不产出任何目的地实体**
 *   · 实体识别（queryIntent.ts）根本不参与路由，只在个别页面被零散调用
 *   · 于是「我下个月想去日本」里的「日本」只是个布尔开关，
 *     跳到 /destinations 后二次反查，落空就回落到上一次的推荐 → 出现「说日本跳杭州」
 *
 * 新的解析顺序（**实体优先于场景**）：
 *   1. 抽实体：国家 → 城市 → POI 类别
 *   2. 判 Context：TRAVEL / WEEKEND / NOW
 *   3. 抽约束：时间 / 强度 / 距离 / 同行人
 *   4. 定 Intent
 *   5. 算置信度：低置信返回 needsClarify，由 UI 追问，**不硬跳**
 *
 * 本文件是纯函数，不依赖 React / LLM，可直接在 node 里跑测试。
 */

export type AppContext = 'TRAVEL' | 'WEEKEND' | 'NOW';

export type IntentType =
  | 'DESTINATION_DISCOVERY' // 不知道去哪（国家 → 城市候选）
  | 'ACTIVITY_DISCOVERY' // 已定城市，看有什么好玩
  | 'DESTINATION_COMPARE' // 几个备选比一比
  | 'RANDOM_DISCOVERY' // 随便抽一个
  | 'TRIP_CREATE' // 已经决定了，直接建旅行
  | 'WEEKEND_DISCOVERY' // 这周末去哪
  | 'FOOD_DISCOVERY' // 吃什么
  | 'FUN_DISCOVERY' // 玩什么
  | 'NEARBY_DISCOVERY' // 附近看看
  | 'AREA_DISCOVERY' // 商圈探索
  | 'UNKNOWN';

export interface ParsedIntent {
  context: AppContext;
  intent: IntentType;
  entities: {
    country?: string;
    /** 国家展开出的城市候选（只有 DESTINATION_DISCOVERY 时才有） */
    countryCities?: Destination[];
    city?: CityEntity;
    /** 文本里提到的多个城市（用于对比） */
    cities?: CityEntity[];
    /** POI 类别：商圈 / 咖啡 / 展览 / 公园 … */
    category?: string;
  };
  time?: {
    kind: 'weekend' | 'tonight' | 'today' | 'tomorrow' | 'next_month' | 'unspecified';
  };
  constraints: {
    intensity?: 'low' | 'medium' | 'high';
    distance?: 'near' | 'far';
    companion?: 'solo' | 'couple' | 'friends' | 'family';
  };
  /** 0–1。低于 CLARIFY_THRESHOLD 时 needsClarify = true */
  confidence: number;
  needsClarify: boolean;
  clarifyQuestion?: string;
  /** 原始输入，透传给目标页做展示与二次过滤 */
  raw: string;
}

const CLARIFY_THRESHOLD = 0.45;

// ── 关键词表 ────────────────────────────────────────────────
// 注意：这些只用于「约束 / 时间 / 类别」，**不用于决定去哪个城市**——
// 城市由国家/城市词表决定，这是与旧实现的根本区别。

const WEEKEND_TIME = ['周末', '周六', '周日', '星期六', '星期日', '星期天', '双休'];
const NOW_TIME = ['今晚', '今天晚上', '现在', '这会儿', '下班后'];
const TOMORROW_TIME = ['明天', '明天晚上', '明晚'];
const NEXT_MONTH = ['下个月', '下月', '月底', '国庆', '春节', '年假', '假期', '放假'];

const LOW_INTENSITY = [
  '不想太累',
  '不想累',
  '不累',
  '太累',
  '轻松',
  '休闲',
  '慵懒',
  '慢慢',
  '随便走走',
  '不想赶',
  '不要太赶',
  '近一点',
  '不太远',
];
const NEAR = ['附近', '周边', '旁边', '就近', '近处', '不远', '走路能到'];
const FAR = ['远一点', '远一些', '没去过', '远行', '出远门'];

const COMPANIONS: Array<[ParsedIntent['constraints']['companion'], string[]]> = [
  ['couple', ['情侣', '女朋友', '男朋友', '老婆', '老公', '对象', '两人世界', '约会']],
  ['friends', ['朋友', '闺蜜', '兄弟', '同学', '同事', '一群人']],
  ['family', ['家人', '父母', '爸妈', '孩子', '小孩', '带娃', '亲子', '全家']],
  ['solo', ['一个人', '自己', '独自', '独处']],
];

const FOOD_HINTS = ['吃', '吃什么', '餐厅', '美食', '小吃', '晚饭', '午饭', '夜宵', '特色菜', '好吃的'];
const FUN_HINTS = ['玩', '玩什么', '好玩', '展览', '演出', '电影', '话剧', '书店', '娱乐', '活动'];
const AREA_HINTS = ['商圈', '商场', '购物', '逛街', '步行街', '商业区'];
const CAFE_HINTS = ['咖啡', '喝', '茶饮', '奶茶', '酒吧', '酒'];
const RANDOM_HINTS = ['随便', '随机', '抽', '抽签', '转盘', '帮我选', '无所谓', '都行'];
const COMPARE_HINTS = ['还是', '对比', '比较', '选哪个', '哪个好', '拿不准', '几个备选', '纠结'];
const DECIDED_HINTS = ['已经决定', '决定了', '就去', '准备去', '打算去', '帮我安排', '做攻略'];
const ACTIVITY_HINTS = ['有什么好玩', '好玩的', '景点', '怎么玩', '玩几天', '攻略'];

function hasAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

function detectCompanion(text: string): ParsedIntent['constraints']['companion'] | undefined {
  for (const [key, words] of COMPANIONS) {
    if (hasAny(text, words)) return key;
  }
  return undefined;
}

function detectCategory(text: string): string | undefined {
  if (hasAny(text, AREA_HINTS)) return '商圈';
  if (hasAny(text, FOOD_HINTS)) return '餐饮';
  if (hasAny(text, CAFE_HINTS)) return '咖啡茶饮';
  if (hasAny(text, FUN_HINTS)) return '玩乐';
  return undefined;
}

function detectTime(text: string): NonNullable<ParsedIntent['time']> {
  if (hasAny(text, NOW_TIME)) return { kind: 'tonight' };
  if (hasAny(text, TOMORROW_TIME)) return { kind: 'tomorrow' };
  if (hasAny(text, WEEKEND_TIME)) return { kind: 'weekend' };
  if (hasAny(text, NEXT_MONTH)) return { kind: 'next_month' };
  return { kind: 'unspecified' };
}

/**
 * 主入口。
 *
 * 判定原则：
 *   · 有海外国家 / 境外城市 → TRAVEL
 *   · 「今晚 / 现在 / 下班后」→ NOW（优先级高于城市，因为「今晚在北京吃点什么」是 Now）
 *   · 「周末 / 周六」        → WEEKEND
 *   · 有城市 + 出国/下个月/攻略语境 → TRAVEL
 *   · 有城市 + 吃/喝/商圈语境       → WEEKEND
 *   · 都不明确                      → UNKNOWN + needsClarify
 */
export function parseIntent(raw: string): ParsedIntent {
  const text = (raw ?? '').trim();
  const base: ParsedIntent = {
    context: 'TRAVEL',
    intent: 'UNKNOWN',
    entities: {},
    constraints: {},
    confidence: 0,
    needsClarify: false,
    raw: text,
  };
  if (!text) return { ...base, needsClarify: true, confidence: 0 };

  const country = matchCountryInText(text);
  const cities = matchCitiesInText(text);
  const time = detectTime(text);
  const category = detectCategory(text);
  const companion = detectCompanion(text);
  const constraints: ParsedIntent['constraints'] = {
    ...(hasAny(text, LOW_INTENSITY) ? { intensity: 'low' as const } : {}),
    ...(hasAny(text, NEAR) ? { distance: 'near' as const } : {}),
    ...(hasAny(text, FAR) ? { distance: 'far' as const } : {}),
    ...(companion ? { companion } : {}),
  };

  const isRandom = hasAny(text, RANDOM_HINTS);
  const isCompare = hasAny(text, COMPARE_HINTS);
  const isDecided = hasAny(text, DECIDED_HINTS);
  const isFood = hasAny(text, FOOD_HINTS);
  const isFun = hasAny(text, FUN_HINTS);
  const isArea = hasAny(text, AREA_HINTS);
  const isActivity = hasAny(text, ACTIVITY_HINTS);
  const isNow = time.kind === 'tonight';
  const isWeekend = time.kind === 'weekend' || time.kind === 'tomorrow';

  // ── 1. Context 判定 ────────────────────────────────────────
  // 顺序很重要：「好玩」这类词同时出现在旅行与周末语境里（「北京有什么好玩」
  // 是旅行，「周末玩什么」是周末），所以先判更强的时间 / 实体信号。
  const noDestinationGo = hasAny(text, ['不知道去哪', '不知道去哪里', '去哪', '去哪里']);
  let context: AppContext | 'UNKNOWN';

  if (isNow) {
    context = 'NOW';
  } else if (isWeekend) {
    // 「下个月去日本」里出现「周末」的概率极低；但「这周末去成都」应算 WEEKEND。
    // 有海外国家时以 TRAVEL 为准（跨国周末不现实）。
    context = country ? 'TRAVEL' : 'WEEKEND';
  } else if (country) {
    context = 'TRAVEL';
  } else if (cities.length >= 2) {
    // 多个城市并列 = 在比较目的地，天然属于旅行
    context = 'TRAVEL';
  } else if (cities.length === 1) {
    const city = cities[0]!;
    if (city.scope === 'international') context = 'TRAVEL';
    else if (isDecided || isActivity || time.kind === 'next_month') context = 'TRAVEL';
    else if (isFood || isArea || isFun) context = 'WEEKEND';
    else context = 'WEEKEND'; // 同城且无语境 → 轻量优先，按周末处理
  } else if (time.kind === 'next_month' || noDestinationGo) {
    context = 'TRAVEL';
  } else if (isFood || isArea || isFun || constraints.distance === 'near') {
    context = 'WEEKEND';
  } else {
    context = 'UNKNOWN';
  }

  // ── 2. Intent 判定 ─────────────────────────────────────────
  let intent: IntentType = 'UNKNOWN';
  let confidence = 0;

  if (context === 'TRAVEL') {
    if (country) {
      intent = 'DESTINATION_DISCOVERY';
      confidence = 0.9;
    } else if (cities.length >= 2) {
      intent = 'DESTINATION_COMPARE';
      confidence = isCompare ? 0.9 : 0.75;
    } else if (cities.length === 1 && isActivity) {
      intent = 'ACTIVITY_DISCOVERY';
      confidence = 0.88;
    } else if (cities.length === 1 && isDecided) {
      intent = 'TRIP_CREATE';
      confidence = 0.85;
    } else if (cities.length === 1) {
      intent = 'ACTIVITY_DISCOVERY';
      confidence = 0.6;
    } else if (isRandom) {
      intent = 'RANDOM_DISCOVERY';
      confidence = 0.75;
    } else if (time.kind === 'next_month' || noDestinationGo) {
      intent = 'DESTINATION_DISCOVERY';
      confidence = 0.65;
    }
  } else if (context === 'NOW' || context === 'WEEKEND') {
    if (isFood) {
      intent = 'FOOD_DISCOVERY';
      confidence = 0.9;
    } else if (isArea) {
      intent = 'AREA_DISCOVERY';
      confidence = 0.88;
    } else if (isRandom) {
      intent = 'RANDOM_DISCOVERY';
      confidence = 0.85;
    } else if (constraints.distance === 'near') {
      intent = 'NEARBY_DISCOVERY';
      confidence = 0.82;
    } else if (isFun && !isActivity) {
      intent = 'FUN_DISCOVERY';
      confidence = 0.8;
    } else if (cities.length === 1) {
      intent = 'ACTIVITY_DISCOVERY';
      confidence = 0.75;
    } else {
      intent = 'WEEKEND_DISCOVERY';
      confidence = 0.7;
    }
  }

  // ── 3. 置信度修正与澄清 ────────────────────────────────────
  if (context === 'UNKNOWN') {
    context = 'TRAVEL';
    intent = 'UNKNOWN';
    confidence = 0.2;
  }
  if (cities.length) confidence = Math.min(0.95, confidence + 0.05);
  if (Object.keys(constraints).length) confidence = Math.min(0.95, confidence + 0.03);

  const needsClarify = confidence < CLARIFY_THRESHOLD;
  const clarifyQuestion = needsClarify
    ? '你是想安排一次旅行，还是这周末出去走走？'
    : undefined;

  return {
    context,
    intent,
    entities: {
      ...(country ? { country: country.country, countryCities: country.cities } : {}),
      ...(cities[0] ? { city: cities[0] } : {}),
      ...(cities.length > 1 ? { cities } : {}),
      ...(category ? { category } : {}),
    },
    time,
    constraints,
    confidence,
    needsClarify,
    clarifyQuestion,
    raw: text,
  };
}

/**
 * 把解析结果落成 URL。
 *
 * 与旧实现的关键差别：这里接受的是**结构化结果**而不是原文关键词，
 * 且调用方必须先判断 needsClarify —— 低置信不允许硬跳。
 */
export function routeForIntent(p: ParsedIntent): string {
  const q = encodeURIComponent(p.raw);
  const cityId = p.entities.city?.id;
  const country = p.entities.country;

  switch (p.intent) {
    case 'DESTINATION_DISCOVERY':
      return country
        ? `/travel/destinations?country=${encodeURIComponent(country)}&q=${q}`
        : `/travel/destinations?q=${q}`;
    case 'ACTIVITY_DISCOVERY':
      return cityId ? `/travel/destinations/${cityId}?q=${q}` : `/travel/destinations?q=${q}`;
    case 'DESTINATION_COMPARE':
      return `/travel/compare?q=${q}`;
    case 'RANDOM_DISCOVERY':
      return p.context === 'TRAVEL'
        ? `/travel/random?q=${q}`
        : `/weekend/random?q=${q}${cityId ? `&city=${cityId}` : ''}`;
    case 'TRIP_CREATE':
      return cityId ? `/travel/new?destination=${cityId}&q=${q}` : `/travel/new?q=${q}`;
    case 'FOOD_DISCOVERY':
      return `/weekend/food?q=${q}${cityId ? `&city=${cityId}` : ''}`;
    case 'FUN_DISCOVERY':
      return `/weekend/fun?q=${q}${cityId ? `&city=${cityId}` : ''}`;
    case 'AREA_DISCOVERY':
      return `/weekend/areas?q=${q}${cityId ? `&city=${cityId}` : ''}`;
    case 'NEARBY_DISCOVERY':
      return `/weekend/nearby?q=${q}`;
    case 'WEEKEND_DISCOVERY':
      return `/weekend/where?q=${q}`;
    default:
      return `/?q=${q}`;
  }
}
