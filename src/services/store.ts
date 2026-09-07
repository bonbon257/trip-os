import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Activity,
  ActivityStatus,
  ActivityType,
  Booking,
  BookingStatus,
  Checklist,
  ChecklistPhase,
  Day,
  Expense,
  ExpenseStatus,
  FileAsset,
  ID,
  Journal,
  Place,
  Trip,
  TripStatus,
  AIProposal,
  // Phase 0：统一计划层
  PlaceState,
  WeekendPlan,
  DestinationPick,
  // Phase 1：状态流转与周末计划读写
  PlaceContainerType,
  PlaceStatus,
  // P0：业务数据上下文隔离（地点池拆 Travel / Weekend）
  PlaceContext,
  GuideContent,
} from '@/types';
import type { ScoredDestination, TravelTypeResult } from '@/types/decision';
import { buildSeed } from '@/data/seed';
import { DESTINATIONS } from '@/data/destinations';
import { findPlace, getPlace, getPlaces, resolveCityIds } from '@/data/places';
import { ensureTripChecklists } from './checklist';
import { estimateTransit } from './route';
import { addDays, addMinutes, dateRange, todayISO } from '@/utils/date';
import { uid } from '@/utils/id';
import { applyActions } from '@/ai/actions';
import { seedPlaceStates, upsertPlaceState } from './placeState';
import { buildTrip, distributeCities, type NewTripInput } from './tripFactory';

// distributeCities / seedExpenses / NewTripInput 已抽到 ./tripFactory
// （AI Action 的 createTrip 与 store.createTrip 复用同一套建 Trip 逻辑）

export interface DB {
  trips: Trip[];
  days: Day[];
  activities: Activity[];
  bookings: Booking[];
  expenses: Expense[];
  checklists: Checklist[];
  files: FileAsset[];
  journals: Journal[];
  proposals: AIProposal[];
  savedPlaces: Record<ID, string[]>;

  /**
   * @deprecated 历史集合（v2 及以前）。仅保留用于迁移读取，**不再写入**。
   * 新代码一律用下面的 travelDiscoveredPlaces / weekendDiscoveredPlaces。
   */
  discoveredPlaces?: Place[];
  /**
   * Travel Context 的 POI 地点池。
   * 只有旅行侧（目的地详情 / POI 搜索 / 行程）读写。
   * 禁止周末推荐读取此集合。
   */
  travelDiscoveredPlaces: Place[];
  /**
   * Weekend Context 的 POI 地点池。
   * 只有周末侧（周末探索 / 周末计划）读写。
   * 禁止旅行推荐读取此集合。
   */
  weekendDiscoveredPlaces: Place[];

  // ── Phase 0 新增（只存引用，不复制实体）──────────────────
  /** 地点在某个计划容器内的状态：想去 / 考虑中 / 已安排 / 已去过 */
  placeStates: PlaceState[];
  /** 周末出行 —— 轻量计划容器 */
  weekendPlans: WeekendPlan[];
  /** 目的地推荐的落库结果（只存 id + score + reason，不存完整 Destination） */
  destinationPicks: DestinationPick[];

  // ── Guide Market（攻略市场，与当前 Trip 解耦）──────────────
  /** 用户导入 / 自建的攻略内容（官方 / 目的地 Guide 不重复落库，按需派生） */
  guideContents: GuideContent[];
  /** 攻略收藏 id（与地点收藏 savedPlaces 完全分离） */
  guideFavIds: ID[];
  /** 正在使用的攻略 id */
  activeGuideIds: ID[];
  /** 已完成的攻略 id */
  completedGuideIds: ID[];
  /** 全局地点收藏 id（与攻略收藏、行程内收藏完全分离） */
  favPlaceIds: ID[];
}

export interface QuizState {
  step: number;
  answers: Partial<import('@/types').QuizAnswers>;
  result: TravelTypeResult | null;
  recs: ScoredDestination[];
  pickedId: string | null;
  updatedAt: string;
}

export interface Settings {
  name: string;
  homeCity: string;
  /** AI 高危操作是否必须先确认（永远默认 true，UI 不允许关闭） */
  confirmHighRisk: boolean;
  showIntensityHints: boolean;
  /** 总闸：关闭后任何地方都不调用模型（用于彻底断开网络请求） */
  useLLM: boolean;
  /** 面板级：用户是否开启「AI 辅助」。默认关闭 —— 只有主动开启才发请求 */
  aiAssist: boolean;
  /** 桌面端侧边栏是否收起（只显示图标） */
  sidebarCollapsed?: boolean;

  // ── 定位（周末侧用真实位置做「附近」，不靠 homeCity 猜）──────
  /** 用户点「使用我的位置」授权后写入的精确坐标 */
  coords?: { lat: number; lng: number };
  /** 取得坐标的时间（ISO）。超过 LOCATION_TTL_MS 会重新问一次 */
  coordsAt?: string;
  /** 用户明确拒绝过定位 —— 之后不再弹，避免反复打扰 */
  locationDenied?: boolean;
}

/** 定位有效期：30 天。过期不会静默失效，只是再问一次（用户可忽略） */
export const LOCATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 建 Trip 的输入类型（定义在 ./tripFactory，此处再导出以兼容既有引用） */
export type { NewTripInput } from './tripFactory';

export interface StoreState {
  db: DB;
  activeTripId: ID | null;
  quiz: QuizState;
  settings: Settings;

  setActiveTrip: (id: ID | null) => void;

  createTrip: (input: NewTripInput) => Trip;
  updateTrip: (id: ID, patch: Partial<Trip>) => void;
  deleteTrip: (id: ID) => void;
  setTripStatus: (id: ID, status: TripStatus) => void;
  regenerateDays: (tripId: ID, startDate: string, endDate: string) => void;

