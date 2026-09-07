// ─────────────────────────────────────────────────────────────
// Trip OS — 核心数据模型
// 关系：User → Trip → Day → Activity → Place
//       Activity ↔ Booking / Expense / File ；Place ↔ Journal
// ─────────────────────────────────────────────────────────────

export type ID = string;

export type TripStatus = 'planning' | 'traveling' | 'completed';
/** 我自己来 / 帮我规划 / 我不知道，你决定 */
export type PlanningPreference = 'planner' | 'delegator' | 'auto';

export type ActivityType =
  | 'sight'
  | 'food'
  | 'shopping'
  | 'transport'
  | 'stay'
  | 'nature'
  | 'culture'
  | 'entertainment'
  | 'free'
  | 'other';

export type ActivityStatus = 'planned' | 'ongoing' | 'done' | 'skipped';
export type TransportMode = 'walk' | 'transit' | 'taxi' | 'car' | 'flight' | 'train';
export type ExpenseCategory = 'stay' | 'transport' | 'food' | 'ticket' | 'shopping' | 'other';
export type ExpenseStatus = 'planned' | 'paid';
export type BookingType = 'flight' | 'hotel' | 'ticket' | 'train' | 'car' | 'other';
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled';
export type ChecklistPhase = 'before' | 'during' | 'after';
export type FileType = 'flight' | 'hotel' | 'ticket' | 'id' | 'order' | 'other';
export type Intensity = 'low' | 'medium' | 'high';

// ── 测评 / 偏好 ───────────────────────────────────────────────
export type TravelMood =
  | 'tired'
  | 'change'
  | 'energetic'
  | 'reward'
  | 'escape'
  | 'alone'
  | 'social';

export type DurationBucket = 'd23' | 'd45' | 'd67' | 'd810' | 'd10p';
export type BudgetRange = 'b1' | 'b2' | 'b3' | 'b4' | 'b5';
export type Pace = 'intense' | 'balanced' | 'focused' | 'free';
export type Companions = 'solo' | 'partner' | 'friends' | 'family' | 'colleagues' | 'group';
export type DestinationScope = 'domestic' | 'international' | 'any';

export interface QuizAnswers {
  travelMood: TravelMood;
  duration: DurationBucket;
  origin: string;
  budget: BudgetRange;
  interests: string[];
  dislikes: string[];
  pace: Pace;
  companions: Companions;
  destinationScope: DestinationScope;
}

export interface TravelPreference extends QuizAnswers {
  planningPreference: PlanningPreference;
  updatedAt: string;
}

// ── 目的地（推荐引擎结构化数据）───────────────────────────────
export interface Destination {
  id: ID;
  name: string;
  country: string;
  scope: 'domestic' | 'international';
  lat: number;
  lng: number;
  summary: string;
  emoji: string;
  /** 1 低消费 · 2 中 · 3 高 */
  budgetLevel: 1 | 2 | 3;
  /** 人均每日（不含往返大交通） */
  dailyCost: { low: number; high: number };
  idealDays: { min: number; max: number };
  intensity: Intensity;
  /** 与 interests 对齐 */
  tags: string[];
  /** 与 dislikes 对齐（负面标签） */
  antiTags: string[];
  bestSeasons: number[];
  /** 出发地 → 交通成本与时长；缺省时由 TransportService 依据经纬度推算 */
  originTransport?: Record<string, { hours: number; cost: number; mode: TransportMode }>;
  highlights: string[];
  cautions: string[];
  /** 推荐玩法骨架，用于 Destination Detail 的「适合你的旅行方式」 */
  playbook: string[];
  /** 旅行手册（旅游手册式内容）。可选：缺字段页面优雅降级 */
  handbook?: DestinationHandbook;
}

/** 趣味百科条目（旅游手册式冷知识） */
export interface HandbookBaike {
  title: string;
  body: string;
}

/** 经典路线的一个站点：优先引用 CURATED 地点 id（自动取坐标），否则内联坐标 */
export type HandbookRouteStop =
  | { placeId: string }
  | { name: string; lng: number; lat: number; emoji?: string };

/** 经典路线：别人常走的玩法，配真实小地图 */
export interface HandbookRoute {
  id: string;
  name: string;
  /** 建议用时，如 "8–10 天" */
  days: string;
  intensity?: Intensity;
  summary: string;
  /** 有序站点（决定小地图上的路线连线） */
  stops: HandbookRouteStop[];
  /** 走这条路的贴士 / 坑 */
  tips?: string;
}

