import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from '@/app/App';
import '@/styles/index.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

/**
 * PWA：注册 Service Worker。
 *
 * 只在生产构建下注册 —— 开发时 Vite 走未打包的 ES module + HMR，
 * SW 的缓存优先会把旧模块喂回去，导致改了代码不生效，排查成本很高。
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* 注册失败不影响主流程（比如 file:// 打开） */
    });
  });
}
