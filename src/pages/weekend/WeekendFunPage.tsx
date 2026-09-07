import { WeekendExploreView } from '@/features/weekend/WeekendExploreView';
import { useSearchParams } from 'react-router-dom';

/** /weekend/fun —— 玩什么（展览 / 景点 / 演出） */
export function WeekendFunPage() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  return (
    <div className="space-y-4">
      <header>
        <p className="label">玩什么</p>
        <p className="muted mt-1 text-[12.5px]">
          {q ? `你在想：${q}` : '展览 / 景点 / 演出，挑一件想做的事。'}
        </p>
      </header>
      <WeekendExploreView title="这几件事可以做" keywords={['展览', '景点', '公园']} />
    </div>
  );
}
