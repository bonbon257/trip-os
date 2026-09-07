import { useMemo, useState } from 'react';
import type { Place } from '@/types';
import { ACTIVITY_LABEL, money } from '@/utils/format';
import { Chip, Input, Tag, cx } from '@/components/ui';
import { durationText } from '@/utils/date';

export function PlaceCard({
  place,
  saved,
  onSave,
  onSchedule,
  draggable,
  onDragStart,
  onClick,
  scheduled,
  onUnschedulePlace,
  className,
}: {
  place: Place;
  saved?: boolean;
  onSave?: () => void;
  onSchedule?: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onClick?: () => void;
  scheduled?: boolean;
  onUnschedulePlace?: () => void;
  className?: string;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      className={cx(
        'group rounded-xl border-[1.5px] bg-white p-3 transition',
        scheduled ? 'border-ink/10 opacity-70' : 'border-ink/12 hover:border-ink hover:shadow-note',
        draggable && 'cursor-grab active:cursor-grabbing',
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border-[1.5px] border-ink/12 bg-paperDeep text-[16px]">
          {place.emoji}
        </span>
        <div className="min-w-0 flex-1" onClick={onClick}>
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[13.5px] font-bold">{place.name}</p>
            {place.requiredBooking && <span className="text-[10px] text-rose">需预约</span>}
          </div>
          <p className="mt-0.5 text-[11px] text-inkFaint">
            ★ {place.rating?.toFixed(1) ?? '—'} · {durationText(place.durationMin)} ·{' '}
            {place.avgCost ? money(place.avgCost) : '免费'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onSave && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSave();
              }}
              className={cx(
                'focus-ring grid h-7 w-7 place-items-center rounded-lg border-[1.5px] text-[13px] transition',
                saved ? 'border-amber/70 bg-amber/35' : 'border-ink/12 hover:border-ink',
              )}
              title={saved ? '取消收藏' : '收藏'}
            >
              {saved ? '★' : '☆'}
            </button>
          )}
          {onSchedule && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSchedule();
              }}
              className="focus-ring grid h-7 w-7 place-items-center rounded-lg border-[1.5px] border-ink bg-ink text-[15px] leading-none text-white transition hover:bg-ink/85"
              title="加入这天"
            >
              +
            </button>
          )}
          {scheduled && onUnschedulePlace && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUnschedulePlace();
              }}
              className="focus-ring grid h-7 place-items-center rounded-lg border-[1.5px] border-ink/15 px-1.5 text-[11px] font-semibold text-inkSoft transition hover:border-ink/40 hover:text-ink"
              title="退回候选"
            >
              退回候选
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <Tag tone="gray">{ACTIVITY_LABEL[place.category]}</Tag>
        {place.indoor && <Tag tone="moss">室内</Tag>}
        {place.tags.slice(0, 2).map((t) => (
          <Tag key={t} tone="violet">
            {t}
          </Tag>
        ))}
      </div>
    </div>
  );
}

