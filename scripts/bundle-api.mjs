// 把 api-src/*.ts 预打包成自包含 .mjs 写入 api/，内联本地 server/src 代码，
// node_modules 留外部由 Vercel 提供（和已验证可用的 0~3 探针同形态）。
//
// 根因：Vercel 的 Node 函数 trace（@vercel/nft）不会把 api/ 之外的本地
// server/src/*.ts 相对 import 打进部署产物，运行期找不到文件 → FUNCTION_INVOCATION_FAILED。
// 预打包后函数里只剩对 node_modules 的 import，Vercel 能正常提供。
//
// 为什么源放在 api-src/ 而非 api/：Vercel 在 build 之前就校验 functions glob，
// 那时 .mjs 必须已存在（故 .mjs 入库）；同时不能让 api/ 里既有 .ts 又有 .mjs
// 抢同一路由名，所以 .ts 源放在 api-src/，这里只产出 .mjs 到 api/。
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'api-src');
const outDir = path.join(root, 'api');

if (!fs.existsSync(srcDir)) {
  console.error(`[bundle-api] 找不到源目录: ${srcDir}`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

// 只打包真实入口；诊断用 probe-* 不进生产
const entries = ['[...path].ts', 'health.ts'].filter((f) =>
  fs.existsSync(path.join(srcDir, f)),
);

for (const entry of entries) {
  const name = entry.replace(/\.ts$/, '');
  // eslint-disable-next-line no-console
  console.log(`[bundle-api] bundling ${path.join('api-src', entry)} -> api/${name}.mjs`);
  await build({
    entryPoints: [path.join(srcDir, entry)],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    outfile: path.join(outDir, name + '.mjs'),
    packages: 'external',
    sourcemap: false,
    logLevel: 'warning',
  });
}

// 防御：清掉 api/ 里任何残留 .ts（不应有，但避免误提交源文件进函数目录）
for (const f of fs.readdirSync(outDir)) {
  if (f.endsWith('.ts')) {
    fs.rmSync(path.join(outDir, f), { force: true });
    // eslint-disable-next-line no-console
    console.log(`[bundle-api] removed stray ${f} from api/`);
  }
}
// eslint-disable-next-line no-console
console.log('[bundle-api] done');
