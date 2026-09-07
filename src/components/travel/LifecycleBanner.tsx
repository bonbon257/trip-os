import { useLocation, useNavigate } from 'react-router-dom';
import { deriveRouteLifecycle, preTripCopy, STATUS_LABEL } from '@/services/lifecycle';
import { Button } from '@/components/ui';

/**
 * 前置态（无 Trip）顶部状态横幅：由当前路由派生 EXPLORING / COMPARING /
 * DESTINATION_SELECTED，告诉用户「现在处于哪一步、下一步是什么」。
 * 不持久化状态，仅做 Guidance Layer。
 */
export function LifecycleBanner() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const status = deriveRouteLifecycle(pathname);
  if (!status) return null;
  const copy = preTripCopy(status);
  if (!copy) return null;

  const showBtn = status !== 'DESTINATION_SELECTED' && copy.primaryCta.to !== pathname;

  return (
    <div className="card flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 rounded-full border-[1.5px] border-violet/40 bg-violet/12 px-2.5 py-0.5 text-[11px] font-bold text-violet">
          {STATUS_LABEL[status]}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-bold leading-snug">{copy.currentState}</p>
          <p className="text-[11.5px] text-inkSoft">下一步 · {copy.nextAction}</p>
        </div>
      </div>
      {showBtn && (
        <Button size="sm" variant="primary" onClick={() => navigate(copy.primaryCta.to)}>
          {copy.primaryCta.label}
        </Button>
      )}
    </div>
  );
}