export function PlacePool({
  places,
  savedIds,
  scheduledIds,
  onSave,
  onSchedule,
  onDragPlace,
  onInspect,
  onUnschedulePlace,
  title = '地点池',
}: {
  places: Place[];
  savedIds: string[];
  scheduledIds: Set<string>;
  onSave: (placeId: string) => void;
  onSchedule: (placeId: string) => void;
  onDragPlace?: (placeId: string) => void;
  onInspect?: (place: Place) => void;
  onUnschedulePlace?: (placeId: string) => void;
  title?: string;
}) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [onlySaved, setOnlySaved] = useState(false);

  const categories = useMemo(() => {
    const set = new Set(places.map((p) => p.category));
    return ['all', ...Array.from(set)];
  }, [places]);

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return places.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      if (onlySaved && !savedIds.includes(p.id)) return false;
      if (!kw) return true;
      return (
        p.name.toLowerCase().includes(kw) ||
        p.tags.some((t) => t.toLowerCase().includes(kw)) ||
        (p.description ?? '').toLowerCase().includes(kw)
      );
    });
  }, [places, q, category, onlySaved, savedIds]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-extrabold">{title}</p>
          <span className="text-[11px] text-inkFaint">{list.length} 个</span>
        </div>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索地点或标签" />
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {categories.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)} className="shrink-0 text-[12px]">
              {c === 'all' ? '全部' : ACTIVITY_LABEL[c as keyof typeof ACTIVITY_LABEL] ?? c}
            </Chip>
          ))}
        </div>
        <button
          onClick={() => setOnlySaved((v) => !v)}
          className={cx(
            'text-[12px] font-semibold',
            onlySaved ? 'text-ink underline' : 'text-inkFaint hover:text-ink',
          )}
        >
          {onlySaved ? '✓ 只看收藏' : '只看收藏'}
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
        {list.map((p) => (
          <PlaceCard
            key={p.id}
            place={p}
            saved={savedIds.includes(p.id)}
            scheduled={scheduledIds.has(p.id)}
            onSave={() => onSave(p.id)}
            onSchedule={() => onSchedule(p.id)}
            onUnschedulePlace={onUnschedulePlace ? () => onUnschedulePlace(p.id) : undefined}
            draggable={!!onDragPlace}
            onDragStart={onDragPlace ? () => onDragPlace(p.id) : undefined}
            onClick={onInspect ? () => onInspect(p) : undefined}
          />
        ))}
        {!list.length && (
          <p className="rounded-xl border-[1.5px] border-dashed border-ink/20 px-3 py-6 text-center text-[12.5px] text-inkFaint">
            没有匹配的地点
          </p>
        )}
      </div>
    </div>
  );
}

export function PlaceDetail({
  place,
  saved,
  onSave,
  days,
  onSchedule,
}: {
  place: Place;
  saved: boolean;
  onSave: () => void;
  days: { id: string; label: string }[];
  onSchedule: (dayId: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border-[1.5px] border-ink bg-paperDeep text-[24px]">
          {place.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-extrabold">{place.name}</p>
          <p className="muted mt-0.5">{place.description}</p>
        </div>
        <button
          onClick={onSave}
          className={cx(
            'focus-ring rounded-lg border-[1.5px] px-2 py-1 text-[12px] font-bold',
            saved ? 'border-amber/70 bg-amber/35' : 'border-ink/15 hover:border-ink',
          )}
        >
          {saved ? '★ 已收藏' : '☆ 收藏'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[12.5px]">
        <div className="rounded-xl border-[1.5px] border-ink/12 px-3 py-2">
          <p className="text-[11px] text-inkFaint">建议停留</p>
          <p className="font-bold">{durationText(place.durationMin)}</p>
        </div>
        <div className="rounded-xl border-[1.5px] border-ink/12 px-3 py-2">
          <p className="text-[11px] text-inkFaint">人均</p>
          <p className="font-bold">{place.avgCost ? money(place.avgCost) : '免费'}</p>
        </div>
        <div className="rounded-xl border-[1.5px] border-ink/12 px-3 py-2">
          <p className="text-[11px] text-inkFaint">开放时间</p>
          <p className="font-bold">
            {place.open && place.open !== '00:00' ? `${place.open} – ${place.close}` : '全天'}
          </p>
        </div>
        <div className="rounded-xl border-[1.5px] border-ink/12 px-3 py-2">
          <p className="text-[11px] text-inkFaint">适合天气</p>
          <p className="font-bold">{place.indoor ? '室内，下雨也行' : '户外'}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {place.tags.map((t) => (
          <Tag key={t} tone="violet">
            {t}
          </Tag>
        ))}
        {place.requiredBooking && <Tag tone="rose">需要提前预约</Tag>}
      </div>

      <div className="space-y-2 border-t-[1.5px] border-ink/10 pt-3">
        <p className="label">排入哪一天</p>
        <div className="grid grid-cols-2 gap-2">
          {days.map((d) => (
            <button
              key={d.id}
              onClick={() => onSchedule(d.id)}
              className="focus-ring rounded-xl border-[1.5px] border-ink bg-white px-3 py-2 text-[13px] font-bold transition hover:bg-paperDeep"
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
