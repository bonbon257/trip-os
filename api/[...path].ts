/**
 * Vercel catch-all 函数：把 /api/* 请求转发给 Fastify 应用
 * ────────────────────────────────────────────────────────────
 * Vercel 不能跑常驻服务，所以这里用 serverless 函数「按需」装配 Fastify：
 *   · 冷启动：createApp() 装配路由 + await app.ready()（只一次，缓存复用）
 *   · 每个请求：app.server.emit('request', req, res) 交给 Fastify 处理
 *
 * 这样 server/src 下所有路由逻辑（auth / state / trips / ai / map / xhs / config）
 * 一行都不用改，全部在 Vercel 上跑。
 */
import type { IncomingMessage, ServerResponse } from 'http';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../server/src/app';

declare const globalThis: {
  __tripOsApp?: FastifyInstance;
  __tripOsAppReady?: Promise<FastifyInstance>;
} & typeof globalThis;

async function getApp(): Promise<FastifyInstance> {
  if (globalThis.__tripOsApp) return globalThis.__tripOsApp;
  if (!globalThis.__tripOsAppReady) {
    globalThis.__tripOsAppReady = (async () => {
      try {
        const app = await createApp();
        await app.ready();
        globalThis.__tripOsApp = app;
        return app;
      } catch (err) {
        // 初始化失败时清空缓存，避免同一实例永远复用失败的 Promise
        globalThis.__tripOsAppReady = undefined;
        throw err;
      }
    })();
  }
  return globalThis.__tripOsAppReady;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await getApp();
    // 交给 Fastify 接管请求/响应生命周期（它会读 body、写 res）
    app.server.emit('request', req, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error('[trip-os] handler error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: `Function init failed: ${message}` }));
    }
  }
}
