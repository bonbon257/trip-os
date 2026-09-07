import type { Conflict } from '@/types';
import { Button, Card, Tag, cx } from '@/components/ui';

const LEVEL_STYLE: Record<Conflict['level'], { dot: string; tone: 'rose' | 'amber' | 'azure'; text: string }> = {
  error: { dot: 'bg-rose', tone: 'rose', text: '冲突' },
  warn: { dot: 'bg-amber', tone: 'amber', text: '提醒' },
  info: { dot: 'bg-azure', tone: 'azure', text: '建议' },
};

/** Travel Intelligence：系统主动发现问题，并给出可执行的下一步 */
export function ConflictPanel({
  conflicts,
  onFix,
  max = 5,
  className,
  title = '需要注意',
}: {
  conflicts: Conflict[];
  onFix?: (intent: string, conflict: Conflict) => void;
  max?: number;
  className?: string;
  title?: string;
}) {
  if (!conflicts.length) {
    return (
      <Card tone="quiet" className={cx('px-4 py-3.5', className)}>
        <div className="flex items-center gap-2">
          <span className="text-[15px]">✅</span>
          <p className="text-[13px] font-semibold">暂时没有冲突或风险</p>
        </div>
        <p className="muted mt-1">时间、交通、预算、强度都在合理范围内。</p>
      </Card>
    );
  }
  const list = conflicts.slice(0, max);
  return (
    <Card className={cx('overflow-hidden', className)}>
      <header className="flex items-center justify-between border-b-[1.5px] border-ink/10 px-4 py-2.5">
        <p className="text-[13px] font-extrabold">{title}</p>
        <Tag tone={conflicts.some((c) => c.level === 'error') ? 'rose' : 'amber'}>
          {conflicts.length} 项
        </Tag>
      </header>
      <ul className="divide-y divide-ink/8">
        {list.map((c) => {
          const s = LEVEL_STYLE[c.level];
          return (
            <li key={c.id} className="flex gap-2.5 px-4 py-3">
              <span className={cx('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', s.dot)} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-snug">{c.message}</p>
                {c.suggestion && <p className="muted mt-0.5">建议：{c.suggestion}</p>}
                {c.suggestedIntent && onFix && (
                  <Button size="sm" variant="soft" className="mt-2" onClick={() => onFix(c.suggestedIntent!, c)}>
                    让 AI 处理
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function AISuggestionList({
  hints,
  onPick,
  title = 'AI 提醒',
  className,
}: {
  hints: string[];
  onPick?: (hint: string) => void;
  title?: string;
  className?: string;
}) {
  if (!hints.length) return null;
  return (
    <Card className={cx('overflow-hidden', className)}>
      <header className="flex items-center gap-2 border-b-[1.5px] border-ink/10 bg-violet/8 px-4 py-2.5">
        <span>✨</span>
        <p className="text-[13px] font-extrabold">{title}</p>
      </header>
      <ul className="divide-y divide-ink/8">
        {hints.map((h, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-2.5">
            <p className="min-w-0 flex-1 text-[13px] leading-snug">{h}</p>
            {onPick && (
              <Button size="sm" onClick={() => onPick(h)}>
                处理
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
