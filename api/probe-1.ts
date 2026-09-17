/// <reference types="node" />
/** 阶段 1：仅 fastify 本体。若 /api/probe-0 正常而这里 FUNCTION_INVOCATION_FAILED，凶手是 fastify 模块求值 */
import Fastify from 'fastify';

export default async function handler(_req: unknown, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (c: string) => void }) {
  try {
    const app = Fastify({ logger: false });
    app.get('/x', async () => ({ ok: true }));
    await app.ready();
    await app.close();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, stage: 'p1-fastify', fastifyVersion: (Fastify as unknown as { fastify?: string }).fastify ?? 'unknown', time: Date.now() }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, stage: 'p1-fastify', error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined }));
  }
}
