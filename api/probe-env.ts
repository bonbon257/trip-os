/// <reference types="node" />
/** 隔离探针：只 import env */
import { env } from '../server/src/env';

export default async function handler(_req: unknown, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (c: string) => void }) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, stage: 'penv', nodeEnv: env.nodeEnv, time: Date.now() }));
}
