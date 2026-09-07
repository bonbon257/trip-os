import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@/services/store';
import { geoKmBetween } from '@/services/route';
import type { Candidate } from '@/components/decision/CandidateCard';
import type { Place } from '@/types';
import type { CityCenter } from '@/hooks/useCityCenter';
import { isWeekendCandidate } from './weekendQuality';

/**
 * 周末候选生成（Weekend Context 专用）
 * ────────────────────────────────────────────────────────────
 *
 * 抽出来的原因：周末有多个探索入口（去哪玩 / 附近 / 吃什么 / 玩什么 / 商圈 /
 * 随机），它们共用同一套「真实 POI 搜索 → 距离 → 理由 → 候选」逻辑。
 * 之前这套逻辑只写在 WeekendPage 里，导致其它入口只能复制或留空壳。
 *
 * 数据源：全部来自高德 POI（真实），不读旅行的静态目的地池。
 * 距离基准：useCityCenter（定位 → 地理编码），拿不到就承认不知道。
 */

const CATEGORY_EMOJI: Record<string, string> = {
  咖啡: '☕',
  美食: '🍜',
  餐厅: '🍜',
  小吃: '🥟',
  展览: '🖼️',
  公园: '🌳',
  景点: '🏞️',
  商圈: '🏬',
  商场: '🏬',
  购物: '🛍️',
  酒吧: '🍸',
  茶馆: '🍵',
  书店: '📚',
  电影: '🎬',
};

const SUGGEST_MIN: Record<string, number> = {
  咖啡: 90,
  美食: 90,
  餐厅: 90,
  小吃: 60,
  展览: 120,
  公园: 120,
  景点: 150,
  商圈: 150,
  商场: 150,
  购物: 120,
};

/**
 * 高德 POI 分类码（types 参数）。
 * 比关键词更准：「050000」一锤定音「餐饮」而不是靠「美食/餐厅/小吃」猜。
 * 来源：高德开放平台官方分类码表（POI 分类编码 v2.0）。
 */
const CATEGORY_TYPES: Record<string, string> = {
  美食: '050000',
  餐厅: '050000',
  小吃: '050000',
  咖啡: '050500', // 餐饮服务 - 咖啡厅
  茶饮: '050300',
  酒吧: '050100',
  展览: '140000', // 科教文化服务
  博物馆: '140100',
  公园: '110101', // 风景名胜 - 公园
  景点: '110000', // 风景名胜
  商圈: '060101', // 购物 - 商场
  商场: '060101',
  购物: '060000',
  书店: '140500',
};

function typesFor(keyword: string): string | undefined {
  return CATEGORY_TYPES[keyword];
}

export function emojiForCategory(kw: string): string {
  return CATEGORY_EMOJI[kw] ?? '📍';
}

/** 理由必须基于真实数据（距离 / 类别），不编造天气、人流、评分 */
function reasonFor(keyword: string, name: string, km?: number): string {
  const d = typeof km === 'number' ? `离你 ${km.toFixed(1)} km` : '距离未知';
  switch (keyword) {
    case '咖啡':
      return `想坐下来待一会儿的话这里合适，${d}，不用赶。`;
    case '美食':
    case '餐厅':
    case '小吃':
      return `想吃点不一样的就来这儿，${d}，吃完还能顺便逛逛。`;
    case '展览':
      return `室内，不受天气影响，${d}。适合慢悠悠看。`;
    case '公园':
      return `不想太累就来这儿，${d}，想走走就走走、想坐就坐。`;
    case '景点':
      return `想认真玩一玩的话选这里，${d}，值得花半天。`;
    case '商圈':
    case '商场':
    case '购物':
      return `想逛就逛、想吃就吃，${d}，一个地方全解决。`;
    default:
      return `${name}：${d}，走一趟不累。`;
  }
}

interface PoiCandidate {
  id: string;
  name: string;
  address: string;
  lng: number;
  lat: number;
  type: string;
  /** 高德 /place/around 返回的米数；/place/text 没有 */
  distance?: number;
  openTime?: string;
}

/**
 * 搜一次 POI。
 *
 * 有精确坐标（location source） → 用 /around（按 location+radius 查周边，**真附近**）
 * 没坐标                        → 用 /text（按城市+关键词查，**城市级**）
 * 高德偶发 502 / 限流时单关键词重试一次。
 */
async function searchPoi(
  city: string,
  keywords: string,
  center: CityCenter | null,
): Promise<PoiCandidate[]> {
  const once = async (): Promise<PoiCandidate[]> => {
    if (center) {
      const types = typesFor(keywords);
      const res = await fetch('/api/map/around', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: `${center.lng},${center.lat}`,
          radius: 5000,
          keywords: keywords || undefined,
          ...(types ? { types } : {}),
          pageSize: 8,
        }),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { ok: boolean; pois?: PoiCandidate[] };
      return data.ok ? (data.pois ?? []) : [];
    }
    const types = typesFor(keywords);
    const res = await fetch('/api/map/poi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        city,
        keywords,
        ...(types ? { types } : {}),
        pageSize: 5,
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { ok: boolean; pois?: PoiCandidate[] };
    return data.ok ? (data.pois ?? []) : [];
  };
  try {
    const first = await once();
    if (first.length > 0) return first;
    await new Promise((r) => setTimeout(r, 300));
    return await once();
  } catch {
    return [];
  }
}

export interface UseWeekendCandidatesOptions {
  /** POI 搜索关键词；random=true 时从中随机挑一个 */
  keywords: string[];
  /** 随机模式：只抽一个关键词（大转盘用） */
  random?: boolean;
  /** 只想看附近：过滤掉过远的候选（km） */
  maxKm?: number;
  /** 噪声种子，变一下就能「换一批」 */
  nonce?: number;
}

