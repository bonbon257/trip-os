/**
 * 高德 JS API 加载器
 * ────────────────────────────────────────────────────────────
 *
 * 为什么不在前端硬编码 key, 而是从 /api/config/amap-subkey 拿:
 *   · JS API key 通过服务端代理下发, 前端永远不会看到真实 key 字符串
 *   · 安全密钥 (securityJsCode) 由服务端用 HMAC-SHA256 签出一次性 sub-token
 *     再下发给浏览器, 所以真实安全密钥**永远不出服务端**
 *
 * 调用方式:
 *   const { AMap, lngLat } = await loadAMap();
 *   new AMap.Map(container, { center: [lng, lat], zoom: 11 });
 *
 * 注意:
 *   · 高德 JS API 没有公开的 TypeScript 类型, 这里自定义必要类型
 *   · JS API 包名 (plugin 等) 通过 script URL 的 plugin 参数注入
 */

// ── 最小类型 ──────────────────────────────────────────────
export interface AMapLngLat {
  lng: number;
  lat: number;
  toString(): string;
}
export interface AMapMarkerOpts {
  position: [number, number] | AMapLngLat;
  icon?: unknown;
  title?: string;
  offset?: [number, number];
  extData?: unknown;
}
export interface AMapPolylineOpts {
  path: Array<[number, number]>;
  strokeColor?: string;
  strokeWeight?: number;
  strokeOpacity?: number;
  strokeStyle?: 'solid' | 'dashed';
  showDir?: boolean;
}
export interface AMapMapOpts {
  center?: [number, number] | AMapLngLat;
  zoom?: number;
  viewMode?: '2D' | '3D';
  features?: string[];
  style?: string;
}
export interface AMapMapInstance {
  setCenter(pos: [number, number] | AMapLngLat): void;
  setZoomAndCenter(zoom: number, pos: [number, number] | AMapLngLat): void;
  setBounds(bounds: unknown): void;
  destroy(): void;
  getZoom(): number;
  on(event: string, handler: (...args: unknown[]) => void): void;
}
export interface AMapMarkerInstance {
  setPosition(pos: [number, number] | AMapLngLat): void;
  setMap(m: AMapMapInstance | null): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
  setContent(html: string): void;
  setOffset(x: number, y: number): void;
}
export interface AMapPolylineInstance {
  setMap(m: AMapMapInstance | null): void;
  setPath(path: Array<[number, number]>): void;
}
export interface AMapNamespace {
  Map: new (
    container: HTMLElement,
    opts: AMapMapOpts,
  ) => AMapMapInstance;
  Marker: new (opts: AMapMarkerOpts) => AMapMarkerInstance;
  Polyline: new (opts: AMapPolylineOpts) => AMapPolylineInstance;
  LngLat: new (lng: number, lat: number) => AMapLngLat;
}

let cached: Promise<AMapFullNamespace> | null = null;

// AMap JS API 2.0 入口（v1.4 的 loader/1.4.15/index.js 已下线）
// - key: 浏览器可见的 JS API Key
// - plugin: 一次性把所有用到的插件列上, 避免运行时二次注入
const AMAP_JS = 'https://webapi.amap.com/maps';

const AMapPlugins = [
  'AMap.ToolBar',
  'AMap.Scale',
  'AMap.MoveAnimation',
  'AMap.Driving',
  'AMap.Walking',
  'AMap.Transfer',
  'AMap.Subway',
  'AMap.LineSearch',
];

type GlobalWithAMap = {
  AMap?: AMapFullNamespace;
  _AMapSecurityConfig?: { securityJsCode: string };
};

/**
 * 全量命名空间 (含地铁/路径规划插件) —— AMapView 内会断言这些类是否存在。
 * 高德没有官方 TS 类型, 这里按需扩展。
 */
export interface AMapFullNamespace extends AMapNamespace {
  Driving: new (opts: { map: AMapMapInstance; autoFitView?: boolean }) => AMapRoutePlanner;
  Walking: new (opts: { map: AMapMapInstance; autoFitView?: boolean }) => AMapRoutePlanner;
  Transfer: new (opts: {
    map: AMapMapInstance;
    city: string;
    autoFitView?: boolean;
    nightflag?: boolean;
  }) => AMapRoutePlanner;
  Subway: new (opts: { city: string }) => AMapLayerLike;
  LineSearch: new (opts: { city: string; extensions?: 'base' | 'all' }) => AMapLineSearch;
}

