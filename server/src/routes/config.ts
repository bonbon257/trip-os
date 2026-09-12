/// <reference types="node" />
/**
 * 配置管理路由
 * ────────────────────────────────────────────────────────────
 * GET  /api/config          查看当前配置（只返回掩码，不返回完整 Key）
 * POST /api/config          更新配置（立即生效，无需重启）
 * POST /api/config/test     测试连通性（真的发一个请求验证 Key 对不对）
 */
import type { FastifyInstance } from 'fastify';
import {
  ConfigSchema,
  effectiveConfig,
  getRuntimeConfig,
  mask,
  setRuntimeConfig,
} from '../config-store';

export default async function configRoutes(app: FastifyInstance) {
  /** 当前生效配置（脱敏） */
  app.get('/', async () => {
    const cfg = effectiveConfig();
    const overrides = getRuntimeConfig();
    return {
      ok: true,
      ai: {
        configured: !!cfg.ai.apiKey,
        provider: cfg.ai.providerLabel || null,
        model: cfg.ai.model,
        baseUrl: cfg.ai.baseUrl,
        apiKeyMasked: mask(cfg.ai.apiKey),
        source: overrides.aiApiKey ? 'runtime' : cfg.ai.apiKey ? 'env' : null,
      },
      amap: {
        configured: !!cfg.amapWebKey,
        keyMasked: mask(cfg.amapWebKey),
        source: overrides.amapWebKey ? 'runtime' : cfg.amapWebKey ? 'env' : null,
        jsKeyConfigured: !!cfg.amapJsKey,
      },
    };
  });

  /** 更新：填完立刻生效 */
  app.post('/', async (req, reply) => {
    const parsed = ConfigSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid config payload' });
    }
    // 只覆盖传了的字段，空字符串视为清空
    const patch = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    );
    await setRuntimeConfig(patch);

    const cfg = effectiveConfig();
    return {
      ok: true,
      message: '配置已更新并立即生效',
      ai: {
        configured: !!cfg.ai.apiKey,
        provider: cfg.ai.providerLabel || null,
        model: cfg.ai.model,
      },
      amap: { configured: !!cfg.amapWebKey },
    };
  });

  /**
   * 测试连通性
   * body: { service: 'ai' | 'amap' }
   * 真的发一个最小请求，验证 Key 是否有效
   */
  app.post<{ Body: { service?: string } }>('/test', async (req, reply) => {
    const service = req.body?.service ?? 'ai';
    const cfg = effectiveConfig();

    if (service === 'ai') {
      if (!cfg.ai.apiKey) return reply.code(400).send({ ok: false, error: 'AI Key 未配置' });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(`${cfg.ai.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cfg.ai.apiKey}`,
          },
          body: JSON.stringify({
            model: cfg.ai.model,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 5,
          }),
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          return {
            ok: false,
            error: data?.error?.message ?? `模型服务返回 ${res.status}`,
          };
        }
        return {
          ok: true,
          message: `连接成功 · ${cfg.ai.providerLabel || cfg.ai.baseUrl} · ${cfg.ai.model}`,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        return { ok: false, error: msg.includes('abort') ? '请求超时' : msg };
      }
    }

    if (service === 'amap') {
      if (!cfg.amapWebKey) return reply.code(400).send({ ok: false, error: '高德 Key 未配置' });
      const url = new URL('https://restapi.amap.com/v3/geocode/geo');
      url.searchParams.set('key', cfg.amapWebKey);
      url.searchParams.set('address', '北京市朝阳区');
      url.searchParams.set('output', 'JSON');
      try {
        const res = await fetch(url);
        const data = (await res.json()) as { status: string; info?: string };
        if (data.status !== '1') {
          return { ok: false, error: data.info ?? '高德返回错误' };
        }
        return { ok: true, message: '高德 Web 服务连接成功' };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
      }
    }

    return reply.code(400).send({ ok: false, error: 'unknown service' });
  });

  /** 服务商预设，前端下拉直接选 */
  app.get('/presets', async () => ({
    ok: true,
    presets: [
      { label: 'DeepSeek', providerLabel: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
      { label: '通义千问', providerLabel: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
      { label: '智谱 GLM', providerLabel: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
      { label: 'Kimi', providerLabel: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
      { label: 'OpenRouter', providerLabel: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-3.5-sonnet' },
      { label: 'OpenAI', providerLabel: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
      { label: '本地 Ollama', providerLabel: '本地模型', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b' },
    ],
  }));

  /**
   * GET /api/config/amap-subkey
   * ────────────────────────────────────────────────────────────
   * 让浏览器拿到「调用 JS API 必要的凭据」。
   *
   * 高德 JS API 2.0 要求在浏览器端同时提供 key + securityJsCode，
   * 才能正常加载地图（否则会出现「JS API key 未配置」类的降级提示）。
   * 这里让服务端从自己的存储里取出 securityJsCode 再下发，
   * 浏览器不会把它写死在前端代码/配置里。
   *
   * 浏览器端使用：
   *   AMapLoader.load({
   *     key: <JS API key>,           // 来自下方响应
   *     securityJsCode: <securityJsCode>,  // 来自下方响应
   *   });
   */
  app.get('/amap-subkey', async (_req, reply) => {
    const cfg = effectiveConfig();
    if (!cfg.amapJsKey) {
      return reply.code(503).send({
        ok: false,
        error: '高德 JS API Key 未配置（请到 设置 → 服务 填入）',
      });
    }

    const ts = Date.now();
    return {
      ok: true,
      key: cfg.amapJsKey,
      securityJsCode: cfg.amapSecurityKey || null,
      ts,
      hint: cfg.amapSecurityKey
        ? '已配置安全密钥'
        : '未配置安全密钥，JS API 仍可用但有水印 / 限速降级',
    };
  });
}