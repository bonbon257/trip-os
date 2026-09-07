/**
 * Trips 路由（受 JWT 保护）
 * ────────────────────────────────────────────────────────────
 * 这是数据层迁到后端的开始阶段。前端 store 现在还在用 localStorage，
 * 所以这些路由只用来验证后端能跑 + Prisma schema 没问题。
 *
 * 下一步会把 store 的 mutations 接到这里：
 *   createTrip → POST /api/trips
 *   updateDay  → PATCH /api/trips/:id/days/:dayId
 *   ...
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireAuth } from './_auth.js';
import { z } from 'zod';

const NewTrip = z.object({
  destinationId: z.string(),
  destinationName: z.string(),
  emoji: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  totalBudget: z.number().int().nonnegative(),
  planningMode: z.enum(['planner', 'delegator', 'auto']),
  members: z
    .array(z.object({ name: z.string(), avatar: z.string(), role: z.enum(['owner', 'member']) }))
    .optional(),
  title: z.string().optional(),
  profile: z.record(z.unknown()),
});

export default async function tripsRoutes(app: FastifyInstance) {
  //  列出当前用户的所有旅行
  app.get('/', { preHandler: [requireAuth] }, async (req: FastifyRequest) => {
    const trips = await app.prisma.trip.findMany({
      where: { ownerId: req.user.id },
      orderBy: [{ status: 'asc' }, { startDate: 'asc' }],
    });
    return { ok: true, trips };
  });

  //  单个旅行详情（带 days + activities + expenses + bookings + checklists + journals + files）
  app.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const trip = await app.prisma.trip.findFirst({
        where: { id: req.params.id, ownerId: req.user.id },
        include: {
          members: true,
          days: { include: { activities: { orderBy: { order: 'asc' } } }, orderBy: { index: 'asc' } },
          expenses: true,
          bookings: true,
          checklists: { include: { items: true } },
          journals: true,
          files: true,
        },
      });
      if (!trip) return reply.code(404).send({ ok: false, error: 'not found' });
      return { ok: true, trip };
    },
  );

  //  创建
  app.post('/', { preHandler: [requireAuth] }, async (req: FastifyRequest, reply) => {
    const parsed = NewTrip.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid payload' });

    const start = new Date(parsed.data.startDate);
    const end = new Date(parsed.data.endDate);
    const days: Array<{ date: string; index: number; title: string }> = [];
    for (let d = new Date(start), i = 1; d <= end; d.setDate(d.getDate() + 1), i++) {
      days.push({
        date: d.toISOString().slice(0, 10),
        index: i,
        title: i === 1 ? '抵达' : i === Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1 ? '回程' : `第 ${i} 天`,
      });
    }

    const trip = await app.prisma.trip.create({
      data: {
        ownerId: req.user.id,
        title: parsed.data.title ?? `${parsed.data.destinationName} ${new Date().getFullYear()}`,
        destinationId: parsed.data.destinationId,
        destinationName: parsed.data.destinationName,
        emoji: parsed.data.emoji,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        status: 'planning',
        planningMode: parsed.data.planningMode,
        totalBudget: parsed.data.totalBudget,
        profileJson: JSON.stringify(parsed.data.profile),
        members: parsed.data.members
          ? { create: parsed.data.members.map((m) => ({ name: m.name, avatar: m.avatar, role: m.role })) }
          : { create: [{ name: '我', avatar: '🦊', role: 'owner' }] },
        days: { create: days },
      },
      include: { days: true, members: true },
    });
    return reply.code(201).send({ ok: true, trip });
  });

  //  删除
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      await app.prisma.trip.deleteMany({ where: { id: req.params.id, ownerId: req.user.id } });
      return { ok: true };
    },
  );
}