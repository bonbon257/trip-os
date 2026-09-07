import type { Place } from '@/types';
import { isWeekendCandidate } from './weekendQuality';

/** 周末「去哪玩」统一的地点模型（高德池 / 手动搜 / 小红书 / 自定义 共用） */
export interface WeekendSpot {
  id: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  /** 高德原始分类（如「风景名胜;公园」）或归一标签（景点/公园/商场/精选） */
  category: string;
  openTime?: string;
  curated?: boolean;
  source: 'pool' | 'search' | 'xhs' | 'custom';
  emoji?: string;
}

const CATEGORY_EMOJI: Record<string, string> = {
  景点: '🏞️',
  公园: '🌳',
  商场: '🏬',
  精选: '⭐',
  美食: '🍜',
  展览: '🖼️',
  博物馆: '🏛️',
};

export function emojiForCategory(kw: string): string {
  if (CATEGORY_EMOJI[kw]) return CATEGORY_EMOJI[kw];
  if (/公园|湿地|绿道|植物园/.test(kw)) return '🌳';
  if (/博物|展览|美术|纪念馆|馆/.test(kw)) return '🏛️';
  if (/乐园|游艺|游乐|主题|水世界/.test(kw)) return '🎡';
  if (/寺|庙|教堂|清真|道观|庵/.test(kw)) return '🛕';
  if (/山|湖|海|岛|峡|谷|峰|林|景/.test(kw)) return '🏞️';
  if (/街|商圈|购物|mall|广场/.test(kw)) return '🏬';
  if (/咖啡|茶|酒|餐|食|小吃/.test(kw)) return '🍜';
  return '📍';
}

/**
 * 基础质量门槛：是否为「能玩能逛」的周末候选。
 * 统一走 weekendQuality.isWeekendCandidate（Roulette / Nearby / City Discovery / Explore 共用）。
 * 这里保留 isFunAttraction 别名，避免改动其它调用方。
 */
export const isFunAttraction = isWeekendCandidate;

/**
 * 大转盘专用：只保留「景点/公园/精选」这类玩乐地点，排除商场/广场。
 * 当过滤后不足 12 个时，再把商场放回兜底，避免空转盘。
 */
