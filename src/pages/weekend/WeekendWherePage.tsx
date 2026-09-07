import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { WeekendExploreView } from '@/features/weekend/WeekendExploreView';
import { Chip } from '@/components/ui';
import { fmtMDWeek, upcomingSaturday } from '@/utils/date';
import { detectEnergy, detectWeekendMode } from '@/utils/weekendMode';
import { ContextHint, contextHintFromQuery } from '@/components/decision/ContextHint';

/**
 * /weekend/where —— 这周末去哪
 *
 * 四个模式对应不同的真实搜索策略：
 *   place    → 地点导向：公园 / 景点 / 商圈
 *   activity → 活动导向：咖啡 / 美食 / 展览
 *   nearby   → 综合一圈，且只保留 3km 内
 *   saved    → 不发请求，读用户标记过想去的地方
 */
const MODE_KEYWORDS: Record<string, string[]> = {
  place: ['公园', '景点', '商圈'],
  activity: ['咖啡', '美食', '展览'],
  nearby: ['咖啡', '公园', '展览'],
  saved: [],
};

const MODE_TITLE: Record<string, string> = {
  place: '这几个地方可以去',
  activity: '这几件事可以做',
  nearby: '附近这些',
  saved: '你标记过想去的',
};

export function WeekendWherePage() {
  const [params, setParams] = useSearchParams();
  const weekendOf = params.get('w') ?? upcomingSaturday();
  const q = params.get('q') ?? '';
  const energyParam = params.get('energy') ?? '';
  const [mode, setMode] = useState(() => params.get('mode') ?? (q ? detectWeekendMode(q) : 'place'));
  const energy = (energyParam || (q ? detectEnergy(q) : null)) as 'near' | 'far' | null;
  const hint = contextHintFromQuery(q);

  return (
    <div className="space-y-5">
      <header className="sticky-note px-5 py-6 sm:px-8 sm:py-8">
        <p className="label">周末</p>
        <h1 className="h1 mt-2">这周末去哪？</h1>
        <p className="muted mt-2">{fmtMDWeek(weekendOf)}</p>

        {hint && (
          <div className="mt-4">
            <ContextHint
              q={hint.q}
              route={hint.route}
              onClear={() => {
                const next = new URLSearchParams(params);
                next.delete('q');
                next.delete('energy');
                setParams(next, { replace: true });
              }}
            />
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ['place', '去哪玩'],
              ['activity', '做什么'],
              ['nearby', '附近看看'],
              ['saved', '从收藏中选'],
            ] as const
          ).map(([m, label]) => (
            <Chip
              key={m}
              active={mode === m}
              onClick={() => {
                setMode(m);
                const next = new URLSearchParams(params);
                next.set('mode', m);
                setParams(next);
              }}
            >
              {label}
            </Chip>
          ))}
        </div>
      </header>

      <WeekendExploreView
        key={mode}
        title={MODE_TITLE[mode] ?? '这几个更适合你'}
        keywords={MODE_KEYWORDS[mode] ?? MODE_KEYWORDS.place!}
        saved={mode === 'saved'}
        maxKm={mode === 'nearby' || energy === 'near' ? 3 : undefined}
        weekendOf={weekendOf}
      />
    </div>
  );
}