/** 目的地旅行手册 */
export interface DestinationHandbook {
  /** 为什么推荐这里：3–5 条理由 */
  whyGo?: string[];
  /** 趣味百科：冷知识卡 */
  baike?: HandbookBaike[];
  /** 经典路线：常见玩法，含地图 */
  classicRoutes?: HandbookRoute[];
  /** 别人怎么玩：真实旅行者的节奏与坑 */
  howOthersPlay?: string[];
}

// ─────────────────────────────────────────────────────────────
// Phase V2 — 攻略 / 玩法（Guide → Playbook → Plan）
//
// 攻略是结构化数据，不是长文本；玩法是可直接执行的计划模板，
// 一键「加入我的旅行」即映射成 Trip 的 Day + Activity（复用既有 Trip/Activity）。
// 所有 stop 必须引用真实 POI（来自 CURATED / 真实地点池），禁止编造。
// ─────────────────────────────────────────────────────────────

/** 玩法适配人群（复用 Companions，并补充旅行语境人群） */
export type Audience =
  | Companions
  | 'family'
  | 'first-timer'
  | 'any';

/** 玩法类型 */
export type PlaybookType =
  | 'classic' // 经典玩法
  | 'half-day' // 半日
  | 'one-day' // 一日
  | 'couple' // 情侣
  | 'friends' // 朋友
  | 'solo' // 独处
  | 'low-energy' // 低能量
  | 'high-energy' // 高能量
  | 'food'; // 吃什么

/** 玩法里的一个真实站点（直接映射成一次 Activity） */
export interface PlaybookStop {
  /** 真实 POI id（必须来自 CURATED / 真实地点池，禁止编造不存在的地点） */
  placeId: ID;
  /** 该站开始时间 HH:mm */
  time: string;
  /** 建议停留（分钟） */
  duration: number;
  /** 当天顺序（从 1 开始） */
  order: number;
  /** 从上一站到这一站的交通；缺省当作步行 / 就地衔接 */
  transportFromPrevious?: { mode: TransportMode; min: number };
  /** 预留：真实路线 id（AMap Route 接入后填，当前可选） */
  routeId?: string;
}

/** 玩法里的一天（直接映射成一个 Trip Day） */
export interface PlaybookDay {
  index: number;
  title: string;
  stops: PlaybookStop[];
}

/** 可执行玩法模板 */
export interface Playbook {
  id: ID;
  title: string;
  type: PlaybookType;
  /** 玩法总天数（半日 / 一日 = 1） */
  durationDays: number;
  audience: Audience[];
  intensity: Intensity;
  summary: string;
  /** 按天组织的真实 POI 序列（直接映射成 Trip 的 Day + Activity） */
  days: PlaybookDay[];
  tips?: string[];
}

/** 区域玩法（城市子区域怎么逛） */
export interface GuideArea {
  id: ID;
  name: string;
  summary: string;
  /** 该区域推荐的真实 POI id（可选） */
  placeIds?: ID[];
}

/** 目的地结构化攻略 */
export interface TravelGuide {
  destinationId: ID;
  overview: string;
  bestTime: string;
  recommendedDays: string;
  audience: Audience[];
  intensity: Intensity;
  highlights: string[];
  /** 可执行玩法模板列表 */
  playbooks: Playbook[];
  areas?: GuideArea[];
  tips: string[];
}

// ── 攻略市场（Guide Market）───────────────────────────────────
//
// Guide ≠ 当前目的地的攻略详情页，而是「旅行攻略内容市场 / 发现中心」。
// 用户无需拥有对应 Trip 即可浏览、收藏、导入、组合攻略内容。
// 攻略收藏（GuideContent）与地点收藏（Place）完全分离。
// ─────────────────────────────────────────────────────────────

/** 攻略类型（市场卡片的分类属性） */
export type GuideKind =
  | 'city' // 城市攻略
  | 'route' // 路线攻略
  | 'theme' // 主题攻略
  | 'audience' // 人群攻略
  | 'play' // 玩法攻略
  | 'imported' // 用户导入（小红书等）
  | 'user'; // 用户自建

/** 攻略来源 */
export type GuideSource = 'official' | 'xhs' | 'user';

