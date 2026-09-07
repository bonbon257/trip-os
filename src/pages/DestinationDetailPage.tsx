import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore } from '@/services/store';
import { recommend, transportEstimate } from '@/services/recommendation';
import { getDestination } from '@/data/destinations';
import { getPlaces, getPlace } from '@/data/places';
import { getGuide } from '@/data/guides';
import { applyPlaybookToTrip } from '@/features/travel/playbookToTrip';
import type { Place, Destination, DestinationHandbook, Trip } from '@/types';
import { PageHeader } from '@/components/layout';
import { Button, Card, EmptyState, Field, Input, ProgressBar, Ring, Section, Sheet, Tag, cx, toast } from '@/components/ui';
import { LifecycleBanner } from '@/components/travel/LifecycleBanner';
import { IntensityBadge } from '@/components/travel/TripBits';
import { AMapView } from '@/components/travel/AMapView';
import type { MapPoint } from '@/components/travel/MockMap';
import { askDestinationQA } from '@/ai/handbook';
import { INTERESTS, DISLIKES, labelOf } from '@/data/taxonomy';
import { money, TRANSPORT_LABEL } from '@/utils/format';
import { addDays, todayISO } from '@/utils/date';
import { cnProvinceOf, cnRegionOf } from '@/data/destinations-cn';
import { weatherForCoords } from '@/services/world/amap';
import type { WeatherDay } from '@/types/decision';
import type { ScoredDestination } from '@/types/decision';
import type { QuizAnswers } from '@/types';

const MONTH_LABEL = ['1 月', '2 月', '3 月', '4 月', '5 月', '6 月', '7 月', '8 月', '9 月', '10 月', '11 月', '12 月'];

const PLAYBOOK_TYPE_LABEL: Record<string, string> = {
  classic: '经典',
  'half-day': '半日',
  'one-day': '一日',
  couple: '情侣',
  friends: '朋友',
  solo: '独处',
  'low-energy': '低能量',
  'high-energy': '高能量',
  food: '美食',
};

const AUDIENCE_LABEL: Record<string, string> = {
  solo: '独自',
  partner: '情侣',
  friends: '朋友',
  family: '亲子',
  colleagues: '同事',
  group: '团队',
  'first-timer': '第一次来',
  any: '所有人',
};

function transportText(mode?: string, min?: number): string | null {
  if (!mode || !min) return null;
  const label = mode === 'taxi' ? '打车' : mode === 'train' ? '地铁/火车' : mode === 'walk' ? '步行' : mode === 'car' ? '自驾' : '前往';
  return `${label}约 ${min} 分钟`;
}

