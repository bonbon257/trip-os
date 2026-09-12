/// <reference types="node" />
/**
 * 本地开发入口：装配 Fastify 并监听端口。
 * Vercel 不会执行本文件（函数入口是仓库根 api/[...path].ts）。
 */
import { createApp } from './app';
import { env } from './env';

const app = await createApp();

// 本地 / 独立部署（Railway 等）时监听端口。
// Vercel 不会执行本文件——它只加载 api/[...path].ts 函数入口。
try {
  await app.listen({ port: env.port, host: '0.0.0.0' });
  app.log.info(`trip-os-server listening on :${env.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}