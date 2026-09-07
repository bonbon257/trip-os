import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '@/services/store';
import { recommend, travelType } from '@/services/recommendation';
import {
  BUDGETS,
  COMPANIONS,
  DISLIKES,
  DURATIONS,
  INTERESTS,
  MOODS,
  ORIGINS,
  PACES,
  SCOPES,
} from '@/data/taxonomy';
import { Button, Card, Chip, Input, ProgressBar, cx, toast } from '@/components/ui';
import { LifecycleBanner } from '@/components/travel/LifecycleBanner';
import { inferOrigin, inferTravelScope } from '@/utils/queryIntent';
import type {
  BudgetRange,
  Companions,
  DestinationScope,
  DurationBucket,
  Pace,
  QuizAnswers,
  TravelMood,
} from '@/types';

type Step = {
  key: keyof QuizAnswers;
  title: string;
  hint?: string;
  multi?: boolean;
  options?: { value: string; label: string; emoji?: string; desc?: string }[];
  /** 自定义输入（出发城市支持自由填写） */
  freeText?: boolean;
};

const STEPS: Step[] = [
  { key: 'travelMood', title: '最近的你是什么状态？', options: MOODS },
  { key: 'duration', title: '这次有几天？', options: DURATIONS },
  { key: 'origin', title: '从哪里出发？', freeText: true, hint: '用来估算路上的时间和花费' },
  { key: 'budget', title: '大概预算？', options: BUDGETS, hint: '不含往返大交通也可以，先给个感觉' },
  { key: 'interests', title: '你想怎么过？', multi: true, options: INTERESTS, hint: '随便选，多选几个也没关系' },
  { key: 'dislikes', title: '这次最不想要什么？', multi: true, options: DISLIKES, hint: '这一题很重要，我们会重点避开' },
  { key: 'pace', title: '你喜欢什么旅行节奏？', options: PACES },
  { key: 'companions', title: '这次和谁去？', options: COMPANIONS },
  { key: 'destinationScope', title: '你想去哪里？', options: SCOPES },
];