  updateDay: (id: ID, patch: Partial<Day>) => void;
  addDay: (tripId: ID) => void;
  deleteDay: (id: ID) => void;

  createActivity: (input: Partial<Activity> & { dayId: ID; title: string }) => Activity;
  updateActivity: (id: ID, patch: Partial<Activity>) => void;
  deleteActivity: (id: ID) => void;
  unscheduleActivity: (actId: ID) => void;
  moveActivity: (id: ID, toDayId: ID, toIndex?: number) => void;
  reorderActivity: (dayId: ID, from: number, to: number) => void;
  setActivityStatus: (id: ID, status: ActivityStatus) => void;
  clearDay: (dayId: ID) => void;

  toggleSavePlace: (tripId: ID, placeId: string) => void;
  schedulePlace: (dayId: ID, placeId: string, atTime?: string) => Activity | undefined;
  /**
   * 写入从高德 POI 搜索得到的地点，让 schedulePlace 能找到。
   *
   * context 必填：业务数据必须落在 Travel 或 Weekend 自己的地点池里，
   * 这是「业务数据隔离、底层能力复用」的落点——Place 实体共用，
   * 但旅行侧与周末侧的地点池互不读取。
   */
  addDiscoveredPlace: (place: Place, context: PlaceContext) => void;

  // ── Guide Market（攻略市场）────────────────────────────────
  /** 收藏 / 取消收藏一条攻略（与地点收藏分离） */
  toggleGuideFav: (id: ID) => void;
  /** 保存用户自建攻略内容（source=user） */
  saveUserGuide: (g: GuideContent) => void;
  /** 从小红书等导入一条攻略内容（source=xhs） */
  importGuide: (input: Omit<GuideContent, 'id' | 'source' | 'createdAt'>) => ID;
  /** 标记攻略「正在使用」 */
  setGuideActive: (id: ID, on: boolean) => void;
  /** 标记攻略「已完成」 */
  setGuideCompleted: (id: ID, on: boolean) => void;
  /** 收藏 / 取消收藏一个地点（全局，独立于攻略与行程） */
  toggleFavPlace: (placeId: ID) => void;

  createExpense: (input: Partial<Expense> & { tripId: ID; title: string }) => void;
  updateExpense: (id: ID, patch: Partial<Expense>) => void;
  deleteExpense: (id: ID) => void;
  setExpenseStatus: (id: ID, status: ExpenseStatus) => void;

  createBooking: (input: Partial<Booking> & { tripId: ID; title: string }) => void;
  /** 智能默认：进入预订页为空时，按出发地/目的地/天数铺好机票+酒店占位 */
  seedDefaultBookings: (tripId: ID) => void;
  updateBooking: (id: ID, patch: Partial<Booking>) => void;
  deleteBooking: (id: ID) => void;
  setBookingStatus: (id: ID, status: BookingStatus) => void;

  ensureChecklists: (tripId: ID) => void;
  toggleChecklistItem: (tripId: ID, itemId: ID) => void;
  addChecklistItem: (tripId: ID, phase: ChecklistPhase, title: string) => void;
  deleteChecklistItem: (tripId: ID, itemId: ID) => void;

  addFile: (input: Partial<FileAsset> & { tripId: ID; name: string }) => void;
  deleteFile: (id: ID) => void;

  upsertJournal: (input: Partial<Journal> & { tripId: ID; date: string }) => void;

  addProposal: (p: AIProposal) => void;
  applyProposal: (id: ID) => number;
  rejectProposal: (id: ID) => void;

  setQuiz: (patch: Partial<QuizState>) => void;
  resetQuiz: () => void;
  updateSettings: (patch: Partial<Settings>) => void;

  resetAll: () => void;

  // ── Phase 1：统一计划层的数据读写 ──────────────────────────
  // （Phase 0 只建了数据模型与纯函数，这里补上 UI 需要的写入口）

  /** 写入 / 更新某地点在某容器内的状态。四态任意方向可流转，无单向门禁 */
  setPlaceState: (input: {
    containerType: PlaceContainerType;
    containerId: ID;
    placeId: ID;
    status: PlaceStatus;
  }) => void;

  /** 创建一个周末计划（同一 weekendOf 已存在则直接返回其 id，幂等） */
  createWeekendPlan: (input: {
    weekendOf: string;
    endDate?: string;
    homeCity?: string;
    title?: string;
  }) => ID;

  updateWeekendPlan: (id: ID, patch: Partial<WeekendPlan>) => void;
}

// ── 初始数据 ────────────────────────────────────────────────
function buildInitialDB(): DB {
  const seed = buildSeed();
  const db: DB = {
    trips: seed.trips,
    days: seed.days,
    discoveredPlaces: [],
    travelDiscoveredPlaces: [],
    weekendDiscoveredPlaces: [],
    activities: seed.activities,
    bookings: seed.bookings,
    expenses: seed.expenses,
    checklists: [],
    files: seed.files,
    journals: seed.journals,
    proposals: [],
    savedPlaces: {},
    // Phase 0 新增集合
    placeStates: [],
    weekendPlans: [],
    destinationPicks: [],
    // Guide Market
    guideContents: [],
    guideFavIds: [],
    activeGuideIds: [],
    completedGuideIds: [],
    favPlaceIds: [],
  };
  db.checklists = db.trips.flatMap((t) => ensureTripChecklists(t, [], db.bookings, db.files));
  // 由种子数据推导 PlaceState，保证新用户与升级用户的数据结构一致
  db.placeStates = seedPlaceStates(db);
  return db;
}

