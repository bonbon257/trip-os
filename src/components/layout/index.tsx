import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '@/services/store';
import { useCurrentTripId, useTripContext } from '@/hooks/useTrip';
import { AIPanel } from '@/features/ai/AIPanel';
import { Badge, Button, Modal, Ring, cx } from '@/components/ui';
import { countdownText } from '@/services/intelligence';
import { upcomingSaturday } from '@/utils/date';

/**
 * 顶层导航。
 * trip: true 的项会拼到 /trips/:tripId/ 下；其余是绝对路径。
 * mobile: true 的项出现在移动端底部导航（grid-cols-5，所以只挑 5 个）。
 */
/**
 * 顶层导航 —— 只放「场景」，不放「某个场景的子页面」。
 *
 * 旧实现把 行程 / 地图 / 预算（都是 Travel 子页）放进一级导航，
 * 没有当前旅行时它们是点了跳首页的死项。现在：
 *   · 旅行 / 周末 是场景入口，子导航在进入场景后才出现
 *   · Journey 提升为全局一级（聚合旅行 + 周末记录）
 * mobile: true 的项出现在移动端底部导航（grid-cols-5，所以只挑 5 个）。
 */
const NAV = [
  { to: '/', label: '首页', icon: '⌂', mobile: true },
  { to: 'travel', label: '旅行', icon: '✈', mobile: true },
  { to: 'weekend', label: '周末', icon: '☀', mobile: true },
  { to: '/journey', label: 'Journey', icon: '🗺️', mobile: true },
  { to: '/more', label: '更多', icon: '⋯', mobile: true },
];

/**
 * 解析导航项的目标路径。
 *   · travel  ：有当前旅行 → 直达 /trips/:id（Trip Cockpit）；无 → /travel
 *   · weekend ：这周末已有计划 → 直接进执行层 /weekend/plan（含时间线+地图）；
 *               还没有计划 → 进决策层 /weekend
 *   · 其余按绝对路径
 */
const navTo = (
  n: { to: string },
  paths: { travel: string; weekend: string },
): string => {
  if (n.to === 'travel') return paths.travel;
  if (n.to === 'weekend') return paths.weekend;
  return n.to;
};

const MORE_LINKS = [
  { to: 'bookings', label: '预订', icon: '🎟️' },
  { to: 'checklist', label: '清单', icon: '✓' },
  { to: 'files', label: '文件', icon: '📎' },
  { to: 'members', label: '同行成员', icon: '👥' },
  { to: 'assistant', label: 'AI 助手', icon: '✨' },
  { to: 'journey', label: 'Journey', icon: '🗺️' },
  { to: 'settings', label: '设置', icon: '⚙' },
];

