import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTripContext } from '@/hooks/useTrip';
import { useStore } from '@/services/store';
import { runAIAsync } from '@/ai/orchestrator';
import { PageHeader } from '@/components/layout';
import { ProposalPanel } from '@/components/travel/ProposalPanel';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  ProgressBar,
  Select,
  Stepper,
  cx,
  toast,
} from '@/components/ui';
import { money, CATEGORY_COLOR, CATEGORY_LABEL } from '@/utils/format';
import type { AIProposal, ExpenseCategory, ExpenseStatus } from '@/types';

const CATEGORIES: ExpenseCategory[] = ['stay', 'transport', 'food', 'ticket', 'shopping', 'other'];

export function BudgetPage() {
  const { tripId = '' } = useParams();
  const ctx = useTripContext(tripId);
  const db = useStore((s) => s.db);
  const updateTrip = useStore((s) => s.updateTrip);
  const createExpense = useStore((s) => s.createExpense);
  const deleteExpense = useStore((s) => s.deleteExpense);
  const setExpenseStatus = useStore((s) => s.setExpenseStatus);
  const addProposal = useStore((s) => s.addProposal);
  const applyProposal = useStore((s) => s.applyProposal);
  const rejectProposal = useStore((s) => s.rejectProposal);

  const [addOpen, setAddOpen] = useState(false);
  const [proposal, setProposal] = useState<AIProposal | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [draft, setDraft] = useState<{
    title: string;
    category: ExpenseCategory;
    amount: string;
    status: ExpenseStatus;
  }>({ title: '', category: 'food', amount: '', status: 'planned' });

  if (!ctx) return null;
  const { trip, expenses, budget } = ctx;

  const byCategory = budget.byCategory;
  const maxCategory = Math.max(1, ...CATEGORIES.map((c) => byCategory[c].planned + byCategory[c].paid));

  const optimize = async () => {
    setOptimizing(true);
    const res = await runAIAsync(db, tripId, '帮我优化预算', undefined, false).catch(() => null);
    setOptimizing(false);
    if (!res?.proposal) {
      toast(res?.reply || '预算看起来还挺健康的', 'warn');
      return;
    }
    addProposal(res.proposal);
    setProposal(res.proposal);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="预算"
        subtitle="预计支出是还没付的，实际支出是已经付的。"
        action={
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            + 添加支出
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <BigStat label="总预算" value={money(budget.total)} tone="ink" />
        <BigStat label="预计支出" value={money(budget.planned)} tone="azure" hint="还没付的" />
        <BigStat label="实际支出" value={money(budget.paid)} tone="rose" hint="已经付的" />
        <BigStat
          label={budget.overrun > 0 ? '预计超预算' : '剩余可用'}
          value={money(budget.overrun > 0 ? budget.overrun : budget.remaining)}
          tone={budget.overrun > 0 ? 'rose' : 'moss'}
        />
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[15px] font-extrabold">
              预计总支出 {money(budget.forecast)} / {money(budget.total)}
            </p>
            <p className="text-[11.5px] text-inkFaint">
              使用率 {budget.total ? Math.round((budget.forecast / budget.total) * 100) : 0}%
            </p>
          </div>
          <Stepper
            value={trip.totalBudget}
            onChange={(v) => updateTrip(tripId, { totalBudget: v })}
            min={0}
            max={500000}
            step={500}
            suffix="元"
          />
        </div>
        <ProgressBar
          value={budget.total ? (budget.forecast / budget.total) * 100 : 0}
          tone={budget.overrun > 0 ? 'rose' : 'azure'}
        />
        {budget.overrun > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border-[1.5px] border-rose/40 bg-rose/8 px-3.5 py-3">
            <div>
              <p className="text-[13px] font-extrabold text-rose">预计超预算 {money(budget.overrun)}</p>
              <p className="text-[11.5px] text-inkSoft">可以让 AI 找出可削减和可替代的项目</p>
            </div>
            <Button size="sm" variant="primary" onClick={optimize} disabled={optimizing}>
              {optimizing ? '正在算…' : '✨ 让 AI 帮我优化'}
            </Button>
          </div>
        ) : (
          <p className="mt-2.5 text-[11.5px] text-inkFaint">
            还剩 {money(budget.remaining)} 可用。想更省一点，也可以让 AI 优化。
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="h3 mb-3">分类</p>
          <div className="space-y-3">
            {CATEGORIES.map((c) => {
              const row = byCategory[c];
              const total = row.planned + row.paid;
              return (
                <div key={c}>
                  <div className="flex items-baseline justify-between">
                    <p className="text-[13px] font-bold">
                      <span
                        className="mr-1.5 inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: CATEGORY_COLOR[c] }}
                      />
                      {CATEGORY_LABEL[c]}
                    </p>
                    <p className="text-[12px] tabular-nums text-inkSoft">
                      {money(total)}
                      {row.paid > 0 && <span className="ml-1 text-[10.5px]">已付 {money(row.paid)}</span>}
                    </p>
                  </div>
                  <ProgressBar
                    className="mt-1"
                    value={(total / maxCategory) * 100}
                    tone={c === 'stay' ? 'violet' : c === 'transport' ? 'azure' : c === 'food' ? 'amber' : c === 'ticket' ? 'moss' : 'ink'}
                    height="h-1.5"
                  />
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <header className="flex items-center justify-between border-b-[1.5px] border-ink/10 px-4 py-3">
            <p className="h3">明细</p>
            <span className="text-[11.5px] text-inkFaint">{expenses.length} 笔</span>
          </header>
          {expenses.length === 0 ? (
            <div className="p-4">
              <EmptyState
                emoji="¥"
                title="还没有预算计划"
                desc="先记一笔住宿或交通，我能帮你预测会不会超。"
                actions={<Button onClick={() => setAddOpen(true)}>添加预算</Button>}
              />
            </div>
          ) : (
            <ul className="divide-y divide-ink/8">
              {expenses.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: CATEGORY_COLOR[e.category] }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold">{e.title}</p>
                    <p className="text-[11px] text-inkFaint">{CATEGORY_LABEL[e.category]}</p>
                  </div>
                  <span className="text-[13px] font-extrabold tabular-nums">{money(e.amount)}</span>
                  <button
                    onClick={() => setExpenseStatus(e.id, e.status === 'paid' ? 'planned' : 'paid')}
                    className={cx(
                      'focus-ring shrink-0 rounded-lg border-[1.5px] px-2 py-1 text-[11px] font-bold',
                      e.status === 'paid'
                        ? 'border-moss/40 bg-moss/12 text-moss'
                        : 'border-ink/15 text-inkSoft hover:border-ink',
                    )}
                  >
                    {e.status === 'paid' ? '已付' : '预计'}
                  </button>
                  <button
                    onClick={() => deleteExpense(e.id)}
                    className="focus-ring shrink-0 rounded-lg border-[1.5px] border-transparent px-1.5 py-1 text-[11px] text-inkFaint hover:border-rose/40 hover:text-rose"
                    aria-label="删除"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {proposal && (
        <ProposalPanel
          proposal={proposal}
          onApply={() => {
            applyProposal(proposal.id);
            toast('已应用预算优化', 'good');
            setProposal(null);
          }}
          onReject={() => {
            rejectProposal(proposal.id);
            setProposal(null);
          }}
        />
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="添加一笔"
        footer={
          <>
            <Button onClick={() => setAddOpen(false)}>取消</Button>
            <Button
              variant="primary"
              disabled={!draft.title.trim() || !Number(draft.amount)}
              onClick={() => {
                createExpense({
                  tripId,
                  title: draft.title.trim(),
                  category: draft.category,
                  amount: Number(draft.amount),
                  status: draft.status,
                });
                setDraft({ title: '', category: 'food', amount: '', status: 'planned' });
                setAddOpen(false);
                toast('已添加', 'good');
              }}
            >
              添加
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="项目">
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="比如 往返机票"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="分类">
              <Select
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value as ExpenseCategory })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="金额">
              <Input
                type="number"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                placeholder="0"
              />
            </Field>
          </div>
          <Field label="状态">
            <Select
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value as ExpenseStatus })}
            >
              <option value="planned">预计支出</option>
              <option value="paid">已经付了</option>
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function BigStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: 'ink' | 'azure' | 'rose' | 'moss';
}) {
  const toneCls: Record<string, string> = {
    ink: 'bg-paperDeep',
    azure: 'bg-azure/12',
    rose: 'bg-rose/10',
    moss: 'bg-moss/12',
  };
  return (
    <div className={cx('card px-4 py-3.5', toneCls[tone])}>
      <p className="label">{label}</p>
      <p className="mt-1 text-[20px] font-extrabold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[10.5px] text-inkFaint">{hint}</p>}
    </div>
  );
}
