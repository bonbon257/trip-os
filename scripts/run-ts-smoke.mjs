/** 用 esbuild 把 scripts/<name>.tsx 打成 node 可执行的 ESM，再直接运行 */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const entry = process.argv[2];
if (!entry) {
  console.error('用法: node scripts/run-ts-smoke.mjs <entry-name>（对应 scripts/<entry-name>.tsx）');
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(path.join(tmpdir(), 'tripos-'));
const out = path.join(dir, `${entry}.mjs`);

await build({
  entryPoints: [path.join(root, 'scripts', `${entry}.tsx`)],
  bundle: true,
  outfile: out,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  alias: { '@': path.join(root, 'src') },
  define: { 'process.env.NODE_ENV': '"test"' },
  logLevel: 'warning',
});

// zustand/persist 在 node 下没有 localStorage，给个最小实现
writeFileSync(
  path.join(dir, 'shim.mjs'),
  `const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
`,
);
await import(pathToFileURL(path.join(dir, 'shim.mjs')).href);
await import(pathToFileURL(out).href);
