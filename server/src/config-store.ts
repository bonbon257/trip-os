/**
 * 运行时配置存储
 * ────────────────────────────────────────────────────────────
 * 为什么要有这个：
 *   用户在设置页填 Key，希望「填完立刻生效」，而不是去改 server/.env 再重启。
 *   所以配置分三层：
 *     1) 启动时从 server/.env 读（默认基线）
 *     2) 运行时通过 POST /api/config 覆盖，会持久化到 server/.runtime-config.json
 *     3) 重启后自动读回 runtime-config.json，不需要重新填 key
 *
 * 安全：
 *   · 读取接口只返回「是否已配置」和掩码，绝不返回完整 Key
 *   · 写入接口开发期不鉴权（本地跑）；生产部署务必加 ADMIN_TOKEN 校验
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { z } from 'zod';

export const ConfigSchema = z.object({
  aiApiKey: z.string().max(300).optional(),
  aiBaseUrl: z.string().max(300).optional(),
  aiModel: z.string().max(120).optional(),
  aiProviderLabel: z.string().max(60).optional(),
  amapWebKey: z.string().max(300).optional(),
  // 新增：浏览器端 JS API key + 服务端 安全密钥
  amapJsKey: z.string().max(300).optional(),
  amapSecurityKey: z.string().max(300).optional(),
  jwtSecret: z.string().max(300).optional(),
});

export type RuntimeConfig = z.infer<typeof ConfigSchema>;

const RUNTIME_CONFIG_FILE = join(process.cwd(), 'server', '.runtime-config.json');

/** 把运行时配置落盘，这样刷新页面 / 重启服务后不用重填 */
function loadPersistedConfig(): RuntimeConfig {
  try {
    if (existsSync(RUNTIME_CONFIG_FILE)) {
      const raw = readFileSync(RUNTIME_CONFIG_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      const validated = ConfigSchema.safeParse(parsed);
      if (validated.success) return validated.data;
    }
  } catch {
    /* 文件损坏或不可读就空启动 */
  }
  return {};
}

function savePersistedConfig(cfg: RuntimeConfig): void {
  try {
    const dir = dirname(RUNTIME_CONFIG_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(RUNTIME_CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n');
  } catch {
    /* 持久化失败不影响运行时；生产环境建议用受控存储 */
  }
}

/** 内存中的运行时覆盖层（启动时从持久化文件预加载） */
const overrides: RuntimeConfig = { ...loadPersistedConfig() };

export function setRuntimeConfig(patch: RuntimeConfig): void {
  Object.assign(overrides, patch);
  savePersistedConfig(overrides);
}

export function getRuntimeConfig(): RuntimeConfig {
  return { ...overrides };
}

/** 掩码：只留前 3 位与后 2 位，中间打星 */
export function mask(secret: string | undefined): string | null {
  if (!secret) return null;
  if (secret.length <= 6) return '***';
  return `${secret.slice(0, 3)}***${secret.slice(-2)}`;
}

/** 从接口地址推断显示名（与前端 vite.config 保持一致） */
export function providerLabelFromUrl(raw: string | undefined): string {
  const baseUrl = (raw ?? '').replace(/\/$/, '');
  if (!baseUrl) return '';
  let host = baseUrl;
  try {
    host = new URL(baseUrl).host;
  } catch {
    /* 保留原始字符串 */
  }
  const table: [string, string][] = [
    ['api.deepseek.com', 'DeepSeek'],
    ['dashscope.aliyuncs.com', '通义千问'],
    ['open.bigmodel.cn', '智谱 GLM'],
    ['api.moonshot.cn', 'Kimi'],
    ['openrouter.ai', 'OpenRouter'],
    ['api.openai.com', 'OpenAI'],
    ['localhost', '本地模型'],
    ['127.0.0.1', '本地模型'],
  ];
  return table.find(([key]) => host.includes(key))?.[1] ?? host;
}

/**
 * 取最终生效值：运行时覆盖 > 环境变量
 * 注意：必须在每次读取时调用，这样设置页保存后立刻生效，不用重启
 *
 * 注意安全密钥策略：
 *   - amapJsKey: JS API key, 高德设计为浏览器使用, 但仍走服务端代理,
 *     让前端只看到 "已配置" 不知道具体内容, 未来上域名白名单更稳。
 *   - amapSecurityKey: 安全密钥, 高德官方建议在前端, 但更稳妥的做法是
 *     由服务端用 HMAC 签名产生临时 sub-token, 前端拿到的不是原 key。
 */
export function effectiveConfig() {
  const o = overrides;
  const aiBaseUrl = (o.aiBaseUrl ?? process.env.AI_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, '');
  const aiModel = o.aiModel ?? process.env.AI_MODEL ?? 'deepseek-chat';
  const aiApiKey = o.aiApiKey ?? process.env.AI_API_KEY ?? '';
  const amapWebKey = o.amapWebKey ?? process.env.AMAP_WEB_KEY ?? '';
  const amapJsKey = o.amapJsKey ?? process.env.AMAP_JS_KEY ?? '';
  const amapSecurityKey = o.amapSecurityKey ?? process.env.AMAP_SECURITY_KEY ?? '';

  return {
    ai: {
      apiKey: aiApiKey,
      baseUrl: aiBaseUrl,
      model: aiModel,
      providerLabel: o.aiProviderLabel ?? providerLabelFromUrl(aiBaseUrl),
      timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 20000,
    },
    amapWebKey,
    amapJsKey,
    amapSecurityKey,
    jwtSecret: o.jwtSecret ?? process.env.JWT_SECRET ?? 'dev-secret-please-change-in-production',
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}