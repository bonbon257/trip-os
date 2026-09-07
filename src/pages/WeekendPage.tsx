import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useStore } from '@/services/store';
import { findPlace } from '@/data/places';
import { geoKmBetween } from '@/services/route';
import { CandidateCard, type Candidate } from '@/components/decision/CandidateCard';
import { ContextHint, contextHintFromQuery } from '@/components/decision/ContextHint';
import { Button, Card, Chip, Section, toast } from '@/components/ui';
import { addMinutes, fmtMDWeek, upcomingSaturday } from '@/utils/date';
import { detectEnergy, detectWeekendMode } from '@/utils/weekendMode';
import { useCityCenter } from '@/hooks/useCityCenter';
import type { Place } from '@/types';

/**
 * /weekend —— 周末出行（正式场景，不是旅行的缩小版）
 *
 * 原则（对应需求第十一节）：
 *   · 默认轻量：只输出「少量候选 + 为什么」，不生成完整行程。
 *   · 默认出口是行动（直接去），不是计划。
 *   · 规划是可选的：用户说「帮我安排一下」才展开地图 / 路线 / 时间。
 *   · 不编造数据：没有天气 provider 就不提天气；POI 来自真实高德搜索。
 */

/**
 * 四种模式对应不同的真实搜索策略：
 *   place    → 地点导向：公园 / 景点 / 商圈（先找个地方）
 *   activity → 活动导向：咖啡 / 美食 / 展览（先定件想做的事）
 *   nearby   → 综合一圈，什么都来一点
 *   saved    → 不发请求，读用户标记过「想去」的地点
 */
const MODE_KEYWORDS: Record<string, string[]> = {
  place: ['公园', '景点', '商圈'],
  activity: ['咖啡', '美食', '展览'],
  nearby: ['咖啡', '公园', '展览'],
};

const MODE_TITLE: Record<string, string> = {
  place: '这几个地方可以去',
  activity: '这几件事可以做',
  nearby: '附近这些',
  saved: '你标记过想去的',
};

/** 理由必须基于真实数据（距离 / 类别 / 是否室内），不编造天气、人流、活动 */
function reasonFor(keyword: string, name: string, km?: number): string {
  const d = typeof km === 'number' ? `离市中心 ${km.toFixed(1)} km` : '就在城里';
  switch (keyword) {
    case '咖啡':
      return `想坐下来待一会儿的话这里合适，${d}，不用赶。`;
    case '美食':
      return `想吃点不一样的就来这儿，${d}，吃完还能顺便逛逛。`;
    case '展览':
      return `室内，不受天气影响，${d}。适合慢悠悠看。`;
    case '公园':
      return `不想太累就来这儿，${d}，想走走就走走、想坐就坐。`;
    case '景点':
      return `想认真玩一玩的话选这里，${d}，值得花半天。`;
    case '商圈':
      return `想逛就逛、想吃就吃，${d}，一个地方全解决。`;
    default:
      return `${name}：${d}，走一趟不累。`;
  }
}

const emojiFor = (kw: string) =>
  kw === '咖啡'
    ? '☕'
    : kw === '美食'
      ? '🍜'
      : kw === '展览'
        ? '🖼️'
        : kw === '公园'
          ? '🌳'
          : kw === '景点'
            ? '🏞️'
            : '🏬';

interface PoiCandidate {
  id: string;
  name: string;
  address: string;
  lng: number;
  lat: number;
  type: string;
}

/**
 * 搜一次 POI。失败或空结果时重试一次（高德偶发 502 / 限流），
 * 仍拿不到就返回空数组 —— 不让单个关键词拖垮整页。
 */
