import type { Intensity, Trip } from '@/types';
import { Ring, StatCard, Tag, cx } from '@/components/ui';
import { countdownText } from '@/services/intelligence';
import { fmtMD } from '@/utils/date';
import { INTENSITY_CLASS, INTENSITY_LABEL, money } from '@/utils/format';

export function TripCard({
  trip,
  prep,
  conflicts,
  onClick,
}: {
  trip: Trip;
  prep: number;
  conflicts?: number;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card group w-full overflow-hidden text-left transition hover:-translate-y-[1px] hover:shadow-noteLg"
    >
      <div className="flex items-center gap-3 p-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border-[1.5px] border-ink bg-paperDeep text-[24px]">
          {trip.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[15px] font-extrabold">{trip.title}</p>
            {trip.status === 'traveling' && <Tag tone="moss">旅行中</Tag>}
            {trip.status === 'completed' && <Tag tone="gray">已完成</Tag>}
          </div>
          <p className="muted mt-0.5 truncate">
            {fmtMD(trip.startDate)} — {fmtMD(trip.endDate)} · {countdownText(trip)}
          </p>
          {!!conflicts && (
            <p className="mt-1 text-[11px] font-semibold text-rose">{conflicts} 项待处理</p>
          )}
        </div>
        <Ring
          value={prep}
          size={54}
          tone={prep >= 80 ? '#22A06B' : prep >= 50 ? '#7C5CFF' : '#FFC53D'}
        />
      </div>
    </button>
  );
}

export function StatGrid({
  items,
}: {
  items: {
    label: string;
    value: string;
    hint?: string;
    progress?: number;
    tone?: 'violet' | 'azure' | 'amber' | 'moss' | 'rose' | 'ink';
    emoji?: string;
    onClick?: () => void;
  }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((i) => (
        <StatCard key={i.label} {...i} />
      ))}
    </div>
  );
}

export function IntensityBadge({
  level,
  score,
  className,
}: {
  level: Intensity;
  score?: number;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border-[1.5px] px-2 py-0.5 text-[11px] font-bold',
        INTENSITY_CLASS[level],
        className,
      )}
    >
      {level === 'low' ? '·' : level === 'medium' ? '··' : '···'}
      {INTENSITY_LABEL[level]}
      {score !== undefined && <span className="text-[10px] opacity-70">{score}</span>}
    </span>
  );
}

export function BudgetLine({
  spent,
  total,
  className,
}: {
  spent: number;
  total: number;
  className?: string;
}) {
  const ratio = total ? Math.min(100, (spent / total) * 100) : 0;
  const over = spent > total;
  return (
    <div className={cx('space-y-1', className)}>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="font-bold tabular-nums">{money(spent)}</span>
        <span className="text-inkFaint tabular-nums">/ {money(total)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
        <div
          className={cx('h-full rounded-full transition-all', over ? 'bg-rose' : ratio > 85 ? 'bg-amber' : 'bg-moss')}
          style={{ width: `${Math.max(2, ratio)}%` }}
        />
      </div>
    </div>
  );
}
