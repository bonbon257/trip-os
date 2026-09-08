import { useMemo } from 'react';
import type { Place } from '@/types';
import { cx } from '@/components/ui';

export interface MapPoint {
  place: Place;
  order: number;
  minutesFromPrev?: number;
  done?: boolean;
}

const DECO_EMOJIS = ['🌳', '🌲', '⛰️', '🏠', '☁️', '🌸', '🌾', '🪨', '🚲', '🐦'];

function deterministicFloat(seed: string, index: number) {
  let h = 0;
  const s = `${seed}-${index}`;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) / 2147483647;
}

/**
 * MockMap：可爱插画风格地图
 *
 * 不依赖任何地图 API，用 SVG 把行程画成一张「旅行手账风」小地图：
 *   · 柔和渐变大背景 + 随机点缀（树、山、云、房子）
 *   · 路线用圆润虚线，像在纸上画出来的
 *   · 每个地点是带表情的小徽章
 *   · 无有效坐标时显示友好空状态
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
  const { viewBox, bounds, ordered, decorations } = useMemo(() => {
    if (!points.length) {
      return { viewBox: '0 0 100 100', bounds: { minX: 0, minY: 0, width: 100, height: 100 }, ordered: [], decorations: [] };
    }

    const xs = points.map((p) => p.place.x);
    const ys = points.map((p) => p.place.y);
    const pad = 22;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const rawW = Math.max(...xs) + pad - minX;
    const rawH = Math.max(...ys) + pad - minY;
    const size = Math.max(rawW, rawH, 48);

    const bounds = { minX, minY, width: size, height: size };
    const viewBox = `${minX} ${minY} ${size} ${size}`;
    const ordered = [...points].sort((a, b) => a.order - b.order);

    // 生成一些装饰元素，均匀撒在大背景上，避开路线附近
    const decorations: { x: number; y: number; emoji: string; rotate: number; scale: number }[] = [];
    const count = Math.max(4, Math.min(14, Math.round(size / 10)));
    for (let i = 0; i < count; i++) {
      const rx = deterministicFloat('x', i);
      const ry = deterministicFloat('y', i);
      const x = minX + rx * size;
      const y = minY + ry * size;
      // 避开每个地点附近，避免干扰
      const tooClose = ordered.some((p) => Math.hypot(p.place.x - x, p.place.y - y) < 10);
      if (!tooClose) {
        decorations.push({
          x,
          y,
          emoji: DECO_EMOJIS[i % DECO_EMOJIS.length],
          rotate: Math.round((deterministicFloat('r', i) - 0.5) * 40),
          scale: 0.7 + deterministicFloat('s', i) * 0.5,
        });
      }
    }

    return { viewBox, bounds, ordered, decorations };
  }, [points]);

  const bgId = useMemo(() => `mockmap-bg-${Math.round(bounds.width)}-${Math.round(bounds.height)}`, [bounds]);
  const routePath = useMemo(() => {
    if (ordered.length < 2) return '';
    // 用简单的贝塞尔曲线让路线更圆润
    let d = `M ${ordered[0].place.x} ${ordered[0].place.y}`;
    for (let i = 1; i < ordered.length; i++) {
      const a = ordered[i - 1].place;
      const b = ordered[i].place;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      // 控制点稍微偏移，制造弧度
      const cx1 = (a.x + mx) / 2 + (b.y - a.y) * 0.05;
      const cy1 = (a.y + my) / 2 - (b.x - a.x) * 0.05;
      const cx2 = (mx + b.x) / 2 + (b.y - a.y) * 0.05;
      const cy2 = (my + b.y) / 2 - (b.x - a.x) * 0.05;
      d += ` C ${cx1} ${cy1}, ${cx2} ${cy2}, ${b.x} ${b.y}`;
    }
    return d;
  }, [ordered]);

  return (
    <div
      className={cx(
        'relative overflow-hidden rounded-card border-[1.5px] border-ink/12',
        className,
      )}
      style={{ background: 'linear-gradient(135deg, #FDFCF8 0%, #F3F0E8 100%)' }}
    >
      <svg viewBox={viewBox} className="h-full w-full" role="img" aria-label="行程地图">
        <defs>
          <radialGradient id={bgId} cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="#FFFDF7" />
            <stop offset="55%" stopColor="#F7F3E8" />
            <stop offset="100%" stopColor="#EBE6D8" />
          </radialGradient>
          <pattern id="mockmap-dots" width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.8" fill="rgba(17,17,17,0.06)" />
            <circle cx="11" cy="11" r="0.5" fill="rgba(17,17,17,0.04)" />
          </pattern>
          <filter id="mockmap-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1.2" stdDeviation="1.2" floodColor="rgba(0,0,0,0.12)" />
          </filter>
        </defs>

        <rect x={bounds.minX - 10} y={bounds.minY - 10} width={bounds.width + 20} height={bounds.height + 20} fill={`url(#${bgId})`} />
        <rect x={bounds.minX - 10} y={bounds.minY - 10} width={bounds.width + 20} height={bounds.height + 20} fill="url(#mockmap-dots)" />

        {/* 装饰：小风景 */}
        {decorations.map((d, i) => (
          <text
            key={`deco-${i}`}
            x={d.x}
            y={d.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={5 * d.scale}
            transform={`rotate(${d.rotate}, ${d.x}, ${d.y})`}
            opacity={0.35}
            style={{ pointerEvents: 'none' }}
          >
            {d.emoji}
          </text>
        ))}

        {/* 路线：圆润虚线 */}
        {showRoute && routePath && (
          <>
            <path
              d={routePath}
              fill="none"
              stroke="#E8DCCF"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.9"
            />
            <path
              d={routePath}
              fill="none"
              stroke="#7C5CFF"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="3.5 2.8"
              opacity="0.85"
            />
          </>
        )}

        {/* 路段时间标签 */}
        {showRoute &&
          ordered.slice(1).map((p, i) => {
            const prev = ordered[i];
            if (!p.minutesFromPrev) return null;
            const mx = (prev.place.x + p.place.x) / 2;
            const my = (prev.place.y + p.place.y) / 2;
            return (
              <g key={`seg-${p.place.id}`}>
                <rect x={mx - 6.5} y={my - 3} rx="2.8" width="13" height="6" fill="#FFFFFF" stroke="#7C5CFF" strokeWidth="0.5" opacity="0.95" />
                <text x={mx} y={my + 1.3} textAnchor="middle" fontSize="3" fontWeight="800" fill="#7C5CFF">
                  {p.minutesFromPrev} min
                </text>
              </g>
            );
          })}

        {/* 地点徽章 */}
        {ordered.map((p) => {
          const active = selectedId === p.place.id;
          const x = p.place.x;
          const y = p.place.y;
          const color = p.done ? '#22A06B' : active ? '#7C5CFF' : '#FF6B6B';

          return (
            <g
              key={p.place.id}
              className="cursor-pointer transition-opacity hover:opacity-90"
              onClick={() => onSelect?.(p.place.id)}
              filter="url(#mockmap-shadow)"
            >
              <title>{p.place.name}</title>

              {/* 定位针形状 */}
              <path
                d={`M ${x} ${y - 10} C ${x - 5.5} ${y - 10}, ${x - 7} ${y - 5}, ${x - 7} ${y - 2} C ${x - 7} ${y + 2}, ${x} ${y + 9}, ${x} ${y + 9} C ${x} ${y + 9}, ${x + 7} ${y + 2}, ${x + 7} ${y - 2} C ${x + 7} ${y - 5}, ${x + 5.5} ${y - 10}, ${x} ${y - 10} Z`}
                fill={color}
                stroke="#FFFFFF"
                strokeWidth="1.2"
              />
              <circle cx={x} cy={y - 3.5} r="3.6" fill="#FFFFFF" />
              <text x={x} y={y - 3.3} textAnchor="middle" dominantBaseline="central" fontSize="4.2">
                {p.place.emoji}
              </text>
              <text
                x={x}
                y={y + 0.8}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="3.4"
                fontWeight="900"
                fill="#FFFFFF"
              >
                {p.order + 1}
              </text>

              {showLabels && (
                <g>
                  <rect
                    x={x - (p.place.name.length > 8 ? 16 : 12)}
                    y={y + 11}
                    rx="3"
                    width={p.place.name.length > 8 ? 32 : 24}
                    height="5.5"
                    fill="#FFFFFF"
                    stroke={color}
                    strokeWidth="0.5"
                    opacity="0.95"
                  />
                  <text
                    x={x}
                    y={y + 15}
                    textAnchor="middle"
                    fontSize="3"
                    fontWeight="800"
                    fill="#2C2C2C"
                  >
                    {p.place.name.length > 8 ? `${p.place.name.slice(0, 8)}…` : p.place.name}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {!ordered.length && (
          <g>
            <text x="50" y="46" textAnchor="middle" fontSize="14" opacity="0.25">
              🗺️
            </text>
            <text x="50" y="62" textAnchor="middle" fontSize="4" fill="rgba(17,17,17,0.45)">
              这一天还没有地点
            </text>
          </g>
        )}
      </svg>

      <div className="pointer-events-none absolute left-3 top-3 rounded-full border-[1.5px] border-ink/10 bg-white/80 px-2.5 py-1 text-[10px] font-bold text-inkSoft backdrop-blur-sm">
        手绘地图
      </div>
    </div>
  );
}
