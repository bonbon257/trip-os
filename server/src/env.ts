/// <reference types="node" />
/** 环境变量集中管理，缺 key 时给出明确提示而不是静默失败 */
function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`缺少环境变量 ${name}（请检查 server/.env）`);
  return v;
}

export const env = {
  port: Number(process.env.PORT) || 8787,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-please-change-in-production',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /** 数据库；不为空时也会校验 */
  databaseUrl: process.env.DATABASE_URL ?? 'file:./prisma/dev.db',

  /** 高德地图：地理编码、路径规划。后端存的是「Web 服务」Key */
  amapWebKey: process.env.AMAP_WEB_KEY ?? '',

  /** LLM：所有 key 都在这里，绝不进前端 bundle */
  ai: {
    apiKey: process.env.AI_API_KEY ?? '',
    baseUrl: (process.env.AI_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, ''),
    model: process.env.AI_MODEL ?? 'deepseek-chat',
    providerLabel: providerLabelFromUrl(process.env.AI_BASE_URL),
    timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 20000,
  },

  need,
};

/** 从 baseUrl 推断显示名，与前端 vite.config 保持一致 */
function providerLabelFromUrl(raw: string | undefined): string {
  const baseUrl = (raw ?? '').replace(/\/$/, '');
  if (!baseUrl) return '';
  let host = baseUrl;
  try {
    host = new URL(baseUrl).host;
  } catch {
    /* fall through */
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