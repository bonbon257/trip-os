/// <reference types="node" />
/**
 * Vercel catch-all 函数：把 /api/* 请求转发给 Fastify 应用
 * ────────────────────────────────────────────────────────────
 * 不再用 app.server.emit('request', ...) 直连 socket（Vercel 的 req/res
 * 与 Node 原生实现有差异，导致 FUNCTION_INVOCATION_FAILED）。
 *
 * 改用 Fastify 官方的 app.inject()（light-my-request）：纯内存构造请求、
 * 完整走一遍 Fastify 生命周期，返回结构化响应，不碰任何 socket/流桥接。
 * 这是 Fastify 在 serverless 环境的推荐用法。
 */
import type { IncomingMessage, ServerResponse } from 'http';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../server/src/app';

// 进程级兜底：把异步链路里漏掉的异常打到日志（Vercel Function Logs 可见）
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

    // 1) 读完请求体（Vercel 传入的是流）
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
    }
    const payload = chunks.length ? Buffer.concat(chunks) : undefined;

    // 2) 复制请求头
    const headers: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      headers[key] = value;
    }

    // 3) 内存级注入给 Fastify（含查询串，req.url 自带 ?a=b）
    const reply = await app.inject({
      method: (req.method ?? 'GET') as 'DELETE' | 'HEAD' | 'GET' | 'OPTIONS' | 'PATCH' | 'POST' | 'PUT',
      url: req.url ?? '/',
      headers,
      payload,
    });

    // 4) 把 Fastify 响应写回 Vercel 的 res
    res.statusCode = reply.statusCode;
    for (const [key, value] of Object.entries(reply.headers)) {
      if (value === undefined) continue;
      res.setHeader(key, value);
    }
    res.end(reply.rawPayload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error('[trip-os] handler error:', err);
    sendError(res, 500, `Function init failed: ${message}`);
  }
}
