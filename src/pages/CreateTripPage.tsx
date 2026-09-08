import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '@/services/store';
import { getDestination } from '@/data/destinations';
import { fullDestinationPool, transportEstimate } from '@/services/recommendation';
import { CityPicker } from '@/features/destination/CityPicker';
import { OriginPicker } from '@/features/destination/OriginPicker';
import { IdealDaysHint } from '@/features/destination/IdealDaysHint';
import { destinationsInText } from '@/utils/queryIntent';
import { PageHeader } from '@/components/layout';
import {
  Button,
  Card,
  Chip,
  Field,
  Input,
  Stepper,
  Tag,
  cx,
  toast,
} from '@/components/ui';
import { addDays, diffDays, fmtCN, todayISO } from '@/utils/date';
import { money } from '@/utils/format';
import type { Destination, PlanningPreference, TripMember, TripProfile } from '@/types';

const PLANNING_OPTIONS: { value: PlanningPreference; label: string; desc: string; emoji: string }[] = [
  {
    value: 'planner',
    label: '我自己规划',
    desc: '我喜欢自己研究和调整，AI 只在旁边给建议。',
    emoji: '🧑‍💻',
  },
  {
    value: 'delegator',
    label: '帮我规划',
    desc: '我不太想做攻略，你直接给我一个完整方案，我再改。',
    emoji: '✨',
  },
  {
    value: 'auto',
    label: '我不知道，你决定',
    desc: '先给我一版，我看过之后再说要不要自己调。',
    emoji: '🤷',
  },
];

