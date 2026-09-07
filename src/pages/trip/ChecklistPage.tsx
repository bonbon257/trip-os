import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTripContext } from '@/hooks/useTrip';
import { useStore } from '@/services/store';
import { PageHeader } from '@/components/layout';
import { AIPanel } from '@/features/ai/AIPanel';
import {
  Button,
  Card,
  EmptyState,
  Input,
  ProgressBar,
  Segmented,
  Tag,
  cx,
  toast,
} from '@/components/ui';
import type { ChecklistPhase } from '@/types';

const PHASES: { value: ChecklistPhase; label: string; desc: string }[] = [
  { value: 'before', label: '出发前', desc: '证件、预订、行李' },
  { value: 'during', label: '旅行中', desc: '每天要记得的事' },
  { value: 'after', label: '回程后', desc: '报销、照片、回忆' },
];

export function ChecklistPage() {
  const { tripId = '' } = useParams();
  const ctx = useTripContext(tripId);
  const toggleItem = useStore((s) => s.toggleChecklistItem);
  const addItem = useStore((s) => s.addChecklistItem);
  const deleteItem = useStore((s) => s.deleteChecklistItem);
  const ensureChecklists = useStore((s) => s.ensureChecklists);

  const [phase, setPhase] = useState<ChecklistPhase>('before');
  const [draft, setDraft] = useState('');

  const allItems = useMemo(() => (ctx?.checklists ?? []).flatMap((c) => c.items), [ctx]);
  const doneCount = allItems.filter((i) => i.done).length;

  // 智能默认：进入页面且清单为空时，按目的地/天数/画像自动铺好清单
  useEffect(() => {
    if (ctx && ctx.checklists.length === 0) ensureChecklists(tripId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  if (!ctx) return null;
  const list = ctx.checklists.find((c) => c.phase === phase);
  const items = list?.items ?? [];
  const done = items.filter((i) => i.done).length;
  const autoCount = allItems.filter((i) => i.auto).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="清单"
        subtitle="大部分是根据这次旅行的目的地、天数和预订情况自动生成的，不是空白待办。"
        action={
          <Button
            size="sm"
            onClick={() => {
              ensureChecklists(tripId);
              toast('已按当前旅行状态补齐清单', 'good');
            }}
          >
            重新生成
          </Button>
        }
      />

      {autoCount > 0 && (
        <div className="rounded-card border-[1.5px] border-moss/30 bg-moss/8 px-4 py-2.5 text-[12.5px] text-inkSoft">
          已按你的目的地、同行关系和天数自动生成
          <span className="font-bold text-ink">{autoCount}</span> 条清单项，勾完即可；想加自己的直接底部输入。
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-extrabold">
                准备进度 {doneCount}/{allItems.length}
              </p>
              <span className="text-[11.5px] text-inkFaint">
                {allItems.length ? Math.round((doneCount / allItems.length) * 100) : 0}%
              </span>
            </div>
            <ProgressBar
              className="mt-2"
              value={allItems.length ? (doneCount / allItems.length) * 100 : 0}
              tone="moss"
            />
          </Card>

          <Segmented
            value={phase}
            options={PHASES.map((p) => ({ value: p.value, label: p.label }))}
            onChange={setPhase}
          />
          <p className="-mt-2 text-[11.5px] text-inkFaint">
            {PHASES.find((p) => p.value === phase)?.desc}
          </p>

          <Card className="overflow-hidden">
            {items.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  emoji="✓"
                  title="这个阶段还没有条目"
                  desc="加一条，或者点右上角重新生成。"
                />
              </div>
            ) : (
              <ul className="divide-y divide-ink/8">
                {items.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                    <button
                      onClick={() => toggleItem(tripId, i.id)}
                      className={cx(
                        'focus-ring grid h-6 w-6 shrink-0 place-items-center rounded-md border-[1.5px] text-[12px] transition',
                        i.done
                          ? 'border-moss bg-moss text-white'
                          : 'border-ink/25 text-transparent hover:border-ink',
                      )}
                      aria-label={i.done ? '取消完成' : '标记完成'}
                    >
                      ✓
                    </button>
                    <span
                      className={cx(
                        'min-w-0 flex-1 text-[13.5px]',
                        i.done ? 'text-inkFaint line-through' : 'font-semibold',
                      )}
                    >
                      {i.title}
                    </span>
                    {i.auto && <Tag tone="gray">自动生成</Tag>}
                    <button
                      onClick={() => deleteItem(tripId, i.id)}
                      className="focus-ring rounded-lg px-1.5 py-1 text-[11px] text-inkFaint hover:text-rose"
                      aria-label="删除"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-2 border-t-[1.5px] border-ink/10 p-3">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="加一条自己的"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && draft.trim()) {
                    addItem(tripId, phase, draft.trim());
                    setDraft('');
                  }
                }}
              />
              <Button
                variant="primary"
                disabled={!draft.trim()}
                onClick={() => {
                  addItem(tripId, phase, draft.trim());
                  setDraft('');
                }}
              >
                添加
              </Button>
            </div>
          </Card>

          <p className="text-[11.5px] text-inkFaint">
            当前阶段 {done}/{items.length} 已完成
          </p>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <p className="h3 mb-2">问 AI</p>
            <p className="muted mb-3">不知道还漏了什么，就问一句。</p>
            <div className="h-[380px]">
              <AIPanel
                tripId={tripId}
                suggestions={['我还漏了什么？', '这次需要提前预约吗？', '帮我整理行李清单']}
                placeholder="我还漏了什么？"
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
