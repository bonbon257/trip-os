/// <reference types="node" />
/** 隔离探针：只 import config-store */
import { ensureConfigLoaded } from '../server/src/config-store';

export default async function handler(_req: unknown, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (c: string) => void }) {
  try {
    await ensureConfigLoaded();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, stage: 'pstore', time: Date.now() }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, stage: 'pstore', error: err instanceof Error ? err.message : String(err) }));
  }
}
