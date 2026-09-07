import { Link } from 'react-router-dom';
import { useStore } from '@/services/store';
import { useCurrentTripId } from '@/hooks/useTrip';
import { fmtMDWeek, upcomingSaturday } from '@/utils/date';
import { SmartIntentInput } from '@/components/decision/SmartIntentInput';
import { Button, Card, Section, Tag } from '@/components/ui';
import { TripCard } from '@/components/travel/TripBits';
import { preparationOf } from '@/services/intelligence';
import { countdownText } from '@/services/intelligence';
import { getDestination } from '@/data/destinations';

/**
 * Home = 个人旅行 Cockpit
 * -----------------------
 * 不堆功能入口，只回答三件事：
 *   ① 我现在最重要的事（今天 / 当前旅行 / 本周末）
 *   ② 我现在想做什么（一句话入口）
 *   ③ 下一步去哪（快捷链路，不是孤岛）
 */

const QUICK = [
  { key: 'ai', label: 'AI 规划', emoji: '✨', desc: '说目的地直接排行程' },
  { to: '/travel/destinations', label: '找个地方', emoji: '🌏', desc: '不知道去哪就看看' },
  { to: '/guide', label: '看看攻略', emoji: '📚', desc: '攻略市场逛逛' },
  { to: '/weekend', label: '周末去哪', emoji: '☀', desc: '这周末怎么过' },
  { to: '/trips/new', label: '加入旅行', emoji: '🎒', desc: '直接创建新旅行' },
];

