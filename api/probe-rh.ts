/// <reference types="node" />
/** 隔离探针：只 import 单个最简单的路由模块 health */
import healthRoutes from '../server/src/routes/health';

export default async function handler(_req: unknown, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (c: string) => void }) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, stage: 'prh', type: typeof healthRoutes, time: Date.now() }));
}
