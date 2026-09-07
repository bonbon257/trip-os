import { useEffect, useRef, useState } from 'react';
import type { MapPoint } from './MockMap';
import type { Place } from '@/types';
import {
  loadAMap,
  type AMapFullNamespace,
  type AMapMapInstance,
  type AMapMarkerInstance,
  type AMapRoutePlanner,
  type AMapLayerLike,
  type RoutePlannerCtor,
} from '@/services/amap';
import { Button, cx } from '@/components/ui';

export type RouteMode = 'driving' | 'walking' | 'transit';

/** 坐标有效：非 null、非 NaN、非 (0,0)（后端历史数据空坐标会转成 0） */
const hasValidGeo = (p: MapPoint) =>
  Number.isFinite(p.place.lng) &&
  Number.isFinite(p.place.lat) &&
  (Math.abs(p.place.lng ?? 0) > 0.001 || Math.abs(p.place.lat ?? 0) > 0.001);

/**
 * 高德真地图（AMap JS API 2.0）
 *
 * 架构（两段式，避免 destroy/recreate 的空窗白屏）：
 *   · Effect A（仅挂载）：loadAMap + new AMap.Map 只做一次 → setMapReady
 *   · Effect B（mapReady/points/mode/city/showSubway 变化）：只清/画覆盖物
 *     （markers / 路线 planners / 地铁图层），地图实例始终复用
 *
 * 失败透明化：
 *   · 脚本/key 加载失败 → 显示真实错误信息（不再静默回落 Mock）
 *   · 无有效坐标 → fallback（MockMap + 提示）
 */
