/// <reference types="node" />
/** 阶段 4a：仅求值 env + config-store。黑话化 → 凶手在这两个文件的模块求值 */
import { env } from '../server/src/env';
import { ensureConfigLoaded, getRuntimeConfig } from '../server/src/config-store';

export default async function handler(_req: unknown, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (c: string) => void }) {
  try {
    await ensureConfigLoaded();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, stage: 'p4a-env-configstore', nodeEnv: env.nodeEnv, cfgKeys: Object.keys(getRuntimeConfig()), time: Date.now() }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, stage: 'p4a-env-configstore', error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack?.slice(0, 600) : undefined }));
  }
}
