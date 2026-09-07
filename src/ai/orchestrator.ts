import type { Activity, AIAction, AIProposal, Checklist, Day, DiffItem, Place, Trip } from '@/types';
import type { DB } from '@/services/store';
import { generatePlan, getCandidatePool } from '@/ai/planningEngine';
import { estimateTransit, optimizeOrder } from '@/services/route';
import { isLLMEnabled, llmJSON } from '@/services/llm';
import { computeDayIntensity, weatherOf } from '@/services/intelligence';
import { weatherFor } from '@/services/world';
import { contextualItems } from '@/services/checklist';
import { addMinutes, durationText, toMinutes, todayISO } from '@/utils/date';
import { money } from '@/utils/format';
import { uid } from '@/utils/id';
import { applyActions, type ActivitySpec } from './actions';

/**
 * AI Orchestrator
 * ────────────────────────────────────────────────────────────
 * 输入：用户自然语言 + 当前 Trip 上下文
 * 输出：一段解释 + 一组结构化 Action（尚未落库）
 * 落库只发生在用户点「应用修改」之后（见 store.applyProposal）
 */

export interface AIContext {
  trip: Trip;
  days: Day[];
  activities: Activity[];
  places: Place[];
  placeOf: (id?: string) => Place | undefined;
  today: Day | undefined;
  weatherRainToday: number;
}

export interface AIResult {
  reply: string;
  proposal: AIProposal | null;
  followUps: string[];
  /** 这一轮是模型驱动的还是本地规则驱动的，UI 会显示出来 */
  source?: 'llm' | 'local';
}

const ALL_INTENTS: Intent[] = [
  'generate',
  'lessTired',
  'noEarly',
  'moreShopping',
  'budgetCut',
  'mustGo',
  'rain',
  'late',
  'optimize',
  'budgetOptimize',
  'checklist',
  'unknown',
];

const INTENT_HINT = [
  'generate: 要一版完整行程 / 帮我规划 / 重新生成',
  'lessTired: 觉得太累、太赶、想轻松一点、减少安排',
  'noEarly: 不想早起、想晚点出发',
  'moreShopping: 想多逛街、多购物、多买东西',
  'mustGo: 一定要去某个具体地点',
  'budgetCut: 给出一个具体的总预算金额上限',
  'budgetOptimize: 超预算了、想省一点、让 AI 优化预算',
  'rain: 下雨了、天气不好、想改室内',
  'late: 睡过头、出门晚了，需要重排今天剩余行程',
  'optimize: 想优化某天的路线顺序',
  'checklist: 问还漏了什么、需要准备什么',
  'unknown: 以上都不是',
].join('\n');

export function buildContext(db: DB, tripId: string, date = todayISO()): AIContext | null {
  const trip = db.trips.find((t) => t.id === tripId);
  if (!trip) return null;
  const days = db.days.filter((d) => d.tripId === tripId).sort((a, b) => a.index - b.index);
  const activities = db.activities.filter((a) => a.tripId === tripId);
  // 统一候选池：精编 ∪ 已发现（discovered）∪ 攻略引用，避免 Assistant 与 AI Planner 各看各的
  const places = getCandidatePool(db, trip);
  // Phase 0：无真实 WeatherProvider → 空数组（不是假天气）
  const weather = weatherFor(trip.destinationId, days.map((d) => d.date));
  return {
    trip,
    days,
    activities,
    places,
    placeOf: (id) => (id ? places.find((p) => p.id === id) : undefined),
    today: days.find((d) => d.date === date) ?? days[0],
    weatherRainToday: weatherOf(weather, date)?.rain ?? 0,
  };
}

// ── 工具 ────────────────────────────────────────────────────
const actsOf = (a: Activity[], dayId: string) =>
  a.filter((x) => x.dayId === dayId && x.status !== 'skipped').sort((x, y) => x.order - y.order);

const isCore = (a: Activity) => a.pinned || a.type === 'transport' || a.type === 'stay';

const dayLoad = (ctx: AIContext, day: Day) => {
  const list = actsOf(ctx.activities, day.id);
  return computeDayIntensity(list, ctx.placeOf).score;
};

const emptiestDay = (ctx: AIContext) =>
  [...ctx.days].sort((a, b) => dayLoad(ctx, a) - dayLoad(ctx, b))[0];

const unscheduled = (ctx: AIContext) => {
  const used = new Set(ctx.activities.map((a) => a.placeId).filter(Boolean));
  return ctx.places.filter((p) => !used.has(p.id));
};

// ── 意图识别 ────────────────────────────────────────────────
type Intent =
  | 'generate'
  | 'lessTired'
  | 'noEarly'
  | 'moreShopping'
  | 'budgetCut'
  | 'mustGo'
  | 'rain'
  | 'late'
  | 'optimize'
  | 'budgetOptimize'
  | 'checklist'
  | 'unknown';

function detectIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (/(生成|帮我规划|重新生成|安排.*行程|做.*攻略|重新规划)/.test(t)) return 'generate';
  if (/(太累|太赶|有点满|累了|减少|轻松一点|松弛|不想那么赶)/.test(t)) return 'lessTired';
  if (/(不想早起|起不来|晚一点出发|睡懒觉)/.test(t)) return 'noEarly';
  if (/(多逛|购物|逛街|买东西|shopping)/.test(t)) return 'moreShopping';
  if (/(一定要去|必须去|一定要安排|想去.*!|核心)/.test(t)) return 'mustGo';
  if (/(下雨|下雨了|暴雨|天气不好)/.test(t)) return 'rain';
  if (/(睡过头|起晚|出门晚了|点才出门|迟到了)/.test(t)) return 'late';
  if (/(超预算|超支|预算不够|太贵|省一点|削减|优化预算)/.test(t)) return 'budgetOptimize';
  if (/(预算|只有.*块|只有.*元|¥\s?\d)/.test(t)) return 'budgetCut';
  if (/(优化.*路线|顺序|怎么排|路线.*合理|优化今天|优化行程)/.test(t)) return 'optimize';
  if (/(清单|漏了|准备什么|还需要准备|checklist)/.test(t)) return 'checklist';
  return 'unknown';
}

const extractNumber = (text: string) => {
  const m = text.replace(/,/g, '').match(/(\d{3,6})\s*(元|块|rmb|cny|¥)?/i);
  return m ? Number(m[1]) : null;
};

const extractHour = (text: string) => {
  const m = text.match(/(\d{1,2})\s*点/);
  if (m) {
    const h = Number(m[1]);
    return `${`${h}`.padStart(2, '0')}:00`;
  }
  const m2 = text.match(/(\d{1,2}):(\d{2})/);
  return m2 ? `${m2[1].padStart(2, '0')}:${m2[2]}` : null;
};

const findPlace = (ctx: AIContext, text: string) => {
  const cleaned = text.replace(/[，。！？,.!?我一定要去必须想安排]/g, '');
  return (
    ctx.places.find((p) => cleaned.includes(p.name)) ??
    ctx.places.find((p) => p.name.length >= 2 && cleaned.includes(p.name.slice(0, 2)))
  );
};

// ── 各意图 → Actions ────────────────────────────────────────
interface HandlerOutput {
  actions: AIAction[];
  changes: string[];
  impact: string[];
  title: string;
  reply: string;
  followUps: string[];
}

function handleGenerate(ctx: AIContext, _db: DB): HandlerOutput {
  const plans = generatePlan(ctx.trip, ctx.days, ctx.places);
  const actions: AIAction[] = [
    {
      id: uid('a'),
      name: 'generateTripPlan',
      params: { tripId: ctx.trip.id, days: plans.map((p) => ({ dayId: p.dayId, title: p.title, specs: p.specs })) },
      risk: 'high',
      summary: `重建 ${plans.length} 天行程`,
    },
  ];
  const total = plans.reduce((s, p) => s + p.specs.filter((x) => x.type !== 'transport').length, 0);
  return {
    actions,
    title: `${ctx.trip.destinationName} ${ctx.days.length} 天方案`,
    changes: plans.map(
      (p, i) => `Day ${i + 1} · ${p.title}（${p.intensity === 'low' ? '低强度' : p.intensity === 'medium' ? '中强度' : '高强度'}，${p.specs.length} 项）`,
    ),
    impact: [
      `共安排 ${total} 个地点，覆盖 ${ctx.days.length} 天`,
      ctx.trip.profile.dislikes.includes('earlyRise')
        ? '每天从 10:00 开始，不安排早起'
        : '每天 09:30 左右出发',
      ctx.trip.planningPreference === 'delegator'
        ? '按你的节奏自动分配强度，首尾两天减负'
        : '可在行程页逐项微调',
    ],
    reply: `按你的节奏生成了一版 ${ctx.days.length} 天方案。首尾两天我留了余量，整天型地点单独占了一天。不满意可以直接说「太累了」或「我想多逛街」。`,
    followUps: ['太累了', '我预算只有 7000', '我不想早起'],
  };
}

function handleLessTired(ctx: AIContext, _db: DB): HandlerOutput {
  const actions: AIAction[] = [];
  const changes: string[] = [];
  let removed = 0;

  ctx.days.forEach((day) => {
    const list = actsOf(ctx.activities, day.id);
    const info = computeDayIntensity(list, ctx.placeOf);
    if (info.level === 'low' || list.length <= 2) return;
    const victim = [...list].reverse().find((a) => !isCore(a) && a.type !== 'free');
    if (!victim) return;
    actions.push({
      id: uid('a'),
      name: 'deleteActivity',
      params: { activityId: victim.id },
      risk: 'high',
      summary: `Day ${day.index} 移除「${victim.title}」`,
    });
    changes.push(`Day ${day.index} 移除「${victim.title}」，强度 ${info.level === 'high' ? '高' : '中'} → 更低`);
    removed++;
  });

  if (!removed) {
    // 已经很松：不再硬塞「自由时间」活动（那是缺数据的兜底占位，已被禁止）。
    // 留白留给用户自己逛，规划引擎不替它编一个活动。
    changes.push('已经很松了，留白留给随性探索，不硬塞安排');
  }

  return {
    actions,
    title: '降低行程密度',
    changes,
    impact: [`共调整 ${actions.length} 处`, '被移除的都是非核心安排，标记「一定要去」的地点保留'],
    reply: removed
      ? `我把最满的几天各去掉一个非核心安排，留出了呼吸空间。${removed} 处改动都在下面，确认后才会写入。`
      : '你的行程本来就不算满，留白就留给你自己逛。',
    followUps: ['我还是觉得赶', '帮我把自由时间排在下午', '现在预算还够吗'],
  };
}

