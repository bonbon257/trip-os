import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/services/store';
import { runAIAsync } from '@/ai/orchestrator';
import { ensureCandidatePool } from '@/services/poiSource';
import { AIToggle } from './AIToggle';
import { ProposalPanel } from '@/components/travel/ProposalPanel';
import { Button, Chip, cx, toast } from '@/components/ui';
import type { ID } from '@/types';

interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
  proposalId?: string;
  followUps?: string[];
  source?: 'llm' | 'local';
}

export const DEFAULT_SUGGESTIONS = [
  '太累了',
  '我不想早起',
  '我预算只有 7000',
  '帮我规划',
  '今天下雨',
  '我睡过头了',
];

/** 攻略速问：点击直接把问题丢给 AI（LLM 开启时走 qa 模式，给真实攻略） */
const GUIDE_CHIPS = ['几点去最好', '门票怎么买', '怎么坐地铁', '必吃美食'];

export function AIPanel({
  tripId,
  suggestions = DEFAULT_SUGGESTIONS,
  placeholder = '说一句话，我帮你改行程',
  className,
  autoFocus,
  initialText,
  autoSend,
}: {
  tripId: ID | null;
  suggestions?: string[];
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  /** 从其他页面带着问题跳进来时预填 */
  initialText?: string;
  /** 预填后自动发送一次 */
  autoSend?: boolean;
}) {
  const firedRef = useRef(false);
  const sendRef = useRef<((t: string) => void) | null>(null);
  const db = useStore((s) => s.db);
  const addProposal = useStore((s) => s.addProposal);
  const applyProposal = useStore((s) => s.applyProposal);
  const rejectProposal = useStore((s) => s.rejectProposal);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const proposals = useMemo(
    () => new Map(db.proposals.map((p) => [p.id, p])),
    [db.proposals],
  );

  const destName = useMemo(() => {
    if (!tripId) return '';
    return db.trips.find((t) => t.id === tripId)?.destinationName ?? '';
  }, [db.trips, tripId]);

  // 外部带问题进来（比如从冲突面板点「让我处理」）
  useEffect(() => {
    if (!initialText || firedRef.current) return;
    firedRef.current = true;
    setText(initialText);
    if (autoSend) window.setTimeout(() => sendRef.current?.(initialText), 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText, autoSend]);

  const send = async (raw: string) => {
    const value = raw.trim();
    if (!value || busy) return;
    if (!tripId) {
      toast('先创建一次旅行，我才知道要改什么', 'warn');
      return;
    }
    setBusy(true);
    const userId = `u-${Date.now()}`;
    setMessages((m) => [...m, { id: userId, role: 'user', text: value }]);
    setText('');

    // 规划前先确保候选池有足够真实地点（无手工 CURATED 的目的地会从高德补充）
    await ensureCandidatePool(tripId).catch(() => null);
    // 先跑本地规则引擎（零延迟），识别不出来时才问 LLM
    const db = useStore.getState().db;
    const useLLM = useStore.getState().settings.aiAssist && useStore.getState().settings.useLLM;
    const result = await runAIAsync(db, tripId, value, undefined, useLLM).catch(() => null);
    const safe =
      result ?? {
        reply: '刚刚没想明白，再说一次？',
        proposal: null,
        followUps: [] as string[],
        source: 'local' as const,
      };
    if (safe.proposal) addProposal(safe.proposal);
    setMessages((m) => [
      ...m,
      {
        id: `a-${Date.now()}`,
        role: 'ai',
        text: safe.reply,
        proposalId: safe.proposal?.id,
        followUps: safe.followUps,
        source: safe.source,
      },
    ]);
    setBusy(false);
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }),
    );
  };
  sendRef.current = send;

  return (
    <div className={cx('flex min-h-0 flex-col', className)}>
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-2">
        {messages.length === 0 && (
          <div className="rounded-xl border-[1.5px] border-dashed border-ink/20 bg-white/60 px-3 py-4">
            <p className="text-[13px] font-semibold">你可以直接说人话</p>
            <p className="muted mt-1">说完我会先给你看改动，你确认后才写入行程。</p>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={cx(
              'flex w-full flex-col',
              m.role === 'user' ? 'items-end' : 'items-start',
            )}
          >
            {m.role === 'ai' && m.source && (
              <p
                className={cx(
                  'mb-1.5 text-[10.5px] font-semibold',
                  m.source === 'llm' ? 'text-violet' : 'text-inkFaint',
                )}
              >
                {m.source === 'llm' ? '✨ 由 DeepSeek 生成' : '📋 本地规则引擎'}
              </p>
            )}
            <div
              className={cx(
                'max-w-[88%] whitespace-pre-wrap break-words rounded-2xl border-[1.5px] px-3 py-2 text-[13px] leading-[1.7]',
                m.role === 'user'
                  ? 'border-ink bg-ink text-white'
                  : 'border-ink/12 bg-white text-ink',
              )}
            >
              {m.text}
            </div>
            {m.proposalId && proposals.get(m.proposalId) && (
              <div className="mt-3 w-full">
                <ProposalPanel
                  proposal={proposals.get(m.proposalId)!}
                  onApply={() => {
                    const n = applyProposal(m.proposalId!);
                    toast(n ? `已应用 ${n} 个改动` : '没有可应用的改动', n ? 'good' : 'warn');
                  }}
                  onReject={() => rejectProposal(m.proposalId!)}
                />
              </div>
            )}
            {m.followUps && m.followUps.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.followUps.map((f) => (
                  <Chip key={f} onClick={() => send(f)} className="text-[12px]">
                    {f}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-1.5 text-[12px] text-inkFaint">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink/40" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink/40 [animation-delay:120ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink/40 [animation-delay:240ms]" />
            <span className="ml-1">正在读你的行程…</span>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2 border-t-[1.5px] border-ink/10 pt-3">
        {tripId && destName && (
          <div>
            <p className="mb-1 text-[10.5px] font-semibold text-inkFaint">攻略速问</p>
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
              {GUIDE_CHIPS.map((g) => (
                <Chip
                  key={g}
                  onClick={() => send(`${destName}${g}`)}
                  className="shrink-0 border-azure/40 bg-azure/8 text-[12px] text-ink"
                >
                  {g}
                </Chip>
              ))}
            </div>
          </div>
        )}
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
          {suggestions.map((s) => (
            <Chip key={s} onClick={() => send(s)} className="shrink-0 text-[12px]">
              {s}
            </Chip>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <AIToggle className="mb-[7px]" />
          <textarea
            autoFocus={autoFocus}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
            rows={1}
            placeholder={placeholder}
            className="focus-ring max-h-24 min-h-[42px] flex-1 resize-none rounded-xl border-[1.5px] border-ink/15 bg-white px-3 py-2.5 text-[13px] placeholder:text-inkFaint"
          />
          <Button type="submit" variant="primary" disabled={busy || !text.trim()}>
            发送
          </Button>
        </form>
      </div>
    </div>
  );
}
