import type {
  BudgetRange,
  Companions,
  DestinationScope,
  DurationBucket,
  Pace,
  TravelMood,
} from '@/types';

export interface Option<T> {
  value: T;
  label: string;
  emoji?: string;
  desc?: string;
}

export const INTERESTS: Option<string>[] = [
  { value: 'chill', label: '躺平', emoji: '🛋️' },
  { value: 'food', label: '吃东西', emoji: '🍜' },
  { value: 'shopping', label: '逛街', emoji: '🛍️' },
  { value: 'nature', label: '自然风景', emoji: '⛰️' },
  { value: 'citywalk', label: '城市漫游', emoji: '🚶' },
  { value: 'coffee', label: '咖啡', emoji: '☕' },
  { value: 'architecture', label: '建筑', emoji: '🏛️' },
  { value: 'art', label: '艺术', emoji: '🎨' },
  { value: 'museum', label: '博物馆', emoji: '🏺' },
  { value: 'photo', label: '拍照', emoji: '📷' },
  { value: 'nightlife', label: '夜生活', emoji: '🌃' },
  { value: 'themePark', label: '主题乐园', emoji: '🎡' },
  { value: 'niche', label: '小众探索', emoji: '🧭' },
  { value: 'outdoor', label: '户外', emoji: '🥾' },
  { value: 'onsen', label: '温泉', emoji: '♨️' },
  { value: 'island', label: '海岛', emoji: '🏝️' },
];

export const DISLIKES: Option<string>[] = [
  { value: 'earlyRise', label: '早起', emoji: '🌅' },
  { value: 'walking', label: '暴走', emoji: '🚶‍♀️' },
  { value: 'hotelChange', label: '频繁换酒店', emoji: '🧳' },
  { value: 'longTransit', label: '长时间坐车', emoji: '🚌' },
  { value: 'crowds', label: '人挤人', emoji: '👥' },
  { value: 'planning', label: '做攻略', emoji: '📋' },
  { value: 'highCost', label: '高消费', emoji: '💸' },
  { value: 'rush', label: '天天赶行程', emoji: '⏱️' },
  { value: 'checkin', label: '频繁打卡', emoji: '📌' },
];

export const MOODS: Option<TravelMood>[] = [
  { value: 'tired', label: '有点累，想休息', emoji: '😮‍💨' },
  { value: 'change', label: '想换个环境', emoji: '🔄' },
  { value: 'energetic', label: '最近状态很好，想玩', emoji: '⚡' },
  { value: 'reward', label: '想奖励自己', emoji: '🎁' },
  { value: 'escape', label: '只是想逃离工作', emoji: '🏃' },
  { value: 'alone', label: '想一个人待着', emoji: '🌙' },
  { value: 'social', label: '想和朋友热闹一下', emoji: '🎉' },
];

export const DURATIONS: Option<DurationBucket>[] = [
  { value: 'd23', label: '2–3 天', desc: '周末或小长假' },
  { value: 'd45', label: '4–5 天', desc: '请两天假' },
  { value: 'd67', label: '6–7 天', desc: '完整一周' },
  { value: 'd810', label: '8–10 天', desc: '长假' },
  { value: 'd10p', label: '10 天以上', desc: '慢慢走' },
];

export const BUDGETS: Option<BudgetRange>[] = [
  { value: 'b1', label: '¥1,000 以下', desc: '周边走走' },
  { value: 'b2', label: '¥1,000–3,000', desc: '国内短途' },
  { value: 'b3', label: '¥3,000–5,000', desc: '舒适一点' },
  { value: 'b4', label: '¥5,000–10,000', desc: '出境或长线' },
  { value: 'b5', label: '¥10,000+', desc: '不设上限' },
];

export const PACES: Option<Pace>[] = [
  { value: 'intense', label: '特种兵', desc: '一天玩很多，值回票价' },
  { value: 'balanced', label: '有计划，但不要太赶', desc: '每天 3–4 个地点' },
  { value: 'focused', label: '每天 1–2 个重点', desc: '留白比打卡重要' },
  { value: 'free', label: '完全随缘', desc: '走到哪算哪' },
];

export const COMPANIONS: Option<Companions>[] = [
  { value: 'solo', label: '自己', emoji: '🧍' },
  { value: 'partner', label: '伴侣', emoji: '💑' },
  { value: 'friends', label: '朋友', emoji: '👯' },
  { value: 'family', label: '家人', emoji: '👨‍👩‍👧' },
  { value: 'colleagues', label: '同事', emoji: '🧑‍💼' },
  { value: 'group', label: '多人旅行', emoji: '🚌' },
];

export const SCOPES: Option<DestinationScope>[] = [
  { value: 'domestic', label: '国内', emoji: '🇨🇳' },
  { value: 'international', label: '国外', emoji: '✈️' },
  { value: 'any', label: '都可以', emoji: '🌏' },
];

export const ORIGINS: { name: string; lat: number; lng: number }[] = [
  { name: '北京', lat: 39.9, lng: 116.4 },
  { name: '上海', lat: 31.23, lng: 121.47 },
  { name: '广州', lat: 23.13, lng: 113.26 },
  { name: '深圳', lat: 22.54, lng: 114.06 },
  { name: '成都', lat: 30.57, lng: 104.07 },
  { name: '杭州', lat: 30.27, lng: 120.16 },
  { name: '武汉', lat: 30.59, lng: 114.3 },
  { name: '西安', lat: 34.34, lng: 108.94 },
];

export const labelOf = (list: Option<string>[], v: string) =>
  list.find((o) => o.value === v)?.label ?? v;

export const emojiOf = (list: Option<string>[], v: string) =>
  list.find((o) => o.value === v)?.emoji ?? '•';