export interface AMapRoutePlanner {
  search(
    origin: [number, number] | AMapLngLat,
    dest: [number, number] | AMapLngLat,
    cb: (status: 'complete' | 'error' | 'no_data', result?: unknown) => void,
  ): void;
  clear(): void;
  /** 路径规划结束后的折线列表（驾车/步行/公交），每个 polyline 是 [[lng,lat], ...] */
  getPolylines?: () => Array<{ lngLatPath: Array<[number, number]>; mode: string }>;
}

export type RoutePlannerCtor = new (opts: any) => AMapRoutePlanner;

export interface AMapLayerLike {
  setMap(m: AMapMapInstance | null): void;
}

export interface AMapLineSearch {
  search(
    keyword: string,
    cb: (status: 'complete' | 'error' | 'no_data', result?: unknown) => void,
  ): void;
}

export async function loadAMap(opts: { force?: boolean } = {}): Promise<AMapFullNamespace> {
  if (cached && !opts.force) return cached;

  cached = (async () => {
    // 1. 从服务端拿凭据
    const subRes = await fetch('/api/config/amap-subkey');
    const subData = (await subRes.json()) as {
      ok: boolean;
      key?: string;
      securityJsCode?: string;
      ts?: number;
      error?: string;
    };
    if (!subData.ok || !subData.key) {
      throw new Error(subData.error ?? 'AMap subkey unavailable');
    }

    // 2. 设置安全配置（高德 JS API 2.0 需要 key + securityJsCode）
    if (subData.securityJsCode) {
      (window as unknown as GlobalWithAMap)._AMapSecurityConfig = {
        securityJsCode: subData.securityJsCode,
      };
    }

    // 3. 加载 JS API（一次注入所有 plugin，URL 与 2.0 文档一致）
    await new Promise<void>((resolve, reject) => {
      const w = window as unknown as GlobalWithAMap;
      if (w.AMap) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.async = true;
      const url = new URL(AMAP_JS);
      url.searchParams.set('v', '2.0');
      url.searchParams.set('key', subData.key!);
      url.searchParams.set('plugin', AMapPlugins.join(','));
      script.src = url.toString();
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('AMap loader failed (network or key invalid)'));
      document.head.appendChild(script);
    });

    const AMap = (window as unknown as GlobalWithAMap).AMap;
    if (!AMap) throw new Error('AMap not loaded');
    return AMap as AMapFullNamespace;
  })();

  return cached;
}

/** 反向地理编码 (地址 -> 经纬度) —— 走服务端代理 */
export async function geocode(address: string, city?: string): Promise<{
  lng: number;
  lat: number;
  formatted: string;
} | null> {
  const res = await fetch('/api/map/geocode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, city }),
  });
  const data = (await res.json()) as {
    ok: boolean;
    lng?: number;
    lat?: number;
    formatted?: string;
  };
  if (!data.ok || data.lng == null || data.lat == null) return null;
  return { lng: data.lng, lat: data.lat, formatted: data.formatted ?? address };
}

/** 路径规划 (多地点 -> 总时长 / 路线) */
export async function planRoute(
  origin: { lng: number; lat: number },
  dest: { lng: number; lat: number },
  mode: 'walking' | 'driving' | 'transit' = 'transit',
  waypoints?: Array<{ lng: number; lat: number }>,
): Promise<{
  minutes: number;
  distance: number;
  polyline: Array<[number, number]>;
} | null> {
  const res = await fetch('/api/map/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: `${origin.lng},${origin.lat}`,
      destination: `${dest.lng},${dest.lat}`,
      mode,
      ...(waypoints && waypoints.length ? { waypoints: waypoints.map((w) => `${w.lng},${w.lat}`) } : {}),
    }),
  });
  const data = (await res.json()) as {
    ok: boolean;
    minutes?: number;
    distance?: number;
    polyline?: Array<[number, number]>;
  };
  if (!data.ok) return null;
  return {
    minutes: data.minutes ?? 0,
    distance: data.distance ?? 0,
    polyline: data.polyline ?? [],
  };
}
