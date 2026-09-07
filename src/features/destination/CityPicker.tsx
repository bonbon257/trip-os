import { useMemo, useState } from 'react';
import { fullDestinationPool } from '@/services/recommendation';
import { cnProvinceOf, cnRegionOf } from '@/data/destinations-cn';
import { Input, Tag, cx } from '@/components/ui';
import type { Destination } from '@/types';

const REGIONS = ['全部', '华东', '华南', '华中', '华北', '西南', '西北', '东北', '海外'];

/**
 * 城市选择器
 * ────────────────────────────────────────────────────────────
 * 候选池接近 400 个，原生 select 没法用，所以做成「大区筛选 + 关键字搜索」。
 * 数据来自高德行政区划，不是手写清单。
 */
export function CityPicker({
  value,
  onChange,
  placeholder = '搜索城市，比如「大理」或「杭州」',
}: {
  value: string;
  onChange: (destination: Destination) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState('');
  const [region, setRegion] = useState('全部');
  const [open, setOpen] = useState(false);

  const pool = useMemo(() => fullDestinationPool(), []);

  const list = useMemo(() => {
    const kw = q.trim();
    return pool
      .filter((d) => {
        if (region === '海外') return d.scope === 'international';
        if (region !== '全部') return cnRegionOf(d.id) === region;
        return true;
      })
      .filter((d) => {
        if (!kw) return true;
        return (
          d.name.includes(kw) ||
          d.summary?.includes(kw) ||
          d.tags.some((t) => t.includes(kw.toLowerCase())) ||
          (cnProvinceOf(d.id) ?? '').includes(kw)
        );
      })
      .slice(0, 60);
  }, [pool, q, region]);

  const current = pool.find((d) => d.id === value);

  return (
    <div className="space-y-2">
      {current && (
        <div className="flex items-center gap-2 rounded-xl border-[1.5px] border-ink bg-paperDeep px-3 py-2.5">
          <span className="text-[20px]">{current.emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-bold">{current.name}</p>
            <p className="truncate text-[11px] text-inkFaint">
              {(cnProvinceOf(current.id) ?? current.country).replace(/省|市|自治区|维吾尔|壮族|回族|特别行政区/g, '')}
              {' · '}
              {current.tags.slice(0, 3).join(' · ')}
            </p>
          </div>
          <Tag tone="violet">已选</Tag>
        </div>
      )}

      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
      />

      <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
        {REGIONS.map((r) => (
          <button
            key={r}
            onClick={() => {
              setRegion(r);
              setOpen(true);
            }}
            className={cx(
              'focus-ring shrink-0 rounded-full border-[1.5px] px-2.5 py-1 text-[11.5px] font-semibold transition',
              region === r
                ? 'border-ink bg-ink text-white'
                : 'border-ink/15 bg-white text-inkSoft hover:border-ink/40',
            )}
          >
            {r}
          </button>
        ))}
      </div>

      {open && (
        <div className="max-h-56 overflow-y-auto rounded-xl border-[1.5px] border-ink/15 bg-white">
          {list.length === 0 ? (
            <p className="px-3 py-4 text-center text-[12px] text-inkFaint">
              没有匹配的城市，换个关键字试试
            </p>
          ) : (
            list.map((d) => (
              <button
                key={d.id}
                onClick={() => {
                  onChange(d);
                  setOpen(false);
                  setQ('');
                }}
                className={cx(
                  'flex w-full items-center gap-2.5 border-b border-ink/8 px-3 py-2 text-left transition last:border-0 hover:bg-paperDeep',
                  d.id === value && 'bg-violet/10',
                )}
              >
                <span className="text-[17px]">{d.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold">{d.name}</p>
                  <p className="truncate text-[10.5px] text-inkFaint">
                    {(cnProvinceOf(d.id) ?? d.country).replace(/省|市|自治区|维吾尔|壮族|回族|特别行政区/g, '')}
                  </p>
                </div>
                <span className="shrink-0 text-[10.5px] text-inkFaint">
                  {d.intensity === 'low' ? '低' : d.intensity === 'medium' ? '中' : '高'}强度
                </span>
              </button>
            ))
          )}
          {list.length === 60 && (
            <p className="px-3 py-1.5 text-center text-[10.5px] text-inkFaint">
              只显示前 60 个，继续输入可缩小范围
            </p>
          )}
        </div>
      )}
    </div>
  );
}
