import { useEffect } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { RootLayout, FocusLayout, TripLayout } from '@/components/layout';
import { SheetProvider, ToastHost } from '@/components/ui';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useStore, STATE_VERSION } from '@/services/store';
import {
  attachSyncToStore,
  ensureAuthed,
  flushNow,
  hydrateFromBackend,
  pushState,
} from '@/services/sync';

/** 兼容历史版本：接受 [1, STATE_VERSION] 区间的快照，避免升级后本地数据被判为「无数据」 */
const versionOk = (v: unknown): boolean =>
  typeof v === 'number' && v >= 1 && v <= STATE_VERSION;

import { HomePage } from '@/pages/HomePage';
import { QuizPage } from '@/pages/QuizPage';
import { QuizResultPage } from '@/pages/QuizResultPage';
import { RecommendPage } from '@/pages/RecommendPage';
import { DestinationDetailPage } from '@/pages/DestinationDetailPage';
import { CreateTripPage } from '@/pages/CreateTripPage';
import { RandomDrawPage } from '@/pages/RandomDrawPage';
import { ComparePage } from '@/pages/ComparePage';
// Travel Context
import { TravelHomePage } from '@/pages/travel/TravelHomePage';
// Weekend Context
import { WeekendHomePage } from '@/pages/weekend/WeekendHomePage';
import { WeekendWherePage } from '@/pages/weekend/WeekendWherePage';
import { WeekendNearbyPage } from '@/pages/weekend/WeekendNearbyPage';
import { WeekendFoodPage } from '@/pages/weekend/WeekendFoodPage';
import { WeekendFunPage } from '@/pages/weekend/WeekendFunPage';
import { WeekendAreasPage } from '@/pages/weekend/WeekendAreasPage';
import { WeekendRandomPage } from '@/pages/weekend/WeekendRandomPage';
import { WeekendTodayPage } from '@/pages/weekend/WeekendTodayPage';
import { WeekendChecklistPage } from '@/pages/weekend/WeekendChecklistPage';
import { WeekendAIPage } from '@/pages/weekend/WeekendAIPage';
import { WeekendPlanPage } from '@/pages/WeekendPlanPage';
// Journey（全局）
import { JourneyGlobalPage } from '@/pages/JourneyGlobalPage';
import { MorePage } from '@/pages/MorePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { installAmapWorld } from '@/services/world/amap';
import { WeekendLayout } from '@/components/layout/WeekendLayout';
import { parseIntent, routeForIntent } from '@/utils/parseIntent';
import { Link } from 'react-router-dom';

import { TripOverviewPage } from '@/pages/trip/TripOverviewPage';
// 把高德真实能力（天气等）接进 World Provider 接口；未配置 Key 时优雅降级。
installAmapWorld();
import { ItineraryPage } from '@/pages/trip/ItineraryPage';
import { MapPage } from '@/pages/trip/MapPage';
import { AIPlanPage } from '@/pages/trip/AIPlanPage';
import { BudgetPage } from '@/pages/trip/BudgetPage';
import { ChecklistPage } from '@/pages/trip/ChecklistPage';
import { BookingsPage } from '@/pages/trip/BookingsPage';
import { FilesPage } from '@/pages/trip/FilesPage';
import { MembersPage } from '@/pages/trip/MembersPage';
import { AssistantPage } from '@/pages/trip/AssistantPage';
import { TodayPage } from '@/pages/trip/TodayPage';
import { JourneyPage } from '@/pages/trip/JourneyPage';
import { GuideMarketPage } from '@/features/guide/GuideMarketPage';
import { GuideContentPage } from '@/features/guide/GuideContentPage';
import { MyGuidesPage } from '@/features/guide/MyGuidesPage';

/** 旧 /destinations/:id → /travel/destinations/:id */
function LegacyDestinationRedirect() {
  const { destinationId } = useParams();
  return <Navigate to={`/travel/destinations/${destinationId ?? ''}`} replace />;
}

