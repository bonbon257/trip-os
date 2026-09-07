/**
 * 用高德 AMap 自动扫描城市，生成「大转盘」候选池 → public/spin-pool.json
 *
 * 用法：
 *   node scripts/run-ts-smoke.mjs build-spin-pool
 *
 * 环境变量：
 *   LIMIT=10          只扫前 10 个城市（默认全量 388）
 *   CATEGORIES=110000,110101,060101   高德 POI 分类码（默认 景点+公园+商场）
 *   PER=8             每个分类每个城市最多取几个（默认 8）
 *   RESUME=0          是否跳过已有城市的条目（默认 1）
 *
 * 说明：
 *   · 直接调高德 REST（key 从 server/.env 读），不依赖后端是否启动
 *   · 城市间 250ms 节流，避免触发高德 QPS 限流
 *   · 断点续跑：已存在且非空的城市默认跳过，中断后重跑不会浪费配额
 *   · 输出放 public/ 而不是 src/：避免把 ~1MB 数据打进主 bundle，
 *     大转盘页面按需 fetch 即可
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { CN_CITIES } from '@/data/cities-cn';
import { isWeekendCandidate } from '@/features/weekend/weekendQuality';

/**
 * 注意：脚本会被 esbuild 打到临时目录再执行，所以 **不能** 用 import.meta.url
 * 推算项目根目录（会指向 /tmp）。这里用 process.cwd()——npm script 都在项目根跑。
 */
const root = process.cwd();

/** 高德 POI 分类码 */
const DEFAULT_CATEGORIES = ['110000', '110101', '060101'];
const CATEGORY_LABEL: Record<string, string> = {
  '110000': '景点',
  '110101': '公园',
  '060101': '商场',
  '050000': '餐饮',
  '050500': '咖啡',
  '140000': '展览',
};

