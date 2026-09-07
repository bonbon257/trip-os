import { useEffect, useState } from 'react';

/** spin-pool.json 里的单条 POI（由 scripts/build-spin-pool.tsx 生成） */
export interface SpinPoolPoi {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
  openTime?: string;
  /** 来自 cities-cn 的 highlights（编辑精选过），转盘优先展示 */
  curated?: boolean;
}

export interface SpinPoolCity {
  lat: number;
  lng: number;
  pois: SpinPoolPoi[];
}

export interface SpinPool {
  generatedAt: string;
  categories: string[];
  cityCount: number;
  poiCount: number;
  cities: Record<string, SpinPoolCity>;
}

/**
 * 大转盘预制候选池（城市级，来自高德扫描）。
 * 放在 public/ 下，按需 fetch，不进主 bundle。
 */
export function useSpinPool() {
  const [pool, setPool] = useState<SpinPool | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/spin-pool.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: SpinPool) => {
        if (!cancelled) {
          setPool(j);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '加载失败');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { pool, loading, error };
}

/** 把「南京市 / 北京市朝阳区」这类名字规整成 spin-pool 的短键（南京 / 北京） */
export function normalizeCityKey(name: string): string {
  return (
    name
      .replace(/(城区|市辖区|市|自治州|地区|自治县|县|盟|特别行政区|新区|郊区)$/, '')
      .trim() || name
  );
}