/**
 * 攻略市场里的一条内容（最小可发现 / 可收藏 / 可行动单元）。
 * 可来自系统精选、目的地 Guide、Playbook、用户导入的小红书、用户自建。
 */
export interface GuideContent {
  id: ID;
  kind: GuideKind;
  source: GuideSource;
  title: string;
  /** 封面图片（可选，缺省用渐变占位） */
  cover?: string;
  /** 关联目的地（可跨多个，用于市场分组与搜索） */
  destinationIds: ID[];
  audience: Audience[];
  /** 建议天数（路线 / 城市攻略有） */
  durationDays?: number;
  /** 最佳时间 / 应季（主题攻略有） */
  bestTime?: string;
  /** 主题标签（美食 / 看雪 / City Walk / 小众 …） */
  themes: string[];
  /** 摘要 */
  summary: string;
  /** 攻略涉及的真实地点 id（来自 playbook stops 或导入识别；禁止编造） */
  placeIds: ID[];
  /** 可执行路线（来自 playbook 或导入识别）；无则只是灵感卡 */
  days?: PlaybookDay[];
  tips?: string[];
  /** 若由某个 Playbook 派生，记录来源以便「使用这条攻略」直接映射成 Trip */
  playbookRef?: { destinationId: ID; playbookId: ID };
  createdAt?: string;
}

// ── 地点 ─────────────────────────────────────────────────────
export interface Place {
  id: ID;
  destinationId: ID;
  name: string;
  category: ActivityType;
  /** Mock 地图归一化坐标（0–100 画布） */
  x: number;
  y: number;
  /** 真实经纬度（接入高德后填），可选：mock 地点没填 */
  lat?: number;
  lng?: number;
  address?: string;
  rating?: number;
  avgCost: number;
  durationMin: number;
  /** 主要景区：需要单独一整天，AI 排程时独占一天（如迪士尼 / 都江堰） */
  fullDay?: boolean;
  open?: string;
  close?: string;
  tags: string[];
  indoor: boolean;
  requiredBooking?: boolean;
  emoji: string;
  description?: string;
}

// ── Trip ─────────────────────────────────────────────────────
export interface Trip {
  id: ID;
  title: string;
  destinationId: ID;
  /** 多城市：有序城市列表（即你想要的走法顺序）。单城市时退化为 [destinationId] */
  destinationIds?: string[];
  destinationName: string;
  emoji: string;
  startDate: string;
  endDate: string;
  status: TripStatus;
  planningPreference: PlanningPreference;
  totalBudget: number;
  members: TripMember[];
  createdAt: string;
  updatedAt: string;
  /** 本次旅行画像（来自测评或直接设定） */
  profile: TripProfile;
}

export interface TripProfile {
  travelMood: TravelMood;
  pace: Pace;
  companions: Companions;
  interests: string[];
  dislikes: string[];
  origin: string;
  durationDays: number;
}

export interface TripMember {
  id: ID;
  name: string;
  avatar: string;
  role: 'owner' | 'member';
}

export interface Day {
  id: ID;
  tripId: ID;
  date: string;
  index: number;
  title: string;
  /** 该天归属的城市（多城市行程）。缺省回退到 Trip.destinationId */
  destinationId?: string;
  note?: string;
  /** 人工覆盖强度；未设置则由 Travel Intelligence 计算 */
  intensityOverride?: Intensity;
}

export interface Activity {
  id: ID;
  tripId: ID;
  dayId: ID;
  placeId?: ID;
  title: string;
  startTime: string;
  endTime: string;
  type: ActivityType;
  note?: string;
  estimatedCost: number;
  transportMode: TransportMode;
  transportMin: number;
  /** 航班号 / 高铁号 / 车次 */
  transportNo?: string;
  /** 交通起点名称（如深圳宝安机场） */
  fromName?: string;
  /** 交通终点名称（如大理凤仪机场） */
  toName?: string;
  status: ActivityStatus;
  pinned?: boolean;
  order: number;
}

export interface Booking {
  id: ID;
  tripId: ID;
  type: BookingType;
  title: string;
  provider: string;
  bookingNumber: string;
  startTime?: string;
  endTime?: string;
  dayId?: ID;
  placeId?: ID;
  cost: number;
  status: BookingStatus;
  note?: string;
  /** 由「智能默认」自动铺的占位条目 */
  auto?: boolean;
}

