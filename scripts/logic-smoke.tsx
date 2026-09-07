import { buildSeed } from '@/data/seed';
import { recommend, travelType, transportEstimate } from '@/services/recommendation';
import { generatePlan, rankPlaces } from '@/services/planGenerator';
import { detectConflicts, preparationOf, computeDayIntensity } from '@/services/intelligence';
import { runAI, runAIAsync, buildContext } from '@/ai/orchestrator';
import { resetLLMStatusCache } from '@/services/llm';
import type { AIResult } from '@/ai/orchestrator';
import { money } from '@/utils/format';
import { applyActions } from '@/ai/actions';
import { ensureTripChecklists } from '@/services/checklist';
import { getPlaces } from '@/data/places';
import { getDestination } from '@/data/destinations';
import type { QuizAnswers } from '@/types';
import type { DB } from '@/services/store';

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = '') => results.push({ name, ok, detail });

// ── 1. 决策引擎 ─────────────────────────────────────────────
const answers: QuizAnswers = {
  travelMood: 'tired',
  duration: 'd45',
  origin: '上海',
  budget: 'b3',
  interests: ['coffee', 'citywalk', 'food', 'chill'],
  dislikes: ['earlyRise', 'rush', 'crowds'],
  pace: 'focused',
  companions: 'partner',
  destinationScope: 'domestic',
};

const recs = recommend(answers, 10, 3);
check('推荐返回 Top 3', recs.length === 3, `实际 ${recs.length}`);
check('推荐分数在 0–100 且降序', recs.every((r) => r.score > 0 && r.score <= 100) && recs[0].score >= recs[1].score,
  recs.map((r) => `${r.destination.name}:${r.score}`).join(' '));
check('每个分数都有可解释因子', recs.every((r) => r.factors.length >= 5),
  `${recs[0]?.factors.length} 个因子`);
check('负向偏好被考虑（避开早起/暴走）', recs.every((r) => r.factors.some((f) => f.key === 'dislike')),
  recs[0]?.factors.find((f) => f.key === 'dislike')?.note ?? '');

const type = travelType(answers);
check('旅行类型可解析', !!type.name && type.metrics.planning >= 0, `${type.emoji} ${type.name}`);

// 负向偏好与节奏真的会改变排序和分值
const relaxed = recommend({ ...answers, destinationScope: 'any' }, 10, 6);
const intense = recommend(
  { ...answers, destinationScope: 'any', pace: 'intense', dislikes: [], interests: ['themePark', 'shopping', 'photo', 'nightlife'] },
  10,
  6,
);
const seqOf = (l: typeof relaxed) => l.map((r) => r.destination.id).join('>');
const scoreDiff = relaxed.some((r) => {
  const hit = intense.find((x) => x.destination.id === r.destination.id);
  return hit ? Math.abs(hit.score - r.score) >= 3 : true;
});
check('偏好变化会改变排序', seqOf(relaxed) !== seqOf(intense),
  `松弛版=${relaxed.slice(0, 3).map((r) => r.destination.name).join('>')} / 特种兵版=${intense.slice(0, 3).map((r) => r.destination.name).join('>')}`);
check('偏好变化会改变分值', scoreDiff,
  `杭州 ${relaxed[0].score} → ${intense.find((r) => r.destination.id === relaxed[0].destination.id)?.score ?? '—'}`);

// ── 2. 方案生成 ─────────────────────────────────────────────
const seed = buildSeed();
const db: DB = {
  trips: seed.trips,
  days: seed.days,
  activities: seed.activities,
  bookings: seed.bookings,
  expenses: seed.expenses,
  checklists: [],
  files: seed.files,
  journals: seed.journals,
  proposals: [],
  savedPlaces: {},
};

const tokyo = db.trips.find((t) => t.id === 'trip-tokyo')!;
const tokyoDays = db.days.filter((d) => d.tripId === tokyo.id).sort((a, b) => a.index - b.index);
const tokyoPlaces = getPlaces(tokyo.destinationId);

