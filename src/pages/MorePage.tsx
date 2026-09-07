import { useNavigate } from 'react-router-dom';
import { MoreGrid, PageHeader } from '@/components/layout';
import { TripCard } from '@/components/travel/TripBits';
import { Button, Card, EmptyState, Section, Tag } from '@/components/ui';
import { useCurrentTripId, useTripContext } from '@/hooks/useTrip';
import { useStore } from '@/services/store';

export function MorePage() {
  const navigate = useNavigate();
  const tripId = useCurrentTripId();
  const ctx = useTripContext(tripId);
  const trips = useStore((s) => s.db.trips);
  const setActiveTrip = useStore((s) => s.setActiveTrip);

  return (
    <div className="space-y-5">
      <PageHeader
        title="更多"
        subtitle="工作台剩下的部分都在这里。"
        action={
          <Button variant="primary" onClick={() => navigate('/trips/new')}>
            + 新建旅行
          </Button>
        }
      />

      <Section title="快速开始" hint="直接从这里跳进核心流程，不用再回首页">
        <div className="grid gap-3 sm:grid-cols-3">
          <button
            onClick={() => navigate('/quiz')}
            className="focus-ring group rounded-card border-[1.5px] border-ink bg-white p-4 text-left shadow-note transition hover:-translate-y-[1px] hover:shadow-noteLg"
          >
            <div className="flex items-center justify-between">
              <span className="grid h-11 w-11 place-items-center rounded-xl border-[1.5px] border-ink/15 bg-violet/15 text-[20]">
                🧭
              </span>
              <span className="text-inkFaint transition group-hover:translate-x-0.5 group-hover:text-ink">→</span>
            </div>
            <p className="h3 mt-3">还没想好去哪</p>
            <p className="muted mt-1">9 个问题，3 分钟，只给你 3 个地方。</p>
          </button>

          <button
            onClick={() => navigate('/trips/new')}
            className="focus-ring group rounded-card border-[1.5px] border-ink bg-white p-4 text-left shadow-note transition hover:-translate-y-[1px] hover:shadow-noteLg"
          >
            <div className="flex items-center justify-between">
              <span className="grid h-11 w-11 place-items-center rounded-xl border-[1.5px] border-ink/15 bg-azure/15 text-[20]">
                ✈️
              </span>
              <span className="text-inkFaint transition group-hover:translate-x-0.5 group-hover:text-ink">→</span>
            </div>
            <p className="h3 mt-3">已经决定了</p>
            <p className="muted mt-1">直接建一次旅行，再决定谁来做攻略。</p>
          </button>

          <button
            onClick={() => navigate('/random')}
            className="focus-ring group rounded-card border-[1.5px] border-ink bg-white p-4 text-left shadow-note transition hover:-translate-y-[1px] hover:shadow-noteLg"
          >
            <div className="flex items-center justify-between">
              <span className="grid h-11 w-11 place-items-center rounded-xl border-[1.5px] border-ink/15 bg-moss/15 text-[20]">
                🎲
              </span>
              <span className="text-inkFaint transition group-hover:translate-x-0.5 group-hover:text-ink">→</span>
            </div>
            <p className="h3 mt-3">随便抽一个</p>
            <p className="muted mt-1">不想答题也行，限定范围后交给运气。</p>
          </button>
        </div>
      </Section>

      {tripId && ctx && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="label">当前旅行</p>
              <p className="text-[15px] font-extrabold">
                {ctx.trip.emoji} {ctx.trip.title}
              </p>
              <p className="text-[11.5px] text-inkFaint">
                {ctx.trip.destinationName} · 准备度 {ctx.preparation.score}%
              </p>
            </div>
            <div className="flex items-center gap-2">
              {ctx.conflicts.length > 0 && <Tag tone="rose">{ctx.conflicts.length} 项待处理</Tag>}
              <Button size="sm" onClick={() => navigate(`/trips/${tripId}`)}>
                打开工作台
              </Button>
            </div>
          </div>
        </Card>
      )}

      <MoreGrid />

      <Section title="切换旅行" hint="点一下就能换到另一次旅行">
        {trips.length === 0 ? (
          <EmptyState
            emoji="🧳"
            title="还没有旅行"
            desc="先决定这次去哪。"
            actions={
              <>
                <Button onClick={() => navigate('/quiz')}>帮我选个地方</Button>
                <Button variant="primary" onClick={() => navigate('/trips/new')}>
                  已经知道去哪
                </Button>
              </>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {trips.map((t) => (
              <TripCard
                key={t.id}
                trip={t}
                prep={t.id === tripId ? (ctx?.preparation.score ?? 0) : 0}
                onClick={() => {
                  setActiveTrip(t.id);
                  navigate(`/trips/${t.id}`);
                }}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
