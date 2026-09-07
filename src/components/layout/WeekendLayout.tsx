import { Link, Outlet, useLocation } from 'react-router-dom';
import { useStore } from '@/services/store';
import { fmtMDWeek, upcomingSaturday } from '@/utils/date';

/**
 * Weekend Layout —— 类似 Trip Cockpit 的外壳
 *
 * 周末有多个子页（计划/吃什么/玩什么/今天/清单/AI安排），统一外壳让用户
 * 在场景内跳转时保留状态感（顶部状态卡 + 子导航）。
 *
 * 顶部状态卡：日期 + 计划数 + 入口按钮
 * 子导航：7 个 tab（比 Trip Cockpit 少一个「预算」——周末不是财务场景，按 PRD「场景所减能力」裁掉）
 */
const TABS = [
  { to: '', label: '概览' },
  { to: 'plan', label: '计划' },
  { to: 'food', label: '吃什么' },
  { to: 'fun', label: '玩什么' },
  { to: 'today', label: '今天' },
  { to: 'checklist', label: '清单' },
  { to: 'ai', label: 'AI安排' },
];

export function WeekendLayout({ children }: { children?: React.ReactNode }) {
  const location = useLocation();
  const db = useStore((s) => s.db);
  const weekendOf = upcomingSaturday();
  const plan = db.weekendPlans?.find((p) => p.weekendOf === weekendOf);
  const count = plan?.placeIds.length ?? 0;

  const isOverview = location.pathname === '/weekend' || location.pathname === '/weekend/';

  return (
    <div className="space-y-4">
      <header className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-[11.5px] font-bold tracking-wider text-inkFaint">周末</p>
          <p className="mt-0.5 text-[15px] font-bold">
            {fmtMDWeek(weekendOf)}
            <span className="ml-2 text-[12.5px] font-normal text-inkSoft">
              {count > 0 ? `已安排 ${count} 个地方` : '还没有安排'}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          {!isOverview && (
            <Link
              to="/weekend"
              className="rounded-xl border-[1.5px] border-ink/15 px-3 py-1.5 text-[12.5px] font-semibold text-inkSoft hover:border-ink hover:text-ink"
            >
              ← 概览
            </Link>
          )}
          {count > 0 && !isOverview && location.pathname !== '/weekend/plan' && (
            <Link
              to="/weekend/plan"
              className="rounded-xl border-[1.5px] border-ink bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90"
            >
              查看计划
            </Link>
          )}
        </div>
      </header>

      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        {TABS.map((t) => {
          const to = `/weekend${t.to ? `/${t.to}` : ''}`;
          const active = t.to === '' ? isOverview : location.pathname === to;
          return (
            <Link
              key={t.label}
              to={to}
              className={[
                'shrink-0 rounded-full border-[1.5px] px-3.5 py-1.5 text-[13px] font-semibold transition',
                active
                  ? 'border-ink bg-ink text-white'
                  : 'border-ink/15 bg-white text-inkSoft hover:border-ink/40',
              ].join(' ')}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {children ?? <Outlet />}
    </div>
  );
}