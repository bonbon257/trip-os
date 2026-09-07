/**
 * 冒烟测试：在 jsdom 里把每个核心路由渲染一遍，捕获运行时异常与空页面。
 * 用法：node scripts/smoke.mjs
 */
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ROUTES = [
  '/',
  '/quiz',
  '/quiz/result',
  '/destinations',
  '/destinations/hangzhou',
  '/destinations/cn-450600',
  '/destinations/cn-650100',
  '/trips/new',
  '/random',
  '/trips/trip-tokyo',
  '/trips/trip-tokyo/itinerary',
  '/trips/trip-tokyo/map',
  '/trips/trip-tokyo/plan',
  '/trips/trip-tokyo/budget',
  '/trips/trip-tokyo/checklist',
  '/trips/trip-tokyo/bookings',
  '/trips/trip-tokyo/files',
  '/trips/trip-tokyo/members',
  '/trips/trip-tokyo/assistant',
  '/trips/trip-tokyo/today',
  '/trips/trip-tokyo/journey',
  '/trips/trip-hangzhou',
  '/trips/trip-hangzhou/itinerary',
  '/trips/trip-chengdu/journey',
  '/more',
  '/settings',
];

const entry = path.join(root, 'scripts', 'smoke-entry.tsx');

const bundled = await build({
  entryPoints: [entry],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'TripOSSmoke',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  alias: { '@': path.join(root, 'src') },
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'silent',
});
const code = bundled.outputFiles[0].text;

const results = [];
for (const route of ROUTES) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: `http://localhost${route}`,
    pretendToBeVisual: true,
    runScripts: 'dangerously',
  });
  const errors = [];
  dom.window.addEventListener('error', (e) => errors.push(String(e.error || e.message)));
  const origError = dom.window.console.error;
  dom.window.console.error = (...args) => {
    const msg = args.map(String).join(' ');
    if (!msg.includes('not wrapped in act')) errors.push(msg);
    origError.apply(dom.window.console, args);
  };

  try {
    const script = dom.window.document.createElement('script');
    script.textContent = code;
    dom.window.document.body.appendChild(script);
    if (!dom.window.TripOSSmoke) throw new Error('bundle did not expose TripOSSmoke');
    dom.window.TripOSSmoke.render(route);
    await new Promise((r) => setTimeout(r, 60));
    const text = dom.window.document.getElementById('root').textContent ?? '';
    results.push({ route, ok: text.trim().length > 0, len: text.trim().length, errors });
  } catch (e) {
    results.push({ route, ok: false, len: 0, errors: [String(e && e.stack ? e.stack : e)] });
  } finally {
    dom.window.close();
  }
}

let failed = 0;
for (const r of results) {
  const status = r.ok && r.errors.length === 0 ? 'PASS' : 'FAIL';
  if (status === 'FAIL') failed += 1;
  console.log(`${status}  ${r.route.padEnd(34)} chars=${String(r.len).padStart(5)}`);
  r.errors.slice(0, 2).forEach((e) => console.log(`      ↳ ${e.split('\n')[0].slice(0, 220)}`));
}
console.log(`\n${results.length - failed}/${results.length} routes ok`);
process.exit(failed ? 1 : 0);
