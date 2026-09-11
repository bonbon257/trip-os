/**
 * Vercel catch-all 函数：把 /api/* 请求转发给 Fastify 应用
 * ────────────────────────────────────────────────────────────
 * 关键点：不在顶层 import '../server/src/app'，而是 handler 内部动态 import。
 * 这样 Prisma / KV / Fastify 插件等重型依赖就算在初始化阶段抛错，也会被
 * handler 的 try/catch 兜住并返回 JSON，而不是让模块加载直接崩溃，
 * 导致 Vercel 返回模糊的 FUNCTION_INVOCATION_FAILED。
 */
import type { IncomingMessage, ServerResponse } from 'http';
import type { FastifyInstance } from 'fastify';

type CreateApp = () => Promise<FastifyInstance>;

declare const globalThis: {
  __tripOsApp?: FastifyInstance;
  __tripOsAppReady?: Promise<FastifyInstance>;
} & typeof globalThis;

async function getApp(createApp: CreateApp): Promise<FastifyInstance> {
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
    // 动态导入：把模块级错误变成 handler 级错误，可被捕获并返回 JSON
    const { createApp } = await import('../server/src/app');
    const app = await getApp(createApp);
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
