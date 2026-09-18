# Trip OS 部署到 Vercel（免费 Hobby 档）

> 状态：代码已修好并推到 `main`（commit `f2c7669`）。Vercel 免费档可用。

## 为什么这次能跑通（根因已修复）

之前 `FUNCTION_INVOCATION_FAILED` 的唯一原因是：**Vercel 的打包器（@vercel/nft）不会把 `api/` 目录之外的本地 `server/src/*.ts` 打进函数包**，运行期 `require` 找不到文件就崩。

修复做法：
- `api/` 下的函数入口改为 **esbuild 预先打包的自包含 `.mjs`**（`scripts/bundle-api.mjs` 从 `api-src/*.ts` 打包，本地代码内联、只有 `node_modules` 留外部），并已**入库**（Vercel 在 build 之前就校验 `functions` glob，那时 `.mjs` 必须已存在）。
- `vercel.json` 的 `functions` glob 指向 `api/**/*.mjs`，并 `includeFiles` 覆盖 Prisma 引擎（`node_modules/.prisma/**`、`node_modules/@prisma/**`）。
- `package.json` 的 `postinstall` 跑 `prisma generate`，保证无论 Vercel 用哪个 build 命令，Prisma Client 都会生成。

数据层是 **Postgres**（`prisma/schema.prisma` 的 `provider = "postgresql"`），接外部数据库即可持久化，不存在 Vercel 只读文件系统写不了 SQLite 的问题。

## 第一步：在 Vercel 导入仓库

1. Vercel Dashboard → **Add New → Project** → 选 GitHub 仓库 `bonbon257/trip-os`。
2. 框架预设会自动识别为 **Vite**，但请手动确认/填入以下两项（关键）：

| 设置项 | 值 | 说明 |
|---|---|---|
| **Build Command** | `npm run build` | 必须显式设。默认 Vite 预设会用 `vite build`，跳过 `prisma generate`/打包；本项覆盖它。（即便不覆盖，`postinstall` 也会兜底 `prisma generate`，但设为 `npm run build` 最完整） |
| **Output Directory** | `dist` | 前端静态资源输出目录 |
| **Install Command** | `npm install` | 默认即可（会触发 postinstall 跑 prisma generate） |
| **Node.js Version** | `22.x` | 项目 `engines.node` 已锁，建议一致 |

3. 点 **Deploy**（先不急填环境变量也能部署，但接口会 500，见下一步）。

## 第二步：配置环境变量

Vercel Dashboard → 项目 → **Settings → Environment Variables**，逐个添加（Production 勾选）：

| 变量名 | 必填 | 说明 / 取值 |
|---|---|---|
| `DATABASE_URL` | ✅ | 外部 Postgres 连接串。**推荐 Neon 免费库**：去 [neon.tech](https://neon.tech) 建库，复制 `postgresql://...` 连接串填这里（Pooled 或非 Pooled 均可）。**Vercel 不能写本地文件，必须走外部库** |
| `AI_API_KEY` | ✅ | 模型服务 key（如 deepseek：`sk-...`） |
| `AI_BASE_URL` | 可选 | 模型 API base，默认 `https://api.deepseek.com/v1`（看 `server/src/env.ts` 默认值） |
| `AI_MODEL` | 可选 | 模型名，默认看 `env.ts` |
| `JWT_SECRET` | ✅ | 任意长随机串，用于登录 token 签名。可点 "Generate" 或用 `openssl rand -hex 32` |
| `NODE_ENV` | ✅ | 填 `production`（触发静态托管 + 正式配置） |
| `AMAP_WEB_KEY` | 可选 | 高德地图 Web 端 key（地图功能需要） |
| `CORS_ORIGINS` | 可选 | 跨域白名单，同源部署可留空 |

> 填完变量后，回 **Deployments** 对最新部署点 **Redeploy**（勾 "Redeploy with existing Build Cache" 即可）。

## 第三步：首次建表（prisma db push）

Vercel 没有交互式 shell 直接改库，在**本地**连上 `DATABASE_URL` 建表（只需一次）：

```bash
# 本地终端，确保 .env 里有和 Vercel 相同的 DATABASE_URL
cd trip-os
npx prisma db push
```

（可选）之后若改 schema，用 `npx prisma db push` 同步即可（项目无 migrations 目录，用 push 模式）。

## 第四步：验证

部署完成后访问：

```
https://<你的域名>/api/health
```

应返回类似：
```json
{ "ok": true, "service": "trip-os-server", "env": {"databaseUrl": true, "jwtSecret": true, "aiApiKey": true, "amapKey": false}, "kvBound": false }
```

- 打开网站根路径 `https://<你的域名>/` → 看到前端页面（`dist/` 静态托管 + SPA fallback）。
- 设置页「测试模型连接」：后端 `/api/*` 通了即可用（依赖 `AI_API_KEY` 等已配）。

## 常见问题

- **还是 `FUNCTION_INVOCATION_FAILED`**：看 Vercel 的 **Function Logs**（不是 Build Logs）。多半是 `DATABASE_URL` 没填/连不上，或 `NODE_ENV` 没设 `production`。
- **`/api/health` 返回 500 但 health 不依赖 DB**：检查 `JWT_SECRET` / `AI_API_KEY` 是否缺失（health 会回显 env 状态，看 JSON 里哪个 `false`）。
- **前端白屏 / 资源 404**：确认 Output Directory 是 `dist`，且 `rewrites` 已把非 `/api` 路由转到 `index.html`（见 `vercel.json`）。
- **冷启动慢**：Hobby 档函数可能偶发冷启动，但超时已设为 60s，AI 生成接口够用。

## 与 Render / Railway 的关系

- `scripts/bundle-server.mjs` + `dist-server/index.mjs`（Railway/Render 常驻 Node 用）仍保留，`npm run build` 会一并产出，互不影响。
- `render.yaml` / `RAILWAY_DEPLOY.md` 也保留，若要换免费 Render，照 `RENDER_DEPLOY.md` 即可。
