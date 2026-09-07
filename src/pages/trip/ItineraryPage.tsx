import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTripContext } from '@/hooks/useTrip';
import { useStore } from '@/services/store';
import { computeDayIntensity } from '@/services/intelligence';
import { PageHeader } from '@/components/layout';
import { ActivityRow } from '@/components/travel/Timeline';
import { RoutePickerModal, type RouteInitPoint } from '@/components/travel/RoutePicker';
import { PlaceDetail, PlacePool } from '@/components/travel/Place';
import { POISearch, mergedPlaces } from '@/features/destination/POISearch';
import { ConflictPanel } from '@/components/travel/Insight';
import { MockMap } from '@/components/travel/MockMap';
import { IntensityBadge } from '@/components/travel/TripBits';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Sheet,
  Tabs,
  Tag,
  cx,
  toast,
} from '@/components/ui';
import { addMinutes, fmtMDWeek, todayISO } from '@/utils/date';
import { ACTIVITY_LABEL, TRANSPORT_LABEL, money } from '@/utils/format';
import { getDestination } from '@/data/destinations';
import { resolveCityIds } from '@/data/places';
import type { Activity, ActivityType, Day, Place } from '@/types';

type DragPayload = { kind: 'place'; id: string } | { kind: 'activity'; id: string; fromIndex: number };