export interface WeekendCandidatesResult {
  candidates: Candidate[];
  loading: boolean;
  error: string | null;
  /** 拿不到真实数据时为 true —— UI 必须说明「现在没有实时数据」 */
  degraded: boolean;
  /** 数据来源——告诉 UI 这是「实时附近」还是「城市级」 */
  source: CityCenter['source'] | 'random';
  reload: () => void;
}

export function useWeekendCandidates(
  opts: UseWeekendCandidatesOptions,
  center: CityCenter | null,
): WeekendCandidatesResult {
  const { keywords, random, maxKm, nonce = 0 } = opts;
  const homeCity = useStore((s) => s.settings.homeCity);

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const key = keywords.join('|');

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pool = key ? key.split('|') : [];
      const picked = random ? [pool[Math.floor(Math.random() * pool.length)]!] : pool;
      const collected: Candidate[] = [];

      /**
       * 逐个关键词搜，凑够 3 个就停。
       * 高德 Web 服务有 QPS 限制，连续发多个请求偶尔返回 502，
       * 所以：请求间隔 150ms + 凑够 3 个早停 + 单关键词失败重试一次。
       */
      const seen = new Set<string>();
      for (const kw of picked) {
        if (collected.length >= 3) break;
        if (collected.length > 0 || kw !== picked[0]) {
          await new Promise((r) => setTimeout(r, 150));
        }
        const pois = await searchPoi(homeCity, kw, center);
        for (const p of pois.slice(0, 2)) {
          if (collected.length >= 3) break;
          // 真实 POI 也要过周末质量门槛，避免小区 / 花园 / 居民楼 等混进推荐
          if (!isWeekendCandidate({ name: p.name, category: p.type || kw })) continue;
          // 不同关键词可能返回同一 POI（「美食」「餐厅」都命中同一餐厅），按 id 去重
          if (seen.has(p.id)) continue;
          if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat)) continue;
          if (Math.abs(p.lng) < 0.001 || Math.abs(p.lat) < 0.001) continue;
          seen.add(p.id);
          // 高德 /around 直接给出距 location 的米数；/text 时用球面距离推算
          const km =
            typeof p.distance === 'number'
              ? p.distance / 1000
              : center
                ? geoKmBetween(center, { lat: p.lat, lng: p.lng }) ?? undefined
                : undefined;
          collected.push({
            id: `poi-${p.id}`,
            name: p.name,
            emoji: emojiForCategory(kw),
            address: p.address,
            reason: reasonFor(kw, p.name, km),
            distanceKm: km,
            suggestedMin: SUGGEST_MIN[kw] ?? 90,
            lat: p.lat,
            lng: p.lng,
          });
        }
      }

      if (collected.length === 0) {
        setError(
          '没搜到附近的地方。可能没配置高德 Web 服务 Key，或者这个城市暂时搜不到——去「设置」里配一下再试。',
        );
        setCandidates([]);
        return;
      }

      let top = collected.slice(0, 8);
      if (typeof maxKm === 'number') {
        top = top.filter((c) => typeof c.distanceKm !== 'number' || c.distanceKm <= maxKm);
      }
      setCandidates(markRecommended(top.slice(0, 3)));
    } finally {
      setLoading(false);
    }
  }, [key, random, maxKm, homeCity, center?.lat, center?.lng, center?.source, nonce, tick]);

  useEffect(() => {
    void generate();
  }, [generate]);

  return {
    candidates,
    loading,
    error,
    degraded: !center,
    source: center?.source ?? 'random',
    reload: () => setTick((t) => t + 1),
  };
}

/** 明确推荐一个：离你最近的那个（真实距离，不编造） */
export function markRecommended(list: Candidate[]): Candidate[] {
  if (list.length === 0) return list;
  let bestIdx = 0;
  let best = Infinity;
  list.forEach((c, i) => {
    const k = typeof c.distanceKm === 'number' ? c.distanceKm : Infinity;
    if (k < best) {
      best = k;
      bestIdx = i;
    }
  });
  return list.map((c, i) => (i === bestIdx ? { ...c, recommended: true } : c));
}

/** 把候选落成 Place（加入周末计划前需要） */
export function candidateToPlace(
  c: Candidate,
  ctx: { city: string; destinationId?: string },
): Place {
  return {
    id: c.id,
    destinationId: ctx.destinationId ?? ctx.city,
    name: c.name,
    category: 'other',
    x: ((c.lng ?? 0) + 180) / 3.6,
    y: (90 - (c.lat ?? 0)) / 1.8,
    lat: c.lat,
    lng: c.lng,
    address: c.address,
    avgCost: 0,
    durationMin: c.suggestedMin ?? 90,
    tags: [],
    indoor: false,
    emoji: c.emoji ?? '📍',
  };
}

/** 「从收藏中选」：读用户标记过想去的地方，不发请求 */
export function savedCandidates(db: {
  placeStates?: Array<{ placeId: string; status: string; containerType: string; containerId: string }>;
  trips?: Array<{ id: string }>;
  weekendDiscoveredPlaces?: Place[];
}): Candidate[] {
  const wanted = (db.placeStates ?? []).filter((s) => s.status === 'WANTED');
  return wanted.slice(0, 3).map((s) => {
    let name = s.placeId;
    const disc = db.weekendDiscoveredPlaces?.find((p) => p.id === s.placeId);
    if (disc) name = disc.name;
    return {
      id: s.placeId,
      name,
      emoji: '⭐',
      reason: '你自己标记过想去的地方。',
      lat: disc?.lat,
      lng: disc?.lng,
      distanceKm: undefined,
    };
  });
}
