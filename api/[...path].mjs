// server/src/app.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";

// server/src/env.ts
function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`\u7F3A\u5C11\u73AF\u5883\u53D8\u91CF ${name}\uFF08\u8BF7\u68C0\u67E5 server/.env\uFF09`);
  return v;
}
var env = {
  port: Number(process.env.PORT) || 8787,
  nodeEnv: process.env.NODE_ENV ?? "development",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-please-change-in-production",
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173").split(",").map((s) => s.trim()).filter(Boolean),
  /** 数据库；不为空时也会校验 */
  databaseUrl: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  /** 高德地图：地理编码、路径规划。后端存的是「Web 服务」Key */
  amapWebKey: process.env.AMAP_WEB_KEY ?? "",
  /** LLM：所有 key 都在这里，绝不进前端 bundle */
  ai: {
    apiKey: process.env.AI_API_KEY ?? "",
    baseUrl: (process.env.AI_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/, ""),
    model: process.env.AI_MODEL ?? "deepseek-chat",
    providerLabel: providerLabelFromUrl(process.env.AI_BASE_URL),
    timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 2e4
  },
  need
};
function providerLabelFromUrl(raw) {
  const baseUrl = (raw ?? "").replace(/\/$/, "");
  if (!baseUrl) return "";
  let host = baseUrl;
  try {
    host = new URL(baseUrl).host;
  } catch {
  }
  const table = [
    ["api.deepseek.com", "DeepSeek"],
    ["dashscope.aliyuncs.com", "\u901A\u4E49\u5343\u95EE"],
    ["open.bigmodel.cn", "\u667A\u8C31 GLM"],
    ["api.moonshot.cn", "Kimi"],
    ["openrouter.ai", "OpenRouter"],
    ["api.openai.com", "OpenAI"],
    ["localhost", "\u672C\u5730\u6A21\u578B"],
    ["127.0.0.1", "\u672C\u5730\u6A21\u578B"]
  ];
  return table.find(([key]) => host.includes(key))?.[1] ?? host;
}

