import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fullDestinationPool } from '@/services/recommendation';
import { cnRegionOf } from '@/data/destinations-cn';
import { PageHeader } from '@/components/layout';
import { Button, Card, Chip, Segmented, Tag, cx, toast } from '@/components/ui';
import { LifecycleBanner } from '@/components/travel/LifecycleBanner';
import { money } from '@/utils/format';
import { inferTravelScope } from '@/utils/queryIntent';
import type { Destination } from '@/types';

type Scope = 'any' | 'domestic' | 'international' | 'country';

/**
 * 随便抽一个
 * ────────────────────────────────────────────────────────────
 * 给不想做测评的人：不回答问题，直接抽。
 * 可以纯随机，也可以限定国内 / 海外 / 某个国家。
 */
export function RandomDrawPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const inferred = useMemo(() => inferTravelScope(q), [q]);
  const [scope, setScope] = useState<Scope>(
    inferred === 'international' ? 'international' : inferred === 'domestic' ? 'domestic' : 'any',
  );
  const [country, setCountry] = useState<string>('日本');
  const [picked, setPicked] = useState<Destination | null>(null);
  const [rolling, setRolling] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  const ALL = useMemo(() => fullDestinationPool(), []);
  const regions = useMemo(
    () => ['华东', '华南', '华中', '华北', '西南', '西北', '东北'],
    [],
  );

  const pool = useMemo(() => {
    switch (scope) {
      case 'domestic':
        return ALL.filter((d) => d.scope === 'domestic');
      case 'international':
        return ALL.filter((d) => d.scope === 'international');
      case 'country':
        return ALL.filter((d) => cnRegionOf(d.id) === country);
      default:
        return ALL;
    }
  }, [scope, country, ALL]);

  const draw = () => {
    if (!pool.length) {
      toast('这个范围里还没有可选城市', 'warn');
      return;
    }
    setRolling(true);
    setPicked(null);

    // 快速闪几个名字，给一点「抽签」的手感，最后停在一个结果上
    let ticks = 0;
    const timer = window.setInterval(() => {
      const temp = pool[Math.floor(Math.random() * pool.length)]!;
      setPicked(temp);
      ticks += 1;
      if (ticks >= 8) {
        window.clearInterval(timer);
        const final = pool[Math.floor(Math.random() * pool.length)]!;
        setPicked(final);
        setRolling(false);
        setHistory((h) => [final.id, ...h.filter((x) => x !== final.id)].slice(0, 6));
      }
    }, 90);
  };

  return (
    <div className="space-y-5">
      <LifecycleBanner />
      <PageHeader
        back
        title="随便抽一个"
        subtitle="不想回答问题也行。限定个范围，剩下的交给运气。"
      />

      {q && inferred && (
        <div className="rounded-card border-[1.5px] border-violet/40 bg-violet/10 px-4 py-3">
          <p className="text-[13px]">
            你刚才在想：<span className="font-bold">「{q}」</span>
          </p>
          <p className="muted mt-1">已经帮你把抽签范围设为「{inferred === 'international' ? '海外' : '国内'}」，想改就点下面。</p>
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

      <Card className="p-5">
        <p className="label">抽签范围</p>
        <Segmented
          className="mt-2"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'any', label: '不限' },
            { value: 'domestic', label: '国内' },
            { value: 'international', label: '海外' },
            { value: 'country', label: '指定大区' },
          ]}
        />

        {scope === 'country' && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {regions.map((c) => (
              <button
                key={c}
                onClick={() => setCountry(c)}
                className={cx(
                  'focus-ring rounded-full border-[1.5px] px-3 py-1.5 text-[12.5px] font-semibold transition',
                  country === c
                    ? 'border-ink bg-ink text-white'
                    : 'border-ink/15 bg-white text-inkSoft hover:border-ink/50',
                )}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        <p className="mt-3 text-[11.5px] text-inkFaint">
          候选池 {pool.length} 个目的地{scope === 'country' ? ` · ${country}` : ''}
          {scope === 'domestic' || scope === 'any' ? `（国内 ${ALL.filter((d) => d.scope === 'domestic').length} 个城市都参与）` : ''}
        </p>

        <Button
          variant="primary"
          size="lg"
          block
          className="mt-4"
          onClick={draw}
          disabled={rolling || !pool.length}
        >
          {rolling ? '抽签中…' : picked ? '再抽一次' : '开始抽'}
        </Button>
      </Card>

      {picked && (
        <Card className={cx('overflow-hidden transition', rolling && 'opacity-60')}>
          <div className="flex flex-wrap items-center gap-4 bg-amber/20 px-5 py-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border-[1.5px] border-ink bg-white text-[28px]">
              {picked.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="h2">{picked.name}</p>
                <Tag tone="gray">{picked.country}</Tag>
              </div>
              <p className="muted mt-0.5">{picked.summary}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-px bg-ink/10">
            <Cell label="建议天数" value={`${picked.idealDays.min}–${picked.idealDays.max} 天`} />
            <Cell
              label="每日预算"
              value={`${money(picked.dailyCost.low)}–${money(picked.dailyCost.high)}`}
            />
            <Cell
              label="强度"
              value={picked.intensity === 'low' ? '低' : picked.intensity === 'medium' ? '中' : '高'}
            />
          </div>

          <div className="px-5 py-4">
            <p className="label">去了可以做什么</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {picked.highlights.slice(0, 6).map((h) => (
                <Tag key={h} tone="moss">
                  {h}
                </Tag>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t-[1.5px] border-ink/10 px-5 py-3.5">
            <Button onClick={() => navigate('/quiz')}>还是想测一下</Button>
            <Button onClick={() => navigate(`/destinations/${picked.id}`)}>看看怎么玩</Button>
            <Button
              variant="primary"
              onClick={() =>
                navigate(
                  `/trips/new?destination=${picked.id}&days=${picked.idealDays.min}`,
                )
              }
            >
              就去这里
            </Button>
          </div>
        </Card>
      )}

      {history.length > 1 && (
        <div>
          <p className="label">刚才抽到过</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {history.slice(1).map((id) => {
              const d = ALL.find((x) => x.id === id);
              if (!d) return null;
              return (
                <button
                  key={id}
                  onClick={() => navigate(`/destinations/${d.id}`)}
                  className="focus-ring rounded-full border-[1.5px] border-ink/15 bg-white px-3 py-1.5 text-[12.5px] font-semibold hover:border-ink"
                >
                  {d.emoji} {d.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="label">{label}</p>
      <p className="mt-1 text-[14px] font-extrabold tabular-nums">{value}</p>
    </div>
  );
}
