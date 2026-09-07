import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTripContext } from '@/hooks/useTrip';
import { useStore } from '@/services/store';
import { PageHeader } from '@/components/layout';
import { MockMap } from '@/components/travel/MockMap';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  TextArea,
  Tag,
  cx,
  toast,
} from '@/components/ui';
import { fmtCN } from '@/utils/date';
import { money } from '@/utils/format';
import type { Journal } from '@/types';

const MOODS = ['😌', '🙂', '😄', '🤩', '😴', '🥲', '😵‍💫', '🥳'];

export function JourneyPage() {
  const { tripId = '' } = useParams();
  const ctx = useTripContext(tripId);
  const upsertJournal = useStore((s) => s.upsertJournal);

  const [editing, setEditing] = useState<{ date: string; dayId?: string } | null>(null);
  const [draft, setDraft] = useState<{ title: string; mood: string; note: string; placeNames: string }>({
    title: '',
    mood: '🙂',
    note: '',
    placeNames: '',
  });

  const journalMap = useMemo(() => {
    const m = new Map<string, Journal>();
    (ctx?.journals ?? []).forEach((j) => m.set(j.date, j));
    return m;
  }, [ctx?.journals]);

  if (!ctx) return null;
  const { trip, days, activities, expenses, journals, placeOf, actsOf } = ctx;

  const visitedPlaces = new Set(activities.map((a) => a.placeId).filter(Boolean) as string[]);
  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
  const photoCount = journals.reduce((s, j) => s + j.photos.length, 0);

  const allPoints = days
    .flatMap((d) => actsOf(d.id))
    .map((a) => ({ a, p: placeOf(a.placeId) }))
    .filter((x) => !!x.p)
    .map(({ a, p }, i) => ({
      place: p!,
      order: i,
      minutesFromPrev: a.transportMin,
      done: a.status === 'done',
    }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Journey"
        subtitle={`${trip.emoji} ${trip.title} · ${fmtCN(trip.startDate)} — ${fmtCN(trip.endDate)}`}
        action={
          trip.status !== 'completed' ? (
            <Tag tone="gray">{trip.status === 'traveling' ? '旅行中' : '规划中'}</Tag>
          ) : (
            <Tag tone="moss">已完成</Tag>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <BigStat label="天数" value={`${days.length}`} suffix="Days" />
        <BigStat label="地点" value={`${visitedPlaces.size}`} suffix="Places" />
        <BigStat label="总花费" value={money(totalSpent)} />
        <BigStat label="照片" value={`${photoCount}`} suffix="Photos" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          {days.map((d) => {
            const acts = actsOf(d.id);
            const j = journalMap.get(d.date);
            return (
              <Card key={d.id} className="overflow-hidden">
                <header className="flex items-center justify-between border-b-[1.5px] border-ink/10 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-md border-[1.5px] border-ink/15 bg-white text-[11px] font-extrabold">
                      {d.index}
                    </span>
                    <p className="text-[13.5px] font-extrabold">{d.title}</p>
                    <span className="text-[11px] text-inkFaint">{fmtCN(d.date)}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing({ date: d.date, dayId: d.id });
                      setDraft({
                        title: j?.title ?? '',
                        mood: j?.mood ?? '🙂',
                        note: j?.note ?? '',
                        placeNames: j?.placeNames.join('、') ?? '',
                      });
                    }}
                  >
                    {j ? '编辑' : '补记'}
                  </Button>
                </header>

                <div className="space-y-3 px-4 py-3">
                  {acts.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {acts.map((a) => (
                        <Tag key={a.id} tone="gray">
                          {placeOf(a.placeId)?.emoji ?? '•'} {a.title}
                        </Tag>
                      ))}
                    </div>
                  )}

                  {j ? (
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[18px]">{j.mood}</span>
                        <p className="text-[14px] font-extrabold">{j.title || d.title}</p>
                      </div>
                      {j.note && <p className="muted mt-1.5">{j.note}</p>}
                      {j.photos.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {j.photos.map((p, i) => (
                            <span
                              key={i}
                              className="grid h-12 w-12 place-items-center rounded-xl border-[1.5px] border-ink/12 bg-paperDeep text-[20px]"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[12px] text-inkFaint">这天还没有记录。回来补一句也来得及。</p>
                  )}
                </div>
              </Card>
            );
          })}

          {days.length === 0 && (
            <EmptyState emoji="🗺️" title="这次旅行还没有行程" desc="先去排几天行程吧。" />
          )}
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <p className="h3 mb-3">走过的轨迹</p>
            {allPoints.length ? (
              <MockMap points={allPoints} className="h-56" showLabels={false} />
            ) : (
              <p className="muted">还没有可定位的地点。</p>
            )}
          </Card>

          <Card className="p-4">
            <p className="h3 mb-3">花在哪</p>
            <div className="space-y-1.5">
              {expenses.map((e) => (
                <div key={e.id} className="flex justify-between text-[12.5px]">
                  <span className="text-inkSoft">{e.title}</span>
                  <span className="font-semibold tabular-nums">{money(e.amount)}</span>
                </div>
              ))}
              {!expenses.length && <p className="muted">没有花费记录。</p>}
            </div>
          </Card>

          {trip.status !== 'completed' && (
            <Card className="p-4">
              <p className="h3 mb-2">旅行结束后会沉淀成档案</p>
              <p className="muted">
                照片、文字、地点、心情和花费会自动汇总到这里。第一版不做复杂 AI 相册，先把记录留住。
              </p>
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="记录这一天"
        footer={
          <>
            <Button onClick={() => setEditing(null)}>取消</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!editing) return;
                upsertJournal({
                  tripId,
                  dayId: editing.dayId,
                  date: editing.date,
                  title: draft.title.trim() || '这天',
                  mood: draft.mood,
                  note: draft.note.trim(),
                  photos: [],
                  placeNames: draft.placeNames
                    .split(/[,，、]/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                });
                setEditing(null);
                toast('已保存到 Journey', 'good');
              }}
            >
              保存
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="标题">
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="比如 熊猫看了三小时"
            />
          </Field>
          <Field label="心情">
            <div className="flex flex-wrap gap-2">
              {MOODS.map((m) => (
                <button
                  key={m}
                  onClick={() => setDraft({ ...draft, mood: m })}
                  className={cx(
                    'focus-ring grid h-10 w-10 place-items-center rounded-xl border-[1.5px] text-[20px] transition',
                    draft.mood === m ? 'border-ink bg-paperDeep' : 'border-ink/12 hover:border-ink/40',
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </Field>
          <Field label="写了点什么">
            <TextArea
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              placeholder="今天最值得记住的一件事"
            />
          </Field>
          <Field label="去过的地方" hint="用逗号分隔">
            <Input
              value={draft.placeNames}
              onChange={(e) => setDraft({ ...draft, placeNames: e.target.value })}
              placeholder="浅草寺、秋叶原"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function BigStat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="card px-4 py-3.5">
      <p className="label">{label}</p>
      <p className="mt-1 text-[20px] font-extrabold tabular-nums">
        {value}
        {suffix && <span className="ml-1 text-[11px] font-semibold text-inkFaint">{suffix}</span>}
      </p>
    </div>
  );
}
