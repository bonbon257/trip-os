/**
 * Auth 路由（JWT）
 * ────────────────────────────────────────────────────────────
 * /api/auth/register  注册（email + 密码 + 名字）
 * /api/auth/login     登录，返回 JWT
 * /api/auth/me       获取当前用户（需要 Authorization: Bearer xxx）
 *
 * 密码用 bcrypt。后续接微信小程序时加 /api/auth/wx-login 走 wx.login 换 JWT。
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireAuth } from './_auth';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

const BCRYPT_COST = 10;

const RegisterBody = z.object({
  email: z.string().email().max(120),
  password: z.string().min(8).max(120),
  name: z.string().min(1).max(40),
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export default async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (req, reply) => {
    const parsed = RegisterBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid payload' });
    const { email, password, name } = parsed.data;

    const existing = await app.prisma.user.findUnique({ where: { email } });
    if (existing) return reply.code(409).send({ ok: false, error: 'email already registered' });

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const user = await app.prisma.user.create({
      data: { email, passwordHash, name },
      select: { id: true, email: true, name: true, homeCity: true },
    });
    const token = await reply.jwtSign({ id: user.id, email: user.email });
    return { ok: true, token, user };
  });

  app.post('/login', async (req, reply) => {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid payload' });
    const { email, password } = parsed.data;

    const user = await app.prisma.user.findUnique({ where: { email } });
    if (!user) return reply.code(401).send({ ok: false, error: 'invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return reply.code(401).send({ ok: false, error: 'invalid credentials' });

    const token = await reply.jwtSign({ id: user.id, email: user.email });
    return {
      ok: true,
      token,
      user: { id: user.id, email: user.email, name: user.name, homeCity: user.homeCity },
    };
  });

  app.get('/me', { preHandler: [requireAuth] }, async (req: FastifyRequest) => {
    const user = await app.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, homeCity: true, createdAt: true },
    });
    return { ok: true, user };
  });
}