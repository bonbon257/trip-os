/// <reference types="node" />
/** 阶段 4：完整 app 链（所有路由 + config-store + env）。黑话化则凶手在路由链某处 */
import { createApp } from '../server/src/app';

export default async function handler(_req: unknown, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (c: string) => void }) {
  try {
    const app = await createApp();
    await app.ready();
    await app.close();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, stage: 'p4-app-chain', time: Date.now() }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, stage: 'p4-app-chain', error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack?.slice(0, 600) : undefined }));
  }
}
