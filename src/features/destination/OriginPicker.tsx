import { useEffect, useMemo, useRef, useState } from 'react';
import { Input, Tag, cx } from '@/components/ui';
import { ORIGINS } from '@/data/taxonomy';

export function OriginPicker({
  value,
  onChange,
  placeholder = '搜索或输入出发城市',
}: {
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = ORIGINS.find((o) => o.name === value);

  const list = useMemo(() => {
    const kw = q.trim();
    return ORIGINS.filter((o) => o.name.includes(kw)).slice(0, 8);
  }, [q]);

  const custom = q.trim() && !list.some((o) => o.name === q.trim());

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const select = (name: string) => {
    onChange(name);
    setQ('');
    setOpen(false);
  };

  return (
    <div ref={ref} className="space-y-2">
      {current && (
        <div className="flex items-center gap-2 rounded-xl border-[1.5px] border-ink bg-paperDeep px-3 py-2.5">
          <span className="text-[18px]">🛫</span>
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">{current.name}</span>
          <Tag tone="violet">已选</Tag>
        </div>
      )}

      <div className="relative">
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
        />

        {open && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border-[1.5px] border-ink/15 bg-white shadow-note">
            {list.length === 0 && !custom ? (
              <p className="px-3 py-3 text-center text-[12px] text-inkFaint">无匹配城市</p>
            ) : (
              <div className="max-h-56 overflow-y-auto">
                {list.map((o) => (
                  <button
                    key={o.name}
                    type="button"
                    onClick={() => select(o.name)}
                    className={cx(
                      'flex w-full items-center gap-2 border-b border-ink/8 px-3 py-2 text-left text-[13px] transition last:border-0 hover:bg-paperDeep',
                      o.name === value && 'bg-violet/10',
                    )}
                  >
                    <span className="text-[15px]">🛫</span>
                    <span className="flex-1 font-medium">{o.name}</span>
                  </button>
                ))}
                {custom && (
                  <button
                    type="button"
                    onClick={() => select(q.trim())}
                    className="flex w-full items-center gap-2 border-t border-ink/8 px-3 py-2 text-left text-[13px] transition hover:bg-paperDeep"
                  >
                    <span className="text-[15px]">✏️</span>
                    <span className="flex-1 font-medium">使用「{q.trim()}」作为出发地</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
