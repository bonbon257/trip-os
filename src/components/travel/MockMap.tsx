import { useMemo } from 'react';
import type { Place } from '@/types';
import { cx } from '@/components/ui';

export interface MapPoint {
  place: Place;
  order: number;
  minutesFromPrev?: number;
  done?: boolean;
}

/**
 * Map Mock：SVG 画布 + Marker + 路线
 * 真实地图 API 接入后由 Map Service 替换渲染层，组件签名保持不变。
 */
export function MockMap({
  points,
  selectedId,
  onSelect,
  className,
  showRoute = true,
  showLabels = true,
}: {
  points: MapPoint[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  className?: string;
  showRoute?: boolean;
  showLabels?: boolean;
}) {
  const box = useMemo(() => {
    if (!points.length) return '0 0 100 100';
    const xs = points.map((p) => p.place.x);
    const ys = points.map((p) => p.place.y);
    const pad = 14;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const size = Math.max(Math.max(...xs) + pad - minX, Math.max(...ys) + pad - minY, 40);
    return `${minX} ${minY} ${size} ${size}`;
  }, [points]);

  const ordered = [...points].sort((a, b) => a.order - b.order);

  return (
    <div className={cx('relative overflow-hidden rounded-card border-[1.5px] border-ink bg-[#F6F3EA]', className)}>
      <svg viewBox={box} className="h-full w-full" role="img" aria-label="行程地图">
        <defs>
          <pattern id="map-grid" width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M6 0 L0 0 0 6" fill="none" stroke="rgba(17,17,17,0.06)" strokeWidth="0.3" />
          </pattern>
          <pattern id="map-grid-lg" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M24 0 L0 0 0 24" fill="none" stroke="rgba(17,17,17,0.1)" strokeWidth="0.4" />
          </pattern>
        </defs>

        <rect x="-200" y="-200" width="600" height="600" fill="url(#map-grid)" />
        <rect x="-200" y="-200" width="600" height="600" fill="url(#map-grid-lg)" />

        {showRoute && ordered.length > 1 && (
          <polyline
            points={ordered.map((p) => `${p.place.x},${p.place.y}`).join(' ')}
            fill="none"
            stroke="#111111"
            strokeWidth="0.9"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity="0.55"
            strokeDasharray="2.4 1.6"
          />
        )}

        {showRoute &&
          ordered.slice(1).map((p, i) => {
            const prev = ordered[i];
            const mx = (prev.place.x + p.place.x) / 2;
            const my = (prev.place.y + p.place.y) / 2;
            if (!p.minutesFromPrev) return null;
            return (
              <g key={`seg-${p.place.id}`} opacity="0.9">
                <rect x={mx - 5.2} y={my - 2.6} rx="2.2" width="10.4" height="5.2" fill="#FFFFFF" stroke="#111111" strokeWidth="0.4" />
                <text x={mx} y={my + 1.1} textAnchor="middle" fontSize="2.9" fontWeight="700" fill="#111111">
                  {p.minutesFromPrev} min
                </text>
              </g>
            );
          })}

        {ordered.map((p) => {
          const active = selectedId === p.place.id;
          return (
            <g
              key={p.place.id}
              className="cursor-pointer"
              onClick={() => onSelect?.(p.place.id)}
            >
              <title>{p.place.name}</title>
              <text x={p.place.x} y={p.place.y - 4.4} textAnchor="middle" fontSize="4.6">
                {p.place.emoji}
              </text>
              <circle
                cx={p.place.x}
                cy={p.place.y}
                r={active ? 4.2 : 3.2}
                fill={active ? '#7C5CFF' : p.done ? '#22A06B' : '#FFFFFF'}
                stroke="#111111"
                strokeWidth={active ? 1.1 : 0.8}
              />
              <text
                x={p.place.x}
                y={p.place.y + 1.1}
                textAnchor="middle"
                fontSize="3"
                fontWeight="800"
                fill={active || p.done ? '#FFFFFF' : '#111111'}
              >
                {p.order + 1}
              </text>
              {showLabels && (
                <text
                  x={p.place.x}
                  y={p.place.y + 8}
                  textAnchor="middle"
                  fontSize="3.2"
                  fontWeight="700"
                  fill="#111111"
                  stroke="#F6F3EA"
                  strokeWidth="1.1"
                  paintOrder="stroke"
                >
                  {p.place.name.length > 8 ? `${p.place.name.slice(0, 8)}…` : p.place.name}
                </text>
              )}
            </g>
          );
        })}

        {!ordered.length && (
          <text x="50" y="50" textAnchor="middle" fontSize="4" fill="rgba(17,17,17,0.4)">
            这一天还没有地点
          </text>
        )}
      </svg>
      <div className="pointer-events-none absolute left-3 top-3 rounded-full border-[1.5px] border-ink/20 bg-white/85 px-2 py-0.5 text-[10px] font-bold text-inkSoft">
        Map Mock
      </div>
    </div>
  );
}
