import type { Destination, Intensity, QuizAnswers, TransportMode } from '@/types';
import type { ScoreFactor, ScoredDestination, TravelTypeResult } from '@/types/decision';
import { DESTINATIONS } from '@/data/destinations';
import { ORIGINS } from '@/data/taxonomy';
import { allCnDestinations, appealOf } from '@/data/destinations-cn';
import { clamp } from '@/utils/format';

// ── 档位换算 ────────────────────────────────────────────────
const DURATION_DAYS: Record<QuizAnswers['duration'], number> = {
  d23: 3,
  d45: 5,
  d67: 7,
  d810: 9,
  d10p: 12,
};

const BUDGET_VALUE: Record<QuizAnswers['budget'], number> = {
  b1: 1000,
  b2: 2000,
  b3: 4000,
  b4: 7500,
  b5: 15000,
};

const PACE_SLOTS: Record<QuizAnswers['pace'], number> = {
  intense: 6.5,
  balanced: 4,
  focused: 2.5,
  free: 1.5,
};

const INTENSITY_SLOTS: Record<Intensity, number> = { low: 3, medium: 5, high: 7 };

export const durationDays = (b: QuizAnswers['duration']) => DURATION_DAYS[b];
export const budgetValue = (b: QuizAnswers['budget']) => BUDGET_VALUE[b];

// ── 淡旺季 ─────────────────────────────────────────────────
export interface SeasonInfo {
  key: string;
  label: string;
  /** 价格系数：1 = 平日，> 1 旺季涨价，< 1 淡季便宜 */
  multiplier: number;
  note: string;
}

/**
 * 按出发日期判断淡旺季。
 * 春节用固定区间近似（真要做准得查农历，先用公历窗口 + 标注「估算」）。
 */
export function seasonOf(dateISO?: string): SeasonInfo {
  if (!dateISO) {
    return { key: 'regular', label: '平日', multiplier: 1, note: '未指定日期，按平日价估算' };
  }
  const md = dateISO.slice(5).replace('-', ''); // MMDD
  const month = Number(md.slice(0, 2));

  const inRange = (startMMDD: string, endMMDD: string) => md >= startMMDD && md <= endMMDD;

  if (inRange('1001', '1007')) {
    return { key: 'nationalDay', label: '国庆', multiplier: 1.9, note: '国庆假期，机票高铁普遍翻倍，越晚订越贵' };
  }
  if (inRange('0501', '0505')) {
    return { key: 'labourDay', label: '五一', multiplier: 1.55, note: '五一假期，热门线路涨价明显' };
  }
  if (inRange('0120', '0220')) {
    return { key: 'springFestival', label: '春运', multiplier: 1.75, note: '春运期间，返乡线路一票难求且价格高' };
  }
  if (inRange('0701', '0831')) {
    return { key: 'summer', label: '暑假', multiplier: 1.35, note: '暑假旺季，亲子线路尤其贵' };
  }
  if (inRange('0101', '0103') || inRange('1225', '1231')) {
    return { key: 'newYear', label: '元旦跨年', multiplier: 1.3, note: '跨年出行，短途热门' };
  }
  if (month === 3 || month === 4 || month === 11 || month === 12) {
    return { key: 'low', label: '淡季', multiplier: 0.88, note: '错峰出行，性价比最高的一档' };
  }
  if (month === 6 || month === 9) {
    return { key: 'shoulder', label: '平季', multiplier: 0.95, note: '不冷不热，价格也比较友好' };
  }
  return { key: 'regular', label: '平日', multiplier: 1, note: `${month} 月属常规时段` };
}

export interface TransportEstimate {
  hours: number;
  cost: number;
  /** 未乘淡旺季系数的基础价，方便 UI 展示「原价 → 现价」 */
  baseCost: number;
  mode: TransportMode;
  season: SeasonInfo;
  /** 往返合计（含淡旺季） */
  roundTripCost: number;
}

