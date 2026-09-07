/**
 * LLM 代理（从 vite.config.ts 抽出来的 Fastify 版本）
 * ────────────────────────────────────────────────────────────
 * 浏览器永远拿不到 AI_API_KEY。生产部署只需把这个进程放到云上。
 * 前端代码（包括 LLM 调用）一行都不用改。
 */
import type { FastifyInstance } from 'fastify';
import { effectiveConfig } from '../config-store.js';
import { randomUUID } from 'node:crypto';

export default async function aiRoutes(app: FastifyInstance) {
  // 服务状态：是否配置了 AI Key
  app.get('/status', async () => {
    const cfg = effectiveConfig();
    const enabled = !!cfg.ai.apiKey;
    return {
      enabled,
      provider: enabled ? cfg.ai.providerLabel || cfg.ai.baseUrl : null,
      model: enabled ? cfg.ai.model : null,
      baseUrl: enabled ? cfg.ai.baseUrl : null,
      reason: enabled ? null : '后端 AI_API_KEY 未配置',
    };
  });

  // 通用 chat 代理
  app.post<{
    Body: {
      messages?: Array<{ role: string; content: string }>;
      temperature?: number;
      max_tokens?: number;
      json?: boolean;
    };
  }>('/chat', async (req, reply) => {
    const cfg0 = effectiveConfig();
    if (!cfg0.ai.apiKey) {
      return reply.code(503).send({ ok: false, error: 'AI not configured on server' });
    }

    const { messages, temperature = 0.3, max_tokens = 900, json = false } = req.body ?? {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return reply.code(400).send({ ok: false, error: 'messages required' });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg0.ai.timeoutMs);
    try {
      const upstream = await fetch(`${cfg0.ai.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg0.ai.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg0.ai.model,
          messages,
          temperature,
          max_tokens,
          stream: false,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      const data = (await upstream.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string }; usage?: unknown };
      if (!upstream.ok) {
        return reply.code(502).send({
          ok: false,
          error: data?.error?.message ?? `upstream ${upstream.status}`,
        });
      }
      return {
        ok: true,
        content: data?.choices?.[0]?.message?.content ?? '',
        usage: data?.usage ?? null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      const code = msg.includes('abort') ? 504 : 500;
      return reply.code(code).send({ ok: false, error: msg });
    }
  });

  // 生成完整行程方案：由 LLM 给出逐日安排，前端确认后才落库
  app.post<{
    Body: {
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
    };
  }>('/plan', async (req, reply) => {
    const cfg0 = effectiveConfig();
    if (!cfg0.ai.apiKey) {
      return reply.code(503).send({ ok: false, error: 'AI not configured on server' });
    }

    const { tripId, destinationName, days, places, profile, totalBudget } = req.body ?? {};
    if (!tripId || !Array.isArray(days) || days.length === 0 || !Array.isArray(places)) {
      return reply.code(400).send({ ok: false, error: 'tripId, days, places required' });
    }

    const system = [
      '你是 Trip OS 的旅行规划师。请根据用户提供的旅行信息，生成一份详细的逐日行程方案。',
      '只输出合法 JSON，不要任何其他文字。',
      '',
      '输出格式：',
      '{',
      '  "days": [',
      '    {',
      '      "dayId": "与输入 day.id 一致",',
      '      "title": "这一天主题，例如：抵达 + 西湖",',
      '      "intensity": "low | medium | high",',
      '      "specs": [',
      '        {',
      '          "title": "活动名称（必填）",',
      '          "placeId": "对应输入 place.id 或 null（交通/用餐/自由活动可 null）",',
      '          "startTime": "HH:MM",',
      '          "durationMin": 90,',
      '          "type": "sight | food | shopping | transport | stay | nature | culture | entertainment | free | other",',
      '          "estimatedCost": 0,',
      '          "note": "可选说明"',
      '        }',
      '      ]',
      '    }',
      '  ]',
      '}',
      '',
      '规则：',
      '1. 每天从 09:00 或 10:00 开始；如果用户 dislike 包含 earlyRise，则从 10:00 开始。',
      '2. 第一天和最后一天少排，给抵达/返程留时间。',
      '3. fullDay=true 的 place 独占一整天，不要在这一天再塞其他大景点。',
      '4. 同一天的地点尽量顺路，中间留 20–40 分钟交通/休息。',
      '5. 每天中午 12:00–13:30 安排午餐，晚上 18:00–19:30 安排晚餐。',
      '6. 总花费（estimatedCost 合计）不要超过 totalBudget 的 60%（留出大交通和购物余量）。',
      '7. 优先选择用户 interests 标签命中的 place；避开 dislikes 对应类型。',
      '8. 如果 days.length <= 2，不要安排整天型景点（fullDay），除非它是唯一亮点。',
      '9. 每个 placeId 最多出现一次，不要重复。',
      '10. 交通类型只用于「前往机场/车站/酒店」这类必要移动，不要每个地点之间都加交通。',
      '11. 禁止输出 type:"free" 的「自由活动 / 自由时间」占位项——如果某天没有可安排的地点，就少排几项，不要把自由时间当成一项活动编造进去。',
      '12. 只有 transport / stay / food 这类必要项允许 placeId 为 null；sight / shopping / culture 等必须对应输入里真实的 placeId，不得填 null 或编造。',
    ].join('\n');

    const user = [
      `目的地：${destinationName}`,
      `天数：${days.length} 天`,
      `总预算：¥${totalBudget}`,
      `出发地：${profile.origin}`,
      `同行：${profile.companions}`,
      `节奏偏好：${profile.pace}`,
      `兴趣：${profile.interests.join('、') || '无'}`,
      `不想：${profile.dislikes.join('、') || '无'}`,
      '',
      '可用地点（id, 名称, 类型, 建议时长分钟, 人均花费, 是否整天, 标签）：',
      ...places.map(
        (p) =>
          `${p.id} | ${p.name} | ${p.category} | ${p.durationMin}min | ¥${p.avgCost} | fullDay=${p.fullDay ? '是' : '否'} | ${p.tags.join(',')}`,
      ),
      '',
      '日期：',
      ...days.map((d) => `${d.id}: Day ${d.index} (${d.date}) ${d.title}`),
    ].join('\n');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg0.ai.timeoutMs);
    try {
      const upstream = await fetch(`${cfg0.ai.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg0.ai.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg0.ai.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.4,
          max_tokens: 2500,
          stream: false,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      const data = (await upstream.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
      if (!upstream.ok) {
        return reply.code(502).send({
          ok: false,
          error: data?.error?.message ?? `upstream ${upstream.status}`,
        });
      }

      const raw = data?.choices?.[0]?.message?.content ?? '';
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      let parsed: unknown;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        return reply.code(502).send({ ok: false, error: '模型返回的不是合法 JSON' });
      }
      const plan = (parsed as { days?: unknown }).days;
      if (!Array.isArray(plan)) {
        return reply.code(502).send({ ok: false, error: '模型返回缺少 days 字段' });
      }

      // 轻量校验 + 归一化
      const validDays = plan
        .map((d: unknown) => {
          const day = d as Record<string, unknown>;
          const specs = Array.isArray(day.specs)
            ? day.specs
                .map((s: unknown) => {
                  const spec = s as Record<string, unknown>;
                  return {
                    title: String(spec.title ?? '活动'),
                    placeId: spec.placeId ? String(spec.placeId) : null,
                    startTime: /^\d{2}:\d{2}$/.test(String(spec.startTime)) ? String(spec.startTime) : '09:00',
                    durationMin: Math.max(15, Math.min(600, Number(spec.durationMin) || 90)),
                    type: String(spec.type || 'sight'),
                    estimatedCost: Math.max(0, Number(spec.estimatedCost) || 0),
                    note: spec.note ? String(spec.note) : undefined,
                  };
                })
                // 禁止把「自由活动」当占位项写进行程；非必要类型且没有真实 placeId 也丢弃
                .filter((s) => {
                  if (!s.title) return false;
                  if (s.type === 'free') return false;
                  const essential = s.type === 'transport' || s.type === 'stay' || s.type === 'food';
                  if (s.placeId == null && !essential) return false;
                  return true;
                })
            : [];
          return {
            dayId: String(day.dayId ?? randomUUID()),
            title: String(day.title ?? '一天'),
            intensity: ['low', 'medium', 'high'].includes(String(day.intensity)) ? String(day.intensity) : 'medium',
            specs,
          };
        })
        .filter((d) => d.specs.length > 0);

      return { ok: true, days: validDays };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      const code = msg.includes('abort') ? 504 : 500;
      return reply.code(code).send({ ok: false, error: msg });
    }
  });
}
