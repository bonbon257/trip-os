/**
 * Trip OS Service Worker
 *
 * 策略（刻意简单，不引入 workbox 依赖）：
 *   · 导航请求（点链接 / 刷新）→ 网络优先，失败回落缓存的 app shell（index.html）
 *     这样离线时打开已访问过的路由不会白屏（SPA 全靠 index.html 渲染）
 *   · 静态资源（JS / CSS / 图片 / manifest）→ 缓存优先，后台补更新
 *   · /api/*  一律走网络，不缓存（业务数据必须是最新的）
 *   · spin-pool.json 数据量大，用「缓存优先 + 后台更新」，避免每次转盘都拉 1MB
 *
 * 注意：Vite 构建后的资源带 hash 文件名，缓存优先不会拿到旧版本。
 */
const CACHE = 'tripos-v1';
const SHELL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([SHELL, '/manifest.webmanifest']))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 跨域（高德等）不拦

  // 业务数据：永远走网络
  if (url.pathname.startsWith('/api/')) return;

  // 导航：网络优先，离线回落 app shell
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(SHELL, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(SHELL).then((hit) => hit || caches.match('/') || new Response('离线中', { status: 503 })),
        ),
    );
    return;
  }

  // 静态资源：缓存优先（Vite 文件名带 hash，不会拿到旧版）+ 后台更新
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    }),
  );
});