function handleNoEarly(ctx: AIContext, _db: DB): HandlerOutput {
  const actions: AIAction[] = [];
  const changes: string[] = [];
  ctx.days.forEach((day) => {
    const list = actsOf(ctx.activities, day.id);
    list.forEach((a) => {
      if (isCore(a) && !a.pinned) return;
      if (toMinutes(a.startTime) >= 10 * 60) return;
      const shift = 10 * 60 - toMinutes(a.startTime);
      actions.push({
        id: uid('a'),
        name: 'updateActivity',
        params: {
          activityId: a.id,
          patch: { startTime: addMinutes(a.startTime, shift), endTime: addMinutes(a.endTime, shift) },
        },
        risk: 'medium',
        summary: `「${a.title}」${a.startTime} → ${addMinutes(a.startTime, shift)}`,
      });
      changes.push(`Day ${day.index}「${a.title}」推迟到 ${addMinutes(a.startTime, shift)}`);
    });
  });
  if (!actions.length) {
    return {
      actions: [],
      title: '调整出发时间',
      changes: ['所有安排本来就在 10:00 之后，无需调整'],
      impact: [],
      reply: '看了下，所有安排本来都在 10:00 之后，不用改。',
      followUps: ['那再晚一点', '太累了'],
    };
  }
  return {
    actions,
    title: '所有非必要安排推迟到 10:00 后',
    changes: changes.slice(0, 8),
    impact: ['必要交通与已标记「一定要去」的预约时间保持不变', '每天结束时间相应顺延，晚上行程可能变晚'],
    reply: '把非必要的安排都推到 10:00 之后了。但有机票、酒店入住和已预约的项我没动——那些动不了。',
    followUps: ['太累了', '帮我优化今天的顺序'],
  };
}

function handleMoreShopping(ctx: AIContext, _db: DB): HandlerOutput {
  const actions: AIAction[] = [];
  const changes: string[] = [];
  const pool = unscheduled(ctx).filter((p) => p.tags.includes('shopping') || p.category === 'shopping');
  const target = emptiestDay(ctx);

  pool.slice(0, 2).forEach((place) => {
    actions.push({
      id: uid('a'),
      name: 'schedulePlace',
      params: { dayId: target.id, placeId: place.id },
      risk: 'low',
      summary: `Day ${target.index} 加入「${place.name}」`,
    });
    changes.push(`Day ${target.index} 加入「${place.name}」（约 ${durationText(place.durationMin)}）`);
  });

  // 已有购物安排则延长停留
  actsOf(ctx.activities, target.id)
    .filter((a) => a.type === 'shopping')
    .slice(0, 1)
    .forEach((a) => {
      actions.push({
        id: uid('a'),
        name: 'updateActivity',
        params: { activityId: a.id, patch: { endTime: addMinutes(a.endTime, 30) } },
        risk: 'low',
        summary: `「${a.title}」延长 30 分钟`,
      });
      changes.push(`「${a.title}」停留延长 30 分钟`);
    });

  if (!actions.length) {
    return {
      actions: [],
      title: '增加购物时间',
      changes: ['地点池里没有更多购物地点了'],
      impact: [],
      reply: '这个目的地的地点池里暂时没有更多购物选择了，我保留了现有的购物时间。',
      followUps: ['换个地方逛', '太累了'],
    };
  }
  return {
    actions,
    title: '增加购物时间',
    changes,
    impact: [`加在最空的一天：Day ${target.index}`, '相应减少当天的留白时间'],
    reply: `把购物加在了最空的 Day ${target.index}，并给已有购物安排延长了 30 分钟。`,
    followUps: ['再多一点', '太累了', '预算还够吗'],
  };
}

