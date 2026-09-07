import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * 前端 Vite 配置（v2）
 * ────────────────────────────────────────────────────────────
 * AI 代理已经从 Vite 中间件迁到了真正的后端（server/）。
 * 这里只负责一件事：开发期把所有 /api/* 转发到后端（localhost:8787），
 * 让浏览器看到的 /api/ai/*、/api/map/*、/api/auth/* 都直达后端。
 *
 * 生产部署时，把 /api/* 反向代理到你的后端域名即可（nginx / caddy / 云函数路由都行），
 * 前端代码完全不用改。
 */

export default defineConfig(({ mode }) => {
  loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:8787',
          changeOrigin: false,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          // 国内城市库有近 400 条，单独成包：主 bundle 保持小、城市数据可长期缓存
          manualChunks(id) {
            if (id.includes('cities-cn')) return 'cities-cn';
            if (id.includes('node_modules')) return 'vendor';
            return undefined;
          },
        },
      },
      chunkSizeWarningLimit: 700,
    },
  };
});