import { useState } from 'react';
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
  toast,
} from '@/components/ui';
import { FILE_LABEL } from '@/utils/format';
import type { FileType } from '@/types';

const TYPES: FileType[] = ['flight', 'hotel', 'ticket', 'id', 'order', 'other'];
const EMOJI: Record<FileType, string> = {
  flight: '✈️',
  hotel: '🏨',
  ticket: '🎟️',
  id: '🪪',
  order: '🧾',
  other: '📎',
};
const LINK_TYPES: FileAssetLink[] = ['trip', 'day', 'activity', 'place', 'booking'];
type FileAssetLink = 'trip' | 'day' | 'activity' | 'place' | 'booking';
const LINK_LABEL: Record<FileAssetLink, string> = {
  trip: '这次旅行',
  day: '某一天',
  activity: '某个安排',
  place: '某个地点',
  booking: '某条预订',
};

export function FilesPage() {
  const { tripId = '' } = useParams();
  const ctx = useTripContext(tripId);
  const addFile = useStore((s) => s.addFile);
  const deleteFile = useStore((s) => s.deleteFile);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ name: '', type: 'flight' as FileType, linkedType: 'trip' as FileAssetLink });
  const [linkedId, setLinkedId] = useState('');

  if (!ctx) return null;
  const { files, days, activities, bookings } = ctx;

  const linkOptions = (() => {
    switch (draft.linkedType) {
      case 'day':
        return days.map((d) => ({ id: d.id, label: `D${d.index} ${d.title}` }));
      case 'activity':
        return activities.map((a) => ({ id: a.id, label: a.title }));
      case 'place':
        return ctx.places.map((p) => ({ id: p.id, label: p.name }));
      case 'booking':
        return bookings.map((b) => ({ id: b.id, label: b.title }));
      default:
        return [];
    }
  })();
  const linkedLabel = (f: { linkedType?: string; linkedId?: string }) => {
    if (!f.linkedType || f.linkedType === 'trip') return '这次旅行';
    const label =
      (f.linkedType === 'day' && days.find((d) => d.id === f.linkedId)?.title) ||
      (f.linkedType === 'activity' && activities.find((a) => a.id === f.linkedId)?.title) ||
      (f.linkedType === 'place' && ctx.places.find((p) => p.id === f.linkedId)?.name) ||
      (f.linkedType === 'booking' && bookings.find((b) => b.id === f.linkedId)?.title);
    return label ? `${LINK_LABEL[f.linkedType as FileAssetLink]}：${label}` : LINK_LABEL[f.linkedType as FileAssetLink];
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="文件"
        subtitle="不是网盘。这里的每一份文件都属于这次旅行的某个具体上下文。"
        action={
          <Button variant="primary" onClick={() => setOpen(true)}>
            + 上传文件
          </Button>
        }
      />

      {files.length === 0 ? (
        <EmptyState
          emoji="📎"
          title="还没有文件"
          desc="机票、酒店确认单、门票二维码都可以放进来。"
          actions={<Button onClick={() => setOpen(true)}>上传文件</Button>}
        />
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {files.map((f) => (
            <Card key={f.id} className="flex items-start gap-3 p-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-[1.5px] border-ink/15 bg-paperDeep text-[18px]">
                {EMOJI[f.type]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-bold">{f.name}</p>
                <p className="mt-0.5 text-[11px] text-inkFaint">
                  {FILE_LABEL[f.type]} · {f.sizeKb} KB · {f.uploadedAt}
                </p>
                <p className="mt-1 text-[11px] text-inkSoft">关联：{linkedLabel(f)}</p>
              </div>
              <div className="flex flex-col gap-1">
                <Button size="sm" variant="ghost" onClick={() => toast('演示环境暂不支持在线预览', 'warn')}>
                  预览
                </Button>
                <Button size="sm" variant="ghost" onClick={() => deleteFile(f.id)}>
                  删除
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="上传文件"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>取消</Button>
            <Button
              variant="primary"
              disabled={!draft.name.trim()}
              onClick={() => {
                addFile({
                  tripId,
                  name: draft.name.trim(),
                  type: draft.type,
                  sizeKb: 120 + Math.floor(Math.random() * 400),
                  linkedType: draft.linkedType,
                  linkedId: draft.linkedType === 'trip' ? undefined : linkedId || undefined,
                });
                setDraft({ name: '', type: 'flight', linkedType: 'trip' });
                setLinkedId('');
                setOpen(false);
                toast('已归档', 'good');
              }}
            >
              保存
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="文件名">
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="比如 电子客票.pdf"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="类型">
              <Select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as FileType })}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {FILE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="关联到">
              <Select
                value={draft.linkedType}
                onChange={(e) => {
                  setDraft({ ...draft, linkedType: e.target.value as FileAssetLink });
                  setLinkedId('');
                }}
              >
                {LINK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {LINK_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {linkOptions.length > 0 && (
            <Field label="具体是哪一个">
              <Select value={linkedId} onChange={(e) => setLinkedId(e.target.value)}>
                <option value="">不指定</option>
                {linkOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <p className="text-[11.5px] text-inkFaint">
            真实环境这里会走对象存储；演示环境只记录文件元信息和关联关系。
          </p>
        </div>
      </Modal>
    </div>
  );
}
