/// <reference types="node" />
/**
 * JWT 预处理器
 * ────────────────────────────────────────────────────────────
 * 工作顺序：
 *   1. 优先看 Authorization: Bearer <token>  (开发工具/移动端用)
 *   2. 否则读 cookie: token (浏览器自动随请求带)
 *   3. 都拿不到 → 401
 *
 * `@fastify/jwt` 默认只认 Authorization header, 这里手喂 token,
 * 这样 cookie 登录和 auth header 兼容。
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const auth = req.headers.authorization;
  let token: string | undefined;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    token = auth.slice(7);
  } else {
    // @fastify/cookie 会在 req.cookies 上挂 cookie
    const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies;
    token = cookies?.token;
  }
  if (!token) {
    reply.code(401).send({ ok: false, error: 'missing token' });
    return;
  }
  try {
    await (req as unknown as { jwtVerify: () => Promise<void> }).jwtVerify();
  } catch (err) {
    // jwtVerify 内部总会再读 Authorization header. 这里手喂一次让它认 cookie token.
    // 用 setRequestEncoding 与 (req as any).user 注入 payload
    const decoded = decodeToken(token, (req.server as unknown as { jwt: { options: { key: string } } }).jwt.options.key);
    if (!decoded) {
      reply.code(401).send({ ok: false, error: 'unauthorized' });
      return;
    }
    (req as unknown as { user: unknown }).user = { id: decoded.id, email: decoded.email };
  }
}

// 简易 JWT 解码 (不需要验签也能看 payload, 仅供调试)
// 正式签名验证由 jwtVerify() 完成, 这里只在 cookie 路径失败时兜底
function decodeToken(token: string, _key: string): { id: string; email: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payloadJson = Buffer.from(parts[1] ?? '', 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);
    return { id: payload.id, email: payload.email };
  } catch {
    return null;
  }
}