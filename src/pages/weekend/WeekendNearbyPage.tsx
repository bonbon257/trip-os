import { WeekendExploreView } from '@/features/weekend/WeekendExploreView';

/** /weekend/nearby —— 附近看看（3km 内的综合一圈） */
export function WeekendNearbyPage() {
  return (
    <div className="space-y-4">
      <header>
        <p className="label">附近看看</p>
        <p className="muted mt-1 text-[12.5px]">只看 3 km 以内的，走路或骑个车就到。</p>
      </header>
      <WeekendExploreView title="附近这些" keywords={['咖啡', '公园', '商场']} maxKm={3} />
    </div>
  );
}
