/// <reference types="node" />
/**
 * Vercel catch-all 函数：把 /api/* 请求转发给 Fastify 应用
 * ────────────────────────────────────────────────────────────
 * Vercel 不能跑常驻服务，所以这里用 serverless 函数「按需」装配 Fastify：
 *   · 冷启动：createApp() 装配路由 + await app.ready()（只一次，缓存复用）
 *   · 每个请求：app.server.emit('request', req, res) 交给 Fastify 处理
 *
 * 为什么用动态 import('./_app') 而不是静态 import？
 *   静态 import 失败时（模块加载阶段），handler 的 try/catch 根本来不及执行，
 *   Vercel 网关会直接返回 FUNCTION_INVOCATION_FAILED 模糊错误页。
 *   动态 import 把错误推迟到 handler 运行时，从而能被 catch 住并返回 JSON。
 *   _app.ts 与 [...path].ts 同目录，Vercel 打包器会把它一起打进函数包。
 */
import type { IncomingMessage, ServerResponse } from 'http';
import type { FastifyInstance } from 'fastify';

type TripOsGlobal = {
  __tripOsApp?: FastifyInstance;
  __tripOsAppReady?: Promise<FastifyInstance>;
};

const tripOsGlobal = globalThis as unknown as TripOsGlobal;

async function getApp(): Promise<FastifyInstance> {
  if (tripOsGlobal.__tripOsApp) return tripOsGlobal.__tripOsApp;
  if (!tripOsGlobal.__tripOsAppReady) {
    tripOsGlobal.__tripOsAppReady = (async () => {
      try {
        // 延迟加载：让模块级错误落入 handler 的 catch
        const { createApp } = await import('./_app');
        const app = await createApp();
        await app.ready();
        tripOsGlobal.__tripOsApp = app;
        return app;
      } catch (err) {
        // 初始化失败时清空缓存，避免同一实例永远复用失败的 Promise
        tripOsGlobal.__tripOsAppReady = undefined;
        throw err;
      }
    })();
  }
  return tripOsGlobal.__tripOsAppReady;
}

function sendError(res: ServerResponse, status: number, message: string) {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: false, error: message }));
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
    sendError(res, 500, `Function init failed: ${message}`);
  }
}
