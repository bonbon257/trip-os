import { useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTripContext } from '@/hooks/useTrip';
import { useStore } from '@/services/store';
import { runAIAsync } from '@/ai/orchestrator';
import { optimizeOrder, canvasDistance } from '@/services/route';
import { getDestination } from '@/data/destinations';
import { resolveCityIds } from '@/data/places';
import { PageHeader } from '@/components/layout';
import { MockMap } from '@/components/travel/MockMap';
import { AMapView, AMapErrorFallback, type RouteMode } from '@/components/travel/AMapView';
import { ProposalPanel } from '@/components/travel/ProposalPanel';
import { IntensityBadge } from '@/components/travel/TripBits';
import { Button, Card, EmptyState, Segmented, Sheet, Tabs, cx, toast } from '@/components/ui';
import { POISearch } from '@/features/destination/POISearch';
import { fmtMDWeek, todayISO } from '@/utils/date';
import { TRANSPORT_LABEL, money } from '@/utils/format';
import { computeDayIntensity } from '@/services/intelligence';
import type { AIProposal, Place } from '@/types';

const MODE_OPTIONS: { value: RouteMode; label: string; emoji: string; hint: string }[] = [
  { value: 'driving', label: '驾车', emoji: '🚗', hint: '按驾车导航' },
  { value: 'walking', label: '步行', emoji: '🚶', hint: '两点之间走着去' },
  { value: 'transit', label: '公交', emoji: '🚇', hint: '地铁 / 公交线路' },
];