export function QuizPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const quiz = useStore((s) => s.quiz);
  const setQuiz = useStore((s) => s.setQuiz);
  const resetQuiz = useStore((s) => s.resetQuiz);

  const q = params.get('q') ?? '';
  const inferredScope = useMemo(() => inferTravelScope(q), [q]);
  const inferredOrigin = useMemo(() => inferOrigin(q), [q]);

  const [step, setStep] = useState(Math.min(quiz.step, STEPS.length - 1));
  const [answers, setAnswers] = useState<Partial<QuizAnswers>>(() => {
    const base = quiz.answers ?? {};
    const merged: Partial<QuizAnswers> = { ...base };
    // 从首页一路带过来的意图：自动预填还没填的字段，省得再答一遍
    if (q) {
      if (!base.destinationScope && inferredScope) merged.destinationScope = inferredScope;
      if (!base.origin && inferredOrigin) merged.origin = inferredOrigin;
    }
    return merged;
  });
  const [originDraft, setOriginDraft] = useState(answers.origin ?? '');

  const clearQ = () => {
    const next = new URLSearchParams(params);
    next.delete('q');
    setParams(next, { replace: true });
  };

  const current = STEPS[step];
  const selected = answers[current.key];

  const picked = useMemo(() => {
    if (Array.isArray(selected)) return selected as string[];
    return selected ? [selected as string] : [];
  }, [selected]);

  const canNext = current.freeText
    ? !!originDraft.trim()
    : current.multi
      ? picked.length > 0
      : picked.length > 0;

  const choose = (value: string) => {
    if (current.multi) {
      const list = picked.includes(value) ? picked.filter((v) => v !== value) : [...picked, value];
      setAnswers((a) => ({ ...a, [current.key]: list }) as Partial<QuizAnswers>);
      return;
    }
    const next = { ...answers, [current.key]: value } as Partial<QuizAnswers>;
    setAnswers(next);
    // 单选题选完自动前进，减少点击
    window.setTimeout(() => go(step + 1, next), 180);
  };

  const finish = (final: Partial<QuizAnswers>) => {
    if (!isComplete(final)) {
      toast('还有几题没填完', 'warn');
      return;
    }
    const full: QuizAnswers = final as QuizAnswers;
    const result = travelType(full);
    const recs = recommend(full, new Date().getMonth() + 1, 3);
    setQuiz({ answers: full, result, recs, step: STEPS.length, pickedId: null });
    navigate('/quiz/result');
  };

  const go = (target: number, override?: Partial<QuizAnswers>) => {
    const data = override ?? answers;
    if (target >= STEPS.length) {
      finish(data);
      return;
    }
    if (target < 0) {
      navigate('/');
      return;
    }
    setStep(target);
    setQuiz({ step: target, answers: data });
  };

  const onNext = () => {
    if (current.freeText) {
      const next = { ...answers, origin: originDraft.trim() } as Partial<QuizAnswers>;
      setAnswers(next);
      go(step + 1, next);
      return;
    }
    go(step + 1);
  };

  return (
    <div className="space-y-5">
      <LifecycleBanner />
      {q && (
        <div className="rounded-card border-[1.5px] border-violet/40 bg-violet/10 px-4 py-3">
          <p className="text-[13px]">
            你刚才在想：<span className="font-bold">「{q}」</span>
          </p>
          <p className="muted mt-1">
            {inferredScope || inferredOrigin
              ? '已经帮你预填了能认出来的部分，剩下的照常答。'
              : '往下答几个问题，我们帮你挑 3 个地方。'}
          </p>
          <div className="mt-2">
            <Chip onClick={clearQ}>换个说法</Chip>
          </div>
        </div>
      )}
      <header>
        <div className="flex items-center justify-between">
          <p className="label">
            这次去哪？ · {step + 1} / {STEPS.length}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                resetQuiz();
                setAnswers({});
                setOriginDraft('');
                setStep(0);
                toast('已清空，从第 1 题开始', 'good');
              }}
              className="focus-ring rounded text-[12px] font-semibold text-inkSoft hover:text-ink"
            >
              重新开始
            </button>
            <button
              onClick={() => navigate('/')}
              className="focus-ring rounded text-[12px] font-semibold text-inkSoft hover:text-ink"
            >
              先不测了
            </button>
          </div>
        </div>
        <ProgressBar className="mt-2" value={((step + 1) / STEPS.length) * 100} tone="violet" />
      </header>

      <Card className="p-5 sm:p-7">
        <h1 className="h1">{current.title}</h1>
        {current.hint && <p className="muted mt-2">{current.hint}</p>}

        {current.freeText ? (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap gap-2">
              {ORIGINS.map((o) => (
                <Chip
                  key={o.name}
                  active={originDraft === o.name}
                  onClick={() => setOriginDraft(o.name)}
                >
                  {o.name}
                </Chip>
              ))}
            </div>
            <Input
              value={originDraft}
              onChange={(e) => setOriginDraft(e.target.value)}
              placeholder="或者直接输入城市名"
            />
          </div>
        ) : (
          <div
            className={cx(
              'mt-6 grid gap-2.5',
              (current.options?.length ?? 0) > 6 ? 'sm:grid-cols-2' : 'sm:grid-cols-1',
            )}
          >
            {current.options?.map((o) => {
              const active = picked.includes(o.value);
              return (
                <button
                  key={o.value}
                  onClick={() => choose(o.value)}
                  className={cx(
                    'focus-ring flex items-center gap-3 rounded-xl border-[1.5px] px-4 py-3 text-left transition',
                    active
                      ? 'border-ink bg-ink text-white shadow-note'
                      : 'border-ink/15 bg-white hover:border-ink/50 hover:bg-paperDeep',
                  )}
                >
                  {o.emoji && <span className="text-[18px] leading-none">{o.emoji}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold">{o.label}</span>
                    {o.desc && (
                      <span className={cx('block text-[11.5px]', active ? 'text-white/70' : 'text-inkFaint')}>
                        {o.desc}
                      </span>
                    )}
                  </span>
                  {active && <span className="text-[13px]">{current.multi ? '✓' : '→'}</span>}
                </button>
              );
            })}
          </div>
        )}

        {current.multi && (
          <p className="mt-3 text-[11.5px] text-inkFaint">已选 {picked.length} 项 · 可以选多个</p>
        )}
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button onClick={() => go(step - 1)} disabled={step === 0}>
          上一题
        </Button>
        <div className="flex items-center gap-2">
          {!current.freeText && (
            <Button variant="ghost" onClick={() => go(step + 1)} disabled={current.multi}>
              {current.multi ? '选好了再继续' : '跳过'}
            </Button>
          )}
          <Button variant="primary" onClick={onNext} disabled={!canNext}>
            {step === STEPS.length - 1 ? '看看结果' : '下一题'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function isComplete(a: Partial<QuizAnswers>): a is QuizAnswers {
  return !!(
    a.travelMood &&
    a.duration &&
    a.origin &&
    a.budget &&
    a.interests?.length &&
    a.pace &&
    a.companions &&
    a.destinationScope
  );
}

// 类型兜底：确保 Step 的 key 与 QuizAnswers 对齐
export type QuizStepKey = keyof QuizAnswers;
export type QuizAnswerTypes = TravelMood | DurationBucket | BudgetRange | Pace | Companions | DestinationScope;
