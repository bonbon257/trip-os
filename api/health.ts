import type { IncomingMessage, ServerResponse } from 'http';

/**
 * 独立轻量健康检查入口
 * ────────────────────────────────────────────────────────────
 * 不依赖任何重型模块（不加载 Fastify / Prisma / KV），用来验证
 * Vercel 函数基础设施本身是否正常。只要这个入口能返回 JSON，
 * 说明函数运行时、Node 版本、网络都没问题；剩下就是 catch-all
 * 函数里的依赖加载问题。
 */
export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  try {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        ok: true,
        service: 'trip-os-server',
        version: '0.1.0',
        node: process.version,
        env: process.env.NODE_ENV ?? 'unknown',
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        hasAiApiKey: !!process.env.AI_API_KEY,
        hasJwtSecret: !!process.env.JWT_SECRET,
        kvBound: !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
      }),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: `health handler error: ${msg}` }));
  }
}