export function wheelFilter(spots: WeekendSpot[]): WeekendSpot[] {
  const topCat = (s: WeekendSpot) => (s.category || '').split(';')[0] || s.category || '';
  const isAttraction = (s: WeekendSpot) =>
    isFunAttraction(s) && !['商场', '广场', '购物中心'].includes(topCat(s)) &&
    !/地铁|公交/.test(s.name);

  let filtered = spots.filter(isAttraction);
  // 去掉地铁站这类带括号的「精选」项
  filtered = filtered.filter((s) => !/[地铁站公交站]\)|\(地铁站|\(公交站/.test(s.name));

  if (filtered.length >= 12) return filtered;
  // 兜底：把商场放回
  const malls = spots.filter(
    (s) =>
      isFunAttraction(s) &&
      ['商场', '广场', '购物中心'].includes(topCat(s)) &&
      !filtered.includes(s),
  );
  return [...filtered, ...malls].slice(0, 36);
}

const SUGGEST_MIN: Record<string, number> = {
  景点: 150,
  公园: 120,
  商场: 150,
  精选: 120,
  美食: 90,
  展览: 120,
};

/** 把任意来源的周末地点转成 Place（存入周末计划/发现池用） */
export function spotToPlace(spot: WeekendSpot, cityKey: string): Place {
  const topCat = (spot.category || '').split(';')[0] || 'other';
  const activity =
    /美食|餐|食|小吃|咖啡|茶|酒/.test(topCat) ? 'food'
    : /公园|景|山|湖|海|林|湿|绿|游|乐|博物|美术|展览|馆|寺|庙|纪念/.test(topCat) ? 'sight'
    : /商场|购物|街|商圈/.test(topCat) ? 'shopping'
    : 'other';
  const emoji = spot.emoji ?? emojiForCategory(topCat);
  return {
    id: spot.id.startsWith('poi-') ? spot.id : `poi-${spot.id}`,
    destinationId: cityKey,
    name: spot.name,
    category: activity,
    x: spot.lng != null ? (spot.lng + 180) / 3.6 : 50,
    y: spot.lat != null ? (90 - spot.lat) / 1.8 : 50,
    lat: spot.lat,
    lng: spot.lng,
    address: spot.address,
    avgCost: 0,
    durationMin: SUGGEST_MIN[topCat] ?? 90,
    tags: [],
    indoor: /博物|展览|美术|馆|商场|购物|咖啡|茶|酒|餐|食/.test(topCat),
    emoji,
  };
}

/**
 * 推荐理由：为什么去这儿（基于真实数据：分类/精选/营业/距离，不编造天气人流）。
 */
export function recommendReason(spot: WeekendSpot, km?: number): string {
  const d = typeof km === 'number' ? `离你约 ${km.toFixed(1)} km` : '';
  const cat = (spot.category || '').split(';')[0] || '';
  if (/公园|湿|绿|植物园/.test(cat))
    return `不想太累就来这儿，${d ? d + '，' : ''}想走走就走走、想坐就坐，带点零食能待一下午。`;
  if (/博物|美术|展览|馆/.test(cat))
    return `室内不晒，${d ? d + '，' : ''}慢慢看不赶，雨天也能去。`;
  if (/乐园|游乐|主题|水世界/.test(cat))
    return `真要玩嗨就选这里，${d ? d + '，' : ''}项目多、耗时间，适合一整天。`;
  if (/山|湖|海|岛|峡|谷|峰|林/.test(cat))
    return `想出门透口气选这儿，${d ? d + '，' : ''}风景在线，爬爬走走都舒服。`;
  if (/商场|购物|街|商圈/.test(cat))
    return `想逛就逛、想吃就吃，${d ? d + '，' : ''}一个地方全解决，累了随时撤。`;
  if (/寺|庙|教堂|道观/.test(cat))
    return `清静又有看头，${d ? d + '，' : ''}拍照出片，顺路逛逛挺好。`;
  if (spot.curated) return `编辑精选过的地方，${d ? d + '，' : ''}一般不会踩雷，放心去。`;
  return `${spot.name}，${d ? d + '，' : ''}走一趟不累，周末散个心够用。`;
}

/**
 * 有什么好玩的：具体到「能做什么」（基于分类 + 营业信息，模板化补全）。
 */
export function funThings(spot: WeekendSpot): string {
  const cat = (spot.category || '').split(';')[0] || '';
  const open = spot.openTime ? `营业时间：${spot.openTime}。` : '';
  if (/公园|湿|绿|植物园/.test(cat))
    return `草坪野餐、湖边散步、带娃放电、跑步骑车都行。${open}`;
  if (/博物|美术|展览|馆/.test(cat))
    return `看展+拍照，常设展免费、特展另买票，门口一般能存包。${open}`;
  if (/乐园|游乐|主题|水世界/.test(cat))
    return `过山车/演出/亲子项目，热门项目先排队或买快速票。${open}`;
  if (/山|湖|海|岛|峡|谷|峰|林/.test(cat))
    return `登山看景、拍照打卡、找个观景台发呆，记得穿好走的鞋。${open}`;
  if (/商场|购物|街|商圈/.test(cat))
    return `吃喝逛买一条龙，顶楼常有无动力乐园或影院，累了随时坐下。${open}`;
  if (/寺|庙|教堂|道观/.test(cat))
    return `看古建、上香祈福、院落拍照，氛围安静适合慢慢逛。${open}`;
  if (spot.curated) return `当地人气点位，到了跟着人流和点评走就不会错。${open}`;
  return `到了看现场，顺路逛吃拍照都方便。${open}`;
}
