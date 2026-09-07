/**
 * 小红书笔记解析（best-effort）
 * ────────────────────────────────────────────────────────────
 * 用户贴一个小红书笔记链接，我们尽量抓出「标题 + 正文 + 地点标签」，
 * 交给前端用标题/地点去高德 POI 搜索真实坐标（不伪造经纬度）。
 *
 * 说明：小红书有反爬，服务端直连可能偶发失败（403/限流）。
 * 失败就诚实地告诉前端，由前端引导用户手动填地点名——绝不返回假数据。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { effectiveConfig } from '../config-store.js';

function extractInitialState(html: string): Record<string, any> | null {
  const m = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function pickNote(state: Record<string, any>): Record<string, any> | null {
  // 结构不稳定，逐层兜底
  const note = state?.note?.noteCard ?? state?.note ?? state?.notes?.[0];
  if (note && (note.title || note.desc)) return note;
  // 另一种：noteData / noteDataMap
  const map = state?.noteDataMap ?? state?.noteData;
  if (map) {
    const first = Object.values(map as Record<string, any>)[0] as any;
    const card = first?.noteCard ?? first;
    if (card?.title || card?.desc) return card;
  }
  return null;
}

export default async function xhsRoutes(app: FastifyInstance) {
  app.post('/parse', async (req, reply) => {
    const parsed = z
      .object({ url: z.string().url().max(2000) })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: '链接格式不对' });
    }
    const url = parsed.data.url;
    if (!/xiaohongshu\.com|xhslink\.com/i.test(url)) {
      return reply.code(400).send({ ok: false, error: '只支持小红书链接' });
    }

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        redirect: 'follow',
      });
      if (!res.ok) {
        return reply.code(502).send({ ok: false, error: `小红书返回 ${res.status}，可能被反爬拦截` });
      }
      const html = await res.text();

      // 1) og 标签兜底
      const ogTitle = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1];
      const ogDesc = html.match(/<meta property="og:description" content="([^"]*)"/)?.[1];

      // 2) 内嵌 JSON 状态
      const state = extractInitialState(html);
      const note = state ? pickNote(state) : null;
      const title = note?.title?.trim() || ogTitle || '';
      const desc = note?.desc?.trim() || ogDesc || '';

      // 3) 地点标签（小红书把地点做成 tagList，type === 'location' 或含 city/loc 字段）
      const tagList: any[] = note?.tagList ?? [];
      const locationTags = tagList
        .filter((t) => /location|地点|城市/.test(JSON.stringify(t)))
        .map((t) => t.name || t.tagName || t.content || '')
        .filter(Boolean);

      if (!title && !desc && !locationTags.length) {
        return reply
          .code(404)
          .send({ ok: false, error: '没解析到内容，可能需登录或页面结构变了，请手动填地点名' });
      }

      return {
        ok: true,
        title,
        desc: desc.slice(0, 500),
        locations: locationTags,
      };
    } catch (e) {
      return reply
        .code(502)
        .send({ ok: false, error: e instanceof Error ? e.message : '抓取失败' });
    }
  });

  /**
   * 小红书图片（截图）识别：best-effort 多模态解析。
   * 前端把图片转 dataURL 传上来，后端用视觉模型提取 标题/正文/地点。
   * 模型不支持视觉或识别失败时诚实报错，绝不返回假数据。
   */
  app.post('/parse-image', async (req, reply) => {
    const parsed = z
      .object({ image: z.string().min(50).max(12_000_000) })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: '图片数据无效（需 dataURL，≤ ~9MB）' });
    }
    const cfg = effectiveConfig();
    if (!cfg.ai.apiKey) {
      return reply.code(503).send({ ok: false, error: '服务器未配置 AI（无法识别图片）' });
    }
    if (!/^data:image\//.test(parsed.data.image)) {
      return reply.code(400).send({ ok: false, error: '只接受图片 dataURL' });
    }

    const system =
      '你是旅行攻略提取助手。用户会给你一张小红书笔记截图（可能含标题、正文、地点、路线）。' +
      '请提取：title（笔记标题）、desc（正文要点，最多 300 字）、locations（提到的地点/城市名数组，尽量用标准地名）。' +
      '只返回 JSON：{"title":string,"desc":string,"locations":string[]}。看不清就尽力而为，不要编造明显不存在的地点。';
    const user: any[] = [
      { type: 'text', text: '请提取这张攻略笔记的信息（只返回 JSON）。' },
      { type: 'image_url', image_url: { url: parsed.data.image } },
    ];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.ai.timeoutMs);
    try {
      const upstream = await fetch(`${cfg.ai.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.ai.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.ai.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.2,
          max_tokens: 900,
          stream: false,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      const data = (await upstream.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };
      if (!upstream.ok) {
        return reply
          .code(502)
          .send({ ok: false, error: data?.error?.message ?? `upstream ${upstream.status}` });
      }
      const raw = data?.choices?.[0]?.message?.content ?? '';
      let out: { title?: string; desc?: string; locations?: string[] };
      try {
        out = JSON.parse(raw);
      } catch {
        return reply.code(502).send({ ok: false, error: '识别结果无法解析，请重试或改用链接' });
      }
      const title = String(out.title ?? '').trim();
      const desc = String(out.desc ?? '').trim().slice(0, 500);
      const locations = Array.isArray(out.locations)
        ? out.locations.map((x) => String(x).trim()).filter(Boolean)
        : [];
      if (!title && !desc && !locations.length) {
        return reply
          .code(422)
          .send({ ok: false, error: '没识别出内容，请确认图片清晰或改用链接' });
      }
      return { ok: true, title, desc, locations };
    } catch (e) {
      const msg = e instanceof Error ? e.message : '识别失败';
      const code = msg.includes('abort') ? 504 : 502;
      return reply.code(code).send({ ok: false, error: msg });
    }
  });

  /**
   * 攻略文本解析：用户粘贴一段攻略文字（通常由对话 AI 整理好），
   * 后端用 LLM 提取 标题/正文/地点，返回与图片解析相同的结构。
   */
  app.post('/parse-text', async (req, reply) => {
    const parsed = z.object({ text: z.string().min(1).max(20000) }).safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: '文本为空或过长（≤ 2 万字）' });
    }
    const cfg = effectiveConfig();
    if (!cfg.ai.apiKey) {
      return reply.code(503).send({ ok: false, error: '服务器未配置 AI' });
    }
    const system =
      '你是旅行攻略提取助手。用户会粘贴一段攻略文本（可能含标题、正文、地点、路线）。' +
      '请提取：title（标题）、desc（正文要点，最多 300 字）、locations（地点/城市名数组，尽量用标准地名）。' +
      '只返回 JSON：{"title":string,"desc":string,"locations":string[]}。不要编造明显不存在的地点。';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.ai.timeoutMs);
    try {
      const upstream = await fetch(`${cfg.ai.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.ai.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.ai.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: parsed.data.text },
          ],
          temperature: 0.2,
          max_tokens: 900,
          stream: false,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      const data = (await upstream.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };
      if (!upstream.ok) {
        return reply
          .code(502)
          .send({ ok: false, error: data?.error?.message ?? `upstream ${upstream.status}` });
      }
      const raw = data?.choices?.[0]?.message?.content ?? '';
      let out: { title?: string; desc?: string; locations?: string[] };
      try {
        out = JSON.parse(raw);
      } catch {
        return reply.code(502).send({ ok: false, error: '识别结果无法解析，请重试' });
      }
      const title = String(out.title ?? '').trim();
      const desc = String(out.desc ?? '').trim().slice(0, 500);
      const locations = Array.isArray(out.locations)
        ? out.locations.map((x) => String(x).trim()).filter(Boolean)
        : [];
      if (!title && !desc && !locations.length) {
        return reply.code(422).send({ ok: false, error: '没提取到内容，请检查文本' });
      }
      return { ok: true, title, desc, locations };
    } catch (e) {
      const msg = e instanceof Error ? e.message : '识别失败';
      const code = msg.includes('abort') ? 504 : 502;
      return reply.code(code).send({ ok: false, error: msg });
    }
  });
}