check('种子数据：3 次旅行', db.trips.length === 3, db.trips.map((t) => t.title).join('、'));
check('种子数据：东京 6 天', tokyoDays.length === 6, `${tokyoDays.length} 天`);
check('地点池非空', tokyoPlaces.length > 5, `${tokyoPlaces.length} 个地点`);

const ranked = rankPlaces(tokyoPlaces, tokyo);
check('地点会按偏好排序', ranked.length === tokyoPlaces.length && ranked[0].id !== ranked[ranked.length - 1].id,
  `首选 ${ranked[0].name}`);

const plan = generatePlan(tokyo, tokyoDays, tokyoPlaces);
check('方案覆盖每一天', plan.length === tokyoDays.length, `${plan.length} 天`);
check('首末日强度较低（抵达/回程减负）',
  plan[0].intensity !== 'high' && plan[plan.length - 1].intensity !== 'high',
  `首日=${plan[0].intensity} 末日=${plan[plan.length - 1].intensity}`);
check('方案包含具体安排', plan.some((d) => d.specs.length > 0),
  `共 ${plan.reduce((s, d) => s + d.specs.length, 0)} 项`);

// ── 3. Travel Intelligence ──────────────────────────────────
const placeOf = (id?: string) => (id ? tokyoPlaces.find((p) => p.id === id) : undefined);
const conflicts = detectConflicts({
  trip: tokyo,
  days: tokyoDays,
  activities: db.activities,
  bookings: db.bookings,
  expenses: db.expenses,
  files: db.files,
  checklists: [],
  placeOf,
  weather: [],
});
check('冲突检测产出结果', Array.isArray(conflicts), `${conflicts.length} 项：${conflicts[0]?.message ?? '无'}`);

const prep = preparationOf(tokyo, tokyoDays, db.activities, db.bookings, [], db.files);
check('准备度 0–100', prep.score >= 0 && prep.score <= 100, `${prep.score}% · 待处理 ${prep.todo.length} 项`);

const d3 = tokyoDays[2];
const inten = computeDayIntensity(db.activities.filter((a) => a.dayId === d3.id), placeOf);
check('每日强度可计算', inten.score > 0, `${d3.title}=${inten.level}(${inten.score})`);

// ── 4. AI Action Layer：生成 → 校验 → 预览 → 确认 ────────────
const ctx = buildContext(db, tokyo.id);
check('AI 能读取旅行上下文', !!ctx && ctx.activities.length > 0, `${ctx?.activities.length} 个安排`);

const gen = runAI(db, tokyo.id, '帮我规划这次行程');
check('帮我规划 → 产出提案', !!gen.proposal, gen.reply.slice(0, 40));
check('提案必须用户确认才会落库', db.activities.length === seed.activities.length,
  `提案 ${gen.proposal?.actions.length} 个 action，数据库未变`);
if (gen.proposal) {
  const after = applyActions(db, gen.proposal.actions);
  check('应用后行程发生变化', after.activities.length !== db.activities.length || after.activities.some((a, i) => a.startTime !== db.activities[i]?.startTime),
    `${db.activities.length} → ${after.activities.length}`);
}

const tired = runAI(db, tokyo.id, '太累了');
check('「太累了」→ 产出降密度提案', !!tired.proposal || tired.reply.length > 0,
  tired.proposal ? `${tired.proposal.changes.length} 条变化说明` : tired.reply.slice(0, 40));

const budgetCut = runAI(db, tokyo.id, '我预算只有 7000');
check('「我预算只有 7000」→ 命中预算意图', !!budgetCut.proposal || budgetCut.reply.length > 0,
  budgetCut.proposal?.title ?? budgetCut.reply.slice(0, 40));

const late = runAI(db, tokyo.id, '我睡过头了，11点才出门');
check('「睡过头」→ 命中重排意图', !!late.proposal || late.reply.length > 0,
  late.proposal?.title ?? late.reply.slice(0, 40));

const rain = runAI(db, tokyo.id, '今天下雨');
check('「今天下雨」→ 命中天气意图', !!rain.proposal || rain.reply.length > 0,
  rain.proposal?.title ?? rain.reply.slice(0, 40));