async function searchPoi(city: string, keywords: string): Promise<PoiCandidate[]> {
  const once = async (): Promise<PoiCandidate[]> => {
    const res = await fetch('/api/map/poi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city, keywords, pageSize: 5 }),
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

export function WeekendPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const weekendOf = params.get('w') ?? upcomingSaturday();
  const q = params.get('q') ?? '';
  const energyParam = params.get('energy') ?? '';
  const mode = params.get('mode') ?? (q ? detectWeekendMode(q) : 'place');
  const energy = (energyParam || (q ? detectEnergy(q) : null)) as 'near' | 'far' | null;

  const hint = contextHintFromQuery(q);

  const db = useStore((s) => s.db);
  const homeCity = useStore((s) => s.settings.homeCity);
  const createWeekendPlan = useStore((s) => s.createWeekendPlan);
  const updateWeekendPlan = useStore((s) => s.updateWeekendPlan);
  const setPlaceState = useStore((s) => s.setPlaceState);
  const addDiscoveredPlace = useStore((s) => s.addDiscoveredPlace);

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [arranging, setArranging] = useState(false);

  const plan = db.weekendPlans?.find((p) => p.weekendOf === weekendOf);
  /**
   * 周末侧的城市中心：已授权定位 → AMap /ip → homeCity 地理编码 → null。
   * 不再查旅行目的地池 DESTINATIONS（只有 21 条，默认城市不在其中，
   * 会让距离恒为 undefined、推荐理由退化成「就在城里」）。
   */
  const { center: cityCenter } = useCityCenter();

  // ── 候选生成 ──────────────────────────────────────────────
  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPicked(null);

    try {
      // 1) 从收藏中选：读用户标记过「想去」的地点（真实数据，不发请求）
      if (mode === 'saved') {
        const wanted = (db.placeStates ?? []).filter((s) => s.status === 'WANTED');
        const list: Candidate[] = wanted.slice(0, 3).map((s) => {
          let name = s.placeId;
          let lat: number | undefined;
          let lng: number | undefined;
          if (s.containerType === 'TRIP') {
            const trip = db.trips.find((t) => t.id === s.containerId);
            const p = trip ? findPlace(trip, s.placeId) : undefined;
            if (p) {
              name = p.name;
              lat = p.lat;
              lng = p.lng;
            }
          }
          const disc = db.weekendDiscoveredPlaces?.find((p) => p.id === s.placeId);
          if (disc) {
            name = disc.name;
            lat = disc.lat;
            lng = disc.lng;
          }
          const km =
            cityCenter && lat && lng
              ? geoKmBetween({ lat: cityCenter.lat, lng: cityCenter.lng }, { lat, lng }) ?? undefined
              : undefined;
          return {
            id: s.placeId,
            name,
            emoji: '⭐',
            reason: `你自己标记过想去的地方${typeof km === 'number' ? `，离市中心 ${km.toFixed(1)} km` : ''}。`,
            distanceKm: km,
            lat,
            lng,
          };
        });
        if (list.length === 0) {
          setError('还没有标记「想去」的地方。先去 Discover 或行程页收几个。');
        }
        setCandidates(markRecommended(list));
        return;
      }

      // 2) 去哪玩 / 做什么 / 附近 / 随便：真实 POI 搜索（高德）
      const pool = MODE_KEYWORDS[mode] ?? MODE_KEYWORDS.place;
      const keywords =
        mode === 'random' ? [pool[Math.floor(Math.random() * pool.length)]] : pool;
      const collected: Candidate[] = [];

      /**
       * 逐个关键词搜，凑够 3 个就停。
       *
       * 为什么要节流 + 早停 + 重试：高德 Web 服务有 QPS 限制，连续发多个请求
       * 偶尔会返回 502。实测单个关键词都能正常返回，所以这里：
       *   · 请求之间留 150ms 间隔
       *   · 凑够 3 个候选就停止（通常只需 2 次请求，也省配额）
       *   · 单个关键词失败重试一次，仍失败就跳过，不影响其它关键词
       */
      for (const kw of keywords) {
        if (collected.length >= 3) break;
        if (collected.length > 0 || kw !== keywords[0]) {
          await new Promise((r) => setTimeout(r, 150));
        }
        const pois = await searchPoi(homeCity, kw);
        for (const p of pois.slice(0, 2)) {
          if (collected.length >= 3) break;
          if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat)) continue;
          if (Math.abs(p.lng) < 0.001 || Math.abs(p.lat) < 0.001) continue;
          const km =
            cityCenter && p.lat && p.lng
              ? geoKmBetween({ lat: cityCenter.lat, lng: cityCenter.lng }, { lat: p.lat, lng: p.lng }) ?? undefined
              : undefined;
          collected.push({
            id: `poi-${p.id}`,
            name: p.name,
            emoji: emojiFor(kw),
            address: p.address,
            reason: reasonFor(kw, p.name, km),
            distanceKm: km,
            suggestedMin: kw === '咖啡' || kw === '美食' ? 90 : kw === '公园' ? 120 : 100,
            lat: p.lat,
            lng: p.lng,
          });
        }
      }

      if (collected.length === 0) {
        setError(
          '没有搜到附近的地方。可能还没配置高德 Web 服务 Key，或者这个城市暂时搜不到——去「设置」里配一下 Key 再试。',
        );
        setCandidates([]);
        return;
      }

      let top = collected.slice(0, 8);
      if (energy === 'near') {
        top = top.filter((c) => typeof c.distanceKm !== 'number' || c.distanceKm <= 5);
      } else if (energy === 'far') {
        top = top.slice().sort((a, b) => (b.distanceKm ?? 0) - (a.distanceKm ?? 0));
      }
      setCandidates(markRecommended(top.slice(0, 3)));
    } finally {
      setLoading(false);
    }
  }, [mode, homeCity, db.placeStates, db.trips, db.weekendDiscoveredPlaces, cityCenter, energy]);

  useEffect(() => {
    void generate();
  }, [generate]);

  // ── 选中之后的三个出口 ────────────────────────────────────
  const toPlace = (c: Candidate): Place => ({
    id: c.id,
    destinationId: homeCity,
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
  });

  /** 直接去 —— 打开高德导航，不创建任何计划 */
  const goNow = (c: Candidate) => {
    if (typeof c.lng !== 'number' || typeof c.lat !== 'number') {
      toast('这个地点没有精确坐标，导不了航', 'warn');
      return;
    }
    const url = `https://uri.amap.com/marker?position=${c.lng},${c.lat}&name=${encodeURIComponent(c.name)}&src=tripos&coordinate=gaode&callnative=1`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  /** 加入周末计划 —— 落地为 WeekendPlan + PlaceState */
  const addToPlan = (c: Candidate) => {
    const planId = createWeekendPlan({ weekendOf, homeCity });
    addDiscoveredPlace(toPlace(c), 'WEEKEND');
    const current = useStore.getState().db.weekendPlans.find((w) => w.id === planId);
    const placeIds = current?.placeIds.includes(c.id) ? current.placeIds : [...(current?.placeIds ?? []), c.id];
    updateWeekendPlan(planId, { placeIds, status: 'planned' });
    setPlaceState({ containerType: 'WEEKEND', containerId: planId, placeId: c.id, status: 'WANTED' });
    toast('已经放进这周末的计划里', 'default');
    setPicked(c);
  };

  /** 根据地点类型和距离，给出轻量安排建议（不调用真实路径规划 API） */
  const suggestArrangement = (c: Candidate) => {
    const kw = c.emoji ?? '';
    const start: Record<string, string> = {
      '🌳': '09:30',
      '🏞️': '09:30',
      '☕': '14:00',
      '🍜': '11:30',
      '🖼️': '10:00',
      '🏬': '14:00',
    };
    const departure = start[kw] ?? '14:00';
    const km = c.distanceKm ?? 3;

    const mode: 'walk' | 'ride' | 'transit' | 'drive' =
      km < 1 ? 'walk' : km < 3 ? 'ride' : km < 8 ? 'transit' : 'drive';
    const travelMin = Math.max(10, Math.round(km * (mode === 'walk' ? 12 : mode === 'ride' ? 4 : mode === 'transit' ? 6 : 2.5)));
    const modeText = { walk: '步行', ride: '骑行', transit: '公交 / 地铁', drive: '驾车' }[mode];
    const arrival = addMinutes(departure, travelMin);
    const stay = c.suggestedMin ?? 90;
    const leave = addMinutes(arrival, stay);

    return { departure, arrival, leave, stay, travelMin, mode, modeText };
  };

  /** 打开高德路线规划 */
  const openRoute = (c: Candidate) => {
    if (typeof c.lng !== 'number' || typeof c.lat !== 'number') {
      toast('这个地点没有精确坐标，无法规划路线', 'warn');
      return;
    }
    const { mode } = suggestArrangement(c);
    const amapMode = { walk: '2', ride: '3', transit: '1', drive: '0' }[mode];
    const url = `https://uri.amap.com/route/plan/?sid=&did=&dlat=${c.lat}&dlng=${c.lng}&dname=${encodeURIComponent(c.name)}&dev=0&t=${amapMode}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      <section className="sticky-note px-5 py-6 sm:px-8 sm:py-8">
        <p className="label">周末</p>
        <h1 className="h1 mt-2">这周末去哪？</h1>
        <p className="muted mt-2">
          {fmtMDWeek(weekendOf)} · {homeCity}
          {plan ? ` · ${plan.placeIds.length} 个地方在计划里` : ' · 还没想好'}
        </p>

        {hint && (
          <div className="mt-4">
            <ContextHint
              q={hint.q}
              route={hint.route}
              onClear={() => {
                const next = new URLSearchParams(params);
                next.delete('q');
                next.delete('energy');
                setParams(next, { replace: true });
              }}
            />
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
            {(
              [
                ['place', '去哪玩'],
                ['activity', '做什么'],
                ['nearby', '附近看看'],
                ['saved', '从收藏中选'],
              ] as const
            ).map(([m, label]) => (
            <Chip
              key={m}
              active={mode === m}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('mode', m);
                setParams(next);
              }}
            >
              {label}
            </Chip>
          ))}
        </div>
      </section>

      <Section
        title={MODE_TITLE[mode] ?? '这几个更适合你'}
        hint="最多三个，每个都说明了为什么"
        action={
          <Button size="sm" onClick={() => void generate()} disabled={loading}>
            {loading ? '找着…' : '换一批'}
          </Button>
        }
      >
        {loading && <Card className="p-4"><p className="muted">正在找…</p></Card>}

        {!loading && error && (
          <Card className="p-4">
            <p className="text-[13px]">{error}</p>
          </Card>
        )}

        {!loading && !error && candidates.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            {candidates.map((c) => (
              <CandidateCard key={c.id} c={c} onPick={setPicked} actionLabel="就这个" />
            ))}
          </div>
        )}
      </Section>

      {picked && (
        <Section title={`下一步：${picked.name}`} hint="规划是可选的，想直接走也行">
          <Card className="flex flex-wrap items-center gap-2 p-4">
            <Button variant="primary" onClick={() => goNow(picked)}>
              直接去
            </Button>
            <Button onClick={() => addToPlan(picked)}>加入周末计划</Button>
            <Button variant={arranging ? 'soft' : 'secondary'} onClick={() => setArranging((v) => !v)}>
              {arranging ? '收起安排' : '帮我安排一下'}
            </Button>
            <span className="muted ml-auto text-[11.5px]">
              默认不生成行程——周末不用被计划追着跑。
            </span>
          </Card>

          {arranging && (
            <Card className="mt-3 space-y-3 p-4">
              {(() => {
                const a = suggestArrangement(picked);
                return (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border-[1.5px] border-ink/15 bg-paperDeep p-3">
                        <p className="text-[11px] font-bold text-inkFaint">建议出发</p>
                        <p className="mt-1 text-[15px] font-extrabold">{fmtMDWeek(weekendOf)} {a.departure}</p>
                      </div>
                      <div className="rounded-xl border-[1.5px] border-ink/15 bg-paperDeep p-3">
                        <p className="text-[11px] font-bold text-inkFaint">路上 / 到达</p>
                        <p className="mt-1 text-[15px] font-extrabold">{a.modeText} · 约 {a.travelMin} min</p>
                        <p className="text-[12px] text-inkSoft">{a.arrival} 到</p>
                      </div>
                      <div className="rounded-xl border-[1.5px] border-ink/15 bg-paperDeep p-3">
                        <p className="text-[11px] font-bold text-inkFaint">停留 / 结束</p>
                        <p className="mt-1 text-[15px] font-extrabold">约 {a.stay} min</p>
                        <p className="text-[12px] text-inkSoft">{a.leave} 离开</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="primary" size="sm" onClick={() => openRoute(picked)}>
                        打开高德路线规划
                      </Button>
                      <Button size="sm" onClick={() => addToPlan(picked)}>
                        把这个安排加入计划
                      </Button>
                    </div>
                    <p className="text-[11.5px] text-inkFaint">
                      时间是按距离和类型估算的，路上实际用时以高德为准。
                    </p>
                  </>
                );
              })()}
            </Card>
          )}
        </Section>
      )}

      {plan && plan.placeIds.length > 0 && (
        <Section
          title="这周末的计划"
          hint={fmtMDWeek(weekendOf)}
          action={
            <Button size="sm" variant="primary" onClick={() => navigate(`/weekend/plan?w=${weekendOf}`)}>
              查看完整安排
            </Button>
          }
        >
          <Card className="space-y-2 p-4">
            {plan.placeIds.map((id) => {
              const p = db.weekendDiscoveredPlaces?.find((x) => x.id === id);
              const c = candidates.find((x) => x.id === id);
              return (
                <div key={id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[13.5px] font-bold">
                    {p?.name ?? c?.name ?? id}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => updateWeekendPlan(plan.id, { placeIds: plan.placeIds.filter((x) => x !== id) })}
                  >
                    移出
                  </Button>
                </div>
              );
            })}
          </Card>
        </Section>
      )}
    </div>
  );
}

/** 明确推荐一个：离市中心最近的那个（真实距离，不编造） */
function markRecommended(list: Candidate[]): Candidate[] {
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
