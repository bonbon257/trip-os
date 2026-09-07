import type {
  AIAction,
  Activity,
  ActivityType,
  Day,
  DestinationPick,
  Expense,
  PlaceContainerType,
  PlanningPreference,
  QuizAnswers,
  TripProfile,
  TransportMode,
} from '@/types';
import type { DB } from '@/services/store';
import { findPlace } from '@/data/places';
import { getDestination } from '@/data/destinations';
import { estimateTransit } from '@/services/route';
import { ensureTripChecklists } from '@/services/checklist';
import { recommend } from '@/services/recommendation';
import { buildTrip, type NewTripInput } from '@/services/tripFactory';
import { addDays, addMinutes, diffDays } from '@/utils/date';
import { uid } from '@/utils/id';

/**
 * AI Action Layer
 * ────────────────────────────────────────────────────────────
 * AI 永远不直接改数据库：Intent → Orchestrator → Action → Validation
 * → Preview（用户确认）→ 本文件的 Mutation。
 */

export interface ActivitySpec {
  title: string;
  placeId?: string;
  startTime: string;
  durationMin?: number;
  type?: ActivityType;
  estimatedCost?: number;
  note?: string;
  pinned?: boolean;
  /** 航班号 / 高铁号 / 车次 */
  transportNo?: string;
  /** 交通起点名称（如深圳宝安机场） */
  fromName?: string;
  /** 交通终点名称（如大理凤仪机场） */
  toName?: string;
}

const tripOf = (db: DB, dayId: string) =>
  db.trips.find((t) => t.id === db.days.find((d) => d.id === dayId)?.tripId);

/** 由 spec 构造 Activity，自动补 endTime 与到上一站的交通（与手工添加走同一套规则） */
export function buildActivity(db: DB, dayId: string, spec: ActivitySpec, order: number): Activity {
  const trip = tripOf(db, dayId);
  const place = spec.placeId && trip ? findPlace(trip, spec.placeId) : undefined;
  const siblings = db.activities.filter((a) => a.dayId === dayId).sort((a, b) => a.order - b.order);
  const last = siblings[siblings.length - 1];
  const lastPlace = last?.placeId && trip ? findPlace(trip, last.placeId) : undefined;
  const transit = lastPlace && place ? estimateTransit(lastPlace, place) : null;
  const duration = spec.durationMin ?? place?.durationMin ?? 90;
  return {
    id: uid('act'),
    tripId: db.days.find((d) => d.id === dayId)?.tripId ?? '',
    dayId,
    placeId: spec.placeId,
    title: spec.title || place?.name || '新安排',
    startTime: spec.startTime,
    endTime: addMinutes(spec.startTime, duration),
    type: (spec.type ?? place?.category ?? 'sight') as ActivityType,
    note: spec.note ?? (place?.requiredBooking ? '需要提前预约' : undefined),
    estimatedCost: spec.estimatedCost ?? place?.avgCost ?? 0,
    transportMode: (transit?.mode ?? 'walk') as TransportMode,
    transportMin: transit?.minutes ?? 0,
    transportNo: spec.transportNo,
    fromName: spec.fromName,
    toName: spec.toName,
    status: 'planned',
    pinned: spec.pinned,
    order,
  };
}

