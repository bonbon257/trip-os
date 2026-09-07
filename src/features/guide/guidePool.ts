import { useStore } from '@/services/store';
import { getGuideContents, getStaticGuideContent } from '@/data/guides';
import { getDestination } from '@/data/destinations';
import { getPlace } from '@/data/places';
import type { GuideContent, ID, Place } from '@/types';

/** 攻略市场全部内容 = 静态内容池 + 用户导入 / 自建 */
export function useAllGuideContents(): GuideContent[] {
  const userGuides = useStore((s) => s.db.guideContents);
  return [...getGuideContents(), ...userGuides];
}

/** 解析一条攻略内容（兼容用户导入 / 自建） */
export function resolveGuideContent(id: ID): GuideContent | undefined {
  return (
    getStaticGuideContent(id) ??
    useStore.getState().db.guideContents.find((g) => g.id === id)
  );
}

/** Hook 版：实时读取用户导入 / 自建里的内容 */
export function useGuideContent(id: ID | undefined): GuideContent | undefined {
  const userGuides = useStore((s) => s.db.guideContents);
  if (!id) return undefined;
  return (
    getStaticGuideContent(id) ?? userGuides.find((g) => g.id === id)
  );
}

export function useGuideFavIds(): ID[] {
  return useStore((s) => s.db.guideFavIds);
}

export function isGuideFav(id: ID): boolean {
  return useStore.getState().db.guideFavIds.includes(id);
}

/** 攻略关联的目的地名字列表 */
export function guideDestinationNames(ids: ID[]): string[] {
  return ids.map((id) => getDestination(id)?.name ?? id);
}

/** 在攻略上下文里解析某个地点 id（按攻略归属目的地） */
export function guidePlace(guide: GuideContent, placeId: ID): Place | undefined {
  const destId = guide.playbookRef?.destinationId ?? guide.destinationIds[0];
  return destId ? getPlace(destId, placeId) : undefined;
}

export type GuideCategory =
  | 'recommend'
  | 'destination'
  | 'theme'
  | 'play'
  | 'season'
  | 'route';

/** 把全部内容按市场分区归类（推荐 / 目的地 / 主题 / 玩法 / 应季 / 路线） */
export function groupGuideContents(all: GuideContent[]) {
  const recommend = all.slice(0, 8);
  const destinationMap = new Map<ID, GuideContent[]>();
  for (const g of all) {
    for (const d of g.destinationIds) {
      if (!destinationMap.has(d)) destinationMap.set(d, []);
      // 每目的地只放一张代表性城市卡
      if (g.kind === 'city') destinationMap.get(d)!.push(g);
    }
  }
  const theme = all.filter((g) => g.kind === 'theme');
  const play = all.filter((g) => g.kind === 'play' || g.kind === 'audience');
  const route = all.filter((g) => g.kind === 'route');
  return { recommend, destinationMap, theme, play, route };
}

/** 跨目的地搜索：标题 / 目的地名 / 主题 / 人群 命中即返回 */
export function searchGuideContents(
  all: GuideContent[],
  query: string,
): GuideContent[] {
  const q = query.trim().toLowerCase();
  if (!q) return all;
  return all.filter((g) => {
    const names = guideDestinationNames(g.destinationIds).join(' ').toLowerCase();
    const hay = [g.title, g.summary, g.themes.join(' '), g.audience.join(' '), names]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}
