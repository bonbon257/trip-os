// 把 api/*.ts 预打包成自包含 .mjs，内联本地 server/src 代码，
// node_modules 留外部由 Vercel 提供（和已验证可用的 0~3 探针同形态）。
//
// 根因：Vercel 的 Node 函数 trace（@vercel/nft）不会把本地 server/src/*.ts
// 相对 import 打进部署产物，运行期 require 找不到文件 → FUNCTION_INVOCATION_FAILED。
// 预打包后函数里只剩对 node_modules 的 import，Vercel 能正常提供。
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'api');

// 只打包真实入口；诊断用 probe-* 不进生产
const entries = ['[...path].ts', 'health.ts'].filter((f) =>
  fs.existsSync(path.join(apiDir, f)),
);

for (const entry of entries) {
  const name = entry.replace(/\.ts$/, '');
  // eslint-disable-next-line no-console
  console.log(`[bundle-api] bundling ${entry} -> ${name}.mjs`);
  await build({
    entryPoints: [path.join(apiDir, entry)],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    outfile: path.join(apiDir, name + '.mjs'),
    packages: 'external',
    sourcemap: false,
    logLevel: 'warning',
  });
}

// 删除所有 .ts 源（含探针），避免 Vercel 同时看到 .ts 与 .mjs 报冲突
for (const f of fs.readdirSync(apiDir)) {
  if (f.endsWith('.ts')) {
    fs.rmSync(path.join(apiDir, f), { force: true });
    // eslint-disable-next-line no-console
    console.log(`[bundle-api] removed ${f}`);
  }
}
// eslint-disable-next-line no-console
console.log('[bundle-api] done');