// server/src/config-store.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { z } from "zod";
import { kv } from "@vercel/kv";
var ConfigSchema = z.object({
  aiApiKey: z.string().max(300).optional(),
  aiBaseUrl: z.string().max(300).optional(),
  aiModel: z.string().max(120).optional(),
  aiProviderLabel: z.string().max(60).optional(),
  amapWebKey: z.string().max(300).optional(),
  // 新增：浏览器端 JS API key + 服务端 安全密钥
  amapJsKey: z.string().max(300).optional(),
  amapSecurityKey: z.string().max(300).optional(),
  jwtSecret: z.string().max(300).optional()
});
var KV_KEY = "trip-os:runtime-config";
var RUNTIME_CONFIG_FILE = join(process.cwd(), "server", ".runtime-config.json");
function kvEnabled() {
  return !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;
}
async function loadPersistedConfig() {
  if (kvEnabled()) {
    try {
      const raw = await kv.get(KV_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const validated = ConfigSchema.safeParse(parsed);
        if (validated.success) return validated.data;
      }
      return {};
    } catch {
    }
  }
  try {
    if (existsSync(RUNTIME_CONFIG_FILE)) {
      const raw = readFileSync(RUNTIME_CONFIG_FILE, "utf8");
      const parsed = JSON.parse(raw);
      const validated = ConfigSchema.safeParse(parsed);
      if (validated.success) return validated.data;
    }
  } catch {
  }
  return {};
}
async function savePersistedConfig(cfg) {
  if (kvEnabled()) {
    try {
      await kv.set(KV_KEY, JSON.stringify(cfg));
      return;
    } catch {
    }
  }
  try {
    const dir = dirname(RUNTIME_CONFIG_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(RUNTIME_CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n");
  } catch {
  }
}
var overrides = {};
var configLoadPromise = null;
var configLoaded = false;
async function ensureConfigLoaded() {
  if (configLoaded) return;
  if (configLoadPromise) return configLoadPromise;
  configLoadPromise = (async () => {
    try {
      const cfg = await loadPersistedConfig();
      overrides = { ...cfg };
    } catch (err) {
      console.error("[config-store] \u52A0\u8F7D\u6301\u4E45\u5316\u914D\u7F6E\u5931\u8D25\uFF0C\u4F7F\u7528\u7A7A\u8986\u76D6:", err);
      overrides = {};
    } finally {
      configLoaded = true;
    }
  })();
  return configLoadPromise;
}
async function setRuntimeConfig(patch) {
  await ensureConfigLoaded();
  Object.assign(overrides, patch);
  await savePersistedConfig(overrides);
}
function getRuntimeConfig() {
  return { ...overrides };
}
function mask(secret) {
  if (!secret) return null;
  if (secret.length <= 6) return "***";
  return `${secret.slice(0, 3)}***${secret.slice(-2)}`;
}
function providerLabelFromUrl2(raw) {
  const baseUrl = (raw ?? "").replace(/\/$/, "");
  if (!baseUrl) return "";
  let host = baseUrl;
  try {
    host = new URL(baseUrl).host;
  } catch {
  }
  const table = [
    ["api.deepseek.com", "DeepSeek"],
    ["dashscope.aliyuncs.com", "\u901A\u4E49\u5343\u95EE"],
    ["open.bigmodel.cn", "\u667A\u8C31 GLM"],
    ["api.moonshot.cn", "Kimi"],
    ["openrouter.ai", "OpenRouter"],
    ["api.openai.com", "OpenAI"],
    ["localhost", "\u672C\u5730\u6A21\u578B"],
    ["127.0.0.1", "\u672C\u5730\u6A21\u578B"]
  ];
  return table.find(([key]) => host.includes(key))?.[1] ?? host;
}
function effectiveConfig() {
  const o = overrides;
  const aiBaseUrl = (o.aiBaseUrl ?? process.env.AI_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/, "");
  const aiModel = o.aiModel ?? process.env.AI_MODEL ?? "deepseek-chat";
  const aiApiKey = o.aiApiKey ?? process.env.AI_API_KEY ?? "";
  const amapWebKey = o.amapWebKey ?? process.env.AMAP_WEB_KEY ?? "";
  const amapJsKey = o.amapJsKey ?? process.env.AMAP_JS_KEY ?? "";
  const amapSecurityKey = o.amapSecurityKey ?? process.env.AMAP_SECURITY_KEY ?? "";
  return {
    ai: {
      apiKey: aiApiKey,
      baseUrl: aiBaseUrl,
      model: aiModel,
      providerLabel: o.aiProviderLabel ?? providerLabelFromUrl2(aiBaseUrl),
      timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 2e4
    },
    amapWebKey,
    amapJsKey,
    amapSecurityKey,
    jwtSecret: o.jwtSecret ?? process.env.JWT_SECRET ?? "dev-secret-please-change-in-production",
    corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173").split(",").map((s) => s.trim()).filter(Boolean)
  };
}

// server/src/routes/ai.ts
import { randomUUID } from "node:crypto";
async function aiRoutes(app) {
  app.get("/status", async () => {
    const cfg = effectiveConfig();
    const enabled = !!cfg.ai.apiKey;
    return {
      enabled,
      provider: enabled ? cfg.ai.providerLabel || cfg.ai.baseUrl : null,
      model: enabled ? cfg.ai.model : null,
      baseUrl: enabled ? cfg.ai.baseUrl : null,
      reason: enabled ? null : "\u540E\u7AEF AI_API_KEY \u672A\u914D\u7F6E"
    };
  });
  app.post("/chat", async (req, reply) => {
    const cfg0 = effectiveConfig();
    if (!cfg0.ai.apiKey) {
      return reply.code(503).send({ ok: false, error: "AI not configured on server" });
    }
    const { messages, temperature = 0.3, max_tokens = 900, json = false } = req.body ?? {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return reply.code(400).send({ ok: false, error: "messages required" });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg0.ai.timeoutMs);
    try {
      const upstream = await fetch(`${cfg0.ai.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg0.ai.apiKey}`
        },
        body: JSON.stringify({
          model: cfg0.ai.model,
          messages,
          temperature,
          max_tokens,
          stream: false,
          ...json ? { response_format: { type: "json_object" } } : {}
        }),
        signal: controller.signal
      }).finally(() => clearTimeout(timer));
      const data = await upstream.json();
      if (!upstream.ok) {
        return reply.code(502).send({
          ok: false,
          error: data?.error?.message ?? `upstream ${upstream.status}`
        });
      }
      return {
        ok: true,
        content: data?.choices?.[0]?.message?.content ?? "",
        usage: data?.usage ?? null
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      const code = msg.includes("abort") ? 504 : 500;
      return reply.code(code).send({ ok: false, error: msg });
    }
  });
  app.post("/plan", async (req, reply) => {
    const cfg0 = effectiveConfig();
    if (!cfg0.ai.apiKey) {
      return reply.code(503).send({ ok: false, error: "AI not configured on server" });
    }
    const { tripId, destinationName, days, places, profile, totalBudget } = req.body ?? {};
    if (!tripId || !Array.isArray(days) || days.length === 0 || !Array.isArray(places)) {
      return reply.code(400).send({ ok: false, error: "tripId, days, places required" });
    }
    const system = [
      "\u4F60\u662F Trip OS \u7684\u65C5\u884C\u89C4\u5212\u5E08\u3002\u8BF7\u6839\u636E\u7528\u6237\u63D0\u4F9B\u7684\u65C5\u884C\u4FE1\u606F\uFF0C\u751F\u6210\u4E00\u4EFD\u8BE6\u7EC6\u7684\u9010\u65E5\u884C\u7A0B\u65B9\u6848\u3002",
      "\u53EA\u8F93\u51FA\u5408\u6CD5 JSON\uFF0C\u4E0D\u8981\u4EFB\u4F55\u5176\u4ED6\u6587\u5B57\u3002",
      "",
      "\u8F93\u51FA\u683C\u5F0F\uFF1A",
      "{",
      '  "days": [',
      "    {",
      '      "dayId": "\u4E0E\u8F93\u5165 day.id \u4E00\u81F4",',
      '      "title": "\u8FD9\u4E00\u5929\u4E3B\u9898\uFF0C\u4F8B\u5982\uFF1A\u62B5\u8FBE + \u897F\u6E56",',
      '      "intensity": "low | medium | high",',
      '      "specs": [',
      "        {",
      '          "title": "\u6D3B\u52A8\u540D\u79F0\uFF08\u5FC5\u586B\uFF09",',
      '          "placeId": "\u5BF9\u5E94\u8F93\u5165 place.id \u6216 null\uFF08\u4EA4\u901A/\u7528\u9910/\u81EA\u7531\u6D3B\u52A8\u53EF null\uFF09",',
      '          "startTime": "HH:MM",',
      '          "durationMin": 90,',
      '          "type": "sight | food | shopping | transport | stay | nature | culture | entertainment | free | other",',
      '          "estimatedCost": 0,',
      '          "note": "\u53EF\u9009\u8BF4\u660E"',
      "        }",
      "      ]",
      "    }",
      "  ]",
      "}",
      "",
      "\u89C4\u5219\uFF1A",
      "1. \u6BCF\u5929\u4ECE 09:00 \u6216 10:00 \u5F00\u59CB\uFF1B\u5982\u679C\u7528\u6237 dislike \u5305\u542B earlyRise\uFF0C\u5219\u4ECE 10:00 \u5F00\u59CB\u3002",
      "2. \u7B2C\u4E00\u5929\u548C\u6700\u540E\u4E00\u5929\u5C11\u6392\uFF0C\u7ED9\u62B5\u8FBE/\u8FD4\u7A0B\u7559\u65F6\u95F4\u3002",
      "3. fullDay=true \u7684 place \u72EC\u5360\u4E00\u6574\u5929\uFF0C\u4E0D\u8981\u5728\u8FD9\u4E00\u5929\u518D\u585E\u5176\u4ED6\u5927\u666F\u70B9\u3002",
      "4. \u540C\u4E00\u5929\u7684\u5730\u70B9\u5C3D\u91CF\u987A\u8DEF\uFF0C\u4E2D\u95F4\u7559 20\u201340 \u5206\u949F\u4EA4\u901A/\u4F11\u606F\u3002",
      "5. \u6BCF\u5929\u4E2D\u5348 12:00\u201313:30 \u5B89\u6392\u5348\u9910\uFF0C\u665A\u4E0A 18:00\u201319:30 \u5B89\u6392\u665A\u9910\u3002",
      "6. \u603B\u82B1\u8D39\uFF08estimatedCost \u5408\u8BA1\uFF09\u4E0D\u8981\u8D85\u8FC7 totalBudget \u7684 60%\uFF08\u7559\u51FA\u5927\u4EA4\u901A\u548C\u8D2D\u7269\u4F59\u91CF\uFF09\u3002",
      "7. \u4F18\u5148\u9009\u62E9\u7528\u6237 interests \u6807\u7B7E\u547D\u4E2D\u7684 place\uFF1B\u907F\u5F00 dislikes \u5BF9\u5E94\u7C7B\u578B\u3002",
      "8. \u5982\u679C days.length <= 2\uFF0C\u4E0D\u8981\u5B89\u6392\u6574\u5929\u578B\u666F\u70B9\uFF08fullDay\uFF09\uFF0C\u9664\u975E\u5B83\u662F\u552F\u4E00\u4EAE\u70B9\u3002",
      "9. \u6BCF\u4E2A placeId \u6700\u591A\u51FA\u73B0\u4E00\u6B21\uFF0C\u4E0D\u8981\u91CD\u590D\u3002",
      "10. \u4EA4\u901A\u7C7B\u578B\u53EA\u7528\u4E8E\u300C\u524D\u5F80\u673A\u573A/\u8F66\u7AD9/\u9152\u5E97\u300D\u8FD9\u7C7B\u5FC5\u8981\u79FB\u52A8\uFF0C\u4E0D\u8981\u6BCF\u4E2A\u5730\u70B9\u4E4B\u95F4\u90FD\u52A0\u4EA4\u901A\u3002",
      '11. \u7981\u6B62\u8F93\u51FA type:"free" \u7684\u300C\u81EA\u7531\u6D3B\u52A8 / \u81EA\u7531\u65F6\u95F4\u300D\u5360\u4F4D\u9879\u2014\u2014\u5982\u679C\u67D0\u5929\u6CA1\u6709\u53EF\u5B89\u6392\u7684\u5730\u70B9\uFF0C\u5C31\u5C11\u6392\u51E0\u9879\uFF0C\u4E0D\u8981\u628A\u81EA\u7531\u65F6\u95F4\u5F53\u6210\u4E00\u9879\u6D3B\u52A8\u7F16\u9020\u8FDB\u53BB\u3002',
      "12. \u53EA\u6709 transport / stay / food \u8FD9\u7C7B\u5FC5\u8981\u9879\u5141\u8BB8 placeId \u4E3A null\uFF1Bsight / shopping / culture \u7B49\u5FC5\u987B\u5BF9\u5E94\u8F93\u5165\u91CC\u771F\u5B9E\u7684 placeId\uFF0C\u4E0D\u5F97\u586B null \u6216\u7F16\u9020\u3002"
    ].join("\n");
    const user = [
      `\u76EE\u7684\u5730\uFF1A${destinationName}`,
      `\u5929\u6570\uFF1A${days.length} \u5929`,
      `\u603B\u9884\u7B97\uFF1A\xA5${totalBudget}`,
      `\u51FA\u53D1\u5730\uFF1A${profile.origin}`,
      `\u540C\u884C\uFF1A${profile.companions}`,
      `\u8282\u594F\u504F\u597D\uFF1A${profile.pace}`,
      `\u5174\u8DA3\uFF1A${profile.interests.join("\u3001") || "\u65E0"}`,
      `\u4E0D\u60F3\uFF1A${profile.dislikes.join("\u3001") || "\u65E0"}`,
      "",
      "\u53EF\u7528\u5730\u70B9\uFF08id, \u540D\u79F0, \u7C7B\u578B, \u5EFA\u8BAE\u65F6\u957F\u5206\u949F, \u4EBA\u5747\u82B1\u8D39, \u662F\u5426\u6574\u5929, \u6807\u7B7E\uFF09\uFF1A",
      ...places.map(
        (p) => `${p.id} | ${p.name} | ${p.category} | ${p.durationMin}min | \xA5${p.avgCost} | fullDay=${p.fullDay ? "\u662F" : "\u5426"} | ${p.tags.join(",")}`
      ),
      "",
      "\u65E5\u671F\uFF1A",
      ...days.map((d) => `${d.id}: Day ${d.index} (${d.date}) ${d.title}`)
    ].join("\n");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg0.ai.timeoutMs);
    try {
      const upstream = await fetch(`${cfg0.ai.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg0.ai.apiKey}`
        },
        body: JSON.stringify({
          model: cfg0.ai.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ],
          temperature: 0.4,
          max_tokens: 2500,
          stream: false,
          response_format: { type: "json_object" }
        }),
        signal: controller.signal
      }).finally(() => clearTimeout(timer));
      const data = await upstream.json();
      if (!upstream.ok) {
        return reply.code(502).send({
          ok: false,
          error: data?.error?.message ?? `upstream ${upstream.status}`
        });
      }
      const raw = data?.choices?.[0]?.message?.content ?? "";
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        return reply.code(502).send({ ok: false, error: "\u6A21\u578B\u8FD4\u56DE\u7684\u4E0D\u662F\u5408\u6CD5 JSON" });
      }
      const plan = parsed.days;
      if (!Array.isArray(plan)) {
        return reply.code(502).send({ ok: false, error: "\u6A21\u578B\u8FD4\u56DE\u7F3A\u5C11 days \u5B57\u6BB5" });
      }
      const validDays = plan.map((d) => {
        const day = d;
        const specs = Array.isArray(day.specs) ? day.specs.map((s) => {
          const spec = s;
          return {
            title: String(spec.title ?? "\u6D3B\u52A8"),
            placeId: spec.placeId ? String(spec.placeId) : null,
            startTime: /^\d{2}:\d{2}$/.test(String(spec.startTime)) ? String(spec.startTime) : "09:00",
            durationMin: Math.max(15, Math.min(600, Number(spec.durationMin) || 90)),
            type: String(spec.type || "sight"),
            estimatedCost: Math.max(0, Number(spec.estimatedCost) || 0),
            note: spec.note ? String(spec.note) : void 0
          };
        }).filter((s) => {
          if (!s.title) return false;
          if (s.type === "free") return false;
          const essential = s.type === "transport" || s.type === "stay" || s.type === "food";
          if (s.placeId == null && !essential) return false;
          return true;
        }) : [];
        return {
          dayId: String(day.dayId ?? randomUUID()),
          title: String(day.title ?? "\u4E00\u5929"),
          intensity: ["low", "medium", "high"].includes(String(day.intensity)) ? String(day.intensity) : "medium",
          specs
        };
      }).filter((d) => d.specs.length > 0);
      return { ok: true, days: validDays };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      const code = msg.includes("abort") ? 504 : 500;
      return reply.code(code).send({ ok: false, error: msg });
    }
  });
}