function amapKey(): string {
  const envPath = path.join(root, 'server', '.env');
  if (!existsSync(envPath)) throw new Error(`找不到 ${envPath}`);
  const txt = readFileSync(envPath, 'utf8');
  const m = txt.match(/^AMAP_WEB_KEY\s*=\s*(.+)$/m);
  if (!m) throw new Error('server/.env 里没有 AMAP_WEB_KEY');
  return m[1]!.trim().replace(/^['"]|['"]$/g, '');
}

const KEY = amapKey();
const AMAP_BASE = 'https://restapi.amap.com/v3';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 高德配额耗尽时抛出，主流程捕获后保存进度并优雅退出（次日续跑） */
class QuotaError extends Error {}

/**
 * 无聊 POI 过滤统一走 weekendQuality.isWeekendCandidate（与前端周末推荐同一套门槛）。
 * 普通分类条目与 cities-cn 的 curated highlights（byName）都过同一道关，
 * 不再因为 curated=true 就跳过质量校验自动进转盘。
 */

interface Poi {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
  openTime?: string;
  /** 来自 cities-cn 的 highlights（编辑精选过），转盘优先展示 */
  curated?: boolean;
}

async function fetchCategory(
  cityName: string,
  types: string,
  per: number,
): Promise<Poi[]>;
/** 按名字精确搜一个精选景点（cities-cn 的 highlights） */
async function fetchCategory(
  cityName: string,
  keywords: string,
  per: number,
  byName: true,
): Promise<Poi[]>;
async function fetchCategory(
  cityName: string,
  typesOrKeywords: string,
  per: number,
  byName = false,
): Promise<Poi[]> {
  const url = new URL(`${AMAP_BASE}/place/text`);
  url.searchParams.set('key', KEY);
  url.searchParams.set('output', 'JSON');
  url.searchParams.set('city', cityName);
  url.searchParams.set('citylimit', 'true');
  url.searchParams.set('offset', String(per));
  url.searchParams.set('page', '1');
  url.searchParams.set('extensions', 'base');
  if (byName) {
    url.searchParams.set('keywords', typesOrKeywords);
  } else {
    url.searchParams.set('keywords', '');
    url.searchParams.set('types', typesOrKeywords);
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      const json = (await res.json()) as {
        status: string;
        info?: string;
        pois?: Array<{
          id: string;
          name: string;
          type: string;
          address: string;
          location: string;
          business?: { opentime?: string };
        }>;
      };
      if (json.status !== '1') {
        const info = json.info ?? '';
        // 限流类（QPS/频率）重试
        if (/限流|QPS|CONCURRENT|频率/i.test(info)) {
          await sleep(800);
          continue;
        }
        // 配额耗尽（日配额/服务额度）→ 抛出让主流程保存进度退出
        if (/配额|QUOTA|OUT_OF|EXCEED|超出|DAY_QUOTA/i.test(info)) {
          throw new QuotaError(info);
        }
        return [];
      }
      return (json.pois ?? [])
        .map((p) => {
          const [lngStr, latStr] = (p.location ?? '').split(',');
          const lat = Number(latStr);
          const lng = Number(lngStr);
          return {
            id: p.id,
            name: p.name,
            address: p.address,
            lat,
            lng,
            category: byName ? '精选' : CATEGORY_LABEL[typesOrKeywords] ?? typesOrKeywords,
            openTime: p.business?.opentime,
            ...(byName ? { curated: true } : {}),
          };
        })
        .filter(
          (p) =>
            Number.isFinite(p.lat) &&
            Number.isFinite(p.lng) &&
            Math.abs(p.lat) > 0.001 &&
            Math.abs(p.lng) > 0.001 &&
            // 普通分类与 curated highlights 统一过周末质量门槛（不再因 curated=true 跳过）
            isWeekendCandidate(p),
        );
    } catch {
      await sleep(600);
    }
  }
  return [];
}

// ── 主流程 ────────────────────────────────────────────────────
const LIMIT = Number(process.env.LIMIT ?? 0) || CN_CITIES.length;
const CATEGORIES = (process.env.CATEGORIES ?? DEFAULT_CATEGORIES.join(',')).split(',');
const PER = Number(process.env.PER ?? 8);
const RESUME = process.env.RESUME !== '0';

const outPath = path.join(root, 'public', 'spin-pool.json');

interface Pool {
  generatedAt: string;
  categories: string[];
  cityCount: number;
  poiCount: number;
  cities: Record<string, { lat: number; lng: number; pois: Poi[] }>;
}

let pool: Pool = { generatedAt: '', categories: CATEGORIES, cityCount: 0, poiCount: 0, cities: {} };
if (RESUME && existsSync(outPath)) {
  try {
    pool = JSON.parse(readFileSync(outPath, 'utf8')) as Pool;
    console.log(`续跑：已有 ${pool.cityCount} 个城市 / ${pool.poiCount} 个 POI`);
  } catch {
    /* 损坏则重来 */
  }
}
pool.categories = CATEGORIES;

/**
 * 优先城市：放在最前面先扫，这样大转盘页面一上来就有招牌城市可用。
 * 已扫过的城市 resume 时会自动跳过，所以不影响全量完整性。
 */
const PRIORITY_CITIES = [
  '北京', '上海', '广州', '深圳', '成都', '杭州', '西安', '重庆', '武汉', '南京',
  '苏州', '长沙', '厦门', '青岛', '天津', '昆明', '三亚', '丽江', '大理', '贵阳',
  '福州', '合肥', '郑州', '哈尔滨', '沈阳', '济南', '南昌', '南宁', '兰州', '乌鲁木齐',
];

const byPriority = [...CN_CITIES].sort((a, b) => {
  const ia = PRIORITY_CITIES.indexOf(a.name);
  const ib = PRIORITY_CITIES.indexOf(b.name);
  if (ia === -1 && ib === -1) return 0;
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
});

const targets = byPriority.slice(0, LIMIT);
let done = 0;
let added = 0;

function savePool() {
  pool.generatedAt = pool.generatedAt || new Date().toISOString();
  pool.cityCount = Object.keys(pool.cities).length;
  pool.poiCount = Object.values(pool.cities).reduce((s, c) => s + c.pois.length, 0);
  writeFileSync(outPath, JSON.stringify(pool));
}

try {
for (const city of targets) {
  const name = city.name.replace(/(城区|市|自治州|地区|自治县|县|盟|特别行政区)$/, '') || city.name;
  const existing = pool.cities[name];
  if (RESUME && existing && existing.pois.length > 0) {
    done++;
    continue;
  }

  // 1) 精选：cities-cn 自带的 highlights（编辑筛过的招牌景点），优先入池
  const curatedPois: Poi[] = [];
  const seen = new Set<string>();
  for (const h of city.highlights ?? []) {
    const got = await fetchCategory(name, h, 1, true);
    for (const p of got) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      curatedPois.push(p);
    }
    await sleep(250);
  }

  // 2) 分类补量：按高德 POI 分类码拉，过滤掉无聊条目
  const pois: Poi[] = [...curatedPois];
  for (const types of CATEGORIES) {
    const got = await fetchCategory(name, types, PER);
    for (const p of got) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      pois.push(p);
    }
    await sleep(250);
  }

  pool.cities[name] = { lat: city.lat, lng: city.lng, pois };
  added++;
  done++;
  if (done % 10 === 0 || done === targets.length) {
    console.log(`  ${done}/${targets.length} · ${name}（${pois.length} 个）`);
    // 每 10 个城市落一次盘，中断不丢
    savePool();
  }
}
} catch (e) {
  if (e instanceof QuotaError) {
    savePool();
    console.error(`\n[配额耗尽] 高德今日配额已用完（${e.message}）。`);
    console.error(`  已保存 ${pool.cityCount} 城 / ${pool.poiCount} POI → public/spin-pool.json`);
    console.error(`  明天重跑同一命令即可断点续跑（已完成的城市会自动跳过）。`);
    process.exit(0);
  }
  throw e;
}

savePool();

console.log(`\n完成 → public/spin-pool.json`);
console.log(`  城市 ${pool.cityCount} · POI ${pool.poiCount} · 本次新增城市 ${added}`);
