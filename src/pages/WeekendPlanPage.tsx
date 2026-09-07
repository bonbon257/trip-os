import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '@/services/store';
import { MockMap, type MapPoint } from '@/components/travel/MockMap';
import { AMapView } from '@/components/travel/AMapView';
import { Button, Card, Section, Sheet, Tag, cx } from '@/components/ui';
import { addMinutes, upcomingSaturday } from '@/utils/date';
import { useCityCenter } from '@/hooks/useCityCenter';
import { geoKmBetween } from '@/services/route';
import { planRoute } from '@/services/amap';
import { ACTIVITY_LABEL } from '@/utils/format';
import type { Place } from '@/types';

/**
 * /weekend/plan —— 周末执行页
 *
 * 把周末计划从「决策候选」落地为「可执行的时间线 + 地图」。
 * 支持：
 *   · 查看已加入计划的地方
 *   · 暂停 / 恢复（不等于删除）
 *   · 换一个地点
 *   · 上移 / 下移 / 移除
 *   · 地图（MockMap，有真实经纬度时自动切换高德）
 */
export function WeekendPlanPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const weekendOf = params.get('w') ?? upcomingSaturday();

  const db = useStore((s) => s.db);
  const updateWeekendPlan = useStore((s) => s.updateWeekendPlan);
  const setPlaceState = useStore((s) => s.setPlaceState);

  const plan = db.weekendPlans?.find((p) => p.weekendOf === weekendOf);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [swapPlace, setSwapPlace] = useState<Place | null>(null);
  const [realRoute, setRealRoute] = useState<{
    minutes: number;
    distance: number;
    polyline: Array<[number, number]>;
  } | null>(null);

  const pausedIds = plan?.pausedIds ?? [];
  const activeIds = plan?.placeIds ?? [];
  const allIds = [...activeIds, ...pausedIds];

  const places = useMemo(() => {
    return allIds
      .map((id) => db.weekendDiscoveredPlaces?.find((p) => p.id === id))
      .filter((p): p is Place => !!p);
  }, [allIds, db.weekendDiscoveredPlaces]);

  const activePlaces = useMemo(
    () => activeIds.map((id) => db.weekendDiscoveredPlaces?.find((p) => p.id === id)).filter((p): p is Place => !!p),
    [activeIds, db.weekendDiscoveredPlaces],
  );

  const { center: cityCenter } = useCityCenter();

  const timeline = useMemo(() => {
    let cursor = '09:30';
    return activePlaces.map((p, i) => {
      const prev = activePlaces[i - 1];
      const km =
        prev && p.lat && p.lng && prev.lat && prev.lng
          ? geoKmBetween({ lat: prev.lat, lng: prev.lng }, { lat: p.lat, lng: p.lng }) ??
            (cityCenter && p.lat && p.lng
              ? geoKmBetween(cityCenter, { lat: p.lat, lng: p.lng }) ?? 0
              : 0)
          : cityCenter && p.lat && p.lng
            ? geoKmBetween(cityCenter, { lat: p.lat, lng: p.lng }) ?? 0
            : 0;
      const travelMin = Math.max(10, Math.round(km * 4));
      const arrival = i === 0 ? cursor : addMinutes(cursor, travelMin);
      const stay = p.durationMin ?? 90;
      const leave = addMinutes(arrival, stay);
      cursor = leave;
      return {
        place: p,
        arrival,
        leave,
        stay,
        travelMin: i === 0 ? 0 : travelMin,
        km,
        paused: pausedIds.includes(p.id),
      };
    });
  }, [activePlaces, cityCenter, pausedIds]);

  const mapPoints: MapPoint[] = useMemo(
    () =>
      activePlaces.map((p, i) => ({
        place: p,
        order: i,
        minutesFromPrev: i > 0 ? timeline[i]?.travelMin : undefined,
      })),
    [activePlaces, timeline],
  );

  useEffect(() => {
    if (!activePlaces.length) {
      setRealRoute(null);
      return;
    }
    const origin = cityCenter ?? { lat: activePlaces[0]!.lat ?? 0, lng: activePlaces[0]!.lng ?? 0 };
    const dest = activePlaces[activePlaces.length - 1]!;
    const wps = activePlaces.slice(0, -1).map((p) => ({ lat: p.lat ?? 0, lng: p.lng ?? 0 }));
    let cancelled = false;
    planRoute(origin, { lat: dest.lat ?? 0, lng: dest.lng ?? 0 }, 'driving', wps).then((r) => {
      if (r && !cancelled) setRealRoute(r);
    });
    return () => {
      cancelled = true;
    };
  }, [activePlaces, cityCenter?.lat, cityCenter?.lng]);

  const move = (idx: number, dir: -1 | 1) => {
    if (!plan) return;
    const next = [...plan.placeIds];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    updateWeekendPlan(plan.id, { placeIds: next });
  };

  const remove = (id: string) => {
    if (!plan) return;
    updateWeekendPlan(plan.id, {
      placeIds: plan.placeIds.filter((x) => x !== id),
      pausedIds: (plan.pausedIds ?? []).filter((x) => x !== id),
    });
    setPlaceState({ containerType: 'WEEKEND', containerId: plan.id, placeId: id, status: 'CANDIDATE' });
  };

  const togglePause = (id: string) => {
    if (!plan) return;
    const isPaused = pausedIds.includes(id);
    if (isPaused) {
      updateWeekendPlan(plan.id, {
        placeIds: [...plan.placeIds, id],
        pausedIds: pausedIds.filter((x) => x !== id),
      });
    } else {
      updateWeekendPlan(plan.id, {
        placeIds: plan.placeIds.filter((x) => x !== id),
        pausedIds: [...pausedIds, id],
      });
    }
  };

  const handleSwap = (placeId: string) => {
    if (!plan || !swapPlace) return;
    updateWeekendPlan(plan.id, {
      placeIds: plan.placeIds.map((id) => (id === swapPlace.id ? placeId : id)),
      pausedIds: (plan.pausedIds ?? []).map((id) => (id === swapPlace.id ? placeId : id)),
    });
    setSwapPlace(null);
  };

  const candidates = useMemo(() => {
    if (!swapPlace) return [];
    return (
      db.weekendDiscoveredPlaces?.filter(
        (p) => p.id !== swapPlace.id && !allIds.includes(p.id),
      ) ?? []
    );
  }, [swapPlace, db.weekendDiscoveredPlaces, allIds]);

  if (!plan || places.length === 0) {
    return (
      <div className="space-y-5">
        <Card className="p-6 text-center">
          <p className="text-[15px] font-bold">这周末还没计划</p>
          <p className="muted mt-2">先挑几个地方——或者直接告诉我你想干嘛。</p>
          <Button className="mt-4" variant="primary" onClick={() => navigate('/weekend')}>
            去挑地方
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label">周末计划</p>
          <p className="muted mt-1 text-[12.5px]">
            {realRoute
              ? `${activePlaces.length} 个地方 · 实际路上 ${realRoute.minutes} min / ${(realRoute.distance / 1000).toFixed(1)} km`
              : `${activePlaces.length} 个地方${pausedIds.length > 0 ? ` · ${pausedIds.length} 个已暂停` : ''}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => navigate('/weekend')}>
            再挑一个
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              const first = activePlaces[0];
              if (first?.lat && first?.lng) {
                window.open(
                  `https://uri.amap.com/marker?position=${first.lng},${first.lat}&name=${encodeURIComponent(first.name)}&src=tripos&coordinate=gaode&callnative=1`,
                  '_blank',
                  'noopener,noreferrer',
                );
              }
            }}
          >
            导航去第一站
          </Button>
        </div>
      </header>

      {activePlaces.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="h-64 w-full sm:h-80">
            <AMapView
              points={mapPoints}
              selectedId={selectedId ?? undefined}
              onSelect={setSelectedId}
              city={cityCenter?.cityName}
              showRoute
              fallback={<MockMap points={mapPoints} selectedId={selectedId ?? undefined} onSelect={setSelectedId} />}
              fallbackOnError={<MockMap points={mapPoints} selectedId={selectedId ?? undefined} onSelect={setSelectedId} />}
            />
          </div>
        </Card>
      )}

      <Section title="时间线" hint="按距离和类型估算，路上实际用时以高德为准">
        <div className="space-y-3">
          {timeline.map((t, i) => (
            <Card
              key={t.place.id}
              className={cx(
                'cursor-pointer p-4 transition',
                selectedId === t.place.id ? 'border-violet bg-violet/8' : 'border-ink/15',
                t.paused && 'opacity-55',
              )}
              onClick={() => setSelectedId(t.place.id)}
            >
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border-[1.5px] border-ink bg-paperDeep text-[18px]">
                  {t.place.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className={cx('text-[15px] font-bold', t.paused && 'line-through')}>{t.place.name}</h3>
                    <span className="text-[12px] text-inkSoft">{t.arrival} – {t.leave}</span>
                  </div>
                  <p className="text-[12px] text-inkSoft">
                    {i === 0 ? '从市区出发' : `约 ${t.travelMin} min 路程`}
                    {t.place.address ? ` · ${t.place.address}` : ''}
                  </p>
                </div>
                {t.paused && <Tag tone="rose">已暂停</Tag>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)}>
                  上移
                </Button>
                <Button size="sm" variant="ghost" disabled={i === activePlaces.length - 1} onClick={() => move(i, 1)}>
                  下移
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSwapPlace(t.place)}>
                  换一个
                </Button>
                <Button size="sm" variant="ghost" onClick={() => togglePause(t.place.id)}>
                  {t.paused ? '恢复' : '暂停'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(t.place.id)}>
                  移除
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      {pausedIds.length > 0 && (
        <Section title="已暂停" hint="还在计划里，但不进入执行时间线">
          <div className="flex flex-wrap gap-2">
            {pausedIds
              .map((id) => db.weekendDiscoveredPlaces?.find((p) => p.id === id))
              .filter((p): p is Place => !!p)
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => togglePause(p.id)}
                  className="focus-ring flex items-center gap-2 rounded-xl border-[1.5px] border-ink/15 bg-paperDeep px-3 py-1.5 text-[12.5px] font-semibold transition hover:border-ink"
                >
                  <span>{p.emoji}</span>
                  {p.name}
                  <span className="text-[11px] text-moss">恢复</span>
                </button>
              ))}
          </div>
        </Section>
      )}

      <Sheet open={!!swapPlace} onClose={() => setSwapPlace(null)} title="换一个地点">
        <div className="flex h-[60vh] flex-col gap-3">
          <p className="text-[12.5px] text-inkSoft">
            把「{swapPlace?.name}」换成另一个地点，顺序和时间保持不变。
          </p>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
            {candidates.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSwap(p.id)}
                className="focus-ring w-full rounded-xl border-[1.5px] border-ink/12 bg-white p-3 text-left transition hover:border-ink hover:shadow-note"
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border-[1.5px] border-ink/12 bg-paperDeep text-[18px]">
                    {p.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-bold">{p.name}</p>
                    <p className="mt-0.5 text-[11.5px] text-inkSoft">
                      {p.description || `${ACTIVITY_LABEL[p.category]} · ${p.durationMin ?? 90} 分钟`}
                    </p>
                  </div>
                  <span className="text-[12px] font-semibold text-amber">替换</span>
                </div>
              </button>
            ))}
            {candidates.length === 0 && (
              <p className="rounded-xl border-[1.5px] border-dashed border-ink/20 px-3 py-6 text-center text-[12.5px] text-inkFaint">
                候选池里暂无其他地点。先去周末探索页添加几个。
              </p>
            )}
          </div>
        </div>
      </Sheet>
    </div>
  );
}