// ── 交通估算（结构化数据缺省时按经纬度推算）──────────────────
export function transportEstimate(
  origin: string,
  dest: Destination,
  dateISO?: string,
): TransportEstimate {
  const season = seasonOf(dateISO);
  const preset = dest.originTransport?.[origin];

  const base: { hours: number; cost: number; mode: TransportMode } = preset
    ? { hours: preset.hours, cost: preset.cost, mode: preset.mode }
    : (() => {
        const from = ORIGINS.find((o) => o.name === origin) ?? ORIGINS[1];
        const km = Math.hypot(
          (dest.lat - from.lat) * 111,
          (dest.lng - from.lng) * 111 * Math.cos((dest.lat * Math.PI) / 180),
        );
        if (dest.scope === 'international') {
          return {
            mode: 'flight' as TransportMode,
            hours: Math.round((2.2 + km / 780) * 10) / 10,
            cost: Math.round((950 + km * 0.62) / 10) * 10,
          };
        }
        return {
          mode: (km > 900 ? 'flight' : 'train') as TransportMode,
          hours: Math.max(0.6, Math.round((km / (km > 900 ? 750 : 220) + 0.6) * 10) / 10),
          cost: Math.round(((km > 900 ? 0.62 : 0.48) * km + 60) / 10) * 10,
        };
      })();

  // 淡旺季对机票的影响远大于高铁（高铁是固定票价）
  const swing = base.mode === 'flight' ? season.multiplier : 1 + (season.multiplier - 1) * 0.35;
  const cost = Math.round((base.cost * swing) / 10) * 10;

  return {
    hours: base.hours,
    cost,
    baseCost: base.cost,
    mode: base.mode,
    season,
    roundTripCost: cost * 2,
  };
}

// ── 九个评分因子 ────────────────────────────────────────────
const WEIGHTS = {
  budget: 0.16,
  duration: 0.14,
  transport: 0.11,
  interest: 0.2,
  dislike: 0.14,
  pace: 0.09,
  season: 0.08,
  companion: 0.05,
  intensity: 0.03,
};

