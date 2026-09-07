// ─────────────────────────────────────────────────────────────
// PlaceState —— 地点在某个计划容器内的状态
//
// 为什么需要它：
//   Place 是全局静态地点池，没有「容器 / 用户」维度，不能把状态字段加在 Place 上。
//   现状是三处隐含推导：savedPlaces[tripId] / 有无 Activity / Activity.status，
//   其中「已去过(visited)」完全没有持久化，只能靠反推，临时去的地方会丢失。
//
// 本文件只提供【纯函数】（读入 DB 返回新数组），不碰 UI、不碰页面。
// Phase 0 不切换现有页面的数据源——现有页面继续用 savedPlaces / Activity，
// 切换放到 Phase 1，避免破坏行程 / 地图 / 预算 / Journey。
// ─────────────────────────────────────────────────────────────

import type { DB } from '@/services/store';
import type { ID, PlaceContainerType, PlaceState, PlaceStatus } from '@/types';
import { uid } from '@/utils/id';

export const PLACE_STATUSES: PlaceStatus[] = ['WANTED', 'CANDIDATE', 'PLANNED', 'VISITED'];

export const isPlaceStatus = (v: unknown): v is PlaceStatus =>
  typeof v === 'string' && (PLACE_STATUSES as string[]).includes(v);

const nowISO = () => new Date().toISOString();

// ── 迁移播种 ────────────────────────────────────────────────
/**
 * 由现有数据推导初始 PlaceState，用于 store v1 → v2 首次升级时补齐。
 *
 * 语义映射（忠实还原现状的隐含推导，不改变任何既有行为）：
 *   某地点在该 Trip 下有 Activity 且 status==='done'        → VISITED
 *   某地点在该 Trip 下有 Activity（其它状态）                → PLANNED
 *   只在 savedPlaces 池里、没有任何 Activity                 → WANTED
 *
 * 数据源 = savedPlaces[tripId] ∪ 该 Trip 所有 Activity 的 placeId
 * （后者是必要的：AI 生成的行程可能没进过候选池）。
 *
 * 幂等：已存在 (containerType, containerId, placeId) 的记录不会被重复创建。
 */
export function seedPlaceStates(db: DB): PlaceState[] {
  const existing = new Set(
    (db.placeStates ?? []).map((s) => `${s.containerType}:${s.containerId}:${s.placeId}`),
  );
  const out: PlaceState[] = [...(db.placeStates ?? [])];
  const at = nowISO();

  const push = (containerType: PlaceContainerType, containerId: ID, placeId: ID, status: PlaceStatus) => {
    const key = `${containerType}:${containerId}:${placeId}`;
    if (existing.has(key)) return;
    existing.add(key);
    out.push({ id: uid('ps'), containerType, containerId, placeId, status, updatedAt: at });
  };

  db.trips.forEach((trip) => {
    const acts = db.activities.filter((a) => a.tripId === trip.id);
    const saved = db.savedPlaces?.[trip.id] ?? [];
    const ids = new Set<string>([
      ...saved,
      ...acts.map((a) => a.placeId).filter((id): id is string => Boolean(id)),
    ]);

    ids.forEach((placeId) => {
      const mine = acts.filter((a) => a.placeId === placeId);
      const status: PlaceStatus = mine.some((a) => a.status === 'done')
        ? 'VISITED'
        : mine.length
          ? 'PLANNED'
          : 'WANTED';
      push('TRIP', trip.id, placeId, status);
    });
  });

  // 周末计划：把它 placeIds 里、还没有状态记录的地点补为 WANTED
  (db.weekendPlans ?? []).forEach((w) => {
    w.placeIds.forEach((placeId) => push('WEEKEND', w.id, placeId, 'WANTED'));
  });

  return out;
}

// ── 查询 ────────────────────────────────────────────────────
export const placeStatesOf = (db: DB, containerType: PlaceContainerType, containerId: ID): PlaceState[] =>
  (db.placeStates ?? []).filter((s) => s.containerType === containerType && s.containerId === containerId);

export const statusOf = (
  db: DB,
  containerType: PlaceContainerType,
  containerId: ID,
  placeId: ID,
): PlaceStatus | undefined =>
  (db.placeStates ?? []).find(
    (s) => s.containerType === containerType && s.containerId === containerId && s.placeId === placeId,
  )?.status;

export const placeIdsByStatus = (
  db: DB,
  containerType: PlaceContainerType,
  containerId: ID,
  status: PlaceStatus,
): ID[] =>
  placeStatesOf(db, containerType, containerId)
    .filter((s) => s.status === status)
    .map((s) => s.placeId);

// ── 写入 ────────────────────────────────────────────────────
/**
 * 写入 / 更新一条状态。返回新数组（不修改入参）。
 *
 * 状态允许任意方向流转，没有单向门禁：
 *   WANTED → CANDIDATE → PLANNED → VISITED  正向
 *   PLANNED → CANDIDATE / WANTED            反悔（「今天不想去了」）
 *   VISITED → WANTED                        去过还想再去
 * 用户的想法可以变，系统不阻挡。
 */
export function upsertPlaceState(
  list: PlaceState[],
  input: {
    containerType: PlaceContainerType;
    containerId: ID;
    placeId: ID;
    status: PlaceStatus;
  },
): PlaceState[] {
  const idx = list.findIndex(
    (s) =>
      s.containerType === input.containerType &&
      s.containerId === input.containerId &&
      s.placeId === input.placeId,
  );
  if (idx >= 0) {
    const next = [...list];
    next[idx] = { ...next[idx], status: input.status, updatedAt: nowISO() };
    return next;
  }
  return [
    ...list,
    {
      id: uid('ps'),
      containerType: input.containerType,
      containerId: input.containerId,
      placeId: input.placeId,
      status: input.status,
      updatedAt: nowISO(),
    },
  ];
}

/** 移除一条状态记录（等同于把地点从该容器彻底移除） */
export function removePlaceState(
  list: PlaceState[],
  input: { containerType: PlaceContainerType; containerId: ID; placeId: ID },
): PlaceState[] {
  return list.filter(
    (s) =>
      !(
        s.containerType === input.containerType &&
        s.containerId === input.containerId &&
        s.placeId === input.placeId
      ),
  );
}