function handleBudgetCut(ctx: AIContext, db: DB, text: string): HandlerOutput {
  const target = extractNumber(text);
  if (!target) {
    return {
      actions: [],
      title: '调整预算',
      changes: [],
      impact: [],
      reply: '没听清预算数字，你可以直接说「我预算只有 7000」。',
      followUps: ['我预算只有 7000'],
    };
  }
  const expenses = db.expenses.filter((e) => e.tripId === ctx.trip.id);
  const planned = expenses.filter((e) => e.status === 'planned');
  const paid = expenses.reduce((s, e) => (e.status === 'paid' ? s + e.amount : s), 0);
  const plannedTotal = planned.reduce((s, e) => s + e.amount, 0);
  const gap = Math.max(0, paid + plannedTotal - target);
  const actions: AIAction[] = [
    {
      id: uid('a'),
      name: 'updateTrip',
      params: { tripId: ctx.trip.id, patch: { totalBudget: target } },
      risk: 'high',
      summary: `总预算 ${money(ctx.trip.totalBudget)} → ${money(target)}`,
    },
  ];
  const changes = [`总预算 ${money(ctx.trip.totalBudget)} → ${money(target)}`];
  const impact = [`已支出 ${money(paid)} 无法退回`];

  if (gap > 0 && plannedTotal > 0) {
    const ratio = Math.min(0.45, gap / plannedTotal);
    planned
      .filter((e) => e.category !== 'stay' && e.category !== 'transport')
      .forEach((e) => {
        const cut = Math.round((e.amount * ratio) / 10) * 10;
        if (cut <= 0) return;
        actions.push({
          id: uid('a'),
          name: 'updateExpense',
          params: { expenseId: e.id, patch: { amount: Math.max(0, e.amount - cut) } },
          risk: 'high',
          summary: `「${e.title}」${money(e.amount)} → ${money(e.amount - cut)}`,
        });
        changes.push(`「${e.title}」削减 ${money(cut)}`);
      });
    const after = paid + plannedTotal - planned.filter((e) => e.category !== 'stay' && e.category !== 'transport').reduce((s, e) => s + Math.round((e.amount * ratio) / 10) * 10, 0);
    impact.push(`调整后预计支出约 ${money(after)}，${after <= target ? '回到预算内' : `仍超出 ${money(after - target)}`}`);
  } else if (gap === 0) {
    impact.push('当前预计支出已在新预算内，无需削减');
  }

  return {
    actions,
    title: `预算调整为 ${money(target)}`,
    changes,
    impact,
    reply:
      gap > 0
        ? `已把预算改成 ${money(target)}。住宿和往返交通我没动，其余按比例削减了约 ${Math.round((gap / plannedTotal) * 100)}%。`
        : `预算改成 ${money(target)}，当前预计支出还在范围内，不用削减。`,
    followUps: ['还能再省一点吗', '帮我优化预算', '太累了'],
  };
}

function handleBudgetOptimize(ctx: AIContext, db: DB): HandlerOutput {
  const expenses = db.expenses.filter((e) => e.tripId === ctx.trip.id && e.status === 'planned');
  const flexible = expenses.filter((e) => ['shopping', 'other', 'food', 'ticket'].includes(e.category));
  const actions: AIAction[] = [];
  const changes: string[] = [];
  let saved = 0;
  flexible
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)
    .forEach((e) => {
      const cut = Math.round((e.amount * 0.2) / 10) * 10;
      if (cut <= 0) return;
      saved += cut;
      actions.push({
        id: uid('a'),
        name: 'updateExpense',
        params: { expenseId: e.id, patch: { amount: Math.max(0, e.amount - cut) } },
        risk: 'high',
        summary: `「${e.title}」减少 ${money(cut)}`,
      });
      changes.push(`「${e.title}」${money(e.amount)} → ${money(e.amount - cut)}`);
    });

  if (!actions.length) {
    return {
      actions: [],
      title: '预算优化',
      changes: ['没有可削减的计划支出'],
      impact: [],
      reply: '计划支出里基本都是刚需（住宿 / 交通），没有太多可动的。要不直接说一个你能接受的总预算？',
      followUps: ['我预算只有 7000'],
    };
  }
  return {
    actions,
    title: `预计可节省 ${money(saved)}`,
    changes,
    impact: [`共节省 ${money(saved)}`, '削减集中在购物 / 餐饮 / 门票，住宿与交通未动'],
    reply: `找出了 ${actions.length} 项可以压缩的支出，大概能省 ${money(saved)}。住宿和往返交通我没动——那部分退不了。`,
    followUps: ['再省一点', '我预算只有 7000'],
  };
}

function handleMustGo(ctx: AIContext, _db: DB, text: string): HandlerOutput {
  const place = findPlace(ctx, text);
  if (!place) {
    return {
      actions: [],
      title: '设置核心行程',
      changes: [],
      impact: [],
      reply: '没找到这个地点。可以直接说地点名，比如「我一定要去迪士尼」。',
      followUps: ['我一定要去迪士尼'],
    };
  }
  const existing = ctx.activities.find((a) => a.placeId === place.id);
  if (existing) {
    return {
      actions: [
        {
          id: uid('a'),
          name: 'updateActivity',
          params: { activityId: existing.id, patch: { pinned: true } },
          risk: 'low',
          summary: `「${place.name}」标记为核心行程`,
        },
      ],
      title: `把「${place.name}」设为核心`,
      changes: [`「${place.name}」已标记为「一定要去」，不会被自动优化掉`],
      impact: ['后续重排会优先保留这项'],
      reply: `已经把「${place.name}」设成核心行程，之后的自动调整都不会动它。`,
      followUps: ['太累了', '帮我优化今天的顺序'],
    };
  }

  const day = emptiestDay(ctx);
  const actions: AIAction[] = [
    {
      id: uid('a'),
      name: 'schedulePlace',
      params: { dayId: day.id, placeId: place.id },
      risk: 'medium',
      summary: `Day ${day.index} 加入「${place.name}」并设为核心`,
    },
  ];
  const changes = [`Day ${day.index} 加入「${place.name}」（${durationText(place.durationMin)}）`];
  const list = actsOf(ctx.activities, day.id);
  if (list.length >= 4) {
    const victim = [...list].reverse().find((a) => !isCore(a) && a.type !== 'free');
    if (victim) {
      actions.push({
        id: uid('a'),
        name: 'deleteActivity',
        params: { activityId: victim.id },
        risk: 'high',
        summary: `Day ${day.index} 腾出时间：移除「${victim.title}」`,
      });
      changes.push(`为了让出时间，移除「${victim.title}」`);
    }
  }
  return {
    actions,
    title: `把「${place.name}」设为必去`,
    changes,
    impact: [`安排在 Day ${day.index}（当天最空）`, place.requiredBooking ? '这项需要提前预约，记得订票' : '已标记为核心，不会被自动优化'],
    reply: `把「${place.name}」排进了 Day ${day.index}，并设成核心。${place.requiredBooking ? '它还需要提前预约，别忘订票。' : ''}`,
    followUps: ['太累了', '帮我优化今天的顺序'],
  };
}