export function CreateTripPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const quiz = useStore((s) => s.quiz);
  const setQuiz = useStore((s) => s.setQuiz);
  const createTrip = useStore((s) => s.createTrip);
  const setActiveTrip = useStore((s) => s.setActiveTrip);

  const presetDest = params.get('destination') ?? '';
  const presetDays = Number(params.get('days'));
  const presetBudget = Number(params.get('budget'));

  const q = params.get('q') ?? '';
  const fromText = destinationsInText(q);
  const initialCities =
    presetDest && getDestination(presetDest)
      ? [presetDest]
      : fromText.length
        ? [fromText[0]!.id]
        : [fullDestinationPool()[0]!.id];
  const [cities, setCities] = useState<string[]>(initialCities);
  const daysForCities = (ids: string[]) => {
    const mins = ids.map((id) => getDestination(id)?.idealDays.min ?? 3);
    return Math.min(21, Math.max(1, mins.reduce((a, b) => a + b, 0)));
  };
  const [startDate, setStartDate] = useState(addDays(todayISO(), 14));
  const [days, setDays] = useState(
    Number.isFinite(presetDays) && presetDays > 0 ? Math.round(presetDays) : daysForCities(initialCities),
  );
  const [budget, setBudget] = useState(
    Number.isFinite(presetBudget) && presetBudget > 0 ? Math.round(presetBudget) : 6000,
  );
  const [companionsText, setCompanionsText] = useState('');
  const [origin, setOrigin] = useState(quiz.answers?.origin ?? '上海');
  const [planning, setPlanning] = useState<PlanningPreference>(
    quiz.answers?.dislikes?.includes('planning') ? 'delegator' : 'auto',
  );

  const selectedDests = useMemo(
    () => cities.map((id) => getDestination(id)).filter(Boolean) as Destination[],
    [cities],
  );
  const dest = useMemo(() => selectedDests[0], [selectedDests]);
  const transport = useMemo(() => (dest ? transportEstimate(origin, dest) : null), [origin, dest]);
  // 任何访问 dest 之前先守卫，否则拼到不存在的城市 ID 会让整页崩
  if (!dest) {
    return (
      <div className="space-y-4">
        <PageHeader back title="已经决定了" subtitle="城市数据暂时取不到" />
        <Card className="p-6">
          <p className="h3">没有找到「{cities[0] || '未选'}」</p>
          <p className="muted mt-2">
            可能是网络问题（城市数据从高德拉的）或者数据生成有遗漏。
            回到首页换个城市试试。
          </p>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => navigate('/')}>回首页</Button>
            <Button variant="primary" onClick={() => navigate('/quiz')}>重新测评</Button>
          </div>
        </Card>
      </div>
    );
  }

  const endDate = useMemo(() => addDays(startDate, Math.max(0, days - 1)), [startDate, days]);
  const nights = Math.max(0, diffDays(startDate, endDate));

  const dailyMid = selectedDests.length
    ? selectedDests.reduce((s, d) => s + (d.dailyCost.low + d.dailyCost.high) / 2, 0) / selectedDests.length
    : 600;
  const suggestedBudget = Math.round(dailyMid * days + (selectedDests[0]?.dailyCost.low ?? 300) * 2.2);

  const addCity = (id: string) => {
    if (!id || cities.includes(id)) {
      toast('这个城市已经在列表里了', 'warn');
      return;
    }
    const next = [...cities, id];
    setCities(next);
    setDays(daysForCities(next));
  };
  const removeCity = (idx: number) => {
    if (cities.length <= 1) return;
    const next = cities.filter((_, i) => i !== idx);
    setCities(next);
    setDays(daysForCities(next));
  };
  const moveCity = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= cities.length) return;
    const next = [...cities];
    [next[idx], next[j]] = [next[j], next[idx]];
    setCities(next);
  };

  const profile: TripProfile = {
    travelMood: quiz.answers?.travelMood ?? 'change',
    pace: quiz.answers?.pace ?? 'balanced',
    companions: quiz.answers?.companions ?? 'solo',
    interests: quiz.answers?.interests ?? dest.tags.slice(0, 4),
    dislikes: quiz.answers?.dislikes ?? [],
    origin,
    durationDays: days,
  };

  const submit = () => {
    const names = companionsText
      .split(/[,，、\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const members: TripMember[] = [
      { id: 'u-me', name: '我', avatar: '🦊', role: 'owner' },
      ...names.map((n, i) => ({
        id: `u-${i + 1}`,
        name: n,
        avatar: ['🐻', '🐼', '🐨', '🦁', '🐯', '🐮'][i % 6],
        role: 'member' as const,
      })),
    ];

    const trip = createTrip({
      destinationIds: cities,
      startDate,
      endDate,
      totalBudget: budget,
      planningPreference: planning,
      profile,
      members,
    });
    setActiveTrip(trip.id);
    toast(`${trip.title} 已创建`, 'good');

    // 规划型用户直接进工作台自己排；其余让 AI 先给一版
    navigate(planning === 'planner' ? `/trips/${trip.id}/itinerary` : `/trips/${trip.id}/plan`);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        back
        title="已经决定了"
        subtitle="填四个字段就够了。剩下的，可以之后再说。"
      />

      {q && fromText.length > 0 && (
        <div className="rounded-card border-[1.5px] border-violet/40 bg-violet/10 px-4 py-3">
          <p className="text-[13px]">
            你刚才在想：<span className="font-bold">「{q}」</span>
            {fromText.length > 1 ? ` · 默认选「${fromText[0]!.name}」，也可以换成其它的` : ''}
          </p>
          <div className="mt-2">
            <Chip
              onClick={() => {
                const next = new URLSearchParams(params);
                next.delete('q');
                setParams(next, { replace: true });
              }}
            >
              换个说法
            </Chip>
          </div>
        </div>
      )}

      <Card className="space-y-4 p-5">
        <Field
          label="去哪"
          hint="可加多个城市；上下箭头决定走法顺序，天数会按各城市理想天数自动分摊。"
        >
          <div className="space-y-2">
            {cities.map((cid, idx) => {
              const c = getDestination(cid);
              return (
                <div
                  key={cid}
                  className="flex items-center gap-2 rounded-xl border-[1.5px] border-ink/15 bg-paperDeep px-3 py-2"
                >
                  <span className="text-[18px]">{c?.emoji}</span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">{c?.name ?? cid}</span>
                  <span className="shrink-0 text-[10.5px] text-inkFaint">第 {idx + 1} 站</span>
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveCity(idx, -1)}
                    className="focus-ring shrink-0 rounded-md border-[1.5px] border-ink/12 px-1.5 text-[11px] disabled:opacity-30"
                    aria-label="上移"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={idx === cities.length - 1}
                    onClick={() => moveCity(idx, 1)}
                    className="focus-ring shrink-0 rounded-md border-[1.5px] border-ink/12 px-1.5 text-[11px] disabled:opacity-30"
                    aria-label="下移"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    disabled={cities.length === 1}
                    onClick={() => removeCity(idx)}
                    className="focus-ring shrink-0 rounded-md border-[1.5px] border-rose/40 px-1.5 text-[11px] text-rose disabled:opacity-30"
                    aria-label="移除城市"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
            <CityPicker value={cities[cities.length - 1] ?? ''} onChange={(d) => addCity(d.id)} />
          </div>
        </Field>

        <Field label="出发地" hint="大老远过去的话，建议天数会自动加缓冲">
          <OriginPicker
            value={origin}
            onChange={(v) => {
              const next = v || '上海';
              setOrigin(next);
              setQuiz({ answers: { ...(quiz.answers ?? {}), origin: next } });
            }}
          />
        </Field>

        {/* 建议天数：别让用户自己判断"3 天够不够" */}
        <IdealDaysHint dest={dest} days={days} onChange={setDays} transportHours={transport?.hours} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="出发日期">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value || todayISO())}
            />
          </Field>
          <Field label="玩几天" hint={`到 ${fmtCN(endDate)} · 共 ${nights} 晚`}>
            <Stepper value={days} onChange={setDays} min={1} max={21} step={1} suffix="天" />
          </Field>
        </div>

        <Field
          label="总预算"
          hint={`按 ${dest.name} 的消费水平，${days} 天大概 ${money(suggestedBudget)}（含往返大交通）`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Stepper value={budget} onChange={setBudget} min={0} max={200000} step={500} suffix="元" />
            <Button size="sm" variant="ghost" onClick={() => setBudget(suggestedBudget)}>
              用建议值
            </Button>
          </div>
        </Field>

        <Field label="同行人（可选）" hint="用逗号分隔，比如：小林，阿May">
          <Input
            value={companionsText}
            onChange={(e) => setCompanionsText(e.target.value)}
            placeholder="自己一个人去就留空"
          />
        </Field>
      </Card>

      <Card className="p-5">
        <p className="h2">这次要自己规划，还是让我帮你？</p>
        <p className="muted mt-1">随时可以改，先选一个舒服的。</p>

        <div className="mt-4 grid gap-2.5">
          {PLANNING_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setPlanning(o.value)}
              className={cx(
                'focus-ring flex items-start gap-3 rounded-xl border-[1.5px] px-4 py-3 text-left transition',
                planning === o.value
                  ? 'border-ink bg-ink text-white shadow-note'
                  : 'border-ink/15 bg-white hover:border-ink/50 hover:bg-paperDeep',
              )}
            >
              <span className="text-[20px] leading-none">{o.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold">{o.label}</span>
                <span
                  className={cx(
                    'block text-[12px]',
                    planning === o.value ? 'text-white/75' : 'text-inkSoft',
                  )}
                >
                  {o.desc}
                </span>
              </span>
              {planning === o.value && <span className="text-[13px]">✓</span>}
            </button>
          ))}
        </div>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <div className="muted">
          {origin} → {selectedDests.map((d) => d.name).join(' → ')} ·{' '}
          {transport ? `${transport.hours} 小时 · ` : ''}
          {fmtCN(startDate)} — {fmtCN(endDate)} · {money(budget)}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate(-1)}>再想想</Button>
          <Button variant="primary" size="lg" onClick={submit}>
            创建旅行
          </Button>
        </div>
      </div>

      {quiz.answers?.pace && (
        <p className="text-center text-[11.5px] text-inkFaint">
          <Tag tone="gray">已沿用测评偏好</Tag> 节奏、兴趣与负向偏好会带进这次旅行
        </p>
      )}
    </div>
  );
}
