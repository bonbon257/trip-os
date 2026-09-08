/**
 * 高德地图代理（Web 服务 Key 在后端）
 * ────────────────────────────────────────────────────────────
 * 暴露给前端的两个常用能力：
 *   · geocode —— 地址 / 地点名 → 经纬度
 *   · route   —— 多点 → 真实驾车/步行路线与耗时
 *
 * 后续 POI 搜索、行政区查询等都加在这里，签名一致即可。
 * 真实部署时，高德 Web 服务 Key 在 server/.env 的 AMAP_WEB_KEY。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { effectiveConfig } from '../config-store';

const AMAP_BASE = 'https://restapi.amap.com/v3';

async function callAmap(path: string, params: Record<string, string>, extraHeaders: Record<string, string> = {}) {
  const cfg = effectiveConfig();
  if (!cfg.amapWebKey) {
    throw Object.assign(new Error('AMAP_WEB_KEY not configured'), { statusCode: 503 });
  }
  const url = new URL(`${AMAP_BASE}${path}`);
  url.searchParams.set('key', cfg.amapWebKey);
  url.searchParams.set('output', 'JSON');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  // 高德免费版有 QPS 限制，偶发 502/限流。重试一次（间隔 250ms）以容忍瞬时抖动。
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json', ...extraHeaders } });
      const json = (await res.json()) as {
        status: string;
        info?: string;
        count?: string;
        geocodes?: Array<{
          location: string;
          formatted_address: string;
          addressComponent?: Record<string, string>;
          level?: string;
        }>;
        route?: {
          distance: string;
          duration: string;
          paths?: Array<{
            distance: string;
            duration: string;
            steps?: Array<unknown>;
          }>;
        };
      };

      if (json.status !== '1') {
        // 限流类错误才重试，参数错误（INVALID_*）重试也没用
        if (/限流|QPS|CONCURRENT|batch/i.test(json.info ?? '')) {
          lastErr = Object.assign(new Error(json.info ?? 'amap throttle'), { statusCode: 502 });
          await new Promise((r) => setTimeout(r, 250));
          continue;
        }
        throw Object.assign(new Error(json.info ?? 'amap error'), { statusCode: 502 });
      }
      return json;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('amap error');
}

export default async function mapRoutes(app: FastifyInstance) {
  /**
   * POST /api/map/geocode
   * body: { address: string, city?: string }
   */
  app.post('/geocode', async (req, reply) => {
    const parsed = z
      .object({ address: z.string().min(1).max(200), city: z.string().optional() })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid address' });
    }
    const data = await callAmap('/geocode/geo', {
      address: parsed.data.address,
      ...(parsed.data.city ? { city: parsed.data.city } : {}),
    });
    const hit = data.geocodes?.[0];
    if (!hit) return reply.code(404).send({ ok: false, error: 'not found' });
    const [lng, lat] = hit.location.split(',');
    return {
      ok: true,
      address: hit.formatted_address,
      lng: Number(lng),
      lat: Number(lat),
      level: hit.level,
      city: hit.addressComponent?.city,
    };
  });

  /**
   * POST /api/map/around —— 真「附近」（按 location + radius 搜索）
   * body: { location: "lng,lat", radius?: 1000..50000, types?: string, keywords?: string, pageSize?: number }
   *   types 是高德 POI 分类码，逗号分隔（如 "050000" 美食、"110000" 景点、"060101" 商场）
   * 不传 location 直接 400 —— 不能拿"全城搜索"冒充附近。
   */
  app.post('/around', async (req, reply) => {
    const parsed = z
      .object({
        location: z.string().regex(/^\d+(\.\d+)?,\d+(\.\d+)?$/, 'lng,lat'),
        radius: z.number().int().min(100).max(50000).default(3000),
        types: z.string().max(60).optional(),
        keywords: z.string().max(60).optional(),
        pageSize: z.number().int().min(1).max(20).default(20),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid around params' });

    const data = await callAmap('/place/around', {
      location: parsed.data.location,
      radius: String(parsed.data.radius),
      extensions: 'base',
      offset: String(parsed.data.pageSize),
      page: '1',
      ...(parsed.data.types ? { types: parsed.data.types } : {}),
      ...(parsed.data.keywords ? { keywords: parsed.data.keywords } : {}),
    });
    const pois =
      (
        data as {
          pois?: Array<{
            id: string;
            name: string;
            type: string;
            address: string;
            location: string;
            distance?: string;
            business?: { opentime?: string };
          }>;
        }
      ).pois ?? [];
    return {
      ok: true,
      count: pois.length,
      radius: parsed.data.radius,
      pois: pois
        .map((p) => {
          const [lngStr, latStr] = (p.location ?? '').split(',');
          const lng = Number(lngStr);
          const lat = Number(latStr);
          return {
            id: p.id,
            name: p.name,
            type: p.type,
            address: p.address,
            lng,
            lat,
            /** 高德 /place/around 直接给出距 location 的米数 */
            distance: typeof p.distance === 'string' ? Number(p.distance) : undefined,
            openTime: p.business?.opentime,
          };
        })
        .filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat) && Math.abs(p.lng) > 0.001 && Math.abs(p.lat) > 0.001),
    };
  });

  /**
   * GET /api/map/ip —— IP 定位（无需用户授权）
   * 返回城市级坐标 + 矩形边界。给 useCityCenter 做兜底。
   *
   * 关键：高德 /ip 是按请求方 IP 定位的，dev 环境从 localhost 调用它看到的是 127.0.0.1，
   * 永远拿不到结果。生产环境后端在用户浏览器后面，X-Forwarded-For 会带真实公网 IP，
   * 把它透传给高德即可。
   */
  app.get('/ip', async (req, reply) => {
    const xff = req.headers['x-forwarded-for'];
    const realIp = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim() ?? req.ip;
    const headers: Record<string, string> = realIp
      ? { 'X-Forwarded-For': realIp }
      : {};
    const data = (await callAmap('/ip', {}, headers)) as {
      status: string;
      province?: string;
      city?: string;
      adcode?: string;
      rectangle?: string;
      location?: string;
    };
    if (data.status !== '1' || !data.location) {
      return reply.code(404).send({ ok: false, error: 'ip geolocation failed' });
    }
    const [lngStr, latStr] = data.location.split(',');
    const [westStr, southStr, eastStr, northStr] = (data.rectangle ?? '').split(' ');
    return {
      ok: true,
      province: data.province,
      city: data.city,
      adcode: data.adcode,
      lng: Number(lngStr),
      lat: Number(latStr),
      rectangle:
        Number(westStr) && Number(southStr) && Number(eastStr) && Number(northStr)
          ? { west: Number(westStr), south: Number(southStr), east: Number(eastStr), north: Number(northStr) }
          : undefined,
    };
  });

  /**
 * POST /api/map/poi
 * body: { city: string, keywords?: string, types?: string, pageSize?: number }
 *   types 是高德的 POI 分类码，逗号分隔，比如 "050000"(美食) "110000"(景点)
 *   keywords 是搜索词，比如 "博物馆"、"咖啡"
 * 返回带 lat/lng 的真实 POI 列表，用于填充地点池。
 */
  app.post('/poi', async (req, reply) => {
    const parsed = z
      .object({
        city: z.string().min(1).max(40),
        keywords: z.string().max(60).optional(),
        types: z.string().max(60).optional(),
        pageSize: z.number().int().min(1).max(20).default(20),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid poi params' });

    const data = await callAmap('/place/text', {
      keywords: parsed.data.keywords ?? '',
      city: parsed.data.city,
      citylimit: 'true',
      extensions: 'base',
      offset: String(parsed.data.pageSize),
      page: '1',
      ...(parsed.data.types ? { types: parsed.data.types } : {}),
    });

    const pois = (data as { pois?: Array<{ id: string; name: string; type: string; address: string; location: string; tel?: string; business?: { opentime?: string } }> })
      .pois ?? [];

    return {
      ok: true,
      count: pois.length,
      pois: pois
        .map((p) => {
          const [lngStr, latStr] = (p.location ?? '').split(',');
          const lng = Number(lngStr);
          const lat = Number(latStr);
          return {
            id: p.id,
            name: p.name,
            type: p.type,
            address: p.address,
            lng,
            lat,
            openTime: p.business?.opentime,
          };
        })
        // 没有有效经纬度的 POI 直接丢弃：避免 (0,0) 把地图视野拉到太平洋
        .filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat) && Math.abs(p.lng) > 0.001 && Math.abs(p.lat) > 0.001),
    };
  });

  /**
   * POST /api/map/route
   * body: { origin: {lng,lat}, destination: {lng,lat}, waypoints?: Array<{lng,lat}>, mode?: 'driving'|'walking'|'transit' }
   * 走 driving 路线（最常用），返回总距离 + 总时长 + 分段
   */
  app.post('/route', async (req, reply) => {
    const parsed = z
      .object({
        origin: z.object({ lng: z.number(), lat: z.number() }),
        destination: z.object({ lng: z.number(), lat: z.number() }),
        waypoints: z.array(z.object({ lng: z.number(), lat: z.number() })).max(16).optional(),
        mode: z.enum(['driving', 'walking', 'transit']).default('driving'),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid route params' });
    }
    const { origin, destination, waypoints, mode } = parsed.data;
    const path = mode === 'walking' ? '/direction/walking' : mode === 'transit' ? '/direction/transit/integrated' : '/direction/driving';
    const data = await callAmap(path, {
      origin: `${origin.lng},${origin.lat}`,
      destination: `${destination.lng},${destination.lat}`,
      ...(waypoints && waypoints.length
        ? { waypoints: waypoints.map((p) => `${p.lng},${p.lat}`).join(';') }
        : {}),
      strategy: '0', // 速度优先
      extensions: 'base',
    });

    const route = data.route;
    if (!route?.paths?.[0]) {
      return reply.code(404).send({ ok: false, error: 'no route' });
    }
    const total = route.paths[0];
    return {
      ok: true,
      mode,
      distanceMeters: Number(total.distance),
      durationSeconds: Number(total.duration),
      steps: total.steps ?? [],
    };
  });

  /**
   * GET /api/map/weather?lng=<n>&lat=<n>
   * 通过经纬度取天气：先 regeo 拿到行政区 adcode，再查天气（extensions=all）。
   * 返回未来几天的 WeatherDay[]（date/high/low/condition/emoji/text/rain）。
   *
   * 没有配置高德 Key → 503（前端会优雅降级为「无天气」）。
   * 天气是真实数据，绝不伪造；解析失败 → 空数组。
   */
  app.get('/weather', async (req, reply) => {
    const lng = Number((req.query as Record<string, string>).lng);
    const lat = Number((req.query as Record<string, string>).lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || (lng === 0 && lat === 0)) {
      return reply.code(400).send({ ok: false, error: 'invalid coords' });
    }
    try {
      const re = (await callAmap('/geocode/regeo', {
        location: `${lng},${lat}`,
        extensions: 'base',
      })) as {
        regeocode?: { addressComponent?: { adcode?: string } };
      };
      const adcode = re.regeocode?.addressComponent?.adcode;
      if (!adcode) return reply.code(404).send({ ok: false, error: 'no adcode' });

      const w = (await callAmap('/weather/weatherInfo', {
        city: adcode,
        extensions: 'all',
      })) as {
        forecasts?: Array<{
          casts?: Array<{
            date: string;
            dayweather: string;
            nightweather: string;
            daytemp: string;
            nighttemp: string;
          }>;
        }>;
      };
      const casts = w.forecasts?.[0]?.casts ?? [];
      const days = casts.map((c) => mapAmapCast(c));
      return { ok: true, days };
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode ?? 502;
      return reply.code(code).send({ ok: false, error: (err as Error).message });
    }
  });
}

