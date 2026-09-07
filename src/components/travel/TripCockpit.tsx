import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTripContext } from '@/hooks/useTrip';
import { useStore } from '@/services/store';
import { buildContext, proactiveHints } from '@/ai/orchestrator';
import { countdownText, nowContext } from '@/services/intelligence';
import { deriveTripLifecycle } from '@/services/lifecycle';
import { PageHeader } from '@/components/layout';
import { ConflictPanel } from '@/components/travel/Insight';
import { StatGrid } from '@/components/travel/TripBits';
import { Button, Card, EmptyState, ProgressBar, Ring, cx } from '@/components/ui';
import { fmtMD, fmtMDWeek, todayISO } from '@/utils/date';
import { ACTIVITY_LABEL, money } from '@/utils/format';

/**
 * 共享的「旅行驾驶舱」组件。
 * 由 HomePage（有 Trip 时）与 TripOverviewPage（index）共同复用，
 * 统一渲染：Travel State + Current State + Progress + Next Best Action + Primary CTA。
 * 视觉与交互沿用既有 Cockpit，未做无必要重构。
 */
export function TripCockpit({ tripId }: { tripId: string }) {
  const navigate = useNavigate();
  const db = useStore((s) => s.db);
  const ctx = useTripContext(tripId);
  if (!ctx) return null;
  const { trip, days, activities, bookings, expenses, checklists, conflicts, preparation, budget } = ctx;

  const today = todayISO();

  // ── 集中派生生命周期（页面不自行判断状态）────────────────
  const life = useMemo(
    () => deriveTripLifecycle({ trip, days, activities, bookings, checklists, conflicts, preparation, today }),
    [trip, days, activities, bookings, checklists, conflicts, preparation, today],
  );

  const focusDay = useMemo(() => {
    if (trip.status === 'traveling') return days.find((d) => d.date === today) ?? days[0];
    if (trip.status === 'completed') return days[days.length - 1];
    return days.find((d) => d.date >= today) ?? days[0];
  }, [days, today, trip.status]);

  const focusActs = focusDay ? ctx.actsOf(focusDay.id) : [];

  const now = useMemo(
    () => (trip.status === 'traveling' ? nowContext(days, activities, today) : null),
    [days, activities, today, trip.status],
  );

  const hints = useMemo(() => {
    const c = buildContext(db, tripId, today);
    if (!c) return [];
    return proactiveHints(
      c,
      conflicts.map((x) => ({ message: x.message, level: x.level })),
      preparation.score,
    );
  }, [db, tripId, today, conflicts, preparation.score]);

  const itineraryFilled = days.filter((d) => activities.filter((a) => a.dayId === d.id).length > 0).length;
  const checklistItems = checklists.flatMap((c) => c.items);
  const checklistDone = checklistItems.filter((i) => i.done).length;
  const confirmedBookings = bookings.filter((b) => b.status === 'confirmed').length;

  const go = (to: string) => navigate(to);

  return (
    <div className="space-y-5">
      {/* ── Lifecycle Header：状态 + 当前状态 + 进度 + NBA + Primary CTA ── */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b-[1.5px] border-ink/10 bg-violet/6 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded-full border-[1.5px] border-violet/40 bg-violet/12 px-2.5 py-0.5 text-[11px] font-bold text-violet">
                {life.label}
              </span>
              <span className="text-[12px] text-inkFaint">{countdownText(trip)}</span>
            </div>
            <p className="mt-1.5 text-[16px] font-extrabold leading-snug">
              {life.currentState}
            </p>
            <p className="mt-0.5 text-[12.5px] text-inkSoft">
              下一步 · {life.nextAction}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
            <Button variant="primary" onClick={() => go(life.primaryCta.to)}>
              {life.primaryCta.label}
            </Button>
            <div className="flex flex-wrap gap-1.5">
              {life.secondary.map((s) => (
                <button
                  key={s.to}
                  onClick={() => go(s.to)}
                  className="focus-ring rounded-lg px-2 py-1 text-[11.5px] font-semibold text-inkSoft transition hover:bg-ink/5 hover:text-ink"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {life.progress && (
          <div className="flex items-center gap-3 px-5 py-3">
            <span className="text-[12px] font-semibold text-inkSoft">{life.progress.label}</span>
            <ProgressBar
              className="flex-1"
              value={life.progress.ratio * 100}
              tone={life.progress.ratio >= 1 ? 'moss' : life.progress.ratio >= 0.5 ? 'violet' : 'amber'}
            />
            <span className="text-[12px] font-bold tabular-nums">
              {life.progress.total !== undefined
                ? `${life.progress.value}/${life.progress.total}`
                : `${life.progress.value}%`}
            </span>
          </div>
        )}
      </Card>

      <PageHeader
        title={trip.title}
        subtitle={`${trip.emoji} ${trip.destinationName} · ${fmtMD(trip.startDate)} — ${fmtMD(trip.endDate)}`}
        action={
          <div className="flex items-center gap-2">
            <Button onClick={() => go(`/trips/${tripId}/plan`)}>✨ AI 规划</Button>
            <Button variant="primary" onClick={() => go(life.primaryCta.to)}>
              {life.primaryCta.label}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* 左：准备度 + 四项进度 */}
        <div className="space-y-4">
          <Card className="flex items-center gap-5 p-5">
            <Ring
              value={preparation.score}
              size={92}
              sub="准备度"
              tone={preparation.score >= 80 ? '#22A06B' : preparation.score >= 50 ? '#7C5CFF' : '#FFC53D'}
            />
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="label">已完成</p>
                <ul className="mt-1 space-y-0.5">
                  {preparation.done.slice(0, 3).map((d) => (
                    <li key={d} className="text-[13px] font-medium">
                      ✓ {d}
                    </li>
                  ))}
                  {!preparation.done.length && <li className="muted">还没有完成的事项</li>}
                </ul>
              </div>
              <div>
                <p className="label">待处理</p>
                <ul className="mt-1 space-y-0.5">
                  {preparation.todo.slice(0, 3).map((d) => (
                    <li key={d} className="text-[13px] text-inkSoft">
                      ○ {d}
                    </li>
                  ))}
                  {!preparation.todo.length && <li className="muted">全部搞定，可以出发了</li>}
                </ul>
              </div>
            </div>
          </Card>

          <StatGrid
            items={[
              {
                label: '行程',
                value: `${itineraryFilled}/${days.length} 天`,
                progress: days.length ? (itineraryFilled / days.length) * 100 : 0,
                tone: 'violet',
                emoji: '▤',
                onClick: () => go(`/trips/${tripId}/itinerary`),
              },
              {
                label: '预算',
                value: `${money(budget.forecast)} / ${money(budget.total)}`,
                progress: budget.total ? (budget.forecast / budget.total) * 100 : 0,
                tone: budget.overrun > 0 ? 'rose' : 'azure',
                emoji: '¥',
                hint: budget.overrun > 0 ? `预计超预算 ${money(budget.overrun)}` : undefined,
                onClick: () => go(`/trips/${tripId}/budget`),
              },
              {
                label: '预订',
                value: `${confirmedBookings}/${bookings.length}`,
                progress: bookings.length ? (confirmedBookings / bookings.length) * 100 : 0,
                tone: 'amber',
                emoji: '🎟️',
                onClick: () => go(`/trips/${tripId}/bookings`),
              },
              {
                label: '清单',
                value: `${checklistDone}/${checklistItems.length}`,
                progress: checklistItems.length ? (checklistDone / checklistItems.length) * 100 : 0,
                tone: 'moss',
                emoji: '✓',
                onClick: () => go(`/trips/${tripId}/checklist`),
              },
            ]}
          />
        </div>

        {/* 右：今日 / 焦点日行程 */}
        <Card className="p-4">
          <header className="mb-3 flex items-center justify-between">
            <div>
              <p className="label">{trip.status === 'traveling' ? '今天' : '焦点日'}</p>
              <p className="text-[15px] font-extrabold">
                {focusDay ? `${focusDay.title} · ${fmtMDWeek(focusDay.date)}` : '还没有日期'}
              </p>
            </div>
            <span className={cx('rounded-full px-2.5 py-0.5 text-[11px] font-bold',
              trip.status === 'traveling' ? 'bg-moss/15 text-moss' : trip.status === 'completed' ? 'bg-ink/10 text-inkSoft' : 'bg-violet/12 text-violet')}>
              {life.label}
            </span>
          </header>

          {now?.next && (
            <div className="mb-3 rounded-xl border-[1.5px] border-violet/40 bg-violet/10 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-inkSoft">下一站</p>
              <p className="mt-0.5 text-[15px] font-extrabold">{now.next.title}</p>
              <p className="text-[12px] text-inkSoft">
                {now.next.startTime} · 还有 {Math.max(now.minutesToNext, 0)} 分钟
              </p>
            </div>
          )}

          {focusActs.length === 0 ? (
            <EmptyState
              emoji="🗓️"
              title="这天还是空的"
              desc="把想去的地点拖进来，或者让 AI 直接给你一版。"
              actions={
                <>
                  <Button onClick={() => go(`/trips/${tripId}/itinerary`)}>自己排</Button>
                  <Button variant="primary" onClick={() => go(`/trips/${tripId}/plan`)}>
                    帮我规划
                  </Button>
                </>
              }
            />
          ) : (
            <ol className="space-y-1.5">
              {focusActs.map((a, i) => (
                <li key={a.id} className="flex items-start gap-3">
                  <div className="w-[44px] shrink-0 pt-0.5">
                    <p className="text-[12.5px] font-extrabold tabular-nums leading-none">{a.startTime}</p>
                  </div>
                  <div className="min-w-0 flex-1 border-l-[1.5px] border-ink/15 pl-3">
                    <p className={cx('truncate text-[13.5px] font-bold', a.status === 'skipped' && 'line-through opacity-50')}>
                      {a.title}
                    </p>
                    <p className="text-[11px] text-inkFaint">
                      {ACTIVITY_LABEL[a.type]}
                      {a.estimatedCost ? ` · ${money(a.estimatedCost)}` : ''}
                    </p>
                  </div>
                  {i < focusActs.length - 1 && (
                    <span className="pt-0.5 text-[10.5px] text-inkFaint">
                      ↓{focusActs[i + 1].transportMin}m
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ConflictPanel
          conflicts={conflicts}
          onFix={(intent) => go(`/trips/${tripId}/assistant?q=${encodeURIComponent(intent)}`)}
        />
        <div className="space-y-4">
          {hints.length > 0 && (
            <Card className="overflow-hidden">
              <header className="flex items-center gap-2 border-b-[1.5px] border-ink/10 bg-violet/8 px-4 py-2.5">
                <span>✨</span>
                <p className="text-[13px] font-extrabold">AI 提醒</p>
              </header>
              <ul className="divide-y divide-ink/8">
                {hints.map((h, i) => (
                  <li key={i} className="px-4 py-2.5 text-[13px] leading-relaxed">
                    {h}
                  </li>
                ))}
              </ul>
              <div className="border-t-[1.5px] border-ink/10 px-4 py-2.5">
                <Button size="sm" onClick={() => go(`/trips/${tripId}/assistant`)}>
                  让我处理
                </Button>
              </div>
            </Card>
          )}

          {expenses.length > 0 && (
            <Card className="p-4">
              <p className="label">预算进度</p>
              <p className="mt-1 text-[19px] font-extrabold tabular-nums">
                {money(budget.forecast)}
                <span className="ml-1 text-[13px] font-semibold text-inkFaint">
                  / {money(budget.total)}
                </span>
              </p>
              <ProgressBar
                className="mt-2"
                value={budget.total ? (budget.forecast / budget.total) * 100 : 0}
                tone={budget.overrun > 0 ? 'rose' : 'azure'}
              />
              <p className="mt-1.5 text-[11.5px] text-inkSoft">
                {budget.overrun > 0
                  ? `预计超预算 ${money(budget.overrun)}，可以让 AI 帮忙压缩`
                  : `还剩 ${money(budget.remaining)} 可用`}
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
