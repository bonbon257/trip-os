/**
 * LLM Service（唯一对外出口）
 * ────────────────────────────────────────────────────────────
 * 设计原则：
 *   1. 这是「预留的口子」，不是依赖：不配置任何 key，产品照常可用
 *   2. 只在用户明确要求时调用 —— 由调用方传入 useLLM 决定，本模块不主动发请求
 *   3. 浏览器只访问本地 /api/ai，拿不到 API key（key 在 Node 侧 .env.local）
 *   4. 任何失败（未配置 / 超时 / 上游报错 / JSON 解析失败）一律返回 null，
 *      由调用方回退到本地规则引擎 —— AI 挂了产品不能挂
 *   5. 只做两件事：意图识别、文案解释。永不生成 Activity / 地点 / 预算数字
 *
 * 换模型不需要改这里：修改 .env.local 的 AI_BASE_URL / AI_MODEL 即可，
 * 任何 OpenAI 兼容服务（DeepSeek / 通义 / 智谱 / Kimi / Ollama / OpenAI…）都能接。
 */

const BASE = '/api/ai';
const DEFAULT_TIMEOUT = 20_000;

export interface LLMStatus {
  enabled: boolean;
  provider: string | null;
  model: string | null;
  baseUrl: string | null;
  reason: string | null;
}

let cached: { at: number; value: LLMStatus } | null = null;
const CACHE_TTL = 60_000;

export async function llmStatus(force = false): Promise<LLMStatus> {
  if (!force && cached && Date.now() - cached.at < CACHE_TTL) return cached.value;
  const fallback: LLMStatus = {
    enabled: false,
    provider: null,
    model: null,
    baseUrl: null,
    reason: '未接入模型，当前完全使用本地引擎',
  };
  try {
    const res = await fetch(`${BASE}/status`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return fallback;
    const data = (await res.json()) as Partial<LLMStatus>;
    const value: LLMStatus = {
      enabled: !!data.enabled,
      provider: data.provider ?? null,
      model: data.model ?? null,
      baseUrl: data.baseUrl ?? null,
      reason: data.reason ?? null,
    };
    cached = { at: Date.now(), value };
    return value;
  } catch {
    return fallback;
  }
}

export async function isLLMEnabled(): Promise<boolean> {
  return (await llmStatus()).enabled;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** 要求模型返回严格 JSON（DeepSeek 支持 response_format） */
  json?: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 返回模型原文；失败返回 null */
export async function llmChat(
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT);
  try {
    const res = await fetch(`${BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 900,
        json: !!opts.json,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; content?: string };
    return data.ok && typeof data.content === 'string' ? data.content : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 返回解析后的 JSON；任何环节失败返回 null */
export async function llmJSON<T>(
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<T | null> {
  const raw = await llmChat(messages, { ...opts, json: true, temperature: opts.temperature ?? 0.1 });
  if (!raw) return null;
  // 模型偶尔会在 JSON 外层包 ```json 代码块
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

export interface PlanSpec {
  title: string;
  placeId?: string | null;
  startTime: string;
  durationMin: number;
  type: string;
  estimatedCost: number;
  note?: string;
}

export interface PlanDay {
  dayId: string;
  title: string;
  intensity: string;
  specs: PlanSpec[];
}

export interface GeneratePlanInput {
  tripId: string;
  destinationName: string;
  days: Array<{ id: string; index: number; date: string; title: string }>;
  places: Array<{
    id: string;
    name: string;
    category: string;
    durationMin: number;
    avgCost: number;
    tags: string[];
    fullDay?: boolean;
    indoor?: boolean;
    requiredBooking?: boolean;
    emoji?: string;
  }>;
  profile: {
    pace: string;
    interests: string[];
    dislikes: string[];
    origin: string;
    companions: string;
  };
  totalBudget: number;
}

/** 调用后端 LLM 生成完整行程；失败返回 null（调用方回退本地规则） */
export async function llmGeneratePlan(input: GeneratePlanInput): Promise<PlanDay[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40_000);
  try {
    const res = await fetch(`${BASE}/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; days?: PlanDay[]; error?: string };
    if (!data.ok || !Array.isArray(data.days)) return null;
    return data.days;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

export function resetLLMStatusCache() {
  cached = null;
}
