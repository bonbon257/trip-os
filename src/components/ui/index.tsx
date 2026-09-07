import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { create } from 'zustand';
import { uid } from '@/utils/id';

export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(' ');

// ── Toast ───────────────────────────────────────────────────
type Tone = 'default' | 'good' | 'warn';
interface ToastItem {
  id: string;
  text: string;
  tone: Tone;
}
interface ToastState {
  items: ToastItem[];
  push: (text: string, tone?: Tone) => void;
  remove: (id: string) => void;
}
const useToastStore = create<ToastState>((set) => ({
  items: [],
  push: (text, tone = 'default') => {
    const id = uid('t');
    set((s) => ({ items: [...s.items, { id, text, tone }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), 2600);
  },
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

export const toast = (text: string, tone: Tone = 'default') => useToastStore.getState().push(text, tone);

export function ToastHost() {
  const items = useToastStore((s) => s.items);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[80] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          className={cx(
            'animate-pop rounded-full border-[1.5px] border-ink px-4 py-2 text-[13px] font-semibold shadow-note',
            t.tone === 'good' ? 'bg-moss/20' : t.tone === 'warn' ? 'bg-amber/40' : 'bg-white',
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ── Button ──────────────────────────────────────────────────
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-white border-ink hover:bg-ink/90 active:translate-y-[1px]',
  secondary: 'bg-white text-ink border-ink hover:bg-paperDeep',
  ghost: 'bg-transparent text-inkSoft border-transparent hover:bg-ink/5 hover:text-ink',
  danger: 'bg-white text-rose border-rose/50 hover:bg-rose/10',
  soft: 'bg-violet/12 text-ink border-ink/15 hover:bg-violet/20',
};

const SIZES = {
  sm: 'h-8 px-3 text-[12px] rounded-lg',
  md: 'h-10 px-4 text-[13px] rounded-xl',
  lg: 'h-12 px-5 text-[15px] rounded-xl',
};

export function Button({ variant = 'secondary', size = 'md', block, className, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={cx(
        'focus-ring inline-flex select-none items-center justify-center gap-1.5 border-[1.5px] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
    />
  );
}

export function IconButton({
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={cx(
        'focus-ring inline-flex h-9 w-9 items-center justify-center rounded-lg border-[1.5px] border-ink/15 bg-white text-[15px] transition hover:border-ink hover:bg-paperDeep',
        className,
      )}
    />
  );
}

// ── Card / Section ──────────────────────────────────────────
export function Card({
  className,
  children,
  tone = 'solid',
  ...rest
}: { tone?: 'solid' | 'quiet' | 'dashed'; children?: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cx(
        tone === 'solid' && 'card',
        tone === 'quiet' && 'card-quiet',
        tone === 'dashed' && 'card-dashed',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Section({
  title,
  action,
  children,
  className,
  hint,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  hint?: string;
}) {
  return (
    <section className={cx('space-y-3', className)}>
      {title && (
        <header className="flex items-end justify-between gap-3">
          <div>
            <h2 className="h2">{title}</h2>
            {hint && <p className="muted mt-0.5">{hint}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

// ── Tag / Chip ──────────────────────────────────────────────
const TONES: Record<string, string> = {
  violet: 'bg-violet/18 border-violet/40 text-ink',
  azure: 'bg-azure/18 border-azure/40 text-ink',
  amber: 'bg-amber/35 border-amber/70 text-ink',
  moss: 'bg-moss/18 border-moss/40 text-ink',
  rose: 'bg-rose/15 border-rose/40 text-rose',
  gray: 'bg-ink/5 border-ink/12 text-inkSoft',
};

export function Tag({
  tone = 'gray',
  children,
  className,
}: {
  tone?: keyof typeof TONES;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border-[1.5px] px-2 py-0.5 text-[11px] font-semibold',
        TONES[tone] ?? TONES.gray,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Chip({
  active,
  children,
  onClick,
  className,
  disabled,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'focus-ring inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3 py-1.5 text-[13px] font-medium transition',
        active
          ? 'border-ink bg-ink text-white'
          : 'border-ink/15 bg-white text-ink hover:border-ink/40 hover:bg-paperDeep',
        disabled && 'opacity-40',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Badge({ count, tone = 'rose' }: { count: number; tone?: keyof typeof TONES }) {
  if (!count) return null;
  return (
    <span
      className={cx(
        'ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white',
        tone === 'rose' ? 'bg-rose' : 'bg-ink',
      )}
    >
      {count}
    </span>
  );
}

// ── Progress / Ring ─────────────────────────────────────────
export function ProgressBar({
  value,
  tone = 'violet',
  className,
  height = 'h-2',
}: {
  value: number;
  tone?: 'violet' | 'azure' | 'amber' | 'moss' | 'rose' | 'ink';
  className?: string;
  height?: string;
}) {
  const bg: Record<string, string> = {
    violet: 'bg-violet',
    azure: 'bg-azure',
    amber: 'bg-amber',
    moss: 'bg-moss',
    rose: 'bg-rose',
    ink: 'bg-ink',
  };
  return (
    <div className={cx('w-full overflow-hidden rounded-full bg-ink/10', height, className)}>
      <div
        className={cx('h-full rounded-full transition-all duration-500', bg[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function Ring({
  value,
  size = 72,
  label,
  sub,
  tone = '#7C5CFF',
}: {
  value: number;
  size?: number;
  label?: string;
  sub?: string;
  tone?: string;
}) {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, value)) / 100) * c;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(17,17,17,0.1)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[17px] font-extrabold leading-none">{label ?? `${Math.round(value)}%`}</span>
        {sub && <span className="mt-0.5 text-[10px] font-semibold text-inkFaint">{sub}</span>}
      </div>
    </div>
  );
}

// ── Segmented ───────────────────────────────────────────────
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  size = 'md',
}: {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      className={cx(
        'inline-flex w-full gap-1 rounded-xl border-[1.5px] border-ink bg-white p-1',
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'focus-ring flex-1 rounded-lg px-2 text-center font-semibold transition',
            size === 'sm' ? 'py-1 text-[12px]' : 'py-2 text-[13px]',
            value === o.value ? 'bg-ink text-white' : 'text-inkSoft hover:bg-paperDeep hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Field ───────────────────────────────────────────────────
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx('block space-y-1.5', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-inkFaint">{hint}</span>}
    </label>
  );
}

const inputCls =
  'focus-ring w-full rounded-xl border-[1.5px] border-ink/15 bg-white px-3 py-2.5 text-[14px] placeholder:text-inkFaint';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, 'min-h-[88px] resize-y', props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, 'appearance-none pr-8', props.className)} />;
}

export const Stepper = ({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 100,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) => (
  <div className="inline-flex items-center gap-1 rounded-xl border-[1.5px] border-ink/15 bg-white px-1">
    <IconButton onClick={() => onChange(Math.max(min, value - step))} className="h-8 w-8 border-transparent">
      −
    </IconButton>
    <span className="min-w-[84px] text-center text-[15px] font-bold tabular-nums">
      {value.toLocaleString('zh-CN')}
      {suffix && <span className="ml-0.5 text-[11px] text-inkFaint">{suffix}</span>}
    </span>
    <IconButton onClick={() => onChange(Math.min(max, value + step))} className="h-8 w-8 border-transparent">
      +
    </IconButton>
  </div>
);

// ── Modal / Sheet ───────────────────────────────────────────
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-ink/25" onClick={onClose} />
      <div
        className={cx(
          'animate-pop relative max-h-[88vh] w-full overflow-y-auto rounded-t-pane border-[1.5px] border-ink bg-white shadow-noteLg sm:rounded-card',
          width,
        )}
      >
        {title && (
          <header className="sticky top-0 flex items-center justify-between border-b-[1.5px] border-ink/10 bg-white/95 px-5 py-3.5 backdrop-blur">
            <h3 className="h3">{title}</h3>
            <IconButton onClick={onClose} aria-label="关闭">
              ✕
            </IconButton>
          </header>
        )}
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <footer className="sticky bottom-0 flex justify-end gap-2 border-t-[1.5px] border-ink/10 bg-white/95 px-5 py-3.5 backdrop-blur">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-ink/20" onClick={onClose} />
      <div className="animate-sheet fixed inset-x-0 bottom-0 z-[61] max-h-[78vh] overflow-y-auto rounded-t-pane border-t-[1.5px] border-ink bg-white p-4 pb-8 shadow-noteLg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/20" />
        {title && <h3 className="h3 mb-3">{title}</h3>}
        {children}
      </div>
    </>
  );
}

// ── Empty ───────────────────────────────────────────────────
export function EmptyState({
  emoji,
  title,
  desc,
  actions,
  className,
}: {
  emoji: string;
  title: string;
  desc?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('card-dashed flex flex-col items-center gap-3 px-6 py-10 text-center', className)}>
      <div className="text-[34px] leading-none">{emoji}</div>
      <div>
        <p className="h3">{title}</p>
        {desc && <p className="muted mt-1">{desc}</p>}
      </div>
      {actions && <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

// ── StatCard ────────────────────────────────────────────────
export function StatCard({
  label,
  value,
  hint,
  progress,
  tone = 'violet',
  onClick,
  emoji,
}: {
  label: string;
  value: string;
  hint?: string;
  progress?: number;
  tone?: 'violet' | 'azure' | 'amber' | 'moss' | 'rose' | 'ink';
  onClick?: () => void;
  emoji?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cx(
        'card flex w-full flex-col gap-2 p-3.5 text-left transition',
        onClick ? 'hover:-translate-y-[1px] hover:shadow-noteLg' : 'cursor-default',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        {emoji && <span className="text-[15px]">{emoji}</span>}
      </div>
      <span className="text-[19px] font-extrabold leading-none tabular-nums">{value}</span>
      {progress !== undefined && <ProgressBar value={progress} tone={tone} />}
      {hint && <span className="text-[11px] text-inkFaint">{hint}</span>}
    </button>
  );
}

// ── 轻量 Tabs ───────────────────────────────────────────────
export function Tabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; badge?: number }[];
}) {
  return (
    <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'focus-ring shrink-0 rounded-full border-[1.5px] px-3 py-1.5 text-[13px] font-semibold transition',
            value === o.value ? 'border-ink bg-ink text-white' : 'border-ink/15 bg-white text-inkSoft hover:border-ink/40',
          )}
        >
          {o.label}
          {o.badge ? <span className="ml-1 text-[11px] text-rose">{o.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

// ── 上下文无关的 ai 面板开关（供各处复用）────────────────────
interface SheetCtx {
  open: (node: ReactNode, title?: string) => void;
  close: () => void;
}
const SheetContext = createContext<SheetCtx>({ open: () => {}, close: () => {} });
export const useSheet = () => useContext(SheetContext);

export function SheetProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<ReactNode>(null);
  const [title, setTitle] = useState<string | undefined>();
  const open = useCallback((n: ReactNode, t?: string) => {
    setNode(n);
    setTitle(t);
  }, []);
  const close = useCallback(() => setNode(null), []);
  const value = useMemo(() => ({ open, close }), [open, close]);
  return (
    <SheetContext.Provider value={value}>
      {children}
      <Sheet open={!!node} onClose={close} title={title}>
        {node}
      </Sheet>
    </SheetContext.Provider>
  );
}
