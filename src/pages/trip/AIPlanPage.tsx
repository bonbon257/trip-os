import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTripContext } from '@/hooks/useTrip';
import { useStore } from '@/services/store';
import { runAIAsync } from '@/ai/orchestrator';
import { generatePlan, getCandidatePool } from '@/ai/planningEngine';
import { ensureCandidatePool } from '@/services/poiSource';
import { llmGeneratePlan, llmStatus } from '@/services/llm';
import { uid } from '@/utils/id';
import { PageHeader } from '@/components/layout';
import { ProposalPanel } from '@/components/travel/ProposalPanel';
import { IntensityBadge } from '@/components/travel/TripBits';
import { AIPanel } from '@/features/ai/AIPanel';
import { AIToggle, useAIFlag } from '@/features/ai/AIToggle';
import { Button, Card, EmptyState, Modal, Segmented, Tag, cx, toast } from '@/components/ui';
import { fmtMDWeek } from '@/utils/date';
import { ACTIVITY_LABEL, money } from '@/utils/format';
import type { AIAction, AIProposal, Pace } from '@/types';

const PACE_OPTIONS: { value: Pace; label: string; desc: string }[] = [
  { value: 'focused', label: '松弛一点', desc: '每天 1–2 个重点，其余留白' },
  { value: 'balanced', label: '正常节奏', desc: '每天 3–4 个地点，不赶也不空' },
  { value: 'intense', label: '多玩一点', desc: '一天塞满，值回票价' },
  { value: 'free', label: '你帮我决定', desc: '按我的画像判断' },
];

const QUICK_COMMANDS = [
  '太累了，少排一点',
  '我不想早起',
  '我想多逛街',
  '我一定要去迪士尼',
  '我预算只有 7000',
  '帮我优化预算',
  '我还漏了什么？',
];

