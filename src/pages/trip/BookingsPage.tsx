import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTripContext } from '@/hooks/useTrip';
import { useStore } from '@/services/store';
import { PageHeader } from '@/components/layout';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Tabs,
  Tag,
  cx,
  toast,
} from '@/components/ui';
import { BOOKING_EMOJI, BOOKING_LABEL, money } from '@/utils/format';
import type { BookingStatus, BookingType } from '@/types';

const TYPES: BookingType[] = ['flight', 'hotel', 'ticket', 'train', 'car', 'other'];
const STATUS_TEXT: Record<BookingStatus, string> = {
  pending: '待确认',
  confirmed: '已确认',
  cancelled: '已取消',
};

export function BookingsPage() {
  const { tripId = '' } = useParams();
  const ctx = useTripContext(tripId);
  const createBooking = useStore((s) => s.createBooking);
  const deleteBooking = useStore((s) => s.deleteBooking);
  const setBookingStatus = useStore((s) => s.setBookingStatus);
  const seedDefaultBookings = useStore((s) => s.seedDefaultBookings);

  const [filter, setFilter] = useState<'all' | BookingStatus>('all');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    type: 'flight' as BookingType,
    title: '',
    provider: '',
    bookingNumber: '',
    startTime: '',
    endTime: '',
    cost: '',
    status: 'pending' as BookingStatus,
  });

  // 智能默认：进入页面且还没有任何预订时，按出发地/目的地/天数铺好机票+酒店占位
  useEffect(() => {
    if (ctx && ctx.bookings.length === 0) seedDefaultBookings(tripId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  if (!ctx) return null;
  const { bookings, days } = ctx;

  const list = bookings.filter((b) => filter === 'all' || b.status === filter);
  const total = bookings.filter((b) => b.status !== 'cancelled').reduce((s, b) => s + b.cost, 0);
  const pending = bookings.filter((b) => b.status === 'pending').length;
  const hasAuto = bookings.some((b) => b.auto);

  return (
    <div className="space-y-4">
      <PageHeader
        title="预订"
        subtitle="航班、酒店、门票都放这里。确认过的会记入准备度。"
        action={
          <Button variant="primary" onClick={() => setOpen(true)}>
            + 添加预订
          </Button>
        }
      />

      {hasAuto && (
        <div className="rounded-card border-[1.5px] border-violet/30 bg-violet/8 px-4 py-2.5 text-[12.5px] text-inkSoft">
          已按你的出发地 / 目的地 / 天数铺好
          <span className="font-bold text-ink">机票</span> 和
          <span className="font-bold text-ink">酒店</span> 占位条目，填好价格与航班信息后点「确认」即可，不用从空白开始。
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat label="预订总数" value={`${bookings.length}`} />
        <MiniStat label="待确认" value={`${pending}`} tone={pending ? 'amber' : 'moss'} />
        <MiniStat label="预计花费" value={money(total)} tone="azure" />
      </div>

      <Tabs
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: '全部', badge: bookings.length },
          { value: 'pending', label: '待确认', badge: bookings.filter((b) => b.status === 'pending').length },
          { value: 'confirmed', label: '已确认', badge: bookings.filter((b) => b.status === 'confirmed').length },
          { value: 'cancelled', label: '已取消', badge: bookings.filter((b) => b.status === 'cancelled').length },
        ]}
      />

      {list.length === 0 ? (
        <EmptyState
          emoji="🎟️"
          title={filter === 'all' ? '还没有预订记录' : '这个状态下没有记录'}
          desc="把机票、酒店、门票记下来，准备度和冲突检测会更准。"
          actions={<Button onClick={() => setOpen(true)}>添加预订</Button>}
        />
      ) : (
        <div className="space-y-2.5">
          {list.map((b) => {
            const day = days.find((d) => d.id === b.dayId);
            return (
              <Card key={b.id} className={cx('p-4', b.status === 'cancelled' && 'opacity-60')}>
                <div className="flex flex-wrap items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-[1.5px] border-ink/15 bg-paperDeep text-[18px]">
                    {BOOKING_EMOJI[b.type]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14px] font-extrabold">{b.title}</p>
                      <Tag tone={b.status === 'confirmed' ? 'moss' : b.status === 'pending' ? 'amber' : 'gray'}>
                        {STATUS_TEXT[b.status]}
                      </Tag>
                      <Tag tone="gray">{BOOKING_LABEL[b.type]}</Tag>
                      {b.auto && <Tag tone="violet">自动生成</Tag>}
                    </div>
                    <p className="mt-1 text-[12px] text-inkSoft">
                      {[b.provider, b.bookingNumber && `订单号 ${b.bookingNumber}`, day && `D${day.index}`]
                        .filter(Boolean)
                        .join(' · ') || '暂无供应商信息'}
                    </p>
                    {(b.startTime || b.endTime) && (
                      <p className="text-[12px] text-inkSoft">
                        {b.startTime ?? '—'} → {b.endTime ?? '—'}
                      </p>
                    )}
                    {b.note && <p className="mt-1 text-[11.5px] text-inkFaint">{b.note}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-[15px] font-extrabold tabular-nums">{money(b.cost)}</p>
                    <div className="mt-1 flex gap-1">
                      {b.status !== 'confirmed' && (
                        <Button size="sm" onClick={() => setBookingStatus(b.id, 'confirmed')}>
                          确认
                        </Button>
                      )}
                      {b.status !== 'cancelled' && (
                        <Button size="sm" variant="ghost" onClick={() => setBookingStatus(b.id, 'cancelled')}>
                          取消
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => deleteBooking(b.id)}>
                        删除
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="添加预订"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>取消</Button>
            <Button
              variant="primary"
              disabled={!draft.title.trim()}
              onClick={() => {
                createBooking({
                  tripId,
                  type: draft.type,
                  title: draft.title.trim(),
                  provider: draft.provider.trim(),
                  bookingNumber: draft.bookingNumber.trim(),
                  startTime: draft.startTime || undefined,
                  endTime: draft.endTime || undefined,
                  cost: Number(draft.cost) || 0,
                  status: draft.status,
                });
                setDraft({
                  type: 'flight',
                  title: '',
                  provider: '',
                  bookingNumber: '',
                  startTime: '',
                  endTime: '',
                  cost: '',
                  status: 'pending',
                });
                setOpen(false);
                toast('已添加预订', 'good');
              }}
            >
              添加
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="类型">
              <Select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as BookingType })}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {BOOKING_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="状态">
              <Select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as BookingStatus })}
              >
                <option value="pending">待确认</option>
                <option value="confirmed">已确认</option>
                <option value="cancelled">已取消</option>
              </Select>
            </Field>
          </div>
          <Field label="名称">
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="比如 上海 → 东京 NH960"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="供应商">
              <Input
                value={draft.provider}
                onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
                placeholder="ANA / 携程 / 官方"
              />
            </Field>
            <Field label="订单号">
              <Input
                value={draft.bookingNumber}
                onChange={(e) => setDraft({ ...draft, bookingNumber: e.target.value })}
                placeholder="可选"
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="开始">
              <Input
                type="datetime-local"
                value={draft.startTime}
                onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
              />
            </Field>
            <Field label="结束">
              <Input
                type="datetime-local"
                value={draft.endTime}
                onChange={(e) => setDraft({ ...draft, endTime: e.target.value })}
              />
            </Field>
            <Field label="金额">
              <Input
                type="number"
                value={draft.cost}
                onChange={(e) => setDraft({ ...draft, cost: e.target.value })}
                placeholder="0"
              />
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = 'violet',
}: {
  label: string;
  value: string;
  tone?: 'violet' | 'azure' | 'amber' | 'moss';
}) {
  const bg = {
    violet: 'bg-violet/12',
    azure: 'bg-azure/12',
    amber: 'bg-amber/20',
    moss: 'bg-moss/12',
  }[tone];
  return (
    <div className={cx('card px-4 py-3', bg)}>
      <p className="label">{label}</p>
      <p className="mt-1 text-[19px] font-extrabold tabular-nums">{value}</p>
    </div>
  );
}
