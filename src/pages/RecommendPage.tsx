import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '@/services/store';
import { fullDestinationPool, transportEstimate } from '@/services/recommendation';
import { Button, Card, EmptyState, ProgressBar, Ring, Tag, cx } from '@/components/ui';
import { LifecycleBanner } from '@/components/travel/LifecycleBanner';
import { IntensityBadge } from '@/components/travel/TripBits';
import { ContextHint, contextHintFromQuery } from '@/components/decision/ContextHint';
import { money, TRANSPORT_LABEL } from '@/utils/format';
import { cnProvinceOf, cnRegionOf } from '@/data/destinations-cn';
import { citiesOfCountry } from '@/data/countries';
import { destinationOfCity, matchCitiesInText } from '@/data/cityAlias';
import { parseIntent } from '@/utils/parseIntent';
import type { ScoredDestination, ScoreFactor } from '@/types/decision';
import type { Destination } from '@/types';

/** 把 Destination 包成页面需要的 ScoredDestination（没有测评分数，只给「为什么相关」） */
function toScored(d: Destination, i: number): ScoredDestination {
  const t = transportEstimate('', d);
  return {
    destination: d,
    score: 0.8 - i * 0.05,
    reasons: [d.summary ?? ''].filter(Boolean),
    cautions: d.cautions ?? [],
    estBudget: {
      low: d.dailyCost.low * (d.idealDays.min ?? 3),
      high: d.dailyCost.high * (d.idealDays.max ?? (d.idealDays.min ?? 3)),
    },
    suggestDays: d.idealDays.min,
    transport: { mode: t.mode, cost: t.cost, hours: t.hours },
    factors: [] as ScoreFactor[],
    intensity: d.intensity,
    seasonNote: '',
  };
}