function scoreDestination(
  dest: Destination,
  a: QuizAnswers,
  month: number,
): ScoredDestination {
  const days = DURATION_DAYS[a.duration];
  const budget = BUDGET_VALUE[a.budget];
  const transport = transportEstimate(a.origin, dest);
  const dailyMid = (dest.dailyCost.low + dest.dailyCost.high) / 2;
  const estLow = transport.cost + dest.dailyCost.low * days;
  const estHigh = transport.cost + dest.dailyCost.high * days;
  const estMid = transport.cost + dailyMid * days;

  // 预算：不超支满分，超支按比例衰减
  const budgetScore =
    estMid <= budget ? 1 : clamp(1 - (estMid - budget) / Math.max(budget, 1), 0, 1);

  // 天数：落在理想区间满分，偏离越多越低
  const { min, max } = dest.idealDays;
  const off = days < min ? min - days : days > max ? days - max : 0;
  const durationScore = clamp(1 - off / 4, 0, 1);

  // 大交通：飞行 4h 内 / 陆路 3h 内最舒适；成本占比也纳入
  const hourScore =
    transport.mode === 'flight'
      ? clamp(1 - Math.max(0, transport.hours - 4) / 10, 0.2, 1)
      : clamp(1 - Math.max(0, transport.hours - 3) / 8, 0.2, 1);
  const costShare = transport.cost / Math.max(budget, 1);
  const transportScore = clamp(hourScore * 0.55 + clamp(1 - costShare / 0.7, 0, 1) * 0.45, 0, 1);

  // 兴趣：命中率 + 基础分
  const interestSet = new Set(a.interests);
  const hitTags = dest.tags.filter((t) => interestSet.has(t));
  const interestScore = clamp(0.32 + 0.68 * (hitTags.length / Math.max(a.interests.length, 1)), 0, 1);

  // 负向偏好：命中即重罚（dislikes 是最重要的过滤信号）
  const dislikeSet = new Set(a.dislikes);
  const hitAnti = dest.antiTags.filter((t) => dislikeSet.has(t));
  const extraPenalty =
    (dislikeSet.has('highCost') && dest.budgetLevel === 3 ? 0.5 : 0) +
    (dislikeSet.has('rush') && dest.intensity === 'high' ? 0.4 : 0) +
    (dislikeSet.has('longTransit') && transport.hours > 5 ? 0.35 : 0) +
    (dislikeSet.has('walking') && dest.intensity === 'high' ? 0.25 : 0);
  const dislikeScore = clamp(
    1 - (hitAnti.length / Math.max(a.dislikes.length, 1)) * 1.1 - extraPenalty,
    0,
    1,
  );

  // 节奏：目的地可承载的地点密度 vs 期望密度
  const paceScore = clamp(
    1 - Math.abs(PACE_SLOTS[a.pace] - INTENSITY_SLOTS[dest.intensity]) / 6,
    0,
    1,
  );

  // 季节：当月是否属于最佳季节
  const seasonScore = dest.bestSeasons.includes(month)
    ? 1
    : dest.bestSeasons.includes(month + 1) || dest.bestSeasons.includes(month - 1)
      ? 0.62
      : 0.3;

  // 同行关系
  const tagSet = new Set(dest.tags);
  const companionMap: Record<QuizAnswers['companions'], string[]> = {
    solo: ['chill', 'niche', 'coffee', 'museum'],
    partner: ['photo', 'food', 'chill', 'art'],
    friends: ['food', 'nightlife', 'shopping', 'photo'],
    family: ['nature', 'themePark', 'museum', 'chill'],
    colleagues: ['citywalk', 'food', 'architecture'],
    group: ['shopping', 'food', 'photo'],
  };
  const want = companionMap[a.companions];
  const companionScore = clamp(
    0.45 + 0.55 * (want.filter((t) => tagSet.has(t)).length / want.length),
    0,
    1,
  );

  // 旅行强度 vs 状态
  const moodTarget: Record<QuizAnswers['travelMood'], Intensity> = {
    tired: 'low',
    change: 'medium',
    energetic: 'high',
    reward: 'medium',
    escape: 'low',
    alone: 'low',
    social: 'medium',
  };
  const rank: Record<Intensity, number> = { low: 0, medium: 1, high: 2 };
  const intensityScore = clamp(1 - Math.abs(rank[dest.intensity] - rank[moodTarget[a.travelMood]]) / 2, 0.35, 1);

  const factors: ScoreFactor[] = [
    {
      key: 'interest',
      label: '兴趣匹配',
      weight: WEIGHTS.interest,
      score: interestScore,
      note:
        hitTags.length > 0
          ? `命中 ${hitTags.length} / ${a.interests.length} 个兴趣`
          : '与你的兴趣重合较少',
    },
    {
      key: 'dislike',
      label: '避开雷点',
      weight: WEIGHTS.dislike,
      score: dislikeScore,
      note: hitAnti.length ? `存在你不想要的元素` : '没有踩到你的负向偏好',
    },
    {
      key: 'budget',
      label: '预算匹配',
      weight: WEIGHTS.budget,
      score: budgetScore,
      note: estMid <= budget ? '预计花费在预算内' : `预计超出约 ¥${Math.round(estMid - budget)}`,
    },
    {
      key: 'duration',
      label: '天数匹配',
      weight: WEIGHTS.duration,
      score: durationScore,
      note:
        off === 0 ? `${days} 天刚好` : days < min ? `${days} 天略赶` : `${days} 天略多`,
    },
    {
      key: 'transport',
      label: '出发地交通',
      weight: WEIGHTS.transport,
      score: transportScore,
      note: `${a.origin}出发 · 单程约 ${transport.hours} 小时 · ¥${transport.cost}`,
    },
    {
      key: 'pace',
      label: '节奏匹配',
      weight: WEIGHTS.pace,
      score: paceScore,
      note: `目的地强度${dest.intensity === 'low' ? '低' : dest.intensity === 'medium' ? '中' : '高'}`,
    },
    {
      key: 'season',
      label: '季节匹配',
      weight: WEIGHTS.season,
      score: seasonScore,
      note: seasonScore === 1 ? '当月属于最佳季节' : '当月季节一般',
    },
    {
      key: 'companion',
      label: '同行关系',
      weight: WEIGHTS.companion,
      score: companionScore,
      note: '与同行人的偏好契合度',
    },
    {
      key: 'intensity',
      label: '状态匹配',
      weight: WEIGHTS.intensity,
      score: intensityScore,
      note: '与你最近的状态契合度',
    },
  ];

  // 目的地吸引力修正：默认偏向更有内容的目的地；
  // 但用户明确要「小众探索」时反过来，让冷门城市浮上来。
  const appeal = appealOf(dest.id);
  const wantNiche = new Set(a.interests).has('niche');
  // 反转力度刻意做小：选「小众探索」的人要的是「有价值但人少」，
  // 不是「随便一个没听过的地方」，所以冷门城市只是有机会，不是直接反超。
  const appealAdj = wantNiche ? 1.02 - appeal * 0.18 : 0.85 + appeal * 0.15;

  const score = Math.round(
    factors.reduce((sum, f) => sum + f.score * f.weight, 0) * 100 * appealAdj,
  );

  return {
    destination: dest,
    score,
    factors,
    reasons: buildReasons(dest, a, { days, estMid, budget, hitTags, transport, dislikeScore }),
    cautions: buildCautions(dest, a, hitAnti, transport),
    estBudget: { low: estLow, high: estHigh },
    suggestDays: clamp(days, min, max),
    transport,
    seasonNote: seasonScore === 1 ? '当月是最佳季节' : '当月季节一般，仍可出行',
    intensity: dest.intensity,
  };
}

