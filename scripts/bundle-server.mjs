// 把 server/src/index.ts 打包成自包含 dist-server/index.mjs，
// 供 Railway / Render 等常驻 Node 部署直接 `node dist-server/index.mjs` 运行。
//
// 思路与 Vercel 的 bundle-api.mjs 一致，但这里是「真正监听端口」的服务进程：
//   · 本地代码（server/src/*）全部内联进单文件，避免运行期找不到相对模块；
//   · node_modules 留外部（packages: 'external'），由部署平台的依赖安装提供；
//   · 因此 Prisma / Fastify / @vercel/kv 等仍在 node_modules 里按常规解析。
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'server', 'src', 'index.ts');
const outDir = path.join(root, 'dist-server');
const outfile = path.join(outDir, 'index.mjs');

if (!fs.existsSync(entry)) {
  console.error(`[bundle-server] 找不到入口: ${entry}`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

// eslint-disable-next-line no-console
console.log(`[bundle-server] bundling ${entry} -> ${outfile}`);
await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile,
  packages: 'external',
  sourcemap: false,
  // ESM 入口里有顶层 await（await createApp()），node22 原生支持
  logLevel: 'warning',
});
// eslint-disable-next-line no-console
console.log('[bundle-server] done');
