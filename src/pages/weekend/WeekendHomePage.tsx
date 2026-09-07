import { Link } from 'react-router-dom';
import { useStore } from '@/services/store';
import { SmartIntentInput } from '@/components/decision/SmartIntentInput';
import { Button, Card, Section } from '@/components/ui';
import { fmtMDWeek, upcomingSaturday } from '@/utils/date';

/**
 * /weekend —— 周末首页（Weekend Cockpit）
 *
 * 不是「推荐几个附近地点」的卡片墙，而是周末工作台的入口：
 *   ① 这周末想怎么过（一句话入口）
 *   ② 快捷入口（去哪玩 / 随便抽 / 附近 / 吃什么 / 玩什么 / 不太累）
 *   ③ 本周末计划状态（周六 / 周日）
 *
 * 计划为空时不假装有内容，直接给出口。
 */

const QUICK = [
  { to: '/weekend/where', label: '这周末去哪', emoji: '🚶' },
  { to: '/weekend/random', label: '随便抽一个', emoji: '🎲' },
  { to: '/weekend/nearby', label: '附近看看', emoji: '📍' },
  { to: '/weekend/food', label: '吃什么', emoji: '🍜' },
  { to: '/weekend/fun', label: '玩什么', emoji: '🎡' },
  { to: '/weekend/where?mode=nearby', label: '找个不太累的地方', emoji: '🌳' },
];

export function WeekendHomePage() {
  const db = useStore((s) => s.db);
  const weekendOf = upcomingSaturday();
  const plan = db.weekendPlans?.find((p) => p.weekendOf === weekendOf);
  const count = plan?.placeIds.length ?? 0;

  return (
    <div className="space-y-6">
      <section className="sticky-note px-5 py-6 sm:px-8 sm:py-8">
        <p className="label">周末</p>
        <h1 className="h1 mt-2">这周末，想怎么过？</h1>
        <p className="muted mt-2">{fmtMDWeek(weekendOf)}</p>
        <div className="mt-4">
          <SmartIntentInput
            placeholder="告诉我你想怎么过…"
            examples={[
              '这周末不想太累',
              '今晚想吃点不一样的',
              '附近有没有新开的咖啡店',
              '和朋友周六出去玩',
            ]}
          />
        </div>
      </section>

      <Section title="快捷入口" hint="说不清就直接挑一个">
        <div className="grid gap-3 sm:grid-cols-3">
          {QUICK.map((q) => (
            <Link
              key={q.to}
              to={q.to}
              className="card flex items-center gap-3 p-4 transition hover:-translate-y-[1px] hover:shadow-noteLg"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-[1.5px] border-ink/15 bg-paperDeep text-[18px]">
                {q.emoji}
              </span>
              <span className="text-[14px] font-bold">{q.label}</span>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="本周末计划" hint={fmtMDWeek(weekendOf)}>
        {count === 0 ? (
          <Card className="p-5 text-center">
            <p className="text-[15px] font-bold">这周末还没安排</p>
            <p className="muted mt-2">先去挑个地方，或者直接说你想干嘛。</p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="primary" onClick={() => (window.location.href = '/weekend/where')}>
                去看看
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-[14px] font-bold">已经放了 {count} 个地方</p>
              <p className="muted mt-1">可以继续加，也可以看看怎么安排。</p>
            </div>
            <Link to="/weekend/plan">
              <Button variant="primary">查看周末计划</Button>
            </Link>
          </Card>
        )}
      </Section>
    </div>
  );
}
