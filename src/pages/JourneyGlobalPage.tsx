import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '@/services/store';
import { PageHeader } from '@/components/layout';
import { Button, Card, EmptyState, Tag, cx } from '@/components/ui';
import { fmtCN } from '@/utils/date';

/**
 * /journey —— 全局 Journey（Aggregator）
 * ────────────────────────────────────────────────────────────
 *
 * 用 Adapter / Aggregator 的方式把两类记录统一展示，**不迁移任何数据**：
 *   · Travel Journey  → db.journals（按 tripId 关联到某次旅行）
 *   · Weekend Journey → db.weekendPlans 里已完成的（status === 'done'）
 *
 * 保留 /trips/:tripId/journey 作为兼容入口（重定向到 /journey?tripId=xxx），
 * 现有 Trip Journey 的数据结构一行不改。
 */

interface JourneyItem {
  id: string;
  kind: 'TRAVEL' | 'WEEKEND';
  title: string;
  date: string;
  mood?: string;
  note: string;
  placeNames: string[];
  /** 旅行记录可点进原旅行 */
  tripId?: string;
  tripTitle?: string;
}

export function JourneyGlobalPage() {
  const db = useStore((s) => s.db);
  const [params] = useSearchParams();
  const focusTripId = params.get('tripId');

  const items = useMemo<JourneyItem[]>(() => {
    const travel: JourneyItem[] = db.journals
      .filter((j) => !focusTripId || j.tripId === focusTripId)
      .map((j) => ({
        id: j.id,
        kind: 'TRAVEL' as const,
        title: j.title,
        date: j.date,
        mood: j.mood,
        note: j.note,
        placeNames: j.placeNames ?? [],
        tripId: j.tripId,
        tripTitle: db.trips.find((t) => t.id === j.tripId)?.title,
      }));

    // 周末记录：已完成（done）的周末计划，地点名从周末地点池里取
    const weekend: JourneyItem[] = (db.weekendPlans ?? [])
      .filter((p) => p.status === 'done' && !focusTripId)
      .map((p) => ({
        id: p.id,
        kind: 'WEEKEND' as const,
        title: p.title ?? '周末',
        date: p.weekendOf,
        note: p.note ?? '',
        placeNames: p.placeIds
          .map((id) => db.weekendDiscoveredPlaces?.find((x) => x.id === id)?.name)
          .filter((n): n is string => !!n),
      }));

    return [...travel, ...weekend].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [db.journals, db.weekendPlans, db.trips, db.weekendDiscoveredPlaces, focusTripId]);

  const focusTrip = focusTripId ? db.trips.find((t) => t.id === focusTripId) : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        back
        title="Journey"
        subtitle={
          focusTrip
            ? `${focusTrip.title} · 这次旅行发生过什么`
            : '旅行和周末都记在这儿——去过哪、做了什么、当时的心情。'
        }
      />

      {focusTrip && (
        <Card className="p-3">
          <Link to={`/trips/${focusTrip.id}/journey`} className="text-[13px] font-semibold text-inkSoft hover:text-ink">
            查看这次旅行的完整 Journey →
          </Link>
        </Card>
      )}

      {items.length === 0 ? (
        <EmptyState
          emoji="🗺️"
          title="还没有记录"
          desc="旅行途中写点什么，或者把去过的地方标记成「去过」，这里就会慢慢长出来。"
        />
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <Card key={`${it.kind}-${it.id}`} className="p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-[1.5px] border-ink/15 bg-paperDeep text-[18px]">
                  {it.kind === 'TRAVEL' ? '✈️' : '☀'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[15px] font-bold">
                      {it.mood ? `${it.mood} ` : ''}
                      {it.title}
                    </h3>
                    <Tag tone={it.kind === 'TRAVEL' ? 'violet' : 'amber'}>
                      {it.kind === 'TRAVEL' ? '旅行' : '周末'}
                    </Tag>
                    <span className="text-[12px] text-inkSoft">{fmtCN(it.date)}</span>
                  </div>
                  {it.tripTitle && (
                    <p className="mt-0.5 text-[12px] text-inkFaint">{it.tripTitle}</p>
                  )}
                  {it.note && <p className="mt-1.5 text-[13px] text-inkSoft">{it.note}</p>}
                  {it.placeNames.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {it.placeNames.map((n) => (
                        <span
                          key={n}
                          className={cx(
                            'rounded-full border-[1.5px] border-ink/15 px-2 py-0.5 text-[11.5px]',
                          )}
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                  )}
                  {it.kind === 'TRAVEL' && it.tripId && (
                    <Link
                      to={`/trips/${it.tripId}/journey`}
                      className="mt-2 inline-block text-[12.5px] font-semibold text-inkSoft hover:text-ink"
                    >
                      看这次旅行的详情 →
                    </Link>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!focusTripId && db.trips.length > 0 && (
        <Card className="p-4">
          <p className="text-[13px] font-bold">按旅行查看</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {db.trips.map((t) => (
              <Link key={t.id} to={`/journey?tripId=${t.id}`}>
                <Button size="sm" variant="ghost">
                  {t.emoji} {t.title}
                </Button>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
