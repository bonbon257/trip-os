import type { FastifyInstance } from 'fastify';

/** 健康检查 + 服务基本信息：用于部署后探活 */
export default async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    ok: true,
    service: 'trip-os-server',
    version: '0.1.0',
    uptime: process.uptime(),
  }));
}