// server/src/routes/map.ts
import { z as z2 } from "zod";
var AMAP_BASE = "https://restapi.amap.com/v3";
async function callAmap(path2, params, extraHeaders = {}) {
  const cfg = effectiveConfig();
  if (!cfg.amapWebKey) {
    throw Object.assign(new Error("AMAP_WEB_KEY not configured"), { statusCode: 503 });
  }
  const url = new URL(`${AMAP_BASE}${path2}`);
  url.searchParams.set("key", cfg.amapWebKey);
  url.searchParams.set("output", "JSON");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json", ...extraHeaders } });
      const json = await res.json();
      if (json.status !== "1") {
        if (/限流|QPS|CONCURRENT|batch/i.test(json.info ?? "")) {
          lastErr = Object.assign(new Error(json.info ?? "amap throttle"), { statusCode: 502 });
          await new Promise((r) => setTimeout(r, 250));
          continue;
        }
        throw Object.assign(new Error(json.info ?? "amap error"), { statusCode: 502 });
      }
      return json;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("amap error");
}
async function mapRoutes(app) {
  app.post("/geocode", async (req, reply) => {
    const parsed = z2.object({ address: z2.string().min(1).max(200), city: z2.string().optional() }).safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "invalid address" });
    }
    const data = await callAmap("/geocode/geo", {
      address: parsed.data.address,
      ...parsed.data.city ? { city: parsed.data.city } : {}
    });
    const hit = data.geocodes?.[0];
    if (!hit) return reply.code(404).send({ ok: false, error: "not found" });
    const [lng, lat] = hit.location.split(",");
    return {
      ok: true,
      address: hit.formatted_address,
      lng: Number(lng),
      lat: Number(lat),
      level: hit.level,
      city: hit.addressComponent?.city
    };
  });
  app.post("/around", async (req, reply) => {
    const parsed = z2.object({
      location: z2.string().regex(/^\d+(\.\d+)?,\d+(\.\d+)?$/, "lng,lat"),
      radius: z2.number().int().min(100).max(5e4).default(3e3),
      types: z2.string().max(60).optional(),
      keywords: z2.string().max(60).optional(),
      pageSize: z2.number().int().min(1).max(20).default(20)
    }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid around params" });
    const data = await callAmap("/place/around", {
      location: parsed.data.location,
      radius: String(parsed.data.radius),
      extensions: "base",
      offset: String(parsed.data.pageSize),
      page: "1",
      ...parsed.data.types ? { types: parsed.data.types } : {},
      ...parsed.data.keywords ? { keywords: parsed.data.keywords } : {}
    });
    const pois = data.pois ?? [];
    return {
      ok: true,
      count: pois.length,
      radius: parsed.data.radius,
      pois: pois.map((p) => {
        const [lngStr, latStr] = (p.location ?? "").split(",");
        const lng = Number(lngStr);
        const lat = Number(latStr);
        return {
          id: p.id,
          name: p.name,
          type: p.type,
          address: p.address,
          lng,
          lat,
          /** 高德 /place/around 直接给出距 location 的米数 */
          distance: typeof p.distance === "string" ? Number(p.distance) : void 0,
          openTime: p.business?.opentime
        };
      }).filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat) && Math.abs(p.lng) > 1e-3 && Math.abs(p.lat) > 1e-3)
    };
  });
  app.get("/ip", async (req, reply) => {
    const xff = req.headers["x-forwarded-for"];
    const realIp = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim() ?? req.ip;
    const headers = realIp ? { "X-Forwarded-For": realIp } : {};
    const data = await callAmap("/ip", {}, headers);
    if (data.status !== "1" || !data.location) {
      return reply.code(404).send({ ok: false, error: "ip geolocation failed" });
    }
    const [lngStr, latStr] = data.location.split(",");
    const [westStr, southStr, eastStr, northStr] = (data.rectangle ?? "").split(" ");
    return {
      ok: true,
      province: data.province,
      city: data.city,
      adcode: data.adcode,
      lng: Number(lngStr),
      lat: Number(latStr),
      rectangle: Number(westStr) && Number(southStr) && Number(eastStr) && Number(northStr) ? { west: Number(westStr), south: Number(southStr), east: Number(eastStr), north: Number(northStr) } : void 0
    };
  });
  app.post("/poi", async (req, reply) => {
    const parsed = z2.object({
      city: z2.string().min(1).max(40),
      keywords: z2.string().max(60).optional(),
      types: z2.string().max(60).optional(),
      pageSize: z2.number().int().min(1).max(20).default(20)
    }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid poi params" });
    const data = await callAmap("/place/text", {
      keywords: parsed.data.keywords ?? "",
      city: parsed.data.city,
      citylimit: "true",
      extensions: "base",
      offset: String(parsed.data.pageSize),
      page: "1",
      ...parsed.data.types ? { types: parsed.data.types } : {}
    });
    const pois = data.pois ?? [];
    return {
      ok: true,
      count: pois.length,
      pois: pois.map((p) => {
        const [lngStr, latStr] = (p.location ?? "").split(",");
        const lng = Number(lngStr);
        const lat = Number(latStr);
        return {
          id: p.id,
          name: p.name,
          type: p.type,
          address: p.address,
          lng,
          lat,
          openTime: p.business?.opentime
        };
      }).filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat) && Math.abs(p.lng) > 1e-3 && Math.abs(p.lat) > 1e-3)
    };
  });
  app.post("/route", async (req, reply) => {
    const parsed = z2.object({
      origin: z2.object({ lng: z2.number(), lat: z2.number() }),
      destination: z2.object({ lng: z2.number(), lat: z2.number() }),
      waypoints: z2.array(z2.object({ lng: z2.number(), lat: z2.number() })).max(16).optional(),
      mode: z2.enum(["driving", "walking", "transit"]).default("driving")
    }).safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "invalid route params" });
    }
    const { origin, destination, waypoints, mode } = parsed.data;
    const path2 = mode === "walking" ? "/direction/walking" : mode === "transit" ? "/direction/transit/integrated" : "/direction/driving";
    const data = await callAmap(path2, {
      origin: `${origin.lng},${origin.lat}`,
      destination: `${destination.lng},${destination.lat}`,
      ...waypoints && waypoints.length ? { waypoints: waypoints.map((p) => `${p.lng},${p.lat}`).join(";") } : {},
      strategy: "0",
      // 速度优先
      extensions: "base"
    });
    const route = data.route;
    if (!route?.paths?.[0]) {
      return reply.code(404).send({ ok: false, error: "no route" });
    }
    const total = route.paths[0];
    return {
      ok: true,
      mode,
      distanceMeters: Number(total.distance),
      durationSeconds: Number(total.duration),
      steps: total.steps ?? []
    };
  });
  app.get("/weather", async (req, reply) => {
    const lng = Number(req.query.lng);
    const lat = Number(req.query.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng === 0 && lat === 0) {
      return reply.code(400).send({ ok: false, error: "invalid coords" });
    }
    try {
      const re = await callAmap("/geocode/regeo", {
        location: `${lng},${lat}`,
        extensions: "base"
      });
      const adcode = re.regeocode?.addressComponent?.adcode;
      if (!adcode) return reply.code(404).send({ ok: false, error: "no adcode" });
      const w = await callAmap("/weather/weatherInfo", {
        city: adcode,
        extensions: "all"
      });
      const casts = w.forecasts?.[0]?.casts ?? [];
      const days = casts.map((c) => mapAmapCast(c));
      return { ok: true, days };
    } catch (err) {
      const code = err.statusCode ?? 502;
      return reply.code(code).send({ ok: false, error: err.message });
    }
  });
}
function mapAmapCast(c) {
  const cond = (c.dayweather || c.nightweather || "\u6674").trim();
  let condition = "sunny";
  let emoji = "\u2600\uFE0F";
  let rain = 0;
  if (cond.includes("\u96F7")) {
    condition = "shower";
    emoji = "\u26C8\uFE0F";
    rain = 75;
  } else if (cond.includes("\u96E8")) {
    condition = "rain";
    emoji = "\u{1F327}\uFE0F";
    rain = 80;
  } else if (cond.includes("\u96EA")) {
    condition = "rain";
    emoji = "\u{1F328}\uFE0F";
    rain = 60;
  } else if (cond.includes("\u9634")) {
    condition = "cloudy";
    emoji = "\u2601\uFE0F";
    rain = 10;
  } else if (cond.includes("\u591A\u4E91")) {
    condition = "cloudy";
    emoji = "\u26C5";
    rain = 5;
  }
  const high = Number(c.daytemp);
  const low = Number(c.nighttemp);
  return {
    date: c.date,
    high: Number.isFinite(high) ? high : 0,
    low: Number.isFinite(low) ? low : 0,
    condition,
    emoji,
    text: cond,
    rain
  };
}

