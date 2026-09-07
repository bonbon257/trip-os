import type { Destination } from '@/types';
import { Tag, cx } from '@/components/ui';

/**
 * 建议天数提示
 * ────────────────────────────────────────────────────────────
 * 产品原则：不要让用户自己判断"3 天去日本够不够"。
 * 系统给出「最短 N 天 · 推荐 N–M 天」，并在用户选的偏离区间时给具体后果提示
 * （能砍掉什么 / 会多出什么），而不是干巴巴一句"不太合适"。
 *
 * 后果提示刻意写得具体：
 *   少于最短 → 告诉他会牺牲什么
 *   多于推荐 → 告诉他多出来的时间能干嘛（不是警告，是机会）
 */
export function IdealDaysHint({
  dest,
  days,
  onChange,
  className,
  transportHours,
}: {
  dest: Destination;
  days: number;
  /** 传了就渲染「用推荐天数」快捷按钮 */
  onChange?: (days: number) => void;
  className?: string;
  /** 从出发地过来的单程耗时；超过 4 小时会建议加缓冲 */
  transportHours?: number;
}) {
  const buffer = transportHours && transportHours >= 4 ? (transportHours >= 6 ? 1 : 0) : 0;
  const { min, max } = dest.idealDays;
  const adjustedMin = min + buffer;
  const adjustedMax = max + buffer;
  const tooShort = days < adjustedMin;
  const tooLong = days > adjustedMax;

  const tone = tooShort ? 'amber' : tooLong ? 'azure' : 'moss';
  const border =
    tooShort ? 'border-amber/50 bg-amber/10' : tooLong ? 'border-azure/40 bg-azure/8' : 'border-ink/12 bg-paperDeep';

  return (
    <div className={cx('rounded-xl border-[1.5px] px-3 py-2.5', border, className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-[12.5px] font-extrabold">
          最短 {adjustedMin} 天
        </span>
        <span className="text-inkFaint">·</span>
        <span className="text-[12.5px] font-extrabold">推荐 {adjustedMin}–{adjustedMax} 天</span>
        {buffer > 0 && (
          <Tag tone="azure">已含 {buffer} 天出发缓冲</Tag>
        )}
        <Tag tone={tone}>
          {tooShort ? `你选了 ${days} 天` : tooLong ? `你选了 ${days} 天` : '刚好在推荐区间'}
        </Tag>
        {onChange && (tooShort || tooLong) && (
          <button
            onClick={() => onChange(tooShort ? adjustedMin : adjustedMax)}
            className="focus-ring ml-auto rounded-lg border-[1.5px] border-ink/20 bg-white px-2 py-0.5 text-[11.5px] font-bold hover:border-ink"
          >
            改成 {tooShort ? adjustedMin : adjustedMax} 天
          </button>
        )}
      </div>

      {tooShort && (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-inkSoft">
          {adjustedMin - days > 1 ? `比最短还少 ${adjustedMin - days} 天` : '只够打个卡'}。
          {dest.highlights.length > 0
            ? `这么赶大概率要砍掉「${dest.highlights.slice(-(adjustedMin - days) > 0 ? -(adjustedMin - days) : 1).join('」「')}」，落地和返程也会很赶。`
            : '落地和返程会很赶，基本玩不了什么。'}
          {buffer > 0 && ' 大老远过来，建议至少把缓冲日留出来。'}
        </p>
      )}

      {tooLong && (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-inkSoft">
          比推荐多 {days - adjustedMax} 天。多出来的时间可以安排
          {dest.tags.includes('nature') || dest.tags.includes('outdoor')
            ? '周边自然景点、慢下来泡咖啡馆，或者留一整天机动'
            : '周边城市、小众街区，或者干脆留白'}
          ——不过时间越长越容易疲劳，建议中间插一天不安排。
        </p>
      )}

      {!tooShort && !tooLong && (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-inkFaint">
          这个天数能覆盖主要玩法，也不至于太赶。
          {buffer > 0 && ' 已根据你的出发地加了缓冲日。'}
        </p>
      )}
    </div>
  );
}