export function BrandMark({ compact }: { compact?: boolean }) {
  return (
    <Link to="/" className="focus-ring flex items-center gap-2 rounded-lg">
      <span className="grid h-8 w-8 place-items-center rounded-lg border-[1.5px] border-ink bg-amber text-[15px] shadow-note">
        ✈
      </span>
      {!compact && <span className="text-[17px] font-extrabold tracking-tight">Trip OS</span>}
    </Link>
  );
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const tripId = useCurrentTripId();
  const location = useLocation();
  const navigate = useNavigate();
  const trips = useStore((s) => s.db.trips);
  const settings = useStore((s) => s.settings);
  const weekendPlans = useStore((s) => s.db.weekendPlans);
  const saved = useStore((s) => s.db.savedPlaces);
  const hasWeekend = (weekendPlans ?? []).some(
    (p) => p.weekendOf === upcomingSaturday() && p.placeIds.length > 0,
  );
  const weekendTo = hasWeekend ? '/weekend/plan' : '/weekend';
  const savedCount = Object.values(saved ?? {}).reduce((s, ids) => s + ids.length, 0);

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  return (
    <aside
      className={cx(
        'fixed inset-y-0 left-0 hidden flex-col justify-between border-r-[1.5px] border-ink bg-paper/95 py-5 backdrop-blur lg:flex',
        collapsed ? 'w-[72px] items-center px-2' : 'w-[260px] px-4',
      )}
    >
      <div className={cx('flex min-h-0 flex-1 flex-col gap-5', collapsed && 'w-full')}>
        {/* 我的旅行空间 */}
        <div className="flex items-center justify-between">
          {!collapsed ? (
            <Link to="/" className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl border-[1.5px] border-ink bg-amber text-[16px] shadow-note">
                ✈
              </span>
              <div>
                <p className="text-[15px] font-extrabold">Trip OS</p>
                <p className="text-[10px] text-inkFaint">我的旅行空间</p>
              </div>
            </Link>
          ) : (
            <BrandMark compact />
          )}
          {!collapsed && (
            <button
              onClick={onToggle}
              title="收起侧边栏"
              className="focus-ring grid h-7 w-7 place-items-center rounded-lg border-[1.5px] border-ink/15 text-[13px] text-inkSoft transition hover:border-ink hover:text-ink"
            >
              ←
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={onToggle}
            title="展开侧边栏"
            className="focus-ring mx-auto grid h-8 w-8 place-items-center rounded-lg border-[1.5px] border-ink/15 text-[13px] text-inkSoft transition hover:border-ink hover:text-ink"
          >
            →
          </button>
        )}

        {!collapsed && (
          <div className="flex items-center gap-2 rounded-xl border-[1.5px] border-ink/10 bg-paperDeep px-3 py-2">
            <span className="grid h-9 w-9 place-items-center rounded-full border-[1.5px] border-ink/15 bg-white text-[16px]">
              🐻
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-bold">{settings.name || '旅行者'}</p>
              <p className="text-[10px] text-inkFaint">去看更大的世界</p>
            </div>
          </div>
        )}

        {/* 一级：高频业务 */}
        <nav className="space-y-1">
          <NavLink
            to="/"
            className={({ isActive }) =>
              cx(
                'focus-ring flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-semibold transition',
                isActive ? 'bg-ink text-white' : 'text-inkSoft hover:bg-paperDeep hover:text-ink',
              )
            }
          >
            <span className="w-4 text-center text-[13px]">⌂</span>
            {!collapsed && '首页'}
          </NavLink>

          <NavLink
            to={tripId ? `/trips/${tripId}` : '/travel'}
            className={({ isActive }) =>
              cx(
                'focus-ring flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-semibold transition',
                isActive && location.pathname.startsWith('/trips/')
                  ? 'bg-ink text-white'
                  : 'text-inkSoft hover:bg-paperDeep hover:text-ink',
              )
            }
          >
            <span className="w-4 text-center text-[13px]">✈</span>
            {!collapsed && '我的旅行'}
          </NavLink>

          {!collapsed && trips.length > 0 && (
            <div className="ml-4 space-y-0.5 border-l-[1.5px] border-ink/10 pl-2">
              {trips.slice(0, 4).map((t) => (
                <NavLink
                  key={t.id}
                  to={`/trips/${t.id}`}
                  className={({ isActive }) =>
                    cx(
                      'focus-ring flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] transition',
                      isActive ? 'bg-violet/15 text-ink' : 'text-inkSoft hover:bg-paperDeep hover:text-ink',
                    )
                  }
                >
                  <span>{t.emoji}</span>
                  <span className="truncate">{t.title}</span>
                </NavLink>
              ))}
              <Link
                to="/travel"
                className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] font-semibold text-inkSoft hover:text-ink"
              >
                全部旅行 →
              </Link>
            </div>
          )}

          <NavLink
            to={weekendTo}
            className={({ isActive }) =>
              cx(
                'focus-ring flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-semibold transition',
                isActive && location.pathname.startsWith('/weekend')
                  ? 'bg-ink text-white'
                  : 'text-inkSoft hover:bg-paperDeep hover:text-ink',
              )
            }
          >
            <span className="w-4 text-center text-[13px]">☀</span>
            {!collapsed && '周末计划'}
          </NavLink>

          <NavLink
            to="/guide"
            className={({ isActive }) =>
              cx(
                'focus-ring flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-semibold transition',
                isActive ? 'bg-ink text-white' : 'text-inkSoft hover:bg-paperDeep hover:text-ink',
              )
            }
          >
            <span className="w-4 text-center text-[13px]">📚</span>
            {!collapsed && '攻略 · Guide'}
          </NavLink>

          <Link
            to="/guide/my?import=1"
            className="focus-ring ml-1 flex items-center gap-2.5 rounded-xl border-[1.5px] border-ink/15 bg-paperDeep px-3 py-2 text-[13px] font-bold text-ink transition hover:-translate-y-[1px] hover:border-ink/30 hover:shadow-note"
          >
            <span className="w-4 text-center text-[13px]">＋</span>
            {!collapsed && '导入攻略'}
          </Link>

          <NavLink
            to="/journey"
            className={({ isActive }) =>
              cx(
                'focus-ring flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-semibold transition',
                isActive ? 'bg-ink text-white' : 'text-inkSoft hover:bg-paperDeep hover:text-ink',
              )
            }
          >
            <span className="w-4 text-center text-[13px]">🗺️</span>
            {!collapsed && 'Journey'}
          </NavLink>
        </nav>

        {/* 二级：个人资产 */}
        {!collapsed && (
          <div className="space-y-0.5 border-t-[1.5px] border-ink/10 pt-3">
            <p className="label px-3 pb-1">我的</p>
            <Link
              to={savedCount > 0 ? '/travel' : '/travel/destinations'}
              onClick={(e) => {
                if (!savedCount) {
                  e.preventDefault();
                  navigate('/travel/destinations');
                }
              }}
              className="focus-ring flex items-center justify-between rounded-xl px-3 py-1.5 text-[13px] text-inkSoft transition hover:bg-paperDeep hover:text-ink"
            >
              <span className="flex items-center gap-2.5">
                <span className="w-4 text-center">♥</span> 我的收藏
              </span>
              {savedCount > 0 && <span className="text-[11px]">{savedCount}</span>}
            </Link>
            <Link
              to="/journey"
              className="focus-ring flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-[13px] text-inkSoft transition hover:bg-paperDeep hover:text-ink"
            >
              <span className="w-4 text-center">📝</span> 我的记录
            </Link>
            <Link
              to="/trips/new"
              className="focus-ring flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-[13px] text-inkSoft transition hover:bg-paperDeep hover:text-ink"
            >
              <span className="w-4 text-center">📎</span> 文件
            </Link>
          </div>
        )}

        {/* 三级：辅助 */}
        {!collapsed && (
          <div className="space-y-0.5 border-t-[1.5px] border-ink/10 pt-3">
            <p className="label px-3 pb-1">更多</p>
            <Link
              to="/settings"
              className={cx(
                'focus-ring flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-[13px] transition',
                isActive('/settings') ? 'bg-violet/15 text-ink' : 'text-inkSoft hover:bg-paperDeep hover:text-ink',
              )}
            >
              <span className="w-4 text-center">⚙</span> 设置
            </Link>
            <Link
              to="/assistant"
              className={cx(
                'focus-ring flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-[13px] transition',
                isActive('/assistant') ? 'bg-violet/15 text-ink' : 'text-inkSoft hover:bg-paperDeep hover:text-ink',
              )}
            >
              <span className="w-4 text-center">✨</span> AI 助手
            </Link>
          </div>
        )}
      </div>

      {/* 底部创建入口 */}
      <div className={cx('space-y-2 pt-3', collapsed && 'flex w-full flex-col items-center')}>
        {!collapsed ? (
          <>
            <Link
              to="/quiz"
              className="flex items-center justify-between rounded-xl border-[1.5px] border-ink bg-amber/30 px-3 py-2 text-[12.5px] font-bold shadow-note transition hover:bg-amber/45"
            >
              我还没想好去哪
              <span>→</span>
            </Link>
            <Link
              to="/trips/new"
              className="flex items-center justify-between rounded-xl border-[1.5px] border-ink bg-white px-3 py-2 text-[12.5px] font-bold transition hover:bg-paperDeep"
            >
              已经决定了
              <span>→</span>
            </Link>
          </>
        ) : (
          <>
            <Link
              to="/quiz"
              title="我还没想好去哪"
              className="grid h-9 w-9 place-items-center rounded-xl border-[1.5px] border-ink bg-amber/30 text-[15px] font-bold shadow-note transition hover:bg-amber/45"
            >
              ?
            </Link>
            <Link
              to="/trips/new"
              title="已经决定了"
              className="grid h-9 w-9 place-items-center rounded-xl border-[1.5px] border-ink bg-white text-[15px] font-bold transition hover:bg-paperDeep"
            >
              +
            </Link>
          </>
        )}
      </div>
    </aside>
  );
}