export function AMapView({
  points,
  selectedId,
  onSelect,
  className,
  showRoute = true,
  showLabels = true,
  mode = 'driving',
  city,
  showSubway = false,
  fallback,
  fallbackOnError,
  wishlist,
  /** 多城市：按城市给已排期标记上色（返回颜色或 undefined 用默认） */
  pointColor,
  /** 多城市：城市中心连线（按走法顺序），用于展示「顺路」总览 */
  cityRoute,
}: {
  points: MapPoint[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  className?: string;
  showRoute?: boolean;
  showLabels?: boolean;
  mode?: RouteMode;
  city?: string;
  showSubway?: boolean;
  fallback: React.ReactNode;
  /** 真实地图加载失败时 fallback，不填则显示错误卡片 */
  fallbackOnError?: React.ReactNode;
  wishlist?: MapPoint[];
  pointColor?: (place: Place) => string | undefined;
  cityRoute?: { lng: number; lat: number; name: string }[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const amapRef = useRef<AMapFullNamespace | null>(null);
  const mapRef = useRef<AMapMapInstance | null>(null);
  const markersRef = useRef<Map<string, AMapMarkerInstance>>(new Map());
  const wishlistMarkersRef = useRef<Map<string, AMapMarkerInstance>>(new Map());
  const straightLineRef = useRef<Array<{ setMap: (m: AMapMapInstance | null) => void }> | null>(null);
  const wishlistLineRef = useRef<Array<{ setMap: (m: AMapMapInstance | null) => void }> | null>(null);
  const cityRouteRef = useRef<Array<{ setMap: (m: AMapMapInstance | null) => void }> | null>(null);
  const plannersRef = useRef<AMapRoutePlanner[]>([]);
  const subwayLayerRef = useRef<AMapLayerLike | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  // 局部重加载计数器：仅重跑地图加载，不做整页刷新（避免刷新丢视图 / 误以为行程被换）
  const [reloadKey, setReloadKey] = useState(0);

  const geoPoints = points.filter(hasValidGeo);
  const wishlistGeo = (wishlist ?? []).filter(hasValidGeo);
  const pointsKey = JSON.stringify(points.map((p) => p.place.id));
  const wishlistKey = JSON.stringify((wishlist ?? []).map((p) => p.place.id));

  // ── Effect A：创建地图（reloadKey 变化即重跑加载）─────────────
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    (async () => {
      try {
        // 仅首次用缓存；重试时 force 重新拉取脚本，避免拿到上次失败的缓存
        const AMap = await loadAMap({ force: reloadKey > 0 });
        if (cancelled || !containerRef.current) return;
        amapRef.current = AMap;
        const map = new AMap.Map(containerRef.current, {
          center: [121.4737, 31.2304], // 默认上海，Effect B 会 fitBounds 到行程
          zoom: 12,
          viewMode: '2D',
        });
        mapRef.current = map;
        setMapReady(true);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'map load failed');
        }
      }
    })();
    return () => {
      cancelled = true;
      try {
        mapRef.current?.destroy();
      } catch {
        /* ignore */
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  // ── Effect B：覆盖物（markers / 路线 / 地铁）随行程变化重画 ──
  useEffect(() => {
    const AMap = amapRef.current;
    const map = mapRef.current;
    if (!mapReady || !AMap || !map) return;

    const clearOverlays = () => {
      // 每步单独 try/catch：一步失败不能跳过其余清理
      plannersRef.current.forEach((p) => {
        try { p.clear(); } catch { /* */ }
      });
      plannersRef.current = [];
      straightLineRef.current?.forEach((p) => {
        try { p.setMap(null); } catch { /* */ }
      });
      straightLineRef.current = null;
      wishlistLineRef.current?.forEach((p) => {
        try { p.setMap(null); } catch { /* */ }
      });
      wishlistLineRef.current = null;
      cityRouteRef.current?.forEach((p) => {
        try { p.setMap(null); } catch { /* */ }
      });
      cityRouteRef.current = null;
      markersRef.current.forEach((m) => {
        try { m.setMap(null); } catch { /* */ }
      });
      markersRef.current.clear();
      wishlistMarkersRef.current.forEach((m) => {
        try { m.setMap(null); } catch { /* */ }
      });
      wishlistMarkersRef.current.clear();
      if (subwayLayerRef.current) {
        try { subwayLayerRef.current.setMap(null); } catch { /* */ }
        subwayLayerRef.current = null;
      }
    };

    clearOverlays();

    const cityRouteGeo = (cityRoute ?? []).filter(
      (c) => Number.isFinite(c.lng) && Number.isFinite(c.lat) && (Math.abs(c.lng) > 0.001 || Math.abs(c.lat) > 0.001),
    );
    if (cityRouteGeo.length >= 2) {
      drawCityRoute(AMap, map, cityRouteGeo, cityRouteRef);
    }

    if (!geoPoints.length && !wishlistGeo.length && cityRouteGeo.length < 2) return;

    renderMarkers(AMap, map, geoPoints, markersRef.current, showLabels, onSelect, pointColor);
    fitBounds(map, [...geoPoints, ...wishlistGeo, ...cityRouteGeo.map((c) => ({ place: { lng: c.lng, lat: c.lat } }))]);

    if (wishlistGeo.length) {
      renderWishlistMarkers(AMap, map, wishlistGeo, wishlistMarkersRef.current, onSelect);
      drawDashedLine(AMap, map, wishlistGeo, wishlistLineRef);
    }

    if (showRoute && geoPoints.length >= 2) {
      if (mode === 'driving' || mode === 'walking' || (mode === 'transit' && city)) {
        drawRoutesByMode(AMap, map, geoPoints, mode, city!, plannersRef);
      } else {
        drawStraightLine(AMap, map, geoPoints, straightLineRef);
      }
    }

    if (showSubway && city) {
      try {
        const layer = new AMap.Subway({ city });
        layer.setMap(map);
        subwayLayerRef.current = layer;
      } catch (err) {
        // 海外城市可能没数据，不阻塞主图
        console.warn('AMap.Subway load failed for', city, err);
      }
    }

    return clearOverlays;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, pointsKey, wishlistKey, mode, city, showSubway, pointColor, cityRoute]);

  // ── 选中变化：居中（不重建覆盖物）───────────────────────
  useEffect(() => {
    if (!selectedId || !mapRef.current) return;
    const sel = geoPoints.find((p) => p.place.id === selectedId);
    if (sel?.place.lng && sel?.place.lat) {
      mapRef.current.setZoomAndCenter(14, [sel.place.lng, sel.place.lat]);
    }
  }, [selectedId, geoPoints]);

  // 加载失败 → 优先用调用方 fallback；没有则显示真实原因（不静默回落 Mock）
  if (loadError) {
    if (fallbackOnError) return <>{fallbackOnError}</>;
    return (
      <div className={cx('flex flex-col items-center justify-center gap-2 rounded-card border-[1.5px] border-rose/40 bg-rose/5 p-6 text-center', className)}>
        <p className="text-[13px] font-bold text-rose">真实地图加载失败</p>
        <p className="max-w-md text-[11.5px] leading-relaxed text-inkSoft">{loadError}</p>
        <Button
          size="sm"
          variant="primary"
          className="mt-1"
          onClick={() => setReloadKey((k) => k + 1)}
        >
          重试
        </Button>
      </div>
    );
  }

  // 无有效坐标 → fallback（MockMap）
  if (!geoPoints.length && !wishlistGeo.length) {
    return <>{fallback}</>;
  }

  return (
    <div className={cx('relative overflow-hidden rounded-card border-[1.5px] border-ink', className)}>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

// ── 标记（顺序、悬停色块）────────────────────────────────────
function renderMarkers(
  AMap: AMapFullNamespace,
  map: AMapMapInstance,
  points: MapPoint[],
  markers: Map<string, AMapMarkerInstance>,
  showLabels: boolean,
  onSelect?: (id: string) => void,
  colorFor?: (place: Place) => string | undefined,
) {
  markers.forEach((m) => m.setMap(null));
  markers.clear();

  const ordered = sortByOrder(points);

  ordered.forEach((p, i) => {
    const isFirst = i === 0;
    const isLast = i === ordered.length - 1;
    const color =
      p.done
        ? '#9CB69A'
        : colorFor?.(p.place) ?? (isFirst ? '#2C2C2C' : isLast ? '#AE3A3A' : '#3737B0');

    const html = `
      <div style="
        width: 30px; height: 30px;
        margin-left: -15px; margin-top: -30px;
        border-radius: 50%;
        background: ${color};
        color: white; font-weight: 800; font-size: 14px;
        line-height: 28px; text-align: center;
        border: 2px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.25);
        font-family: -apple-system, sans-serif;
      ">${i + 1}</div>
      ${showLabels && p.done ? '<div style="position:absolute;left:50%;top:30px;transform:translateX(-50%);font-size:10px;color:#9CB69A;font-weight:700;">✓ 完成</div>' : ''}
    `;
    const marker = new AMap.Marker({
      position: [p.place.lng!, p.place.lat!],
      title: p.place.name,
      extData: p.place.id,
      offset: [0, 0],
    });
    (marker as unknown as { setContent: (html: string) => void }).setContent(html);
    marker.setMap(map);
    if (onSelect) {
      marker.on('click', () => onSelect(p.place.id));
    }
    markers.set(p.place.id, marker);
  });
}

// ── 想去（未排期）标记：白底空心圆 + 次要描边，区别于实心 scheduled ──
function renderWishlistMarkers(
  AMap: AMapFullNamespace,
  map: AMapMapInstance,
  points: MapPoint[],
  markers: Map<string, AMapMarkerInstance>,
  onSelect?: (id: string) => void,
) {
  markers.forEach((m) => m.setMap(null));
  markers.clear();

  const ordered = sortByOrder(points);

  ordered.forEach((p) => {
    const html = `
      <div style="
        width: 28px; height: 28px;
        margin-left: -14px; margin-top: -28px;
        border-radius: 50%;
        background: #FFFFFF;
        color: #6B6B82; font-size: 14px;
        line-height: 26px; text-align: center;
        border: 2px solid #B8B8C8;
        box-shadow: 0 2px 6px rgba(0,0,0,0.18);
        font-family: -apple-system, sans-serif;
      ">📍</div>
    `;
    const marker = new AMap.Marker({
      position: [p.place.lng!, p.place.lat!],
      title: p.place.name,
      extData: p.place.id,
      offset: [0, 0],
    });
    (marker as unknown as { setContent: (html: string) => void }).setContent(html);
    marker.setMap(map);
    if (onSelect) {
      marker.on('click', () => onSelect(p.place.id));
    }
    markers.set(p.place.id, marker);
  });
}

// ── 出行方式: 驾车 / 步行 / 公交 ───────────────────────────
function drawRoutesByMode(
  AMap: AMapFullNamespace,
  map: AMapMapInstance,
  points: MapPoint[],
  mode: RouteMode,
  city: string,
  plannersRef: React.MutableRefObject<AMapRoutePlanner[]>,
) {
  plannersRef.current.forEach((p) => {
    try { p.clear(); } catch { /* */ }
  });
  plannersRef.current = [];

  let Planner: RoutePlannerCtor;
  if (mode === 'walking') Planner = AMap.Walking as unknown as RoutePlannerCtor;
  else if (mode === 'transit') Planner = AMap.Transfer as unknown as RoutePlannerCtor;
  else Planner = AMap.Driving as unknown as RoutePlannerCtor;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i].place;
    const b = points[i + 1].place;
    if (!a.lng || !a.lat || !b.lng || !b.lat) continue;
    const plannerOpts: Record<string, unknown> = { map, autoFitView: false };
    if (mode === 'transit') plannerOpts.city = city;
    const planner = new Planner(plannerOpts);
    planner.search([a.lng, a.lat], [b.lng, b.lat], () => {
      /* 失败时回调 status='error'，polylines 不会画到地图上 */
    });
    plannersRef.current.push(planner);
  }
}

// ── 直线 fallback ─────────────────────────────────────────
function drawStraightLine(
  AMap: AMapFullNamespace,
  map: AMapMapInstance,
  points: MapPoint[],
  ref: React.MutableRefObject<Array<{ setMap: (m: AMapMapInstance | null) => void }> | null>,
) {
  if (ref.current) {
    ref.current.forEach((p) => {
      try { p.setMap(null); } catch { /* */ }
    });
  }
  const polylines: Array<{ setMap: (m: AMapMapInstance | null) => void }> = [];
  ref.current = polylines;
  const path = points.map((p) => [p.place.lng!, p.place.lat!] as [number, number]);
  const polyline = new AMap.Polyline({ path, strokeColor: '#3737B0', strokeWeight: 4, strokeOpacity: 0.6 });
  (polyline as unknown as { setMap: (m: AMapMapInstance | null) => void }).setMap(map);
  polylines.push(polyline as unknown as { setMap: (m: AMapMapInstance | null) => void });
}

// ── 想去连线：次要色虚线（区别于 scheduled 实线）──────────────────
function drawDashedLine(
  AMap: AMapFullNamespace,
  map: AMapMapInstance,
  points: MapPoint[],
  ref: React.MutableRefObject<Array<{ setMap: (m: AMapMapInstance | null) => void }> | null>,
) {
  if (ref.current) {
    ref.current.forEach((p) => {
      try { p.setMap(null); } catch { /* */ }
    });
  }
  const polylines: Array<{ setMap: (m: AMapMapInstance | null) => void }> = [];
  ref.current = polylines;
  const path = points.map((p) => [p.place.lng!, p.place.lat!] as [number, number]);
  const polyline = new AMap.Polyline({
    path,
    strokeColor: '#B8B8C8',
    strokeWeight: 3,
    strokeOpacity: 0.85,
    strokeStyle: 'dashed',
  });
  (polyline as unknown as { setMap: (m: AMapMapInstance | null) => void }).setMap(map);
  polylines.push(polyline as unknown as { setMap: (m: AMapMapInstance | null) => void });
}

// ── 多城市：城市中心连线（按走法顺序），展示「顺路」总览 ──
function drawCityRoute(
  AMap: AMapFullNamespace,
  map: AMapMapInstance,
  route: { lng: number; lat: number }[],
  ref: React.MutableRefObject<Array<{ setMap: (m: AMapMapInstance | null) => void }> | null>,
) {
  if (ref.current) {
    ref.current.forEach((p) => {
      try { p.setMap(null); } catch { /* */ }
    });
  }
  const polylines: Array<{ setMap: (m: AMapMapInstance | null) => void }> = [];
  ref.current = polylines;
  const path = route.map((c) => [c.lng, c.lat] as [number, number]);
  const polyline = new AMap.Polyline({
    path,
    strokeColor: '#F59E0B',
    strokeWeight: 4,
    strokeOpacity: 0.9,
    strokeStyle: 'dashed',
    showDir: true,
  });
  (polyline as unknown as { setMap: (m: AMapMapInstance | null) => void }).setMap(map);
  polylines.push(polyline as unknown as { setMap: (m: AMapMapInstance | null) => void });
}

// ── 视野适配 ────────────────────────────────────────────────
function fitBounds(map: AMapMapInstance, points: Array<{ place: { lng?: number; lat?: number } }>) {
  if (points.length === 0) return;
  if (points.length === 1) {
    const p = points[0].place;
    if (p.lng != null && p.lat != null) map.setZoomAndCenter(12, [p.lng, p.lat]);
    return;
  }
  const lns = points.map((p) => p.place.lng!).filter((n) => Number.isFinite(n));
  const lts = points.map((p) => p.place.lat!).filter((n) => Number.isFinite(n));
  if (!lns.length) return;
  const minLng = Math.min(...lns);
  const maxLng = Math.max(...lns);
  const minLat = Math.min(...lts);
  const maxLat = Math.max(...lts);
  const center: [number, number] = [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
  const dLng = Math.max(maxLng - minLng, 0.02);
  const dLat = Math.max(maxLat - minLat, 0.02);
  const span = Math.max(dLng, dLat);
  const zoom = span > 4 ? 7 : span > 1 ? 9 : span > 0.3 ? 11 : 13;
  map.setZoomAndCenter(zoom, center);
}

function sortByOrder(points: MapPoint[]) {
  return [...points].sort((a, b) => a.order - b.order);
}

/** 非内联错误对话框 — 给 MapPage 用 */
export function AMapErrorFallback({
  onRetry,
  reason = 'load',
}: {
  onRetry: () => void;
  reason?: 'load' | 'noGeo';
}) {
  const isNoGeo = reason === 'noGeo';
  return (
    <div className="rounded-card border-[1.5px] border-amber/40 bg-amber/8 p-4 text-[12.5px] text-inkSoft">
      <p className="font-bold text-ink">
        {isNoGeo ? '这些地点还没有精确坐标' : '真地图加载失败'}
      </p>
      <p className="mt-1">
        {isNoGeo
          ? '当前只显示示意图。有经纬度的地点会自动切换成真实高德地图。'
          : '高德 JS API key 未配置或网络受限。你可以：'}
      </p>
      {!isNoGeo && (
        <ul className="mt-1 list-disc pl-5">
          <li>去「设置 → 服务」填入 JS API Key 和安全密钥</li>
          <li>查看浏览器 Network 面板是否有 webapi.amap.com 请求失败</li>
        </ul>
      )}
      <Button className="mt-2" size="sm" variant="primary" onClick={onRetry}>
        {isNoGeo ? '刷新试试' : '重试'}
      </Button>
    </div>
  );
}