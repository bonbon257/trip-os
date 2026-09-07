import { WeekendExploreView } from '@/features/weekend/WeekendExploreView';
import { useSearchParams } from 'react-router-dom';

/** /weekend/food —— 吃什么（真实高德餐饮 POI，不是收藏夹） */
export function WeekendFoodPage() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  return (
    <div className="space-y-4">
      <header>
        <p className="label">今晚吃啥</p>
        <p className="muted mt-1 text-[12.5px]">
          {q ? `你在想：${q}` : '附近餐厅 / 小吃 / 特色菜，先看看再决定。'}
        </p>
      </header>
      <WeekendExploreView title="这几家可以吃" keywords={['美食', '餐厅', '小吃']} />
    </div>
  );
}
