/**
 * 周末能量 / 模式识别 —— 从自由文本里抽轻量偏好，不调 LLM。
 *
 * 原属 src/utils/intent.ts（旧的「关键词硬匹配 → 固定跳页」管线）。
 * 在 P0-6「删旧意图管线、统一城市匹配器」中，把只被 Weekend 域消费的
 * detectEnergy / detectWeekendMode 迁出，让 intent.ts 归零消费者后被删除。
 *
 * 注意：这里只是周末的「能量 / 模式」关键词检测，不属于意图路由，
 * 也不参与城市实体识别（城市识别统一走 @/data/cityAlias 的 matchCitiesInText）。
 */

export type WeekendMode = 'place' | 'activity' | 'nearby' | 'saved';
export type Energy = 'near' | 'far' | null;

const ACTIVITY_KEYWORDS = ['吃', '喝', '咖啡', '美食', '展览', '电影', '看展', '演出', '话剧', '书店', '逛街', '买东西', '购物'];
const PLACE_KEYWORDS = ['去', '逛', '公园', '景点', '商圈', '商场', '老街', '古镇', '山', '海', '湖', '博物馆', '美术馆'];
const NEARBY_KEYWORDS = ['附近', '周边', '旁边', '就近', '近处'];
const SAVED_KEYWORDS = ['收藏', '标记', '保存'];

const NEAR_KEYWORDS = ['不想累', '不想太累', '不累', '近', '附近', '就近', '周边', '近处', '不想远', '轻松', '轻松点', '不要太累', '别太', '休闲', '慵懒'];
const FAR_KEYWORDS = ['远', '远点', '远一点', '远一些', '想远', '没去过', '没去', '远一点', '远足', '远行'];

export function detectWeekendMode(q: string): WeekendMode {
  const text = q.toLowerCase();
  if (SAVED_KEYWORDS.some((k) => text.includes(k))) return 'saved';
  if (NEARBY_KEYWORDS.some((k) => text.includes(k))) return 'nearby';
  if (ACTIVITY_KEYWORDS.some((k) => text.includes(k))) return 'activity';
  if (PLACE_KEYWORDS.some((k) => text.includes(k))) return 'place';
  // 默认按「去哪玩」处理，因为用户常说「这周末想出去」但没有具体动作
  return 'place';
}

export function detectEnergy(q: string): Energy {
  const text = q.toLowerCase();
  const near = NEAR_KEYWORDS.some((k) => text.includes(k));
  const far = FAR_KEYWORDS.some((k) => text.includes(k));
  if (near && !far) return 'near';
  if (far && !near) return 'far';
  return null;
}