export function ItineraryPage() {
  const { tripId = '' } = useParams();
  const navigate = useNavigate();
  const ctx = useTripContext(tripId);
  const db = useStore((s) => s.db);
  const schedulePlace = useStore((s) => s.schedulePlace);
  const moveActivity = useStore((s) => s.moveActivity);
  const reorderActivity = useStore((s) => s.reorderActivity);
  const deleteActivity = useStore((s) => s.deleteActivity);
  const unscheduleActivity = useStore((s) => s.unscheduleActivity);
  const setActivityStatus = useStore((s) => s.setActivityStatus);
  const updateActivity = useStore((s) => s.updateActivity);
  const createActivity = useStore((s) => s.createActivity);
  const toggleSavePlace = useStore((s) => s.toggleSavePlace);
  const addDay = useStore((s) => s.addDay);
  const deleteTrip = useStore((s) => s.deleteTrip);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [dayId, setDayId] = useState<string>('');
  const [selectedActId, setSelectedActId] = useState<string | null>(null);
  const [inspectPlace, setInspectPlace] = useState<Place | null>(null);
  const [routeActivity, setRouteActivity] = useState<Activity | null>(null);
  const [swapActivity, setSwapActivity] = useState<Activity | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [poolOpen, setPoolOpen] = useState(false);
  const drag = useRef<DragPayload | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const scheduledIds = useMemo(
    () => new Set(db.activities.filter((a) => a.tripId === tripId && a.placeId).map((a) => a.placeId) as string[]),
    [db.activities, tripId],
  );

  // 当前 Trip 的城市列表（多城市有序），用于筛选发现地点与分组
  const cityIds = ctx ? resolveCityIds(ctx.trip) : [];

  // 当前 Trip 可调的发现地点 (POI 搜索得到的)，跨所有城市
  const discoveredHere = useMemo(
    () =>
      cityIds.length
        ? (db.travelDiscoveredPlaces ?? []).filter((p) => cityIds.includes(p.destinationId))
        : [],
    [db.travelDiscoveredPlaces, cityIds],
  );

  // 按城市把天数分组（连续同城的并成一组），用于顶部城市切换与每天标注
  const cityGroups = useMemo(() => {
    if (!ctx) return [];
    const out: { cityId: string; name: string; days: Day[] }[] = [];
    for (const d of ctx.days) {
      const cid = d.destinationId ?? ctx.trip.destinationId;
      const last = out[out.length - 1];
      if (last && last.cityId === cid) last.days.push(d);
      else out.push({ cityId: cid, name: getDestination(cid)?.name ?? cid, days: [d] });
    }
    return out;
  }, [ctx]);

  if (!ctx) return null;
  const { days, places, placeOf, actsOf } = ctx;

  const activeDay = days.find((d) => d.id === dayId) ?? days.find((d) => d.date === todayISO()) ?? days[0];
  const activeCityName = activeDay
    ? getDestination(activeDay.destinationId ?? ctx.trip.destinationId)?.name
    : '';
  const acts = activeDay ? actsOf(activeDay.id) : [];
  const savedIds = db.savedPlaces?.[tripId] ?? [];

  const intensity = activeDay
    ? computeDayIntensity(acts, placeOf)
    : { score: 0, level: 'low' as const, activityCount: 0, activeMinutes: 0, transitMinutes: 0 };

  const mapPoints = acts
    .filter((a) => a.placeId)
    .map((a, i) => ({
      place: placeOf(a.placeId)!,
      order: i,
      minutesFromPrev: a.transportMin,
      done: a.status === 'done',
    }))
    .filter((p) => p.place);

  const onDropDay = (targetDayId: string, index?: number) => {
    const payload = drag.current;
    drag.current = null;
    setDragOver(null);
    if (!payload) return;
    if (payload.kind === 'place') {
      const created = schedulePlace(targetDayId, payload.id);
      if (created) toast(`已加入「${created.title}」`, 'good');
      return;
    }
    const target = days.find((d) => d.id === targetDayId);
    if (!target) return;
    if (targetDayId === activeDay?.id && index !== undefined) {
      reorderActivity(targetDayId, payload.fromIndex, Math.min(index, acts.length - 1));
    } else {
      moveActivity(payload.id, targetDayId, index);
    }
  };

  const onUnschedulePlace = (pid: string) => {
    const a = acts.find((x) => x.placeId === pid);
    if (a) {
      unscheduleActivity(a.id);
      toast('已退回候选', 'warn');
    }
  };

  const handleSwap = (placeId: string) => {
    if (!swapActivity) return;
    const place = ctx.placeOf(placeId);
    if (!place) return;
    const duration = place.durationMin ?? 90;
    updateActivity(swapActivity.id, {
      placeId: place.id,
      title: place.name,
      type: place.category as ActivityType,
      estimatedCost: place.avgCost ?? 0,
      endTime: addMinutes(swapActivity.startTime, duration),
      note: place.requiredBooking ? '需要提前预约' : swapActivity.note,
    });
    toast(`已替换为「${place.name}」`, 'good');
    setSwapActivity(null);
  };

  const allow = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="行程"
        subtitle="把地点拖进某一天，或者让 AI 先给你一版。"
        action={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => navigate(`/trips/${tripId}/map`)}>
              ◎ 看地图
            </Button>
            <Button size="sm" variant="primary" onClick={() => navigate(`/trips/${tripId}/plan`)}>
              ✨ 帮我规划
            </Button>
            <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
              🗑 删除
            </Button>
          </div>
        }
      />

      <Tabs
        value={activeDay?.id ?? ''}
        onChange={(v) => setDayId(v)}
        options={days.map((d) => ({
          value: d.id,
          label: `D${d.index} · ${fmtMDWeek(d.date).replace(/\s.*/, '')}`,
        }))}
      />

      {cityGroups.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {cityGroups.map((g) => (
            <button
              key={g.cityId}
              onClick={() => setDayId(g.days[0].id)}
              className={cx(
                'focus-ring rounded-full border-[1.5px] px-3 py-1 text-[12px] font-semibold transition',
                g.days.some((d) => d.id === activeDay?.id)
                  ? 'border-ink bg-ink text-white'
                  : 'border-ink/15 bg-white text-inkSoft hover:border-ink/40',
              )}
            >
              {g.name} · {g.days.length} 天
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)_300px]">
        {/* 左：日期 */}
        <div className="hidden lg:block">
          <div className="card sticky top-4 space-y-1.5 p-2.5">
            {days.map((d) => {
              const a = actsOf(d.id);
              const lv = computeDayIntensity(a, placeOf).level;
              return (
                <button
                  key={d.id}
                  onClick={() => setDayId(d.id)}
                  onDragOver={(e) => {
                    allow(e);
                    setDragOver(d.id);
                  }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    onDropDay(d.id, a.length);
                  }}
                  className={cx(
                    'focus-ring w-full rounded-xl border-[1.5px] px-2.5 py-2 text-left transition',
                    d.id === activeDay?.id
                      ? 'border-ink bg-ink text-white'
                      : 'border-transparent hover:bg-paperDeep',
                    dragOver === d.id && 'border-dashed border-violet bg-violet/10',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-extrabold">D{d.index}</span>
                    <span
                      className={cx(
                        'h-1.5 w-1.5 rounded-full',
                        lv === 'high' ? 'bg-rose' : lv === 'medium' ? 'bg-amber' : 'bg-moss',
                      )}
                    />
                  </div>
                  <p className={cx('truncate text-[11px]', d.id === activeDay?.id ? 'text-white/75' : 'text-inkFaint')}>
                    {fmtMDWeek(d.date)}
                  </p>
                  <p className={cx('text-[10.5px]', d.id === activeDay?.id ? 'text-white/60' : 'text-inkFaint')}>
                    {a.length} 项
                  </p>
                </button>
              );
            })}
            <button
              onClick={() => addDay(tripId)}
              className="focus-ring w-full rounded-xl border-[1.5px] border-dashed border-ink/25 py-2 text-[12px] font-semibold text-inkSoft hover:border-ink/50"
            >
              + 加一天
            </button>
          </div>
        </div>

        {/* 中：当天时间轴 */}
        <div className="space-y-3">
          <Card className="p-3.5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[15px] font-extrabold">
                  {activeDay?.title ?? '未命名'} · {activeDay ? fmtMDWeek(activeDay.date) : ''}
                </p>
                {cityGroups.length > 1 && activeCityName && (
                  <p className="text-[11.5px] text-inkFaint">📍 {activeCityName}</p>
                )}
                <p className="text-[11.5px] text-inkFaint">
                  {intensity.activityCount} 个地点 · {Math.round(intensity.activeMinutes / 60)} 小时在玩 ·{' '}
                  {intensity.transitMinutes} 分钟在路上
                </p>
              </div>
              <div className="flex items-center gap-2">
                <IntensityBadge level={intensity.level} score={intensity.score} />
                <Button size="sm" variant="soft" onClick={() => setCustomOpen(true)}>
                  + 自定义
                </Button>
              </div>
            </div>

            {mapPoints.length > 0 && (
              <MockMap
                points={mapPoints}
                selectedId={selectedActId ? placeOf(acts.find((a) => a.id === selectedActId)?.placeId)?.id : undefined}
                onSelect={(pid) => {
                  const hit = acts.find((a) => a.placeId === pid);
                  if (hit) setSelectedActId(hit.id);
                }}
                className="h-40"
              />
            )}
          </Card>

          <div className="space-y-1.5">
            {acts.length === 0 && (
              <EmptyState
                emoji="🗓️"
                title="这天还是空的"
                desc="从右边的地点池拖一个进来，或者让 AI 排一版。如果这趟不打算去了，也可以直接删掉。"
                actions={
                  <>
                    <Button onClick={() => setPoolOpen(true)}>打开地点池</Button>
                    <Button variant="primary" onClick={() => navigate(`/trips/${tripId}/plan`)}>
                      帮我规划
                    </Button>
                    <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                      删除这趟旅行
                    </Button>
                  </>
                }
              />
            )}

            {acts.map((a, i) => (
              <div key={a.id}>
                <DropSlot
                  onDragOver={(e) => allow(e)}
                  onDrop={(e) => {
                    e.preventDefault();
                    onDropDay(activeDay!.id, i);
                  }}
                />
                <div className="flex items-start gap-1.5">
                  <div className="min-w-0 flex-1">
                    <ActivityRow
                      activity={a}
                      place={placeOf(a.placeId)}
                      selected={selectedActId === a.id}
                      onClick={() => setSelectedActId(a.id)}
                      onStatusChange={(s) => setActivityStatus(a.id, s)}
                      onPickRoute={() => setRouteActivity(a)}
                      onSwap={() => setSwapActivity(a)}
                      draggable
                      onDragStart={() => {
                        drag.current = { kind: 'activity', id: a.id, fromIndex: i };
                      }}
                    />
                  </div>
                  <div className="flex shrink-0 flex-col gap-1 pt-1">
                    <button
                      onClick={() => i > 0 && reorderActivity(activeDay!.id, i, i - 1)}
                      disabled={i === 0}
                      className="focus-ring rounded-md border-[1.5px] border-ink/12 px-1.5 text-[11px] disabled:opacity-30"
                      aria-label="上移"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`确定删除「${a.title}」？`)) {
                          deleteActivity(a.id);
                          toast('已删除', 'warn');
                        }
                      }}
                      className="focus-ring rounded-md border-[1.5px] border-rose/40 px-1.5 text-[11px] text-rose"
                      aria-label="删除"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {i < acts.length - 1 && acts[i + 1].transportMin > 0 && (
                  <div className="flex items-center gap-2 pl-[14px] text-[11px] text-inkFaint">
                    <span className="h-4 w-px bg-ink/20" />↓{' '}
                    {TRANSPORT_LABEL[acts[i + 1].transportMode] ?? '移动'} {acts[i + 1].transportMin} min
                  </div>
                )}
              </div>
            ))}
            {acts.length > 0 && (
              <DropSlot
                onDragOver={(e) => allow(e)}
                onDrop={(e) => {
                  e.preventDefault();
                  onDropDay(activeDay!.id, acts.length);
                }}
              />
            )}
          </div>

          {selectedActId && (
            <ActivityEditor
              activityId={selectedActId}
              onClose={() => setSelectedActId(null)}
            />
          )}

      {routeActivity && (
        <RoutePickerModal
          key={routeActivity.id}
          open
          onClose={() => setRouteActivity(null)}
          places={places}
          initialFrom={routeActivity.fromName ? { name: routeActivity.fromName } : null}
          initialTo={
            (() => {
              const p = routeActivity.placeId ? placeOf(routeActivity.placeId) : undefined;
              if (p) return { name: p.name, lng: p.lng, lat: p.lat, placeId: p.id };
              if (routeActivity.toName) return { name: routeActivity.toName };
              return null;
            })() as RouteInitPoint | null
          }
        />
      )}

      <Sheet open={!!swapActivity} onClose={() => setSwapActivity(null)} title="换一个地点">
        <div className="flex h-[60vh] flex-col gap-3">
          <p className="text-[12.5px] text-inkSoft">
            为「{swapActivity?.title}」换一个真实地点，时间、Day 和顺序保持不变。
          </p>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
            {places
              .filter((p) => p.id !== swapActivity?.placeId && !scheduledIds.has(p.id))
              .map((p) => (
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
                      <p className="mt-0.5 text-[11.5px] text-inkSoft">{p.description || `${ACTIVITY_LABEL[p.category]} · ${p.durationMin} 分钟`}</p>
                    </div>
                    <span className="text-[12px] font-semibold text-amber">替换</span>
                  </div>
                </button>
              ))}
            {places.filter((p) => p.id !== swapActivity?.placeId && !scheduledIds.has(p.id)).length === 0 && (
              <p className="rounded-xl border-[1.5px] border-dashed border-ink/20 px-3 py-6 text-center text-[12.5px] text-inkFaint">
                候选池里暂无其他可用地点。先去地点池添加，或搜索真实 POI。
              </p>
            )}
          </div>
        </div>
      </Sheet>
        </div>

        {/* 右：地点池 */}
        <div className="hidden lg:block">
          <div className="card sticky top-4 h-[calc(100vh-140px)] p-3">
            <PlacePool
              places={places}
              savedIds={savedIds}
              scheduledIds={scheduledIds}
              onSave={(pid) => toggleSavePlace(tripId, pid)}
              onSchedule={(pid) => {
                const created = schedulePlace(activeDay!.id, pid);
                if (created) toast(`已加入「${created.title}」`, 'good');
              }}
              onDragPlace={(pid) => {
                drag.current = { kind: 'place', id: pid };
              }}
              onInspect={(p) => setInspectPlace(p)}
              onUnschedulePlace={(pid) => onUnschedulePlace(pid)}
              title="地点池"
            />
          </div>
        </div>
      </div>

      <ConflictPanel
        conflicts={ctx.conflicts.filter((c) => !activeDay || c.dayId === activeDay.id)}
        title="这天需要注意"
      />

      {/* 移动端地点池 */}
      <div className="lg:hidden">
        <Button block onClick={() => setPoolOpen(true)}>
          打开地点池（{places.length} 个地点）
        </Button>
      </div>

      <Sheet open={poolOpen} onClose={() => setPoolOpen(false)} title="地点池">
        <div className="flex h-[60vh] flex-col">
          <POISearch destName={ctx.trip.destinationName} destId={ctx.trip.destinationId} />
          <div className="min-h-0 flex-1 pt-3">
            <PlacePool
              places={mergedPlaces(places, discoveredHere)}
              savedIds={savedIds}
              scheduledIds={scheduledIds}
              onSave={(pid) => toggleSavePlace(tripId, pid)}
              onSchedule={(pid) => {
                const created = schedulePlace(activeDay!.id, pid);
                if (created) {
                  toast(`已加入「${created.title}」`, 'good');
                  setPoolOpen(false);
                }
              }}
              onInspect={(p) => setInspectPlace(p)}
              onUnschedulePlace={(pid) => onUnschedulePlace(pid)}
            />
          </div>
        </div>
      </Sheet>

      <Sheet open={!!inspectPlace} onClose={() => setInspectPlace(null)} title="地点详情">
        {inspectPlace && (
          <PlaceDetail
            place={inspectPlace}
            saved={savedIds.includes(inspectPlace.id)}
            onSave={() => toggleSavePlace(tripId, inspectPlace.id)}
            days={days.map((d) => ({ id: d.id, label: `D${d.index} ${fmtMDWeek(d.date)}` }))}
            onSchedule={(d) => {
              schedulePlace(d, inspectPlace.id);
              toast(`已加入「${inspectPlace.name}」`, 'good');
              setInspectPlace(null);
            }}
          />
        )}
      </Sheet>

      <CustomActivityModal
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        onCreate={(title, type, startTime, note) => {
          createActivity({
            dayId: activeDay!.id,
            title,
            type,
            startTime,
            note,
          });
          setCustomOpen(false);
          toast('已添加', 'good');
        }}
      />

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="删除这趟旅行？"
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>取消</Button>
            <Button
              variant="danger"
              onClick={() => {
                deleteTrip(tripId);
                toast('旅行已删除', 'good');
                navigate('/');
              }}
            >
              删除
            </Button>
          </>
        }
      >
        <p className="muted">删除后行程、预算、清单、预订等所有关联数据都会被清空，无法恢复。</p>
        <p className="mt-2 text-[12px] text-inkFaint">
          {ctx.trip.title} · {ctx.trip.destinationName} · {days.length} 天
        </p>
      </Modal>
    </div>
  );
}