export interface Expense {
  id: ID;
  tripId: ID;
  dayId?: ID;
  activityId?: ID;
  title: string;
  category: ExpenseCategory;
  amount: number;
  status: ExpenseStatus;
  date?: string;
  payerId?: ID;
  note?: string;
}

export interface Checklist {
  id: ID;
  tripId: ID;
  phase: ChecklistPhase;
  title: string;
  items: ChecklistItem[];
}

export interface ChecklistItem {
  id: ID;
  title: string;
  done: boolean;
  /** true = 系统根据 Trip 自动生成 */
  auto: boolean;
}

export interface FileAsset {
  id: ID;
  tripId: ID;
  name: string;
  type: FileType;
  sizeKb: number;
  uploadedAt: string;
  linkedType?: 'trip' | 'day' | 'activity' | 'place' | 'booking';
  linkedId?: string;
}

export interface Journal {
  id: ID;
  tripId: ID;
  dayId?: ID;
  date: string;
  title: string;
  mood: string;
  note: string;
  photos: string[];
  placeNames: string[];
}

// ── AI Action Layer ──────────────────────────────────────────
export type ActionName =
  | 'createTrip'
  | 'updateTrip'
  | 'createDay'
  | 'createActivity'
  | 'updateActivity'
  | 'deleteActivity'
  | 'addPlace'
  | 'removePlace'
  | 'schedulePlace'
  | 'createExpense'
  | 'updateExpense'
  | 'createChecklist'
  | 'optimizeRoute'
  | 'rescheduleTrip'
  | 'generateTripPlan'
  | 'generateDestinationRecommendation';

export interface AIAction {
  id: ID;
  name: ActionName;
  params: Record<string, unknown>;
  /** high = 删除 / 改预算 / 改日期，必须用户确认 */
  risk: 'low' | 'medium' | 'high';
  summary: string;
}

export interface DiffItem {
  kind: 'add' | 'remove' | 'update';
  label: string;
  before?: string;
  after?: string;
}

export type ProposalStatus = 'pending' | 'applied' | 'rejected';

export interface AIProposal {
  id: ID;
  tripId?: ID;
  intent: string;
  title: string;
  changes: string[];
  impact: string[];
  actions: AIAction[];
  diff: DiffItem[];
  createdAt: string;
  status: ProposalStatus;
}

// ── Travel Intelligence ──────────────────────────────────────
export type ConflictType =
  | 'timeOverlap'
  | 'farDistance'
  | 'openHours'
  | 'bookingClash'
  | 'budgetOverrun'
  | 'denseDay'
  | 'consecutiveHigh'
  | 'longTransit'
  | 'weatherRisk';

export interface Conflict {
  id: ID;
  tripId: ID;
  dayId?: ID;
  type: ConflictType;
  level: 'info' | 'warn' | 'error';
  message: string;
  suggestion?: string;
  /** 可一键由 AI 处理的意图 */
  suggestedIntent?: string;
}

export interface DayIntensity {
  dayId: ID;
  score: number;
  level: Intensity;
  activityCount: number;
  activeMinutes: number;
  transitMinutes: number;
}

export interface BudgetSummary {
  total: number;
  planned: number;
  paid: number;
  forecast: number;
  remaining: number;
  overrun: number;
  byCategory: Record<ExpenseCategory, { planned: number; paid: number }>;
}

// ─────────────────────────────────────────────────────────────
// Phase 0 — 统一计划层（Plan / PlaceState / Context）
//
// 设计约束（务必遵守）：
//   · 本段【只新增】，不修改上面任何既有类型的字段或语义。
//   · Trip 仍然是旅行场景的写时实体，不做迁移。
//   · PlaceState 只存「引用关系」，不复制 Place 数据（后端 /api/state 是整份
//     store 单 blob，上限 4MB）。
// ─────────────────────────────────────────────────────────────

/**
 * 统一的计划类型。
 * 当前实现：TRIP / WEEKEND。
 * 预留未实现：DAY_OUT（一日/半日出行）、ACTIVITY（单个生活活动）。
 * 未实现的成员不写进联合类型，避免各处 switch 出现无法到达的分支。
 */
export type PlanType = 'TRIP' | 'WEEKEND';

