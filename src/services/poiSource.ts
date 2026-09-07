/**
 * 真实 POI 获取能力（候选池的「外部水源」）
 * ────────────────────────────────────────────────────────────
 * 把高德实时 POI 接入 Travel Planner：当一趟旅行所在城市没有手工 CURATED、
 * 且已发现的地点也不够时，从这里拉取真实地点，写入 travelDiscoveredPlaces，
 * 从而进入统一候选池（见 planningEngine.getCandidatePool）。
 *
 * 硬规则：
 *   · 只拿真实经纬度 / 真实名称的地点，绝不编造坐标或评分。
 *   · 任何一步失败（没配高德 Key、网络错、限流）一律返回空，由上层决定
 *     是提示「暂无真实地点」还是继续用已有池 —— 绝不为了凑数伪造 POI。
 *   · 这是「候选池来源」之一，与 CURATED / discovered / 攻略并列；AI 只选不编。
 */
import type { ActivityType, Place, PlaceContext } from '@/types';
import { getDestination } from '@/data/destinations';
import { resolveCityIds } from '@/data/places';
import { getCandidatePool } from '@/ai/planningEngine';
import { useStore } from '@/services/store';

/** 候选池低于此数量时，才尝试从外部（高德）补充 */
export const MIN_POOL = 6;

/** 单次规划最多从外部补充的地点数（避免把整座城塞进一个目的地） */
const MAX_EXTERNAL = 40;

interface AmapPoi {
  id: string;
  name: string;
  type: string;
  address?: string;
  lng: number;
  lat: number;
  openTime?: string;
}

/** 高德 POI 分类（分号分隔的中文串） → 我们的 ActivityType */
function amapTypeToCategory(type: string): ActivityType {
  const t = type || '';
  if (/风景名胜|景点|公园|自然保护区|世界遗产|观景|陵园|石窟/.test(t)) return 'sight';
  if (/餐饮服务|美食|小吃|糕|咖啡|茶|饮|餐/.test(t)) return 'food';
  if (/购物|商场|市场|超市|商业|书店|便利店/.test(t)) return 'shopping';
  if (/博物馆|文化|展览|美术馆|纪念馆|文物|图书馆|科技馆/.test(t)) return 'culture';
  if (/娱乐|游乐|KTV|影院|剧场|演出|演艺|主题|水族|动物园/.test(t)) return 'entertainment';
  if (/酒店|住宿|度假|民宿|客栈/.test(t)) return 'stay';
  if (/自然|户外|运动|体育|健身|登山|滑雪|湿地|海滨/.test(t)) return 'nature';
  return 'sight';
}

/** 是否需要室内（粗略判断，用于雨天替换等场景） */
function amapTypeToIndoor(type: string): boolean {
  return /博物馆|文化|展览|美术馆|纪念馆|文物|图书馆|科技馆|购物|商场|娱乐|KTV|影院|剧场|酒店|住宿|咖啡|茶|饮|餐|室内/.test(type || '');
}

/** 把真实经纬度投影到 0–100 画布坐标（围绕目的地中心，纯几何派生，非编造） */
function projectToCanvas(lng: number, lat: number, center: { lng: number; lat: number }) {
  // 1° 经度 ≈ 85km·cos(lat)，1° 纬度 ≈ 111km；放大到画布尺度：0.3° ≈ 30 单位
  const K = 100;
  const dx = (lng - center.lng) * K;
  const dy = (lat - center.lat) * K;
  const clamp = (v: number) => Math.max(2, Math.min(98, v));
  return { x: clamp(50 + dx), y: clamp(50 - dy) };
}

function normalizeAmapToPlace(raw: AmapPoi, destinationId: string, center: { lng: number; lat: number }): Place {
  const { x, y } = projectToCanvas(raw.lng, raw.lat, center);
  return {
    id: `poi-${raw.id}`,
    destinationId,
    name: raw.name,
    category: amapTypeToCategory(raw.type),
    x,
    y,
    lat: raw.lat,
    lng: raw.lng,
    address: raw.address,
    avgCost: 0,
    durationMin: 90,
    tags: [],
    indoor: amapTypeToIndoor(raw.type),
    emoji: '📍',
    requiredBooking: false,
    description: raw.address ? `位于${raw.address}` : undefined,
  };
}

async function fetchPoiOnce(city: string, keywords: string): Promise<AmapPoi[]> {
  try {
    const res = await fetch('/api/map/poi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city, keywords, pageSize: 20 }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { ok?: boolean; pois?: AmapPoi[] };
    return Array.isArray(data.pois) ? data.pois : [];
  } catch {
    return [];
  }
}

/** 对一个城市并行做多分类搜索，合并去重（上限 MAX_EXTERNAL），返回原始 AMap POI */
export async function fetchCityPois(city: string): Promise<AmapPoi[]> {
  const categories = ['景点', '美食', '购物', '文化', '娱乐'];
  const lists = await Promise.all(categories.map((kw) => fetchPoiOnce(city, kw)));
  const seen = new Set<string>();
  const merged: AmapPoi[] = [];
  for (const list of lists) {
    for (const p of list) {
      if (p.lng && p.lat && !seen.has(p.id)) {
        seen.add(p.id);
        merged.push(p);
      }
    }
  }
  return merged.slice(0, MAX_EXTERNAL);
}

/**
 * 确保一趟旅行的候选池足够规划：对池不足的城市，从真实 POI 源补充。
 * 返回新补充进 discovered 的地点数（0 表示无需补充或补充失败）。
 *
 * 这是「真实 POI 获取能力接入 Travel Planner」的落点 —— 例如 destinationId='harbin'
 * 没有手工 CURATED，getDestination('harbin') 取城市名「哈尔滨」，再向高德要真实地点。
 */
export async function ensureCandidatePool(tripId: string, context: PlaceContext = 'TRAVEL'): Promise<number> {
  const st = useStore.getState();
  const trip = st.db.trips.find((t) => t.id === tripId);
  if (!trip) return 0;

  const cityIds = resolveCityIds(trip);
  let added = 0;

  for (const id of cityIds) {
    const poolHere = getCandidatePool(st.db, trip).filter((p) => p.destinationId === id);
    if (poolHere.length >= MIN_POOL) continue;

    const dest = getDestination(id);
    if (!dest) continue;
    const center = { lng: dest.lng ?? 0, lat: dest.lat ?? 0 };
    if (!center.lng || !center.lat) continue;

    const raws = await fetchCityPois(dest.name).catch(() => []);
    for (const raw of raws) {
      const place = normalizeAmapToPlace(raw, id, center);
      st.addDiscoveredPlace(place, context);
      added++;
    }
  }

  return added;
}
