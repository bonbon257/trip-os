import { Link } from 'react-router-dom';
import { useStore } from '@/services/store';
import { SmartIntentInput } from '@/components/decision/SmartIntentInput';
import { Section } from '@/components/ui';
import { TripCard } from '@/components/travel/TripBits';
import { preparationOf } from '@/services/intelligence';
import { useCurrentTripId } from '@/hooks/useTrip';
import { countdownText } from '@/services/intelligence';

/**
 * /travel —— 旅行首页
 *
 * 没有「当前旅行」时的旅行入口：既能继续已有的旅行，也能开始一次新的决策。
 * 有当前旅行时由导航直接进 /trips/:tripId（Trip Overview），不需要经过这里。
 *
 * 这里只放旅行语境的能力：不知道去哪 / 已经决定 / 比较 / 随便抽。
 * 周末相关的入口不出现在这里（Context 隔离）。
 */

const DECISIONS = [
  { to: '/travel/quiz', label: '我不知道去哪', desc: '9 个问题，帮你挑 3 个地方', emoji: '🧭' },
  { to: '/travel/compare', label: '有几个备选', desc: '并排看清楚再决定', emoji: '⚖️' },
  { to: '/travel/random', label: '随便抽一个', desc: '不想答题，交给运气', emoji: '🎲' },
  { to: '/travel/new', label: '我已经决定了', desc: '四个字段就能开工', emoji: '✍️' },
];

export function TravelHomePage() {
  const db = useStore((s) => s.db);
  const activeTripId = useCurrentTripId();
  const others = db.trips.filter((t) => t.id !== activeTripId);
  const active = db.trips.find((t) => t.id === activeTripId);

  return (
    <div className="space-y-6">
      <section className="sticky-note px-5 py-6 sm:px-8 sm:py-8">
        <p className="label">旅行</p>
        <h1 className="h1 mt-2">下次去哪？</h1>
        <p className="muted mt-2">说一句话，或者直接挑一个入口。</p>
        <div className="mt-4">
          <SmartIntentInput
            placeholder="告诉我你想去哪…"
            examples={[
              '下个月想去日本，但不知道去哪',
              '我已经决定去北京了，有什么好玩的',
              '大理和丽江选哪个',
            ]}
          />
        </div>
      </section>

      {active && (
        <Section title="当前旅行" hint={countdownText(active)}>
          <Link to={`/trips/${active.id}`} className="block">
            <div className="card p-4 transition hover:-translate-y-[1px] hover:shadow-noteLg">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border-[1.5px] border-ink/15 bg-paperDeep text-[22px]">
                  {active.emoji}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold">{active.title}</p>
                  <p className="muted mt-0.5">
                    {active.destinationName} · {active.startDate} — {active.endDate}
                  </p>
                </div>
                <span className="ml-auto text-inkFaint">→</span>
              </div>
            </div>
          </Link>
        </Section>
      )}

      <Section title="旅行决策" hint="不知道去哪就从这里开始">
        <div className="grid gap-3 sm:grid-cols-2">
          {DECISIONS.map((d) => (
            <Link
              key={d.to}
              to={d.to}
              className="card flex items-center gap-3 p-4 transition hover:-translate-y-[1px] hover:shadow-noteLg"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-[1.5px] border-ink/15 bg-paperDeep text-[18px]">
                {d.emoji}
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-bold">{d.label}</span>
                <span className="muted block text-[12px]">{d.desc}</span>
              </span>
            </Link>
          ))}
        </div>
      </Section>

      {others.length > 0 && (
        <Section title="其他旅行" hint="点开接着走">
          <div className="grid gap-3 sm:grid-cols-2">
            {others.map((t) => (
              <TripCard
                key={t.id}
                trip={t}
                prep={preparationOf(
                  t,
                  db.days.filter((d) => d.tripId === t.id),
                  db.activities.filter((a) => a.tripId === t.id),
                  db.bookings.filter((b) => b.tripId === t.id),
                  db.checklists.filter((c) => c.tripId === t.id),
                  db.files.filter((f) => f.tripId === t.id),
                ).score}
                onClick={() => {
                  window.location.href = `/trips/${t.id}`;
                }}
              />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
