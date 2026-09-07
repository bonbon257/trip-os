import type { ActivityType, BookingType, ExpenseCategory, FileType, Intensity } from '@/types';

export const money = (n: number) => `¥${Math.round(n).toLocaleString('zh-CN')}`;

export const moneyShort = (n: number) =>
  n >= 10000 ? `¥${(n / 10000).toFixed(1)} 万` : `¥${Math.round(n).toLocaleString('zh-CN')}`;

export const pct = (n: number) => `${Math.round(n)}%`;

export const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

export const INTENSITY_LABEL: Record<Intensity, string> = {
  low: '低',
  medium: '中',
  high: '高',
};

export const INTENSITY_TEXT: Record<Intensity, string> = {
  low: '轻松',
  medium: '适中',
  high: '高强度',
};

/** 高饱和小面积：强度色仅用于标签与进度，不做大面积背景 */
export const INTENSITY_CLASS: Record<Intensity, string> = {
  low: 'bg-moss/12 text-moss border-moss/30',
  medium: 'bg-amber/18 text-ink border-amber/60',
  high: 'bg-rose/12 text-rose border-rose/30',
};

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  stay: '住宿',
  transport: '交通',
  food: '餐饮',
  ticket: '门票',
  shopping: '购物',
  other: '其他',
};

export const CATEGORY_COLOR: Record<ExpenseCategory, string> = {
  stay: '#7C5CFF',
  transport: '#2E7CF6',
  food: '#FFC53D',
  ticket: '#22A06B',
  shopping: '#E5484D',
  other: '#A29B90',
};

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  sight: '景点',
  food: '餐饮',
  shopping: '购物',
  transport: '交通',
  stay: '住宿',
  nature: '自然',
  culture: '文化',
  entertainment: '娱乐',
  free: '自由',
  other: '其他',
};

export const BOOKING_LABEL: Record<BookingType, string> = {
  flight: '航班',
  hotel: '酒店',
  ticket: '门票',
  train: '火车',
  car: '租车',
  other: '其他',
};

export const BOOKING_EMOJI: Record<BookingType, string> = {
  flight: '✈️',
  hotel: '🏨',
  ticket: '🎟️',
  train: '🚄',
  car: '🚗',
  other: '📎',
};

export const FILE_LABEL: Record<FileType, string> = {
  flight: '机票',
  hotel: '酒店',
  ticket: '门票',
  id: '证件',
  order: '订单',
  other: '其他',
};

export const TRANSPORT_LABEL: Record<string, string> = {
  walk: '步行',
  transit: '地铁',
  taxi: '打车',
  car: '自驾',
  flight: '飞机',
  train: '火车',
};
