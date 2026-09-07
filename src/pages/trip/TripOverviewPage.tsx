import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTripContext } from '@/hooks/useTrip';
import { useStore } from '@/services/store';
import { computeDayIntensity } from '@/services/intelligence';
import { IntensityBadge } from '@/components/travel/TripBits';
import { TripCockpit } from '@/components/travel/TripCockpit';
import { AIPanel } from '@/features/ai/AIPanel';
import { Button, Card, Modal, ProgressBar, Section, Tag, toast } from '@/components/ui';
import { fmtMDWeek } from '@/utils/date';
import type { TripStatus } from '@/types';

export function TripOverviewPage() {
  const { tripId = '' } = useParams();
  const navigate = useNavigate();
  const ctx = useTripContext(tripId);
  const setTripStatus = useStore((s) => s.setTripStatus);
  const deleteTrip = useStore((s) => s.deleteTrip);
  const [confirmStatus, setConfirmStatus] = useState<TripStatus | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!ctx) return null;
  const { trip, days, placeOf, actsOf } = ctx;
  const today = days.find((d) => d.date === new Date().toISOString().slice(0, 10));

  return (
    <div className="space-y-5">
      {/* 共享驾驶舱：状态 + 当前状态 + 进度 + NBA + Primary CTA + 准备度 + 进度 + 焦点日 + 冲突 + AI 提醒 */}
      <TripCockpit tripId={tripId} />

      {/* 管理区：本程的细节与操作（与首页 Cockpit 不重复） */}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Section
            title="每天的强度"
            hint="连续两天偏高时，我会提醒你留白"
            action={
              <Button size="sm" onClick={() => navigate(`/trips/${tripId}/itinerary`)}>
                调整行程
              </Button>
            }
          >
            <div className="space-y-2">
              {days.map((d) => {
                const acts = actsOf(d.id);
                const it = computeDayIntensity(acts, placeOf);
                const isToday = today?.id === d.id;
                return (
                  <button
                    key={d.id}
                    onClick={() => navigate(`/trips/${tripId}/itinerary`)}
                    className="card flex w-full items-center gap-3 p-3 text-left transition hover:-translate-y-[1px] hover:shadow-noteLg"
                  >
                    <span className="w-8 shrink-0 text-[12.5px] font-extrabold text-inkFaint">
                      D{d.index}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[13.5px] font-bold">{d.title}</p>
                        {isToday && <Tag tone="violet">今天</Tag>}
                      </div>
                      <p className="text-[11px] text-inkFaint">
                        {fmtMDWeek(d.date)} · {acts.length} 项 · 路上 {it.transitMinutes} 分钟
                      </p>
                      <ProgressBar
                        className="mt-1.5"
                        value={it.score}
                        height="h-1"
                        tone={it.level === 'high' ? 'rose' : it.level === 'medium' ? 'amber' : 'moss'}
                      />
                    </div>
                    <IntensityBadge level={it.level} score={it.score} />
                  </button>
                );
              })}
            </div>
          </Section>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="h3">旅行状态</p>
              <Tag tone={trip.status === 'traveling' ? 'moss' : trip.status === 'completed' ? 'gray' : 'violet'}>
                {trip.status === 'traveling' ? '旅行中' : trip.status === 'completed' ? '已完成' : '规划中'}
              </Tag>
            </div>
            <div className="flex flex-wrap gap-2">
              {trip.status === 'planning' && (
                <Button size="sm" variant="primary" onClick={() => setConfirmStatus('traveling')}>
                  开始旅行
                </Button>
              )}
              {trip.status === 'traveling' && (
                <Button size="sm" variant="primary" onClick={() => setConfirmStatus('completed')}>
                  完成旅行
                </Button>
              )}
              {trip.status === 'completed' && (
                <Button size="sm" onClick={() => setConfirmStatus('planning')}>
                  重新打开
                </Button>
              )}
              <Button size="sm" onClick={() => navigate(`/trips/${tripId}/journey`)}>
                看 Journey
              </Button>
              <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
                删除行程
              </Button>
            </div>
            <p className="mt-2 text-[11.5px] text-inkFaint">
              切到「旅行中」后，首页会变成「今天」，只告诉你现在该做什么。
            </p>
          </Card>

          <Card className="p-4">
            <p className="h3 mb-2">这次的偏好</p>
            <div className="space-y-1.5 text-[12.5px]">
              <Row label="节奏" value={PACE_TEXT[trip.profile.pace]} />
              <Row label="同行" value={COMPANION_TEXT[trip.profile.companions]} />
              <Row label="出发地" value={trip.profile.origin} />
              <Row
                label="不想要"
                value={
                  trip.profile.dislikes.length
                    ? DISLIKE_TEXT.filter((d) => trip.profile.dislikes.includes(d.value))
                        .map((d) => d.label)
                        .join('、')
                    : '没有特别要避开的'
                }
              />
              <Row
                label="规划方式"
                value={
                  trip.planningPreference === 'planner'
                    ? '自己规划'
                    : trip.planningPreference === 'delegator'
                      ? '让 AI 规划'
                      : 'AI 先给一版'
                }
              />
            </div>
          </Card>

          <div className="card h-[420px] overflow-hidden">
            <AIPanel tripId={tripId} placeholder="说一句话，我帮你改这次旅行" />
          </div>
        </div>
      </div>

      <Modal
        open={!!confirmStatus}
        onClose={() => setConfirmStatus(null)}
        title={
          confirmStatus === 'traveling'
            ? '开始这次旅行？'
            : confirmStatus === 'completed'
              ? '结束这次旅行？'
              : '重新打开这次旅行？'
        }
        footer={
          <>
            <Button onClick={() => setConfirmStatus(null)}>取消</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (confirmStatus) {
                  setTripStatus(tripId, confirmStatus);
                  toast(
                    confirmStatus === 'traveling' ? '已进入旅行中模式' : confirmStatus === 'completed' ? '旅行已归档到 Journey' : '已回到规划中',
                    'good',
                  );
                  if (confirmStatus === 'completed') navigate(`/trips/${tripId}/journey`);
                }
                setConfirmStatus(null);
              }}
            >
              确认
            </Button>
          </>
        }
      >
        <p className="muted">
          {confirmStatus === 'traveling'
            ? '首页会切换成「今天」，聚焦当前该做什么，而不是继续规划。'
            : confirmStatus === 'completed'
              ? '结束后这次旅行会沉淀成 Journey，行程仍然可以查看，但不再提醒。'
              : '这次旅行会回到规划中状态。'}
        </p>
        <p className="mt-2 text-[12px] text-inkFaint">当前进度：{actsOf.length} 个安排</p>
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="删除这次旅行？"
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-inkSoft">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}

const PACE_TEXT: Record<string, string> = {
  intense: '特种兵',
  balanced: '有计划，但不要太赶',
  focused: '每天 1–2 个重点',
  free: '完全随缘',
};

const COMPANION_TEXT: Record<string, string> = {
  solo: '自己',
  partner: '伴侣',
  friends: '朋友',
  family: '家人',
  colleagues: '同事',
  group: '多人旅行',
};

const DISLIKE_TEXT = [
  { value: 'earlyRise', label: '早起' },
  { value: 'walking', label: '暴走' },
  { value: 'hotelChange', label: '频繁换酒店' },
  { value: 'longTransit', label: '长时间坐车' },
  { value: 'crowds', label: '人挤人' },
  { value: 'planning', label: '做攻略' },
  { value: 'highCost', label: '高消费' },
  { value: 'rush', label: '天天赶行程' },
  { value: 'checkin', label: '频繁打卡' },
];