// 高危删除类操作不能悄悄执行
const before = db.activities.length;
const _unused = runAI(db, tokyo.id, '随便说点不相关的话');
check('无关输入不会改动数据', db.activities.length === before, `${before} 项保持不变`);

// ── 5. 清单自动生成 ──────────────────────────────────────────
const lists = ensureTripChecklists(tokyo, [], db.bookings, db.files);
const items = lists.flatMap((c) => c.items);
check('清单按 Trip 自动生成', items.length > 5, `${items.length} 项 · ${lists.map((c) => c.title).join('/')}`);
check('清单分出发前/旅行中/回程后', lists.length === 3, `${lists.length} 组`);

// ── 6. Store 链路：创建 Trip → 排地点 → 应用 AI 提案 ──────────
const { useStore } = await import('@/services/store');
const store = useStore.getState();

const trip = store.createTrip({
  // 多城市改造后 NewTripInput 用 destinationIds（有序 = 走法顺序）
  destinationIds: ['chengdu'],
  startDate: '2026-11-10',
  endDate: '2026-11-14',
  totalBudget: 5000,
  planningPreference: 'delegator',
  profile: {
    travelMood: 'change',
    pace: 'balanced',
    companions: 'friends',
    interests: ['food', 'citywalk', 'coffee'],
    dislikes: ['earlyRise'],
    origin: '上海',
    durationDays: 5,
  },
});
check('创建 Trip 会生成 Day', useStore.getState().db.days.filter((d) => d.tripId === trip.id).length === 5);
check('创建 Trip 会生成预算骨架', useStore.getState().db.expenses.filter((e) => e.tripId === trip.id).length > 0,
  `${useStore.getState().db.expenses.filter((e) => e.tripId === trip.id).length} 笔`);
check('创建 Trip 会生成清单', useStore.getState().db.checklists.filter((c) => c.tripId === trip.id).length === 3);

const newDays = useStore.getState().db.days.filter((d) => d.tripId === trip.id).sort((a, b) => a.index - b.index);
const firstPlace = getPlaces('chengdu')[0];
useStore.getState().schedulePlace(newDays[0].id, firstPlace.id);
check('地点可排入某一天', useStore.getState().db.activities.some((a) => a.dayId === newDays[0].id && a.placeId === firstPlace.id),
  `${firstPlace.name} → D1`);

const movedAct = useStore.getState().db.activities.find((a) => a.dayId === newDays[0].id)!;
useStore.getState().moveActivity(movedAct.id, newDays[1].id, 0);
check('活动可在天之间移动', useStore.getState().db.activities.find((a) => a.id === movedAct.id)?.dayId === newDays[1].id);

const planRes = runAI(useStore.getState().db, trip.id, '帮我规划这次行程');
if (planRes.proposal) {
  useStore.getState().addProposal(planRes.proposal);
  const applied = useStore.getState().applyProposal(planRes.proposal.id);
  const afterActs = useStore.getState().db.activities.filter((a) => a.tripId === trip.id);
  check('确认后提案才落库', applied > 0 && afterActs.length > 1, `${applied} 个 action · ${afterActs.length} 项安排`);
  check('提案状态变为 applied', useStore.getState().db.proposals.find((p) => p.id === planRes.proposal!.id)?.status === 'applied');
} else {
  check('确认后提案才落库', false, '没有产出提案');
}

const before2 = useStore.getState().db.activities.length;
const rej = runAI(useStore.getState().db, trip.id, '太累了');
if (rej.proposal) {
  useStore.getState().addProposal(rej.proposal);
  useStore.getState().rejectProposal(rej.proposal.id);
  check('拒绝提案不会改动行程', useStore.getState().db.activities.length === before2,
    `${before2} 项保持不变`);
} else {
  check('拒绝提案不会改动行程', true, '本次无提案，数据未变');
}

useStore.getState().regenerateDays(trip.id, '2026-11-10', '2026-11-12');
check('改日期会重排 Day', useStore.getState().db.days.filter((d) => d.tripId === trip.id).length === 3);

