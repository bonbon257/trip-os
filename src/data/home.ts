import type { Inspiration, TripTemplate } from '@/types/decision';

/** 旅行模板：给「知道大概想怎么玩、但还没定地方」的用户一个起点 */
export const TRIP_TEMPLATES: TripTemplate[] = [
  {
    id: 'tpl-city-slow',
    emoji: '☕',
    title: '城市慢游 4 天',
    desc: '每天 1–2 个重点，咖啡、书店和一条值得走两遍的老街。',
    days: 4,
    budget: 3500,
    destinationId: 'hangzhou',
    pace: '每天 1–2 个重点',
  },
  {
    id: 'tpl-food',
    emoji: '🍜',
    title: '为了吃而出发 3 天',
    desc: '一天五顿不是玩笑。早市、苍蝇馆子、夜宵全部安排。',
    days: 3,
    budget: 2600,
    destinationId: 'chengdu',
    pace: '有计划，但不要太赶',
  },
  {
    id: 'tpl-island',
    emoji: '🏝️',
    title: '躺平海岛 5 天',
    desc: '不设闹钟。上午海里，下午阴影里，晚上星空下。',
    days: 5,
    budget: 6000,
    destinationId: 'okinawa',
    pace: '完全随缘',
  },
  {
    id: 'tpl-citywalk',
    emoji: '🚶',
    title: '城市暴走 6 天',
    desc: '一天玩很多。博物馆、商圈、夜景，值回票价。',
    days: 6,
    budget: 9000,
    destinationId: 'tokyo',
    pace: '特种兵',
  },
];

/** 旅行灵感：给「完全没想法」的人一点刺激，点进去就是目的地详情 */
export const INSPIRATIONS: Inspiration[] = [
  {
    id: 'ins-1',
    emoji: '🍵',
    title: '在茶山里浪费一整个下午',
    desc: '不打卡、不赶路，找个能坐下来的地方。',
    destinationId: 'hangzhou',
  },
  {
    id: 'ins-2',
    emoji: '🐼',
    title: '为了看熊猫早起一次',
    desc: '开园就进，看完回去补觉。',
    destinationId: 'chengdu',
  },
  {
    id: 'ins-3',
    emoji: '🎨',
    title: '把一天交给美术馆',
    desc: '下雨天的最佳解法：室内、冷气、和一幅看不懂但喜欢的画。',
    destinationId: 'tokyo',
  },
  {
    id: 'ins-4',
    emoji: '🏮',
    title: '在老城的巷子里迷路',
    desc: '没有导航的两个小时，往往是旅行最好的部分。',
    destinationId: 'quanzhou',
  },
];
