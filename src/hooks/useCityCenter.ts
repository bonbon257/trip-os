import { useCallback, useEffect, useState } from 'react';
import { useStore, LOCATION_TTL_MS } from '@/services/store';

/**
 * 周末侧的城市中心点（三级降级）
 * ────────────────────────────────────────────────────────────
 *
 * 为什么不只用 navigator.geolocation：第一次进页面就要授权会烦，且
 * 不少用户拒绝授位；只用 homeCity 设置又拿不到真实位置。
 *
 * 取数顺序（取不到就返回 null，调用方必须诚实标注数据来源）：
 *   1. 浏览器已授权的定位（navigator.geolocation）—— 仅在用户此前已授权时使用，**不弹框**
 *   2. AMap /ip —— 无需授权，城市级（高德矩形中心），dev 环境从 localhost 调用失败属正常
 *   3. homeCity 设置 + /api/map/geocode —— 当前 homeCity 转坐标
 *   4. null —— UI 必须明确告知「没有实时位置」，不能拿静态数据冒充
 */
export interface CityCenter {
  lat: number;
  lng: number;
  /** 数据来源，用于 UI 区分「实时附近」与「城市级估算」与「随机探索」 */
  source: 'location' | 'ip' | 'geocode';
  /** 解析出来的城市名（高德返回） */
  cityName?: string;
  /** 高德 IP 定位的矩形边界（仅 source==='ip' 时有） */
  rectangle?: { west: number; south: number; east: number; north: number };
}

interface GeocodeResp {
  ok: boolean;
  lng?: number;
  lat?: number;
  city?: string;
}

interface IpResp {
  ok: boolean;
  lng?: number;
  lat?: number;
  city?: string;
  province?: string;
  rectangle?: CityCenter['rectangle'];
}

async function geocodeCity(city: string): Promise<CityCenter | null> {
  try {
    const res = await fetch('/api/map/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: city }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GeocodeResp;
    if (!data.ok || !Number.isFinite(data.lat) || !Number.isFinite(data.lng)) return null;
    return { lat: data.lat as number, lng: data.lng as number, source: 'geocode', cityName: data.city };
  } catch {
    return null;
  }
}

async function ipLocate(): Promise<CityCenter | null> {
  try {
    const res = await fetch('/api/map/ip');
    if (!res.ok) return null;
    const data = (await res.json()) as IpResp;
    if (!data.ok || !Number.isFinite(data.lat) || !Number.isFinite(data.lng)) return null;
    return {
      lat: data.lat as number,
      lng: data.lng as number,
      source: 'ip',
      cityName: data.city,
      rectangle: data.rectangle,
    };
  } catch {
    return null;
  }
}

/** 只在用户此前已授权时静默取一次定位，不主动弹权限框 */
function trySilentLocation(): Promise<CityCenter | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    // Safari 不支持 permissions.query({name:'geolocation'})，直接跳过
    if (!navigator.permissions?.query) return resolve(null);
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        if (status.state !== 'granted') return resolve(null);
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, source: 'location' }),
          () => resolve(null),
          { timeout: 6000, maximumAge: 10 * 60 * 1000 },
        );
      })
      .catch(() => resolve(null));
  });
}

/** 主动申请一次定位（用户点击「使用我的位置」时调用） */
export function requestGeolocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 10000, maximumAge: 0, enableHighAccuracy: false },
    );
  });
}

/**
 * 周末侧的城市中心点（三级降级 + 用户授权的精确位置优先）
 *
 * 取数顺序：
 *   0. 用户点过「使用我的位置」的精确坐标（settings.coords，最优先）
 *   1. 浏览器已授权的定位（不弹框，仅 permissions.state === 'granted' 时）
 *   2. AMap /ip —— 无需授权，城市级（dev 环境从 localhost 调用会失败，属正常）
 *   3. homeCity 设置 + /api/map/geocode
 *   4. null —— UI 必须诚实标注「随机探索」
 */
export function useCityCenter(): {
  center: CityCenter | null;
  /** 是否已拿到精确位置（用于决定是否显示「使用我的位置」） */
  precise: boolean;
  /** 用户是否拒绝过（拒绝后不再打扰） */
  denied: boolean;
  requesting: boolean;
  /** 主动申请定位：成功写入 settings.coords */
  request: () => Promise<boolean>;
} {
  const homeCity = useStore((s) => s.settings.homeCity);
  const saved = useStore((s) => s.settings.coords);
  const coordsAt = useStore((s) => s.settings.coordsAt);
  const denied = useStore((s) => s.settings.locationDenied ?? false);
  const updateSettings = useStore((s) => s.updateSettings);

  const [center, setCenter] = useState<CityCenter | null>(null);
  const [requesting, setRequesting] = useState(false);

  const request = useCallback(async () => {
    setRequesting(true);
    try {
      const got = await requestGeolocation();
      if (got) {
        updateSettings({ coords: got, coordsAt: new Date().toISOString(), locationDenied: false });
        setCenter({ ...got, source: 'location' });
        return true;
      }
      updateSettings({ locationDenied: true });
      return false;
    } finally {
      setRequesting(false);
    }
  }, [updateSettings]);

  // 已存的精确坐标：只要在有效期内就直接用
  const savedFresh =
    saved &&
    coordsAt &&
    Date.now() - new Date(coordsAt).getTime() < LOCATION_TTL_MS;

  useEffect(() => {
    if (savedFresh) {
      setCenter({ lat: saved.lat, lng: saved.lng, source: 'location' });
      return;
    }
    let cancelled = false;
    (async () => {
      const located = await trySilentLocation();
      if (cancelled) return;
      if (located) {
        setCenter(located);
        return;
      }
      const ip = await ipLocate();
      if (cancelled) return;
      if (ip) {
        setCenter(ip);
        return;
      }
      const geo = homeCity ? await geocodeCity(homeCity) : null;
      if (cancelled) return;
      setCenter(geo);
    })();
    return () => {
      cancelled = true;
    };
  }, [homeCity, savedFresh, saved?.lat, saved?.lng]);

  return {
    center,
    precise: center?.source === 'location',
    denied,
    requesting,
    request,
  };
}

/** 给 UI 用的来源文案 */
export function describeCenterSource(s: CityCenter['source'] | undefined): string {
  switch (s) {
    case 'location':
      return '实时定位';
    case 'ip':
      return '城市级（IP）';
    case 'geocode':
      return '城市级（已设城市）';
    default:
      return '随机探索';
  }
}