useStore.getState().deleteTrip(trip.id);
check('删除 Trip 会级联清理', useStore.getState().db.activities.filter((a) => a.tripId === trip.id).length === 0);

// ── 7. LLM 分支：接入后能用，挂了能退 ────────────────────────
const realFetch = globalThis.fetch;

type Stub = { enabled: boolean; chatContent: string | null; throwOnChat?: boolean };
const calls = { total: 0, chat: 0 };
function stubNetwork(cfg: Stub) {
  calls.total = 0;
  calls.chat = 0;
  globalThis.fetch = (async (input: any, init?: any) => {
    calls.total += 1;
    const url = String(input?.url ?? input ?? '');
    if (url.includes('/api/ai/status')) {
      return {
        ok: true,
        json: async () => ({
          enabled: cfg.enabled,
          provider: cfg.enabled ? 'deepseek' : null,
          model: cfg.enabled ? 'deepseek-chat' : null,
          reason: cfg.enabled ? null : '未配置',
        }),
      } as unknown as Response;
    }
    if (url.includes('/api/ai/chat')) {
      calls.chat += 1;
      if (cfg.throwOnChat) throw new Error('network down');
      if (cfg.chatContent === null) {
        return { ok: false, json: async () => ({ ok: false, error: 'AI not configured' }) } as unknown as Response;
      }
      const body = JSON.parse(String(init?.body ?? '{}'));
      const isPolish = JSON.stringify(body.messages).includes('原始改动');
      const content = isPolish
        ? JSON.stringify({ changes: ['把第二天下午空出来，你可以坐久一点'], impact: ['强度从高降到中'] })
        : cfg.chatContent;
      return { ok: true, json: async () => ({ ok: true, content }) } as unknown as Response;
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

// 7a. 默认不调用：不传 useLLM 时一次网络请求都不能有
stubNetwork({ enabled: true, chatContent: '{"intent":"lessTired","reply":null}' });
resetLLMStatusCache();
const off = await runAIAsync(db, tokyo.id, '我妈腿不好，走不动太多路');
check('默认零网络请求（按需调用）', calls.total === 0 && off.source === 'local',
  `fetch 次数=${calls.total} · source=${off.source}`);

// 7b. 用户开启后，本地认不出来才交给模型
calls.total = 0;
resetLLMStatusCache();
// 这段话不会命中任何一个本地意图正则 -> 走 LLM 接管派Intent
const llmHit = await runAIAsync(db, tokyo.id, '帮我把周三的节奏放缓一些，不想太赶', undefined, true);
check('开启后：正则认不出时模型接管', !!llmHit.proposal && llmHit.source === 'llm',
  `source=${llmHit.source} · ${llmHit.proposal?.title ?? llmHit.reply.slice(0, 20)}`);
check('模型命中后仍是待确认提案', llmHit.proposal?.status === 'pending' && db.activities.length === seed.activities.length,
  `${llmHit.proposal?.actions.length} 个 action，未落库`);

// 7b-2. Q&A 模式: 本地认不出 + LLM 识别为「问答」 -> 只返文本
calls.total = 0;
resetLLMStatusCache();
// 用专门的 Q&A stub: 整段对话都让 LLM 回答 Q&A
const qaStub = (..._) => {
  // 不管问什么都返 Q&A 文本
  return stubNetwork({ enabled: true, chatContent: JSON.stringify({ mode: 'qa', reply: '日本建议 5~7 天, 3 天只能挑一两个区域' }) });
};
qaStub();
const qa = await runAIAsync(db, tokyo.id, '去日本需要几天', undefined, true);
check('自由问答模式: 不出方案, 直接给文本回答', !!qa.reply && !qa.proposal && qa.source === 'llm',
  `source=${qa.source} · reply=${qa.reply.slice(0, 28)}…`);

// 7c. 本地认得出的句子：只润色，不多问一次意图
calls.total = 0;
calls.chat = 0;
resetLLMStatusCache();
const known = await runAIAsync(db, tokyo.id, '太累了', undefined, true);
check('本地能认出时只对模型请求一次（润色）', calls.chat === 1 && known.source === 'llm',
  `模型请求=${calls.chat} 次（另有 ${calls.total - calls.chat} 次状态查询，有缓存）`);

// 7d. 未接入 → 与同步版完全一致，且不发请求
stubNetwork({ enabled: false, chatContent: null });
resetLLMStatusCache();
const llmOff = await runAIAsync(db, tokyo.id, '太累了', undefined, true);
const localOnly = runAI(db, tokyo.id, '太累了');
check('未接入时静默回退本地', llmOff.source === 'local' && llmOff.reply === localOnly.reply,
  `source=${llmOff.source}`);

// 7e. 网络异常 → 不能抛，必须降级
stubNetwork({ enabled: true, chatContent: '{"intent":"lessTired","reply":null}', throwOnChat: true });
resetLLMStatusCache();
let survived = true;
let broken: AIResult | null = null;
try {
  broken = await runAIAsync(db, tokyo.id, '随便说点正则认不出来的话', undefined, true);
} catch {
  survived = false;
}
check('模型请求异常时不崩溃', survived, broken ? `回退 source=${broken.source}` : '');

// 7f. 模型返回垃圾 JSON → 不能污染数据
stubNetwork({ enabled: true, chatContent: '```json 这不是 JSON' });
resetLLMStatusCache();
const junk = await runAIAsync(db, tokyo.id, '帮我安排一个不存在的星球', undefined, true);
check('非法 JSON 时安全降级', !!junk.reply && db.activities.length === seed.activities.length,
  `reply=${junk.reply.slice(0, 18)}…`);

// 7g. 模型给出的意图不在白名单 → 丢弃
stubNetwork({ enabled: true, chatContent: '{"intent":"deleteEverything","reply":"好的"}' });
resetLLMStatusCache();
const rogue = await runAIAsync(db, tokyo.id, '把这次旅行全删了', undefined, true);
check('越权意图被白名单拦截', !rogue.proposal && db.activities.length === seed.activities.length,
  `reply=${rogue.reply.slice(0, 20)}…`);

globalThis.fetch = realFetch;
resetLLMStatusCache();

// ── 8. 交通成本淡旺季 ────────────────────────────────────────
const hangzhou = getDestination('hangzhou')!;
const tokyoDest = getDestination('tokyo')!;
const oct1 = transportEstimate('上海', tokyoDest, '2026-10-01');
const mar15 = transportEstimate('上海', tokyoDest, '2026-03-15');
check('国庆机票显著高于淡季', oct1.cost > mar15.cost * 1.5,
  `国庆 ${money(oct1.cost)} / 3月 ${money(mar15.cost)}`);
check('淡旺季系数可解释', oct1.season.label === '国庆' && mar15.season.label === '淡季',
  `${oct1.season.label} ×${oct1.season.multiplier} / ${mar15.season.label} ×${mar15.season.multiplier}`);
check('保留原价用于对比', oct1.baseCost < oct1.cost,
  `原价 ${money(oct1.baseCost)} → 现价 ${money(oct1.cost)}`);

const trainOct = transportEstimate('上海', hangzhou, '2026-10-01');
const trainMar = transportEstimate('上海', hangzhou, '2026-03-15');
check('高铁受淡旺季影响远小于机票',
  (trainOct.cost - trainMar.cost) / trainMar.cost < (oct1.cost - mar15.cost) / mar15.cost,
  `高铁 ${money(trainMar.cost)}→${money(trainOct.cost)} · 机票 ${money(mar15.cost)}→${money(oct1.cost)}`);
check('往返成本是单程两倍', oct1.roundTripCost === oct1.cost * 2,
  `${money(oct1.cost)} × 2 = ${money(oct1.roundTripCost)}`);

// ── 输出 ────────────────────────────────────────────────────
let failed = 0;
for (const r of results) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  · ${r.detail}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} checks ok`);
process.exit(failed ? 1 : 0);