/**
 * 决策场景。只用于告诉 Decision Engine「用户在什么场景下做决定」，
 * 不对应三套系统——三者共用同一套 Place / Activity / Decision / Plan。
 * NOW 当前无产生者（Phase 2+ 的 Now 场景接入后启用）。
 */
export type ContextType = 'TRAVEL' | 'WEEKEND' | 'NOW';

/**
 * 地点池（discoveredPlaces）的业务归属。
 *
 * NOW 不单独设地点池：它复用 WEEKEND 的本地 POI 池（Now 与 Weekend 同属
 * 「当前城市 / 附近」语境），避免为了未来场景先建一套空集合。
 */
export type PlaceContext = Extract<ContextType, 'TRAVEL' | 'WEEKEND'>;

/**
 * 地点在某个计划容器内的状态。
 *
 * 四态而非五态：最初草案里的第五态 SKIPPED 已在 Phase 0 移除。
 * 理由是「今天不想去了」在业务上等价于退回 CANDIDATE（仍在考虑），
 * 用户明确要求「不允许为了凑五态增加无业务意义的状态」。
 *
 * 状态允许任意方向流转（不是单向推进）：
 *   WANTED → CANDIDATE → PLANNED → VISITED   （正向）
 *   PLANNED → CANDIDATE / WANTED             （反悔）
 *   VISITED → WANTED                         （去过还想去）
 */
export type PlaceStatus = 'WANTED' | 'CANDIDATE' | 'PLANNED' | 'VISITED';

/** Place 的容器归属类型。与 PlanType 对齐，但目前只有这两个会产生 PlaceState */
export type PlaceContainerType = Extract<PlanType, 'TRIP' | 'WEEKEND'>;

/**
 * 地点在一个计划容器内的状态记录。
 * 不修改 Place 本身——Place 是全局静态地点池，没有容器维度。
 */
export interface PlaceState {
  id: ID;
  containerType: PlaceContainerType;
  containerId: ID;
  placeId: ID;
  status: PlaceStatus;
  updatedAt: string;
}

/**
 * 周末出行 —— 轻量计划容器。
 *
 * 刻意不是 Trip 的缩小版：不复制预算 / 预订 / 清单 / 文件 / 成员 / 逐小时行程。
 * 「帮我安排一下」时才按需生成 Activity（通过 activityIds 关联）。
 */
export interface WeekendPlan {
  id: ID;
  title: string;
  /** 该周末的周六（ISO date）。weekendOf 即计划基准日 */
  weekendOf: string;
  /** 结束日，默认 weekendOf + 1 天（周日） */
  endDate: string;
  /** exploring 还没定 / planned 已定 / done 已经过了 */
  status: 'exploring' | 'planned' | 'done';
  /** 所在城市（复用 settings.homeCity；异地周末则填目的地城市名） */
  homeCity: string;
  /** 只存 placeId 引用，不复制地点数据 */
  placeIds: ID[];
  /** 暂停的 placeId：保留在计划中但不进入执行时间线，随时可恢复 */
  pausedIds?: ID[];
  /** 深度规划后才会有值（用户说「帮我安排一下」时生成） */
  activityIds: ID[];
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * PlanView —— 统一计划视图（读时归一化 / Adapter）。
 *
 * Trip 与 WeekendPlan 通过 `services/plan.ts` 的 adapter 转成同一种结构，
 * 让上层可以统一理解「用户有哪些计划」，而不需要到处 instanceof Trip。
 * 这是【只读视图】，不回写，不做 Trip → Plan 的数据迁移。
 */
export interface PlanView {
  id: ID;
  type: PlanType;
  title: string;
  context: ContextType;
  /** 来自源头实体的状态字符串（Trip: planning/traveling/completed；Weekend: exploring/planned/done） */
  status: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  /** 轻量附加信息，adapter 自行填充 */
  metadata: Record<string, unknown>;
}

/**
 * 一次目的地推荐的落库结果。
 * 只存引用与结论（destinationId + score + reason），
 * 不存完整 Destination —— 那里面带 handbook，体积很大。
 */
export interface DestinationPick {
  id: ID;
  destinationId: ID;
  score: number;
  reason: string;
  createdAt: string;
  /** 产生这次推荐的容器（tripId 或 weekendPlanId），可为空 */
  containerType?: PlaceContainerType;
  containerId?: ID;
}