export function DestinationDetailPage() {
  const { destinationId = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const quiz = useStore((s) => s.quiz);
  const discoveredPlaces = useStore((s) => s.db.travelDiscoveredPlaces);
  const addDiscoveredPlace = useStore((s) => s.addDiscoveredPlace);
  const trips = useStore((s) => s.db.trips);
  const createTrip = useStore((s) => s.createTrip);
  const setActiveTrip = useStore((s) => s.setActiveTrip);
  const schedulePlace = useStore((s) => s.schedulePlace);
  const toggleSavePlace = useStore((s) => s.toggleSavePlace);
  const [departDate, setDepartDate] = useState(addDays(todayISO(), 30));
  const [inspectPlace, setInspectPlace] = useState<Place | null>(null);

  const dest = getDestination(destinationId);
  const guide = getGuide(destinationId);

  const scored = useMemo<ScoredDestination | null>(() => {
    if (!dest) return null;
    const fromRecs = (quiz.recs ?? []).find((r) => r.destination.id === dest.id);
    if (fromRecs) return fromRecs;
    if (!quiz.answers?.origin || !quiz.answers.pace) return null;
    const a = quiz.answers;
    if (!(a.travelMood && a.duration && a.budget && a.pace && a.companions && a.destinationScope)) {
      return null;
    }
    const all = recommend(a as QuizAnswers, new Date().getMonth() + 1, 99);
    return all.find((r) => r.destination.id === dest.id) ?? null;
  }, [dest, quiz.answers, quiz.recs]);

  if (!dest) {
    return (
      <EmptyState
        emoji="🗺️"
        title="没有这个目的地"
        desc="它可能还在我们的地图之外。"
        actions={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => navigate('/random')}>再抽一次</Button>
            <Button variant="primary" onClick={() => navigate('/')}>回首页</Button>
          </div>
        }
      />
    );
  }

  // 防御: 字段缺失时也不让整页崩 (下方渲染用 dest.XXX.map 时 all safeties 兜底)
  const safeHighlights = Array.isArray(dest.highlights) ? dest.highlights : [];
  const safePlaybook = Array.isArray(dest.playbook) ? dest.playbook : [];
  const safeCautions = Array.isArray(dest.cautions) ? dest.cautions : [];

  const origin = quiz.answers?.origin ?? '上海';
  const setQuiz = useStore((s) => s.setQuiz);
  const transport = transportEstimate(origin, dest, departDate);
  // 大老远过来：单程超过 4 小时建议多留 1 天缓冲
  const originDayBuffer = transport.hours >= 6 ? 1 : transport.hours >= 4 ? 0 : 0;
  const adjustedMin = dest.idealDays.min + originDayBuffer;
  const adjustedMax = dest.idealDays.max + originDayBuffer;
  const daysParam = Number(params.get('days'));
  const suggestDays = Number.isFinite(daysParam) && daysParam > 0
    ? Math.min(daysParam, adjustedMax)
    : (scored?.suggestDays ?? adjustedMin);
  const budgetParam = Number(params.get('budget'));
  const estBudget = scored?.estBudget ?? {
    low: dest.dailyCost.low * suggestDays,
    high: dest.dailyCost.high * suggestDays,
  };
  const totalBudget = Number.isFinite(budgetParam) && budgetParam > 0
    ? budgetParam
    : Math.round((estBudget.low + estBudget.high) / 2) + transport.cost;

  const places = useMemo(() => {
    if (!dest) return [];
    const curated = getPlaces(dest.id);
    const ids = new Set(curated.map((p) => p.id));
    const extra = (discoveredPlaces ?? []).filter((p) => p.destinationId === dest.id && !ids.has(p.id));
    return [...curated, ...extra].slice(0, 12);
  }, [dest, discoveredPlaces]);
  const bestMonths = dest.bestSeasons.map((m) => MONTH_LABEL[m - 1]);
  const hitInterests = (quiz.answers?.interests ?? []).filter((i) => dest.tags.includes(i));
  const hitDislikes = (quiz.answers?.dislikes ?? []).filter((d) => dest.antiTags.includes(d));

  const provinceLine = (id: string) => {
    const prov = cnProvinceOf(id);
    if (!prov) return '';
    const region = cnRegionOf(id);
    const clean = prov.replace(/省|市|自治区|维吾尔|壮族|回族|特别行政区/g, '');
    return `${clean}${region ? ` · ${region}` : ''} · `;
  };

  // ── 旅行手册 + 问 AI（决策阶段赋能，不依赖 trip）──
  const handbook = dest.handbook;
  const [routeIdx, setRouteIdx] = useState(0);
  const [qaInput, setQaInput] = useState('');
  const [qaReply, setQaReply] = useState<string | null>(null);
  const [qaLoading, setQaLoading] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);

  const buildRoutePoints = (
    route: NonNullable<DestinationHandbook['classicRoutes']>[number],
  ): MapPoint[] => {
    const curated = getPlaces(dest.id);
    return route.stops
      .map((s, i): MapPoint | null => {
        if ('placeId' in s) {
          const p = curated.find((c) => c.id === s.placeId);
          return p ? { place: p, order: i } : null;
        }
        const p: Place = {
          id: `hb-stop-${i}`,
          destinationId: dest.id,
          name: s.name,
          category: 'sight',
          x: 0,
          y: 0,
          lng: s.lng,
          lat: s.lat,
          avgCost: 0,
          durationMin: 0,
          tags: [],
          indoor: false,
          emoji: s.emoji ?? '📍',
          description: '',
        };
        return { place: p, order: i };
      })
      .filter((m): m is MapPoint => m !== null);
  };

  const askQA = async () => {
    const q = qaInput.trim();
    if (!q || qaLoading) return;
    setQaLoading(true);
    setQaError(null);
    try {
      const r = await askDestinationQA(q, dest);
      if (!r) {
        setQaError('还没接入模型，暂不能回答。可在设置页配置 AI Key，或先看作者的手册内容。');
        setQaReply(null);
      } else {
        setQaReply(r);
      }
    } catch {
      setQaError('回答失败了，稍后再试。');
    } finally {
      setQaLoading(false);
    }
  };

  // ── POI 搜索（实时搜高德）──
  const [poiKw, setPoiKw] = useState('博物馆');
  const [poiResults, setPoiResults] = useState<Array<{ id: string; name: string; address: string; lng: number; lat: number; type: string }>>([]);
  const [poiLoading, setPoiLoading] = useState(false);
  const [poiError, setPoiError] = useState<string | null>(null);
  const hasTrip = Boolean(trips.find((t) => t.destinationId === dest.id));
  const searchPOI = async (kw: string) => {
    if (!kw.trim()) return;
    setPoiKw(kw);
    setPoiLoading(true);
    setPoiError(null);
    try {
      const res = await fetch('/api/map/poi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: dest.name, keywords: kw, pageSize: 8 }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        count?: number;
        pois?: Array<{ id: string; name: string; address: string; lng: number; lat: number; type: string }>;
        error?: string;
      };
      if (!data.ok) {
        setPoiError(data.error ?? '搜索失败');
        setPoiResults([]);
      } else {
        setPoiResults(data.pois ?? []);
      }
    } catch (err) {
      setPoiError(err instanceof Error ? err.message : '搜索失败');
    } finally {
      setPoiLoading(false);
    }
  };
  // ── 近期天气（真实高德数据，失败则优雅隐藏）──
  const [weather, setWeather] = useState<WeatherDay[] | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!Number.isFinite(dest.lng) || !Number.isFinite(dest.lat)) return;
    setWeatherLoading(true);
    const dates = Array.from({ length: 4 }, (_, i) => addDays(todayISO(), i));
    void weatherForCoords(dest.lng, dest.lat, dates).then((w) => {
      if (!cancelled) {
        setWeather(w);
        setWeatherLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dest.id, dest.lng, dest.lat]);

  const addPoiToPool = (p: { id: string; name: string; address: string; lng: number; lat: number; type: string }) => {
    // 高德 type 形如 '科教文化服务;博物馆;博物馆'，取最后一段
    const lastType = p.type.split(';').pop() ?? '景点';
    // 把高德的 type 文字（'科教文化服务;博物馆;博物馆'）映射到系统的 ActivityType
    const catMap: Record<string, Place['category']> = {
      美食: 'food',
      咖啡: 'food',          // 咖啡归到 food（系统没有 cafe 类别）
      博物馆: 'culture',
      景点: 'sight',
      公园: 'nature',
      购物: 'shopping',
      酒店: 'stay',
      文化: 'culture',
      娱乐: 'entertainment',
    };
    const place: Place = {
      id: `poi-${p.id}`,
      destinationId: dest.id,
      name: p.name,
      category: catMap[lastType] ?? 'sight',
      x: ((p.lng + 180) / 360) * 100,
      y: ((90 - p.lat) / 180) * 100,
      lat: p.lat,
      lng: p.lng,
      address: p.address,
      avgCost: 0,
      durationMin: 90,
      tags: [lastType],
      indoor: false,
      emoji: lastType === '博物馆' ? '🏺' : lastType === '美食' ? '🍜' : lastType === '咖啡' ? '☕' : lastType === '公园' ? '🌳' : '📍',
      description: p.address,
    };
    addDiscoveredPlace(place, 'TRAVEL');
    toast(`已加入地点池：${p.name}`, 'good');
  };
  // 进入页面时自动跑一次
  useEffect(() => {
    void searchPOI('博物馆');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dest.id]);

  const goCreate = () => {
    // 用户已明确决定「就去这里」，直接创建旅行并跳转工作台，不再经城市选择页
    const existing = trips.find((t) => t.destinationId === dest.id);
    if (existing) {
      setActiveTrip(existing.id);
      navigate(`/trips/${existing.id}/plan`);
      return;
    }

    const endDate = addDays(departDate, Math.max(0, suggestDays - 1));
    const trip = createTrip({
      destinationIds: [dest.id],
      startDate: departDate,
      endDate,
      totalBudget,
      planningPreference: 'auto',
      profile: {
        travelMood: quiz.answers?.travelMood ?? 'change',
        pace: quiz.answers?.pace ?? 'balanced',
        companions: quiz.answers?.companions ?? 'solo',
        interests: quiz.answers?.interests ?? dest.tags.slice(0, 4),
        dislikes: quiz.answers?.dislikes ?? [],
        origin,
        durationDays: suggestDays,
      },
    });
    setActiveTrip(trip.id);
    navigate(`/trips/${trip.id}/plan`);
  };

  const handleApplyPlaybook = (playbookId: string) => {
    const res = applyPlaybookToTrip(dest.id, playbookId);
    setActiveTrip(res.tripId);
    toast(
      `已把 ${res.activityCount} 个地点加入行程${res.skipped ? `（${res.skipped} 个缺少真实数据已跳过）` : ''}`,
      'good',
    );
    navigate(`/trips/${res.tripId}/itinerary`);
  };

  return (
    <div className="space-y-5">
      <LifecycleBanner />
      <PageHeader
        back
        title={`${dest.emoji} ${dest.name}`}
        subtitle={`${provinceLine(dest.id)}${dest.summary}`}
        action={
          <div className="text-right">
            {scored && <Ring value={scored.score} size={64} sub="匹配度" />}
          </div>
        }
      />

      {/* 出发地与关键指标 */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="出发地" hint="改出发地，天数和交通预估会更准" className="flex-1">
            <Input
              value={origin}
              onChange={(e) => setQuiz({ answers: { ...quiz.answers, origin: e.target.value || '上海' } })}
              placeholder="比如：上海、北京、成都"
            />
          </Field>
          <Button size="sm" variant="ghost" onClick={() => setQuiz({ answers: { ...quiz.answers, origin: '上海' } })}>
            重置为上海
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="建议天数" value={`${suggestDays} 天`} hint={`${adjustedMin}–${adjustedMax} 天比较舒服${originDayBuffer ? '（已含出发地缓冲）' : ''}`} />
          <MiniStat label="预计预算" value={`${money(estBudget.low)}–${money(estBudget.high)}`} hint="不含往返大交通" />
          <MiniStat
            label="旅行强度"
            value={dest.intensity === 'low' ? '低' : dest.intensity === 'medium' ? '中' : '高'}
            hint="整体节奏，不是每天"
          />
          <MiniStat
            label={`从${origin}出发`}
            value={`${transport.hours} 小时`}
            hint={`${TRANSPORT_LABEL[transport.mode] ?? transport.mode} · 约 ${money(transport.cost)}`}
          />
        </div>
      </Card>

      {/* 目的地印象：用色块 + emoji 模拟当地特色图 */}
      <Section title="第一眼印象" hint="当地标签与氛围">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(dest.tags.length ? dest.tags : ['旅行', '风景', '美食', '人文']).slice(0, 4).map((tag, i) => (
            <div
              key={tag}
              className={cx(
                'relative overflow-hidden rounded-xl border-[1.5px] border-ink/10 px-3 py-5 text-center',
                i === 0 && 'bg-gradient-to-br from-amber/40 to-rose/30',
                i === 1 && 'bg-gradient-to-br from-azure/30 to-violet/25',
                i === 2 && 'bg-gradient-to-br from-moss/30 to-azure/25',
                i === 3 && 'bg-gradient-to-br from-rose/25 to-amber/35',
              )}
            >
              <span className="text-[28px]">{dest.emoji}</span>
              <p className="mt-1 text-[12px] font-bold capitalize">{tag}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 适合你的原因 */}
      {scored && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="h3">为什么适合你</p>
            <Tag tone="violet">{scored.score} 分</Tag>
            {quiz.result && <Tag tone="gray">{quiz.result.name}</Tag>}
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {scored.reasons.map((r) => (
              <li key={r} className="flex gap-2 text-[13px] leading-relaxed">
                <span className="text-moss">✓</span>
                {r}
              </li>
            ))}
          </ul>

          {scored.factors.length > 0 && (
            <div className="mt-4 grid gap-2 border-t-[1.5px] border-ink/10 pt-4 sm:grid-cols-2">
              {scored.factors.slice(0, 6).map((f) => (
                <div key={f.key}>
                  <div className="flex items-baseline justify-between">
                    <p className="text-[12px] font-bold">{f.label}</p>
                    <p className="text-[11px] tabular-nums text-inkSoft">{Math.round(f.score * 100)}</p>
                  </div>
                  <ProgressBar className="mt-1" value={f.score * 100} height="h-1" tone="violet" />
                </div>
              ))}
            </div>
          )}

          {scored.cautions.length > 0 && (
            <div className="mt-4 rounded-xl border-[1.5px] border-rose/30 bg-rose/8 px-3 py-2.5">
              <p className="text-[11.5px] font-bold text-rose">可能不适合你的地方</p>
              <ul className="mt-1 space-y-0.5">
                {scored.cautions.map((c) => (
                  <li key={c} className="text-[12.5px] text-inkSoft">
                    · {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {(hitInterests.length > 0 || hitDislikes.length > 0) && (
        <Card className="p-5">
          <p className="label">和你的偏好对一下</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {hitInterests.map((i) => (
              <Tag key={i} tone="moss">
                ✓ {labelOf(INTERESTS, i)}
              </Tag>
            ))}
            {hitDislikes.map((d) => (
              <Tag key={d} tone="rose">
                × {labelOf(DISLIKES, d)}
              </Tag>
            ))}
          </div>
        </Card>
      )}

      {/* 适合你的旅行方式 */}
      <Card className="overflow-hidden">
        <header className="border-b-[1.5px] border-ink/10 bg-amber/20 px-5 py-3.5">
          <p className="h3">适合你的旅行方式</p>
          <p className="muted mt-0.5">
            按 {suggestDays} 天、{dest.intensity === 'low' ? '低' : dest.intensity === 'medium' ? '中' : '高'}强度来排，剩下的留给你临时决定。
          </p>
        </header>
        <ol className="divide-y divide-ink/8">
          {Array.from({ length: suggestDays }).map((_, i) => {
            const base = safePlaybook[i % safePlaybook.length] ?? '慢慢来';
            const isFirst = i === 0;
            const isLast = i === suggestDays - 1;
            const title = isFirst
              ? `抵达 · ${base}`
              : isLast
                ? `回程 · ${base}`
                : base;
            return (
              <li key={i} className="flex items-start gap-3 px-5 py-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border-[1.5px] border-ink/20 bg-white text-[11px] font-extrabold">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-bold">{title}</p>
                  <p className="text-[11.5px] text-inkFaint">
                    {isFirst ? '刚到，别安排太满' : isLast ? '留时间给机场和退税' : '保持弹性'}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <p className="label">推荐玩法</p>
          <ul className="mt-2 space-y-1.5">
            {safeHighlights.length > 0
              ? safeHighlights.map((h) => (
                  <li key={h} className="flex gap-2 text-[13px]">
                    <span className="text-azure">·</span>
                    {h}
                  </li>
                ))
              : (
                  <li className="text-[12.5px] text-inkFaint">还没人给我们写这一城推荐玩法，去看下面搜到的真实地点吧</li>
                )}
          </ul>
          <p className="label mt-4">不太建议</p>
          <ul className="mt-2 space-y-1.5">
            {safeCautions.map((c) => (
              <li key={c} className="flex gap-2 text-[13px] text-inkSoft">
                <span className="text-rose">·</span>
                {c}
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="label">最佳旅行时间</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {bestMonths.map((m) => (
                <Tag key={m} tone="azure">
                  {m}
                </Tag>
              ))}
            </div>
            <p className="mt-3 text-[12.5px] text-inkSoft">
              {scored?.seasonNote ?? '避开法定节假日，体验会好很多。'}
            </p>
          </Card>

          {weatherLoading ? (
            <Card className="p-5">
              <p className="label">近期天气</p>
              <p className="muted mt-2">正在从高德加载…</p>
            </Card>
          ) : weather && weather.length > 0 ? (
            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="label">近期天气</p>
                <Tag tone="gray" className="text-[10px]">高德实况</Tag>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {weather.slice(0, 4).map((d, i) => (
                  <div key={d.date} className="rounded-xl border-[1.5px] border-ink/10 bg-paperDeep px-2 py-3 text-center">
                    <p className="text-[11px] font-semibold text-inkFaint">
                      {i === 0 ? '今天' : `${Number(d.date.slice(4, 6))}/${Number(d.date.slice(6, 8))}`}
                    </p>
                    <p className="my-1 text-[22px] leading-none">{d.emoji}</p>
                    <p className="text-[13px] font-extrabold tabular-nums">{d.high}°</p>
                    <p className="text-[11px] text-inkFaint tabular-nums">{d.low}°</p>
                    {d.rain >= 60 && (
                      <p className="mt-1 text-[10px] font-semibold text-azure">降水 {d.rain}%</p>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11.5px] text-inkFaint">
                只是参考，出发前请再确认。降水指数为高德天气状况推导值。
              </p>
            </Card>
          ) : null}

          <Card className="p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="label">交通概览</p>
              <Tag tone={transport.season.multiplier >= 1.3 ? 'rose' : transport.season.multiplier < 1 ? 'moss' : 'gray'}>
                {transport.season.label} · ×{transport.season.multiplier}
              </Tag>
            </div>

            <Field label="出发日期" hint="改日期就能看到淡旺季对交通成本的影响">
              <Input
                type="date"
                value={departDate}
                onChange={(e) => setDepartDate(e.target.value || todayISO())}
              />
            </Field>

            <div className="mt-3 space-y-1.5 text-[13px]">
              <p className="flex justify-between">
                <span className="text-inkSoft">从 {origin} 出发</span>
                <span className="font-bold">
                  {TRANSPORT_LABEL[transport.mode] ?? transport.mode} · {transport.hours} 小时
                </span>
              </p>
              <p className="flex justify-between">
                <span className="text-inkSoft">单程预估</span>
                <span className="font-bold tabular-nums">
                  {money(transport.cost)}
                  {transport.cost !== transport.baseCost && (
                    <span className="ml-1 text-[11px] text-inkFaint line-through">
                      {money(transport.baseCost)}
                    </span>
                  )}
                </span>
              </p>
              <p className="flex justify-between">
                <span className="text-inkSoft">往返预估</span>
                <span className="font-bold tabular-nums">{money(transport.roundTripCost)}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-inkSoft">市内强度</span>
                <span className="font-bold">
                  <IntensityBadge level={dest.intensity} />
                </span>
              </p>
            </div>
            <p className="mt-2.5 rounded-lg border-[1.5px] border-ink/12 bg-paperDeep px-2.5 py-2 text-[11.5px] text-inkSoft">
              {transport.season.note}
              {transport.mode === 'train' && ' · 高铁为固定票价，淡旺季只影响抢票难度'}
            </p>
          </Card>
        </div>
      </div>

      {/* ── 旅行手册：推荐理由 / 趣味百科 / 经典路线(地图) / 别人怎么玩 ── */}
      {handbook && (
        <div className="space-y-4">
          {handbook.whyGo?.length ? (
            <Card className="p-5">
              <p className="h3">为什么推荐 {dest.name}</p>
              <p className="muted mt-0.5">在决定去之前，先看看它凭什么值得。</p>
              <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {handbook.whyGo.map((w, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-bold text-white">
                      {i + 1}
                    </span>
                    <p className="text-[13px] leading-relaxed">{w}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {handbook.baike?.length ? (
            <Card className="p-5">
              <p className="h3">趣味百科</p>
              <p className="muted mt-0.5">关于这里的冷知识，像翻旅游手册。</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {handbook.baike.map((b, i) => (
                  <div key={i} className="rounded-xl border-[1.5px] border-ink/10 bg-paperDeep p-3.5">
                    <p className="text-[13px] font-bold">{b.title}</p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-inkSoft">{b.body}</p>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {handbook.classicRoutes?.length ? (
            <Card className="overflow-hidden">
              <header className="border-b-[1.5px] border-ink/10 bg-amber/20 px-5 py-3.5">
                <p className="h3">经典路线</p>
                <p className="muted mt-0.5">别人常怎么走 · 用时 · 空间地图</p>
              </header>
              <div className="px-5 py-3">
                <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
                  {handbook.classicRoutes.map((r, i) => (
                    <button
                      key={r.id}
                      onClick={() => setRouteIdx(i)}
                      className={cx(
                        'focus-ring shrink-0 rounded-full border-[1.5px] px-3 py-1.5 text-[12px] font-semibold transition',
                        i === routeIdx
                          ? 'border-ink bg-ink text-white'
                          : 'border-ink/15 bg-white text-inkSoft hover:border-ink/40',
                      )}
                    >
                      {r.name} · {r.days}
                    </button>
                  ))}
                </div>
                {(() => {
                  const route = handbook.classicRoutes![routeIdx];
                  const pts = buildRoutePoints(route);
                  const curated = getPlaces(dest.id);
                  return (
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Tag tone="amber">{route.days}</Tag>
                          {route.intensity && <IntensityBadge level={route.intensity} />}
                        </div>
                        <p className="mt-2 text-[13px] leading-relaxed">{route.summary}</p>
                        <ol className="mt-3 space-y-1.5">
                          {route.stops.map((s, i) => (
                            <li key={i} className="flex items-center gap-2 text-[12.5px]">
                              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border-[1.5px] border-ink/20 text-[10px] font-extrabold">
                                {i + 1}
                              </span>
                              <span>
                                {'placeId' in s
                                  ? (curated.find((p) => p.id === s.placeId)?.name ?? s.placeId)
                                  : s.name}
                              </span>
                            </li>
                          ))}
                        </ol>
                        {route.tips && (
                          <p className="mt-3 rounded-lg border-[1.5px] border-ink/12 bg-paperDeep px-2.5 py-2 text-[11.5px] leading-relaxed text-inkSoft">
                            💡 {route.tips}
                          </p>
                        )}
                      </div>
                      <div className="h-[260px] overflow-hidden rounded-xl border-[1.5px] border-ink/10">
                        {pts.length >= 2 ? (
                          <AMapView
                            points={pts}
                            showRoute
                            mode="driving"
                            city={dest.name}
                            fallback={<RouteFallback dest={dest} stops={route.stops} />}
                            className="h-full w-full"
                          />
                        ) : (
                          <RouteFallback dest={dest} stops={route.stops} />
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </Card>
          ) : null}

          {handbook.howOthersPlay?.length ? (
            <Card className="p-5">
              <p className="h3">别人是怎么玩的</p>
              <p className="muted mt-0.5">真实旅行者的节奏，与踩过的坑。</p>
              <ul className="mt-3 space-y-2">
                {handbook.howOthersPlay.map((h, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-relaxed">
                    <span className="text-azure">💬</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      )}

      {/* ── 攻略 / 玩法（Guide → Playbook → Plan）：结构化、可执行、用真实 POI ── */}
      {guide ? (
        <Section title="攻略 · 到了这里怎么玩" hint="每个玩法都是真实行程模板，一键加入你的旅行">
          {/* 攻略概要 */}
          <Card className="mb-3 p-5">
            <p className="text-[13px] leading-relaxed">{guide.overview}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11.5px]">
              <Tag tone="azure">{guide.recommendedDays}</Tag>
              <Tag tone="gray">最佳：{guide.bestTime}</Tag>
              {guide.audience.map((a) => (
                <Tag key={a} tone="gray">
                  {AUDIENCE_LABEL[a] ?? a}
                </Tag>
              ))}
              <IntensityBadge level={guide.intensity} />
            </div>
            {guide.areas?.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {guide.areas.map((area) => (
                  <span key={area.id} className="rounded-full border-[1.5px] border-ink/12 px-2.5 py-1 text-[11.5px] text-inkSoft">
                    {area.name}
                  </span>
                ))}
              </div>
            ) : null}
          </Card>

          {/* 玩法模板列表 */}
          <div className="space-y-3">
            {guide.playbooks.map((pb) => (
              <Card key={pb.id} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b-[1.5px] border-ink/10 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <p className="text-[13.5px] font-extrabold">{pb.title}</p>
                    <Tag tone="azure">{PLAYBOOK_TYPE_LABEL[pb.type] ?? pb.type}</Tag>
                    {pb.durationDays > 1 && <Tag tone="gray">{pb.durationDays} 天</Tag>}
                    <IntensityBadge level={pb.intensity} />
                  </div>
                </div>
                <div className="px-5 py-3">
                  <p className="muted text-[12.5px]">{pb.summary}</p>

                  {/* 按天展示真实 POI 序列 */}
                  <div className="mt-3 space-y-3">
                    {pb.days.map((d) => (
                      <div key={d.index}>
                        <p className="text-[12px] font-bold text-inkSoft">
                          Day {d.index} · {d.title}
                        </p>
                        <ul className="mt-1.5 space-y-1.5 border-l-[1.5px] border-ink/10 pl-3">
                          {d.stops.map((s) => {
                            const place = getPlace(destinationId, s.placeId);
                            const tt = transportText(s.transportFromPrevious?.mode, s.transportFromPrevious?.min);
                            return (
                              <li key={s.placeId + s.order} className="flex items-baseline gap-2 text-[12.5px]">
                                <span className="shrink-0 font-mono text-inkFaint">{s.time}</span>
                                <span className="font-semibold">{place?.name ?? s.placeId}</span>
                                <span className="shrink-0 text-inkFaint">· {s.duration} 分钟</span>
                                {tt ? <span className="shrink-0 text-[11px] text-azure">↓ {tt}</span> : null}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>

                  {pb.tips?.length ? (
                    <p className="muted mt-3 text-[11.5px]">💡 {pb.tips.join(' ')}</p>
                  ) : null}

                  <div className="mt-3 flex justify-end">
                    <Button variant="primary" size="sm" onClick={() => handleApplyPlaybook(pb.id)}>
                      加入我的旅行
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      ) : (
        <Card className="p-5">
          <p className="h3">攻略还在整理中</p>
          <p className="muted mt-0.5">
            这个目的地暂时还没有结构化攻略。你可以用下方搜索添加真实地点，或先让 AI 帮你规划。
          </p>
        </Card>
      )}

      {/* ── 问 AI 关于这里（决策阶段，点按钮才发请求）── */}
      <Card className="p-5">
        <p className="h3">还想追问？问 AI 关于 {dest.name}</p>
        <p className="muted mt-0.5">点按钮才发请求（不浪费 token）；没接模型时会提示你去设置。</p>
        <div className="mt-3 flex gap-2">
          <Input
            value={qaInput}
            onChange={(e) => setQaInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void askQA()}
            placeholder="比如：第一次去新疆环线几天合适？这条路线适合带老人吗？"
          />
          <Button variant="primary" onClick={() => void askQA()} disabled={qaLoading || !qaInput.trim()}>
            {qaLoading ? '思考中…' : '问 AI'}
          </Button>
        </div>
        {qaReply && (
          <p className="mt-3 rounded-xl border-[1.5px] border-ink/12 bg-paperDeep px-3 py-2.5 text-[13px] leading-relaxed">
            {qaReply}
          </p>
        )}
        {qaError && <p className="mt-3 text-[12px] text-amber">{qaError}</p>}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b-[1.5px] border-ink/10 px-5 py-3">
          <div>
            <p className="text-[13px] font-extrabold">可以去的具体地点</p>
            <p className="text-[11.5px] text-inkFaint">
              已收录 {places.length} 个 · 下方搜更多真实地点
            </p>
          </div>
        </div>

        <div className="border-b-[1.5px] border-ink/10 px-5 py-3">
          <div className="flex gap-2">
            <Input
              value={poiKw}
              onChange={(e) => setPoiKw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void searchPOI(poiKw)}
              placeholder={`搜 ${dest.name} 的地点（按回车）`}
            />
            <Button onClick={() => void searchPOI(poiKw)} disabled={poiLoading}>
              {poiLoading ? '搜中…' : '搜索'}
            </Button>
          </div>
          <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
            {['博物馆', '美食', '咖啡', '景点', '公园', '购物', '夜生活', '小众'].map((k) => (
              <button
                key={k}
                onClick={() => void searchPOI(k)}
                className={cx(
                  'focus-ring shrink-0 rounded-full border-[1.5px] px-2.5 py-1 text-[11.5px] font-semibold transition',
                  poiKw === k
                    ? 'border-ink bg-ink text-white'
                    : 'border-ink/15 bg-white text-inkSoft hover:border-ink/40',
                )}
              >
                {k}
              </button>
            ))}
          </div>
          {poiError && (
            <p className="mt-2 text-[11.5px] text-amber">
              {poiError}（先去设置页检查高德 Key 是否配置）
            </p>
          )}
        </div>

        {poiResults.length > 0 && (
          <ul className="divide-y divide-ink/8">
            {poiResults.map((p) => {
              const added = places.some((pl) => pl.id === `poi-${p.id}`);
              return (
                <li key={p.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold">{p.name}</p>
                    <p className="truncate text-[11px] text-inkFaint">{p.address || '—'}</p>
                  </div>
                  <button
                    onClick={() => addPoiToPool(p)}
                    disabled={added}
                    className={cx(
                      'focus-ring shrink-0 rounded-lg border-[1.5px] px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-50',
                      added
                        ? 'border-moss/40 bg-moss/15 text-moss'
                        : 'border-ink/15 hover:border-ink',
                    )}
                  >
                    {added ? '✓ 已加入' : '+ 加入地点池'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {!hasTrip && poiResults.length === 0 && (
          <p className="px-5 py-4 text-center text-[12px] text-inkFaint">
            还没创建这次旅行。
            <Link to={`/trips/new?destination=${dest.id}&days=${dest.idealDays.min}`} className="ml-1 underline">
              现在创建
            </Link>
          </p>
        )}
      </Card>

      {places.length > 0 && (
        <Section title="值得先了解的地点" hint="特色玩法与主要景区">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {places.map((p) => (
              <button
                key={p.id}
                onClick={() => setInspectPlace(p)}
                className="card-quiet group overflow-hidden text-left transition hover:border-ink/40"
              >
                <div
                  className={cx(
                    'flex h-20 items-center justify-center border-b-[1.5px] border-ink/8',
                    p.fullDay ? 'bg-amber/25' : 'bg-paperDeep',
                  )}
                >
                  <span className="text-[42px] transition group-hover:scale-110">{p.emoji}</span>
                </div>
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-[13.5px] font-bold">{p.name}</p>
                    {p.fullDay && (
                      <Tag tone="amber" className="shrink-0 text-[10px]">
                        需一整天
                      </Tag>
                    )}
                  </div>
                  <p className="muted mt-1 line-clamp-2 min-h-[2.5em]">{p.description || `${p.name}是${dest.name}值得体验的地方`}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-inkFaint">
                    <Tag tone="gray">{p.durationMin} 分钟</Tag>
                    {p.avgCost > 0 && <Tag tone="gray">人均 {money(p.avgCost)}</Tag>}
                    {p.requiredBooking && <Tag tone="rose">需预约</Tag>}
                    {p.indoor && <Tag tone="azure">室内</Tag>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Section>
      )}

      {places.length === 0 && (
        <Card className="p-4">
          <p className="text-[13px] font-semibold">这个目的地还没收录具体地点</p>
          <p className="muted mt-1 text-[12px]">
            我们不会编造不存在的地点凑数。用上方实时搜索添加真实地点，或先让 AI 帮你规划。
          </p>
        </Card>
      )}

      <Card className={cx('flex flex-col items-center gap-3 px-6 py-7 text-center')}>
        <p className="text-[28px] leading-none">🎒</p>
        <div>
          <p className="h2">就去这里？</p>
          <p className="muted mt-1">确认后直接创建旅行，并跳到 AI 规划页；你可以随时自己改。</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => navigate('/destinations')}>再看看别的</Button>
          <Button variant="primary" size="lg" onClick={goCreate}>
            就去 {dest.name}
          </Button>
        </div>
        <Link to="/quiz" className="focus-ring text-[12px] font-semibold text-inkSoft underline hover:text-ink">
          重新测一次偏好
        </Link>
      </Card>

      <Sheet open={!!inspectPlace} onClose={() => setInspectPlace(null)} title={inspectPlace?.name}>
        {inspectPlace && (
          <DestinationPlaceInspect
            place={inspectPlace}
            dest={dest}
            trips={trips}
            onClose={() => setInspectPlace(null)}
            onCreateTrip={() => {
              setInspectPlace(null);
              goCreate();
            }}
            onSchedule={(dayId) => {
              schedulePlace(dayId, inspectPlace.id);
              toast(`已加入「${inspectPlace.name}」`, 'good');
              setInspectPlace(null);
            }}
            onToggleSave={(tripId) => {
              toggleSavePlace(tripId, inspectPlace.id);
              toast('收藏已更新', 'good');
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function DestinationPlaceInspect({
  place,
  dest,
  trips,
  onClose,
  onCreateTrip,
  onSchedule,
  onToggleSave,
}: {
  place: Place;
  dest: Destination;
  trips: Trip[];
  onClose: () => void;
  onCreateTrip: () => void;
  onSchedule: (dayId: string) => void;
  onToggleSave: (tripId: string) => void;
}) {
  const savedMap = useStore((s) => s.db.savedPlaces);
  const allDays = useStore((s) => s.db.days);
  const existing = trips.filter((t) => t.destinationId === dest.id);
  return (
    <div className="flex h-[70vh] flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border-[1.5px] border-ink bg-paperDeep text-[24px]">
          {place.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-extrabold">{place.name}</p>
          <p className="muted mt-0.5">{place.description || `${place.name}是${dest.name}值得体验的地方`}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[12.5px]">
        <div className="rounded-xl border-[1.5px] border-ink/12 px-3 py-2">
          <p className="text-[11px] text-inkFaint">建议停留</p>
          <p className="font-bold">{place.durationMin} 分钟</p>
        </div>
        <div className="rounded-xl border-[1.5px] border-ink/12 px-3 py-2">
          <p className="text-[11px] text-inkFaint">人均</p>
          <p className="font-bold">{place.avgCost ? money(place.avgCost) : '免费'}</p>
        </div>
        <div className="rounded-xl border-[1.5px] border-ink/12 px-3 py-2">
          <p className="text-[11px] text-inkFaint">类型</p>
          <p className="font-bold">{place.category}</p>
        </div>
        <div className="rounded-xl border-[1.5px] border-ink/12 px-3 py-2">
          <p className="text-[11px] text-inkFaint">适合天气</p>
          <p className="font-bold">{place.indoor ? '室内，下雨也行' : '户外'}</p>
        </div>
      </div>

      {place.requiredBooking && (
        <p className="rounded-xl border-[1.5px] border-rose/30 bg-rose/8 px-3 py-2 text-[12px] text-rose">
          需要提前预约
        </p>
      )}

      {existing.length > 0 ? (
        <div className="space-y-3">
          <div className="space-y-2 border-t-[1.5px] border-ink/10 pt-3">
            <p className="label">加入已有旅行的哪一天</p>
            <div className="grid grid-cols-2 gap-2">
              {existing.flatMap((t) =>
                allDays
                  .filter((d) => d.tripId === t.id)
                  .map((d) => (
                    <button
                      key={d.id}
                      onClick={() => onSchedule(d.id)}
                      className="focus-ring rounded-xl border-[1.5px] border-ink bg-white px-3 py-2 text-[13px] font-bold transition hover:bg-paperDeep"
                    >
                      {t.title} · D{d.index}
                    </button>
                  )),
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {existing.map((t) => (
              <button
                key={t.id}
                onClick={() => onToggleSave(t.id)}
                className={cx(
                  'focus-ring flex-1 rounded-xl border-[1.5px] px-3 py-2 text-[12px] font-bold transition',
                  (savedMap[t.id] ?? []).includes(place.id)
                    ? 'border-amber/70 bg-amber/35'
                    : 'border-ink/15 hover:border-ink',
                )}
              >
                {(savedMap[t.id] ?? []).includes(place.id) ? '★ 已收藏' : '☆ 收藏'}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3 border-t-[1.5px] border-ink/10 pt-3">
          <p className="text-[12.5px] text-inkSoft">还没有去 {dest.name} 的旅行，创建一个就能加入地点。</p>
          <Button variant="primary" block onClick={onCreateTrip}>
            创建旅行并加入
          </Button>
        </div>
      )}

      <div className="mt-auto flex gap-2">
        {place.lng != null && place.lat != null && (
          <a
            href={`https://uri.amap.com/navigation?to=${place.lng},${place.lat},${encodeURIComponent(place.name)}&mode=car&coordinate=gaode&callnative=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring rounded-xl border-[1.5px] border-azure/40 bg-azure/10 px-4 py-2 text-[13px] font-bold text-azure"
          >
            导航
          </a>
        )}
        <Button variant="ghost" className="ml-auto" onClick={onClose}>
          关闭
        </Button>
      </div>
    </div>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card px-3.5 py-3">
      <p className="label">{label}</p>
      <p className="mt-1 text-[15px] font-extrabold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[10.5px] text-inkFaint">{hint}</p>}
    </div>
  );
}

function RouteFallback({
  dest,
  stops,
}: {
  dest: Destination;
  stops: NonNullable<DestinationHandbook['classicRoutes']>[number]['stops'];
}) {
  const curated = getPlaces(dest.id);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
      <p className="text-[12px] text-inkFaint">地图需配置高德 Key；路线顺序如下：</p>
      <ol className="space-y-1 text-[12.5px]">
        {stops.map((s, i) => (
          <li key={i}>
            {i + 1}.{' '}
            {'placeId' in s ? (curated.find((p) => p.id === s.placeId)?.name ?? s.placeId) : s.name}
          </li>
        ))}
      </ol>
    </div>
  );
}
