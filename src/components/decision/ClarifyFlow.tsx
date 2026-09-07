import { useNavigate } from 'react-router-dom';
import { Button, Chip } from '@/components/ui';

/**
 * ClarifyFlow —— 对话式澄清。
 *
 * 用于首页输入框「说不清场景」时（路由落到 /discover?q=）：不直接丢给用户一堆入口，
 * 而是先回声一句话、再给两个最可能的方向，点一下就带 q 跳过去。
 * 不调 LLM，只是把已经识别到的信息再确认一遍。
 */
export function ClarifyFlow({ q, onClear }: { q: string; onClear: () => void }) {
  const navigate = useNavigate();
  const go = (href: string) => navigate(href);

  return (
    <div className="rounded-card border-[1.5px] border-violet/40 bg-violet/10 px-4 py-3">
      <p className="text-[13px]">
        你刚才在想：<span className="font-bold">「{q}」</span>
      </p>
      <p className="muted mt-1">是想出门旅游，还是这周末找点事做？</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={() => go(`/quiz?q=${encodeURIComponent(q)}`)}>
          ✈️ 出门旅游
        </Button>
        <Button variant="primary" size="sm" onClick={() => go(`/weekend?q=${encodeURIComponent(q)}`)}>
          ☀️ 这周末安排
        </Button>
        <Chip onClick={onClear}>换个说法</Chip>
      </div>
    </div>
  );
}
