import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import { PrismaClient } from '@prisma/client';
import { env } from './env.js';
import aiRoutes from './routes/ai.js';
import mapRoutes from './routes/map.js';
import authRoutes from './routes/auth.js';
import tripRoutes from './routes/trips.js';
import stateRoutes from './routes/state.js';
import healthRoutes from './routes/health.js';
import configRoutes from './routes/config.js';
import xhsRoutes from './routes/xhs.js';

const prisma = new PrismaClient();

const app = Fastify({
  logger: { level: env.nodeEnv === 'production' ? 'info' : 'debug' },
});

await app.register(cors, {
  origin: (origin, cb) => {
    // 同源请求允许任何 origin, 否则按 env.corsOrigins 白名单
    if (!origin || env.corsOrigins.includes(origin)) {
      cb(null, true);
      return;
    }
    cb(null, false);
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
});

await app.register(cookie);
await app.register(jwt, { secret: env.jwtSecret });

app.decorate('prisma', prisma);
app.addHook('onClose', async () => {
  await prisma.$disconnect();
});

await app.register(healthRoutes, { prefix: '/api' });
await app.register(configRoutes, { prefix: '/api/config' });
await app.register(aiRoutes, { prefix: '/api/ai' });
await app.register(mapRoutes, { prefix: '/api/map' });
await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(tripRoutes, { prefix: '/api/trips' });
await app.register(stateRoutes, { prefix: '/api' });
await app.register(xhsRoutes, { prefix: '/api/xhs' });

app.setErrorHandler((err, _req, reply) => {
  app.log.error(err);
  const status = (err as { statusCode?: number }).statusCode ?? 500;
  reply.status(status).send({
    ok: false,
    error: err.message,
  });
});

try {
  await app.listen({ port: env.port, host: '0.0.0.0' });
  app.log.info(`trip-os-server listening on :${env.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}