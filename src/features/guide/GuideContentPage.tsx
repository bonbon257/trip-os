import { useNavigate, useParams, Link } from 'react-router-dom';
import { useState, useRef, type ChangeEvent } from 'react';
import { useStore } from '@/services/store';
import { fileToCompressedDataURL } from '@/utils/image';
import { Card, Section, Tag, cx } from '@/components/ui';
import { toast } from '@/components/ui';
import { useGuideContent, guideDestinationNames, guidePlace } from './guidePool';
import { applyPlaybookToTrip } from '@/features/travel/playbookToTrip';
import type { GuideKind } from '@/types';

const KIND_LABEL: Record<GuideKind, string> = {
  city: '城市攻略',
  route: '路线攻略',
  theme: '主题攻略',
  audience: '人群攻略',
  play: '玩法攻略',
  imported: '导入攻略',
  user: '我的攻略',
};

export function GuideContentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const guide = useGuideContent(id);

  const faved = useStore((s) => (id ? s.db.guideFavIds.includes(id) : false));
  const activeTripId = useStore((s) => s.activeTripId);
  const toggleGuideFav = useStore((s) => s.toggleGuideFav);
  const toggleFavPlace = useStore((s) => s.toggleFavPlace);
  const toggleSavePlace = useStore((s) => s.toggleSavePlace);
  const favPlaceIds = useStore((s) => s.db.favPlaceIds);
  const savedPlaces = useStore((s) => s.db.savedPlaces);
  const updateGuide = useStore((s) => s.updateGuide);
  const fileRef = useRef<HTMLInputElement>(null);
  const [coverLoading, setCoverLoading] = useState(false);

  if (!guide) {
    return (
      <div className="space-y-4">
        <Card className="p-8 text-center muted">没有找到这条攻略。</Card>
        <div className="text-center">
          <Link to="/guide" className="text-[13px] font-semibold text-inkSoft underline">
            返回攻略市场
          </Link>
        </div>
      </div>
    );
  }

  const names = guideDestinationNames(guide.destinationIds);
  const firstDest = guide.destinationIds[0];

  const onPickCover = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 6 * 1024 * 1024) {
      toast('图片请小于 6MB', 'warn');
      return;
    }
    try {
      setCoverLoading(true);
      const url = await fileToCompressedDataURL(f);
      updateGuide(guide.id, { cover: url });
      toast('封面已更新', 'good');
    } catch (err) {
      toast(err instanceof Error ? err.message : '封面上传失败', 'warn');
    } finally {
      setCoverLoading(false);
    }
  };

  const onUseGuide = () => {
    if (guide.playbookRef) {
      try {
        const r = applyPlaybookToTrip(guide.playbookRef.destinationId, guide.playbookRef.playbookId);
        toast(
          r.created ? `已生成「${names.join('·')}」旅行` : `已加入现有旅行（${r.activityCount} 个安排）`,
          'good',
        );
        navigate(`/trips/${r.tripId}/itinerary`);
      } catch (e) {
        toast('生成失败：' + (e instanceof Error ? e.message : ''), 'warn');
      }
    } else {
      // 纯主题卡没有可执行玩法：进第一个目的地攻略继续
      toast('这是灵感主题，去目的地看具体玩法', 'default');
      if (firstDest) navigate(`/travel/destinations/${firstDest}`);
    }
  };

  return (
    <div className="space-y-6">
      <Link to="/guide" className="text-[12.5px] font-semibold text-inkSoft underline">
        ← 攻略市场
      </Link>

      {/* 封面 + 标题 */}
      <header className="sticky-note overflow-hidden p-0">
        <div className="relative h-36 bg-gradient-to-br from-rose-300 to-amber-200">
          {guide.cover && (
            <img src={guide.cover} alt="" className="h-full w-full object-cover" />
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={coverLoading}
            className="absolute right-3 top-3 rounded-full border-[1.5px] border-white/70 bg-black/35 px-3 py-1.5 text-[12px] font-bold text-white backdrop-blur transition hover:bg-black/55 disabled:opacity-60"
          >
            {coverLoading ? '上传中…' : '🖼 换封面'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickCover} />
        </div>
        <div className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone="rose">{KIND_LABEL[guide.kind]}</Tag>
            <Tag tone="ink">来源 · {guide.source === 'official' ? '官方精选' : guide.source === 'xhs' ? '小红书导入' : '我的'}</Tag>
            {guide.durationDays != null && <Tag tone="amber">{guide.durationDays} 天</Tag>}
            {guide.bestTime && <Tag tone="sky">{guide.bestTime}</Tag>}
          </div>
          <h1 className="h1">{guide.title}</h1>
          <p className="muted text-[13px]">📍 {names.join(' · ') || '多目的地'}</p>
          <p className="text-[13.5px] leading-relaxed">{guide.summary}</p>
          <div className="flex flex-wrap gap-1.5">
            {guide.themes.map((t) => (
              <Tag key={t} tone="ink">
                {t}
              </Tag>
            ))}
            {guide.audience.map((a) => (
              <Tag key={a} tone="violet">
                {a}
              </Tag>
            ))}
          </div>
        </div>
      </header>

      {/* 具体地点 */}
      {guide.placeIds.length > 0 && (
        <Section title="具体地点" hint="可逐个收藏 / 加入旅行">
          <div className="space-y-2">
            {guide.placeIds.map((pid) => {
              const p = guidePlace(guide, pid);
              const placeFaved = favPlaceIds.includes(pid);
              const inTrip = activeTripId && (savedPlaces[activeTripId] ?? []).includes(pid);
              return (
                <Card key={pid} className="flex items-center gap-3 p-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-[1.5px] border-ink/15 bg-paperDeep text-[17px]">
                    {p?.emoji ?? '📍'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold">{p?.name ?? pid}</p>
                    <p className="muted truncate text-[11.5px]">{p?.category ?? ''}</p>
                  </div>
                  <button
                    onClick={() => toggleFavPlace(pid)}
                    className={cx(
                      'rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition',
                      placeFaved ? 'bg-rose/10 text-rose' : 'border-[1.5px] border-ink/15 text-inkSoft',
                    )}
                  >
                    {placeFaved ? '♥ 已收藏' : '♡ 收藏'}
                  </button>
                  <button
                    onClick={() => {
                      if (!activeTripId) {
                        toast('先选一个旅行，或去目的地创建', 'default');
                        if (firstDest) navigate(`/travel/destinations/${firstDest}`);
                        return;
                      }
                      toggleSavePlace(activeTripId, pid);
                      toast('已加入当前旅行候选', 'good');
                    }}
                    className="rounded-lg border-[1.5px] border-ink/15 px-2.5 py-1.5 text-[12px] font-semibold text-inkSoft transition hover:border-ink"
                  >
                    {inTrip ? '✓ 已加入' : '加入旅行'}
                  </button>
                </Card>
              );
            })}
          </div>
        </Section>
      )}

      {/* 路线 */}
      {guide.days && guide.days.length > 0 && (
        <Section title="路线" hint={`${guide.days.length} 天`}>
          <div className="space-y-4">
            {guide.days.map((d) => (
              <div key={d.index} className="rounded-2xl border-[1.5px] border-ink/10 bg-paperDeep p-3">
                <p className="mb-2 text-[13.5px] font-bold">
                  Day {d.index} · {d.title}
                </p>
                <ol className="space-y-1.5">
                  {d.stops.map((s, i) => {
                    const p = guidePlace(guide, s.placeId);
                    return (
                      <li key={s.placeId + i} className="flex items-center gap-2 text-[13px]">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-[1.5px] border-ink/15 text-[11px] font-bold">
                          {s.order}
                        </span>
                        <span className="font-semibold">{s.time}</span>
                        <span>{p?.name ?? s.placeId}</span>
                        <span className="muted">· {s.duration} 分钟</span>
                        {s.transportFromPrevious && (
                          <span className="muted text-[11px]">
                            → {transportLabel(s.transportFromPrevious.mode)} {s.transportFromPrevious.min}′
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Tips */}
      {guide.tips && guide.tips.length > 0 && (
        <Section title="Tips">
          <ul className="space-y-1.5 text-[13px]">
            {guide.tips.map((t, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-amber">💡</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 底部固定操作 */}
      <div className="sticky bottom-4 z-20 flex gap-2 rounded-2xl border-[1.5px] border-ink/10 bg-paper/95 p-3 shadow-noteLg backdrop-blur">
        <button
          onClick={() => toggleGuideFav(guide.id)}
          className={cx(
            'flex-1 rounded-xl px-3 py-2.5 text-[14px] font-bold transition',
            faved ? 'bg-rose text-white' : 'border-[1.5px] border-ink/15 bg-white text-ink',
          )}
        >
          {faved ? '♥ 已收藏' : '♡ 收藏攻略'}
        </button>
        <button
          onClick={onUseGuide}
          className="flex-[2] rounded-xl bg-ink px-3 py-2.5 text-[14px] font-bold text-paper transition hover:opacity-90"
        >
          {guide.playbookRef ? '使用这条攻略' : '查看目的地玩法'}
        </button>
      </div>
    </div>
  );
}

function transportLabel(mode: string): string {
  switch (mode) {
    case 'taxi':
      return '打车';
    case 'train':
      return '地铁/火车';
    case 'transit':
      return '公交';
    case 'walk':
      return '步行';
    case 'car':
      return '自驾';
    case 'flight':
      return '飞机';
    default:
      return '前往';
  }
}