/**
 * /discover 兼容入口。
 *
 * 「发现」不再是一个凌驾于 Travel / Weekend 之上的超级容器：
 *   · 带了 scene     → 直接进对应 Context
 *   · 带了 q 且能判出 context/intent → 重定向到对应页面
 *   · 判断不出来     → 落在轻量选择入口（只有两个选项，不是超级页面）
 */
function DiscoverRedirect() {
  const [params] = useSearchParams();
  const location = useLocation();
  const scene = location.pathname.split('/')[2] ?? '';
  const q = params.get('q') ?? '';

  if (scene === 'weekend') return <Navigate to={q ? `/weekend/where?q=${encodeURIComponent(q)}` : '/weekend'} replace />;
  if (scene === 'travel') return <Navigate to={q ? `/travel/destinations?q=${encodeURIComponent(q)}` : '/travel'} replace />;

  if (q) {
    const parsed = parseIntent(q);
    if (!parsed.needsClarify) return <Navigate to={routeForIntent(parsed)} replace />;
  }
  return <ContextPickPage />;
}

/** 判断不出 Context 时的轻量选择入口（刻意只有两个选项） */
function ContextPickPage() {
  return (
    <div className="mx-auto max-w-[720px] space-y-4 py-8">
      <header>
        <h1 className="h1">想去哪儿？</h1>
        <p className="muted mt-2">先选一个场景，之后的能力会跟着场景走。</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/travel"
          className="card flex items-center gap-3 p-5 transition hover:-translate-y-[1px] hover:shadow-noteLg"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl border-[1.5px] border-ink/15 bg-paperDeep text-[20px]">
            ✈️
          </span>
          <span>
            <span className="block text-[15px] font-bold">旅行</span>
            <span className="muted block text-[12.5px]">选目的地、排行程、管预算</span>
          </span>
        </Link>
        <Link
          to="/weekend"
          className="card flex items-center gap-3 p-5 transition hover:-translate-y-[1px] hover:shadow-noteLg"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl border-[1.5px] border-ink/15 bg-paperDeep text-[20px]">
            ☀
          </span>
          <span>
            <span className="block text-[15px] font-bold">周末</span>
            <span className="muted block text-[12.5px]">附近去哪、吃什么、怎么安排</span>
          </span>
        </Link>
      </div>
    </div>
  );
}

