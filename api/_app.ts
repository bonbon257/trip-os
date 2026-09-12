/// <reference types="node" />
/**
 * Vercel 函数 bootstrap 中转文件
 * ────────────────────────────────────────────────────────────
 * 本文件只做一件事：把 server/src/app 的 createApp 暴露给 api/[...path].ts。
 * 为什么需要这个中转？
 *   1. api/[...path].ts 用动态 import('./_app') 加载，错误能被 handler 的 try/catch 兜住。
 *   2. Vercel 打包器会把同目录下的 _app.ts 及其依赖一起打进函数包，运行期路径可解析。
 */
export { createApp } from '../server/src/app';