function TopBar() {
  const location = useLocation();
  const tripId = useCurrentTripId();
  const title =
    location.pathname === '/'
      ? 'Trip OS'
      : location.pathname.startsWith('/travel')
        ? '旅行'
        : location.pathname.startsWith('/weekend')
          ? '周末'
          : location.pathname.startsWith('/journey')
            ? 'Journey'
            : tripId
              ? '工作台'
              : 'Trip OS';
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b-[1.5px] border-ink bg-paper/95 px-4 py-3 backdrop-blur lg:hidden">
      <div className="flex items-center gap-2">
        <BrandMark compact />
        <span className="text-[14px] font-bold">{title}</span>
      </div>
      <AIDock compact />
    </header>
  );
}

function BottomNav() {
  const tripId = useCurrentTripId();
  const location = useLocation();
  const weekendPlans = useStore((s) => s.db.weekendPlans);
  const paths = useMemo(
    () => ({
      travel: tripId ? `/trips/${tripId}` : '/travel',
      weekend: (weekendPlans ?? []).some(
        (p) => p.weekendOf === upcomingSaturday() && p.placeIds.length > 0,
      )
        ? '/weekend/plan'
        : '/weekend',
    }),
    [tripId, weekendPlans],
  );
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t-[1.5px] border-ink bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {NAV.filter((n) => n.mobile).map((n) => {
        const to = navTo(n, paths);
        const active = location.pathname === to || location.pathname.startsWith(`${to}/`);
        return (
          <NavLink
            key={n.label}
            to={to}
            className={cx(
              'flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition',
              active ? 'text-ink' : 'text-inkFaint',
            )}
          >
            <span className="text-[16px] leading-none">{n.icon}</span>
            {n.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

export function AIDock({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const tripId = useCurrentTripId();
  const pending = useStore((s) => s.db.proposals.filter((p) => p.status === 'pending').length);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cx(
          'focus-ring inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-ink bg-violet/15 font-bold shadow-note transition hover:bg-violet/25',
          compact ? 'px-3 py-1.5 text-[12.5px]' : 'px-4 py-2.5 text-[13px]',
        )}
      >
        ✨ {compact ? 'AI' : 'AI 助手'}
        <Badge count={pending} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="AI 助手" width="max-w-xl">
        <div className="h-[62vh]">
          <AIPanel tripId={tripId} autoFocus />
        </div>
      </Modal>
    </>
  );
}

export function RootLayout() {
  const sidebarCollapsed = useStore((s) => s.settings.sidebarCollapsed ?? false);
  const updateSettings = useStore((s) => s.updateSettings);
  const toggleSidebar = () => updateSettings({ sidebarCollapsed: !sidebarCollapsed });

  return (
    <div className="min-h-full">
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <TopBar />
      <main
        className={cx(
          'px-4 pb-28 pt-4 lg:px-8 lg:pb-12 lg:pt-8',
          sidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-[240px]',
        )}
      >
        <Outlet />
      </main>
      <BottomNav />
      <div className="fixed bottom-20 right-4 z-30 hidden lg:block">
        <AIDock />
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
  back,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  back?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <header className="mb-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        {back && (
          <button
            onClick={() => navigate(-1)}
            className="focus-ring mb-1.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-inkSoft hover:text-ink"
          >
            ← 返回
          </button>
        )}
        <h1 className="h1">{title}</h1>
        {subtitle && <p className="muted mt-1.5 max-w-[62ch]">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

/**
 * Quiz / Result / Recommendation：居中单列，减少干扰。
 *
 * 返回路径由**路由层级**推导，不再依赖 `?from=discover`。
 *
 * 为什么改：旧实现只在 `from === 'discover'` 时才渲染返回按钮，而所有 Travel
 * 决策页都靠它。/discover 作为超级容器被拆掉后，这条唯一的返回路径就断了。
 * 现在 /travel/* 一律返回 /travel，/weekend/* 一律返回 /weekend，
 * 无论用户是直接打开链接还是从别处跳进来，都回得去。
 */
export function FocusLayout({ children }: { children: ReactNode }) {
  const location = useLocation();

  const backTo = location.pathname.startsWith('/travel')
    ? { href: '/travel', label: '旅行' }
    : location.pathname.startsWith('/weekend')
      ? { href: '/weekend', label: '周末' }
      : location.pathname.startsWith('/journey')
        ? { href: '/', label: '首页' }
        : null;

  return (
    <div className="mx-auto w-full max-w-[720px]">
      {backTo && (
        <Link
          to={backTo.href}
          className="focus-ring mb-3 inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-ink/15 bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-inkSoft shadow-note transition hover:border-ink hover:text-ink"
        >
          ← 返回{backTo.label}
        </Link>
      )}
      {children}
    </div>
  );
}

/** Trip 上下文布局：顶部 Trip 信息 + 工作台子导航 */
export function TripLayout({ children }: { children?: ReactNode }) {
  const { tripId = '' } = useParams();
  const ctx = useTripCtx(tripId);
  const navigate = useNavigate();
  const location = useLocation();
  const ensureChecklists = useStore((s) => s.ensureChecklists);

  useEffect(() => {
    if (tripId) ensureChecklists(tripId);
  }, [tripId, ensureChecklists]);

  if (!ctx) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="h2">旅行不存在</p>
        <p className="muted mt-2">可能被删除了，或者链接已经失效。</p>
        <Button variant="primary" className="mt-4" onClick={() => navigate('/')}>
          回到首页
        </Button>
      </div>
    );
  }

  const { trip, preparation, conflicts } = ctx;
  const tabs = [
    { to: '', label: '概览' },
    { to: 'itinerary', label: '行程' },
    { to: 'map', label: '地图' },
    { to: 'plan', label: 'AI 规划' },
    { to: 'budget', label: '预算' },
    { to: 'checklist', label: '清单' },
    { to: 'today', label: trip.status === 'traveling' ? '今天' : '旅行中' },
    { to: 'journey', label: 'Journey' },
  ];

  return (
    <div className="space-y-4">
      <header className="card flex flex-wrap items-center gap-4 p-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border-[1.5px] border-ink bg-paperDeep text-[26px]">
          {trip.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="h2 truncate">{trip.title}</h1>
            <span className="rounded-full border-[1.5px] border-ink/15 px-2 py-0.5 text-[11px] font-semibold text-inkSoft">
              {trip.status === 'traveling' ? '旅行中' : trip.status === 'completed' ? '已完成' : '规划中'}
            </span>
          </div>
          <p className="muted mt-0.5">
            {trip.destinationName} · {trip.startDate} — {trip.endDate} · {countdownText(trip)}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="label">准备度</p>
            <div className="mt-1 flex items-center gap-2">
              <Ring value={preparation.score} size={52} tone="#7C5CFF" />
            </div>
          </div>
          {conflicts.length > 0 && (
            <button
              onClick={() => navigate(`/trips/${tripId}/plan`)}
              className="focus-ring rounded-xl border-[1.5px] border-rose/40 bg-rose/10 px-3 py-2 text-left"
            >
              <p className="text-[11px] font-bold text-rose">待处理</p>
              <p className="text-[13px] font-extrabold">{conflicts.length} 项</p>
            </button>
          )}
        </div>
      </header>

      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        {tabs.map((t) => {
          const to = `/trips/${tripId}${t.to ? `/${t.to}` : ''}`;
          const active = location.pathname === to;
          return (
            <Link
              key={t.label}
              to={to}
              className={cx(
                'focus-ring shrink-0 rounded-full border-[1.5px] px-3.5 py-1.5 text-[13px] font-semibold transition',
                active ? 'border-ink bg-ink text-white' : 'border-ink/15 bg-white text-inkSoft hover:border-ink/40',
              )}
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

export function MoreGrid() {
  const tripId = useCurrentTripId();
  const navigate = useNavigate();
  const needsTrip = (to: string) => to !== 'settings' && to !== 'assistant';
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {MORE_LINKS.map((l) => {
        const disabled = needsTrip(l.to) && !tripId;
        const to = disabled ? '#' : l.to === 'settings' || l.to === 'assistant' ? `/${l.to}` : `/trips/${tripId}/${l.to}`;
        return (
          <Link
            key={l.to}
            to={to}
            onClick={(e) => {
              if (disabled) {
                e.preventDefault();
                navigate('/trips/new');
              }
            }}
            className={cx(
              'card flex items-center gap-3 p-4 transition',
              disabled
                ? 'border-dashed border-ink/25 bg-paperDeep/60 text-inkFaint hover:border-ink/40 hover:text-ink'
                : 'hover:-translate-y-[1px] hover:shadow-noteLg',
            )}
            title={disabled ? '需要先创建一个旅行' : l.label}
          >
            <span className={cx(
              'grid h-10 w-10 place-items-center rounded-xl border-[1.5px] text-[18px]',
              disabled ? 'border-ink/10 bg-paperDeep text-inkFaint' : 'border-ink/15 bg-paperDeep',
            )}>
              {l.icon}
            </span>
            <span className="text-[14px] font-bold">{l.label}</span>
            {disabled ? (
              <span className="ml-auto text-[11px] font-semibold text-inkFaint">需先建旅行</span>
            ) : (
              <span className="ml-auto text-inkFaint">→</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
const useTripCtx = useTripContext;
