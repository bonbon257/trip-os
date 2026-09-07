import { useState } from 'react';
import { useStore } from '@/services/store';
import { CandidateCard, type Candidate } from '@/components/decision/CandidateCard';
import { Button, Card, Section, Tag, toast } from '@/components/ui';
import { addMinutes, fmtMDWeek, upcomingSaturday } from '@/utils/date';
import { useCityCenter } from '@/hooks/useCityCenter';
import {
  candidateToPlace,
  savedCandidates,
  useWeekendCandidates,
} from './useWeekendCandidates';

/**
 * 周末探索视图（Weekend Context 共用）
 *
 * 去哪玩 / 附近 / 吃什么 / 玩什么 / 商圈 / 随机 这些入口共用这一套：
 *   真实 POI 搜索 → 距离 → 理由 → 最多 3 个候选 → 选中后的三个出口
 *
 * 出口保持「周末不用被计划追着跑」的原则：
 *   直接去（默认）/ 加入周末计划 / 帮我安排一下（可选展开）
 */

export interface WeekendExploreViewProps {
  title: string;
  subtitle?: string;
  /** POI 搜索关键词 */
  keywords: string[];
  /** 随机模式（大转盘） */
  random?: boolean;
  /** 只看附近：过滤超过该距离的候选 */
  maxKm?: number;
  /** 「从收藏中选」模式：不发请求 */
  saved?: boolean;
  weekendOf?: string;
}

