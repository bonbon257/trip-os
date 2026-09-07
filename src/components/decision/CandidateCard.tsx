import { Button } from '@/components/ui';
import { cx } from '@/components/ui';

/**
 * 候选卡 —— Discover 与 Weekend 共用。
 *
 * 关键约束（对应需求第九、十一节）：
 *   · 每个候选必须有「为什么」，没有理由的推荐等于没推荐。
 *   · 明确推荐一个（recommended），不要给三个并列让用户自己猜。
 *   · 理由必须来自真实数据（距离 / 类别 / 是否室内），不编造天气、人流、活动。
 */
export interface Candidate {
  id: string;
  name: string;
  emoji?: string;
  address?: string;
  /** 为什么适合 —— 必须填 */
  reason: string;
  /** 距城市中心/当前位置的直线距离（km），未知则不给 */
  distanceKm?: number;
  /** 建议停留时长（分钟） */
  suggestedMin?: number;
  lat?: number;
  lng?: number;
  recommended?: boolean;
}

export function CandidateCard({
  c,
  onPick,
  actionLabel = '就这个',
}: {
  c: Candidate;
  onPick?: (c: Candidate) => void;
  actionLabel?: string;
}) {
  return (
    <div
      className={cx(
        'card flex flex-col gap-3 p-4 transition',
        c.recommended && 'border-violet/50 bg-violet/[0.06]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-bold">
            {c.emoji ? `${c.emoji} ` : ''}
            {c.name}
          </p>
          {c.address && <p className="muted mt-0.5 truncate text-[11.5px]">{c.address}</p>}
        </div>
        {c.recommended && (
          <span className="shrink-0 rounded-full bg-violet/20 px-2 py-0.5 text-[11px] font-bold">
            更适合你
          </span>
        )}
      </div>

      <p className="rounded-lg bg-paperDeep px-3 py-2 text-[12.5px] leading-relaxed">
        {c.reason}
      </p>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-inkFaint">
          {typeof c.distanceKm === 'number' && <span>{c.distanceKm.toFixed(1)} km</span>}
          {typeof c.suggestedMin === 'number' && <span>约 {c.suggestedMin} 分钟</span>}
        </div>
        {onPick && (
          <Button size="sm" variant={c.recommended ? 'primary' : 'secondary'} onClick={() => onPick(c)}>
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