const emptyQuiz: QuizState = {
  step: 0,
  answers: {},
  result: null,
  recs: [],
  pickedId: null,
  updatedAt: '',
};

const defaultSettings: Settings = {
  name: '旅行者',
  // 刻意留空：不再假设用户在上海。留空会触发「使用我的位置」提示，
  // 由用户自己确认所在城市（PRD：不能拿静态数据冒充附近实时推荐）。
  homeCity: '',
  confirmHighRisk: true,
  showIntensityHints: true,
  useLLM: true,
  aiAssist: false,
  sidebarCollapsed: false,
};

/** 建 Trip 的初始预算骨架已抽到 ./tripFactory（seedExpenses） */

const placeOfFactory = (db: DB) => (id?: string): Place | undefined => {
  if (!id) return undefined;
  const trip = db.trips.find((t) => db.activities.some((a) => a.placeId === id && a.tripId === t.id));
  return findPlace(trip, id);
};

/**
 * v1 → v2 迁移（导出以便测试）。
 *
 *   新增 placeStates / weekendPlans / destinationPicks 三个集合。
 *
 * · 只在版本号不一致时被调用一次（zustand persist 行为），随后自动 setItem 回写。
 * · placeStates 由现有数据播种（savedPlaces + Activity 状态推导），
 *   这样老用户升级后「想去 / 已安排 / 已去过」立刻有真实数据，而不是空集合。
 * · 幂等：seedPlaceStates 会跳过已存在的记录。
 * · 绝不修改 trips / days / activities 等既有数据。
 */
/**
 * 当前 persisted state 的版本号。
 *
 * ⚠️ App.tsx 的后端同步逻辑（sync.ts / hydrate）也会用到它。
 *    v1 → v2 之后，App.tsx 里原本写死的 `version === 1` 会把 v2 数据判定为
 *    「本地无数据」，转而从远程恢复，造成刷新后行程被换掉。
 *    所以版本号必须从这里统一导出，不要在各处写死。
 */
export const STATE_VERSION = 3;

/**
 * v2 → v3：把混合的 discoveredPlaces 拆成 Travel / Weekend 两个地点池。
 *
 * 归属判定（不靠猜，靠已有引用关系）：
 *   · 被 weekendPlans[].placeIds 引用 → 周末
 *   · 被 containerType==='WEEKEND' 的 placeStates 引用 → 周末
 *   · 其余 → 旅行
 *
 * 旧 discoveredPlaces 字段**原样保留**不删除，保证老数据不丢；
 * 只是从 v3 起不再写入，新代码一律读写上面两个集合。
 */
function splitDiscoveredPlaces(db: Partial<DB>): {
  travel: Place[];
  weekend: Place[];
} {
  const legacy = Array.isArray(db.discoveredPlaces) ? db.discoveredPlaces : [];
  const weekendIds = new Set<string>();
  for (const w of Array.isArray(db.weekendPlans) ? db.weekendPlans : []) {
    for (const pid of w.placeIds ?? []) weekendIds.add(pid);
  }
  for (const ps of Array.isArray(db.placeStates) ? db.placeStates : []) {
    if (ps.containerType === 'WEEKEND') weekendIds.add(ps.placeId);
  }
  return {
    travel: legacy.filter((p) => !weekendIds.has(p.id)),
    weekend: legacy.filter((p) => weekendIds.has(p.id)),
  };
}

export function migrateState(persisted: unknown, version: number): StoreState {
  const p = (persisted ?? {}) as Partial<StoreState> & { db?: Partial<DB> };
  if (version >= STATE_VERSION) return p as StoreState;

  const db = (p.db ?? {}) as Partial<DB>;
  const split = splitDiscoveredPlaces(db);
  const base: DB = {
    trips: Array.isArray(db.trips) ? db.trips : [],
    days: Array.isArray(db.days) ? db.days : [],
    activities: Array.isArray(db.activities) ? db.activities : [],
    bookings: Array.isArray(db.bookings) ? db.bookings : [],
    expenses: Array.isArray(db.expenses) ? db.expenses : [],
    checklists: Array.isArray(db.checklists) ? db.checklists : [],
    files: Array.isArray(db.files) ? db.files : [],
    journals: Array.isArray(db.journals) ? db.journals : [],
    proposals: Array.isArray(db.proposals) ? db.proposals : [],
    // 历史集合：保留原值不删，但从 v3 起只读不写
    discoveredPlaces: Array.isArray(db.discoveredPlaces) ? db.discoveredPlaces : [],
    // v3 新增：按引用关系拆分，已拆过的直接用已拆的值
    travelDiscoveredPlaces: Array.isArray(db.travelDiscoveredPlaces)
      ? db.travelDiscoveredPlaces
      : split.travel,
    weekendDiscoveredPlaces: Array.isArray(db.weekendDiscoveredPlaces)
      ? db.weekendDiscoveredPlaces
      : split.weekend,
    savedPlaces:
      db.savedPlaces && typeof db.savedPlaces === 'object' && !Array.isArray(db.savedPlaces)
        ? db.savedPlaces
        : {},
    placeStates: Array.isArray(db.placeStates) ? db.placeStates : [],
    weekendPlans: Array.isArray(db.weekendPlans) ? db.weekendPlans : [],
    destinationPicks: Array.isArray(db.destinationPicks) ? db.destinationPicks : [],
    // Guide Market：老数据兜底 []
    guideContents: Array.isArray(db.guideContents) ? db.guideContents : [],
    guideFavIds: Array.isArray(db.guideFavIds) ? db.guideFavIds : [],
    activeGuideIds: Array.isArray(db.activeGuideIds) ? db.activeGuideIds : [],
    completedGuideIds: Array.isArray(db.completedGuideIds) ? db.completedGuideIds : [],
    favPlaceIds: Array.isArray(db.favPlaceIds) ? db.favPlaceIds : [],
  };

  return { ...p, db: { ...base, placeStates: seedPlaceStates(base) } } as StoreState;
}

