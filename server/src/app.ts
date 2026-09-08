/**
 * createApp —— 可复用的 Fastify 实例工厂
 * ────────────────────────────────────────────────────────────
 * 本地 dev：server/src/index.ts 调它并 listen
 * Vercel：api/[...path].ts 调它，缓存单例，把请求转发进来（不 listen）
 *
 * 注意：本文件只负责「装配」应用，不负责监听端口。
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import { PrismaClient } from '@prisma/client';
import { env } from './env';
import aiRoutes from './routes/ai';
import mapRoutes from './routes/map';
import authRoutes from './routes/auth';
import tripRoutes from './routes/trips';
import stateRoutes from './routes/state';
import healthRoutes from './routes/health';
import configRoutes from './routes/config';
import xhsRoutes from './routes/xhs';

export async function createApp() {
  const prisma = new PrismaClient();

  const app = Fastify({
    logger: { level: env.nodeEnv === 'production' ? 'info' : 'debug' },
    // Vercel 等 serverless 环境里不要因为 keep-alive 超时就退出
    requestTimeout: 30000,
    // 小红书图片以 base64 上传，默认 1MB 不够，放宽到 12MB
    bodyLimit: 12 * 1024 * 1024,
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      // 同源请求允许任何 origin, 否则按 env.corsOrigins 白名单
      if (!origin || env.corsOrigins.includes(origin)) {
        cb(null, true);
        return;
      }
      cb(null, false);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.register(cookie);
  await app.register(jwt, { secret: env.jwtSecret });

  app.decorate('prisma', prisma);
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(configRoutes, { prefix: '/api/config' });
  await app.register(aiRoutes, { prefix: '/api/ai' });
  await app.register(mapRoutes, { prefix: '/api/map' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(tripRoutes, { prefix: '/api/trips' });
  await app.register(stateRoutes, { prefix: '/api' });
  await app.register(xhsRoutes, { prefix: '/api/xhs' });

  app.setErrorHandler((err, _req, reply) => {
    app.log.error(err);
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    reply.status(status).send({
      ok: false,
      error: err.message,
    });
  });

  return app;
}