function handleRain(ctx: AIContext, _db: DB): HandlerOutput {
  const day = ctx.today ?? ctx.days[0];
  const list = actsOf(ctx.activities, day.id);
  const outdoor = list.filter((a) => {
    const p = ctx.placeOf(a.placeId);
    return p && !p.indoor;
  });
  const indoorPool = unscheduled(ctx).filter((p) => p.indoor);
  const actions: AIAction[] = [];
  const changes: string[] = [];

  outdoor.slice(0, Math.min(outdoor.length, indoorPool.length)).forEach((a, i) => {
    const replacement = indoorPool[i];
    if (!replacement) return;
    actions.push({
      id: uid('a'),
      name: 'updateActivity',
      params: {
        activityId: a.id,
        patch: {
          title: replacement.name,
          placeId: replacement.id,
          type: replacement.category,
          estimatedCost: replacement.avgCost,
          note: '雨天替代方案（室内）',
        },
      },
      risk: 'medium',
      summary: `「${a.title}」→「${replacement.name}」（室内）`,
    });
    changes.push(`「${a.title}」替换为「${replacement.name}」`);
  });

  if (!actions.length) {
    return {
      actions: [],
      title: '雨天调整',
      changes: ['今天没有户外安排，或没有可用的室内备选'],
      impact: [],
      reply: '今天的安排本来就都在室内，或者没有更好的室内备选了。雨不大就照原计划走吧。',
      followUps: ['我还是想待在酒店', '帮我优化今天的顺序'],
    };
  }
  return {
    actions,
    title: `Day ${day.index} 雨天方案`,
    changes,
    impact: ['只替换户外项目，室内与已预约项不动', '交通时间会重新计算'],
    reply: `把今天的户外项目换成了室内备选。已预约的项和交通我没动。`,
    followUps: ['我想去附近喝咖啡', '太累了'],
  };
}

function handleLate(ctx: AIContext, _db: DB, text: string): HandlerOutput {
  const start = extractHour(text) ?? '11:00';
  const day = ctx.today ?? ctx.days[0];
  const list = actsOf(ctx.activities, day.id).filter((a) => !isCore(a) || a.pinned);
  const kept: ActivitySpec[] = list
    .filter((a) => a.pinned || list.indexOf(a) < list.length - 1 || list.length <= 2)
    .map((a) => ({
      title: a.title,
      placeId: a.placeId,
      startTime: '00:00',
      durationMin: Math.max(45, Math.min(toMinutes(a.endTime) - toMinutes(a.startTime), 120)),
      type: a.type,
      pinned: a.pinned,
      estimatedCost: a.estimatedCost,
    }));

  if (!kept.length) {
    return {
      actions: [],
      title: '重新安排今天',
      changes: ['今天剩余没有可重排的安排'],
      impact: [],
      reply: '今天剩下的安排已经不多了，直接按原计划慢慢走就行。',
      followUps: ['我想去附近喝咖啡'],
    };
  }

  const actions: AIAction[] = [
    {
      id: uid('a'),
      name: 'rescheduleTrip',
      params: { dayId: day.id, anchorStart: start, specs: kept },
      risk: 'medium',
      summary: `从 ${start} 起重排今天剩余 ${kept.length} 项`,
    },
  ];
  const dropped = list.length - kept.length;
  return {
    actions,
    title: `从 ${start} 重新安排今天`,
    changes: [
      `起点调整为 ${start}`,
      ...kept.slice(0, 6).map((k) => `保留「${k.title}」，压缩到 ${k.durationMin} 分钟`),
      ...(dropped > 0 ? [`放弃 ${dropped} 项来不及的安排`] : []),
    ],
    impact: ['已预约与交通项保持不变', '每项停留时间略有压缩'],
    reply: `按 ${start} 出门重新算了今天剩下的行程，保留了 ${kept.length} 项${dropped ? `，放弃 ${dropped} 项来不及的` : ''}。`,
    followUps: ['我想去附近喝咖啡', '今天下雨'],
  };
}

