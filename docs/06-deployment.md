# Trip OS 部署

> 后端是 Fastify + Prisma + SQLite，前端是 Vite SPA。所有第三方密钥都在后端环境变量里。

## 三层架构

```
浏览器 (5173)                              手机 App / 小程序
   │                                              │
   └───── /api/* ────→ 你的后端 (8787) ────────────┘
                           │
                     ┌─────┴─────┐
                     ▼           ▼
                  数据库      第三方
                 SQLite /     高德
                 Postgres     DeepSeek
```

## 一、本地启动（开发期）

```bash
cd /Users/edy/WorkBuddy/2026-09-02-13-21-08/trip-os

# 一次性：装前端 + 后端依赖
./scripts/dev.sh install

# 一次性：后端 .env（复制后填 AI key 和高德 key）
cp server/.env.example server/.env
# 编辑 server/.env，至少填 AI_API_KEY 和 AMAP_WEB_KEY

# 启动两个服务（前端 5173 + 后端 8787，守护进程化、崩溃自动重启）
./scripts/dev.sh start

# 状态 / 停止 / 重启
./scripts/dev.sh status
./scripts/dev.sh stop
./scripts/dev.sh restart
./scripts/dev.sh log          # 两边日志
./scripts/dev.sh log backend  # 只看后端
```

数据库 schema 改完后：
```bash
./scripts/dev.sh db:push
```

**前端 `.env.local` 已经过时**，不用再填。所有 key 都在 `server/.env` 里。

## 二、阿里云 ECS（推荐）

适合：你想完全控制部署、之后要迁 Postgres、流量不大

```bash
# 1. 机器：2 vCPU / 2 GB 起，Ubuntu 22.04
# 2. 安装 Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 3. 上传项目
scp -r trip-os user@server:/opt/

# 4. 装依赖、初始化数据库
cd /opt/trip-os && npm install && cd server && npm install
cp .env.example .env && vim .env   # 填真实 key
npx prisma db push

# 5. 装进程守护
sudo npm i -g pm2
pm2 start /opt/trip-os/server/dist/index.js --name tripos-server
pm2 startup && pm2 save

# 6. 反向代理 + HTTPS（nginx 或 caddy）
# 例：caddy
#   api.tripo.example.com {
#     reverse_proxy localhost:8787
#   }
#   www.tripo.example.com {
#     root /opt/tripos/dist
#   }

# 7. 前端构建
cd /opt/tripos && npm run build
# 把 dist/ 用任何静态托管（caddy / nginx / OSS）
```

## 三、Vercel + Render（最快）

适合：个人项目、想最低运维

- 前端：Vercel / Netlify 直接连仓库，构建命令 `npm run build`，输出 `dist/`
- 后端：Render / Railway / Fly.io 部署 `server/` 子项目；环境变量设到控制台；用 SQLite 文件持久化的话**需要 mounted volume**（不然每次重启数据没了）；或者直接连 Postgres（免费档 Render 提供）

## 四、数据库迁移

启动时用 SQLite，文件在 `server/prisma/dev.db`。

迁 Postgres（推荐在用户量超过 ~1000 行时）：

1. 阿里云 RDS / Supabase / Neon 开一个 Postgres
2. 改 `server/prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
3. `server/.env` 改 `DATABASE_URL=postgresql://user:pass@host:5432/tripos?schema=public`
4. `npx prisma migrate deploy` 或 `prisma db push`（生产用 migrate deploy 更稳）
5. 应用代码**零修改** —— Prisma client API 跨数据库一致

## 五、安全清单

- [ ] `JWT_SECRET` 用 `openssl rand -base64 32` 生成
- [ ] `AMAP_WEB_KEY` 在高德控制台绑服务端出口 IP（IP 白名单）
- [ ] `AI_API_KEY` 放在后端环境变量里，**绝不**用 `VITE_` 前缀
- [ ] 数据库文件加 `.gitignore`（已加）
- [ ] HTTPS 终止交给 caddy / nginx / 云负载均衡
- [ ] CORS 把生产域名加到 `CORS_ORIGINS`，不用通配
- [ ] `/api/auth/login` 限流（防止撞密码），未来加

## 六、现在的进展

| 模块 | 状态 |
|---|---|
| 后端 Fastify 入口 + 路由 | ✅ |
| AI 代理（前端 → 后端 → DeepSeek 等） | ✅ |
| 高德地理编码 / 路径规划代理 | ✅ |
| JWT 用户认证 | ✅（基础注册/登录/Me） |
| Prisma schema + SQLite | ✅ |
| /api/trips 列表 / 详情 / 创建 / 删除 | ✅（骨架） |
| **前端数据层迁到后端** | ⏳ **下次会话** |
| 高德真地图前端组件 + 坐标补齐 | ⏳ |
| iOS SwiftUI + 高德 SDK | ⏳ |
| 微信小程序 + 高德小程序 SDK | ⏳ |

## 七、下次会话做什么

**Phase 1.5：前端数据层迁移**

- `useStore` 的 `createTrip/updateTrip/createActivity/...` 改成调用后端 API（带 JWT）
- 保留 localStorage 当离线缓存（IndexedDB 更稳，但 localStorage 先够用）
- `useTripContext` 改成异步加载，从后端拿数据
- Login / Logout UI 接入
- 评价 + 行程数据从 localStorage 迁到云端

**Phase 2：高德真实地图**

- 给每个 `Place` 补真实 `lat` / `lng`（用后端 `/api/map/geocode` 批量跑）
- `MockMap` 组件换成高德 JS API（需要前端加载高德 SDK，Key 在前端 `.env`）

**Phase 3：iOS + 小程序**

- iOS：SwiftUI + 高德 iOS SDK，调同一个后端
- 小程序：原生或 uni-app，用高德 wx SDK
- 后端 /api/auth/wx-login：拿 wx.code 换 JWT