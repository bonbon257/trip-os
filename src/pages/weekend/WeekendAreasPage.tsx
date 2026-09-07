import { WeekendExploreView } from '@/features/weekend/WeekendExploreView';
import { useSearchParams } from 'react-router-dom';

/** /weekend/areas —— 商圈探索 */
export function WeekendAreasPage() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  return (
    <div className="space-y-4">
      <header>
        <p className="label">商圈探索</p>
        <p className="muted mt-1 text-[12.5px]">
          {q ? `你在想：${q}` : '一个地方逛、吃、玩全解决，不用跑来跑去。'}
        </p>
      </header>
      <WeekendExploreView title="这几个商圈" keywords={['商圈', '商场', '步行街']} />
    </div>
  );
}
