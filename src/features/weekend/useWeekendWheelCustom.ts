import { useCallback, useEffect, useState } from 'react';
import type { WeekendSpot } from './weekendPoi';

const KEY = 'trip-os:weekend-wheel-custom';

interface StoredCustom {
  id: string;
  name: string;
  city: string;
  address?: string;
  lat?: number;
  lng?: number;
  category?: string;
  emoji?: string;
}

/**
 * 大转盘「自定义选项」：用户在转盘页手动加的好玩点。
 * 按城市分桶（转盘是城市级的），持久化到 localStorage，刷新不丢。
 */
export function useWeekendWheelCustom(city: string) {
  const [all, setAll] = useState<Record<string, StoredCustom[]>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      setAll(raw ? (JSON.parse(raw) as Record<string, StoredCustom[]>) : {});
    } catch {
      setAll({});
    }
  }, []);

  const persist = useCallback((next: Record<string, StoredCustom[]>) => {
    setAll(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* 隐私模式忽略 */
    }
  }, []);

  const items = (all[city] ?? []).map<WeekendSpot>((c) => ({
    id: c.id,
    name: c.name,
    address: c.address,
    lat: c.lat,
    lng: c.lng,
    category: c.category ?? '精选',
    emoji: c.emoji,
    source: 'custom',
    curated: true,
  }));

  const add = useCallback(
    (spot: Omit<WeekendSpot, 'source'>) => {
      const entry: StoredCustom = {
        id: spot.id || `c-${Date.now()}`,
        name: spot.name,
        city,
        address: spot.address,
        lat: spot.lat,
        lng: spot.lng,
        category: spot.category,
        emoji: spot.emoji,
      };
      const bucket = all[city] ?? [];
      if (bucket.some((b) => b.name === spot.name)) return;
      persist({ ...all, [city]: [...bucket, entry] });
    },
    [all, city, persist],
  );

  const remove = useCallback(
    (id: string) => {
      const bucket = all[city] ?? [];
      persist({ ...all, [city]: bucket.filter((b) => b.id !== id) });
    },
    [all, city, persist],
  );

  return { items, add, remove };
}