function DropSlot({
  onDragOver,
  onDrop,
}: {
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        onDragOver(e);
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        onDrop(e);
      }}
      className={cx(
        'h-2 rounded-full transition',
        over ? 'bg-violet/40' : 'bg-transparent',
      )}
    />
  );
}

// ── 活动编辑 ─────────────────────────────────────────────────
function ActivityEditor({ activityId, onClose }: { activityId: string; onClose: () => void }) {
  const db = useStore((s) => s.db);
  const updateActivity = useStore((s) => s.updateActivity);
  const a = db.activities.find((x) => x.id === activityId);
  const ctx = useTripContext(a?.tripId ?? '');
  if (!a) return null;

  const place = a.placeId ? ctx?.placeOf(a.placeId) : undefined;
  const placeOptions = ctx?.places ?? [];

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="h3">{a.title}</p>
        <Button size="sm" variant="ghost" onClick={onClose}>
          收起
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="开始">
          <Input
            type="time"
            value={a.startTime}
            onChange={(e) => updateActivity(a.id, { startTime: e.target.value })}
          />
        </Field>
        <Field label="结束">
          <Input
            type="time"
            value={a.endTime}
            onChange={(e) => updateActivity(a.id, { endTime: e.target.value })}
          />
        </Field>
        <Field label="类型">
          <Select
            value={a.type}
            onChange={(e) => updateActivity(a.id, { type: e.target.value as ActivityType })}
          >
            {Object.entries(ACTIVITY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="预计花费">
          <Input
            type="number"
            value={a.estimatedCost}
            onChange={(e) => updateActivity(a.id, { estimatedCost: Number(e.target.value) })}
          />
        </Field>
      </div>

      <Field label="关联地点" className="mt-3" hint="给酒店 / 交通 / 景点选一个真实地点，才能联动高德">
        <Select
          value={a.placeId ?? ''}
          onChange={(e) => updateActivity(a.id, { placeId: e.target.value || undefined })}
        >
          <option value="">不关联地点</option>
          {placeOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.emoji} {p.name} · {ACTIVITY_LABEL[p.category]}
            </option>
          ))}
        </Select>
      </Field>

      {a.type === 'transport' && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="起点">
            <Input
              value={a.fromName ?? ''}
              onChange={(e) => updateActivity(a.id, { fromName: e.target.value || undefined })}
              placeholder="如深圳宝安机场"
            />
          </Field>
          <Field label="终点">
            <Input
              value={a.toName ?? ''}
              onChange={(e) => updateActivity(a.id, { toName: e.target.value || undefined })}
              placeholder="如大理凤仪机场"
            />
          </Field>
          <Field label="航班号 / 高铁号">
            <Input
              value={a.transportNo ?? ''}
              onChange={(e) => updateActivity(a.id, { transportNo: e.target.value || undefined })}
              placeholder="如 CZ3456 / G1234"
            />
          </Field>
          <Field label="交通方式">
            <Select
              value={a.transportMode}
              onChange={(e) => updateActivity(a.id, { transportMode: e.target.value as Activity['transportMode'] })}
            >
              {Object.entries(TRANSPORT_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      <Field label="备注" className="mt-3">
        <Input value={a.note ?? ''} onChange={(e) => updateActivity(a.id, { note: e.target.value })} />
      </Field>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Tag tone={a.pinned ? 'amber' : 'gray'}>{a.pinned ? '📌 核心行程' : '普通安排'}</Tag>
        <div className="flex items-center gap-2">
          {place?.lng != null && place?.lat != null && (
            <a
              href={`https://uri.amap.com/navigation?to=${place.lng},${place.lat},${encodeURIComponent(place.name)}&mode=car&coordinate=gaode&callnative=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring rounded-lg border-[1.5px] border-azure/40 bg-azure/10 px-3 py-1.5 text-[12px] font-semibold text-azure"
            >
              去这里
            </a>
          )}
          <Button size="sm" onClick={() => updateActivity(a.id, { pinned: !a.pinned })}>
            {a.pinned ? '取消核心' : '设为核心'}
          </Button>
        </div>
      </div>
      <p className="mt-3 text-[11.5px] text-inkFaint">
        预计花费 {money(a.estimatedCost)} · 该改动会同步到预算预测
      </p>
    </Card>
  );
}

// ── 自定义活动 ───────────────────────────────────────────────
function CustomActivityModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (title: string, type: ActivityType, startTime: string, note: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ActivityType>('other');
  const [startTime, setStartTime] = useState('10:00');
  const [note, setNote] = useState('');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="添加一个自定义安排"
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            disabled={!title.trim()}
            onClick={() => {
              onCreate(title.trim(), type, startTime, note.trim());
              setTitle('');
              setNote('');
            }}
          >
            添加
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="做什么">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="比如在便利店买早餐" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="类型">
            <Select value={type} onChange={(e) => setType(e.target.value as ActivityType)}>
              {Object.entries(ACTIVITY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="开始时间">
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
        </div>
        <Field label="备注">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="可选" />
        </Field>
      </div>
    </Modal>
  );
}
