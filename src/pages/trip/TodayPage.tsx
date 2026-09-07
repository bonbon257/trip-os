import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTripContext } from '@/hooks/useTrip';
import { useStore } from '@/services/store';
import { nowContext } from '@/services/intelligence';
import { runAIAsync } from '@/ai/orchestrator';
import { PageHeader } from '@/components/layout';
import { ActivityRow } from '@/components/travel/Timeline';
import { ProposalPanel } from '@/components/travel/ProposalPanel';
import { AIToggle, useAIFlag } from '@/features/ai/AIToggle';
import { IntensityBadge } from '@/components/travel/TripBits';
import { Button, Card, EmptyState, Tag, cx, toast } from '@/components/ui';
import { durationText, fmtMDWeek, nowHHMM } from '@/utils/date';
import { computeDayIntensity } from '@/services/intelligence';
import { BOOKING_EMOJI, money, TRANSPORT_LABEL } from '@/utils/format';
import type { AIProposal } from '@/types';

const QUICK = [
  '今天下雨',
  '我睡过头了，11点才出门',
  '我现在不想去了',
  '这个店关门了',
  '我想去附近喝咖啡',
  '今天想早点回酒店',
];

export function TodayPage() {
  const { tripId = '' } = useParams();
  const ctx = useTripContext(tripId);
  const db = useStore((s) => s.db);
  const setActivityStatus = useStore((s) => s.setActivityStatus);
  const addProposal = useStore((s) => s.addProposal);
  const applyProposal = useStore((s) => s.applyProposal);
  const rejectProposal = useStore((s) => s.rejectProposal);
  const setTripStatus = useStore((s) => s.setTripStatus);
  const useLLM = useAIFlag();

  const [proposal, setProposal] = useState<AIProposal | null>(null);
  const [busy, setBusy] = useState(false);

  const now = useMemo(() => (ctx ? nowContext(ctx.days, ctx.activities) : null), [ctx]);

  if (!ctx) return null;
  const { trip, days, weather, placeOf, actsOf, budget, bookings } = ctx;

  const today = now?.today;
  const acts = today ? actsOf(today.id) : [];
  const w = weather.find((x) => x.date === today?.date);
  const intensity = today ? computeDayIntensity(acts, placeOf) : null;
  const todayBookings = bookings.filter((b) => b.startTime?.slice(0, 10) === today?.date);

  const ask = async (text: string) => {
    setBusy(true);
    const res = await runAIAsync(db, tripId, text, undefined, useLLM).catch(() => null);
    setBusy(false);
    if (!res?.proposal) {
      toast(res?.reply || '现在这样也挺好的', 'warn');
      return;
    }
    addProposal(res.proposal);
    setProposal(res.proposal);
  };

  if (trip.status !== 'traveling') {
    return (
      <div className="space-y-4">
        <PageHeader title={trip.status === 'completed' ? '旅行已结束' : '还没出发'} />
        <EmptyState
          emoji={trip.status === 'completed' ? '🗺️' : '🧳'}
          title={trip.status === 'completed' ? '这次旅行已经归档' : '这次旅行还没开始'}
          desc={
            trip.status === 'completed'
              ? '去 Journey 看看这次留下的记录。'
              : '进入旅行中之后，这里会变成「今天」——只告诉你现在该做什么。'
          }
          actions={
            trip.status === 'completed' ? (
              <Button variant="primary" onClick={() => (window.location.href = `/trips/${tripId}/journey`)}>
                看 Journey
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => {
                  setTripStatus(tripId, 'traveling');
                  toast('已进入旅行中模式', 'good');
                }}
              >
                开始这次旅行
              </Button>
            )
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="今天"
        subtitle={today ? `${today.title} · ${fmtMDWeek(today.date)}` : '今天不在行程日期内'}
        action={
          <div className="text-right">
            <p className="label">现在</p>
            <p className="text-[22px] font-extrabold tabular-nums leading-none">{nowHHMM()}</p>
          </div>
        }
      />

      {!today ? (
        <EmptyState emoji="📅" title="今天不在行程里" desc="要么还没出发，要么已经回来了。" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            {/* 当前 / 下一站 */}
            <Card className="overflow-hidden">
              <div className="grid gap-px bg-ink/10 sm:grid-cols-3">
                <Stat
                  label="现在"
                  value={now?.current?.title ?? '自由时间'}
                  hint={now?.current ? `${now.current.startTime} – ${now.current.endTime}` : '随便做点什么'}
                />
                <Stat
                  label="下一站"
                  value={now?.next?.title ?? '今天没有更多安排'}
                  hint={
                    now?.next
                      ? `${now.next.startTime} · 还有 ${durationText(Math.max(now.minutesToNext, 0))}`
                      : '可以回酒店了'
                  }
                  accent
                />
                <Stat
                  label="天气"
                  value={w ? `${w.emoji} ${w.text}` : '—'}
                  hint={w ? `${w.low}°–${w.high}° · 降雨 ${w.rain}%` : '暂无预报'}
                />
              </div>
            </Card>

            {now?.next && (
              <div className="rounded-card border-[1.5px] border-violet/40 bg-violet/10 px-4 py-3">
                <p className="text-[13px] font-extrabold">
                  建议 {now.next.startTime} 前出发 ·{' '}
                  {now.next.transportMin
                    ? `${TRANSPORT_LABEL[now.next.transportMode]}约 ${now.next.transportMin} 分钟`
                    : '步行即达'}
                </p>
                <p className="text-[12px] text-inkSoft">目的地：{now.next.title}</p>
              </div>
            )}

            {/* 今日行程 */}
            <Card className="overflow-hidden">
              <header className="flex items-center justify-between border-b-[1.5px] border-ink/10 px-4 py-2.5">
                <p className="text-[13px] font-extrabold">今日行程</p>
                <div className="flex items-center gap-2">
                  {intensity && <IntensityBadge level={intensity.level} score={intensity.score} />}
                  <span className="text-[11px] text-inkFaint">{acts.length} 项</span>
                </div>
              </header>
              <div className="space-y-1.5 p-3">
                {acts.length === 0 ? (
                  <p className="py-6 text-center text-[12.5px] text-inkFaint">今天没有安排。也挺好。</p>
                ) : (
                  acts.map((a, i) => (
                    <div key={a.id}>
                      <ActivityRow
                        activity={a}
                        place={placeOf(a.placeId)}
                        selected={now?.next?.id === a.id || now?.current?.id === a.id}
                        onStatusChange={(s) => setActivityStatus(a.id, s)}
                        compact={false}
                      />
                      {i < acts.length - 1 && acts[i + 1].transportMin > 0 && (
                        <div className="flex items-center gap-2 pl-[14px] text-[11px] text-inkFaint">
                          <span className="h-4 w-px bg-ink/20" />↓{' '}
                          {TRANSPORT_LABEL[acts[i + 1].transportMode]} {acts[i + 1].transportMin} min
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </Card>

            {now && now.freeSlots.length > 0 && (
              <Card className="p-4">
                <p className="label">今天还有 {now.freeSlots.length} 个自由时间段</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {now.freeSlots.map((s, i) => (
                    <Tag key={i} tone="moss">
                      {s.start} – {s.end} · {durationText(s.minutes)}
                    </Tag>
                  ))}
                </div>
              </Card>
            )}

            {/* 动态调整 */}
            <Card className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="h3">计划变了？说一句就行</p>
              <AIToggle />
            </div>
              <p className="muted mt-0.5">我会读取现在的时间、剩余安排和天气，重排今天剩下的行程。</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {QUICK.map((q) => (
                  <button
                    key={q}
                    disabled={busy}
                    onClick={() => ask(q)}
                    className={cx(
                      'focus-ring rounded-full border-[1.5px] border-ink/15 bg-white px-3 py-1.5 text-[12.5px] font-semibold transition',
                      'hover:border-ink hover:bg-paperDeep disabled:opacity-40',
                    )}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </Card>

            {proposal && (
              <ProposalPanel
                proposal={proposal}
                onApply={() => {
                  applyProposal(proposal.id);
                  toast('已更新今天的安排', 'good');
                  setProposal(null);
                }}
                onReject={() => {
                  rejectProposal(proposal.id);
                  setProposal(null);
                }}
              />
            )}
          </div>

          <div className="space-y-4">
            <Card className="p-4">
              <p className="label">今日提醒</p>
              {todayBookings.length === 0 ? (
                <p className="muted mt-2">今天没有预约。</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {todayBookings.map((b) => (
                    <li key={b.id} className="rounded-xl border-[1.5px] border-ink/12 bg-white px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span>{BOOKING_EMOJI[b.type]}</span>
                        <p className="min-w-0 flex-1 truncate text-[13px] font-bold">{b.title}</p>
                      </div>
                      <p className="mt-0.5 text-[11.5px] text-inkSoft">
                        {b.startTime?.slice(11, 16) ?? '—'} 开始
                        {b.bookingNumber ? ` · ${b.bookingNumber}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-4">
              <p className="label">预算</p>
              <p className="mt-1 text-[19px] font-extrabold tabular-nums">
                {money(budget.paid)}
                <span className="ml-1 text-[12.5px] font-semibold text-inkFaint">
                  已花 / {money(budget.total)}
                </span>
              </p>
              <p className="mt-1 text-[11.5px] text-inkSoft">
                预计总支出 {money(budget.forecast)}
                {budget.overrun > 0 ? ` · 超 ${money(budget.overrun)}` : ` · 剩 ${money(budget.remaining)}`}
              </p>
            </Card>

            <Card className="p-4">
              <p className="label">这几天</p>
              <div className="mt-2 space-y-1.5">
                {days.map((d) => (
                  <div
                    key={d.id}
                    className={cx(
                      'flex items-center justify-between rounded-lg px-2 py-1.5 text-[12.5px]',
                      d.id === today.id ? 'bg-violet/12 font-bold' : 'text-inkSoft',
                    )}
                  >
                    <span>
                      D{d.index} · {d.title}
                    </span>
                    <span className="text-[11px]">{fmtMDWeek(d.date).replace(/\s.*/, '')}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className={cx('px-4 py-3.5', accent ? 'bg-violet/10' : 'bg-white')}>
      <p className="label">{label}</p>
      <p className="mt-1 truncate text-[15px] font-extrabold">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-inkFaint">{hint}</p>}
    </div>
  );
}
