import { useMemo, useState } from 'react';
import { useStore } from '@/services/store';
import { Card, Section, Tag } from '@/components/ui';
import { MockMap, type MapPoint } from '@/components/travel/MockMap';
import { addMinutes, fmtMDWeek, upcomingSaturday } from '@/utils/date';
import { geoKmBetween } from '@/services/route';
import type { Place } from '@/types';

/**
 * /weekend/today —— 周末当天视图
 *
 * 周六/周日要看的是：现在到了哪一站、下一站怎么走。
 * 非周末时间显示倒计时和「先去规划」。
 */
export function WeekendTodayPage() {
  const db = useStore((s) => s.db);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const weekendOf = upcomingSaturday();
  const plan = db.weekendPlans?.find((p) => p.weekendOf === weekendOf);
  const homeCity = useStore((s) => s.settings.homeCity);

  const places = useMemo<Place[]>(() => {
    if (!plan) return [];
    return plan.placeIds
      .map((id) => db.weekendDiscoveredPlaces?.find((p) => p.id === id))
      .filter((p): p is Place => !!p);
  }, [plan, db.weekendDiscoveredPlaces]);

  const dayName = useMemo(() => {
    const d = new Date();
    const names = ['周日','周一','周二','周三','周四','周五','周六'];
    return names[d.getDay()];
  }, []);

  if (!plan || places.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="h2">{fmtMDWeek(weekendOf)}</p>
        <p className="muted mt-2">今天还没有计划。去周末先挑几个地方。</p>
        <a
          href="/weekend/where"
          className="mt-4 inline-block rounded-xl border-[1.5px] border-ink bg-ink px-4 py-2 text-[13px] font-bold text-white"
        >
          去挑地方 →
        </a>
      </Card>
    );
  }

  const first = places[0]!;
  const mapPoints: MapPoint[] = places.map((p, i) => ({ place: p, order: i }));

  // 时间线（简化：每站默认 90 min 停留 + 上站间估算）
  let cursor = '09:30';
  const timeline = places.map((p, i) => {
    const prev = places[i - 1];
    const km =
      prev && p.lat && p.lng && prev.lat && prev.lng
        ? geoKmBetween({ lat: prev.lat, lng: prev.lng }, { lat: p.lat, lng: p.lng }) ?? 0
        : 0;
    const travelMin = i === 0 ? 0 : Math.max(10, Math.round(km * 4));
    const arrival = i === 0 ? cursor : addMinutes(cursor, travelMin);
    const stay = p.durationMin ?? 90;
    const leave = addMinutes(arrival, stay);
    cursor = leave;
    return { place: p, arrival, leave, stay, travelMin, km };
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-[11.5px] font-bold tracking-wider text-inkFaint">今天</p>
        <p className="mt-0.5 flex flex-wrap items-baseline gap-2">
          <span className="text-[18px] font-extrabold">{fmtMDWeek(weekendOf)}</span>
          <Tag>{dayName}</Tag>
          <span className="text-[12px] text-inkSoft">{homeCity}</span>
        </p>
        <p className="mt-2 text-[13px] text-inkSoft">
          下一站：<span className="font-bold text-ink">{first.emoji} {first.name}</span>
          {first.address ? ` · ${first.address}` : ''}
        </p>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="h-56 w-full sm:h-72">
          <MockMap points={mapPoints} selectedId={selectedId ?? undefined} onSelect={setSelectedId} />
        </div>
      </Card>

      <Section title="时间线" hint="先按这个顺序走，时间赶就跳下一站">
        <div className="space-y-3">
          {timeline.map((t, i) => (
            <Card
              key={t.place.id}
              className={
                selectedId === t.place.id ? 'border-violet bg-violet/8 p-4' : 'border-ink/15 p-4'
              }
              onClick={() => setSelectedId(t.place.id)}
            >
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border-[1.5px] border-ink bg-paperDeep text-[18px]">
                  {t.place.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-[15px] font-bold">{t.place.name}</h3>
                    <span className="text-[12px] text-inkSoft">{t.arrival} – {t.leave}</span>
                  </div>
                  <p className="text-[12px] text-inkSoft">
                    {i === 0 ? '从市区出发' : `约 ${t.travelMin} min 路程`}
                    {t.place.address ? ` · ${t.place.address}` : ''}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Section>
    </div>
  );
}