import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '@/services/store';
import { Button, Card, Section, Tag, toast } from '@/components/ui';
import { CityWheel, type WheelItem } from '@/components/weekend/CityWheel';
import { useSpinPool, normalizeCityKey } from '@/features/weekend/useSpinPool';
import { useCityCenter } from '@/hooks/useCityCenter';
import { CN_CITIES } from '@/data/cities-cn';
import {
  emojiForCategory,
  wheelFilter,
  recommendReason,
  funThings,
  type WeekendSpot,
} from '@/features/weekend/weekendPoi';
import { useWeekendWheelCustom } from '@/features/weekend/useWeekendWheelCustom';
import { usePoiSearch } from '@/features/weekend/usePoiSearch';
import { useXhsImport } from '@/features/weekend/useXhsImport';
import { addToWeekendPlan } from '@/features/weekend/weekendPlan';
import { geoKmBetween } from '@/services/route';

type Tab = 'wheel' | 'search' | 'xhs';

/**
 * /weekend/random —— 周末去哪（城市大转盘 + 手动搜 + 小红书导入）
 *
 * 大转盘只读「好玩的」地点（景点/公园/商场/自定义），抽到后给推荐理由 + 玩法；
 * 用户也能自己填地点（高德 POI）或贴小红书链接导入，导入的点可直接进转盘或计划。
 */
