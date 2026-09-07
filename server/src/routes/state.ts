/**
 * 用户与状态同步路由
 * ────────────────────────────────────────────────────────────
 *
 * 数据迁移策略：
 *   前端 store 现在把 window.DB 整体序列化为 JSON, 存到 localStorage。
 *   本次迁移把这块整体迁到后端:
 *     - GET  /api/state     拉取当前用户整份 DB (无则返回 null)
 *     - PUT  /api/state     覆盖 (debounce 自动写入)
 *     - POST /api/state/seed 把当前前端 seed 数据推上来初始化
 *
 * 鉴权简化（开发期）：
 *   - POST /api/auth/anon 创建一个匿名用户, 颁发 JWT, cookie 返回
 *     浏览器刷新自动匿名登录, 多个浏览器之间相互隔离。
 *   - 正式上线时把 cookie 换成 password/OAuth 流程。
 */
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { effectiveConfig } from '../config-store.js';
import { requireAuth } from './_auth.js';

const ANON_KEY = 'anon@trip-os.local';

export default async function stateRoutes(app: FastifyInstance) {
  // 创建一个匿名开发用户, 自动返回 token
  app.post('/auth/anon', async (req, reply) => {
    const cfg = effectiveConfig();
    const existing = await app.prisma.user.findUnique({ where: { email: ANON_KEY } });
    const user =
      existing ??
      (await app.prisma.user.create({
        data: {
          email: ANON_KEY,
          name: 'Anonymous Traveler',
          passwordHash: bcrypt.hashSync(`anon-${Math.random()}`, 8),
          homeCity: '上海',
        },
      }));
    const token = app.jwt.sign({ id: user.id, email: user.email });
    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    });
    return {
      ok: true,
      token,
      user: { id: user.id, name: user.name, homeCity: user.homeCity },
      jwtSecretHint: cfg.jwtSecret.slice(0, 3) + '***',
    };
  });

  // 注销 (清空 cookie)
  app.post('/auth/logout', async (_req, reply) => {
    reply.clearCookie('token', { path: '/' });
    return { ok: true };
  });

  // 拉取当前用户的状态
  app.get('/state', { preHandler: [requireAuth] }, async (req: any, reply) => {
    const row = await app.prisma.userState.findUnique({ where: { userId: req.user.id } });
    if (!row) {
      return { ok: true, exists: false, json: null };
    }
    return { ok: true, exists: true, json: row.json, updatedAt: row.updatedAt };
  });

  // 覆盖当前用户的状态 (debounced, 调用方负责节流)
  app.put<{ Body: { json?: string } }>(
    '/state',
    { preHandler: [requireAuth] },
    async (req: any, reply) => {
      const body = req.body ?? {};
      if (typeof body.json !== 'string' || body.json.length > 4_000_000) {
        return reply.code(400).send({ ok: false, error: 'json 字段缺失或过大' });
      }
      // 宽松校验: 序列化 JSON 必须是合法 JSON
      try {
        JSON.parse(body.json);
      } catch (e) {
        return reply.code(400).send({ ok: false, error: 'json 不是合法 JSON: ' + (e as Error).message });
      }

      const row = await app.prisma.userState.upsert({
        where: { userId: req.user.id },
        update: { json: body.json },
        create: { userId: req.user.id, json: body.json },
      });
      return { ok: true, bytes: row.json.length, updatedAt: row.updatedAt };
    },
  );

  // 快速健康检查
  app.get('/state/health', async () => ({ ok: true, ts: Date.now() }));
}
