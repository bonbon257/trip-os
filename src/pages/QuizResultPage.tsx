import { useNavigate } from 'react-router-dom';
import { useStore } from '@/services/store';
import { Button, Card, EmptyState, ProgressBar, Tag, cx } from '@/components/ui';
import { DISLIKES, INTERESTS, emojiOf, labelOf } from '@/data/taxonomy';
import type { TravelTypeResult } from '@/types/decision';

type BarTone = 'violet' | 'azure' | 'amber' | 'moss' | 'rose' | 'ink';

const METRICS: { key: keyof TravelTypeResult['metrics']; label: string; desc: string; tone: BarTone }[] = [
  { key: 'planning', label: '规划欲', desc: '你愿意自己做功课的程度', tone: 'violet' },
  { key: 'intensity', label: '行程密度', desc: '一天能塞多少东西', tone: 'rose' },
  { key: 'freedom', label: '自由度', desc: '留给随机的空间', tone: 'azure' },
  { key: 'spontaneity', label: '临时决策', desc: '当天改主意的意愿', tone: 'amber' },
];

export function QuizResultPage() {
  const navigate = useNavigate();
  const quiz = useStore((s) => s.quiz);
  const resetQuiz = useStore((s) => s.resetQuiz);

  if (!quiz.result || !quiz.answers) {
    return (
      <EmptyState
        emoji="🧭"
        title="还没有做过测评"
        desc="先回答 9 个问题，我才能判断你这次想去哪。"
        actions={<Button variant="primary" onClick={() => navigate('/quiz')}>开始测评</Button>}
      />
    );
  }

  const r = quiz.result;
  const a = quiz.answers;

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="bg-violet/12 px-6 py-7 text-center">
          <div className="text-[44px] leading-none">{r.emoji}</div>
          <p className="label mt-3">你的旅行类型</p>
          <h1 className="h1 mt-1.5">{r.name}</h1>
          <p className="muted mx-auto mt-2 max-w-[46ch]">{r.tagline}</p>
        </div>

        <div className="space-y-3.5 px-6 py-5">
          {METRICS.map((m) => {
            const v = r.metrics[m.key];
            return (
              <div key={m.key}>
                <div className="flex items-baseline justify-between">
                  <p className="text-[13px] font-bold">{m.label}</p>
                  <p className="text-[12px] font-semibold tabular-nums text-inkSoft">{v}</p>
                </div>
                <ProgressBar
                  className="mt-1.5"
                  value={v}
                  tone={m.key === 'intensity' ? 'rose' : m.tone}
                  height="h-1.5"
                />
                <p className="mt-1 text-[11px] text-inkFaint">{m.desc}</p>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-5">
          <p className="label">适合</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {r.fit.map((f) => (
              <Tag key={f} tone="moss">
                {f}
              </Tag>
            ))}
          </div>
          <p className="label mt-4">尽量避开</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {r.avoid.length ? (
              r.avoid.map((f) => (
                <Tag key={f} tone="rose">
                  {f}
                </Tag>
              ))
            ) : (
              <p className="muted">没有特别要避开的</p>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <p className="label">这次的画像</p>
          <ul className="mt-2 space-y-1.5 text-[13px]">
            <li className="flex justify-between gap-3">
              <span className="text-inkSoft">出发地</span>
              <span className="font-semibold">{a.origin}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-inkSoft">天数</span>
              <span className="font-semibold">{a.duration?.replace('d', '').replace('p', '+')} 天左右</span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-inkSoft">想怎么过</span>
              <span className="max-w-[60%] text-right font-semibold">
                {a.interests?.map((i) => `${emojiOf(INTERESTS, i)} ${labelOf(INTERESTS, i)}`).join('、')}
              </span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-inkSoft">不想要</span>
              <span className="max-w-[60%] text-right font-semibold">
                {a.dislikes?.length
                  ? a.dislikes.map((i) => labelOf(DISLIKES, i)).join('、')
                  : '没有'}
              </span>
            </li>
          </ul>
          <button
            onClick={() => {
              resetQuiz();
              navigate('/quiz');
            }}
            className={cx('focus-ring mt-4 text-[12px] font-semibold text-inkSoft underline hover:text-ink')}
          >
            重新测一次
          </button>
        </Card>
      </div>

      <Card className="flex flex-col items-center gap-3 bg-amber/20 px-6 py-7 text-center">
        <p className="text-[26px] leading-none">🎯</p>
        <div>
          <p className="h2">为你挑了 3 个地方</p>
          <p className="muted mt-1">不是三十个。你只需要做一次选择。</p>
        </div>
        <Button variant="primary" size="lg" onClick={() => navigate('/destinations')}>
          看看是哪三个
        </Button>
      </Card>
    </div>
  );
}