function handleOptimize(ctx: AIContext, _db: DB): HandlerOutput {
  const day = ctx.today ?? ctx.days[0];
  const list = actsOf(ctx.activities, day.id).filter((a) => a.placeId);
  const places = list.map((a) => ctx.placeOf(a.placeId)).filter(Boolean) as Place[];
  if (places.length < 3) {
    return {
      actions: [],
      title: '优化路线',
      changes: ['当天少于 3 个地点，不需要优化'],
      impact: [],
      reply: '当天地点不多，现在的顺序已经挺顺的。',
      followUps: ['帮我优化今天的顺序'],
    };
  }
  const { order, savedMinutes } = optimizeOrder(places);
  const idOrder = order.map((p) => list.find((a) => a.placeId === p.id)!.id);
  const actions: AIAction[] = [
    {
      id: uid('a'),
      name: 'optimizeRoute',
      params: { dayId: day.id, order: idOrder },
      risk: 'medium',
      summary: `重排 Day ${day.index} 的 ${places.length} 个地点顺序`,
    },
  ];
  return {
    actions,
    title: `Day ${day.index} 路线优化`,
    changes: order.map((p, i) => `${i + 1}. ${p.name}`),
    impact: [
      savedMinutes > 0 ? `预计节省 ${durationText(savedMinutes)} 交通时间` : '当前顺序已接近最优',
      '每个地点的开始时间会重新计算',
    ],
    reply:
      savedMinutes > 0
        ? `重排了 Day ${day.index} 的顺序，预计能省下 ${durationText(savedMinutes)} 在路上。`
        : `看了下 Day ${day.index} 的顺序，现在这样已经比较顺了，只微调了时间衔接。`,
    followUps: ['太累了', '这几个地点怎么排最合理'],
  };
}

function handleChecklist(ctx: AIContext, db: DB): HandlerOutput {
  const existing = db.checklists.filter((c) => c.tripId === ctx.trip.id);
  const known = new Set(existing.flatMap((c) => c.items.map((i) => i.title)));
  const missing = contextualItems(ctx.trip).filter((t) => !known.has(t));
  if (!missing.length) {
    return {
      actions: [],
      title: '补充准备清单',
      changes: ['暂时没有新增项，清单已经覆盖当前行程'],
      impact: [],
      reply: '按你这次的目的地和偏好看了下，该准备的都在清单里了。',
      followUps: ['我还漏了什么'],
    };
  }
  const actions: AIAction[] = [
    {
      id: uid('a'),
      name: 'createChecklist',
      params: { tripId: ctx.trip.id, phase: 'before', title: 'AI 补充', titles: missing },
      risk: 'low',
      summary: `补充 ${missing.length} 项准备事项`,
    },
  ];
  return {
    actions,
    title: `补充 ${missing.length} 项准备事项`,
    changes: missing,
    impact: ['已加入「出发前」清单'],
    reply: `按你这次的目的地、兴趣和同行人补了 ${missing.length} 项容易漏的东西。`,
    followUps: ['还有吗', '现在准备度多少'],
  };
}

function handleUnknown(): HandlerOutput {
  return {
    actions: [],
    title: '',
    changes: [],
    impact: [],
    reply: '我可以直接帮你改行程。比如：「太累了」「我不想早起」「我预算只有 7000」「我一定要去迪士尼」「今天下雨」「我睡过头了」。',
    followUps: ['太累了', '我不想早起', '帮我规划', '我预算只有 7000'],
  };
}

// ── Diff：对比执行前后的数据库 ───────────────────────────────
export function generateDiff(before: DB, after: DB, tripId: string): DiffItem[] {
  const out: DiffItem[] = [];
  const bA = new Map(before.activities.filter((a) => a.tripId === tripId).map((a) => [a.id, a]));
  const aA = new Map(after.activities.filter((a) => a.tripId === tripId).map((a) => [a.id, a]));
  const dayLabel = (dayId: string) => {
    const d = before.days.find((x) => x.id === dayId) ?? after.days.find((x) => x.id === dayId);
    return d ? `Day ${d.index}` : '';
  };

  aA.forEach((a, id) => {
    if (!bA.has(id)) {
      out.push({
        kind: 'add',
        label: `${dayLabel(a.dayId)} ${a.startTime} ${a.title}`,
        after: `${a.startTime}–${a.endTime}${a.estimatedCost ? ` · ${money(a.estimatedCost)}` : ''}`,
      });
    } else {
      const b = bA.get(id)!;
      if (b.startTime !== a.startTime || b.endTime !== a.endTime) {
        out.push({
          kind: 'update',
          label: `${dayLabel(a.dayId)} ${a.title} 时间`,
          before: `${b.startTime}–${b.endTime}`,
          after: `${a.startTime}–${a.endTime}`,
        });
      }
      if (b.title !== a.title) out.push({ kind: 'update', label: `${dayLabel(a.dayId)} 地点`, before: b.title, after: a.title });
      if (b.pinned !== a.pinned && a.pinned) out.push({ kind: 'update', label: `「${a.title}」`, after: '标记为核心行程' });
    }
  });
  bA.forEach((b, id) => {
    if (!aA.has(id)) {
      out.push({ kind: 'remove', label: `${dayLabel(b.dayId)} ${b.startTime} ${b.title}`, before: `${b.startTime}–${b.endTime}` });
    }
  });

  const bE = new Map(before.expenses.map((e) => [e.id, e]));
  after.expenses.forEach((e) => {
    const b = bE.get(e.id);
    if (b && b.amount !== e.amount) {
      out.push({ kind: 'update', label: `预算 · ${e.title}`, before: money(b.amount), after: money(e.amount) });
    } else if (!b) {
      out.push({ kind: 'add', label: `预算 · ${e.title}`, after: money(e.amount) });
    }
  });

  const bT = before.trips.find((t) => t.id === tripId);
  const aT = after.trips.find((t) => t.id === tripId);
  if (bT && aT && bT.totalBudget !== aT.totalBudget) {
    out.push({ kind: 'update', label: '总预算', before: money(bT.totalBudget), after: money(aT.totalBudget) });
  }

  const countItems = (list: Checklist[]) => list.filter((c) => c.tripId === tripId).reduce((s, c) => s + c.items.length, 0);
  const added = countItems(after.checklists) - countItems(before.checklists);
  if (added > 0) out.push({ kind: 'add', label: '准备清单', after: `新增 ${added} 项` });

  return out;
}

