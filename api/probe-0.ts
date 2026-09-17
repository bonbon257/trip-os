/// <reference types="node" />
/** 0 基线：零 import。若它都 500，说明函数基础设施/部署本身有问题 */
export default async function handler(_req: unknown, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (c: string) => void }) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, stage: 'v0-no-imports', node: process.version, time: Date.now() }));
}
