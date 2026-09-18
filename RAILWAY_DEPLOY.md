# Trip OS 部署到 Railway / Render

> ⚠️ **2026 更新**：Railway / Fly.io 现在都需绑卡收费，已不是免费档。
> 想 $0 部署请看 **[RENDER_DEPLOY.md](./RENDER_DEPLOY.md)**（Render 免费、无需绑卡，代码零改动）。
> 本文仅作 Railway 付费路线的参考。

## 为什么走这条路

之前在 Vercel 上反复 `FUNCTION_INVOCATION_FAILED`，根因是 **Vercel 的函数打包器（@vercel/nft）不会把 `api/` 之外的本地 `server/src/*.ts` 打进部署产物**。这是个 serverless 平台的打包限制，跟业务代码无关。

Trip OS 是一个 **常驻 Fastify 服务 + Prisma(Postgres)** 的应用，天然更适合「跑一个真正的 Node 进程」的平台。Railway / Render 直接运行 `npm start`，**不需要任何打包 hack、不需要改前端代码**：

- 前端用相对 `/api/*` 调用，同源下由同一个 Fastify 进程托管 `dist/` 静态文件；
- 后端逻辑（`server/src/*`）原样运行，Prisma 连外部 Postgres；
- 启动命令就是 `node dist-server/index.mjs`（由 `npm run build` 用 esbuild 把 TS 打成自包含 `.mjs`，避免运行期找不到相对模块）。

> 数据层已经是 Postgres（`prisma/schema.prisma` 里 `provider = "postgresql"`，`binaryTargets` 也带了 `rhel-openssl-3.0.x`），所以持久化没问题。Vercel 那条路已放弃，相关 `api/*.ts` + `bundle-api.mjs` 暂留着但不参与本次部署。

---

## 一、环境变量（Railway 项目 Variables 里配）

| 变量 | 必填 | 说明 |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres 连接串。加 Railway 的 Postgres 插件后会**自动注入**，无需手填 |
| `NODE_ENV` | ✅ | 设为 `production`（开启静态托管 + 正式日志级别） |
| `PORT` | 自动 | Railway 自动注入，代码已读 `process.env.PORT` |
| `JWT_SECRET` | ✅ | 登录 JWT 签名密钥，自己生成一段随机串 |
| `AI_API_KEY` | ✅ | 大模型 key（DeepSeek / 通义等），只存后端 |
| `AI_BASE_URL` | 可选 | 默认 `https://api.deepseek.com` |
| `AI_MODEL` | 可选 | 默认 `deepseek-chat` |
| `AI_TIMEOUT_MS` | 可选 | 默认 `20000` |
| `AMAP_WEB_KEY` | 可选 | 高德 Web 服务 Key（地图/地理编码） |
| `AMAP_JS_KEY` | 可选 | 高德 JS API Key（前端底图） |
| `AMAP_SECURITY_KEY` | 可选 | 高德安全密钥 |
| `CORS_ORIGINS` | 可选 | 同源部署留空即可；跨域才填，逗号分隔 |

`server/.env` 里有完整的 key 名清单可对照（本地开发用，不提交）。

---

## 二、部署步骤

### 方式 A：Railway（推荐，最省事）

1. 安装 [Railway CLI](https://docs.railway.app/develop/cli) 或用网页。
2. 在项目里 `railway init`（关联 GitHub 仓库或空项目后 `railway link`）。
3. 加 Postgres 插件：项目里 **New → Database → Postgres**，`DATABASE_URL` 会自动注入到服务。
4. 设环境变量：在 Railway 网页 Variables 里加 `NODE_ENV=production`、`JWT_SECRET`、`AI_API_KEY` 等（见上表）。
5. 部署：`railway up`（CLI）或在网页连接 GitHub 仓库自动部署。
   - Build：`npm run build`（含 `prisma generate` + vite build + 打包 server）
   - Start：`npm start`
6. **首次建表**（一次性）：
   ```bash
   railway run npx prisma db push
   ```
   或本地连上 Railway 的 `DATABASE_URL` 执行 `npx prisma db push`。
7. 打开 Railway 给的域名，`/api/health` 应返回 `{ ok: true, ... }`，首页能加载，设置页「测试模型连接」可用。

### 方式 B：Render

1. 新建 **Web Service**，连 GitHub 仓库。
2. Build Command：`npm run build`；Start Command：`npm start`。
3. 加 **PostgreSQL** 实例，把 `DATABASE_URL` 接到 Web Service 的环境变量。
4. 环境变量加 `NODE_ENV=production`、`JWT_SECRET`、`AI_API_KEY` 等。
5. 首次建表：`npx prisma db push`（在 Render 的 Shell 里执行）。
6. 部署后验证同上。

---

## 三、健康检查

Railway `railway.json` 已配 `healthcheckPath: /api/health`。该接口**不连数据库**，纯返回进程/环境变量状态，适合做探针。

---

## 四、常见问题

- **`/api/health` 活但业务接口 500**：看部署日志，大概率是 `DATABASE_URL` 没注入或表没建（忘了 `prisma db push`），或 `JWT_SECRET` 没设。
- **首页白屏但 `/api` 正常**：确认构建产物 `dist/` 存在、`NODE_ENV=production` 已设（静态托管只在 production 启用）。
- **Prisma 报 engine 找不到**：确认 `binaryTargets` 含 `rhel-openssl-3.0.x`（已配），且部署平台的 install 阶段跑了 `postinstall` → `prisma generate`（Railway/Render 默认会跑）。
- **想回 Vercel**：需恢复 `api/*.mjs` 预打包方案并处理 serverless 冷启动 / 打包限制，不建议。
