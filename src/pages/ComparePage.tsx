import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '@/services/store';
import { fullDestinationPool, recommend, transportEstimate } from '@/services/recommendation';
import { getDestination } from '@/data/destinations';
import { cnProvinceOf } from '@/data/destinations-cn';
import { PageHeader } from '@/components/layout';
import { Button, Card, Chip, EmptyState, Field, Input, Tag, cx, toast } from '@/components/ui';
import { IntensityBadge } from '@/components/travel/TripBits';
import { Ring } from '@/components/ui';
import { LifecycleBanner } from '@/components/travel/LifecycleBanner';
import { money, TRANSPORT_LABEL } from '@/utils/format';
import { destinationsInText } from '@/utils/queryIntent';
import type { Destination, QuizAnswers } from '@/types';
import type { ScoredDestination } from '@/types/decision';

const MAX_COMPARE = 3;

/**
 * 预选对比
 * ────────────────────────────────────────────────────────────
 * 给「心中有几个备选，但还没决定」的 P 人：
 * 把 2–3 个目的地并排，一次性看清分数、预算、天数、交通、优缺点，
 * 点「就选这个」直接进创建页。
 */
export function ComparePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const quiz = useStore((s) => s.quiz);
  const setQuiz = useStore((s) => s.setQuiz);
  const q = params.get('q') ?? '';
  const fromText = useMemo(() => destinationsInText(q), [q]);
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    fromText.slice(0, MAX_COMPARE).map((d) => d.id),
  );
  const [kw, setQ] = useState('');

  const pool = useMemo(() => fullDestinationPool(), []);
  const origin = quiz.answers?.origin ?? '上海';

  // 只有做完测评才给推荐分；没做测评就只给基础信息
  const scoredMap = useMemo(() => {
    if (!quiz.answers?.pace || !quiz.answers.origin) return new Map<string, ScoredDestination>();
    const a = quiz.answers as QuizAnswers;
    const all = recommend(a, new Date().getMonth() + 1, 999);
    return new Map(all.map((r) => [r.destination.id, r]));
  }, [quiz.answers]);

  const selected = useMemo(
    () => selectedIds.map((id) => getDestination(id)).filter(Boolean) as Destination[],
    [selectedIds],
  );

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_COMPARE) {
        toast('最多对比 3 个地方', 'warn');
        return prev;
      }
      return [...prev, id];
    });
  };

  const filtered = useMemo(() => {
    const text = kw.trim();
    if (!text) return [];
    return pool
      .filter((d) => !selectedIds.includes(d.id))
        .filter(
          (d) =>
            d.name.includes(text) ||
            d.summary?.includes(text) ||
            d.tags.some((t) => t.includes(text.toLowerCase())) ||
            (cnProvinceOf(d.id) ?? '').includes(text),
        )
      .slice(0, 20);
  }, [pool, q, selectedIds]);

  const presetCities = useMemo(() => {
    const ids = ['route-xinjiang', 'route-northwest', 'route-yunnan', 'route-chuanxi', 'dali', 'chengdu', 'hangzhou', 'tokyo', 'osaka'];
    return ids.map((id) => getDestination(id)).filter(Boolean) as Destination[];
  }, []);

  return (
    <div className="space-y-5">
      <LifecycleBanner />
      <PageHeader
        back
        title="帮我选一个"
        subtitle="心中有几个备选？把它们放一起对比，看清楚再决定。"
      />

      {q && fromText.length > 0 && (
        <div className="rounded-card border-[1.5px] border-violet/40 bg-violet/10 px-4 py-3">
          <p className="text-[13px]">
            从「{q}」里挑出了{' '}
            <span className="font-bold">{fromText.map((d) => d.name).join('、')}</span>
            {fromText.length < 2 ? '（再添一个就能对比）' : ''}
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

      <Card className="p-4">
        <Field label="出发地" hint="对比的交通成本和天数会按这里算">
          <Input
            value={origin}
            onChange={(e) => setQuiz({ answers: { ...(quiz.answers ?? {}), origin: e.target.value || '上海' } })}
            placeholder="比如：上海、北京、成都"
          />
        </Field>
      </Card>

      <Card className="p-4">
        <Field label={`选 2–${MAX_COMPARE} 个目的地`} hint="搜城市名或环线名">
          <Input
            value={kw}
            onChange={(e) => setQ(e.target.value)}
            placeholder="比如：新疆环线、大理、东京"
          />
        </Field>

        {kw.trim() && (
          <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border-[1.5px] border-ink/10 bg-white">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-[12px] text-inkFaint">没搜到，换个关键字试试</p>
            ) : (
              filtered.map((d) => (
                <button
                  key={d.id}
                  onClick={() => toggle(d.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-paperDeep"
                >
                  <span className="text-[18px]">{d.emoji}</span>
                  <span className="flex-1 text-[13px] font-bold">{d.name}</span>
                  <span className="text-[12px] text-inkFaint">
                    {selectedIds.includes(d.id) ? '已选' : '加入对比'}
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {!kw.trim() && (
          <div className="mt-3">
            <p className="text-[11.5px] font-bold text-inkFaint">热门备选</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {presetCities.map((d) => {
                const active = selectedIds.includes(d.id);
                return (
                  <button
                    key={d.id}
                    onClick={() => toggle(d.id)}
                    className={cx(
                      'focus-ring rounded-full border-[1.5px] px-2.5 py-1 text-[12px] font-semibold transition',
                      active
                        ? 'border-ink bg-ink text-white'
                        : 'border-ink/15 bg-white text-inkSoft hover:border-ink/50',
                    )}
                  >
                    {d.emoji} {d.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {selected.length < 2 && (
        <EmptyState
          emoji="⚖️"
          title="至少选两个"
          desc="只选一个就直接去「已经决定了」创建旅行；这里是为「拿不定主意」准备的。"
          actions={<Button onClick={() => navigate('/trips/new')}>已经决定了</Button>}
        />
      )}

      {selected.length >= 2 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {selected.map((d) => {
            const scored = scoredMap.get(d.id);
            const transport = transportEstimate(origin, d);
            const midBudget = Math.round((d.dailyCost.low + d.dailyCost.high) / 2);
            const estTotal = midBudget * d.idealDays.min + transport.roundTripCost;
            return (
              <Card
                key={d.id}
                className={cx(
                  'flex flex-col overflow-hidden transition',
                  scored && scored.score >= 85 ? 'border-ink ring-1 ring-ink/10' : '',
                )}
              >
                <div className="flex items-start gap-3 bg-paperDeep p-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border-[1.5px] border-ink bg-white text-[24px]">
                    {d.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-extrabold">{d.name}</p>
                    <p className="muted line-clamp-1">{d.summary}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <IntensityBadge level={d.intensity} />
                      {cnProvinceOf(d.id) && (
                        <Tag tone="gray" className="text-[10px]">
                          {cnProvinceOf(d.id)?.replace(/省|市|自治区|维吾尔|壮族|回族|特别行政区/g, '')}
                        </Tag>
                      )}
                    </div>
                  </div>
                  {scored ? (
                    <Ring value={scored.score} size={56} sub="匹配度" />
                  ) : (
                    <span className="text-[28px]">🤔</span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-px border-b-[1.5px] border-ink/10 bg-ink/10">
                  <Cell label="建议天数" value={`${d.idealDays.min}–${d.idealDays.max} 天`} />
                  <Cell
                    label="预估总预算"
                    value={money(estTotal)}
                    hint="含往返交通"
                  />
                  <Cell label="大交通" value={`${money(transport.cost)} × 2`} hint={TRANSPORT_LABEL[transport.mode]} />
                  <Cell label="路上时间" value={`${transport.hours} 小时`} />
                </div>

                <div className="flex-1 space-y-3 p-4">
                  {scored ? (
                    <>
                      <div>
                        <p className="text-[11.5px] font-bold text-moss">适合的原因</p>
                        <ul className="mt-1 space-y-0.5">
                          {scored.reasons.slice(0, 4).map((r) => (
                            <li key={r} className="text-[12.5px] leading-relaxed text-inkSoft">
                              ✓ {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {scored.cautions.length > 0 && (
                        <div>
                          <p className="text-[11.5px] font-bold text-rose">要注意</p>
                          <ul className="mt-1 space-y-0.5">
                            {scored.cautions.slice(0, 3).map((c) => (
                              <li key={c} className="text-[12.5px] leading-relaxed text-inkSoft">
                                · {c}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div>
                        <p className="text-[11.5px] font-bold text-moss">亮点</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {d.highlights.slice(0, 5).map((h) => (
                            <Tag key={h} tone="moss" className="text-[10px]">
                              {h}
                            </Tag>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11.5px] font-bold text-rose">要注意</p>
                        <ul className="mt-1 space-y-0.5">
                          {d.cautions.slice(0, 3).map((c) => (
                            <li key={c} className="text-[12.5px] text-inkSoft">
                              · {c}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )}
                </div>

                <div className="border-t-[1.5px] border-ink/10 p-3">
                  <Button
                    variant="primary"
                    block
                    onClick={() =>
                      navigate(
                        `/trips/new?destination=${d.id}&days=${d.idealDays.min}&budget=${estTotal}`,
                      )
                    }
                  >
                    就选 {d.name}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    block
                    className="mt-1"
                    onClick={() => navigate(`/destinations/${d.id}`)}
                  >
                    看看怎么玩
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Cell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-inkFaint">{label}</p>
      <p className="mt-0.5 text-[13px] font-extrabold tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-inkFaint">{hint}</p>}
    </div>
  );
}
