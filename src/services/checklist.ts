import type { Booking, Checklist, FileAsset, Trip } from '@/types';
import { BASE_AFTER, makeChecklist, scopeItems } from '@/data/seed';
import { DESTINATIONS } from '@/data/destinations';
import { uid } from '@/utils/id';

const isInternational = (trip: Trip) =>
  DESTINATIONS.find((d) => d.id === trip.destinationId)?.scope === 'international';

/** 依据目的地 / 兴趣 / 同行关系，追加「你可能会漏掉」的条目 */
export function contextualItems(trip: Trip): string[] {
  const items: string[] = [];
  const it = new Set(trip.profile.interests);
  if (it.has('onsen')) items.push('泡汤用品与拖鞋');
  if (it.has('outdoor') || it.has('nature')) items.push('舒适的步行鞋');
  if (it.has('photo')) items.push('相机电池与存储卡');
  if (it.has('island')) items.push('防晒与防水袋');
  if (it.has('themePark')) items.push('提前绑定乐园 App 与排队券');
  if (it.has('coffee') || it.has('niche')) items.push('收藏清单：想去的独立小店');
  if (trip.profile.companions === 'family') items.push('常用药品与儿童证件');
  if (trip.profile.companions === 'partner') items.push('预留一次认真吃饭的时间');
  if (isInternational(trip)) items.push('转换插头与充电宝');
  if (trip.profile.dislikes.includes('earlyRise')) items.push('把早餐店营业时间记下来');
  return items;
}

const autoDone = (
  title: string,
  trip: Trip,
  bookings: Booking[],
  files: FileAsset[],
): boolean => {
  const has = (type: Booking['type'], status: Booking['status'] = 'confirmed') =>
    bookings.some((b) => b.tripId === trip.id && b.type === type && b.status === status);
  if (title === '确定往返大交通') return has('flight') || has('train');
  if (title === '预订住宿') return has('hotel');
  if (title === '确认重要门票 / 预约') return has('ticket');
  if (title === '检查证件有效期') return files.some((f) => f.tripId === trip.id && f.type === 'id');
  return false;
};

/**
 * 清单不是手工 Todo：由 Trip 上下文生成，且只增不删用户已有的手动条目。
 * 已存在的分组会补齐新增自动项，覆盖用户勾选状态。
 */
export function ensureTripChecklists(
  trip: Trip,
  existing: Checklist[],
  bookings: Booking[],
  files: FileAsset[],
): Checklist[] {
  const { before, during } = scopeItems(trip);
  const titles: Record<Checklist['phase'], string[]> = {
    before: [...before, ...contextualItems(trip)],
    during,
    after: BASE_AFTER,
  };
  const groupTitles: Record<Checklist['phase'], string> = {
    before: '出发前',
    during: '旅行中',
    after: '回程后',
  };

  const next: Checklist[] = [];
  (['before', 'during', 'after'] as const).forEach((phase) => {
    const current = existing.find((c) => c.tripId === trip.id && c.phase === phase);
    if (!current) {
      const cl = makeChecklist(trip.id, phase, groupTitles[phase], titles[phase]);
      cl.items.forEach((item) => {
        if (item.auto) item.done = autoDone(item.title, trip, bookings, files);
      });
      next.push(cl);
      return;
    }
    const known = new Set(current.items.map((i) => i.title));
    const missing = titles[phase]
      .filter((t) => !known.has(t))
      .map((title) => ({
        id: uid('cli'),
        title,
        done: autoDone(title, trip, bookings, files),
        auto: true,
      }));
    next.push({ ...current, items: [...current.items, ...missing] });
  });
  return next;
}
