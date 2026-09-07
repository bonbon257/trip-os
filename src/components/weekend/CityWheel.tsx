import { useEffect, useRef, useState } from 'react';

export interface WheelItem {
  id: string;
  name: string;
  emoji?: string;
}

interface CityWheelProps {
  items: WheelItem[];
  /** 转盘停下后回调，返回落中的条目 */
  onResult: (item: WheelItem) => void;
  disabled?: boolean;
}

const PALETTE = [
  '#FDE68A', '#BFDBFE', '#BBF7D0', '#FBCFE8', '#A5F3FC', '#FECACA',
  '#DDD6FE', '#FED7AA', '#C7F9D4', '#F5C2EB', '#BAE6FD', '#FEF08A',
];

const SIZE = 300;
const C = SIZE / 2;
const R = 140;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function wedge(cx: number, cy: number, r: number, start: number, end: number) {
  const s = polar(cx, cy, r, start);
  const e = polar(cx, cy, r, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} Z`;
}

/**
 * 城市大转盘。
 * 用 Web Animations API 驱动旋转，比 SVG CSS transition 更稳定。
 * 指针固定在 12 点方向（SVG 中角度 270°），落中格由此反推。
 */
export function CityWheel({ items, onResult, disabled }: CityWheelProps) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const wheelRef = useRef<SVGGElement>(null);
  const currentRef = useRef(0);

  const n = items.length;
  const seg = 360 / n;

  // 城市切换后把转盘归零
  useEffect(() => {
    currentRef.current = 0;
    setRotation(0);
  }, [items.map((i) => i.id).join(',')]);

  const spin = () => {
    if (spinning || disabled || n === 0) return;
    const node = wheelRef.current;
    if (!node) return;

    setSpinning(true);

    const target = Math.floor(Math.random() * n);
    const targetCenter = target * seg + seg / 2;
    // 转盘停在「指针(270°)指向 targetCenter」所需的绝对角度
    const landing = (270 - targetCenter + 360) % 360;
    const cur = currentRef.current % 360;
    const extra = ((landing - cur) % 360 + 360) % 360;
    const spins = 5 + Math.floor(Math.random() * 3); // 5–7 整圈
    const next = currentRef.current + spins * 360 + extra;

    const anim = node.animate(
      [
        { transform: `rotate(${currentRef.current}deg)`, transformOrigin: `${C}px ${C}px` },
        { transform: `rotate(${next}deg)`, transformOrigin: `${C}px ${C}px` },
      ],
      { duration: 3800, easing: 'cubic-bezier(.16,.84,.3,1)', fill: 'forwards' },
    );

    anim.onfinish = () => {
      currentRef.current = next;
      setRotation(next);
      setSpinning(false);
      onResult(items[target]!);
    };
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        {/* 指针（12 点，固定） */}
        <div
          className="absolute left-1/2 top-0 z-10 -translate-x-1/2"
          style={{
            width: 0,
            height: 0,
            borderLeft: '11px solid transparent',
            borderRight: '11px solid transparent',
            borderTop: '20px solid #111827',
          }}
        />
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width={SIZE}
          height={SIZE}
          className="drop-shadow-[0_8px_20px_rgba(0,0,0,0.12)]"
        >
          <g
            ref={wheelRef}
            style={{
              transform: `rotate(${rotation}deg)`,
              transformOrigin: `${C}px ${C}px`,
            }}
          >
            {items.map((it, i) => {
              const start = i * seg;
              const end = start + seg;
              const mid = start + seg / 2;
              const color = PALETTE[i % PALETTE.length]!;
              const lp = polar(C, C, R * 0.66, mid);
              const flip = mid > 90 && mid < 270;
              const label = (it.emoji ? it.emoji + ' ' : '') + it.name.slice(0, 5);
              return (
                <g key={it.id}>
                  <path d={wedge(C, C, R, start, end)} fill={color} stroke="#fff" strokeWidth={1.5} />
                  <text
                    x={lp.x}
                    y={lp.y}
                    transform={`rotate(${flip ? mid + 180 : mid} ${lp.x} ${lp.y})`}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={seg < 16 ? 9 : 11}
                    fontWeight={700}
                    fill="#1f2937"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {label}
                  </text>
                </g>
              );
            })}
            <circle cx={C} cy={C} r={16} fill="#fff" stroke="#111827" strokeWidth={2} />
          </g>
          {/* 外圈 */}
          <circle cx={C} cy={C} r={R} fill="none" stroke="#111827" strokeWidth={3} />
        </svg>
      </div>

      <button
        type="button"
        onClick={spin}
        disabled={spinning || disabled || n === 0}
        className="mt-5 rounded-full bg-ink px-8 py-3 text-[15px] font-extrabold text-paper shadow-lg transition active:scale-95 disabled:opacity-50"
      >
        {spinning ? '转动中…' : '转一下'}
      </button>
    </div>
  );
}
