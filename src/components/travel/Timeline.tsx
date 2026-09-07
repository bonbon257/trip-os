import type { Activity, ActivityStatus, Place } from '@/types';
import { Tag, cx } from '@/components/ui';
import { ACTIVITY_LABEL, TRANSPORT_LABEL, money } from '@/utils/format';
import { amapNavUrl } from '@/utils/amap';
import { IntensityBadge } from './TripBits';

const TYPE_TONE: Record<string, 'violet' | 'azure' | 'amber' | 'moss' | 'rose' | 'gray'> = {
  sight: 'azure',
  food: 'amber',
  shopping: 'rose',
  transport: 'gray',
  stay: 'violet',
  nature: 'moss',
  culture: 'violet',
  entertainment: 'rose',
  free: 'gray',
  other: 'gray',
};

export function ActivityRow({
  activity,
  place,
  selected,
  onClick,
  onStatusChange,
  onPickRoute,
  onSwap,
  draggable,
  onDragStart,
  compact,
  showCost = true,
}: {
  activity: Activity;
  place?: Place;
  selected?: boolean;
  onClick?: () => void;
  onStatusChange?: (status: ActivityStatus) => void;
  onPickRoute?: () => void;
  onSwap?: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  compact?: boolean;
  showCost?: boolean;
}) {
  const skipped = activity.status === 'skipped';
  const done = activity.status === 'done';
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      className={cx(
        'group flex gap-3 rounded-xl border-[1.5px] bg-white px-3 py-2.5 transition',
        selected ? 'border-ink shadow-note' : 'border-ink/12 hover:border-ink/40',
        draggable && 'cursor-grab active:cursor-grabbing',
        (skipped || done) && 'opacity-55',
      )}
    >
      <div className="w-[46px] shrink-0 pt-0.5">
        <p className="text-[13px] font-extrabold tabular-nums leading-none">{activity.startTime}</p>
        <p className="mt-0.5 text-[10.5px] text-inkFaint tabular-nums leading-none">{activity.endTime}</p>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px]">{place?.emoji ?? '•'}</span>
          <p className={cx('truncate text-[13.5px] font-bold', (skipped || done) && 'line-through')}>
            {activity.title}
          </p>
          {activity.pinned && <span className="text-[11px]" title="核心行程">📌</span>}
        </div>
        {!compact && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Tag tone={TYPE_TONE[activity.type] ?? 'gray'}>{ACTIVITY_LABEL[activity.type]}</Tag>
            {activity.type === 'transport' && (activity.fromName || activity.toName) && (
              <span className="text-[11px] text-inkFaint">
                {activity.fromName ?? '出发地'} → {activity.toName ?? '目的地'}
              </span>
            )}
            {activity.transportNo && (
              <span className="rounded-md bg-ink/8 px-1.5 py-0.5 text-[10.5px] font-semibold text-inkSoft">
                {activity.transportNo}
              </span>
            )}
            {!!activity.transportMin && (
              <span className="text-[11px] text-inkFaint">
                {TRANSPORT_LABEL[activity.transportMode] ?? '移动'} {activity.transportMin} min
              </span>
            )}
            {showCost && !!activity.estimatedCost && (
              <span className="text-[11px] text-inkFaint">{money(activity.estimatedCost)}</span>
            )}
            {activity.note && (
              <span className="truncate text-[11px] text-inkFaint">· {activity.note}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 self-center" onClick={(e) => e.stopPropagation()}>
        {onSwap && (
          <button
            onClick={onSwap}
            className="focus-ring rounded-lg border-[1.5px] border-amber/40 bg-amber/10 px-2 py-1 text-[11px] font-semibold text-amber"
            title="换一个地点"
          >
            换一个
          </button>
        )}
        {onPickRoute && (
          <button
            onClick={onPickRoute}
            className="focus-ring rounded-lg border-[1.5px] border-violet/40 bg-violet/10 px-2 py-1 text-[11px] font-semibold text-violet"
            title="选择起点终点，跳高德打车 / 导航"
          >
            选路线
          </button>
        )}
        {place?.lng != null && place?.lat != null && (
          <a
            href={amapNavUrl(null, place)}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring rounded-lg border-[1.5px] border-azure/40 bg-azure/10 px-2 py-1 text-[11px] font-semibold text-azure"
            title="用高德导航 / 打车"
          >
            去这里
          </a>
        )}
        {onStatusChange && (
          <>
            {done ? (
              <button
                onClick={() => onStatusChange('planned')}
                className="focus-ring rounded-lg border-[1.5px] border-moss/40 bg-moss/12 px-2 py-1 text-[11px] font-bold text-moss"
              >
                已完成
              </button>
            ) : (
              <button
                onClick={() => onStatusChange('done')}
                className="focus-ring rounded-lg border-[1.5px] border-ink/15 px-2 py-1 text-[11px] font-semibold text-inkSoft hover:border-ink"
              >
                完成
              </button>
            )}
            <button
              onClick={() => onStatusChange(skipped ? 'planned' : 'skipped')}
              className={cx(
                'focus-ring rounded-lg border-[1.5px] px-2 py-1 text-[11px] font-semibold',
                skipped ? 'border-rose/40 bg-rose/10 text-rose' : 'border-ink/15 text-inkSoft hover:border-ink',
              )}
              title={skipped ? '恢复这个安排' : '先暂停，不删除'}
            >
              {skipped ? '恢复' : '暂停'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function TransitNode({ minutes, mode }: { minutes: number; mode: string }) {
  if (!minutes) return null;
  return (
    <div className="flex items-center gap-2 pl-[14px] text-[11px] text-inkFaint">
      <span className="h-4 w-px bg-ink/20" />
      <span>
        ↓ {TRANSPORT_LABEL[mode] ?? '移动'} {minutes} min
      </span>
    </div>
  );
}

export function Timeline({
  activities,
  placeOf,
  selectedId,
  onSelect,
  onStatusChange,
  onPickRoute,
  onSwap,
  draggable,
  onDragStart,
  showTransit = true,
  compact,
  intensity,
  emptyText = '这天还没有安排',
}: {
  activities: Activity[];
  placeOf: (id?: string) => Place | undefined;
  selectedId?: string;
  onSelect?: (id: string) => void;
  onStatusChange?: (id: string, status: ActivityStatus) => void;
  onPickRoute?: (activity: Activity) => void;
  onSwap?: (activity: Activity) => void;
  draggable?: boolean;
  onDragStart?: (id: string) => void;
  showTransit?: boolean;
  compact?: boolean;
  intensity?: { level: 'low' | 'medium' | 'high'; score: number };
  emptyText?: string;
}) {
  if (!activities.length) {
    return (
      <div className="rounded-xl border-[1.5px] border-dashed border-ink/20 px-3 py-6 text-center text-[12.5px] text-inkFaint">
        {emptyText}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {intensity && (
        <div className="mb-1 flex items-center justify-between">
          <span className="label">当日强度</span>
          <IntensityBadge level={intensity.level} score={intensity.score} />
        </div>
      )}
      {activities.map((a, i) => (
        <div key={a.id} className="space-y-1">
          {showTransit && i > 0 && <TransitNode minutes={a.transportMin} mode={a.transportMode} />}
          <ActivityRow
            activity={a}
            place={placeOf(a.placeId)}
            selected={selectedId === a.id}
            onClick={onSelect ? () => onSelect(a.id) : undefined}
            onStatusChange={onStatusChange ? (s) => onStatusChange(a.id, s) : undefined}
            onPickRoute={
              onPickRoute && (a.type === 'transport' || a.type === 'stay' || a.fromName || a.toName)
                ? () => onPickRoute(a)
                : undefined
            }
            onSwap={onSwap ? () => onSwap(a) : undefined}
            draggable={draggable}
            onDragStart={onDragStart ? () => onDragStart(a.id) : undefined}
            compact={compact}
          />
        </div>
      ))}
    </div>
  );
}
