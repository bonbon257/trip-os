import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Section, cx } from '@/components/ui';
import { useAllGuideContents, groupGuideContents, searchGuideContents } from './guidePool';
import { GuideCard } from './GuideCard';
import { getDestination } from '@/data/destinations';

type Tab = 'recommend' | 'destination' | 'theme' | 'play' | 'season' | 'route';

const TABS: { key: Tab; label: string }[] = [
  { key: 'recommend', label: '推荐' },
  { key: 'destination', label: '目的地' },
  { key: 'theme', label: '主题' },
  { key: 'play', label: '玩法' },
  { key: 'season', label: '应季' },
  { key: 'route', label: '路线' },
];

export function GuideMarketPage() {
  const all = useAllGuideContents();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [tab, setTab] = useState<Tab>('recommend');
  const [input, setInput] = useState(q);

  const grouped = useMemo(() => groupGuideContents(all), [all]);
  const results = useMemo(() => searchGuideContents(all, q), [all, q]);
  const navigate = useNavigate();
  const goImport = () => navigate('/guide/my?import=1');

  const setQuery = (v: string) => {
    setInput(v);
    const next = new URLSearchParams(params);
    if (v) next.set('q', v);
    else next.delete('q');
    setParams(next, { replace: true });
  };

  // 搜索态：直接展示扁平结果
  if (q.trim()) {
    return (
      <div className="space-y-5">
        <header className="sticky-note px-5 py-6">
          <p className="label">攻略市场</p>
          <h1 className="h1 mt-1">搜索攻略</h1>
          <input
            autoFocus
            value={input}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索目的地、攻略、景点、玩法……"
            className="mt-3 w-full rounded-xl border-[1.5px] border-ink/15 bg-white px-4 py-2.5 text-[14px] outline-none focus:border-ink"
          />
          <p className="muted mt-2 text-[12px]">共 {results.length} 条「{q}」相关内容</p>
        </header>
        {results.length === 0 ? (
          <Card className="p-8 text-center muted">没有匹配的攻略，换个词试试？</Card>
        ) : (
          <Section title="搜索结果">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((g) => (
                <GuideCard key={g.id} guide={g} />
              ))}
            </div>
          </Section>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="sticky-note px-5 py-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="label">攻略市场</p>
            <h1 className="h1 mt-1">现在有什么好攻略？</h1>
            <p className="muted mt-2 text-[13px]">不用先有计划，也能发现、收藏、导入旅行灵感。</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link to="/guide/my">
              <Button variant="secondary" size="sm">
                我的攻略
              </Button>
            </Link>
            <Button size="sm" onClick={goImport}>
              📥 导入攻略
            </Button>
          </div>
        </div>
        <input
          value={input}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索目的地、攻略、景点、玩法……"
          className="mt-3 w-full rounded-xl border-[1.5px] border-ink/15 bg-white px-4 py-2.5 text-[14px] outline-none focus:border-ink"
        />
      </header>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cx(
              'shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition',
              tab === t.key
                ? 'bg-ink text-paper'
                : 'border-[1.5px] border-ink/15 text-inkSoft hover:border-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'recommend' && (
        <Section title="推荐攻略" hint="编辑精选">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {grouped.recommend.map((g) => (
              <GuideCard key={g.id} guide={g} />
            ))}
          </div>
        </Section>
      )}

      {tab === 'destination' && (
        <Section title="热门目的地" hint="点城市看全部攻略">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from(grouped.destinationMap.entries()).map(([destId, guides]) => {
              const dest = getDestination(destId);
              return (
                <Link
                  key={destId}
                  to={`/travel/destinations/${destId}`}
                  className="card flex items-center gap-3 p-4 transition hover:-translate-y-[1px] hover:shadow-noteLg"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-xl border-[1.5px] border-ink/15 bg-paperDeep text-[18px]">
                    📍
                  </span>
                  <span>
                    <span className="block text-[14px] font-bold">{dest?.name ?? destId}</span>
                    <span className="muted block text-[11.5px]">
                      {dest?.country ?? ''} · {guides.length} 篇攻略
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </Section>
      )}

      {tab === 'theme' && (
        <Section title="主题攻略" hint="按兴趣发现">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {grouped.theme.map((g) => (
              <GuideCard key={g.id} guide={g} />
            ))}
          </div>
        </Section>
      )}

      {tab === 'play' && (
        <Section title="玩法 / 人群攻略" hint="怎么玩、和谁玩">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {grouped.play.map((g) => (
              <GuideCard key={g.id} guide={g} />
            ))}
          </div>
        </Section>
      )}

      {tab === 'season' && (
        <Section title="应季推荐" hint="什么时候去">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {all
              .filter((g) => g.bestTime)
              .map((g) => (
                <GuideCard key={g.id} guide={g} />
              ))}
          </div>
        </Section>
      )}

      {tab === 'route' && (
        <Section title="精选路线" hint="可直接用">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {grouped.route.map((g) => (
              <GuideCard key={g.id} guide={g} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