function buildReasons(
  dest: Destination,
  a: QuizAnswers,
  ctx: {
    days: number;
    estMid: number;
    budget: number;
    hitTags: string[];
    transport: { hours: number; cost: number; mode: TransportMode };
    dislikeScore: number;
  },
): string[] {
  const out: string[] = [];
  const { min, max } = dest.idealDays;
  if (ctx.days >= min && ctx.days <= max) out.push(`${ctx.days} 天足够，不赶也不空`);
  else if (ctx.days > max) out.push(`${ctx.days} 天可以从容展开，还能留一天发呆`);
  else out.push(`${ctx.days} 天可覆盖核心区域`);

  if (ctx.dislikeScore > 0.8) out.push('基本避开了你最不想要的部分');
  if (a.dislikes.includes('planning')) out.push('不需要高强度规划，边走边决定也成立');
  if (a.dislikes.includes('rush') && dest.intensity !== 'high') out.push('不用天天赶行程');
  if (dest.tags.includes('citywalk') && dest.tags.includes('nature'))
    out.push('城市 + 自然兼顾');
  if (dest.tags.includes('coffee') && dest.tags.includes('food')) out.push('咖啡和美食都丰富');
  if (dest.tags.includes('niche') && a.interests.includes('niche')) out.push('小众地点够多');
  if (a.pace === 'free' || a.pace === 'focused') out.push('可以保留大量自由时间');
  if (ctx.estMid < ctx.budget * 0.85) out.push('预计花费低于预算，有余量');
  if (ctx.transport.hours <= 3) out.push(`从${a.origin}出发 ${ctx.transport.hours} 小时内到达`);
  if (ctx.hitTags.length) out.push(`契合你的${ctx.hitTags.length}个兴趣方向`);
  return out.slice(0, 6);
}

function buildCautions(
  dest: Destination,
  a: QuizAnswers,
  hitAnti: string[],
  transport: { hours: number; cost: number; mode: TransportMode },
): string[] {
  const out = [...dest.cautions];
  if (hitAnti.includes('crowds')) out.push('热门时段人流较大');
  if (hitAnti.includes('highCost')) out.push('整体消费水平偏高');
  if (transport.hours > 5) out.push(`单程交通约 ${transport.hours} 小时，路上较久`);
  if (a.dislikes.includes('earlyRise') && dest.tags.includes('nature'))
    out.push('部分自然景点需要早起才好玩');
  return Array.from(new Set(out)).slice(0, 3);
}

/** Decision Engine：结构化评分排序后只取 Top 3（不把推荐完全交给 LLM） */
/**
 * 完整候选池：手工精修的目的地 + 国内全部地级市（388 个，来自高德行政区划）
 * 同名时保留手工精修版本，因为画像更细。
 */
let poolCache: Destination[] | null = null;
export function fullDestinationPool(): Destination[] {
  if (poolCache) return poolCache;
  const manualNames = new Set(
    DESTINATIONS.filter((d) => d.scope === 'domestic').map((d) => d.name),
  );
  const cn = allCnDestinations().filter((d) => !manualNames.has(d.name));
  poolCache = [...DESTINATIONS, ...cn];
  return poolCache;
}

/**
 * 便宜的粗筛分：只算「兴趣命中」和「季节」两项。
 * 池子接近 400 个时先用它砍到 80 个，再做完整九因子精算，
 * 避免每次推荐都跑几百次 transportEstimate（里面有 hypot）。
 */
function roughScore(d: Destination, a: QuizAnswers, month: number): number {
  const interests = new Set(a.interests);
  const hit = interests.size
    ? d.tags.filter((t) => interests.has(t)).length / interests.size
    : 0.5;
  const seasonOk = d.bestSeasons.includes(month) ? 1 : 0.35;
  // 粗筛阶段就带上吸引力，避免 300 个普通地级市把精修目的地挤出候选
  const appeal = appealOf(d.id);
  return (hit * 0.6 + seasonOk * 0.25 + appeal * 0.15);
}