/** 重算一天内部的时间与交通，保证连续可执行 */
export function reflowDay(db: DB, dayId: string, anchorStart?: string): Activity[] {
  const trip = tripOf(db, dayId);
  const list = db.activities
    .filter((a) => a.dayId === dayId && a.status !== 'skipped')
    .sort((a, b) => a.order - b.order);
  let cursor = anchorStart ?? list[0]?.startTime ?? '09:30';
  return list.map((a, i) => {
    const prevPlace = i === 0 || !trip ? undefined : list[i - 1].placeId ? findPlace(trip, list[i - 1].placeId!) : undefined;
    const place = a.placeId && trip ? findPlace(trip, a.placeId) : undefined;
    const t = prevPlace && place ? estimateTransit(prevPlace, place) : null;
    const start = i === 0 ? cursor : addMinutes(cursor, t?.minutes ?? a.transportMin ?? 0);
    const duration = Math.max(
      30,
      (a.endTime && a.startTime ? toMin(a.endTime) - toMin(a.startTime) : 0) || place?.durationMin || 90,
    );
    const endTime = addMinutes(start, duration);
    cursor = endTime;
    return {
      ...a,
      startTime: start,
      endTime,
      transportMode: t ? t.mode : a.transportMode,
      transportMin: i === 0 ? 0 : (t?.minutes ?? a.transportMin ?? 0),
    };
  });
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// ── Phase 0：补齐此前未实现的 createTrip / generateDestinationRecommendation ──
// 这两个是「自然语言创建旅行」和「我不知道去哪」的落库出口，
// 之前在 applyOne 里走 default 静默返回 db（等于空壳）。

/** 建 Trip 的默认画像（AI 只给部分字段时兜底） */
const DEFAULT_PROFILE: TripProfile = {
  travelMood: 'change',
  pace: 'balanced',
  companions: 'solo',
  interests: [],
  dislikes: [],
  origin: '上海',
  durationDays: 5,
};

/** 推荐用的默认测评答案（AI 只给部分字段时兜底，避免 recommend() 收到 undefined） */
const DEFAULT_ANSWERS: QuizAnswers = {
  travelMood: 'change',
  duration: 'd45',
  origin: '上海',
  budget: 'b3',
  interests: [],
  dislikes: [],
  pace: 'balanced',
  companions: 'solo',
  destinationScope: 'any',
};

/**
 * 由 Action params 解析出建 Trip 的输入。
 * 支持 days 或 endDate 二选一（都缺省按 5 天）；
 * 预算缺省时按目的地 dailyCost 中值 × 天数推算，不是写死数字。
 */
function resolveTripInput(p: Record<string, any>): NewTripInput | null {
  const destinationIds = (p.destinationIds as string[])?.filter(Boolean);
  const startDate = p.startDate as string;
  if (!Array.isArray(destinationIds) || !destinationIds.length || !startDate) return null;

  const dayCount =
    typeof p.days === 'number' && p.days > 0
      ? Math.round(p.days)
      : p.endDate
        ? Math.max(1, diffDays(startDate, p.endDate as string) + 1)
        : 5;
  const endDate = (p.endDate as string) ?? addDays(startDate, dayCount - 1);

  const perDay =
    destinationIds.reduce((s, id) => {
      const d = getDestination(id);
      return s + (d ? (d.dailyCost.low + d.dailyCost.high) / 2 : 300);
    }, 0) / Math.max(1, destinationIds.length);

  return {
    destinationIds,
    startDate,
    endDate,
    totalBudget:
      typeof p.totalBudget === 'number' && p.totalBudget >= 0
        ? p.totalBudget
        : Math.round(perDay * dayCount),
    planningPreference: (p.planningPreference as PlanningPreference) ?? 'auto',
    profile: { ...DEFAULT_PROFILE, durationDays: dayCount, ...(p.profile as Partial<TripProfile>) },
    title: p.title as string | undefined,
  };
}

/** 校验：任何不合法的动作都不允许进入数据库 */
export function validateAction(db: DB, action: AIAction): string | null {
  const p = action.params as Record<string, unknown>;
  switch (action.name) {
    case 'updateTrip':
      return db.trips.some((t) => t.id === p.tripId) ? null : '旅行不存在';
    case 'createActivity':
    case 'optimizeRoute':
    case 'rescheduleTrip':
      return db.days.some((d) => d.id === p.dayId) ? null : '日期不存在';
    case 'updateActivity':
    case 'deleteActivity':
      return db.activities.some((a) => a.id === p.activityId) ? null : '安排不存在';
    case 'updateExpense':
      return db.expenses.some((e) => e.id === p.expenseId) ? null : '花费记录不存在';
    case 'schedulePlace':
      return db.days.some((d) => d.id === p.dayId) && typeof p.placeId === 'string'
        ? null
        : '排期参数不完整';
    case 'generateTripPlan':
      return db.trips.some((t) => t.id === p.tripId) ? null : '旅行不存在';
    case 'createChecklist':
      return db.trips.some((t) => t.id === p.tripId) ? null : '旅行不存在';
    case 'createTrip': {
      const ids = p.destinationIds;
      if (!Array.isArray(ids) || ids.length === 0) return '缺少目的地';
      if (typeof p.startDate !== 'string' || !p.startDate) return '缺少出发日期';
      return null;
    }
    case 'generateDestinationRecommendation':
      return p.answers && typeof p.answers === 'object' ? null : '缺少偏好信息';
    default:
      return null;
  }
}

function applyOne(db: DB, action: AIAction): DB {
  if (validateAction(db, action)) return db;
  const p = action.params as Record<string, any>;

  switch (action.name) {
    case 'updateTrip':
      return {
        ...db,
        trips: db.trips.map((t) => (t.id === p.tripId ? { ...t, ...p.patch, updatedAt: new Date().toISOString() } : t)),
      };

    case 'createDay': {
      const trip = db.trips.find((t) => t.id === p.tripId);
      if (!trip) return db;
      const day: Day = {
        id: uid('day'),
        tripId: p.tripId,
        date: p.date,
        index: db.days.filter((d) => d.tripId === p.tripId).length + 1,
        title: p.title ?? '新的一天',
      };
      return { ...db, days: [...db.days, day] };
    }

    case 'createActivity': {
      const list = db.activities.filter((a) => a.dayId === p.dayId).sort((a, b) => a.order - b.order);
      const activity = buildActivity(db, p.dayId, p.spec as ActivitySpec, list.length);
      return { ...db, activities: [...db.activities, activity] };
    }

    case 'updateActivity':
      return {
        ...db,
        activities: db.activities.map((a) => (a.id === p.activityId ? { ...a, ...p.patch } : a)),
      };

    case 'deleteActivity': {
      const target = db.activities.find((a) => a.id === p.activityId);
      if (!target) return db;
      const rest = db.activities
        .filter((a) => a.id !== p.activityId)
        .map((a) => (a.dayId === target.dayId && a.order > target.order ? { ...a, order: a.order - 1 } : a));
      const next = { ...db, activities: rest };
      return { ...next, activities: [...next.activities.filter((a) => a.dayId !== target.dayId), ...reflowDay(next, target.dayId)] };
    }

    case 'addPlace':
      return {
        ...db,
        savedPlaces: {
          ...db.savedPlaces,
          [p.tripId]: [...(db.savedPlaces[p.tripId] ?? []), p.placeId],
        },
      };

    case 'removePlace':
      return {
        ...db,
        savedPlaces: {
          ...db.savedPlaces,
          [p.tripId]: (db.savedPlaces[p.tripId] ?? []).filter((id: string) => id !== p.placeId),
        },
      };

    case 'schedulePlace': {
      const day = db.days.find((d) => d.id === p.dayId);
      if (!day) return db;
      const trip = db.trips.find((t) => t.id === day.tripId);
      const place = trip ? findPlace(trip, p.placeId) : undefined;
      if (!place) return db;
      const list = db.activities.filter((a) => a.dayId === p.dayId).sort((a, b) => a.order - b.order);
      const last = list[list.length - 1];
      const start = p.atTime ?? (last ? addMinutes(last.endTime, 20) : '10:00');
      const activity = buildActivity(db, p.dayId, { title: place.name, placeId: place.id, startTime: start }, list.length);
      return { ...db, activities: [...db.activities, activity] };
    }

    case 'createExpense':
      return {
        ...db,
        expenses: [
          ...db.expenses,
          {
            id: uid('exp'),
            tripId: p.tripId,
            title: p.title,
            category: p.category ?? 'other',
            amount: Number(p.amount ?? 0),
            status: p.status ?? 'planned',
            note: p.note,
            dayId: p.dayId,
          } as Expense,
        ],
      };

    case 'updateExpense':
      return {
        ...db,
        expenses: db.expenses.map((e) => (e.id === p.expenseId ? { ...e, ...p.patch } : e)),
      };

    case 'createChecklist': {
      const tripId = p.tripId as string;
      const phase = p.phase as 'before' | 'during' | 'after';
      const titles = (p.titles as string[]) ?? [];
      const existing = db.checklists.find((c) => c.tripId === tripId && c.phase === phase);
      if (existing) {
        const known = new Set(existing.items.map((i) => i.title));
        return {
          ...db,
          checklists: db.checklists.map((c) =>
            c.id === existing.id
              ? {
                  ...c,
                  items: [
                    ...c.items,
                    ...titles
                      .filter((t) => !known.has(t))
                      .map((title) => ({ id: uid('cli'), title, done: false, auto: false })),
                  ],
                }
              : c,
          ),
        };
      }
      return {
        ...db,
        checklists: [
          ...db.checklists,
          {
            id: uid('cl'),
            tripId,
            phase,
            title: p.title ?? '补充清单',
            items: titles.map((title) => ({ id: uid('cli'), title, done: false, auto: false })),
          },
        ],
      };
    }

    case 'optimizeRoute': {
      const order = p.order as string[];
      if (!Array.isArray(order)) return db;
      const map = new Map(order.map((id, i) => [id, i]));
      const moved = db.activities.map((a) => (map.has(a.id) ? { ...a, order: map.get(a.id)! } : a));
      const next = { ...db, activities: moved };
      return {
        ...next,
        activities: [
          ...next.activities.filter((a) => a.dayId !== p.dayId),
          ...reflowDay(next, p.dayId, p.anchorStart),
        ],
      };
    }

    case 'rescheduleTrip': {
      // 重排某一天：先移除该日旧安排，再按 specs 重建
      const specs = (p.specs ?? []) as ActivitySpec[];
      const stripped: DB = {
        ...db,
        activities: db.activities.filter((a) => a.dayId !== p.dayId),
      };
      const created: Activity[] = [];
      let cursor = (p.anchorStart as string) ?? '09:30';
      specs.forEach((spec, i) => {
        const trip = tripOf(db, p.dayId);
        const place = spec.placeId && trip ? findPlace(trip, spec.placeId) : undefined;
        const prevPlace =
          i === 0 || !trip
            ? undefined
            : created[i - 1].placeId
              ? findPlace(trip, created[i - 1].placeId!)
              : undefined;
        const t = prevPlace && place ? estimateTransit(prevPlace, place) : null;
        const start = i === 0 ? cursor : addMinutes(cursor, t?.minutes ?? 15);
        created.push(buildActivity(stripped, p.dayId, { ...spec, startTime: start }, i));
        cursor = created[i].endTime;
      });
      return { ...stripped, activities: [...stripped.activities, ...created] };
    }

    case 'generateTripPlan': {
      // 全量重建：清空该 Trip 的安排后按 days 骨架写入
      const days = (p.days ?? []) as { dayId: string; title?: string; specs: ActivitySpec[] }[];
      let next: DB = {
        ...db,
        activities: db.activities.filter((a) => a.tripId !== p.tripId),
        days: db.days.map((d) => {
          const found = days.find((x) => x.dayId === d.id);
          return found?.title ? { ...d, title: found.title } : d;
        }),
      };
      days.forEach((dayPlan) => {
        dayPlan.specs.forEach((spec, i) => {
          next = {
            ...next,
            activities: [...next.activities, buildActivity(next, dayPlan.dayId, spec, i)],
          };
        });
      });
      return next;
    }

    // ── 自然语言创建旅行（与 store.createTrip 共用 buildTrip，行为一致）──
    case 'createTrip': {
      const input = resolveTripInput(p);
      if (!input) return db;
      const { trip, days, transitActs, expenses } = buildTrip(input);
      return {
        ...db,
        trips: [trip, ...db.trips],
        days: [...db.days, ...days],
        activities: [...db.activities, ...transitActs],
        expenses: [...db.expenses, ...expenses],
        checklists: [...db.checklists, ...ensureTripChecklists(trip, [], db.bookings, db.files)],
        savedPlaces: { ...db.savedPlaces, [trip.id]: [] },
      };
    }

    // ── 「我不知道去哪」的目的地推荐落库 ──
    // 只存 destinationId + score + reason，不存完整 Destination（内含 handbook，体积大）
    case 'generateDestinationRecommendation': {
      const answers = { ...DEFAULT_ANSWERS, ...(p.answers as Partial<QuizAnswers>) };
      const topN = typeof p.topN === 'number' ? Math.min(Math.max(1, Math.round(p.topN)), 5) : 3;
      const month = typeof p.month === 'number' ? p.month : new Date().getMonth() + 1;
      const recs = recommend(answers, month, topN);
      if (!recs.length) return db;
      const createdAt = new Date().toISOString();
      const picks: DestinationPick[] = recs.map((r) => ({
        id: uid('pick'),
        destinationId: r.destination.id,
        score: r.score,
        reason: r.reasons[0] ?? '',
        createdAt,
        containerType: p.containerType as PlaceContainerType | undefined,
        containerId: p.containerId as string | undefined,
      }));
      // 只保留最近 20 条：后端 /api/state 是整份 store 单 blob（4MB 上限）
      return { ...db, destinationPicks: [...picks, ...(db.destinationPicks ?? [])].slice(0, 20) };
    }

    default:
      return db;
  }
}

/** 顺序执行动作数组，返回新的 DB（不修改入参） */
export function applyActions(db: DB, actions: AIAction[]): DB {
  return actions.reduce((acc, action) => applyOne(acc, action), db);
}
