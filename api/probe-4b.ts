/// <reference types="node" />
/** 阶段 4b：仅求值 8 个路由模块（不 createApp）。黑话化 → 凶手是某个路由文件的模块求值 */
import aiRoutes from '../server/src/routes/ai';
import mapRoutes from '../server/src/routes/map';
import authRoutes from '../server/src/routes/auth';
import tripRoutes from '../server/src/routes/trips';
import stateRoutes from '../server/src/routes/state';
import healthRoutes from '../server/src/routes/health';
import configRoutes from '../server/src/routes/config';
import xhsRoutes from '../server/src/routes/xhs';

export default async function handler(_req: unknown, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (c: string) => void }) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    ok: true,
    stage: 'p4b-route-modules',
    imported: [aiRoutes, mapRoutes, authRoutes, tripRoutes, stateRoutes, healthRoutes, configRoutes, xhsRoutes].map((f) => typeof f),
    time: Date.now(),
  }));
}
