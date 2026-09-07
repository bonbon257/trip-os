import { Chip } from '@/components/ui';
import { parseIntent } from '@/utils/parseIntent';

/**
 * ContextHint —— 把识别到的意图展示出来，让用户知道系统听懂了什么，
 * 也提供一键改说法的入口。
 *
 * 在 P0-6「删旧意图管线、统一城市匹配器」中，从旧的 intentRoute / intentSummary
 * 改为直接消费当前活跃的 parseIntent 结果（城市实体识别统一走 @/data/cityAlias
 * 的 matchCitiesInText，经由 parseIntent 内部调用）。
 *
 * 对外 API（{ q, route, onClear } 与 contextHintFromQuery）保持不变，
 * 因此 RecommendPage / WeekendPage / WeekendWherePage 等调用方无需改动。
 */

export type HintScene = 'travel' | 'weekend' | null;
export interface HintRoute {
  scene: HintScene;
}

function summarize(q: string): string {
  const p = parseIntent(q);
  const parts: string[] = [];

  if (p.entities.country) parts.push(p.entities.country);
  const cities = p.entities.cities ?? (p.entities.city ? [p.entities.city] : []);
  if (cities.length) parts.push(cities.map((c) => c.name).join(' / '));

  const ctx =
    p.context === 'TRAVEL' ? '旅游' : p.context === 'WEEKEND' ? '周末安排' : p.context === 'NOW' ? '现在' : '';
  if (ctx) parts.push(ctx);

  if (p.constraints.distance === 'near') parts.push('近一点、轻松点');
  if (p.constraints.distance === 'far') parts.push('远一点、没去过');

  const head = parts.length ? parts.join(' · ') : '还没确定场景';
  return `「${q}」听起来像 ${head}。`;
}

export function ContextHint({ q, route, onClear }: { q: string; route: HintRoute; onClear: () => void }) {
  return (
    <div className="rounded-card border-[1.5px] border-violet/40 bg-violet/10 px-4 py-3">
      <p className="text-[13px]">{summarize(q)}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Chip onClick={onClear}>换个说法</Chip>
        {route.scene && (
          <span className="text-[11px] font-semibold text-inkFaint">已自动跳到对应场景</span>
        )}
      </div>
    </div>
  );
}

export function contextHintFromQuery(q: string | null): { q: string; route: HintRoute } | null {
  if (!q) return null;
  const p = parseIntent(q);
  const scene: HintScene =
    p.context === 'TRAVEL'
      ? 'travel'
      : p.context === 'WEEKEND' || p.context === 'NOW'
        ? 'weekend'
        : null;
  return { q, route: { scene } };
}
