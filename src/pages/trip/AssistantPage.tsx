import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useCurrentTripId, useTripContext } from '@/hooks/useTrip';
import { useStore } from '@/services/store';
import { PageHeader } from '@/components/layout';
import { AIPanel } from '@/features/ai/AIPanel';
import { ProposalPanel } from '@/components/travel/ProposalPanel';
import { Button, Card, EmptyState, Tag, cx, toast } from '@/components/ui';

export function AssistantPage() {
  const { tripId: paramTripId } = useParams();
  const fallbackTripId = useCurrentTripId();
  const tripId = paramTripId ?? fallbackTripId ?? '';
  const ctx = useTripContext(tripId);
  const db = useStore((s) => s.db);
  const applyProposal = useStore((s) => s.applyProposal);
  const rejectProposal = useStore((s) => s.rejectProposal);
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'chat' | 'history'>('chat');

  const q = params.get('q') ?? '';

  const proposals = useMemo(
    () => db.proposals.filter((p) => !tripId || p.tripId === tripId),
    [db.proposals, tripId],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        back={!paramTripId}
        title="AI 助手"
        subtitle="它能读你的行程、算冲突、给方案，但任何写入都要你点过「应用修改」。"
        action={
          <div className="flex gap-1 rounded-xl border-[1.5px] border-ink bg-white p-1">
            {(['chat', 'history'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cx(
                  'focus-ring rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition',
                  tab === t ? 'bg-ink text-white' : 'text-inkSoft hover:bg-paperDeep',
                )}
              >
                {t === 'chat' ? '对话' : `提案 ${proposals.length}`}
              </button>
            ))}
          </div>
        }
      />

      {!tripId ? (
        <EmptyState
          emoji="✨"
          title="还没有可操作的旅行"
          desc="先创建一次旅行，AI 才知道要读什么、改什么。"
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className={cx('overflow-hidden', tab === 'history' && 'hidden lg:block')}>
            <div className="h-[60vh] p-3">
              <AIPanel
                tripId={tripId}
                initialText={q}
                autoSend={!!q}
                placeholder="比如：太累了 / 今天下雨 / 我预算只有 7000"
              />
            </div>
          </Card>

          <div className="space-y-4">
            {ctx && (
              <Card className="p-4">
                <p className="h3 mb-2">现在最需要处理什么</p>
                {ctx.conflicts.length ? (
                  <ul className="space-y-1.5">
                    {ctx.conflicts.slice(0, 4).map((c) => (
                      <li key={c.id} className="text-[12.5px] leading-relaxed">
                        <span
                          className={cx(
                            'mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle',
                            c.level === 'error' ? 'bg-rose' : c.level === 'warn' ? 'bg-amber' : 'bg-azure',
                          )}
                        />
                        {c.message}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">暂时没有冲突。可以说一句「帮我规划」先要一版方案。</p>
                )}
                <p className="mt-2 text-[11.5px] text-inkFaint">
                  准备度 {ctx.preparation.score}% · 预算已用{' '}
                  {ctx.budget.total ? Math.round((ctx.budget.forecast / ctx.budget.total) * 100) : 0}%
                </p>
              </Card>
            )}

            <Card className="p-4">
              <p className="h3 mb-2">可以直接说的话</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  '帮我规划',
                  '太累了',
                  '我不想早起',
                  '我想多逛街',
                  '我一定要去迪士尼',
                  '我预算只有 7000',
                  '今天下雨',
                  '我睡过头了，11点才出门',
                  '我还漏了什么？',
                ].map((s) => (
                  <Tag key={s} tone="gray">
                    {s}
                  </Tag>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-3">
          {proposals.length === 0 ? (
            <EmptyState emoji="📋" title="还没有提案记录" desc="AI 给出的每一版改动都会留在这里。" />
          ) : (
            proposals.map((p) => (
              <ProposalPanel
                key={p.id}
                proposal={p}
                showActions={p.status === 'pending'}
                onApply={() => {
                  const n = applyProposal(p.id);
                  toast(n ? `已应用 ${n} 个改动` : '没有可应用的改动', n ? 'good' : 'warn');
                }}
                onReject={() => rejectProposal(p.id)}
              />
            ))
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="lg:hidden">
          <Button block onClick={() => setTab('chat')}>
            回到对话
          </Button>
        </div>
      )}
    </div>
  );
}