export function WeekendRandomPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') ?? '';

  const { pool, loading, error } = useSpinPool();
  const { center } = useCityCenter();
  const homeCity = useStore((s) => s.settings.homeCity);

  const detected = center?.cityName ? normalizeCityKey(center.cityName) : null;
  const inferred = detected ?? normalizeCityKey(homeCity);
  const [city, setCity] = useState(inferred);
  useEffect(() => {
    if (detected) setCity(detected);
  }, [detected]);

  const [tab, setTab] = useState<Tab>('wheel');
  const { items: customItems, add: addCustom, remove: removeCustom } = useWeekendWheelCustom(city);
  const poiSearch = usePoiSearch(city);
  const xhs = useXhsImport();

  // ── 转盘候选：预制池（只留好玩的）+ 自定义 ──
  const entry = pool?.cities[city];
  const poolSpots: WeekendSpot[] = useMemo(() => {
    const raw =
      (entry?.pois ?? []).map<WeekendSpot>((p) => ({
        id: p.id,
        name: p.name,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        category: p.category,
        openTime: p.openTime,
        curated: p.curated,
        emoji: emojiForCategory(p.category),
        source: 'pool',
      }));
    return wheelFilter(raw);
  }, [entry]);

  const allSpots = useMemo(() => [...poolSpots, ...customItems], [poolSpots, customItems]);

  const wheelItems = useMemo<WheelItem[]>(() => {
    const sorted = [...allSpots].sort((a, b) => Number(b.curated ?? 0) - Number(a.curated ?? 0));
    return sorted.slice(0, 36).map((s) => ({
      id: s.id,
      name: s.name,
      emoji: s.emoji ?? emojiForCategory(s.category),
    }));
  }, [allSpots]);

  const spotById = useMemo(() => {
    const m = new Map<string, WeekendSpot>();
    allSpots.forEach((s) => m.set(s.id, s));
    return m;
  }, [allSpots]);

  const [result, setResult] = useState<WeekendSpot | null>(null);
  const onSpinResult = (item: WheelItem) => {
    setResult(spotById.get(item.id) ?? null);
  };

  const kmOf = (s: WeekendSpot): number | undefined => {
    const clat = center?.lat ?? undefined;
    const clng = center?.lng ?? undefined;
    if (s.lat != null && s.lng != null && clat != null && clng != null) {
      const d = geoKmBetween({ lat: s.lat, lng: s.lng }, { lat: clat, lng: clng });
      // 定位 fallback 时可能跨城市，> 100 km 就不在理由里提距离，避免「距你 1200 km」
      return typeof d === 'number' && d <= 100 ? d : undefined;
    }
    return undefined;
  };

  const goNow = (s: WeekendSpot) => {
    if (s.lat != null && s.lng != null) {
      const url = `https://uri.amap.com/marker?position=${s.lng},${s.lat}&name=${encodeURIComponent(s.name)}&src=tripos&coordinate=gaode&callnative=1`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const addToPlan = (s: WeekendSpot) => {
    const { weekendOf } = addToWeekendPlan(s, city);
    toast('已经放进这周末的计划里', 'default');
    navigate(`/weekend/plan?w=${weekendOf}`);
  };

  const readyCities = pool ? Object.keys(pool.cities) : [];

  return (
    <div className="space-y-4">
      <header>
        <p className="label">周末去哪</p>
        <p className="muted mt-1 text-[12.5px]">
          {q ? `你在想：${q}` : '不知道去哪？转一下让运气决定，或者自己搜、从小红书导入。'}
        </p>
      </header>

      {/* 城市选择 */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-bold text-inkFaint">城市</span>
          <input
            list="spin-city-list"
            value={city}
            onChange={(e) => {
              setCity(normalizeCityKey(e.target.value));
              setResult(null);
            }}
            placeholder="选城市"
            className="w-32 rounded-lg border border-ink/15 bg-paper px-2 py-1 text-[13px] outline-none focus:border-ink/40"
          />
          <datalist id="spin-city-list">
            {CN_CITIES.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
          {pool && (
            <span className="ml-auto text-[11px] text-inkFaint">
              已备好 {pool.cityCount} / {CN_CITIES.length} 城
            </span>
          )}
        </div>
      </Card>

      {/* 分段入口 */}
      <div className="flex gap-1 rounded-full bg-ink/5 p-1">
        {([
          ['wheel', '大转盘'],
          ['search', '手动搜'],
          ['xhs', '小红书'],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`flex-1 rounded-full py-1.5 text-[12.5px] font-bold transition ${
              tab === k ? 'bg-ink text-paper' : 'text-inkSoft'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <Card className="p-4">
          <p className="muted">正在加载城市候选池…</p>
        </Card>
      )}

      {!loading && error && (
        <Card className="p-4">
          <p className="text-[13px]">候选池加载失败：{error}。请确认 public/spin-pool.json 已生成。</p>
        </Card>
      )}

      {!loading && !error && tab === 'wheel' && (
        <>
          {!entry ? (
            <Card className="border-dashed p-4">
              <p className="text-[13px] font-semibold">「{city}」的转盘数据还在准备中</p>
              <p className="muted mt-1 text-[12.5px]">
                高德正在按城市扫描候选池（当前已备好 {pool?.cityCount ?? 0} / {CN_CITIES.length} 城）。
                先换一个已就绪的城市，或用「手动搜」实时搜。
              </p>
              {readyCities.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {readyCities.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setCity(c);
                        setResult(null);
                      }}
                      className="rounded-full bg-ink/5 px-3 py-1 text-[12.5px] font-semibold text-inkSoft hover:bg-ink/10"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </Card>
          ) : (
            <Section
              title={`${city} · 去哪儿玩`}
              hint={`${allSpots.length} 个真实候选（只留好玩的），含 ${customItems.length} 个自定义`}
              action={<Tag tone="green">真实数据</Tag>}
            >
              <div className="flex flex-col items-center">
                <CityWheel items={wheelItems} onResult={onSpinResult} />
                {result && (
                  <ResultCard
                    spot={result}
                    km={kmOf(result)}
                    onGo={() => goNow(result)}
                    onPlan={() => addToPlan(result)}
                    onAgain={() => setResult(null)}
                  />
                )}
              </div>
            </Section>
          )}

          {/* 自定义选项编辑 */}
          <Section title="我的自定义选项" hint="加上你心目中的好玩点，一起进转盘">
            <CustomEditor
              city={city}
              items={customItems}
              onRemove={removeCustom}
              onAddToWheel={(name) => {
                addCustom({ id: `c-${Date.now()}`, name, category: '精选', emoji: '⭐' });
                toast('已加入转盘', 'default');
              }}
            />
          </Section>
        </>
      )}

      {!loading && !error && tab === 'search' && (
        <Section title="手动搜地点" hint="输入想去的地方，调高德真实 POI">
          <ManualSearch
            search={poiSearch}
            onAddToWheel={(s) => {
              addCustom(s);
              toast('已加入转盘', 'default');
            }}
            onPlan={addToPlan}
            kmOf={kmOf}
          />
        </Section>
      )}

      {!loading && !error && tab === 'xhs' && (
        <Section title="从小红书导入" hint="贴笔记链接，抓出地点去高德找真实坐标">
          <XhsImport
            xhs={xhs}
            search={poiSearch}
            onAddToWheel={(s) => {
              addCustom(s);
              toast('已加入转盘', 'default');
            }}
            onPlan={addToPlan}
            kmOf={kmOf}
          />
        </Section>
      )}
    </div>
  );
}

/* ── 结果卡：推荐理由 + 玩法 + 行动 ── */
function ResultCard({
  spot,
  km,
  onGo,
  onPlan,
  onAgain,
}: {
  spot: WeekendSpot;
  km?: number;
  onGo: () => void;
  onPlan: () => void;
  onAgain: () => void;
}) {
  return (
    <Card className="mt-5 w-full max-w-md p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl">{spot.emoji ?? emojiForCategory(spot.category)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold">{spot.name}</p>
          <p className="text-[12px] text-inkSoft">
            {spot.category}
            {spot.curated ? ' · 编辑精选' : ''}
            {spot.address ? ` · ${spot.address}` : ''}
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <div className="rounded-xl bg-emerald/8 p-2.5 text-[12.5px]">
          <p className="font-bold text-emerald/80">推荐理由</p>
          <p className="text-inkSoft">{recommendReason(spot, km)}</p>
        </div>
        <div className="rounded-xl bg-ink/5 p-2.5 text-[12.5px]">
          <p className="font-bold text-inkSoft">有什么好玩的</p>
          <p className="text-inkSoft">{funThings(spot)}</p>
        </div>
        {spot.openTime && <p className="text-[12px] text-inkFaint">营业：{spot.openTime}</p>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={onPlan}>
          加入周末计划
        </Button>
        <Button size="sm" onClick={onGo} disabled={spot.lat == null}>
          直接去
        </Button>
        <Button size="sm" variant="soft" onClick={onAgain}>
          再转一次
        </Button>
      </div>
    </Card>
  );
}

/* ── 自定义选项编辑 ── */
function CustomEditor({
  city,
  items,
  onRemove,
  onAddToWheel,
}: {
  city: string;
  items: WeekendSpot[];
  onRemove: (id: string) => void;
  onAddToWheel: (name: string) => void;
}) {
  const [text, setText] = useState('');
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim()) {
              onAddToWheel(text.trim());
              setText('');
            }
          }}
          placeholder={`给「${city}」加个好玩的点`}
          className="flex-1 rounded-lg border border-ink/15 bg-paper px-3 py-1.5 text-[13px] outline-none focus:border-ink/40"
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={!text.trim()}
          onClick={() => {
            onAddToWheel(text.trim());
            setText('');
          }}
        >
          加
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-[12px] text-inkFaint">还没有自定义项。转盘默认用「{city}」的高德好玩点。</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((it) => (
            <span
              key={it.id}
              className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2.5 py-1 text-[12px] font-semibold text-inkSoft"
            >
              {it.name}
              <button
                type="button"
                onClick={() => onRemove(it.id)}
                className="text-inkFaint hover:text-rose"
                aria-label="删除"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 手动搜 ── */
function ManualSearch({
  search,
  onAddToWheel,
  onPlan,
  kmOf,
}: {
  search: ReturnType<typeof usePoiSearch>;
  onAddToWheel: (s: WeekendSpot) => void;
  onPlan: (s: WeekendSpot) => void;
  kmOf: (s: WeekendSpot) => number | undefined;
}) {
  const [text, setText] = useState('');
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') search.search(text);
          }}
          placeholder="比如：迪士尼、咖啡馆、滨江步道"
          className="flex-1 rounded-lg border border-ink/15 bg-paper px-3 py-1.5 text-[13px] outline-none focus:border-ink/40"
        />
        <Button size="sm" variant="primary" onClick={() => search.search(text)} disabled={search.loading}>
          {search.loading ? '搜…' : '搜索'}
        </Button>
      </div>
      {search.error && <p className="text-[12px] text-rose">{search.error}</p>}
      {search.results.length === 0 && !search.loading && (
        <p className="text-[12px] text-inkFaint">高德返回真实地点后，可加入转盘或直接进计划。</p>
      )}
      <div className="space-y-2">
        {search.results.map((s) => (
          <Card key={s.id} className="flex items-center gap-3 p-3">
            <span className="text-xl">{s.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold">{s.name}</p>
              <p className="truncate text-[12px] text-inkSoft">
                {s.address}
                {kmOf(s) != null ? ` · 约 ${kmOf(s)!.toFixed(1)} km` : ''}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              <Button size="sm" variant="primary" onClick={() => onPlan(s)}>
                进计划
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onAddToWheel(s)}>
                入转盘
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ── 小红书导入 ── */
function XhsImport({
  xhs,
  search,
  onAddToWheel,
  onPlan,
  kmOf,
}: {
  xhs: ReturnType<typeof useXhsImport>;
  search: ReturnType<typeof usePoiSearch>;
  onAddToWheel: (s: WeekendSpot) => void;
  onPlan: (s: WeekendSpot) => void;
  kmOf: (s: WeekendSpot) => number | undefined;
}) {
  const [url, setUrl] = useState('');
  // 解析出的候选：标题 + 地点标签，统一进高德搜
  const candidates = useMemo(() => {
    if (!xhs.parsed) return [];
    const list: { label: string; q: string }[] = [];
    if (xhs.parsed.title) list.push({ label: xhs.parsed.title, q: xhs.parsed.title });
    xhs.parsed.locations.forEach((l) => list.push({ label: `地点标签：${l}`, q: l }));
    return list;
  }, [xhs.parsed]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="粘贴小红书笔记链接 xiaohongshu.com/..."
          className="flex-1 rounded-lg border border-ink/15 bg-paper px-3 py-1.5 text-[13px] outline-none focus:border-ink/40"
        />
        <Button
          size="sm"
          variant="primary"
          disabled={!url.trim() || xhs.loading}
          onClick={() => xhs.parse(url)}
        >
          {xhs.loading ? '抓…' : '导入'}
        </Button>
      </div>

      {xhs.error && (
        <Card className="border-dashed p-3">
          <p className="text-[12.5px] text-rose">{xhs.error}</p>
          <p className="mt-1 text-[12px] text-inkFaint">
            小红书可能拦截了服务端抓取。你可以把笔记里的地点名直接填到「手动搜」里找。
          </p>
        </Card>
      )}

      {xhs.parsed && (
        <Card className="p-3">
          <p className="text-[13px] font-bold">{xhs.parsed.title || '（无标题）'}</p>
          {xhs.parsed.desc && (
            <p className="mt-1 line-clamp-3 text-[12px] text-inkSoft">{xhs.parsed.desc}</p>
          )}
          <p className="mt-2 text-[12px] font-bold text-inkFaint">抓到的候选，去高德找真实坐标：</p>
          <div className="mt-2 space-y-2">
            {candidates.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[12.5px]">{c.label}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await search.search(c.q);
                  }}
                >
                  高德搜
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {search.results.length > 0 && (
        <div className="space-y-2">
          <p className="text-[12px] font-bold text-inkFaint">高德匹配结果</p>
          {search.results.map((s) => (
            <Card key={s.id} className="flex items-center gap-3 p-3">
              <span className="text-xl">{s.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold">{s.name}</p>
                <p className="truncate text-[12px] text-inkSoft">
                  {s.address}
                  {kmOf(s) != null ? ` · 约 ${kmOf(s)!.toFixed(1)} km` : ''}
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <Button size="sm" variant="primary" onClick={() => onPlan(s)}>
                  进计划
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onAddToWheel(s)}>
                  入转盘
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