// server/src/routes/_auth.ts
async function requireAuth(req, reply) {
  const auth = req.headers.authorization;
  let token;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    token = auth.slice(7);
  } else {
    const cookies = req.cookies;
    token = cookies?.token;
  }
  if (!token) {
    reply.code(401).send({ ok: false, error: "missing token" });
    return;
  }
  try {
    await req.jwtVerify();
  } catch (err) {
    const decoded = decodeToken(token, req.server.jwt.options.key);
    if (!decoded) {
      reply.code(401).send({ ok: false, error: "unauthorized" });
      return;
    }
    req.user = { id: decoded.id, email: decoded.email };
  }
}
function decodeToken(token, _key) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payloadJson = Buffer.from(parts[1] ?? "", "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson);
    return { id: payload.id, email: payload.email };
  } catch {
    return null;
  }
}

// server/src/routes/auth.ts
import { z as z3 } from "zod";
import bcrypt from "bcryptjs";
var BCRYPT_COST = 10;
var RegisterBody = z3.object({
  email: z3.string().email().max(120),
  password: z3.string().min(8).max(120),
  name: z3.string().min(1).max(40)
});
var LoginBody = z3.object({
  email: z3.string().email(),
  password: z3.string().min(1)
});
async function authRoutes(app) {
  app.post("/register", async (req, reply) => {
    const parsed = RegisterBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid payload" });
    const { email, password, name } = parsed.data;
    const existing = await app.prisma.user.findUnique({ where: { email } });
    if (existing) return reply.code(409).send({ ok: false, error: "email already registered" });
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const user = await app.prisma.user.create({
      data: { email, passwordHash, name },
      select: { id: true, email: true, name: true, homeCity: true }
    });
    const token = await reply.jwtSign({ id: user.id, email: user.email });
    return { ok: true, token, user };
  });
  app.post("/login", async (req, reply) => {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid payload" });
    const { email, password } = parsed.data;
    const user = await app.prisma.user.findUnique({ where: { email } });
    if (!user) return reply.code(401).send({ ok: false, error: "invalid credentials" });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return reply.code(401).send({ ok: false, error: "invalid credentials" });
    const token = await reply.jwtSign({ id: user.id, email: user.email });
    return {
      ok: true,
      token,
      user: { id: user.id, email: user.email, name: user.name, homeCity: user.homeCity }
    };
  });
  app.get("/me", { preHandler: [requireAuth] }, async (req) => {
    const user = await app.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, homeCity: true, createdAt: true }
    });
    return { ok: true, user };
  });
}