export function WeekendExploreView({
  title,
  subtitle,
  keywords,
  random,
  maxKm,
  saved,
  weekendOf,
}: WeekendExploreViewProps) {
  const w = weekendOf ?? upcomingSaturday();
  const { center, precise, denied, requesting, request } = useCityCenter();
  const homeCity = useStore((s) => s.settings.homeCity);
  const db = useStore((s) => s.db);
  const createWeekendPlan = useStore((s) => s.createWeekendPlan);
  const updateWeekendPlan = useStore((s) => s.updateWeekendPlan);
  const setPlaceState = useStore((s) => s.setPlaceState);
  const addDiscoveredPlace = useStore((s) => s.addDiscoveredPlace);

  const [picked, setPicked] = useState<Candidate | null>(null);
  const [arranging, setArranging] = useState(false);
  const [nonce, setNonce] = useState(0);

  /**
   * 附近 / 城市级发现的边界：
   *   · maxKm（如 3km「附近看看」）只在有**真实定位**时才生效 ——
   *     此时 searchPoi 走 /around 半径搜索，是「真附近」。
   *   · 没有真实定位时（ip / geocode / 无定位）一律不放宽成「附近」：
   *     不套 3km 上限，按当前城市做城市级发现，且来源标签如实标成
   *     「城市级推荐 / 随机探索」，绝不允许把城市级 POI 伪装成「附近」。
   */
  const effectiveMaxKm = typeof maxKm === 'number' && precise ? maxKm : undefined;
  const { candidates, loading, error, source, reload } = useWeekendCandidates(
    { keywords, random, maxKm: effectiveMaxKm, nonce },
    center,
  );

  /** 来源标签 —— 不让 UI 把「随机探索」当「附近实时」卖 */
  const SOURCE_LABEL: Record<string, { tone: 'green' | 'amber' | 'ink'; text: string; helper: string }> = {
    location: { tone: 'green', text: '实时附近', helper: '基于你的位置搜索 5km 内' },
    ip: { tone: 'amber', text: '城市级推荐', helper: '按你所在城市搜索（精确位置未授权）' },
    geocode: { tone: 'amber', text: '城市级推荐', helper: '按设置的城市搜索（精确位置未授权）' },
    random: { tone: 'ink', text: '随机探索', helper: '没有可用定位 —— 明确告诉你这是随机，不是「附近」' },
  };
  const src = SOURCE_LABEL[source] ?? SOURCE_LABEL.random!;

  const savedList = saved
    ? savedCandidates({
        placeStates: db.placeStates,
        weekendDiscoveredPlaces: db.weekendDiscoveredPlaces,
      })
    : [];
  const shown = saved ? savedList : candidates;

  // ── 三个出口 ────────────────────────────────────────────
  const goNow = (c: Candidate) => {
    if (typeof c.lng !== 'number' || typeof c.lat !== 'number') {
      toast('这个地点没有精确坐标，导不了航', 'warn');
      return;
    }
    const url = `https://uri.amap.com/marker?position=${c.lng},${c.lat}&name=${encodeURIComponent(c.name)}&src=tripos&coordinate=gaode&callnative=1`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const addToPlan = (c: Candidate) => {
    const planId = createWeekendPlan({ weekendOf: w, homeCity });
    addDiscoveredPlace(candidateToPlace(c, { city: homeCity }), 'WEEKEND');
    const current = useStore.getState().db.weekendPlans.find((x) => x.id === planId);
    const placeIds = current?.placeIds.includes(c.id)
      ? current.placeIds
      : [...(current?.placeIds ?? []), c.id];
    updateWeekendPlan(planId, { placeIds, status: 'planned' });
    setPlaceState({ containerType: 'WEEKEND', containerId: planId, placeId: c.id, status: 'WANTED' });
    toast('已经放进这周末的计划里', 'default');
  };

  /** 按距离与类型给出轻量安排（不调用真实路径 API，明确告知是估算） */
  const suggestArrangement = (c: Candidate) => {
    const start: Record<string, string> = {
      '🌳': '09:30',
      '🏞️': '09:30',
      '☕': '14:00',
      '🍜': '11:30',
      '🥟': '11:30',
      '🖼️': '10:00',
      '🏬': '14:00',
    };
    const departure = start[c.emoji ?? ''] ?? '14:00';
    const km = c.distanceKm ?? 3;
    const mode: 'walk' | 'ride' | 'transit' | 'drive' =
      km < 1 ? 'walk' : km < 3 ? 'ride' : km < 8 ? 'transit' : 'drive';
    const travelMin = Math.max(
      10,
      Math.round(km * (mode === 'walk' ? 12 : mode === 'ride' ? 4 : mode === 'transit' ? 6 : 2.5)),
    );
    const modeText = { walk: '步行', ride: '骑行', transit: '公交 / 地铁', drive: '驾车' }[mode];
    const arrival = addMinutes(departure, travelMin);
    const stay = c.suggestedMin ?? 90;
    return { departure, arrival, leave: addMinutes(arrival, stay), stay, travelMin, mode, modeText };
  };

  const openRoute = (c: Candidate) => {
    if (typeof c.lng !== 'number' || typeof c.lat !== 'number') {
      toast('这个地点没有精确坐标，无法规划路线', 'warn');
      return;
    }
    const { mode } = suggestArrangement(c);
    const amapMode = { walk: '2', ride: '3', transit: '1', drive: '0' }[mode];
    const url = `https://uri.amap.com/route/plan/?dlat=${c.lat}&dlng=${c.lng}&dname=${encodeURIComponent(c.name)}&dev=0&t=${amapMode}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-5">
      <Section
        title={title}
        hint={subtitle ?? '最多三个，每个都说明了为什么'}
        action={
          <>
            <Tag tone={src.tone} className="mr-2">
              {src.text}
            </Tag>
            <Button size="sm" onClick={() => (saved ? setNonce((n) => n + 1) : reload())} disabled={loading}>
              {loading ? '找着…' : random ? '再抽一次' : '换一批'}
            </Button>
          </>
        }
      >
        {/*
          「使用我的位置」—— 显式弹一次定位（不静默索取）。
          用户拒绝过就只留一行说明，不再反复弹。
        */}
        {!precise && !saved && (
          <Card className="mb-3 border-dashed p-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 text-[12.5px] text-inkSoft">
                {denied
                  ? '你之前没授权定位，现在用的是城市级推荐。可在「设置」里改所在城市。'
                  : '想看真正「附近」的地方？授权一次定位，结果会按你的位置算距离。'}
              </p>
              {!denied && (
                <Button size="sm" variant="primary" disabled={requesting} onClick={() => void request()}>
                  {requesting ? '定位中…' : '使用我的位置'}
                </Button>
              )}
            </div>
          </Card>
        )}

        {loading && (
          <Card className="p-4">
            <p className="muted">正在找…</p>
          </Card>
        )}

        {!loading && error && (
          <Card className="p-4">
            <p className="text-[13px]">{error}</p>
          </Card>
        )}

        {!loading && !error && shown.length === 0 && (
          <Card className="p-4">
            <p className="muted">还没有候选。换个说法，或者去别处挑挑。</p>
          </Card>
        )}

        {!loading && !error && shown.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            {shown.map((c) => (
              <CandidateCard key={c.id} c={c} onPick={setPicked} actionLabel="就这个" />
            ))}
          </div>
        )}
      </Section>

      {picked && (
        <Section title={`下一步：${picked.name}`} hint="规划是可选的，想直接走也行">
          <Card className="flex flex-wrap items-center gap-2 p-4">
            <Button variant="primary" onClick={() => goNow(picked)}>
              直接去
            </Button>
            <Button onClick={() => addToPlan(picked)}>加入周末计划</Button>
            <Button variant={arranging ? 'soft' : 'secondary'} onClick={() => setArranging((v) => !v)}>
              {arranging ? '收起安排' : '帮我安排一下'}
            </Button>
            <span className="muted ml-auto text-[11.5px]">
              默认不生成行程——周末不用被计划追着跑。
            </span>
          </Card>

          {arranging && (
            <Card className="mt-3 space-y-3 p-4">
              {(() => {
                const a = suggestArrangement(picked);
                return (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border-[1.5px] border-ink/15 bg-paperDeep p-3">
                        <p className="text-[11px] font-bold text-inkFaint">建议出发</p>
                        <p className="mt-1 text-[15px] font-extrabold">
                          {fmtMDWeek(w)} {a.departure}
                        </p>
                      </div>
                      <div className="rounded-xl border-[1.5px] border-ink/15 bg-paperDeep p-3">
                        <p className="text-[11px] font-bold text-inkFaint">路上 / 到达</p>
                        <p className="mt-1 text-[15px] font-extrabold">
                          {a.modeText} · 约 {a.travelMin} min
                        </p>
                        <p className="text-[12px] text-inkSoft">{a.arrival} 到</p>
                      </div>
                      <div className="rounded-xl border-[1.5px] border-ink/15 bg-paperDeep p-3">
                        <p className="text-[11px] font-bold text-inkFaint">停留 / 结束</p>
                        <p className="mt-1 text-[15px] font-extrabold">约 {a.stay} min</p>
                        <p className="text-[12px] text-inkSoft">{a.leave} 离开</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="primary" size="sm" onClick={() => openRoute(picked)}>
                        打开高德路线规划
                      </Button>
                      <Button size="sm" onClick={() => addToPlan(picked)}>
                        把这个安排加入计划
                      </Button>
                    </div>
                    <p className="text-[11.5px] text-inkFaint">
                      时间是按距离和类型估算的，路上实际用时以高德为准。
                    </p>
                  </>
                );
              })()}
            </Card>
          )}
        </Section>
      )}
    </div>
  );
}