export function App() {
  // 数据迁移 —— 自动匿名登录 + 与后端同步 state
  // 原则：当前浏览器本地 state 优先，远程只作为「本地没有数据时恢复」或跨设备同步兜底。
  // 这样可以避免刷新页面时远程的 activeTripId / db 把当前行程覆盖成别的。
  useEffect(() => {
    let detachSync: (() => void) | null = null;
    let cancelled = false; // StrictMode 双调用保护
    (async () => {
      try {
        const authed = await ensureAuthed();
        if (cancelled || !authed) return;

        // 1. 先读本地 persisted state，作为权威起点
        const LS_KEY = 'trip-os:v1';
        let local: {
          state: { db: unknown; activeTripId: string | null; quiz: unknown; settings: unknown };
          version: number;
        } | null = null;
        try {
          const raw = localStorage.getItem(LS_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (versionOk(parsed?.version) && parsed?.state) local = parsed;
          }
        } catch {
          /* ignore */
        }

        // 2. 拉一次远程 state；如果本地没有有效数据，用远程恢复
        let usedRemote = false;
        try {
          const r = await fetch('/api/state', { credentials: 'include' });
          const remote = (await r.json()) as { ok: boolean; exists: boolean; json?: string };
          if (cancelled) return;
          if (remote.ok && remote.exists && remote.json) {
            const snap = JSON.parse(remote.json) as {
              state: { db: unknown; activeTripId: string | null; quiz: unknown; settings: unknown };
              version: number;
            };
            if (versionOk(snap.version)) {
              const cur = useStore.getState();
              const remoteDb = snap.state.db as Partial<typeof cur.db> | null;
              if (
                remoteDb &&
                Array.isArray(remoteDb.trips) &&
                Array.isArray(remoteDb.days) &&
                Array.isArray(remoteDb.activities)
              ) {
                if (!local) {
                  // 本地没有数据：用远程恢复，但补齐新字段
                  const mergedDb: typeof cur.db = {
                    ...cur.db,
                    ...remoteDb,
                    // 历史混合集合（只读，不再写入）
                    discoveredPlaces: Array.isArray(remoteDb.discoveredPlaces)
                      ? remoteDb.discoveredPlaces
                      : [],
                    savedPlaces: remoteDb.savedPlaces ?? cur.db.savedPlaces,
                    proposals: Array.isArray(remoteDb.proposals) ? remoteDb.proposals : cur.db.proposals,
                    // Phase 0 新增集合：远程没有时必须给 []，
                    // 不能回落到 cur.db（那是 buildInitialDB 的种子数据，会污染用户数据）
                    placeStates: Array.isArray(remoteDb.placeStates) ? remoteDb.placeStates : [],
                    weekendPlans: Array.isArray(remoteDb.weekendPlans) ? remoteDb.weekendPlans : [],
                    destinationPicks: Array.isArray(remoteDb.destinationPicks)
                      ? remoteDb.destinationPicks
                      : [],
                    // v3：地点池按业务上下文拆分，远程没有时必须给 []
                    travelDiscoveredPlaces: Array.isArray(remoteDb.travelDiscoveredPlaces)
                      ? remoteDb.travelDiscoveredPlaces
                      : [],
                    weekendDiscoveredPlaces: Array.isArray(remoteDb.weekendDiscoveredPlaces)
                      ? remoteDb.weekendDiscoveredPlaces
                      : [],
                  };
                  useStore.setState({
                    db: mergedDb,
                    activeTripId: snap.state.activeTripId ?? null,
                    quiz: snap.state.quiz as typeof cur.quiz,
                    settings: snap.state.settings as typeof cur.settings,
                  } as Parameters<typeof useStore.setState>[0]);
                  usedRemote = true;
                }
              }
            }
          }
        } catch {
          /* offline tolerant */
        }
        if (cancelled) return;

        // 3. 本地优先且以本地为准：
        //    · 本地有数据 → 主动推到后端，覆盖可能陈旧的远程（避免之后某次「无本地」
        //      时把陈旧远程当成真行程覆盖上来，造成「刷新后行程被换」）。
        //    · 本地无数据 → 用远程恢复（仅首次迁移）。
        if (local) {
          if (cancelled) return;
          const s = useStore.getState();
          await pushState({
            state: { db: s.db, activeTripId: s.activeTripId, quiz: s.quiz, settings: s.settings },
            version: STATE_VERSION,
          });
        } else if (!usedRemote) {
          await hydrateFromBackend();
        }
        if (cancelled) return;

        // 4. 启动同步：之后本地变动 debounce 上推
        const sync = attachSyncToStore(() => useStore.getState());
        detachSync = sync.detach;
      } catch (err) {
        if (!cancelled) {
          console.error('App hydrate 阶段报错 (忽略, 继续用本地):', err);
        }
      }
    })();

    const onPageHide = () => {
      void flushNow(() => useStore.getState());
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      cancelled = true;
      window.removeEventListener('pagehide', onPageHide);
      if (detachSync) detachSync();
    };
  }, []);

  return (
    <SheetProvider>
      <Routes>
        <Route element={<RootLayout />}>
          {/* 全局首页：只回答「我现在有什么 / 想做什么 / 该进旅行还是周末」 */}
          <Route path="/" element={<HomePage />} />

          {/* ── Travel Context ───────────────────────────────── */}
          <Route path="/travel" element={<TravelHomePage />} />
          <Route
            path="/travel/quiz"
            element={
              <FocusLayout>
                <QuizPage />
              </FocusLayout>
            }
          />
          <Route
            path="/travel/quiz/result"
            element={
              <FocusLayout>
                <QuizResultPage />
              </FocusLayout>
            }
          />
          <Route
            path="/travel/destinations"
            element={
              <FocusLayout>
                <RecommendPage />
              </FocusLayout>
            }
          />
          <Route
            path="/travel/destinations/:destinationId"
            element={
              <FocusLayout>
                <ErrorBoundary>
                  <DestinationDetailPage />
                </ErrorBoundary>
              </FocusLayout>
            }
          />
          <Route
            path="/travel/random"
            element={
              <FocusLayout>
                <RandomDrawPage />
              </FocusLayout>
            }
          />
          <Route
            path="/travel/compare"
            element={
              <FocusLayout>
                <ComparePage />
              </FocusLayout>
            }
          />
          <Route
            path="/travel/new"
            element={
              <FocusLayout>
                <CreateTripPage />
              </FocusLayout>
            }
          />

          {/* ── Weekend Context（统一外壳：顶部状态卡 + 子导航）── */}
          <Route path="/weekend" element={<WeekendLayout />}>
            <Route index element={<WeekendHomePage />} />
            <Route path="plan" element={<WeekendPlanPage />} />
            <Route path="where" element={<WeekendWherePage />} />
            <Route path="nearby" element={<WeekendNearbyPage />} />
            <Route path="food" element={<WeekendFoodPage />} />
            <Route path="fun" element={<WeekendFunPage />} />
            <Route path="areas" element={<WeekendAreasPage />} />
            <Route path="random" element={<WeekendRandomPage />} />
            <Route path="today" element={<WeekendTodayPage />} />
            <Route path="checklist" element={<WeekendChecklistPage />} />
            <Route path="ai" element={<WeekendAIPage />} />
          </Route>

          {/* Journey：全局一级入口，聚合旅行 + 周末记录 */}
          <Route
            path="/journey"
            element={
              <FocusLayout>
                <JourneyGlobalPage />
              </FocusLayout>
            }
          />

          {/*
            兼容层：Travel 决策链下沉到 /travel 命名空间。
            /discover 不再作为凌驾于 Travel / Weekend 之上的超级容器，
            改为按 intent / context 重定向；判断不出来才落到轻量选择入口。
          */}
          <Route path="/quiz" element={<Navigate to="/travel/quiz" replace />} />
          <Route path="/quiz/result" element={<Navigate to="/travel/quiz/result" replace />} />
          <Route path="/destinations" element={<Navigate to="/travel/destinations" replace />} />
          <Route path="/destinations/:destinationId" element={<LegacyDestinationRedirect />} />
          <Route path="/random" element={<Navigate to="/travel/random" replace />} />
          <Route path="/compare" element={<Navigate to="/travel/compare" replace />} />
          <Route path="/trips/new" element={<Navigate to="/travel/new" replace />} />
          <Route path="/discover" element={<DiscoverRedirect />} />
          <Route path="/discover/:scene" element={<DiscoverRedirect />} />

          {/* 旅行工作台 */}
          <Route
            path="/trips/:tripId"
            element={
              <ErrorBoundary>
                <TripLayout />
              </ErrorBoundary>
            }
          >
            <Route index element={<TripOverviewPage />} />
            <Route path="itinerary" element={<ItineraryPage />} />
            <Route path="map" element={<MapPage />} />
            <Route path="plan" element={<AIPlanPage />} />
            <Route path="budget" element={<BudgetPage />} />
            <Route path="checklist" element={<ChecklistPage />} />
            <Route path="bookings" element={<BookingsPage />} />
            <Route path="files" element={<FilesPage />} />
            <Route path="members" element={<MembersPage />} />
            <Route path="assistant" element={<AssistantPage />} />
            <Route path="today" element={<TodayPage />} />
            <Route path="journey" element={<JourneyPage />} />
          </Route>

          {/* 更多 */}
          <Route path="/more" element={<MorePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route
            path="/assistant"
            element={
              <FocusLayout>
                <AssistantPage />
              </FocusLayout>
            }
          />

          {/* 攻略市场（与当前 Trip 解耦的内容发现中心） */}
          <Route path="/guide" element={<GuideMarketPage />} />
          <Route path="/guide/search" element={<GuideMarketPage />} />
          <Route path="/guide/c/:id" element={<GuideContentPage />} />
          <Route path="/guide/my" element={<MyGuidesPage />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <ToastHost />
    </SheetProvider>
  );
}
