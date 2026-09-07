import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Chip, Input, cx } from '@/components/ui';
import { parseIntent, routeForIntent } from '@/utils/parseIntent';

/**
 * 一句话入口（Travel / Weekend 共用）
 *
 * 与旧的 IntentInput 的区别：
 *   · 旧实现拿到「关键词 → 固定 href」就立刻 navigate，识别不出实体时
 *     会带着空实体跳走，最终落到无关目的地（说日本跳杭州）。
 *   · 这里先跑 parseIntent 拿到结构化结果：
 *       - 置信度够 → 带着实体（country / city）跳到对应 Context 的页面
 *       - 置信度不够 → **不跳**，先问一句「旅行还是周末」
 *
 * 语音只是输入方式：由外部通过 renderMic 注入，避免这里硬依赖浏览器能力。
 */
export function SmartIntentInput({
  autoFocus,
  className,
  placeholder = '告诉我你在想什么…',
  examples,
  renderMic,
}: {
  autoFocus?: boolean;
  className?: string;
  placeholder?: string;
  examples?: string[];
  renderMic?: (text: string, setText: (v: string) => void) => React.ReactNode;
}) {
  const [text, setText] = useState('');
  const [clarifyFor, setClarifyFor] = useState<string | null>(null);
  const navigate = useNavigate();

  const submit = (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    const parsed = parseIntent(q);
    if (parsed.needsClarify) {
      setClarifyFor(q);
      return;
    }
    navigate(routeForIntent(parsed));
  };

  const goContext = (raw: string, context: 'TRAVEL' | 'WEEKEND') => {
    const parsed = parseIntent(raw);
    navigate(
      routeForIntent({
        ...parsed,
        context,
        intent: context === 'TRAVEL' ? 'DESTINATION_DISCOVERY' : 'WEEKEND_DISCOVERY',
        needsClarify: false,
        confidence: 0.6,
      }),
    );
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(text);
      }}
      className={cx('space-y-3', className)}
    >
      <div className="flex items-center gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          autoFocus={autoFocus}
          className="h-12 flex-1 text-[15px]"
        />
        {renderMic?.(text, setText)}
        <Button type="submit" variant="primary" className="h-12 w-12 shrink-0">
          →
        </Button>
      </div>

      {clarifyFor && (
        <div className="rounded-card border-[1.5px] border-violet/40 bg-violet/10 px-4 py-3">
          <p className="text-[13px]">
            没太听清你想干嘛 —— 你是想
            <span className="font-bold"> 安排一次旅行</span>，还是
            <span className="font-bold"> 这周末出去走走</span>？
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip onClick={() => goContext(clarifyFor, 'TRAVEL')}>旅行</Chip>
            <Chip onClick={() => goContext(clarifyFor, 'WEEKEND')}>周末</Chip>
            <Chip
              onClick={() => {
                setClarifyFor(null);
                setText('');
              }}
            >
              换个说法
            </Chip>
          </div>
        </div>
      )}

      {examples && examples.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {examples.map((e) => (
            <Chip key={e} onClick={() => submit(e)}>
              {e}
            </Chip>
          ))}
        </div>
      )}
    </form>
  );
}
