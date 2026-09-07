import { useMemo, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useStore } from '@/services/store';
import { Button, Card, Section, Tag, Sheet, Input, cx, toast } from '@/components/ui';
import { GuideCard } from './GuideCard';
import { resolveGuideContent } from './guidePool';
import { composeGuides } from './composeGuides';
import { useXhsImport } from '@/features/weekend/useXhsImport';
import { getPlaceAnywhere, searchPlacesByName } from '@/data/places';
import type { GuideContent, ID } from '@/types';

type Tab = 'fav' | 'imported' | 'user' | 'active' | 'done' | 'places';

export function MyGuidesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const db = useStore((s) => s.db);
  const activeTripId = useStore((s) => s.activeTripId);
  const setGuideActive = useStore((s) => s.setGuideActive);
  const setGuideCompleted = useStore((s) => s.setGuideCompleted);
  const toggleFavPlace = useStore((s) => s.toggleFavPlace);
  const toggleSavePlace = useStore((s) => s.toggleSavePlace);
  const importGuide = useStore((s) => s.importGuide);

  const [tab, setTab] = useState<Tab>('fav');
  const [picked, setPicked] = useState<ID[]>([]);
  // 从侧边栏「导入攻略」/ 市场页「导入」进入时自动打开导入弹窗
  const [importOpen, setImportOpen] = useState(searchParams.get('import') === '1');

  // 各分类的攻略内容（收藏/正在使用/已完成 解析自全局 id；导入/我的 来自 store）
  const favGuides = useMemo(
    () => db.guideFavIds.map(resolveGuideContent).filter(Boolean) as GuideContent[],
    [db.guideFavIds],
  );
  const importedGuides = db.guideContents.filter((g) => g.source === 'xhs');
  const userGuides = db.guideContents.filter((g) => g.source === 'user');
  const activeGuides = useMemo(
    () => db.activeGuideIds.map(resolveGuideContent).filter(Boolean) as GuideContent[],
    [db.activeGuideIds],
  );
  const doneGuides = useMemo(
    () => db.completedGuideIds.map(resolveGuideContent).filter(Boolean) as GuideContent[],
    [db.completedGuideIds],
  );
  const favPlaces = db.favPlaceIds.map(getPlaceAnywhere).filter(Boolean);

  const favCount = db.guideFavIds.length;
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'fav', label: '收藏', count: favCount },
    { key: 'imported', label: '我导入的', count: importedGuides.length },
    { key: 'user', label: '我的攻略', count: userGuides.length },
    { key: 'active', label: '正在使用', count: activeGuides.length },
    { key: 'done', label: '已完成', count: doneGuides.length },
    { key: 'places', label: '收藏的地点', count: db.favPlaceIds.length },
  ];

  const current = (): GuideContent[] => {
    switch (tab) {
      case 'fav':
        return favGuides;
      case 'imported':
        return importedGuides;
      case 'user':
        return userGuides;
      case 'active':
        return activeGuides;
      case 'done':
        return doneGuides;
      default:
        return [];
    }
  };

  const togglePick = (gid: ID) =>
    setPicked((p) => (p.includes(gid) ? p.filter((x) => x !== gid) : [...p, gid]));

  const onCompose = () => {
    if (picked.length < 1) return;
    const r = composeGuides(picked);
    toast(`已生成「${r.destinationIds.length} 城」旅行（${r.activityCount} 个安排）`, 'good');
    setPicked([]);
    navigate(`/trips/${r.tripId}/itinerary`);
  };

  return (
    <div className="space-y-5">
      <header className="sticky-note px-5 py-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="label">我的攻略</p>
            <h1 className="h1 mt-1">我沉淀的旅行内容</h1>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
            📥 导入小红书
          </Button>
        </div>
      </header>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setPicked([]);
            }}
            className={cx(
              'shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition',
              tab === t.key ? 'bg-ink text-paper' : 'border-[1.5px] border-ink/15 text-inkSoft hover:border-ink',
            )}
          >
            {t.label} {t.count > 0 && <span className="opacity-70">·{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === 'places' ? (
        <Section title="收藏的地点" hint="与攻略收藏独立">
          {favPlaces.length === 0 ? (
            <Card className="p-8 text-center muted">还没有收藏地点。在攻略详情里点「♡ 收藏」即可。</Card>
          ) : (
            <div className="space-y-2">
              {favPlaces.map((p) => {
                const inTrip = activeTripId && (db.savedPlaces[activeTripId] ?? []).includes(p!.id);
                return (
                  <Card key={p!.id} className="flex items-center gap-3 p-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl border-[1.5px] border-ink/15 bg-paperDeep text-[17px]">
                      {p!.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold">{p!.name}</p>
                      <p className="muted truncate text-[11.5px]">{p!.category}</p>
                    </div>
                    <button
                      onClick={() => {
                        if (!activeTripId) {
                          toast('先选一个旅行', 'default');
                          return;
                        }
                        toggleSavePlace(activeTripId, p!.id);
                        toast('已加入当前旅行候选', 'good');
                      }}
                      className="rounded-lg border-[1.5px] border-ink/15 px-2.5 py-1.5 text-[12px] font-semibold text-inkSoft"
                    >
                      {inTrip ? '✓ 已加入' : '加入旅行'}
                    </button>
                    <button
                      onClick={() => toggleFavPlace(p!.id)}
                      className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-rose"
                    >
                      移除
                    </button>
                  </Card>
                );
              })}
            </div>
          )}
        </Section>
      ) : (
        <Section title={tabs.find((t) => t.key === tab)?.label ?? ''}>
          {current().length === 0 ? (
            <Card className="p-8 text-center muted">
              {tab === 'fav' ? '还没有收藏攻略。去攻略市场逛逛，点 ♡ 收藏。' : '这里还是空的。'}
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {current().map((g) => (
                <div key={g.id} className="relative">
                  {tab === 'fav' && (
                    <label className="absolute left-2 top-2 z-10 flex cursor-pointer items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[11px] font-semibold shadow">
                      <input
                        type="checkbox"
                        checked={picked.includes(g.id)}
                        onChange={() => togglePick(g.id)}
                      />
                      组合
                    </label>
                  )}
                  <GuideCard guide={g} />
                  {tab === 'active' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 w-full"
                      onClick={() => setGuideActive(g.id, false)}
                    >
                      标记完成
                    </Button>
                  )}
                  {tab === 'done' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 w-full"
                      onClick={() => setGuideCompleted(g.id, false)}
                    >
                      移回进行中
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* 组合生成旅行浮条 */}
      {tab === 'fav' && picked.length > 0 && (
        <div className="sticky bottom-4 z-20 flex items-center gap-3 rounded-2xl border-[1.5px] border-ink/10 bg-paper/95 p-3 shadow-noteLg backdrop-blur">
          <span className="flex-1 text-[13px] font-semibold">已选 {picked.length} 篇攻略</span>
          <Button variant="ghost" size="sm" onClick={() => setPicked([])}>
            清空
          </Button>
          <Button size="sm" onClick={onCompose}>
            生成我的旅行 →
          </Button>
        </div>
      )}

      <XhsImportSheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(gid) => {
          setImportOpen(false);
          toast('已导入到「我导入的」', 'good');
          navigate(`/guide/c/${gid}`);
        }}
        importGuide={importGuide}
      />
    </div>
  );
}

function XhsImportSheet({
  open,
  onClose,
  onImported,
  importGuide,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (gid: ID) => void;
  importGuide: (input: Omit<GuideContent, 'id' | 'source' | 'createdAt'>) => ID;
}) {
  const { loading, error, parsed, parse, parseImage, parseText, reset } = useXhsImport();
  const [url, setUrl] = useState('');
  const [tab, setTab] = useState<'link' | 'image' | 'text'>('link');
  const [preview, setPreview] = useState('');
  const [text, setText] = useState('');

  const matched = useMemo(
    () => (parsed ? Array.from(new Set(parsed.locations.flatMap((l) => searchPlacesByName(l)))) : []),
    [parsed],
  );

  const pickImage = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setPreview(dataUrl);
      void parseImage(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (!parsed) return;
    const gid = importGuide({
      kind: 'imported',
      title: parsed.title || '小红书攻略',
      destinationIds: [],
      audience: ['any'],
      themes: ['小红书', ...parsed.locations.slice(0, 3)],
      summary: parsed.desc || parsed.title || '从小红书导入的攻略',
      placeIds: matched.map((p) => p.id),
    });
    reset();
    setUrl('');
    setPreview('');
    onImported(gid);
  };

  return (
    <Sheet open={open} onClose={onClose} title="导入小红书攻略">
      <div className="space-y-3">
        <p className="muted text-[12.5px]">贴链接 / 上传截图 / 粘贴攻略文本，AI 识别标题 / 正文 / 地点，形成你的攻略资产。</p>

        {/* 模式切换 */}
        <div className="flex gap-1 rounded-xl bg-paperDeep p-1">
          {(['link', 'image', 'text'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cx(
                'flex-1 rounded-lg py-1.5 text-[12.5px] font-semibold transition',
                tab === t ? 'bg-paper text-ink shadow-note' : 'text-inkSoft',
              )}
            >
              {t === 'link' ? '🔗 链接' : t === 'image' ? '🖼 图片' : '📝 文本'}
            </button>
          ))}
        </div>

        {tab === 'link' ? (
          <>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.xiaohongshu.com/..."
            />
            <Button block onClick={() => parse(url)} disabled={loading || !url.trim()}>
              {loading ? '识别中…' : '识别链接'}
            </Button>
          </>
        ) : (
          <>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-ink/20 bg-paperDeep py-6 text-center transition hover:border-ink/40">
              {preview ? (
                <img src={preview} alt="预览" className="max-h-44 rounded-lg object-contain" />
              ) : (
                <>
                  <span className="text-[26px]">🖼</span>
                  <span className="text-[12.5px] font-semibold">点击上传小红书截图</span>
                  <span className="muted text-[11px]">支持 PNG / JPG，≤ 9MB</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickImage(e.target.files?.[0])}
              />
            </label>
            {preview && !parsed && (
              <Button block variant="secondary" onClick={() => void parseImage(preview)} disabled={loading}>
                {loading ? '识别中…' : '重新识别'}
              </Button>
            )}
          </>
        )}

        {tab === 'text' && (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="把攻略文本粘到这里（也可让对话 AI 帮你识别截图后整理成文本再粘入）"
              className="w-full resize-y rounded-xl border-[1.5px] border-ink/15 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-ink"
            />
            <Button block onClick={() => void parseText(text)} disabled={loading || !text.trim()}>
              {loading ? '识别中…' : '识别文本'}
            </Button>
          </>
        )}

        {error && <p className="text-[12.5px] text-rose">{error}</p>}

        {parsed && (
          <div className="space-y-2 rounded-xl border-[1.5px] border-ink/10 bg-paperDeep p-3">
            <p className="text-[14px] font-bold">{parsed.title}</p>
            <p className="muted text-[12.5px]">{parsed.desc}</p>
            <div>
              <p className="mb-1 text-[12px] font-semibold">识别到的地点（{matched.length}）</p>
              <div className="flex flex-wrap gap-1.5">
                {matched.length === 0 ? (
                  <span className="muted text-[11.5px]">未匹配到已知 POI（仍会保存为攻略）</span>
                ) : (
                  matched.map((p) => (
                    <Tag key={p.id} tone="amber">
                      {p.emoji} {p.name}
                    </Tag>
                  ))
                )}
              </div>
            </div>
            <Button block variant="secondary" onClick={submit}>
              保存为我的攻略
            </Button>
          </div>
        )}
        <div className="text-center">
          <Link to="/guide" className="text-[12px] text-inkSoft underline" onClick={onClose}>
            返回攻略市场
          </Link>
        </div>
      </div>
    </Sheet>
  );
}
