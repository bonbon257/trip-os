import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTripContext } from '@/hooks/useTrip';
import { useStore } from '@/services/store';
import { PageHeader } from '@/components/layout';
import { Button, Card, Field, Input, Modal, Tag, cx, toast } from '@/components/ui';
import { money } from '@/utils/format';
import type { TripMember } from '@/types';

const AVATARS = ['🦊', '🐻', '🐼', '🐨', '🦁', '🐯', '🐮', '🐷', '🐸', '🐵'];

export function MembersPage() {
  const { tripId = '' } = useParams();
  const ctx = useTripContext(tripId);
  const updateTrip = useStore((s) => s.updateTrip);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);

  if (!ctx) return null;
  const { trip, expenses } = ctx;
  const members = trip.members;

  const paid = expenses.filter((e) => e.status === 'paid').reduce((s, e) => s + e.amount, 0);
  const share = members.length ? paid / members.length : 0;

  const save = (next: TripMember[]) => updateTrip(tripId, { members: next });

  return (
    <div className="space-y-4">
      <PageHeader
        title="同行成员"
        subtitle="第一版只做记录与平均分摊，不做实时协作。"
        action={
          <Button variant="primary" onClick={() => setOpen(true)}>
            + 添加成员
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <MiniCard label="人数" value={`${members.length} 人`} />
        <MiniCard label="已付总额" value={money(paid)} />
        <MiniCard label="平均每人" value={money(share)} hint="第一版按人数平均分摊" />
      </div>

      <Card className="overflow-hidden">
        <ul className="divide-y divide-ink/8">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-[1.5px] border-ink/15 bg-paperDeep text-[20px]">
                {m.avatar}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[14px] font-extrabold">{m.name}</p>
                  {m.role === 'owner' && <Tag tone="violet">组织者</Tag>}
                </div>
                <p className="text-[11.5px] text-inkFaint">
                  分摊 {money(share)} · 账单会按人数平均
                </p>
              </div>
              {m.role !== 'owner' && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => save(members.filter((x) => x.id !== m.id))}
                >
                  移除
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-4">
        <p className="h3">关于分摊</p>
        <p className="muted mt-1">
          这一版只支持平均分摊：已付金额 ÷ 人数。后续会支持按实际参与人分摊、指定付款人和多次结算。
        </p>
        <p className="mt-2 text-[11.5px] text-inkFaint">
          数据结构上已经预留了 payer 与 participants，不需要重做数据模型。
        </p>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="添加成员"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>取消</Button>
            <Button
              variant="primary"
              disabled={!name.trim()}
              onClick={() => {
                const next: TripMember = {
                  id: `u-${Date.now()}`,
                  name: name.trim(),
                  avatar,
                  role: 'member',
                };
                save([...members, next]);
                setName('');
                setAvatar(AVATARS[0]);
                setOpen(false);
                toast(`已添加 ${next.name}`, 'good');
              }}
            >
              添加
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="名字">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="比如 小林" />
          </Field>
          <Field label="头像">
            <div className="flex flex-wrap gap-2">
              {AVATARS.map((a) => (
                <button
                  key={a}
                  onClick={() => setAvatar(a)}
                  className={cx(
                    'focus-ring grid h-10 w-10 place-items-center rounded-xl border-[1.5px] text-[20px] transition',
                    avatar === a ? 'border-ink bg-paperDeep' : 'border-ink/12 hover:border-ink/40',
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function MiniCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="label">{label}</p>
      <p className="mt-1 text-[19px] font-extrabold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[10.5px] text-inkFaint">{hint}</p>}
    </div>
  );
}