// server/src/routes/trips.ts
import { z as z4 } from "zod";
var NewTrip = z4.object({
  destinationId: z4.string(),
  destinationName: z4.string(),
  emoji: z4.string(),
  startDate: z4.string(),
  endDate: z4.string(),
  totalBudget: z4.number().int().nonnegative(),
  planningMode: z4.enum(["planner", "delegator", "auto"]),
  members: z4.array(z4.object({ name: z4.string(), avatar: z4.string(), role: z4.enum(["owner", "member"]) })).optional(),
  title: z4.string().optional(),
  profile: z4.record(z4.unknown())
});
async function tripsRoutes(app) {
  app.get("/", { preHandler: [requireAuth] }, async (req) => {
    const trips = await app.prisma.trip.findMany({
      where: { ownerId: req.user.id },
      orderBy: [{ status: "asc" }, { startDate: "asc" }]
    });
    return { ok: true, trips };
  });
  app.get(
    "/:id",
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const trip = await app.prisma.trip.findFirst({
        where: { id: req.params.id, ownerId: req.user.id },
        include: {
          members: true,
          days: { include: { activities: { orderBy: { order: "asc" } } }, orderBy: { index: "asc" } },
          expenses: true,
          bookings: true,
          checklists: { include: { items: true } },
          journals: true,
          files: true
        }
      });
      if (!trip) return reply.code(404).send({ ok: false, error: "not found" });
      return { ok: true, trip };
    }
  );
  app.post("/", { preHandler: [requireAuth] }, async (req, reply) => {
    const parsed = NewTrip.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid payload" });
    const start = new Date(parsed.data.startDate);
    const end = new Date(parsed.data.endDate);
    const days = [];
    for (let d = new Date(start), i = 1; d <= end; d.setDate(d.getDate() + 1), i++) {
      days.push({
        date: d.toISOString().slice(0, 10),
        index: i,
        title: i === 1 ? "\u62B5\u8FBE" : i === Math.ceil((end.getTime() - start.getTime()) / 864e5) + 1 ? "\u56DE\u7A0B" : `\u7B2C ${i} \u5929`
      });
    }
    const trip = await app.prisma.trip.create({
      data: {
        ownerId: req.user.id,
        title: parsed.data.title ?? `${parsed.data.destinationName} ${(/* @__PURE__ */ new Date()).getFullYear()}`,
        destinationId: parsed.data.destinationId,
        destinationName: parsed.data.destinationName,
        emoji: parsed.data.emoji,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        status: "planning",
        planningMode: parsed.data.planningMode,
        totalBudget: parsed.data.totalBudget,
        profileJson: JSON.stringify(parsed.data.profile),
        members: parsed.data.members ? { create: parsed.data.members.map((m) => ({ name: m.name, avatar: m.avatar, role: m.role })) } : { create: [{ name: "\u6211", avatar: "\u{1F98A}", role: "owner" }] },
        days: { create: days }
      },
      include: { days: true, members: true }
    });
    return reply.code(201).send({ ok: true, trip });
  });
  app.delete(
    "/:id",
    { preHandler: [requireAuth] },
    async (req, _reply) => {
      await app.prisma.trip.deleteMany({ where: { id: req.params.id, ownerId: req.user.id } });
      return { ok: true };
    }
  );
}

// server/src/routes/state.ts
import bcrypt2 from "bcryptjs";
var ANON_KEY = "anon@trip-os.local";
async function stateRoutes(app) {
  app.post("/auth/anon", async (_req, reply) => {
    const cfg = effectiveConfig();
    const existing = await app.prisma.user.findUnique({ where: { email: ANON_KEY } });
    const user = existing ?? await app.prisma.user.create({
      data: {
        email: ANON_KEY,
        name: "Anonymous Traveler",
        passwordHash: bcrypt2.hashSync(`anon-${Math.random()}`, 8),
        homeCity: "\u4E0A\u6D77"
      }
    });
    const token = app.jwt.sign({ id: user.id, email: user.email });
    reply.setCookie("token", token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365
    });
    return {
      ok: true,
      token,
      user: { id: user.id, name: user.name, homeCity: user.homeCity },
      jwtSecretHint: cfg.jwtSecret.slice(0, 3) + "***"
    };
  });
  app.post("/auth/logout", async (_req, reply) => {
    reply.clearCookie("token", { path: "/" });
    return { ok: true };
  });
  app.get("/state", { preHandler: [requireAuth] }, async (req, _reply) => {
    const row = await app.prisma.userState.findUnique({ where: { userId: req.user.id } });
    if (!row) {
      return { ok: true, exists: false, json: null };
    }
    return { ok: true, exists: true, json: row.json, updatedAt: row.updatedAt };
  });
  app.put(
    "/state",
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const body = req.body ?? {};
      if (typeof body.json !== "string" || body.json.length > 4e6) {
        return reply.code(400).send({ ok: false, error: "json \u5B57\u6BB5\u7F3A\u5931\u6216\u8FC7\u5927" });
      }
      try {
        JSON.parse(body.json);
      } catch (e) {
        return reply.code(400).send({ ok: false, error: "json \u4E0D\u662F\u5408\u6CD5 JSON: " + e.message });
      }
      const row = await app.prisma.userState.upsert({
        where: { userId: req.user.id },
        update: { json: body.json },
        create: { userId: req.user.id, json: body.json }
      });
      return { ok: true, bytes: row.json.length, updatedAt: row.updatedAt };
    }
  );
  app.get("/state/health", async () => ({ ok: true, ts: Date.now() }));
}

