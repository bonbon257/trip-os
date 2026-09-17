/// <reference types="node" />
/** 阶段 2：fastify 插件 + @vercel/kv + zod + bcryptjs。黑话化则凶手在这批包之一 */
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { kv } from '@vercel/kv';
import Fastify from 'fastify';

export default async function handler(_req: unknown, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (c: string) => void }) {
  try {
    const app = Fastify({ logger: false });
    await app.register(cors, { origin: true });
    await app.register(cookie);
    await app.register(jwt, { secret: 'probe' });
    await app.ready();
    await app.close();
    const parsed = z.object({ a: z.string() }).safeParse({ a: 'b' });
    const hash = bcrypt.hashSync('probe', 4);
    // 只探测 kv 是否「可访问」；KV 未绑定时 Proxy 会抛错，这里必须接住
    let kvStatus = 'ok';
    try {
      void (kv as unknown as Record<string, unknown>).constructor;
    } catch (e) {
      kvStatus = `unavailable: ${e instanceof Error ? e.message : String(e)}`;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, stage: 'p2-plugins', zod: parsed.success, bcrypt: !!hash, kvStatus, time: Date.now() }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, stage: 'p2-plugins', error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined }));
  }
}