/**
 * 字段级合并（导出以便测试）。
 *
 * 默认浅合并会用 localStorage 里的旧 db 整体覆盖默认 db，旧数据缺新字段时
 * 会导致 undefined.filter() 白屏。这里逐字段校验合并，缺的用默认值补齐。
 *
 * Phase 0 注意：placeStates / weekendPlans / destinationPicks 的兜底值必须是 []，
 * 不能回落到 current.db（初始 db 含种子数据，会把种子地点状态错误灌进老用户数据）。
 */
export function mergeState(persisted: unknown, current: StoreState): StoreState {
  const p = (persisted ?? {}) as Partial<StoreState>;
  const pdb = (p.db ?? {}) as Partial<DB>;
  const cdb = current.db;
  const arr = <T,>(v: unknown, fallback: T[]): T[] => (Array.isArray(v) ? (v as T[]) : fallback);
  /**
   * 是否完全没有持久化数据（新用户首次打开）。
   *
   * 有持久化数据但缺新集合时，三个新集合兜底为 [] —— 绝不能回落到 current.db，
   * 否则初始 db 里的种子地点状态会被错误灌进老用户数据。
   * 完全没有持久化数据时才用 current.db（它含 buildInitialDB 正确播种的种子状态）。
   */
  const fresh = !p.db;
  const db: DB = {
    trips: arr(pdb.trips, cdb.trips),
    days: arr(pdb.days, cdb.days),
    activities: arr(pdb.activities, cdb.activities),
    bookings: arr(pdb.bookings, cdb.bookings),
    expenses: arr(pdb.expenses, cdb.expenses),
    checklists: arr(pdb.checklists, cdb.checklists),
    files: arr(pdb.files, cdb.files),
    journals: arr(pdb.journals, cdb.journals),
    proposals: arr(pdb.proposals, cdb.proposals),
    // 历史集合：老数据原样带过，新代码不再写入
    discoveredPlaces: arr(pdb.discoveredPlaces, []),
    // v3 新增：与 placeStates 同一套兜底规则——老数据兜 []，全新用户才用初始 db
    travelDiscoveredPlaces: arr(pdb.travelDiscoveredPlaces, fresh ? cdb.travelDiscoveredPlaces : []),
    weekendDiscoveredPlaces: arr(
      pdb.weekendDiscoveredPlaces,
      fresh ? cdb.weekendDiscoveredPlaces : [],
    ),
    savedPlaces:
      pdb.savedPlaces && typeof pdb.savedPlaces === 'object' && !Array.isArray(pdb.savedPlaces)
        ? pdb.savedPlaces
        : cdb.savedPlaces,
    // Phase 0 新增：见上方 fresh 注释——老数据兜底 []，全新用户才用初始 db 的播种结果
    placeStates: arr(pdb.placeStates, fresh ? cdb.placeStates : []),
    weekendPlans: arr(pdb.weekendPlans, fresh ? cdb.weekendPlans : []),
    destinationPicks: arr(pdb.destinationPicks, fresh ? cdb.destinationPicks : []),
    // Guide Market：老数据兜底 []，全新用户才用初始 db
    guideContents: arr(pdb.guideContents, fresh ? cdb.guideContents : []),
    guideFavIds: arr(pdb.guideFavIds, fresh ? cdb.guideFavIds : []),
    activeGuideIds: arr(pdb.activeGuideIds, fresh ? cdb.activeGuideIds : []),
    completedGuideIds: arr(pdb.completedGuideIds, fresh ? cdb.completedGuideIds : []),
    favPlaceIds: arr(pdb.favPlaceIds, fresh ? cdb.favPlaceIds : []),
  };
  return {
    ...current,
    activeTripId: typeof p.activeTripId === 'string' ? p.activeTripId : current.activeTripId,
    quiz: p.quiz && typeof p.quiz === 'object' ? { ...current.quiz, ...p.quiz } : current.quiz,
    settings: { ...current.settings, ...(p.settings ?? {}) },
    db,
  };
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      db: buildInitialDB(),
      activeTripId: null,
      quiz: emptyQuiz,
      settings: defaultSettings,

      setActiveTrip: (id) => set({ activeTripId: id }),

      // ── Trip ──────────────────────────────────────────────
      createTrip: (input) => {
        // 建 Trip 的实体逻辑在 ./tripFactory，与 AI Action 的 createTrip 共用
        const { trip, days, transitActs, expenses } = buildTrip(input);
        const tripId = trip.id;
        set((s) => {
          const db: DB = {
            ...s.db,
            trips: [trip, ...s.db.trips],
            days: [...s.db.days, ...days],
            activities: [...s.db.activities, ...transitActs],
            expenses: [...s.db.expenses, ...expenses],
            checklists: [
              ...s.db.checklists,
              ...ensureTripChecklists(trip, [], s.db.bookings, s.db.files),
            ],
            savedPlaces: { ...s.db.savedPlaces, [tripId]: [] },
          };
          return { db, activeTripId: tripId };
        });
        return trip;
      },

      updateTrip: (id, patch) =>
        set((s) => ({
          db: {
            ...s.db,
            trips: s.db.trips.map((t) =>
              t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t,
            ),
          },
        })),

      deleteTrip: (id) =>
        set((s) => ({
          db: {
            ...s.db,
            trips: s.db.trips.filter((t) => t.id !== id),
            days: s.db.days.filter((d) => d.tripId !== id),
            activities: s.db.activities.filter((a) => a.tripId !== id),
            bookings: s.db.bookings.filter((b) => b.tripId !== id),
            expenses: s.db.expenses.filter((e) => e.tripId !== id),
            checklists: s.db.checklists.filter((c) => c.tripId !== id),
            files: s.db.files.filter((f) => f.tripId !== id),
            journals: s.db.journals.filter((j) => j.tripId !== id),
          },
          activeTripId: s.activeTripId === id ? (s.db.trips[0]?.id ?? null) : s.activeTripId,
        })),

      setTripStatus: (id, status) => get().updateTrip(id, { status }),

      regenerateDays: (tripId, startDate, endDate) =>
        set((s) => {
          const trip = s.db.trips.find((t) => t.id === tripId);
          if (!trip) return {};
          const old = s.db.days.filter((d) => d.tripId === tripId);
          const oldIds = new Set(old.map((d) => d.id));
          const dates = dateRange(startDate, endDate);
          const cityDist = distributeCities(resolveCityIds(trip), dates.length);
          const days: Day[] = dates.map((date, i) => {
            const exist = old.find((d) => d.date === date);
            if (exist) return { ...exist, destinationId: cityDist[i] ?? exist.destinationId };
            return {
              id: `${tripId}-d${i + 1}-${uid('')}`,
              tripId,
              date,
              index: i + 1,
              destinationId: cityDist[i],
              title: `第 ${i + 1} 天`,
            };
          });
          const keepIds = new Set(days.map((d) => d.id));
          const removed = [...oldIds].filter((id) => !keepIds.has(id));
          return {
            db: {
              ...s.db,
              days: [...s.db.days.filter((d) => d.tripId !== tripId), ...days].sort(
                (a, b) => a.date.localeCompare(b.date),
              ),
              activities: s.db.activities.filter((a) => !removed.includes(a.dayId)),
            },
          };
        }),

      // ── Day ───────────────────────────────────────────────
      updateDay: (id, patch) =>
        set((s) => ({
          db: { ...s.db, days: s.db.days.map((d) => (d.id === id ? { ...d, ...patch } : d)) },
        })),

      addDay: (tripId) =>
        set((s) => {
          const days = s.db.days.filter((d) => d.tripId === tripId).sort((a, b) => a.index - b.index);
          const last = days[days.length - 1];
          const trip = s.db.trips.find((t) => t.id === tripId);
          if (!trip || !last) return {};
          const date = addDays(last.date, 1);
          const day: Day = {
            id: uid('day'),
            tripId,
            date,
            index: days.length + 1,
            title: `第 ${days.length + 1} 天`,
          };
          return {
            db: {
              ...s.db,
              days: [...s.db.days, day],
              trips: s.db.trips.map((t) => (t.id === tripId ? { ...t, endDate: date } : t)),
            },
          };
        }),

      deleteDay: (id) =>
        set((s) => ({
          db: {
            ...s.db,
            days: s.db.days.filter((d) => d.id !== id),
            activities: s.db.activities.filter((a) => a.dayId !== id),
          },
        })),

      // ── Activity ──────────────────────────────────────────
      createActivity: (input) => {
        const state = get();
        const day = state.db.days.find((d) => d.id === input.dayId);
        const trip = state.db.trips.find((t) => t.id === day?.tripId);
        const place = input.placeId ? findPlace(trip, input.placeId) : undefined;
        const siblings = state.db.activities
          .filter((a) => a.dayId === input.dayId)
          .sort((a, b) => a.order - b.order);
        const last = siblings[siblings.length - 1];
        const lastPlace = last?.placeId ? findPlace(trip, last.placeId) : undefined;
        const transit = place && lastPlace ? estimateTransit(lastPlace, place) : { mode: 'walk' as const, minutes: input.transportMin ?? 0 };
        const start = input.startTime ?? (last ? addMinutes(last.endTime, transit.minutes) : '09:30');
        const duration = place?.durationMin ?? 90;
        const activity: Activity = {
          id: uid('act'),
          tripId: day?.tripId ?? '',
          dayId: input.dayId,
          placeId: input.placeId,
          title: input.title,
          startTime: start,
          endTime: input.endTime ?? addMinutes(start, duration),
          type: (input.type ?? place?.category ?? 'sight') as ActivityType,
          note: input.note ?? (place?.requiredBooking ? '需要提前预约' : undefined),
          estimatedCost: input.estimatedCost ?? place?.avgCost ?? 0,
          transportMode: (input.transportMode ?? transit.mode) as Activity['transportMode'],
          transportMin: input.transportMin ?? transit.minutes,
          status: input.status ?? 'planned',
          pinned: input.pinned,
          order: siblings.length,
        };
        set((s) => ({ db: { ...s.db, activities: [...s.db.activities, activity] } }));
        return activity;
      },

      updateActivity: (id, patch) =>
        set((s) => ({
          db: {
            ...s.db,
            activities: s.db.activities.map((a) =>
              a.id === id ? { ...a, ...patch, endTime: patch.endTime ?? a.endTime } : a,
            ),
          },
        })),

      deleteActivity: (id) =>
        set((s) => {
          const target = s.db.activities.find((a) => a.id === id);
          return {
            db: {
              ...s.db,
              activities: s.db.activities
                .filter((a) => a.id !== id)
                .map((a) =>
                  target && a.dayId === target.dayId && a.order > target.order
                    ? { ...a, order: a.order - 1 }
                    : a,
                ),
              expenses: s.db.expenses.map((e) =>
                e.activityId === id ? { ...e, activityId: undefined } : e,
              ),
            },
          };
        }),

      moveActivity: (id, toDayId, toIndex) =>
        set((s) => {
          const target = s.db.activities.find((a) => a.id === id);
          const day = s.db.days.find((d) => d.id === toDayId);
          if (!target || !day) return {};
          const destId = s.db.trips.find((t) => t.id === day.tripId)?.destinationId ?? '';
          const siblings = s.db.activities
            .filter((a) => a.dayId === toDayId && a.id !== id)
            .sort((a, b) => a.order - b.order);
          siblings.splice(
            Math.max(0, Math.min(toIndex ?? siblings.length, siblings.length)),
            0,
            { ...target, dayId: toDayId, tripId: day.tripId },
          );

          // 顺序变化后，同步重算每一段与上一站之间的交通
          const recalculated = siblings.map((a, i) => {
            if (i === 0) return { ...a, order: 0, transportMin: 0 };
            const prevPlace = siblings[i - 1].placeId
              ? getPlace(destId, siblings[i - 1].placeId!)
              : undefined;
            const place = a.placeId ? getPlace(destId, a.placeId) : undefined;
            const t = prevPlace && place ? estimateTransit(prevPlace, place) : null;
            return {
              ...a,
              order: i,
              transportMin: t ? t.minutes : a.transportMin,
              transportMode: t ? t.mode : a.transportMode,
            };
          });
          const ids = new Set(recalculated.map((a) => a.id));
          return {
            db: {
              ...s.db,
              activities: [...s.db.activities.filter((a) => !ids.has(a.id)), ...recalculated],
            },
          };
        }),

      reorderActivity: (dayId, from, to) =>
        set((s) => {
          const list = s.db.activities
            .filter((a) => a.dayId === dayId)
            .sort((a, b) => a.order - b.order);
          if (from < 0 || to < 0 || from >= list.length || to >= list.length) return {};
          const [moved] = list.splice(from, 1);
          list.splice(to, 0, moved);
          const idOrder = new Map(list.map((a, i) => [a.id, i]));
          return {
            db: {
              ...s.db,
              activities: s.db.activities.map((a) =>
                idOrder.has(a.id) ? { ...a, order: idOrder.get(a.id)! } : a,
              ),
            },
          };
        }),

      setActivityStatus: (id, status) => get().updateActivity(id, { status }),

      clearDay: (dayId) =>
        set((s) => ({
          db: { ...s.db, activities: s.db.activities.filter((a) => a.dayId !== dayId) },
        })),

      // ── Place ─────────────────────────────────────────────
      toggleSavePlace: (tripId, placeId) =>
        set((s) => {
          const list = s.db.savedPlaces[tripId] ?? [];
          const next = list.includes(placeId)
            ? list.filter((p) => p !== placeId)
            : [...list, placeId];
          return { db: { ...s.db, savedPlaces: { ...s.db.savedPlaces, [tripId]: next } } };
        }),

      // 把活动退回候选池：保留在 savedPlaces，只是从行程里移除（expense 关联不动）
      unscheduleActivity: (actId) =>
        set((s) => {
          const target = s.db.activities.find((a) => a.id === actId);
          if (!target || !target.placeId) return {};
          const tripId = target.tripId;
          const saved = s.db.savedPlaces[tripId] ?? [];
          const savedNext = saved.includes(target.placeId)
            ? saved
            : [...saved, target.placeId];
          return {
            db: {
              ...s.db,
              activities: s.db.activities.filter((a) => a.id !== actId),
              savedPlaces: { ...s.db.savedPlaces, [tripId]: savedNext },
            },
          };
        }),

      addDiscoveredPlace: (place, context) =>
        set((s) => {
          const key =
            context === 'WEEKEND' ? 'weekendDiscoveredPlaces' : 'travelDiscoveredPlaces';
          if (s.db[key].some((p) => p.id === place.id)) return {};
          return {
            db: {
              ...s.db,
              [key]: [...s.db[key], place],
            },
          };
        }),

      // ── Guide Market（攻略市场）────────────────────────────
      toggleGuideFav: (id) =>
        set((s) => {
          const next = s.db.guideFavIds.includes(id)
            ? s.db.guideFavIds.filter((g) => g !== id)
            : [...s.db.guideFavIds, id];
          return { db: { ...s.db, guideFavIds: next } };
        }),

      saveUserGuide: (g) =>
        set((s) => {
          if (s.db.guideContents.some((c) => c.id === g.id)) {
            return {
              db: {
                ...s.db,
                guideContents: s.db.guideContents.map((c) => (c.id === g.id ? g : c)),
              },
            };
          }
          return { db: { ...s.db, guideContents: [g, ...s.db.guideContents] } };
        }),

      importGuide: (input) => {
        const id = uid('guide');
        set((s) => ({
          db: {
            ...s.db,
            guideContents: [
              {
                ...input,
                id,
                source: 'xhs',
                createdAt: new Date().toISOString(),
              },
              ...s.db.guideContents,
            ],
          },
        }));
        return id;
      },

      setGuideActive: (id, on) =>
        set((s) => ({
          db: {
            ...s.db,
            activeGuideIds: on
              ? Array.from(new Set([...s.db.activeGuideIds, id]))
              : s.db.activeGuideIds.filter((g) => g !== id),
          },
        })),

      setGuideCompleted: (id, on) =>
        set((s) => ({
          db: {
            ...s.db,
            completedGuideIds: on
              ? Array.from(new Set([...s.db.completedGuideIds, id]))
              : s.db.completedGuideIds.filter((g) => g !== id),
          },
        })),

      toggleFavPlace: (placeId) =>
        set((s) => {
          const next = s.db.favPlaceIds.includes(placeId)
            ? s.db.favPlaceIds.filter((p) => p !== placeId)
            : [...s.db.favPlaceIds, placeId];
          return { db: { ...s.db, favPlaceIds: next } };
        }),

      schedulePlace: (dayId, placeId, atTime) => {
        const state = get();
        const day = state.db.days.find((d) => d.id === dayId);
        const trip = state.db.trips.find((t) => t.id === day?.tripId);
        // 精编池里找不到时，再查 POI 搜索加入的旅行地点池（id 形如 poi-xxx）。
        // 只查 travel 池：schedulePlace 是旅行侧能力，不读周末地点池。
        const place =
          findPlace(trip, placeId) ??
          state.db.travelDiscoveredPlaces.find((p) => p.id === placeId);
        if (!place) return undefined;
        return state.createActivity({
          dayId,
          placeId,
          title: place.name,
          type: place.category,
          startTime: atTime,
          estimatedCost: place.avgCost,
          note: place.requiredBooking ? '需要提前预约' : undefined,
        });
      },

      // ── Expense ───────────────────────────────────────────
      createExpense: (input) =>
        set((s) => ({
          db: {
            ...s.db,
            expenses: [
              ...s.db.expenses,
              {
                id: uid('exp'),
                tripId: input.tripId,
                title: input.title,
                category: input.category ?? 'other',
                amount: input.amount ?? 0,
                status: input.status ?? 'planned',
                dayId: input.dayId,
                activityId: input.activityId,
                date: input.date,
                note: input.note,
              } as Expense,
            ],
          },
        })),

      updateExpense: (id, patch) =>
        set((s) => ({
          db: { ...s.db, expenses: s.db.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)) },
        })),

      deleteExpense: (id) =>
        set((s) => ({ db: { ...s.db, expenses: s.db.expenses.filter((e) => e.id !== id) } })),

      setExpenseStatus: (id, status) => get().updateExpense(id, { status }),

      // ── Booking ───────────────────────────────────────────
      createBooking: (input) =>
        set((s) => ({
          db: {
            ...s.db,
            bookings: [
              ...s.db.bookings,
              {
                id: uid('bk'),
                tripId: input.tripId,
                type: input.type ?? 'other',
                title: input.title,
                provider: input.provider ?? '',
                bookingNumber: input.bookingNumber ?? '',
                startTime: input.startTime,
                endTime: input.endTime,
                dayId: input.dayId,
                placeId: input.placeId,
                cost: input.cost ?? 0,
                status: input.status ?? 'pending',
                note: input.note,
              } as Booking,
            ],
          },
        })),

      updateBooking: (id, patch) =>
        set((s) => ({
          db: { ...s.db, bookings: s.db.bookings.map((b) => (b.id === id ? { ...b, ...patch } : b)) },
        })),

      deleteBooking: (id) =>
        set((s) => ({ db: { ...s.db, bookings: s.db.bookings.filter((b) => b.id !== id) } })),

      seedDefaultBookings: (tripId) =>
        set((s) => {
          const trip = s.db.trips.find((t) => t.id === tripId);
          if (!trip) return {};
          // 幂等：已经有任何预订就不再铺占位
          if (s.db.bookings.some((b) => b.tripId === tripId)) return {};
          const days = s.db.days
            .filter((d) => d.tripId === tripId)
            .sort((a, b) => a.index - b.index);
          const firstDay = days[0];
          const origin = trip.profile.origin || '出发地';
          const dest = trip.destinationName;
          const flightStart = firstDay ? `${firstDay.date}T09:00` : undefined;
          const newBookings: Booking[] = [
            {
              id: uid('bk'),
              tripId,
              type: 'flight',
              title: `${origin} → ${dest}`,
              provider: '',
              bookingNumber: '',
              startTime: flightStart,
              endTime: firstDay ? `${firstDay.date}T13:00` : undefined,
              dayId: firstDay?.id,
              placeId: undefined,
              cost: 0,
              status: 'pending',
              note: '占位条目，填好价格与航班后点「确认」',
              auto: true,
            } as Booking,
            {
              id: uid('bk'),
              tripId,
              type: 'hotel',
              title: `${dest}住宿`,
              provider: '',
              bookingNumber: '',
              dayId: firstDay?.id,
              placeId: undefined,
              cost: 0,
              status: 'pending',
              note: `占位条目，共 ${days.length} 晚，确认后计入准备度`,
              auto: true,
            } as Booking,
          ];
          return { db: { ...s.db, bookings: [...s.db.bookings, ...newBookings] } };
        }),

      setBookingStatus: (id, status) => get().updateBooking(id, { status }),

      // ── Checklist ─────────────────────────────────────────
      ensureChecklists: (tripId) =>
        set((s) => {
          const trip = s.db.trips.find((t) => t.id === tripId);
          if (!trip) return {};
          const next = ensureTripChecklists(
            trip,
            s.db.checklists.filter((c) => c.tripId === tripId),
            s.db.bookings,
            s.db.files,
          );
          return {
            db: {
              ...s.db,
              checklists: [...s.db.checklists.filter((c) => c.tripId !== tripId), ...next],
            },
          };
        }),

      toggleChecklistItem: (tripId, itemId) =>
        set((s) => ({
          db: {
            ...s.db,
            checklists: s.db.checklists.map((c) =>
              c.tripId !== tripId
                ? c
                : {
                    ...c,
                    items: c.items.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)),
                  },
            ),
          },
        })),

      addChecklistItem: (tripId, phase, title) =>
        set((s) => {
          const exists = s.db.checklists.some((c) => c.tripId === tripId && c.phase === phase);
          const base = exists ? s.db.checklists : [...s.db.checklists];
          return {
            db: {
              ...s.db,
              checklists: base.map((c) =>
                c.tripId === tripId && c.phase === phase
                  ? { ...c, items: [...c.items, { id: uid('cli'), title, done: false, auto: false }] }
                  : c,
              ),
            },
          };
        }),

      deleteChecklistItem: (tripId, itemId) =>
        set((s) => ({
          db: {
            ...s.db,
            checklists: s.db.checklists.map((c) =>
              c.tripId === tripId ? { ...c, items: c.items.filter((i) => i.id !== itemId) } : c,
            ),
          },
        })),

      // ── File ──────────────────────────────────────────────
      addFile: (input) =>
        set((s) => ({
          db: {
            ...s.db,
            files: [
              ...s.db.files,
              {
                id: uid('file'),
                tripId: input.tripId,
                name: input.name,
                type: input.type ?? 'other',
                sizeKb: input.sizeKb ?? 120,
                uploadedAt: todayISO(),
                linkedType: input.linkedType,
                linkedId: input.linkedId,
              } as FileAsset,
            ],
          },
        })),

      deleteFile: (id) =>
        set((s) => ({ db: { ...s.db, files: s.db.files.filter((f) => f.id !== id) } })),

      // ── Journal ───────────────────────────────────────────
      upsertJournal: (input) =>
        set((s) => {
          const existing = s.db.journals.find((j) => j.tripId === input.tripId && j.date === input.date);
          if (existing) {
            return {
              db: {
                ...s.db,
                journals: s.db.journals.map((j) =>
                  j.id === existing.id ? { ...j, ...input, id: existing.id } : j,
                ),
              },
            };
          }
          return {
            db: {
              ...s.db,
              journals: [
                ...s.db.journals,
                {
                  id: uid('jr'),
                  tripId: input.tripId,
                  dayId: input.dayId,
                  date: input.date,
                  title: input.title ?? '',
                  mood: input.mood ?? '🙂',
                  note: input.note ?? '',
                  photos: input.photos ?? [],
                  placeNames: input.placeNames ?? [],
                } as Journal,
              ],
            },
          };
        }),

      // ── AI Proposals ──────────────────────────────────────
      addProposal: (p) => set((s) => ({ db: { ...s.db, proposals: [p, ...s.db.proposals].slice(0, 30) } })),

      applyProposal: (id) => {
        const state = get();
        const proposal = state.db.proposals.find((p) => p.id === id);
        if (!proposal || proposal.status !== 'pending') return 0;
        const nextDb = applyActions(state.db, proposal.actions);
        set({
          db: {
            ...nextDb,
            proposals: nextDb.proposals.map((p) =>
              p.id === id ? { ...p, status: 'applied' as const } : p,
            ),
          },
        });
        return proposal.actions.length;
      },

      rejectProposal: (id) =>
        set((s) => ({
          db: {
            ...s.db,
            proposals: s.db.proposals.map((p) => (p.id === id ? { ...p, status: 'rejected' as const } : p)),
          },
        })),

      // ── Phase 1：统一计划层的读写 ──────────────────────────
      setPlaceState: (input) =>
        set((s) => ({
          db: { ...s.db, placeStates: upsertPlaceState(s.db.placeStates ?? [], input) },
        })),

      createWeekendPlan: (input) => {
        // 同一个周末不重复创建（幂等），直接返回已有计划的 id
        const existing = get().db.weekendPlans?.find((w) => w.weekendOf === input.weekendOf);
        if (existing) return existing.id;
        const at = new Date().toISOString();
        const plan: WeekendPlan = {
          id: uid('wknd'),
          title: input.title ?? '这周末',
          weekendOf: input.weekendOf,
          endDate: input.endDate ?? addDays(input.weekendOf, 1),
          status: 'exploring',
          homeCity: input.homeCity ?? get().settings.homeCity,
          placeIds: [],
          activityIds: [],
          createdAt: at,
          updatedAt: at,
        };
        set((s) => ({ db: { ...s.db, weekendPlans: [...(s.db.weekendPlans ?? []), plan] } }));
        return plan.id;
      },

      updateWeekendPlan: (id, patch) =>
        set((s) => ({
          db: {
            ...s.db,
            weekendPlans: (s.db.weekendPlans ?? []).map((w) =>
              w.id === id ? { ...w, ...patch, updatedAt: new Date().toISOString() } : w,
            ),
          },
        })),

      // ── Quiz / Settings ───────────────────────────────────
      setQuiz: (patch) =>
        set((s) => ({ quiz: { ...s.quiz, ...patch, updatedAt: new Date().toISOString() } })),

      resetQuiz: () => set({ quiz: { ...emptyQuiz } }),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      resetAll: () =>
        set({ db: buildInitialDB(), activeTripId: null, quiz: { ...emptyQuiz } }),
    }),
    {
      /**
       * 注意：name 是 localStorage 的 key，必须保持 'trip-os:v1' 不变。
       * 改名会让老用户的数据读不到（等价数据丢失）。
       * 版本升级走下面的 `version: 2` + `migrate`。
       */
      name: 'trip-os:v1',
      version: STATE_VERSION,
      partialize: (s) => ({ db: s.db, activeTripId: s.activeTripId, quiz: s.quiz, settings: s.settings }),

      migrate: migrateState,

      // 字段级合并，详见上方 mergeState 的定义与注释
      merge: mergeState,
    },
  ),
);

export const useDB = () => useStore((s) => s.db);
export const placeOfFactoryFor = placeOfFactory;
export const allDestinations = DESTINATIONS;
export const placesOf = getPlaces;