// server/src/routes/health.ts
async function healthRoutes(app) {
  app.get("/health", async () => ({
    ok: true,
    service: "trip-os-server",
    version: "0.1.0",
    uptime: process.uptime(),
    runtime: {
      node: process.version,
      env: process.env.NODE_ENV ?? "unknown"
    },
    config: {
      databaseUrl: !!process.env.DATABASE_URL,
      jwtSecret: !!process.env.JWT_SECRET,
      aiApiKey: !!process.env.AI_API_KEY,
      aiBaseUrl: process.env.AI_BASE_URL ?? "(default)",
      aiModel: process.env.AI_MODEL ?? "(default)",
      kvBound: !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
      amapWebKey: !!process.env.AMAP_WEB_KEY
    }
  }));
}

// server/src/routes/config.ts
async function configRoutes(app) {
  app.get("/", async () => {
    const cfg = effectiveConfig();
    const overrides2 = getRuntimeConfig();
    return {
      ok: true,
      ai: {
        configured: !!cfg.ai.apiKey,
        provider: cfg.ai.providerLabel || null,
        model: cfg.ai.model,
        baseUrl: cfg.ai.baseUrl,
        apiKeyMasked: mask(cfg.ai.apiKey),
        source: overrides2.aiApiKey ? "runtime" : cfg.ai.apiKey ? "env" : null
      },
      amap: {
        configured: !!cfg.amapWebKey,
        keyMasked: mask(cfg.amapWebKey),
        source: overrides2.amapWebKey ? "runtime" : cfg.amapWebKey ? "env" : null,
        jsKeyConfigured: !!cfg.amapJsKey
      }
    };
  });
  app.post("/", async (req, reply) => {
    const parsed = ConfigSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "invalid config payload" });
    }
    const patch = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== void 0)
    );
    await setRuntimeConfig(patch);
    const cfg = effectiveConfig();
    return {
      ok: true,
      message: "\u914D\u7F6E\u5DF2\u66F4\u65B0\u5E76\u7ACB\u5373\u751F\u6548",
      ai: {
        configured: !!cfg.ai.apiKey,
        provider: cfg.ai.providerLabel || null,
        model: cfg.ai.model
      },
      amap: { configured: !!cfg.amapWebKey }
    };
  });
  app.post("/test", async (req, reply) => {
    const service = req.body?.service ?? "ai";
    const cfg = effectiveConfig();
    if (service === "ai") {
      if (!cfg.ai.apiKey) return reply.code(400).send({ ok: false, error: "AI Key \u672A\u914D\u7F6E" });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15e3);
      try {
        const res = await fetch(`${cfg.ai.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cfg.ai.apiKey}`
          },
          body: JSON.stringify({
            model: cfg.ai.model,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 5
          }),
          signal: controller.signal
        }).finally(() => clearTimeout(timer));
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return {
            ok: false,
            error: data?.error?.message ?? `\u6A21\u578B\u670D\u52A1\u8FD4\u56DE ${res.status}`
          };
        }
        return {
          ok: true,
          message: `\u8FDE\u63A5\u6210\u529F \xB7 ${cfg.ai.providerLabel || cfg.ai.baseUrl} \xB7 ${cfg.ai.model}`
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown";
        return { ok: false, error: msg.includes("abort") ? "\u8BF7\u6C42\u8D85\u65F6" : msg };
      }
    }
    if (service === "amap") {
      if (!cfg.amapWebKey) return reply.code(400).send({ ok: false, error: "\u9AD8\u5FB7 Key \u672A\u914D\u7F6E" });
      const url = new URL("https://restapi.amap.com/v3/geocode/geo");
      url.searchParams.set("key", cfg.amapWebKey);
      url.searchParams.set("address", "\u5317\u4EAC\u5E02\u671D\u9633\u533A");
      url.searchParams.set("output", "JSON");
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.status !== "1") {
          return { ok: false, error: data.info ?? "\u9AD8\u5FB7\u8FD4\u56DE\u9519\u8BEF" };
        }
        return { ok: true, message: "\u9AD8\u5FB7 Web \u670D\u52A1\u8FDE\u63A5\u6210\u529F" };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "unknown" };
      }
    }
    return reply.code(400).send({ ok: false, error: "unknown service" });
  });
  app.get("/presets", async () => ({
    ok: true,
    presets: [
      { label: "DeepSeek", providerLabel: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
      { label: "\u901A\u4E49\u5343\u95EE", providerLabel: "\u901A\u4E49\u5343\u95EE", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
      { label: "\u667A\u8C31 GLM", providerLabel: "\u667A\u8C31 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
      { label: "Kimi", providerLabel: "Kimi", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
      { label: "OpenRouter", providerLabel: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "anthropic/claude-3.5-sonnet" },
      { label: "OpenAI", providerLabel: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
      { label: "\u672C\u5730 Ollama", providerLabel: "\u672C\u5730\u6A21\u578B", baseUrl: "http://localhost:11434/v1", model: "qwen2.5:7b" }
    ]
  }));
  app.get("/amap-subkey", async (_req, reply) => {
    const cfg = effectiveConfig();
    if (!cfg.amapJsKey) {
      return reply.code(503).send({
        ok: false,
        error: "\u9AD8\u5FB7 JS API Key \u672A\u914D\u7F6E\uFF08\u8BF7\u5230 \u8BBE\u7F6E \u2192 \u670D\u52A1 \u586B\u5165\uFF09"
      });
    }
    const ts = Date.now();
    return {
      ok: true,
      key: cfg.amapJsKey,
      securityJsCode: cfg.amapSecurityKey || null,
      ts,
      hint: cfg.amapSecurityKey ? "\u5DF2\u914D\u7F6E\u5B89\u5168\u5BC6\u94A5" : "\u672A\u914D\u7F6E\u5B89\u5168\u5BC6\u94A5\uFF0CJS API \u4ECD\u53EF\u7528\u4F46\u6709\u6C34\u5370 / \u9650\u901F\u964D\u7EA7"
    };
  });
}

// server/src/routes/xhs.ts
import { z as z5 } from "zod";
function extractInitialState(html) {
  const m = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);
  if (!m || !m[1]) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}
function pickNote(state) {
  const note = state?.note?.noteCard ?? state?.note ?? state?.notes?.[0];
  if (note && (note.title || note.desc)) return note;
  const map = state?.noteDataMap ?? state?.noteData;
  if (map) {
    const first = Object.values(map)[0];
    const card = first?.noteCard ?? first;
    if (card?.title || card?.desc) return card;
  }
  return null;
}
async function xhsRoutes(app) {
  app.post("/parse", async (req, reply) => {
    const parsed = z5.object({ url: z5.string().url().max(2e3) }).safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "\u94FE\u63A5\u683C\u5F0F\u4E0D\u5BF9" });
    }
    const url = parsed.data.url;
    if (!/xiaohongshu\.com|xhslink\.com/i.test(url)) {
      return reply.code(400).send({ ok: false, error: "\u53EA\u652F\u6301\u5C0F\u7EA2\u4E66\u94FE\u63A5" });
    }
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "zh-CN,zh;q=0.9"
        },
        redirect: "follow"
      });
      if (!res.ok) {
        return reply.code(502).send({ ok: false, error: `\u5C0F\u7EA2\u4E66\u8FD4\u56DE ${res.status}\uFF0C\u53EF\u80FD\u88AB\u53CD\u722C\u62E6\u622A` });
      }
      const html = await res.text();
      const ogTitle = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1];
      const ogDesc = html.match(/<meta property="og:description" content="([^"]*)"/)?.[1];
      const state = extractInitialState(html);
      const note = state ? pickNote(state) : null;
      const title = note?.title?.trim() || ogTitle || "";
      const desc = note?.desc?.trim() || ogDesc || "";
      const tagList = note?.tagList ?? [];
      const locationTags = tagList.filter((t) => /location|地点|城市/.test(JSON.stringify(t))).map((t) => t.name || t.tagName || t.content || "").filter(Boolean);
      if (!title && !desc && !locationTags.length) {
        return reply.code(404).send({ ok: false, error: "\u6CA1\u89E3\u6790\u5230\u5185\u5BB9\uFF0C\u53EF\u80FD\u9700\u767B\u5F55\u6216\u9875\u9762\u7ED3\u6784\u53D8\u4E86\uFF0C\u8BF7\u624B\u52A8\u586B\u5730\u70B9\u540D" });
      }
      return {
        ok: true,
        title,
        desc: desc.slice(0, 500),
        locations: locationTags
      };
    } catch (e) {
      return reply.code(502).send({ ok: false, error: e instanceof Error ? e.message : "\u6293\u53D6\u5931\u8D25" });
    }
  });
  app.post("/parse-image", async (req, reply) => {
    const parsed = z5.object({ image: z5.string().min(50).max(12e6) }).safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "\u56FE\u7247\u6570\u636E\u65E0\u6548\uFF08\u9700 dataURL\uFF0C\u2264 ~9MB\uFF09" });
    }
    const cfg = effectiveConfig();
    if (!cfg.ai.apiKey) {
      return reply.code(503).send({ ok: false, error: "\u670D\u52A1\u5668\u672A\u914D\u7F6E AI\uFF08\u65E0\u6CD5\u8BC6\u522B\u56FE\u7247\uFF09" });
    }
    if (!/^data:image\//.test(parsed.data.image)) {
      return reply.code(400).send({ ok: false, error: "\u53EA\u63A5\u53D7\u56FE\u7247 dataURL" });
    }
    const system = '\u4F60\u662F\u65C5\u884C\u653B\u7565\u63D0\u53D6\u52A9\u624B\u3002\u7528\u6237\u4F1A\u7ED9\u4F60\u4E00\u5F20\u5C0F\u7EA2\u4E66\u7B14\u8BB0\u622A\u56FE\uFF08\u53EF\u80FD\u542B\u6807\u9898\u3001\u6B63\u6587\u3001\u5730\u70B9\u3001\u8DEF\u7EBF\uFF09\u3002\u8BF7\u63D0\u53D6\uFF1Atitle\uFF08\u7B14\u8BB0\u6807\u9898\uFF09\u3001desc\uFF08\u6B63\u6587\u8981\u70B9\uFF0C\u6700\u591A 300 \u5B57\uFF09\u3001locations\uFF08\u63D0\u5230\u7684\u5730\u70B9/\u57CE\u5E02\u540D\u6570\u7EC4\uFF0C\u5C3D\u91CF\u7528\u6807\u51C6\u5730\u540D\uFF09\u3002\u53EA\u8FD4\u56DE JSON\uFF1A{"title":string,"desc":string,"locations":string[]}\u3002\u770B\u4E0D\u6E05\u5C31\u5C3D\u529B\u800C\u4E3A\uFF0C\u4E0D\u8981\u7F16\u9020\u660E\u663E\u4E0D\u5B58\u5728\u7684\u5730\u70B9\u3002';
    const user = [
      { type: "text", text: "\u8BF7\u63D0\u53D6\u8FD9\u5F20\u653B\u7565\u7B14\u8BB0\u7684\u4FE1\u606F\uFF08\u53EA\u8FD4\u56DE JSON\uFF09\u3002" },
      { type: "image_url", image_url: { url: parsed.data.image } }
    ];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.ai.timeoutMs);
    try {
      const upstream = await fetch(`${cfg.ai.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.ai.apiKey}`
        },
        body: JSON.stringify({
          model: cfg.ai.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ],
          temperature: 0.2,
          max_tokens: 900,
          stream: false,
          response_format: { type: "json_object" }
        }),
        signal: controller.signal
      }).finally(() => clearTimeout(timer));
      const data = await upstream.json();
      if (!upstream.ok) {
        return reply.code(502).send({ ok: false, error: data?.error?.message ?? `upstream ${upstream.status}` });
      }
      const raw = data?.choices?.[0]?.message?.content ?? "";
      let out;
      try {
        out = JSON.parse(raw);
      } catch {
        return reply.code(502).send({ ok: false, error: "\u8BC6\u522B\u7ED3\u679C\u65E0\u6CD5\u89E3\u6790\uFF0C\u8BF7\u91CD\u8BD5\u6216\u6539\u7528\u94FE\u63A5" });
      }
      const title = String(out.title ?? "").trim();
      const desc = String(out.desc ?? "").trim().slice(0, 500);
      const locations = Array.isArray(out.locations) ? out.locations.map((x) => String(x).trim()).filter(Boolean) : [];
      if (!title && !desc && !locations.length) {
        return reply.code(422).send({ ok: false, error: "\u6CA1\u8BC6\u522B\u51FA\u5185\u5BB9\uFF0C\u8BF7\u786E\u8BA4\u56FE\u7247\u6E05\u6670\u6216\u6539\u7528\u94FE\u63A5" });
      }
      return { ok: true, title, desc, locations };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "\u8BC6\u522B\u5931\u8D25";
      const code = msg.includes("abort") ? 504 : 502;
      return reply.code(code).send({ ok: false, error: msg });
    }
  });
  app.post("/parse-text", async (req, reply) => {
    const parsed = z5.object({ text: z5.string().min(1).max(2e4) }).safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "\u6587\u672C\u4E3A\u7A7A\u6216\u8FC7\u957F\uFF08\u2264 2 \u4E07\u5B57\uFF09" });
    }
    const cfg = effectiveConfig();
    if (!cfg.ai.apiKey) {
      return reply.code(503).send({ ok: false, error: "\u670D\u52A1\u5668\u672A\u914D\u7F6E AI" });
    }
    const system = '\u4F60\u662F\u65C5\u884C\u653B\u7565\u63D0\u53D6\u52A9\u624B\u3002\u7528\u6237\u4F1A\u7C98\u8D34\u4E00\u6BB5\u653B\u7565\u6587\u672C\uFF08\u53EF\u80FD\u542B\u6807\u9898\u3001\u6B63\u6587\u3001\u5730\u70B9\u3001\u8DEF\u7EBF\uFF09\u3002\u8BF7\u63D0\u53D6\uFF1Atitle\uFF08\u6807\u9898\uFF09\u3001desc\uFF08\u6B63\u6587\u8981\u70B9\uFF0C\u6700\u591A 300 \u5B57\uFF09\u3001locations\uFF08\u5730\u70B9/\u57CE\u5E02\u540D\u6570\u7EC4\uFF0C\u5C3D\u91CF\u7528\u6807\u51C6\u5730\u540D\uFF09\u3002\u53EA\u8FD4\u56DE JSON\uFF1A{"title":string,"desc":string,"locations":string[]}\u3002\u4E0D\u8981\u7F16\u9020\u660E\u663E\u4E0D\u5B58\u5728\u7684\u5730\u70B9\u3002';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.ai.timeoutMs);
    try {
      const upstream = await fetch(`${cfg.ai.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.ai.apiKey}`
        },
        body: JSON.stringify({
          model: cfg.ai.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: parsed.data.text }
          ],
          temperature: 0.2,
          max_tokens: 900,
          stream: false,
          response_format: { type: "json_object" }
        }),
        signal: controller.signal
      }).finally(() => clearTimeout(timer));
      const data = await upstream.json();
      if (!upstream.ok) {
        return reply.code(502).send({ ok: false, error: data?.error?.message ?? `upstream ${upstream.status}` });
      }
      const raw = data?.choices?.[0]?.message?.content ?? "";
      let out;
      try {
        out = JSON.parse(raw);
      } catch {
        return reply.code(502).send({ ok: false, error: "\u8BC6\u522B\u7ED3\u679C\u65E0\u6CD5\u89E3\u6790\uFF0C\u8BF7\u91CD\u8BD5" });
      }
      const title = String(out.title ?? "").trim();
      const desc = String(out.desc ?? "").trim().slice(0, 500);
      const locations = Array.isArray(out.locations) ? out.locations.map((x) => String(x).trim()).filter(Boolean) : [];
      if (!title && !desc && !locations.length) {
        return reply.code(422).send({ ok: false, error: "\u6CA1\u63D0\u53D6\u5230\u5185\u5BB9\uFF0C\u8BF7\u68C0\u67E5\u6587\u672C" });
      }
      return { ok: true, title, desc, locations };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "\u8BC6\u522B\u5931\u8D25";
      const code = msg.includes("abort") ? 504 : 502;
      return reply.code(code).send({ ok: false, error: msg });
    }
  });
}