export function HomePage() {
  const tripId = useCurrentTripId();
  const db = useStore((s) => s.db);
  const settings = useStore((s) => s.settings);
  const active = db.trips.find((t) => t.id === tripId);
  const weekendPlan = db.weekendPlans?.find((p) => p.weekendOf === upcomingSaturday());
  const weekendCount = weekendPlan?.placeIds.length ?? 0;
  const others = db.trips.filter((t) => t.id !== tripId);
  const recentPicks = db.destinationPicks?.slice(-4).reverse() ?? [];
  const greeting = new Date().getHours() < 12 ? '早上好' : new Date().getHours() < 18 ? '下午好' : '晚上好';

  return (
    <div className="space-y-6">
      {/* 顶部问候 + 核心入口 */}
      <section className="card overflow-hidden">
        <div className="relative bg-gradient-to-br from-azure/25 via-violet/15 to-amber/20 px-5 py-6 sm:px-8 sm:py-8">
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-[13px] font-bold text-inkSoft">
              <span className="grid h-7 w-7 place-items-center rounded-full border-[1.5px] border-ink/15 bg-white text-[14px]">
                🐻
              </span>
              {greeting}，{settings.name || '旅行者'}
            </div>
            <h1 className="h1 mt-3">今天想去哪？</h1>
            <p className="muted mt-1.5 max-w-[42ch]">去看风景，也去见更好的自己。说一句话，我帮你安排。</p>
            <div className="mt-4 max-w-xl">
              <SmartIntentInput
                placeholder="比如：想去哈尔滨玩三天 / 这周末不知道干什么"
                examples={[
                  '下个月想去日本，但不知道去哪',
                  '这周末不想太累',
                  '今晚想吃点不一样的',
                  '深圳有哪些著名商圈',
                ]}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* 我的旅行 */}
          <Section title="我的旅行" hint={active ? '当前重点' : '继续规划'} action={others.length > 0 ? <Link to="/travel" className="text-[12px] font-semibold text-inkSoft hover:text-ink">全部 →</Link> : undefined}>
            {active || others.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {active && (
                  <Link
                    to={`/trips/${active.id}`}
                    className="card flex items-center gap-3 p-4 transition hover:-translate-y-[1px] hover:shadow-noteLg"
                  >
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border-[1.5px] border-ink/15 bg-paperDeep text-[22px]">
                      {active.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-bold text-inkFaint">当前旅行</span>
                      <span className="block truncate text-[14.5px] font-bold">{active.title}</span>
                      <span className="muted block text-[12px]">
                        {active.destinationName} · {countdownText(active)}
                      </span>
                    </span>
                    <span className="text-inkFaint">→</span>
                </Link>
              )}
                {others.slice(0, 3).map((t) => (
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
                <Link
                  to="/trips/new"
                  className="card flex items-center justify-center gap-2 p-4 text-[13px] font-bold text-inkSoft transition hover:-translate-y-[1px] hover:shadow-noteLg"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg border-[1.5px] border-ink/15 bg-paperDeep">+</span>
                  创建新旅行
                </Link>
              </div>
            ) : (
              <Card className="p-5 text-center">
                <p className="text-[15px] font-bold">还没有旅行计划</p>
                <p className="muted mt-2">说一句话，或者直接挑个目的地。</p>
                <div className="mt-4 flex justify-center gap-2">
                  <Link to="/travel/destinations">
                    <Button variant="primary">挑个地方</Button>
                  </Link>
                  <Link to="/trips/new">
                    <Button>直接创建</Button>
                  </Link>
                </div>
              </Card>
            )}
          </Section>

          {/* 快捷入口 */}
          <Section title="快捷入口" hint="快速开始，不会丢上下文">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {QUICK.map((q) => {
                const to =
                  q.key === 'ai'
                    ? tripId
                      ? `/trips/${tripId}/plan`
                      : '/assistant'
                    : q.to!;
                return (
                  <Link
                    key={q.key ?? q.to}
                    to={to}
                    className="card flex flex-col items-start gap-2 p-4 transition hover:-translate-y-[1px] hover:shadow-noteLg"
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-xl border-[1.5px] border-ink/15 bg-paperDeep text-[18px]">
                      {q.emoji}
                    </span>
                    <span>
                      <span className="block text-[14px] font-bold">{q.label}</span>
                      <span className="muted block text-[11.5px]">{q.desc}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </Section>

          {/* 最近浏览 / 决策痕迹 */}
          {recentPicks.length > 0 && (
            <Section title="最近浏览" hint="你刚看过的目的地">
              <div className="flex gap-3 overflow-x-auto pb-1">
                {recentPicks.map((pick) => {
                  const dest = getDestination(pick.destinationId);
                  if (!dest) return null;
                  return (
                    <Link
                      key={pick.id}
                      to={`/travel/destinations/${dest.id}`}
                      className="card shrink-0 w-40 overflow-hidden transition hover:-translate-y-[1px] hover:shadow-noteLg"
                    >
                      <div className="flex h-20 items-center justify-center bg-paperDeep">
                        <span className="text-[42px]">{dest.emoji}</span>
                      </div>
                      <div className="p-3">
                        <p className="truncate text-[13px] font-bold">{dest.name}</p>
                        <p className="mt-0.5 truncate text-[11px] text-inkSoft">{dest.summary}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </Section>
          )}
        </div>

        {/* 右侧状态面板 */}
        <div className="space-y-6">
          {/* 今天 */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-bold text-inkFaint">今天</p>
                <p className="text-[15px] font-bold">{fmtMDWeek(new Date().toISOString().slice(0, 10))}</p>
                <p className="text-[12px] text-inkSoft">{settings.homeCity || '上海'}</p>
              </div>
              <span className="text-[36px]">☀</span>
            </div>
          </Card>

          {/* 本周末 */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-bold text-inkFaint">本周末</p>
                <p className="text-[15px] font-bold">
                  {weekendCount > 0 ? `已安排 ${weekendCount} 个地方` : '暂无安排'}
                </p>
                <p className="text-[12px] text-inkSoft">{fmtMDWeek(upcomingSaturday())}</p>
              </div>
              <span className="grid h-11 w-11 place-items-center rounded-xl border-[1.5px] border-ink/15 bg-paperDeep text-[20px]">
                ☀
              </span>
            </div>
            <div className="mt-4">
              <Link to={weekendCount > 0 ? '/weekend/plan' : '/weekend'}>
                <Button variant="primary" block>
                  {weekendCount > 0 ? '查看周末计划' : '安排周末'}
                </Button>
              </Link>
            </div>
          </Card>

          {/* 收藏速览 */}
          <Card className="p-5">
            <p className="text-[12px] font-bold text-inkFaint">我的收藏</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(() => {
                const allSaved = new Set<string>();
                Object.values(db.savedPlaces ?? {}).forEach((ids) => ids.forEach((id) => allSaved.add(id)));
                const places = Array.from(allSaved)
                  .map((id) => db.travelDiscoveredPlaces?.find((x) => x.id === id))
                  .filter(Boolean)
                  .slice(0, 4);
                if (places.length === 0) {
                  return <p className="text-[12.5px] text-inkFaint">还没有收藏地点</p>;
                }
                return places.map((p) => (
                  <Tag key={p!.id} tone="amber">
                    {p!.emoji} {p!.name}
                  </Tag>
                ));
              })()}
            </div>
          </Card>

          {/* AI 助手入口 */}
          <Link
            to="/assistant"
            className="card flex items-center gap-3 p-4 transition hover:-translate-y-[1px] hover:shadow-noteLg"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl border-[1.5px] border-violet/30 bg-violet/10 text-[18px]">
              ✨
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold">AI 助手</span>
              <span className="muted block text-[11.5px]">调整行程、换地点、问建议</span>
            </span>
            <span className="text-inkFaint">→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
