import { Link } from 'react-router-dom';
import { useStore } from '@/services/store';
import { Card, Tag, cx } from '@/components/ui';
import type { GuideContent, GuideKind } from '@/types';
import { guideDestinationNames } from './guidePool';

const KIND_META: Record<GuideKind, { label: string; emoji: string }> = {
  city: { label: '城市攻略', emoji: '🏙️' },
  route: { label: '路线攻略', emoji: '🗺️' },
  theme: { label: '主题攻略', emoji: '🌈' },
  audience: { label: '人群攻略', emoji: '👥' },
  play: { label: '玩法攻略', emoji: '🎯' },
  imported: { label: '导入攻略', emoji: '📥' },
  user: { label: '我的攻略', emoji: '✍️' },
};

const GRADIENTS = [
  'from-rose-300 to-amber-200',
  'from-sky-300 to-emerald-200',
  'from-violet-300 to-pink-200',
  'from-amber-300 to-orange-200',
  'from-teal-300 to-cyan-200',
  'from-fuchsia-300 to-rose-200',
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function GuideCard({ guide, compact }: { guide: GuideContent; compact?: boolean }) {
  const faved = useStore((s) => s.db.guideFavIds.includes(guide.id));
  const toggleGuideFav = useStore((s) => s.toggleGuideFav);
  const meta = KIND_META[guide.kind];
  const names = guideDestinationNames(guide.destinationIds);
  const grad = GRADIENTS[hash(guide.id) % GRADIENTS.length];

  return (
    <Card className="group relative flex flex-col overflow-hidden p-0">
      <Link to={`/guide/c/${guide.id}`} className="block">
        <div
          className={cx(
            'relative overflow-hidden bg-gradient-to-br',
            grad,
            compact ? 'h-24' : 'h-32',
          )}
        >
          {/* 封面水印：有目的地用城市名大字，否则用类型 emoji 大图 */}
          {!guide.cover && (
            <span
              className={cx(
                'pointer-events-none absolute -right-1 bottom-[-0.18em] select-none font-black leading-none text-white/25',
                compact ? 'text-[44px]' : 'text-[60px]',
              )}
            >
              {names[0] ?? meta.emoji}
            </span>
          )}
          <span className="absolute left-3 top-3 rounded-lg bg-black/25 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur">
            {meta.emoji} {meta.label}
          </span>
          {guide.cover && (
            <img src={guide.cover} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="space-y-2 p-3">
          <p className="line-clamp-2 text-[14px] font-bold leading-snug">{guide.title}</p>
          <p className="muted text-[11.5px]">📍 {names.join(' · ') || '多目的地'}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {guide.durationDays != null && (
              <Tag tone="amber">{guide.durationDays} 天</Tag>
            )}
            {guide.bestTime && <Tag tone="sky">{guide.bestTime}</Tag>}
            {guide.themes.slice(0, 2).map((t) => (
              <Tag key={t} tone="ink">
                {t}
              </Tag>
            ))}
          </div>
        </div>
      </Link>
      <button
        type="button"
        onClick={() => toggleGuideFav(guide.id)}
        className={cx(
          'absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full text-[14px] shadow transition',
          faved ? 'bg-rose text-white' : 'bg-white/85 text-inkSoft hover:text-rose',
        )}
        aria-label="收藏攻略"
        title={faved ? '取消收藏' : '收藏攻略'}
      >
        {faved ? '♥' : '♡'}
      </button>
    </Card>
  );
}
