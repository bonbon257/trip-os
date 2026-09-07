import { useEffect, useState } from 'react';
import { useStore } from '@/services/store';
import { Card, Section } from '@/components/ui';
import { useCityCenter } from '@/hooks/useCityCenter';
import { planRoute } from '@/services/amap';
import { upcomingSaturday } from '@/utils/date';

/**
 * /weekend/ai —— AI 安排
 *
 * 真实路径规划（高德 /api/map/route）：从你的位置出发，
 * 串起周末计划里的每个地点，给出总时长与折线。
 *
 * 与 WeekendPlan 的区别：这个页面是**单次问 AI**：点一下，
 * 把整个计划压成"实际要多久 / 怎么走"。
 */
export function WeekendAIPage() {
  const db = useStore((s) => s.db);
  const { center } = useCityCenter();
  const weekendOf = upcomingSaturday();
  const plan = db.weekendPlans?.find((p) => p.weekendOf === weekendOf);
  const places = plan?.placeIds
    .map((id) => db.weekendDiscoveredPlaces?.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p) ?? [];

  const [result, setResult] = useState<{
    minutes: number;
    distance: number;
    polyline: Array<[number, number]>;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (places.length < 2 || !center) return;
    setLoading(true);
    setErr(null);
    const origin = center;
    const dest = places[places.length - 1]!;
    const wps = places.slice(0, -1).map((p) => ({ lat: p.lat ?? 0, lng: p.lng ?? 0 }));
    planRoute(origin, { lat: dest.lat ?? 0, lng: dest.lng ?? 0 }, 'driving', wps)
      .then((r) => {
        setLoading(false);
        if (r) setResult(r);
        else setErr('路径规划失败，请稍后再试。');
      })
      .catch(() => {
        setLoading(false);
        setErr('路径规划失败，请稍后再试。');
      });
  }, [places.length, center?.lat, center?.lng]);

  if (places.length < 2) {
    return (
      <Card className="p-6 text-center">
        <p className="text-[15px] font-bold">至少要 2 个地方才能算路线</p>
        <p className="muted mt-2">先去计划里加几个。</p>
        <a
          href="/weekend/where"
          className="mt-4 inline-block rounded-xl border-[1.5px] border-ink bg-ink px-4 py-2 text-[13px] font-bold text-white"
        >
          去挑地方 →
        </a>
      </Card>
    );
  }

  if (!center) {
    return (
      <Card className="p-5">
        <p className="text-[14px] font-bold">还没拿到你的位置</p>
        <p className="muted mt-2 text-[12.5px]">
          没有起点，没法算真实路线。在「设置」里确认所在城市，或者点浏览器地址栏左侧的「使用位置」。
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-[11.5px] font-bold tracking-wider text-inkFaint">AI 安排</p>
        <p className="mt-1 text-[14px] font-bold">按你当前的位置串一遍这周末</p>
        <p className="muted mt-1 text-[12px]">
          基于高德真实路径规划（驾车），总时长 / 路程按路上实际计算。
        </p>
      </Card>

      {loading && (
        <Card className="p-4">
          <p className="muted">正在算……</p>
        </Card>
      )}

      {err && (
        <Card className="border-rose/40 bg-rose/5 p-4">
          <p className="text-[13px] text-rose">{err}</p>
        </Card>
      )}

      {result && (
        <Section title="实际怎么走" hint="高德驾车路径规划">
          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="p-4">
              <p className="text-[11px] font-bold text-inkFaint">路上总时长</p>
              <p className="mt-1 text-[22px] font-extrabold">
                {Math.round(result.minutes)} <span className="text-[14px] text-inkSoft">min</span>
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] font-bold text-inkFaint">总路程</p>
              <p className="mt-1 text-[22px] font-extrabold">
                {(result.distance / 1000).toFixed(1)} <span className="text-[14px] text-inkSoft">km</span>
              </p>
            </Card>
          </div>
          <Card className="mt-3 p-3">
            <p className="text-[12px] text-inkSoft">
              {places.length} 站：从当前位置 → {places.slice(0, -1).map((p) => p.name).join(' → ')} →{' '}
              {places[places.length - 1]!.name}
            </p>
          </Card>
          <a
            href="/weekend/plan"
            className="mt-3 inline-block rounded-xl border-[1.5px] border-ink bg-ink px-4 py-2 text-[13px] font-bold text-white"
          >
            查看时间线 →
          </a>
        </Section>
      )}
    </div>
  );
}