// server/src/app.ts
async function createApp() {
  await ensureConfigLoaded().catch((err) => {
    console.error("[createApp] \u8FD0\u884C\u65F6\u914D\u7F6E\u52A0\u8F7D\u5931\u8D25\uFF0C\u7EE7\u7EED\u4F7F\u7528\u73AF\u5883\u53D8\u91CF\u9ED8\u8BA4\u503C:", err);
  });
  const prismaMod = await import("@prisma/client");
  const PrismaClientCtor = prismaMod.PrismaClient ?? prismaMod.default?.PrismaClient;
  if (!PrismaClientCtor) {
    throw new Error("@prisma/client \u672A\u6B63\u786E\u751F\u6210\uFF1A\u8BF7\u786E\u8BA4\u90E8\u7F72\u9636\u6BB5\u5DF2\u6267\u884C prisma generate");
  }
  const prisma = new PrismaClientCtor();
  const app = Fastify({
    logger: { level: env.nodeEnv === "production" ? "info" : "debug" },
    // Vercel 等 serverless 环境里不要因为 keep-alive 超时就退出
    requestTimeout: 3e4,
    // 小红书图片以 base64 上传，默认 1MB 不够，放宽到 12MB
    bodyLimit: 12 * 1024 * 1024
  });
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || env.corsOrigins.includes(origin)) {
        cb(null, true);
        return;
      }
      cb(null, false);
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  });
  await app.register(cookie);
  await app.register(jwt, { secret: env.jwtSecret });
  app.decorate("prisma", prisma);
  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });
  await app.register(healthRoutes, { prefix: "/api" });
  await app.register(configRoutes, { prefix: "/api/config" });
  await app.register(aiRoutes, { prefix: "/api/ai" });
  await app.register(mapRoutes, { prefix: "/api/map" });
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(tripsRoutes, { prefix: "/api/trips" });
  await app.register(stateRoutes, { prefix: "/api" });
  await app.register(xhsRoutes, { prefix: "/api/xhs" });
  if (env.nodeEnv === "production") {
    const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
    if (fs.existsSync(distDir)) {
      await app.register(fastifyStatic, { root: distDir, prefix: "/", wildcard: false });
      app.setNotFoundHandler((req, reply) => {
        if (req.method === "GET" && !req.url.startsWith("/api")) {
          return reply.sendFile("index.html");
        }
        return reply.code(404).send({ ok: false, error: "Not Found" });
      });
    } else {
      app.log.warn(`[createApp] \u751F\u4EA7\u6A21\u5F0F\u4F46\u672A\u627E\u5230\u9759\u6001\u76EE\u5F55 ${distDir}\uFF0C\u4EC5\u63D0\u4F9B API`);
    }
  }
  app.setErrorHandler((err, _req, reply) => {
    app.log.error(err);
    const status = err.statusCode ?? 500;
    reply.status(status).send({
      ok: false,
      error: err.message
    });
  });
  return app;
}