// ── 意图 → Actions（纯本地，LLM 不参与这一层）────────────────
function dispatch(intent: Intent, text: string, ctx: AIContext, db: DB): HandlerOutput {
  let out: HandlerOutput;
  switch (intent) {
    case 'generate':
      out = handleGenerate(ctx, db);
      break;
    case 'lessTired':
      out = handleLessTired(ctx, db);
      break;
    case 'noEarly':
      out = handleNoEarly(ctx, db);
      break;
    case 'moreShopping':
      out = handleMoreShopping(ctx, db);
      break;
    case 'budgetCut':
      out = handleBudgetCut(ctx, db, text);
      break;
    case 'budgetOptimize':
      out = handleBudgetOptimize(ctx, db);
      break;
    case 'mustGo':
      out = handleMustGo(ctx, db, text);
      break;
    case 'rain':
      out = handleRain(ctx, db);
      break;
    case 'late':
      out = handleLate(ctx, db, text);
      break;
    case 'optimize':
      out = handleOptimize(ctx, db);
      break;
    case 'checklist':
      out = handleChecklist(ctx, db);
      break;
    default:
      out = handleUnknown();
  }

  return out;
}

// ── 组装结果（落库前的最后一步，仍然不写库）────────────────────
function finalize(
  out: HandlerOutput,
  db: DB,
  tripId: string,
  text: string,
  source: 'llm' | 'local' = 'local',
): AIResult {
  if (!out.actions.length) {
    return { reply: out.reply, proposal: null, followUps: out.followUps, source };
  }

  const next = applyActions(db, out.actions);
  const proposal: AIProposal = {
    id: uid('prop'),
    tripId,
    intent: text,
    title: out.title || 'AI 建议',
    changes: out.changes,
    impact: out.impact,
    actions: out.actions,
    diff: generateDiff(db, next, tripId),
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  return { reply: out.reply, proposal, followUps: out.followUps, source };
}

// ── 同步入口：只走本地规则（用于非交互场景与测试）──────────────
export function runAI(db: DB, tripId: string, text: string, date = todayISO()): AIResult {
  const ctx = buildContext(db, tripId, date);
  if (!ctx) return { reply: '没有找到当前旅行。', proposal: null, followUps: [] };
  return finalize(dispatch(detectIntent(text), text, ctx, db), db, tripId, text, 'local');
}

/**
 * 异步入口 —— 按需调用模型。
 *
 * `useLLM` 只应在「用户主动开启 AI 辅助」时传 true：
 *   · false（默认）：完全等同于 runAI，零网络请求、零成本
 *   · true：才可能在两种情况下发请求 ——
 *       1) 本地正则认不出这句话，让模型判断意图
 *       2) 产生了实际改动，让模型把改动说明写得像人话
 *
 * 模型只返回意图与文案，**永远不会**返回 Activity / 地点 / 金额。
 * 模型不可用或出错时静默回退，结果与本地路径一致。
 */
export async function runAIAsync(
  db: DB,
  tripId: string,
  text: string,
  date = todayISO(),
  useLLM = false,
): Promise<AIResult> {
  const ctx = buildContext(db, tripId, date);
  if (!ctx) return { reply: '没有找到当前旅行。', proposal: null, followUps: [] };

  let intent = detectIntent(text);
  let source: 'llm' | 'local' = 'local';
  let llmNote: string | null = null;

  if (intent === 'unknown' && useLLM && (await isLLMEnabled())) {
    const parsed = await parseIntentWithLLM(text, ctx);
    if (parsed) {
      source = 'llm';
      // 三种模式：intent 走 dispatch；qa / chat 直接返回文本
      if (parsed.mode === 'intent' && parsed.intent) {
        intent = parsed.intent;
        llmNote = parsed.reply ?? null;
      } else if (parsed.mode === 'qa' || parsed.mode === 'chat') {
        return {
          reply: parsed.reply,
          proposal: null,
          followUps: ['再具体点', '还有别的想了解的吗'],
          source: 'llm',
        };
      }
    }
  }

  const out = dispatch(intent, text, ctx, db);

  // 正则没认出来、LLM 也没给出可执行意图时，用模型的原话回答
  if (intent === 'unknown' && !out.actions.length) {
    return {
      reply: llmNote ?? out.reply,
      proposal: null,
      followUps: out.followUps,
      source: llmNote ? 'llm' : 'local',
    };
  }

  // 有实际改动时，让模型把「改了什么 / 有什么影响」说得更像人话
  if (source === 'llm' || (useLLM && out.actions.length && (await isLLMEnabled()))) {
    const polished = await polishChanges(out, text, ctx);
    if (polished) {
      out.changes = polished.changes.length ? polished.changes : out.changes;
      out.impact = polished.impact.length ? polished.impact : out.impact;
      source = 'llm';
    }
  }

  return finalize(out, db, tripId, text, source);
}

// ── LLM 辅助 1：意图识别 + 自由问答 ────────────────────────────
// 三种模式：
//   - intent: 用户想改动行程，按下表意图执行
//   - qa:    用户问知识类问题（攻略 / 几天合适 / 地铁 等），直接给答案不调用 Action
//   - chat:  闲聊 / 超出能力范围，温和回应
interface IntentReply {
  mode: 'intent' | 'qa' | 'chat';
  intent?: Intent;
  reply: string;
}

async function parseIntentWithLLM(text: string, ctx: AIContext): Promise<IntentReply | null> {
  const filled = ctx.days.filter((d) =>
    ctx.activities.some((a) => a.dayId === d.id),
  ).length;
  const system = [
    '你是 Trip OS 旅行助手的对话路由模块。要判断用户那句话属于哪一种，输出 JSON。',
    '',
    '【动作意图 mode=intent】当用户想要**改动**当前行程时：',
    '  输出 {"mode":"intent","intent":"<下列值之一>","reply":"<一句话简短确认要做的事>"}',
    '  可选 intent:',
    INTENT_HINT,
    '',
    '【知识问答 mode=qa】当用户在**问信息**（攻略/建议/经验）而不是要改动行程时：',
    '  比如「去日本需要几天」「大阪环球几点去最好」「关西机场怎么到京都」「3月京都樱花开了吗」',
    '  输出 {"mode":"qa","reply":"<用中文给出有信息量的答案，约 80~180 字，列 2~4 条要点更好>"}',
    '  通用原则：',
    '   · 不要瞎编票价/时刻表/营业时间/官方规定；涉及数字请用「建议」「通常」「一般」等模糊量词',
    '   · 给出可操作的建议（什么时间、怎么做、查什么渠道）',
    '   · 必要时附「去小红书/马蜂窝/Google 搜 X」类引导（不强迫）',
    '',
    '【闲聊 / 超出范围 mode=chat】当用户在闲聊、问候、问非旅行问题时：',
    '  输出 {"mode":"chat","reply":"<简短自然回应，顺便引导回旅行场景>"}',
    '',
    '严格只输出 JSON，不要其他文字。不要输出地点坐标、价格、营业时间等结构化字段。',
  ].join('\n');
  const user = [
    `当前旅行：${ctx.trip.destinationName}，${ctx.days.length} 天，已排 ${filled} 天。`,
    `用户说：${text}`,
  ].join('\n');

  const res = await llmJSON<IntentReply>(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { temperature: 0.3, maxTokens: 600 },
  );
  if (!res || !res.reply) return null;
  if (res.mode === 'intent') {
    if (!res.intent || !ALL_INTENTS.includes(res.intent)) return null;
  } else if (res.mode !== 'qa' && res.mode !== 'chat') {
    return null;
  }
  return res;
}

// ── LLM 辅助 2：把改动说明写得像人话 ─────────────────────────
async function polishChanges(
  out: HandlerOutput,
  text: string,
  ctx: AIContext,
): Promise<{ changes: string[]; impact: string[] } | null> {
  const system = [
    '你把旅行行程的机器化改动说明，改写成对用户友好的中文短句。',
    '要求：口语、具体、每条不超过 30 字；保留原有数量与时间事实，不得编造新信息；不要加序号和引号。',
    '只输出 JSON：{"changes":["..."],"impact":["..."]}，条目数与原数组一致。',
  ].join('\n');
  const user = [
    `旅行：${ctx.trip.destinationName} ${ctx.days.length} 天`,
    `用户诉求：${text}`,
    `原始改动：${JSON.stringify(out.changes)}`,
    `原始影响：${JSON.stringify(out.impact)}`,
  ].join('\n');

  const res = await llmJSON<{ changes: string[]; impact: string[] }>(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { temperature: 0.4, maxTokens: 500 },
  );
  if (!res) return null;
  return {
    changes: Array.isArray(res.changes) ? res.changes.filter((s) => typeof s === 'string') : [],
    impact: Array.isArray(res.impact) ? res.impact.filter((s) => typeof s === 'string') : [],
  };
}

/** 首页「现在最需要处理什么」——AI 的主动提醒（只读，不生成 Action） */
export function proactiveHints(ctx: AIContext, conflicts: { message: string; level: string }[], prep: number): string[] {
  const hints: string[] = [];
  conflicts.slice(0, 2).forEach((c) => hints.push(c.message));
  if (prep < 60) hints.push(`准备度 ${prep}%，建议先把交通和住宿确认下来`);
  const busy = ctx.days
    .map((d) => ({ d, s: dayLoad(ctx, d) }))
    .filter((x) => x.s >= 65);
  if (busy.length >= 2) hints.push(`有 ${busy.length} 天强度偏高，可以说一句「太累了」让我重排`);
  return hints.slice(0, 3);
}

export const transitBetween = (a: Place, b: Place) => estimateTransit(a, b);
