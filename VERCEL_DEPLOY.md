# Vercel 部署指南（完整版：后端也上 Vercel）

把前端 + 后端一次性部署到 Vercel，不再需要单独的 Railway/Render 后端服务。

## 架构

- **前端**：根 `dist/`（Vite 构建的静态站）
- **后端**：`api/[...path].ts` 是一个 Vercel 函数，内部包裹 Fastify，处理所有 `/api/*`
  - 冷启动装配一次（`createApp()`），之后复用（缓存到 `globalThis`）
  - 所有原有路由逻辑（auth / state / trips / ai / map / xhs / config）一行未改
- **数据库**：Neon（serverless Postgres），Prisma 连接
- **运行时 Key 存储**：Vercel KV（用户在设置页填的 Key 落这里，serverless 多实例共享）

## 你需要准备的外部资源（2 个）

1. **Neon 数据库**（免费层即可）：https://neon.tech
2. **Vercel KV**：在 Vercel 项目里一键创建

---

## 步骤

### 1. 建 Neon 数据库

1. 打开 https://neon.tech → 用 GitHub 登录 → New Project → Postgres 16
2. 建好后，在 Dashboard 复制 **Connection string**，选 **Pooled**（端口 `6543`）：
   ```
   postgresql://user:pass@ep-xxxx-pooler.region.aws.neon.tech/neondb?sslmode=require
   ```
3. 把表结构推上去（本地执行，用 Neon 的 URL）：
   ```bash
   DATABASE_URL="<上面那串>" npx prisma db push --schema prisma/schema.prisma
   ```
   看到 `Your database is now in sync` 即成功。

### 2. 建 Vercel KV

1. Vercel 项目 → **Storage** → **Create** → **KV**
2. 创建后点 **Connect** 绑到你的项目
3. 绑定后 Vercel 会自动注入 `KV_REST_API_URL` / `KV_REST_API_TOKEN`，无需手填

### 3. 配置环境变量

Vercel 项目 → **Settings → Environment Variables**，添加：

| 变量 | 值 | 说明 |
|---|---|---|
| `DATABASE_URL` | Neon 的 pooled URL | 第 1 步复制的那串 |
| `AI_API_KEY` | 你的 LLM Key | 如 DeepSeek `sk-...` |
| `AI_BASE_URL` | `https://api.deepseek.com` | 或通义/智谱/Kimi 等 |
| `AI_MODEL` | `deepseek-chat` | 对应模型名 |
| `AMAP_WEB_KEY` | 高德 Web 服务 Key | 地图用，可选 |
| `AMAP_JS_KEY` | 高德 JS API Key | 地图用，可选 |
| `AMAP_SECURITY_KEY` | 高德安全密钥 | 可选 |
| `JWT_SECRET` | `openssl rand -base64 32` | 用户系统签名，必填 |

> KV 的两个变量（KV_REST_API_URL / KV_REST_API_TOKEN）由绑定 KV 自动注入，不要手动加。

### 4. 部署

```bash
git add -A && git commit -m "feat: 后端改写为 Vercel 函数" && git push origin main
```

Vercel 自动：
1. `npm install`（安装根依赖，含 fastify/prisma/@vercel/kv）
2. `postinstall` → `prisma generate`（生成 client 到根 `node_modules`）
3. 构建前端 `dist/`
4. `api/[...path].ts` 作为函数就位

部署完成后，`/api/*` 全部由 Vercel 函数处理，设置页「测试模型连接」等功能即可正常使用。

---

## 本地开发

- 前端：`npm install && npm run dev`
- 后端（独立）：`cd server && npm install && npm run dev`（端口 8787，监听模式）
- 本地后端如需数据库：把 `.env` 的 `DATABASE_URL` 也填成 Neon 的 URL（或本地 Docker Postgres）
- 本地没绑 KV 时，`config-store` 自动回退到 `server/.runtime-config.json` 文件，功能不受影响

---

## 验证与排错

### 先访问独立健康检查

部署后先在浏览器打开：

```
https://<你的域名>/api/health
```

- 返回 JSON → Vercel 函数基础设施正常，继续排查 catch-all 里的依赖。
- 仍报 `FUNCTION_INVOCATION_FAILED` → 函数还没部署到新版本，或 Vercel 运行时/构建产物本身有问题，看 Function Logs。

### 环境变量 Key 名必须完全一致

常见错误：填了 `LLM_API_KEY` 但代码读的是 `AI_API_KEY`；填了 `VITE_NEON_AUTH_URL` 但代码读的是 `DATABASE_URL`。Key 名必须和下面「配置环境变量」表格里的**完全一致**。

### 排错表

| 现象 | 原因 / 解决 |
|---|---|
| 设置页「测试模型连接」报 `FUNCTION_INVOCATION_FAILED` | 先看 `/api/health`；若 health 通，再看 Function Logs 里的真实错误（现在会 JSON 化返回给浏览器） |
| 函数日志报 `Prisma Client not generated` | `postinstall` 没跑；确认根 `package.json` 的 `postinstall` 是 `prisma generate --schema prisma/schema.prisma` |
| `/api/*` 返回 404 | 确认 `api/[...path].ts` 在**仓库根** `api/` 目录（不是 `server/api`） |
| 设置页保存的 Key 不持久 / 测试时有时无 | 确认 KV 已绑定（环境变量里应有 `KV_REST_API_URL`） |
| 数据库连不上 | `DATABASE_URL` 用 Neon **pooled** 地址（`:6543`），且已 `prisma db push` 建表 |
| 函数超时 | AI/小红书调用较慢，已把函数 `maxDuration` 设为 30s；仍不够可在 `vercel.json` 调大（Hobby 上限 60s） |

## 关键文件

- `api/[...path].ts` —— Vercel 函数入口，转发到 Fastify
- `server/src/app.ts` —— Fastify 装配工厂（路由全在这里注册）
- `server/src/config-store.ts` —— 运行时配置，自动选 Vercel KV 或本地文件
- `prisma/schema.prisma` —— Postgres schema（已从 SQLite 迁移）
- `package.json` —— 后端依赖已合并到根，含 `postinstall` 钩子