/** 高德天气文字 → 我们的 WeatherDay 形状（condition / emoji / 降水指数由真实天气推导，不随机） */
function mapAmapCast(c: {
  date: string;
  dayweather: string;
  nightweather: string;
  daytemp: string;
  nighttemp: string;
}): {
  date: string;
  high: number;
  low: number;
  condition: 'sunny' | 'cloudy' | 'rain' | 'shower';
  emoji: string;
  text: string;
  rain: number;
} {
  const cond = (c.dayweather || c.nightweather || '晴').trim();
  let condition: 'sunny' | 'cloudy' | 'rain' | 'shower' = 'sunny';
  let emoji = '☀️';
  let rain = 0;
  if (cond.includes('雷')) {
    condition = 'shower';
    emoji = '⛈️';
    rain = 75;
  } else if (cond.includes('雨')) {
    condition = 'rain';
    emoji = '🌧️';
    rain = 80;
  } else if (cond.includes('雪')) {
    condition = 'rain';
    emoji = '🌨️';
    rain = 60;
  } else if (cond.includes('阴')) {
    condition = 'cloudy';
    emoji = '☁️';
    rain = 10;
  } else if (cond.includes('多云')) {
    condition = 'cloudy';
    emoji = '⛅';
    rain = 5;
  }
  const high = Number(c.daytemp);
  const low = Number(c.nighttemp);
  return {
    date: c.date,
    high: Number.isFinite(high) ? high : 0,
    low: Number.isFinite(low) ? low : 0,
    condition,
    emoji,
    text: cond,
    rain,
  };
}