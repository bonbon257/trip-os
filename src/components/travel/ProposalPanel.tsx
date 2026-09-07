import type { AIProposal } from '@/types';
import { Button, Card, Tag, cx } from '@/components/ui';

const RISK_LABEL: Record<string, { text: string; tone: 'gray' | 'amber' | 'rose' }> = {
  low: { text: '低风险', tone: 'gray' },
  medium: { text: '需留意', tone: 'amber' },
  high: { text: '需确认', tone: 'rose' },
};

const KIND_STYLE: Record<string, string> = {
  add: 'bg-moss/15 text-moss',
  remove: 'bg-rose/12 text-rose',
  update: 'bg-azure/15 text-azure',
};

const KIND_TEXT: Record<string, string> = { add: '新增', remove: '移除', update: '调整' };

/**
 * AI 输出不是一段文字：必须给出「变化说明 / 新方案 / 影响」，
 * 并且只有用户点「应用修改」之后才允许写入数据库。
 */
export function ProposalPanel({
  proposal,
  onApply,
  onReject,
  showActions = true,
}: {
  proposal: AIProposal;
  onApply?: () => void;
  onReject?: () => void;
  showActions?: boolean;
}) {
  const highRisk = proposal.actions.some((a) => a.risk === 'high');
  const pending = proposal.status === 'pending';

  return (
    <Card className="overflow-hidden">
      <header className="flex items-start justify-between gap-3 border-b-[1.5px] border-ink/10 bg-violet/8 px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[15px]">✨</span>
            <h4 className="h3">{proposal.title}</h4>
          </div>
          <p className="muted mt-1">
            针对「{proposal.intent}」的方案 · {proposal.actions.length} 个改动
          </p>
        </div>
        {highRisk && <Tag tone="rose">需你确认</Tag>}
      </header>

      <div className="space-y-4 px-4 py-4">
        {proposal.changes.length > 0 && (
          <div>
            <p className="label mb-2">变化说明</p>
            <ul className="space-y-1.5">
              {proposal.changes.map((c, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-relaxed">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {proposal.diff.length > 0 && (
          <div>
            <p className="label mb-2">具体改动</p>
            <div className="overflow-hidden rounded-xl border-[1.5px] border-ink/12">
              {proposal.diff.slice(0, 12).map((d, i) => (
                <div
                  key={i}
                  className={cx(
                    'flex items-center gap-2 px-3 py-2 text-[12.5px]',
                    i % 2 ? 'bg-paperDeep/60' : 'bg-white',
                  )}
                >
                  <span
                    className={cx(
                      'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold',
                      KIND_STYLE[d.kind],
                    )}
                  >
                    {KIND_TEXT[d.kind]}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{d.label}</span>
                  {d.before && <span className="shrink-0 text-inkFaint line-through">{d.before}</span>}
                  {d.before && d.after && <span className="shrink-0 text-inkFaint">→</span>}
                  {d.after && <span className="shrink-0 font-semibold">{d.after}</span>}
                </div>
              ))}
              {proposal.diff.length > 12 && (
                <div className="bg-white px-3 py-1.5 text-[11px] text-inkFaint">
                  还有 {proposal.diff.length - 12} 项改动…
                </div>
              )}
            </div>
          </div>
        )}

        {proposal.impact.length > 0 && (
          <div>
            <p className="label mb-2">影响</p>
            <div className="flex flex-wrap gap-1.5">
              {proposal.impact.map((t, i) => (
                <Tag key={i} tone="amber">
                  {t}
                </Tag>
              ))}
            </div>
          </div>
        )}

        <details className="rounded-xl border-[1.5px] border-ink/12 bg-white px-3 py-2">
          <summary className="cursor-pointer text-[12px] font-semibold text-inkSoft">
            查看 AI 将执行的 {proposal.actions.length} 个动作
          </summary>
          <ul className="mt-2 space-y-1">
            {proposal.actions.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-[12px]">
                <span
                  className={cx(
                    'rounded px-1.5 py-0.5 font-mono text-[10px]',
                    a.risk === 'high' ? 'bg-rose/15 text-rose' : a.risk === 'medium' ? 'bg-amber/30' : 'bg-ink/8 text-inkSoft',
                  )}
                >
                  {a.name}
                </span>
                <span className="text-inkSoft">{a.summary}</span>
                <span className="ml-auto shrink-0 text-[10px] text-inkFaint">
                  {RISK_LABEL[a.risk].text}
                </span>
              </li>
            ))}
          </ul>
        </details>

        {showActions && (
          <div className="flex flex-wrap items-center gap-2">
            {pending ? (
              <>
                <Button variant="primary" onClick={onApply}>
                  应用修改
                </Button>
                <Button variant="ghost" onClick={onReject}>
                  先不要
                </Button>
                {highRisk && (
                  <span className="text-[11px] text-inkFaint">
                    涉及删除或预算调整，我不会未经确认直接写入
                  </span>
                )}
              </>
            ) : (
              <Tag tone={proposal.status === 'applied' ? 'moss' : 'gray'}>
                {proposal.status === 'applied' ? '已应用' : '已忽略'}
              </Tag>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
