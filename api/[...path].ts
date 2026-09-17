/// <reference types="node" />
/**
 * Vercel catch-all 函数：把 /api/* 请求转发给 Fastify 应用
 * ────────────────────────────────────────────────────────────
 * Vercel 不能跑常驻服务，所以这里用 serverless 函数「按需」装配 Fastify：
 *   · 冷启动：createApp() 装配路由 + await app.ready()（只一次，缓存复用）
 *   · 每个请求：app.server.emit('request', req, res) 交给 Fastify 处理
 *
 * 重要：Vercel 会把未捕获的异常/未处理 rejection 直接变成 opaque 的
 * FUNCTION_INVOCATION_FAILED，看不到具体原因。这里加了两层兜底：
 *   1) 捕获 getApp() 初始化异常 → 返回可见 JSON（而不是 500 空白）
 *   2) 监听 res 的 finish/error + 进程级 unhandledRejection/uncaughtException
 *      → 把真实堆栈打到 Function Logs，方便定位
 */
import type { IncomingMessage, ServerResponse } from 'http';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../server/src/app';

// 进程级兜底：把异步链路里 Fastify 没接住的异常打到日志（Vercel Function Logs 可见）
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[trip-os] unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('[trip-os] uncaughtException:', err);
});

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

    // 等待本次响应结束，捕获 Fastify 异步链里漏掉的异常
    await new Promise<void>((resolve) => {
      res.once('close', resolve);
      res.once('finish', resolve);
      res.once('error', resolve);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error('[trip-os] handler error:', err);
    sendError(res, 500, `Function init failed: ${message}`);
  }
}