// api-src/[...path].ts
process.on("unhandledRejection", (reason) => {
  console.error("[trip-os] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[trip-os] uncaughtException:", err);
});
var tripOsGlobal = globalThis;
var APP_STAMP = "catch-all-inject-2026-09-17a";
async function getApp() {
  if (tripOsGlobal.__tripOsApp) return tripOsGlobal.__tripOsApp;
  if (!tripOsGlobal.__tripOsAppReady) {
    tripOsGlobal.__tripOsAppReady = (async () => {
      try {
        const app = await createApp();
        await app.ready();
        tripOsGlobal.__tripOsApp = app;
        return app;
      } catch (err) {
        tripOsGlobal.__tripOsAppReady = void 0;
        throw err;
      }
    })();
  }
  return tripOsGlobal.__tripOsAppReady;
}
async function handler(req, res) {
  if ((req.url ?? "").split("?")[0] === "/api/__v") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, stamp: APP_STAMP, node: process.version, time: Date.now() }));
    return;
  }
  try {
    const app = await getApp();
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const payload = chunks.length ? Buffer.concat(chunks) : void 0;
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === void 0) continue;
      headers[key] = value;
    }
    const reply = await app.inject({
      method: req.method ?? "GET",
      url: req.url ?? "/",
      headers,
      payload
    });
    res.statusCode = reply.statusCode;
    for (const [key, value] of Object.entries(reply.headers)) {
      if (value === void 0) continue;
      res.setHeader(key, value);
    }
    res.end(reply.rawPayload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : void 0;
    console.error("[trip-os] handler error:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
    }
    res.end(JSON.stringify({ ok: false, stamp: APP_STAMP, error: message, stack }));
  }
}
export {
  handler as default
};