export function AIPlanPage() {
  const { tripId = '' } = useParams();
  const navigate = useNavigate();
  const ctx = useTripContext(tripId);
  const updateTrip = useStore((s) => s.updateTrip);
  const addProposal = useStore((s) => s.addProposal);
  const applyProposal = useStore((s) => s.applyProposal);
  const rejectProposal = useStore((s) => s.rejectProposal);
  const deleteTrip = useStore((s) => s.deleteTrip);
  const useLLM = useAIFlag();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [proposal, setProposal] = useState<AIProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'generate' | 'chat'>('generate');

  const plan = useMemo(() => {
    if (!ctx) return [];
    return generatePlan(ctx.trip, ctx.days, ctx.places);
  }, [ctx]);

  if (!ctx) return null;
  const { trip, days, places } = ctx;

  const estimated = plan.reduce(
    (sum, d) => sum + d.specs.reduce((s, x) => s + (x.estimatedCost ?? 0), 0),
    0,
  );

  const ask = async (text: string) => {
    setBusy(true);
    await ensureCandidatePool(tripId).catch(() => null);
    const res = await runAIAsync(useStore.getState().db, tripId, text, undefined, useLLM).catch(() => null);
    setBusy(false);
    if (!res?.proposal) {
      toast(res?.reply || '这次没有需要改的地方', 'warn');
      return;
    }
    addProposal(res.proposal);
    setProposal(res.proposal);
  };

  /** 一键应用当前预排方案（规则版），应用后跳转到行程页 */
  const applyLocalPlan = async () => {
    if (!plan.length) return;
    setBusy(true);
    try {
      // 规划前先确保候选池有足够真实地点（无手工 CURATED 的目的地从高德补充）
      await ensureCandidatePool(tripId).catch(() => null);
      const dbNow = useStore.getState().db;
      const tripNow = dbNow.trips.find((t) => t.id === tripId);
      if (!tripNow) return;
      const poolNow = getCandidatePool(dbNow, tripNow);
      if (poolNow.length === 0) {
        toast('这个目的地还没有真实地点可排，先去搜索或添加几个地点吧', 'warn');
        return;
      }
      const planNow = generatePlan(tripNow, days, poolNow);
      if (!planNow.length) return;
      const totalSpecs = planNow.reduce((s, d) => s + d.specs.filter((x) => x.type !== 'transport').length, 0);
      const estCost = planNow.reduce((s, d) => s + d.specs.reduce((x, sp) => x + (sp.estimatedCost ?? 0), 0), 0);
      const proposal: AIProposal = {
        id: uid('prop'),
        tripId,
        intent: '应用 AI 预排方案',
        title: `${trip.destinationName} ${planNow.length} 天 · 规则预排`,
        changes: planNow.map((p, i) => `Day ${i + 1} · ${p.title}（${p.specs.length} 项）`),
        impact: [
          `共安排 ${totalSpecs} 个活动，覆盖 ${planNow.length} 天`,
          `预计活动花费约 ${money(estCost)}`,
        ],
        actions: [
          {
            id: uid('a'),
            name: 'generateTripPlan',
            params: {
              tripId,
              days: planNow.map((p) => ({ dayId: p.dayId, title: p.title, specs: p.specs })),
            },
            risk: 'high',
            summary: `重建 ${planNow.length} 天行程`,
          },
        ],
        diff: planNow.flatMap((d, i) =>
          d.specs.map((s) => ({
            kind: 'add' as const,
            label: `Day ${i + 1} ${s.startTime} ${s.title}`,
            after: `${s.durationMin} 分钟${s.estimatedCost ? ` · ${money(s.estimatedCost)}` : ''}`,
          })),
        ),
        createdAt: new Date().toISOString(),
        status: 'pending',
      };
      addProposal(proposal);
      applyProposal(proposal.id);
      toast(`已应用 ${planNow.length} 天方案`, 'good');
      navigate(`/trips/${tripId}/itinerary`);
    } finally {
      setBusy(false);
    }
  };

  const setPace = (p: Pace) => {
    const nextPace: Pace = p === 'free' ? (trip.profile.pace === 'free' ? 'balanced' : trip.profile.pace) : p;
    updateTrip(tripId, { profile: { ...trip.profile, pace: nextPace } });
    toast(p === 'free' ? '按你的画像来判断节奏' : `节奏已设为「${PACE_OPTIONS.find((o) => o.value === p)?.label}」`, 'good');
  };

  /**
   * 生成完整方案 —— 用户点按钮才调后端 LLM（不浪费 token）。
   * LLM 不可用 / 失败时回退本地规则并提示。
   */
  const generateFull = async () => {
    setBusy(true);
    try {
      // 规划前先确保候选池有足够真实地点（无手工 CURATED 的目的地从高德补充）
      await ensureCandidatePool(tripId).catch(() => null);
      const dbNow = useStore.getState().db;
      const tripNow = dbNow.trips.find((t) => t.id === tripId);
      if (!tripNow) return;
      const poolNow = getCandidatePool(dbNow, tripNow);
      if (poolNow.length === 0) {
        toast('这个目的地还没有真实地点可排，先去搜索或添加地点，或配置高德 Key 自动拉取', 'warn');
        return;
      }

      const status = await llmStatus();
      if (!status.enabled) {
        toast('AI Key 未配置，先用本地规则排了一版（去 设置→服务 配置后可用模型）', 'warn');
        await ask('帮我规划这次行程');
        return;
      }

      const plan = await llmGeneratePlan({
        tripId,
        destinationName: tripNow.destinationName,
        days: days.map((d) => ({ id: d.id, index: d.index, date: d.date, title: d.title })),
        places: poolNow.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          durationMin: p.durationMin,
          avgCost: p.avgCost,
          tags: p.tags,
          fullDay: p.fullDay,
          indoor: p.indoor,
          requiredBooking: p.requiredBooking,
          emoji: p.emoji,
        })),
        profile: {
          pace: tripNow.profile.pace,
          interests: tripNow.profile.interests,
          dislikes: tripNow.profile.dislikes,
          origin: tripNow.profile.origin,
          companions: tripNow.profile.companions,
        },
        totalBudget: tripNow.totalBudget,
      });

      if (!plan || plan.length === 0) {
        toast('模型生成失败，已回退本地规则', 'warn');
        await ask('帮我规划这次行程');
        return;
      }

      const totalSpecs = plan.reduce((s, d) => s + d.specs.filter((x) => x.type !== 'transport').length, 0);
      const estCost = plan.reduce((s, d) => s + d.specs.reduce((x, sp) => x + (sp.estimatedCost ?? 0), 0), 0);
      const actions: AIAction[] = [
        {
          id: uid('a'),
          name: 'generateTripPlan',
          params: {
            tripId,
            days: plan.map((p) => ({ dayId: p.dayId, title: p.title, specs: p.specs })),
          },
          risk: 'high',
          summary: `重建 ${plan.length} 天行程`,
        },
      ];
      const proposal: AIProposal = {
        id: uid('prop'),
        tripId,
        intent: '生成完整方案（AI 模型）',
        title: `${trip.destinationName} ${plan.length} 天 · 模型精排`,
        changes: plan.map((p, i) => `Day ${i + 1} · ${p.title}（${p.specs.length} 项）`),
        impact: [
          `模型共安排 ${totalSpecs} 个活动，覆盖 ${plan.length} 天`,
          `预计活动花费约 ${money(estCost)}`,
          '仍需你点「应用」才会写入行程',
        ],
        actions,
        diff: plan.flatMap((d, i) =>
          d.specs.map((s) => ({
            kind: 'add' as const,
            label: `Day ${i + 1} ${s.startTime} ${s.title}`,
            after: `${s.durationMin} 分钟${s.estimatedCost ? ` · ${money(s.estimatedCost)}` : ''}`,
          })),
        ),
        createdAt: new Date().toISOString(),
        status: 'pending',
      };
      addProposal(proposal);
      setProposal(proposal);
      toast('模型方案已生成，确认后应用', 'good');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="AI 规划"
        subtitle="你说一句话，剩下的交给它。所有修改都要你点过「应用」才会写入。"
        action={
          <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
            🗑 删除这趟
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="h3">这次你想怎么玩？</p>
                <p className="muted mt-0.5">选一个，我再按这个节奏排 {days.length} 天。</p>
              </div>
              <AIToggle />
            </div>
            <Segmented
              className="mt-3"
              value={PACE_OPTIONS.some((o) => o.value === trip.profile.pace) ? trip.profile.pace : 'free'}
              options={PACE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              onChange={setPace}
            />
            <p className="mt-2 text-[11.5px] text-inkFaint">
              {PACE_OPTIONS.find((o) => o.value === trip.profile.pace)?.desc ??
                '还没选，让 AI 按你的画像判断'}
            </p>
          </Card>

          {plan.length === 0 ? (
            <EmptyState
              emoji="✨"
              title="先加几天行程"
              desc="AI 需要知道这次有几天，才能排。"
              actions={<Button onClick={() => navigate(`/trips/${tripId}/itinerary`)}>去行程页</Button>}
            />
          ) : (
            <Card className="overflow-hidden">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b-[1.5px] border-ink/10 bg-violet/8 px-4 py-3">
                <div>
                  <p className="h3">AI 会按这个思路排</p>
                  <p className="muted mt-0.5">
                    {days.length} 天 · 预计活动花费 {money(estimated)} · 地点池 {places.length} 个
                  </p>
                  <p className="mt-1 text-[11px] text-inkFaint">
                    上面是按规则预排的预览（不消耗 token）；点「生成完整方案」才会调用 AI 精排，只在你点的时候计费。
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {busy && <span className="text-[11.5px] text-inkFaint">模型正在排…</span>}
                  <Button
                    variant="primary"
                    disabled={busy}
                    onClick={() => void generateFull()}
                  >
                    {busy ? '排中…' : '生成完整方案'}
                  </Button>
                  <Button
                    variant="soft"
                    disabled={busy}
                    onClick={applyLocalPlan}
                    title="直接应用当前规则预排，并跳转到行程页"
                  >
                    应用
                  </Button>
                </div>
              </header>

              <ol className="divide-y divide-ink/8">
                {plan.map((d, i) => (
                  <li key={d.dayId} className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border-[1.5px] border-ink/15 bg-white text-[11px] font-extrabold">
                        {i + 1}
                      </span>
                      <p className="text-[14px] font-extrabold">{d.title}</p>
                      <IntensityBadge level={d.intensity} />
                    </div>
                    <div className="mt-2 space-y-1 pl-8">
                      {d.specs.map((s, j) => (
                        <div key={j} className="flex items-start gap-2 text-[12.5px]">
                          <span className="w-[42px] shrink-0 tabular-nums text-inkFaint">{s.startTime}</span>
                          <span className="min-w-0 flex-1">
                            <span className="font-semibold">{s.title}</span>
                            <span className="ml-1.5 text-[11px] text-inkFaint">
                              {s.type ? ACTIVITY_LABEL[s.type] : ''}
                              {s.estimatedCost ? ` · ${money(s.estimatedCost)}` : ''}
                            </span>
                          </span>
                        </div>
                      ))}
                      {!d.specs.length && <p className="text-[12px] text-inkFaint">这天还没有可排的真实地点</p>}
                    </div>
                  </li>
                ))}
              </ol>

              <footer className="flex flex-wrap items-center gap-2 border-t-[1.5px] border-ink/10 px-4 py-3">
                <Button size="sm" onClick={() => ask('重新生成')}>
                  重新生成一版
                </Button>
                <Button size="sm" variant="ghost" onClick={() => navigate(`/trips/${tripId}/itinerary`)}>
                  我想自己改细节
                </Button>
                <span className="ml-auto text-[11px] text-inkFaint">生成后仍然不会直接改动你的数据</span>
              </footer>
            </Card>
          )}

          {proposal && (
            <ProposalPanel
              proposal={proposal}
              onApply={() => {
                const n = applyProposal(proposal.id);
                toast(`已应用 ${n} 项修改`, 'good');
                setProposal(null);
              }}
              onReject={() => {
                rejectProposal(proposal.id);
                setProposal(null);
              }}
            />
          )}

          {/* 一句话修改 */}
          <Card className="p-4">
            <p className="h3">一句话修改</p>
            <p className="muted mt-0.5">不用填表，直接说。</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_COMMANDS.map((c) => (
                <button
                  key={c}
                  disabled={busy}
                  onClick={() => ask(c)}
                  className={cx(
                    'focus-ring rounded-full border-[1.5px] border-ink/15 bg-white px-3 py-1.5 text-[12.5px] font-semibold transition',
                    'hover:border-ink hover:bg-paperDeep disabled:opacity-40',
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="h3">AI 助手</p>
              <div className="flex gap-1">
                {(['generate', 'chat'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={cx(
                      'focus-ring rounded-lg px-2 py-1 text-[11.5px] font-bold',
                      tab === t ? 'bg-ink text-white' : 'text-inkSoft hover:bg-paperDeep',
                    )}
                  >
                    {t === 'generate' ? '方案' : '对话'}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-[460px]">
              <AIPanel tripId={tripId} placeholder="比如：太累了 / 我预算只有 7000" />
            </div>
            {tab === 'chat' && (
              <p className="mt-2 text-[11px] text-inkFaint">
                旅行结束后所有方案会保留在提案记录里，可随时回看。
              </p>
            )}
          </Card>

          <Card className="p-4">
            <p className="h3 mb-2">这次的画像</p>
            <div className="flex flex-wrap gap-1.5">
              <Tag tone="violet">{PACE_TEXT[trip.profile.pace]}</Tag>
              {trip.profile.interests.slice(0, 5).map((i) => (
                <Tag key={i} tone="moss">
                  {i}
                </Tag>
              ))}
              {trip.profile.dislikes.slice(0, 3).map((d) => (
                <Tag key={d} tone="rose">
                  不{d}
                </Tag>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] text-inkFaint">
              AI 会优先避开你不想做的事，并保留足够自由时间。
            </p>
          </Card>

          <Card className="p-4">
            <p className="h3 mb-2">天数概览</p>
            <div className="space-y-1">
              {days.map((d) => (
                <div key={d.id} className="flex items-center justify-between text-[12.5px]">
                  <span className="font-semibold">
                    D{d.index} · {d.title}
                  </span>
                  <span className="text-inkFaint">{fmtMDWeek(d.date)}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] text-inkFaint">
              已收录 {places.length} 个地点 · 当前安排 {ctx.activities.filter((a) => a.placeId).length} 个
            </p>
          </Card>
        </div>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="删除这趟旅行？"
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>取消</Button>
            <Button
              variant="danger"
              onClick={() => {
                deleteTrip(tripId);
                toast('旅行已删除', 'good');
                navigate('/');
              }}
            >
              删除
            </Button>
          </>
        }
      >
        <p className="muted">删除后行程、预算、清单、预订等所有关联数据都会被清空，无法恢复。</p>
        <p className="mt-2 text-[12px] text-inkFaint">
          {trip.title} · {trip.destinationName} · {days.length} 天
        </p>
      </Modal>
    </div>
  );
}

const PACE_TEXT: Record<string, string> = {
  intense: '特种兵',
  balanced: '正常节奏',
  focused: '松弛一点',
  free: '完全随缘',
};
