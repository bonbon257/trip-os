/**
 * 行程页内嵌 POI 搜索
 * ────────────────────────────────────────────────────────────
 * 用户在地点池抽屉里直接搜目的地更多地点 (博物馆/咖啡/自然/美食...),
 * 走服务端代理调用高德 place/text API, 加进 store.discoveredPlaces。
 *
 * 数据流: POI 搜索 -> addDiscoveredPlace(place) -> 自动出现在下方的 PlacePool 列表里
 */
import { useState } from 'react';
import { useStore } from '@/services/store';
import { getDestination } from '@/data/destinations';
import { Button, Input, Tag, toast, cx } from '@/components/ui';
import type { Place } from '@/types';

const QUICK = ['博物馆', '咖啡', '美食', '公园', '景点', '购物', '夜生活', '小众'];

interface PoiCandidate {
  id: string;
  name: string;
  address: string;
  lng: number;
  lat: number;
  type: string;
}

interface POISearchProps {
  destName: string;
  destId: string;
  /** 加入地点池后额外触发：例如直接排到当天。调用方负责已成功加入。 */
  onAdd?: (place: Place) => void;
}

const catMap: Record<string, Place['category']> = {
  美食: 'food',
  咖啡: 'food',
  博物馆: 'culture',
  景点: 'sight',
  公园: 'nature',
  购物: 'shopping',
  酒店: 'stay',
  文化: 'culture',
  娱乐: 'entertainment',
};

function lastType(type: string): string {
  return type.split(';').pop() ?? '景点';
}

function emojiFor(type: string): string {
  const t = lastType(type);
  return t === '博物馆' ? '🏺' : t === '美食' ? '🍜' : t === '咖啡' ? '☕' : t === '公园' ? '🌳' : '📍';
}

export function POISearch({ destName, destId, onAdd }: POISearchProps) {
  const addDiscoveredPlace = useStore((s) => s.addDiscoveredPlace);
  const discoveredPlaces = useStore((s) => s.db.travelDiscoveredPlaces);
  const [kw, setKw] = useState('博物馆');
  const [results, setResults] = useState<PoiCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // 目的地中心 + 是否海外：高德 POI 只覆盖国内，海外城市会退化成全国搜索返回错误结果
  const dest = getDestination(destId);
  const isInternational = dest?.scope === 'international';

  /** POI 离目的地中心超过 150km 视为无效（防止全国搜索的假结果混进来拉飞地图） */
  const nearDest = (p: PoiCandidate): boolean => {
    if (!dest) return true;
    const dx = (p.lng - dest.lng) * 111 * Math.cos((dest.lat * Math.PI) / 180);
    const dy = (p.lat - dest.lat) * 111;
    return Math.hypot(dx, dy) < 150;
  };

  const search = async (term: string) => {
    setKw(term);
    if (!term.trim()) return;
    if (isInternational) {
      setError('高德 POI 搜索只支持国内城市，海外地点请手动添加或用精编地点池');
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/map/poi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: destName, keywords: term, pageSize: 8 }),
      });
      const data = (await res.json()) as { ok: boolean; pois?: PoiCandidate[]; error?: string };
      if (!data.ok) {
        setError(data.error ?? '搜索失败');
        setResults([]);
      } else {
        const valid = (data.pois ?? []).filter(nearDest);
        if (valid.length === 0 && (data.pois ?? []).length > 0) {
          setError('搜到的地点都不在目的地附近，换个更具体的词试试');
        }
        setResults(valid);
        setOpen(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败');
    } finally {
      setLoading(false);
    }
  };

  const add = (p: PoiCandidate, destId: string) => {
    // 坐标无效的 POI 不进池子（避免 (0,0) 把地图视野拉飞）
    if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat) || Math.abs(p.lng) < 0.001 || Math.abs(p.lat) < 0.001) {
      toast('这个地点没有精确坐标，先不加入', 'warn');
      return;
    }
    const last = lastType(p.type);
    const place: Place = {
      id: `poi-${p.id}`,
      destinationId: destId,
      name: p.name,
      category: catMap[last] ?? 'sight',
      x: ((p.lng + 180) / 360) * 100,
      y: ((90 - p.lat) / 180) * 100,
      lat: p.lat,
      lng: p.lng,
      address: p.address,
      avgCost: 0,
      durationMin: 90,
      tags: [last],
      indoor: false,
      emoji: emojiFor(p.type),
      description: p.address || `${destName} ${last}`,
    };
    addDiscoveredPlace(place, 'TRAVEL');
    onAdd?.(place);
    toast(`已加入「${p.name}」到地点池`, 'good');
  };

  return (
    <div className="rounded-xl border-[1.5px] border-ink/12 bg-paperDeep/60 px-3 py-2">
      <div className="flex gap-2">
        <Input
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void search(kw)}
          placeholder={`搜更多地点（高德 POI）`}
        />
        <Button onClick={() => void search(kw)} disabled={loading}>
          {loading ? '搜中…' : '搜索'}
        </Button>
      </div>
      <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
        {QUICK.map((k) => (
          <button
            key={k}
            onClick={() => void search(k)}
            className={cx(
              'focus-ring shrink-0 rounded-full border-[1.5px] px-2.5 py-1 text-[11.5px] font-semibold transition',
              kw === k
                ? 'border-ink bg-ink text-white'
                : 'border-ink/15 bg-white text-inkSoft hover:border-ink/40',
            )}
          >
            {k}
          </button>
        ))}
      </div>
      {error && (
        <p className="mt-2 text-[11.5px] text-rose">
          {error}（设置页配置高德 Web 服务 Key 后可用）
        </p>
      )}

      {open && results.length > 0 && (
        <ul className="mt-2 max-h-[180px] divide-y divide-ink/8 overflow-y-auto rounded-lg border-[1.5px] border-ink/12 bg-white">
          {results.map((p) => {
            const already = discoveredPlaces.some((d) => d.id === `poi-${p.id}`);
            return (
              <li key={p.id} className="flex items-start gap-3 px-3 py-2">
                <span className="text-[18px]">{emojiFor(p.type)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold">{p.name}</p>
                  <p className="truncate text-[11px] text-inkFaint">{p.address || '—'}</p>
                </div>
                <button
                  onClick={() => add(p, destId)}
                  disabled={already}
                  className={cx(
                    'focus-ring shrink-0 rounded-lg border-[1.5px] px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-50',
                    already ? 'border-moss/40 bg-moss/15 text-moss' : 'border-ink/15 hover:border-ink',
                  )}
                >
                  {already ? '✓ 已加入' : '+ 加入'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {open && results.length === 0 && !loading && (
        <p className="mt-2 text-center text-[11.5px] text-inkFaint">这个搜索没结果，换个词试试</p>
      )}
      {discoveredPlaces.length > 0 && (
        <p className="mt-1 text-[11px] text-inkFaint">
          已有 {discoveredPlaces.length} 个通过搜索加入的地点（见下方列表）
        </p>
      )}
      <Tag tone="violet" className="mt-1 inline-block">
        {destName} · POI
      </Tag>
    </div>
  );
}

/** 把 discoveredPlaces 合并到 curated places 后面, 去重 */
export function mergedPlaces(curated: Place[], discovered: Place[]): Place[] {
  const ids = new Set(curated.map((p) => p.id));
  return [...curated, ...discovered.filter((p) => !ids.has(p.id))];
}
