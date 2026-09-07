import { useCallback, useState } from 'react';
import { emojiForCategory, isFunAttraction, type WeekendSpot } from './weekendPoi';

interface RawPoi {
  id: string;
  name: string;
  type: string;
  address: string;
  lng: number;
  lat: number;
  openTime?: string;
}

/**
 * 手动填地点：调后端 /api/map/poi（高德 /place/text，按城市搜真实 POI）。
 * 返回可加入转盘 / 周末计划的 WeekendSpot 列表。
 */
export function usePoiSearch(city: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<WeekendSpot[]>([]);

  const search = useCallback(
    async (keyword: string) => {
      const kw = keyword.trim();
      if (!kw) {
        setResults([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/map/poi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ city, keywords: kw, pageSize: 12 }),
        });
        const data = (await res.json()) as { ok: boolean; pois?: RawPoi[]; error?: string };
        if (!data.ok || !data.pois) {
          setError(data.error ?? '搜索失败');
          setResults([]);
          return;
        }
        const mapped = data.pois.map<WeekendSpot>((p) => ({
          id: p.id || `s-${kw}-${p.name}`,
          name: p.name,
          address: p.address,
          lat: p.lat,
          lng: p.lng,
          category: p.type || '精选',
          openTime: p.openTime,
          emoji: emojiForCategory(p.type),
          source: 'search' as const,
        }));
        setResults(mapped.filter(isFunAttraction));
      } catch (e) {
        setError(e instanceof Error ? e.message : '网络错误');
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [city],
  );

  return { results, loading, error, search, setResults };
}
