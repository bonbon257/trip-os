/// <reference types="node" />
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
// 只做类型引用，运行时惰性加载——避免 @prisma/client 在模块求值阶段抛错
// 导致整个 Vercel 函数变成不可诊断的 FUNCTION_INVOCATION_FAILED
import type { PrismaClient } from '@prisma/client';
import { env } from './env';
import aiRoutes from './routes/ai';
import mapRoutes from './routes/map';
import authRoutes from './routes/auth';
import tripRoutes from './routes/trips';
import stateRoutes from './routes/state';
import healthRoutes from './routes/health';
import configRoutes from './routes/config';
import xhsRoutes from './routes/xhs';
import { ensureConfigLoaded } from './config-store';

export async function createApp() {
  // 先加载运行时配置（KV/文件），避免路由处理时读到空覆盖；失败也不崩溃
  await ensureConfigLoaded().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[createApp] 运行时配置加载失败，继续使用环境变量默认值:', err);
  });

  // 运行时惰性加载 Prisma Client；任何加载错误都会被上层 try/catch 捕获
  // 并转成可见 JSON，而不是 Vercel 的 FUNCTION_INVOCATION_FAILED
  const prismaMod = (await import('@prisma/client')) as unknown as {
    PrismaClient?: new () => PrismaClient;
    default?: { PrismaClient: new () => PrismaClient };
  };
  const PrismaClientCtor = prismaMod.PrismaClient ?? prismaMod.default?.PrismaClient;
  if (!PrismaClientCtor) {
    throw new Error('@prisma/client 未正确生成：请确认部署阶段已执行 prisma generate');
  }
  const prisma = new PrismaClientCtor();

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