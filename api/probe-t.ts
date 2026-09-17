/// <reference types="node" />
/** 关键探针：只 import 一个新建的本地 server/src 模块（无任何第三方依赖）。
 *  若黑话化 → 证明 Vercel 没把本地 .ts 模块打进函数（@vercel/nft 无法 trace 无扩展名 import）
 *  若返回 JSON → 本地 import 正常，病根在 env/config-store/路由的具体代码 */
import { __trivial } from '../server/src/__trivial';

export default async function handler(_req: unknown, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (c: string) => void }) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, stage: 'pt-local-import', value: __trivial, time: Date.now() }));
}