export function RecommendPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const recs = useStore((s) => s.quiz.recs);
  const setQuiz = useStore((s) => s.setQuiz);
  const [openId, setOpenId] = useState<string | null>(null);

  /**
   * 按用户真正说的地方过滤。
   *
   * 旧实现的坑：`text.includes(d.summary ?? '')` —— 当 summary 为空时变成
   * `text.includes('')`，**恒为 true**，于是每个目的地都「匹配」，
   * 「想去日本」照样跳出杭州 / 成都（PRD 明令禁止的场景 1）。
   *
   * 现在改为实体驱动：
   *   1. 显式 country 参数（意图管线识别出的国家）→ 该国城市
   *   2. 文本里的国家 → 该国城市
   *   3. 文本里的城市 → 这些城市
   *   4. 都没有 → 返回空，**绝不回落到上一次的推荐**
   */
  const filtered = useMemo(() => {
    const countryParam = params.get('country') ?? '';
    const text = q.trim();
    if (!text && !countryParam) return [];

    if (countryParam) return citiesOfCountry(countryParam).slice(0, 6).map(toScored);

    const parsed = parseIntent(text);
    const country = parsed.entities.country;
    if (country) return citiesOfCountry(country).slice(0, 6).map(toScored);

    const cities = matchCitiesInText(text, 6);
    if (cities.length) {
      return cities
        .map((c) => destinationOfCity(c.id))
        .filter((d): d is Destination => !!d)
        .slice(0, 6)
        .map(toScored);
    }

    // 兜底：省 / 大区级关键词（如「西南」「云南」）
    const lower = text.toLowerCase();
    return fullDestinationPool()
      .filter(
        (d) =>
          (cnProvinceOf(d.id) ?? '').toLowerCase().includes(lower) ||
          (cnRegionOf(d.id) ?? '').toLowerCase().includes(lower),
      )
      .slice(0, 6)
      .map(toScored);
  }, [q, params]);

  const hint = q ? contextHintFromQuery(q) : null;

  const clearQ = () => {
    const next = new URLSearchParams(params);
    next.delete('q');
    next.delete('country');
    setParams(next, { replace: true });
  };

  /**
   * 只有「用户什么都没说」时才用测评结果；
   * 说了话却匹配不到，宁可给空态解释，也不回落到无关的旧推荐。
   */
  const asked = !!(q.trim() || params.get('country'));
  const displayRecs = filtered.length ? filtered : asked ? [] : recs;

  if (!displayRecs.length) {
    return (
      <div className="space-y-5">
        <LifecycleBanner />
        {hint && (
          <ContextHint
            q={hint.q}
            route={hint.route}
            onClear={clearQ}
          />
        )}
        <EmptyState
          emoji="🧭"
          title="还没有为你挑地方"
          desc={q ? `没找到和「${q}」匹配的目的地，换个说法或者测一下偏好。` : '先花 3 分钟回答 9 个问题，我只给你 3 个结果。'}
          actions={
            <Button variant="primary" onClick={() => navigate('/quiz')}>
              帮我选个地方
            </Button>
          }
        />
      </div>
    );
  }

  const pick = (r: ScoredDestination) => {
    setQuiz({ pickedId: r.destination.id });
    navigate(
      `/trips/new?destination=${r.destination.id}&days=${r.suggestDays}&budget=${Math.round(
        (r.estBudget.low + r.estBudget.high) / 2,
      )}`,
    );
  };

  return (
    <div className="space-y-5">
      <LifecycleBanner />
      {hint && (
        <ContextHint
          q={hint.q}
          route={hint.route}
          onClear={clearQ}
        />
      )}
      <header>
        <p className="label">{q ? `找到 ${filtered.length} 个相关目的地` : '为你挑了 3 个地方'}</p>
        <h1 className="h1 mt-1">{q ? '你想先了解哪个？' : '如果现在必须选一个，你会选？'}</h1>
        <p className="muted mt-2">
          {q
            ? '直接点卡片看玩法建议，或者「就选这里」开始规划。'
            : '只给 3 个，是为了让你真的做决定。点卡片可以看更细的玩法建议。'}
        </p>
      </header>

      <div className="space-y-4">
        {displayRecs.map((r, i) => (
          <Card key={r.destination.id} className="overflow-hidden">
            <div className="flex flex-wrap items-start gap-4 p-5">
              <div className="flex items-center gap-3">
                <span
                  className={cx(
                    'grid h-7 w-7 shrink-0 place-items-center rounded-lg border-[1.5px] border-ink text-[12px] font-extrabold',
                    i === 0 ? 'bg-amber' : 'bg-paperDeep',
                  )}
                >
                  {i + 1}
                </span>
                <span className="grid h-12 w-12 place-items-center rounded-xl border-[1.5px] border-ink bg-paperDeep text-[24px]">
                  {r.destination.emoji}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="h2">{r.destination.name}</h2>
                  {(() => {
                    const prov = cnProvinceOf(r.destination.id);
                    const region = cnRegionOf(r.destination.id);
                    return (
                      <>
                        {prov && (
                          <Tag tone="gray">
                            {prov.replace(/省|市|自治区|维吾尔|壮族|回族|特别行政区/g, '')}
                            {region ? ` · ${region}` : ''}
                          </Tag>
                        )}
                        {!prov && <Tag tone="gray">{r.destination.country}</Tag>}
                      </>
                    );
                  })()}
                  <IntensityBadge level={r.intensity} />
                </div>
                <p className="muted mt-1.5">{r.destination.summary}</p>
              </div>

              <Ring
                value={r.score}
                size={68}
                sub="匹配度"
                tone={i === 0 ? '#7C5CFF' : '#2E7CF6'}
              />
            </div>

            <div className="grid gap-4 border-t-[1.5px] border-ink/10 px-5 py-4 sm:grid-cols-2">
              <div>
                <p className="label">为什么适合你</p>
                <ul className="mt-2 space-y-1.5">
                  {r.reasons.map((x) => (
                    <li key={x} className="flex gap-2 text-[13px] leading-relaxed">
                      <span className="text-moss">✓</span>
                      {x}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="预计预算" value={`${money(r.estBudget.low)}–${money(r.estBudget.high)}`} />
                  <Metric label="建议天数" value={`${r.suggestDays} 天`} />
                  <Metric
                    label="交通成本"
                    value={`${money(r.transport.cost)} · ${TRANSPORT_LABEL[r.transport.mode] ?? r.transport.mode}`}
                  />
                  <Metric label="路上时间" value={`${r.transport.hours} 小时`} />
                </div>
                <p className="text-[11.5px] text-inkFaint">🗓️ {r.seasonNote}</p>
                {r.cautions.length > 0 && (
                  <div className="rounded-xl border-[1.5px] border-rose/30 bg-rose/8 px-3 py-2">
                    <p className="text-[11px] font-bold text-rose">可能不适合你的地方</p>
                    <ul className="mt-1 space-y-0.5">
                      {r.cautions.map((c) => (
                        <li key={c} className="text-[12.5px] text-inkSoft">
                          · {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t-[1.5px] border-ink/10 px-5 py-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setOpenId(openId === r.destination.id ? null : r.destination.id)}
              >
                {openId === r.destination.id ? '收起评分明细' : '为什么是这个分数？'}
              </Button>
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  onClick={() => navigate(`/destinations/${r.destination.id}`)}
                >
                  看看怎么玩
                </Button>
                <Button size="sm" variant="primary" onClick={() => pick(r)}>
                  就选这里
                </Button>
              </div>
            </div>

            {openId === r.destination.id && (
              <div className="space-y-2 border-t-[1.5px] border-ink/10 bg-paperDeep px-5 py-4">
                <p className="label">每一个分数都能解释</p>
                {r.factors.map((f) => (
                  <div key={f.key}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[12.5px] font-bold">
                        {f.label}
                        <span className="ml-1.5 text-[10.5px] font-semibold text-inkFaint">
                          权重 {Math.round(f.weight * 100)}%
                        </span>
                      </p>
                      <p className="text-[11.5px] tabular-nums text-inkSoft">
                        {Math.round(f.score * 100)}
                      </p>
                    </div>
                    <ProgressBar className="mt-1" value={f.score * 100} height="h-1" tone="violet" />
                    <p className="mt-0.5 text-[11px] text-inkFaint">{f.note}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>

      <Card className="flex flex-col items-center gap-2 bg-amber/20 px-6 py-6 text-center">
        <p className="h3">还是拿不定主意？</p>
        <p className="muted">那就按第一名走。反正计划随时能改。</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => navigate('/quiz')}>重新测一次</Button>
          <Button
            variant="primary"
            onClick={() => navigate(`/destinations/${displayRecs[0].destination.id}`)}
          >
            先看看 {displayRecs[0].destination.name}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border-[1.5px] border-ink/12 bg-white px-3 py-2">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-inkFaint">{label}</p>
      <p className="mt-0.5 text-[13px] font-extrabold tabular-nums">{value}</p>
    </div>
  );
}
