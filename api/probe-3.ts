/// <reference types="node" />
/** 阶段 3：@prisma/client 真实加载（模块求值 + 实例化）。黑话化则凶手是 prisma */
import { PrismaClient } from '@prisma/client';

export default async function handler(_req: unknown, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (c: string) => void }) {
  try {
    const prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    await prisma.$disconnect();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, stage: 'p3-prisma', dbQuery: 'ok', time: Date.now() }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, stage: 'p3-prisma', error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack?.slice(0, 600) : undefined }));
  }
}
