import { useNavigate } from 'react-router-dom';
import { useStore } from '@/services/store';
import { Button, Section } from '@/components/ui';
import { fmtMDWeek, upcomingSaturday } from '@/utils/date';

/**
 * Home 区块 ②「这周末去哪？」—— 常驻，不是 Trip 的缩小版。
 *
 * · 本周末已有计划 → 显示摘要 + 进入
 * · 没有计划 → 4 个入口，跳到 /weekend 并带上 mode
 *
 * 刻意不复制 Trip 的预算 / 清单 / 预订：周末是轻量容器，
 * 详细规划在用户说「帮我安排一下」时才展开（原则 11）。
 */

const STATUS_TEXT: Record<string, string> = {
  exploring: '还在挑',
  planned: '已定下来',
  done: '已经过了',
};

export function WeekendBlock() {
  const navigate = useNavigate();
  const weekendOf = upcomingSaturday();
  const plan = useStore((s) => (s.db.weekendPlans ?? []).find((w) => w.weekendOf === weekendOf));

  const go = (mode?: string) =>
    navigate(`/weekend?w=${weekendOf}${mode ? `&mode=${mode}` : ''}`);

  return (
    <Section title="这周末去哪？" hint={fmtMDWeek(weekendOf)}>
      {plan ? (
        <div className="card flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-[14px] font-bold">{plan.title}</p>
            <p className="muted mt-0.5">
              {plan.placeIds.length ? `${plan.placeIds.length} 个地方` : '还没选地方'} ·{' '}
              {STATUS_TEXT[plan.status] ?? plan.status}
              {plan.homeCity ? ` · ${plan.homeCity}` : ''}
            </p>
          </div>
          <Button variant="primary" onClick={() => go()}>
            进入
          </Button>
        </div>
      ) : (
        <div className="card space-y-3 p-4">
          <p className="muted">还没想好？</p>
          <div className="flex flex-wrap gap-2">
            {/* 「帮我选一个」走 Discover 的周末决策层，其余直接带 mode 进 /weekend */}
            <Button variant="primary" onClick={() => navigate('/discover/weekend')}>
              帮我选一个
            </Button>
            <Button onClick={() => go('random')}>随便</Button>
            <Button onClick={() => go('nearby')}>附近看看</Button>
            <Button onClick={() => go('saved')}>从收藏中选</Button>
          </div>
        </div>
      )}
    </Section>
  );
}