export function MapPage() {
  const { tripId = '' } = useParams();
  const ctx = useTripContext(tripId);
  const db = useStore((s) => s.db);
  const addProposal = useStore((s) => s.addProposal);
  const applyProposal = useStore((s) => s.applyProposal);
  const rejectProposal = useStore((s) => s.rejectProposal);

  const [dayId, setDayId] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [proposal, setProposal] = useState<AIProposal | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [mode, setMode] = useState<RouteMode>('driving');
  const [showSubway, setShowSubway] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // 地图局部重挂：点「刷新试试」只重跑地图，不整页刷新（避免刷新后误以为行程变了）
  const [mapReloadKey, setMapReloadKey] = useState(0);
  const [view, setView] = useState<'scheduled' | 'wishlist' | 'all'>('scheduled');
  const [combo, setCombo] = useState<{ dayLabel: string; names: string[] }[] | null>(null);

  const days = ctx?.days ?? [];
  const activeDay = days.find((d) => d.id === dayId) ?? days.find((d) => d.date === todayISO()) ?? days[0];
  const acts = activeDay ? (ctx?.actsOf(activeDay.id) ?? []) : [];
  const placeOf = ctx?.placeOf;
  const schedulePlace = useStore((s) => s.schedulePlace);
  const deleteActivity = useStore((s) => s.deleteActivity);
  const unscheduleActivity = useStore((s) => s.unscheduleActivity);

  // ── 多城市：城市顺序 / 颜色 / 城市中心连线（顺路总览）──
  const cityList = ctx ? resolveCityIds(ctx.trip) : [];
  const CITY_PALETTE = ['#3737B0', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#0EA5E9'];
  const cityColorMap = useMemo(() => {
    const m: Record<string, string> = {};
    cityList.forEach((id, i) => (m[id] = CITY_PALETTE[i % CITY_PALETTE.length]));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityList.join(',')]);
  const cityCenters = useMemo(
    () =>
      cityList
        .map((id) => getDestination(id))
        .filter((d): d is NonNullable<typeof d> => !!d && Number.isFinite(d.lng) && Number.isFinite(d.lat))
        .map((d) => ({ lng: d.lng, lat: d.lat, name: d.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cityList.join(',')],
  );
  const pointColor = useMemo(() => (p: Place) => cityColorMap[p.destinationId], [cityColorMap]);
  const primaryCityName = cityList.length ? getDestination(cityList[0])?.name ?? '' : '';
  const cityGroups = useMemo(() => {
    if (!ctx) return [];
    const out: { cityId: string; name: string; days: string[] }[] = [];
    for (const d of ctx.days) {
      const cid = d.destinationId ?? ctx.trip.destinationId;
      const last = out[out.length - 1];
      if (last && last.cityId === cid) last.days.push(d.id);
      else out.push({ cityId: cid, name: getDestination(cid)?.name ?? cid, days: [d.id] });
    }
    return out;
  }, [ctx]);

  const points = useMemo(
    () =>
      acts
        .map((a) => ({ a, p: placeOf?.(a.placeId) }))
        .filter((x): x is { a: (typeof acts)[number]; p: NonNullable<ReturnType<NonNullable<typeof placeOf>>> } => !!x.p)
        .map(({ a, p }, i) => ({
          place: p,
          order: i,
          minutesFromPrev: a.transportMin,
          done: a.status === 'done',
        })),
    [acts, placeOf],
  );

  const hasGeo = points.some((p) => p.place.lng != null && p.place.lat != null);
  const hasNoLngLat = points.length > 0 && !hasGeo;

  // 「想去 / 候选」但还没排进任何一天
  const wishlistPoints = useMemo(() => {
    const scheduledPlaceIds = new Set(
      db.activities.filter((a) => a.tripId === tripId && a.placeId).map((a) => a.placeId as string),
    );
    return (db.savedPlaces?.[tripId] ?? [])
      .filter((id) => !scheduledPlaceIds.has(id))
      .map((id) => placeOf?.(id))
      .filter((p): p is Place => !!p)
      .map((p) => ({ place: p, order: 0, minutesFromPrev: undefined }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.savedPlaces, db.activities, tripId, placeOf]);

  // 当前地图要显示的已排期点 / 想去点（按顶部 Segmented 切换）
  const mapPoints = view === 'wishlist' ? [] : points;
  const wishlistForMap = view === 'scheduled' ? undefined : wishlistPoints;

  // 选中卡片：已排期 + 想去 都能查到
  const allSelectPoints = useMemo(() => [...points, ...wishlistPoints], [points, wishlistPoints]);

  const transitTotal = acts.reduce((s, a) => s + (a.transportMin ?? 0), 0);
  const intensity = activeDay ? computeDayIntensity(acts, placeOf ?? (() => undefined)) : null;

  const saving = useMemo(() => {
    const ordered = points.map((p) => p.place);
    if (ordered.length < 3) return 0;
    return optimizeOrder(ordered).savedMinutes;
  }, [points]);

  if (!ctx) return null;

  const askOptimize = async () => {
    setOptimizing(true);
    const res = await runAIAsync(db, tripId, '优化路线', undefined, false).catch(() => null);
    setOptimizing(false);
    if (!res?.proposal) {
      toast(res?.reply || '现在的顺序已经挺合理了', 'warn');
      return;
    }
    addProposal(res.proposal);
    setProposal(res.proposal);
  };

  // 组合建议的聚类结果（apply 时按 dayId 写入）
  const comboClustersRef = useRef<{ dayId: string; places: Place[] }[]>([]);

  const askCombine = () => {
    // 想去 + 已排期 全部纳入，按空间就近聚类，地理相近的放同一天
    const all = [...wishlistPoints.map((p) => p.place), ...points.map((p) => p.place)];
    const seen = new Set<string>();
    const places: Place[] = [];
    for (const p of all) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        places.push(p);
      }
    }
    if (places.length < 2) {
      toast('地点太少，先多加点想去或已排期的地点', 'warn');
      return;
    }

    const K = Math.min(days.length, places.length);
    const centers: Place[] = [];
    const clusters: Place[][] = [];
    for (const p of places) {
      if (centers.length < K) {
        centers.push(p);
        clusters.push([p]);
        continue;
      }
      let bestIdx = 0;
      let bestDist = Infinity;
      centers.forEach((c, i) => {
        const d = canvasDistance(c, p);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      });
      clusters[bestIdx].push(p);
    }

    comboClustersRef.current = clusters
      .map((c, i) => ({ dayId: days[i].id, places: c }))
      .filter((c) => c.places.length);
    setCombo(
      clusters
        .map((c, i) => ({ dayLabel: `Day ${days[i].index} · ${days[i].title}`, names: c.map((p) => p.name) }))
        .filter((g) => g.names.length),
    );
  };

  const applyCombo = () => {
    const mapping = comboClustersRef.current;
    let added = 0;
    for (const grp of mapping) {
      for (const p of grp.places) {
        const already = db.activities.some((a) => a.tripId === tripId && a.placeId === p.id);
        if (already) continue;
        const created = schedulePlace(grp.dayId, p.id);
        if (created) added++;
      }
    }
    if (added) toast(`已按空间关系排进 ${added} 个地点`, 'good');
    else toast('这些地点都已经排好了', 'warn');
    setCombo(null);
  };

  const deepenCombo = async () => {
    const res = await runAIAsync(db, tripId, '按空间关系组合成天', undefined, false).catch(() => null);
    if (!res?.proposal) {
      toast('AI 暂未给出深化建议', 'warn');
      return;
    }
    addProposal(res.proposal);
    setProposal(res.proposal);
    setCombo(null);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="地图"
        subtitle="点地图上的标记可以看地点，切一天地图就跟着变。"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {saving > 5 && <span className="text-[11.5px] font-semibold text-moss">可省约 {saving} 分钟</span>}
            <Button
              size="sm"
              onClick={() => setAddOpen(true)}
              disabled={points.length === 0 && !activeDay}
            >
              ＋ 加地点
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={askOptimize}
              disabled={points.length < 3 || optimizing}
            >
              {optimizing ? '正在算…' : '✨ 优化路线'}
            </Button>
            <Button
              size="sm"
              variant="soft"
              onClick={askCombine}
              disabled={points.length + wishlistPoints.length < 2}
              title="按地理就近把想去 / 已排期地点聚成天"
            >
              ✨ 组合建议
            </Button>
          </div>
        }
      />

      <Tabs
        value={activeDay?.id ?? ''}
        onChange={(v) => {
          setDayId(v);
          setSelected(null);
        }}
        options={days.map((d) => ({
          value: d.id,
          label: `D${d.index} · ${fmtMDWeek(d.date).replace(/\s.*/, '')}`,
        }))}
      />

      {cityGroups.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] font-bold text-inkFaint">城市</span>
          {cityGroups.map((g) => (
            <button
              key={g.cityId}
              onClick={() => {
                setDayId(g.days[0]);
                setSelected(null);
              }}
              className={cx(
                'focus-ring rounded-full border-[1.5px] px-3 py-1 text-[12px] font-semibold transition',
                g.days.includes(activeDay?.id ?? '')
                  ? 'border-ink bg-ink text-white'
                  : 'border-ink/15 bg-white text-inkSoft hover:border-ink/40',
              )}
            >
              <span
                className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
                style={{ background: cityColorMap[g.cityId] }}
              />
              {g.name} · {g.days.length} 天
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-[1.5px] border-ink/12 bg-white px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[11.5px] font-bold text-inkFaint">出行</span>
          <Segmented
            value={mode}
            onChange={(v) => setMode(v)}
            options={MODE_OPTIONS.map((o) => ({ value: o.value, label: `${o.emoji} ${o.label}` }))}
          />
        </div>
        <button
          onClick={() => setShowSubway((v) => !v)}
          className={cx(
            'focus-ring rounded-full border-[1.5px] px-2.5 py-1 text-[12px] font-semibold transition',
            showSubway
              ? 'border-ink bg-ink text-white'
              : 'border-ink/15 bg-white text-inkSoft hover:border-ink/40',
          )}
        >
          🚇 地铁线路
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border-[1.5px] border-ink/12 bg-white px-3 py-2">
        <Segmented
          value={view}
          onChange={(v) => setView(v as 'scheduled' | 'wishlist' | 'all')}
          options={[
            { value: 'scheduled', label: '已排期' },
            { value: 'wishlist', label: '想去' },
            { value: 'all', label: '全部' },
          ]}
        />
        <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-inkFaint">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#3737B0]" />
            已排期
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-[#B8B8C8] bg-white" />
            想去（未排期）
          </span>
          {cityGroups.length > 1 && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full border-[1.5px] border-dashed border-[#F59E0B] bg-transparent" />
              城市路线
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <AMapView
            key={mapReloadKey}
            points={mapPoints}
            wishlist={wishlistForMap}
            selectedId={selected ?? undefined}
            onSelect={(pid) => setSelected(pid)}
            className="h-[46vh] min-h-[300px]"
            mode={mode}
            city={primaryCityName}
            showSubway={showSubway}
            pointColor={pointColor}
            cityRoute={cityCenters}
            fallback={
              <div className="space-y-3">
                <MockMap
                  points={mapPoints}
                  selectedId={selected ?? undefined}
                  onSelect={(pid) => setSelected(pid)}
                  className="h-[46vh] min-h-[300px]"
                />
                {hasNoLngLat && (
                  <AMapErrorFallback
                    reason="noGeo"
                    onRetry={() => setMapReloadKey((k) => k + 1)}
                  />
                )}
              </div>
            }
            fallbackOnError={
              <MockMap
                points={mapPoints}
                selectedId={selected ?? undefined}
                onSelect={(pid) => setSelected(pid)}
                className="h-[46vh] min-h-[300px]"
              />
            }
          />

          {points.length < 3 && (
            <p className="text-[11.5px] text-inkFaint">
              至少需要 3 个地点才能比较路线顺序。先多放几个地点进来。
            </p>
          )}
        </div>

        <div className="space-y-3">
          <Card className="p-3.5">
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-extrabold">
                {activeDay?.title} · 路线
              </p>
              {intensity && <IntensityBadge level={intensity.level} score={intensity.score} />}
            </div>
            <p className="mt-0.5 text-[11.5px] text-inkFaint">
              {points.length} 个地点 · 路上共 {transitTotal} 分钟
            </p>

            {points.length === 0 ? (
              <EmptyState
                className="mt-3"
                emoji="◎"
                title="这天还没有可定位的地点"
                desc="去行程页把地点拖进这一天。"
              />
            ) : (
              <ol className="mt-3 space-y-1">
                {points.map((p, i) => (
                  <li key={p.place.id}>
                    {i > 0 && (
                      <div className="flex items-center gap-2 py-1 pl-2 text-[11px] text-inkFaint">
                        <span className="h-3 w-px bg-ink/20" />↓{' '}
                        {p.minutesFromPrev ? `${p.minutesFromPrev} min` : '步行即达'}
                      </div>
                    )}
                    <div
                      className={cx(
                        'flex w-full items-center gap-1 rounded-xl border-[1.5px] px-1.5 py-1.5 transition',
                        selected === p.place.id
                          ? 'border-ink bg-paperDeep shadow-note'
                          : 'border-ink/12 hover:border-ink/40',
                      )}
                    >
                      <button
                        onClick={() => setSelected(p.place.id)}
                        className="flex min-w-0 flex-1 items-center gap-2.5 px-1.5 text-left"
                      >
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border-[1.5px] border-ink/15 bg-white text-[12px]">
                          {p.place.emoji}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-bold">{p.place.name}</span>
                          <span className="block text-[10.5px] text-inkFaint">
                            {p.place.durationMin} 分钟 · 人均 {money(p.place.avgCost)}
                            {p.place.indoor ? ' · 室内' : ' · 户外'}
                          </span>
                        </span>
                        <span className="text-[10.5px] font-bold text-inkFaint">{i + 1}</span>
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`从这天移除「${p.place.name}」？`)) {
                            const a = acts.find((x) => x.placeId === p.place.id);
                            if (a) {
                              deleteActivity(a.id);
                              toast(`已移除「${p.place.name}」`, 'warn');
                              if (selected === p.place.id) setSelected(null);
                            }
                          }
                        }}
                        className="focus-ring shrink-0 rounded-md border-[1.5px] border-rose/30 px-1.5 text-[11px] text-rose"
                        aria-label="从这天移除"
                        title="从这天移除"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {selected && (() => {
            const p = allSelectPoints.find((x) => x.place.id === selected)?.place;
            if (!p) return null;
            const act = acts.find((a) => a.placeId === p.id);
            return (
              <Card className="p-3.5">
                <div className="flex items-start gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-lg border-[1.5px] border-ink/15 bg-paperDeep text-[17px]">
                    {p.emoji}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[14px] font-extrabold">{p.name}</p>
                    <p className="muted mt-0.5">{p.description}</p>
                  </div>
                </div>
                <dl className="mt-3 space-y-1 text-[12px]">
                  <div className="flex justify-between">
                    <dt className="text-inkSoft">营业</dt>
                    <dd className="font-semibold">
                      {p.open && p.close ? `${p.open} – ${p.close}` : '全天'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-inkSoft">建议时长</dt>
                    <dd className="font-semibold">{p.durationMin} 分钟</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-inkSoft">人均</dt>
                    <dd className="font-semibold tabular-nums">{money(p.avgCost)}</dd>
                  </div>
                  {act && (
                    <div className="flex justify-between">
                      <dt className="text-inkSoft">到达方式</dt>
                      <dd className="font-semibold">
                        {act.transportMin ? `${TRANSPORT_LABEL[act.transportMode]} ${act.transportMin} min` : '—'}
                      </dd>
                    </div>
                  )}
                </dl>
                {p.requiredBooking && (
                  <p className="mt-2 rounded-lg border-[1.5px] border-rose/30 bg-rose/8 px-2.5 py-1.5 text-[11.5px] text-rose">
                    这个地点通常需要提前预约
                  </p>
                )}
                {act && (
                  <Button
                    size="sm"
                    variant="soft"
                    className="mt-3 w-full"
                    onClick={() => {
                      unscheduleActivity(act.id);
                      toast(`已将「${p.name}」退回候选`, 'warn');
                      if (selected === p.id) setSelected(null);
                    }}
                  >
                    退回候选
                  </Button>
                )}
              </Card>
            );
          })()}
        </div>
      </div>

      {combo && (
        <Card className="p-3.5">
          <p className="text-[14px] font-extrabold">✨ 组合建议（按空间就近）</p>
          <p className="mt-0.5 text-[11.5px] text-inkFaint">
            把地理相近的地点放到同一天，确认后再写入行程。
          </p>
          <ol className="mt-3 space-y-1.5">
            {combo.map((g, i) => (
              <li key={i} className="rounded-xl border-[1.5px] border-ink/12 px-3 py-2">
                <p className="text-[12.5px] font-bold">{g.dayLabel}</p>
                <p className="mt-0.5 text-[12px] text-inkSoft">{g.names.join(' ＋ ')}</p>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="primary" onClick={applyCombo}>
              应用到行程
            </Button>
            <Button size="sm" variant="soft" onClick={deepenCombo}>
              用 AI 深化
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCombo(null)}>
              取消
            </Button>
          </div>
        </Card>
      )}

      {proposal && (
        <ProposalPanel
          proposal={proposal}
          onApply={() => {
            applyProposal(proposal.id);
            toast('已应用路线优化', 'good');
            setProposal(null);
          }}
          onReject={() => {
            rejectProposal(proposal.id);
            setProposal(null);
          }}
        />
      )}

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title={`加入「${activeDay?.title ?? '今天'}」`}>
        <div className="space-y-3">
          {ctx && (
            <POISearch
              destName={primaryCityName}
              destId={cityList[0] ?? ctx.trip.destinationId}
              onAdd={(place) => {
                if (!activeDay) return;
                const created = schedulePlace(activeDay.id, place.id);
                if (created) toast(`已排进「${activeDay.title}」`, 'good');
                setAddOpen(false);
              }}
            />
          )}
          <p className="text-[11.5px] text-inkFaint">
            搜到地点后点 +加入，会同时加入地点池并排进当前选中的日期。
          </p>
        </div>
      </Sheet>
    </div>
  );
}