/** 决策引擎：结构化评分排序后只取 Top N（不把推荐完全交给 LLM） */
export function recommend(answers: QuizAnswers, month: number, topN = 3): ScoredDestination[] {
  const scope = answers.destinationScope ?? 'any';
  const pool = fullDestinationPool().filter((d) => {
    if (scope === 'domestic') return d.scope === 'domestic';
    if (scope === 'international') return d.scope === 'international';
    return true;
  });

  const candidates =
    pool.length > 80
      ? pool
          .map((d) => ({ d, s: roughScore(d, answers, month) }))
          .sort((x, y) => y.s - x.s)
          .slice(0, 80)
          .map((x) => x.d)
      : pool;

  return candidates
    .map((d) => scoreDestination(d, answers, month))
    .sort((x, y) => y.score - x.score)
    .slice(0, topN);
}

// ── 旅行类型 ────────────────────────────────────────────────
export function travelType(a: QuizAnswers): TravelTypeResult {
  const i = new Set(a.interests);
  const d = new Set(a.dislikes);
  let code: TravelTypeResult['code'] = 'relaxed';

  if (a.pace === 'free' || (d.has('planning') && a.pace !== 'intense')) code = 'freeSpirit';
  else if (a.pace === 'intense' || a.interests.length >= 8) code = 'efficient';
  else if (i.has('citywalk') || (i.has('coffee') && i.has('art'))) code = 'wanderer';
  else if (a.travelMood === 'reward' && (a.budget === 'b4' || a.budget === 'b5')) code = 'comfort';
  else if (a.companions === 'friends' || a.companions === 'group') code = 'social';
  else if (a.travelMood === 'tired' || a.travelMood === 'escape' || a.travelMood === 'alone')
    code = 'relaxed';

  const base: Record<TravelTypeResult['code'], TravelTypeResult> = {
    relaxed: {
      code: 'relaxed',
      name: '松弛探索型',
      emoji: '🌿',
      tagline: '你不是不想玩，你只是不想被行程追着跑。',
      metrics: { planning: 30, intensity: 28, freedom: 82, spontaneity: 74 },
      fit: ['城市漫游', '海岛', '温泉', '小众城市'],
      avoid: ['一天五个打卡点', '早起赶车'],
    },
    efficient: {
      code: 'efficient',
      name: '高效探索型',
      emoji: '⚡',
      tagline: '来都来了，想把值得的都看一遍。',
      metrics: { planning: 78, intensity: 85, freedom: 42, spontaneity: 35 },
      fit: ['大城市', '博物馆线', '多城市串联'],
      avoid: ['一天只去一个地方', '大量留白'],
    },
    wanderer: {
      code: 'wanderer',
      name: '城市漫游型',
      emoji: '🚶',
      tagline: '最好的部分通常不在清单上。',
      metrics: { planning: 45, intensity: 50, freedom: 70, spontaneity: 66 },
      fit: ['老城区', '咖啡与书店', '建筑散步', '街区市集'],
      avoid: ['纯自然景区', '长距离拉车'],
    },
    freeSpirit: {
      code: 'freeSpirit',
      name: '低规划自由型',
      emoji: '🕊️',
      tagline: '计划赶不上心情，随缘也是一种安排。',
      metrics: { planning: 18, intensity: 38, freedom: 92, spontaneity: 90 },
      fit: ['小城', '海岛', '温泉', '一个地方待久一点'],
      avoid: ['需要预约的密集行程', '多城市移动'],
    },
    comfort: {
      code: 'comfort',
      name: '犒赏享受型',
      emoji: '🎁',
      tagline: '这次的重点是让自己舒服。',
      metrics: { planning: 52, intensity: 40, freedom: 62, spontaneity: 48 },
      fit: ['度假酒店', '温泉', '好餐厅', '轻行程城市'],
      avoid: ['高强度拉练', '廉价交通组合'],
    },
    social: {
      code: 'social',
      name: '热闹同行型',
      emoji: '🎉',
      tagline: '重要的不是去哪，是跟谁一起。',
      metrics: { planning: 60, intensity: 66, freedom: 55, spontaneity: 62 },
      fit: ['夜生活', '美食街', '主题乐园', '拍照点'],
      avoid: ['安静的独自行程', '过于小众的目的地'],
    },
  };

  const result = { ...base[code] };
  if (a.pace === 'free') result.metrics.freedom = Math.min(100, result.metrics.freedom + 12);
  if (a.dislikes.includes('earlyRise')) result.metrics.intensity = Math.max(10, result.metrics.intensity - 10);
  if (a.duration === 'd10p') result.metrics.intensity = Math.max(10, result.metrics.intensity - 8);
  if (a.companions === 'solo') result.metrics.spontaneity = Math.min(100, result.metrics.spontaneity + 10);
  return result;
}
