import type { FastifyInstance } from 'fastify';

/** 健康检查 + 服务基本信息：用于部署后探活 + 排错 */
export default async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    ok: true,
    service: 'trip-os-server',
    version: '0.1.0',
    uptime: process.uptime(),
    runtime: {
      node: process.version,
      env: process.env.NODE_ENV ?? 'unknown',
    },
    config: {
      databaseUrl: !!process.env.DATABASE_URL,
      jwtSecret: !!process.env.JWT_SECRET,
      aiApiKey: !!process.env.AI_API_KEY,
      aiBaseUrl: process.env.AI_BASE_URL ?? '(default)',
      aiModel: process.env.AI_MODEL ?? '(default)',
      kvBound: !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
      amapWebKey: !!process.env.AMAP_WEB_KEY,
    },
  }));
}