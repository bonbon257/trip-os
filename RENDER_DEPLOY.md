# Trip OS 免费部署到 Render（无需绑卡）

## 为什么用 Render

Railway / Fly.io 现在都要求绑卡收费了。Render 的免费档**无需信用卡**，直接 GitHub 推送即部署，配置方式和我们这套 `npm run build` / `npm start` 完全契合——**代码零改动**。

免费档限制（2026）：
- Web Service **750 实例小时/月**（≈ 1 个服务 24/7 跑满）；15 分钟无请求会**休眠**，下次请求冷启动约 30–60s（个人/低频使用完全可接受）。
- 免费 **Postgres 约 30 天过期**。想要持久库，见下方「数据库」用 Neon。
- 构建 500 分钟/月、带宽 100GB/月，对个人项目够用。

> 因为 `npm start` 跑的是预打包好的 `dist-server/index.mjs`（esbuild 已把 TS 内联），**没有运行期编译**，冷启动比裸跑 TS 快很多。

---

## 一、环境变量

| 变量 | 来源 | 说明 |
|---|---|---|
| `NODE_ENV` | 固定 `production` | 开启静态托管 + 正式日志 |
| `DATABASE_URL` | 数据库自动注入 / 手动填 | Postgres 连接串 |
| `PORT` | 自动注入 | Render 注入，代码已读 `process.env.PORT` |
| `JWT_SECRET` | 自动生成 / 手填 | 登录签名密钥 |
| `AI_API_KEY` | 手动填 | 大模型 key（DeepSeek 等），只存后端 |
| `AI_BASE_URL` / `AI_MODEL` | 可选 | 默认 DeepSeek |
| `AMAP_WEB_KEY` 等 | 可选 | 高德地图 |

---

## 二、部署步骤（两种方式）

### 方式 1：Blueprint 一键（推荐）
1. Render 网页 **New → Blueprint**，连 GitHub 仓库，选 `render.yaml`。
2. 它会自动建 Web Service + 免费 Postgres，`DATABASE_URL` 自动连上。
3. `AI_API_KEY` 等标了 `sync: false` 的变量部署后到 Environment 里手动填。
4. 部署完成后首次建表：在 Render 的 Shell 里跑 `npx prisma db push`（或本地连上 Render 的 `DATABASE_URL` 跑）。
5. 打开 `https://trip-os.onrender.com`，`/api/health` 应返回 `ok`，设置页「测试模型连接」可用。

### 方式 2：网页手动
1. **New → Web Service** → 连仓库。
2. Build Command：`npm run build`；Start Command：`npm start`；Plan：Free。
3. 加数据库：
   - **(A) Render 免费 PG**：New → PostgreSQL → Free，把它连到 Web Service 的 `DATABASE_URL` 环境变量。
   - **(B) Neon 持久免费 PG（推荐，不过期）**：去 neon.tech 建免费项目，拿连接串，手动填进 Web Service 的 `DATABASE_URL`（删掉 `render.yaml` 里的 postgres 段即可避免重复建库）。
4. 填 `NODE_ENV=production`、`JWT_SECRET`、`AI_API_KEY` 等。
5. 同样 `npx prisma db push` 建表。

---

## 三、冷启动 / 休眠处理（可选）

免费 Web Service 休眠后首个请求会慢 30–60s。若想保持常驻，可用免费定时服务（如 cron-job.org）每 10 分钟 ping 一次 `/api/health`。注意这会把 750 小时额度基本用满——个人项目一般没必要，接受冷启动即可。

---

## 四、常见问题

- **`/api/health` 活但业务接口 500**：看 Render 日志，多半是 `DATABASE_URL` 没注入 / 没建表（`prisma db push`），或 `JWT_SECRET` 没设。
- **首页白屏但 `/api` 正常**：确认 `NODE_ENV=production` 已设（静态托管只在 production 启用）。
- **想彻底不休眠、不过期**：Render 付费 $7/月 起，或换 Oracle Cloud Always-Free（永久免费 VM，自行跑 Node+Postgres，需一点运维）。
- **Railway 那条路**：已放弃（现需绑卡收费）。`railway.json` 保留仅供参考。
