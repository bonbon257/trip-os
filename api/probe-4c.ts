/// <reference types="node" />
/** 阶段 4c：完整 createApp，且把进程级逃逸异常（uncaughtException/unhandledRejection）
 *  直接回写到 HTTP 响应——连 try/catch 之外的崩溃都能看到 JSON */
import { createApp } from '../server/src/app';

type Res = { statusCode: number; headersSent: boolean; setHeader: (k: string, v: string) => void; end: (c: string) => void };

export default async function handler(_req: unknown, res: Res) {
  const steps: string[] = [];
  const report = (err: unknown, source: string) => {
    // eslint-disable-next-line no-console
    console.error(`[probe-4c][${source}]:`, err);
    try {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
      }
      res.end(JSON.stringify({
        ok: false,
        stage: 'p4c-full-app',
        source,
        steps,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.slice(0, 800) : undefined,
      }));
    } catch { /* ignore */ }
  };
  process.once('uncaughtException', (err) => report(err, 'uncaughtException'));
  process.once('unhandledRejection', (err) => report(err, 'unhandledRejection'));

  try {
    const app = await createApp();
    steps.push('createApp');
    await app.ready();
    steps.push('ready');
    const urls = app.printRoutes({ commonPrefix: false }).split('\n').slice(0, 30);
    steps.push('printRoutes');
    await app.close();
    steps.push('closed');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, stage: 'p4c-full-app', steps, routes: urls, time: Date.now() }));
  } catch (err) {
    report(err, 'try-catch');
  }
}
