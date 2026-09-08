import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Field, Input, Select, Tag, toast } from '@/components/ui';

interface ConfigStatus {
  ai: {
    configured: boolean;
    provider: string | null;
    model: string | null;
    baseUrl: string | null;
    apiKeyMasked: string | null;
    source: 'runtime' | 'env' | null;
  };
  amap: {
    configured: boolean;
    keyMasked: string | null;
    source: 'runtime' | 'env' | null;
    jsKeyConfigured: boolean;
  };
}

interface Preset {
  label: string;
  providerLabel: string;
  baseUrl: string;
  model: string;
}

const PRESETS: Preset[] = [
  { label: 'DeepSeek', providerLabel: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { label: '通义千问', providerLabel: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { label: '智谱 GLM', providerLabel: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { label: 'Kimi', providerLabel: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { label: 'OpenRouter', providerLabel: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-3.5-sonnet' },
  { label: 'OpenAI', providerLabel: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: '本地 Ollama', providerLabel: '本地模型', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b' },
];

export function ApiKeyCard() {
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<'ai' | 'amap' | null>(null);

  const [aiKey, setAiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com');
  const [model, setModel] = useState('deepseek-chat');
  const [amapKey, setAmapKey] = useState('');
  const [amapJsKey, setAmapJsKey] = useState('');
  const [amapSecurityKey, setAmapSecurityKey] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/config');
      const data = (await res.json()) as ConfigStatus;
      setStatus(data);
      if (data.ai.baseUrl) setBaseUrl(data.ai.baseUrl);
      if (data.ai.model) setModel(data.ai.model);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const parseConfigRes = async (
    res: Response,
  ): Promise<{ ok: boolean; message?: string; error?: string }> => {
    const text = await res.text();
    if (!text.trim()) {
      return { ok: false, error: `服务返回空响应 (HTTP ${res.status})` };
    }
    try {
      const data = JSON.parse(text) as { ok?: boolean; message?: string; error?: string };
      if (data.ok === false) {
        return { ok: false, error: data.error ?? `请求失败 (HTTP ${res.status})` };
      }
      return { ok: data.ok ?? res.ok, message: data.message, error: data.error };
    } catch {
      // 后端/代理返回了 HTML 或纯文本错误，把前几字拿给用户看
      const preview = text.slice(0, 120).replace(/\s+/g, ' ').trim();
      return {
        ok: false,
        error: `服务器返回非 JSON 响应 (HTTP ${res.status}): ${preview || '无内容'}`,
      };
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiApiKey: aiKey || undefined,
          aiBaseUrl: baseUrl || undefined,
          aiModel: model || undefined,
          amapWebKey: amapKey || undefined,
          amapJsKey: amapJsKey || undefined,
          amapSecurityKey: amapSecurityKey || undefined,
        }),
      });
      const data = await parseConfigRes(res);
      if (!data.ok) throw new Error(data.error ?? '保存失败');
      toast('已保存并立即生效', 'good');
      setAiKey('');
      setAmapKey('');
      setAmapJsKey('');
      setAmapSecurityKey('');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : '保存失败', 'warn');
    } finally {
      setSaving(false);
    }
  };

  const test = async (service: 'ai' | 'amap') => {
    setTesting(service);
    try {
      const res = await fetch('/api/config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service }),
      });
      const data = await parseConfigRes(res);
      if (data.ok) toast(data.message ?? '连接成功', 'good');
      else toast(data.error ?? '连接失败', 'warn');
    } catch (err) {
      toast(err instanceof Error ? err.message : '测试失败', 'warn');
    } finally {
      setTesting(null);
    }
  };

  const applyPreset = (label: string) => {
    const p = PRESETS.find((x) => x.label === label);
    if (!p) return;
    setBaseUrl(p.baseUrl);
    setModel(p.model);
  };

  const aiOn = status?.ai.configured ?? false;
  const amapOn = status?.amap.configured ?? false;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="h3">API 密钥</p>
          <p className="muted mt-0.5">
            填完点保存就生效，不用重启服务。密钥只存在你自己的后端，浏览器拿不到完整值。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {loading ? (
            <Tag tone="gray">检测中…</Tag>
          ) : (
            <>
              <Tag tone={aiOn ? 'moss' : 'amber'}>{aiOn ? '模型已接入' : '模型未接入'}</Tag>
              <Tag tone={amapOn ? 'moss' : 'gray'}>{amapOn ? '高德已接入' : '高德未接入'}</Tag>
            </>
          )}
        </div>
      </div>

      {status && (aiOn || amapOn) && (
        <div className="mt-3 space-y-1 rounded-xl border-[1.5px] border-ink/12 bg-paperDeep px-3 py-2.5 text-[11.5px]">
          {aiOn && (
            <p className="flex flex-wrap items-center gap-1.5">
              <span className="text-inkSoft">模型</span>
              <code className="font-mono">{status.ai.provider}</code>
              <code className="font-mono text-inkFaint">{status.ai.model}</code>
              <code className="font-mono text-inkFaint">{status.ai.apiKeyMasked}</code>
              <Tag tone={status.ai.source === 'runtime' ? 'violet' : 'gray'}>
                {status.ai.source === 'runtime' ? '界面配置' : '.env'}
              </Tag>
            </p>
          )}
          {amapOn && (
            <p className="flex flex-wrap items-center gap-1.5">
              <span className="text-inkSoft">高德</span>
              <code className="font-mono">{status.amap.keyMasked}</code>
              <Tag tone={status.amap.source === 'runtime' ? 'violet' : 'gray'}>
                {status.amap.source === 'runtime' ? '界面配置' : '.env'}
              </Tag>
            </p>
          )}
        </div>
      )}

      <div className="mt-4 space-y-3.5">
        <Field label="服务商" hint="选一个会自动填好地址和模型名，也可以自己改">
          <Select onChange={(e) => applyPreset(e.target.value)} defaultValue="">
            <option value="">— 选择服务商 —</option>
            {PRESETS.map((p) => (
              <option key={p.label} value={p.label}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="模型 API Key" hint={aiOn ? `已配置（${status?.ai.apiKeyMasked}），留空表示不改动` : '填进去立刻生效，也可以随时清空'}>
          <Input
            type="password"
            value={aiKey}
            onChange={(e) => setAiKey(e.target.value)}
            placeholder={aiOn ? '••••••（已保存）' : 'sk-...'}
            autoComplete="off"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="接口地址">
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com" />
          </Field>
          <Field label="模型名">
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="deepseek-chat" />
          </Field>
        </div>

        <Field
          label="高德地图 Key（Web 服务）"
          hint="高德控制台创建 Key 时勾「Web 服务」平台。用于地理编码和路径规划"
        >
          <Input
            type="password"
            value={amapKey}
            onChange={(e) => setAmapKey(e.target.value)}
            placeholder={amapOn ? '••••••（已保存）' : '粘贴高德 Key'}
            autoComplete="off"
          />
        </Field>

        <Field
          label="高德 JS API Key"
          hint="控制台创建 Key 时勾「Web 端 (JS API)」，并把当前域名加到白名单。给浏览器地图组件用"
        >
          <Input
            type="password"
            value={amapJsKey}
            onChange={(e) => setAmapJsKey(e.target.value)}
            placeholder={status?.amap.jsKeyConfigured ? '••••••（已保存）' : '粘贴 JS API Key'}
            autoComplete="off"
          />
        </Field>

        <Field
          label="高德安全密钥"
          hint="控制台「安全密钥」页生成。填此项之后，浏览器只会拿到一份 1 小时内有效的 sub-token，永远拿不到原密钥。"
        >
          <Input
            type="password"
            value={amapSecurityKey}
            onChange={(e) => setAmapSecurityKey(e.target.value)}
            placeholder="粘贴安全密钥（选填，但强烈建议）"
            autoComplete="off"
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </Button>
        <Button onClick={() => test('ai')} disabled={testing !== null || !aiOn}>
          {testing === 'ai' ? '测试中…' : '测试模型连接'}
        </Button>
        <Button onClick={() => test('amap')} disabled={testing !== null || !amapOn}>
          {testing === 'amap' ? '测试中…' : '测试高德连接'}
        </Button>
      </div>

      <details className="mt-4 rounded-xl border-[1.5px] border-ink/12 px-3.5 py-2.5">
        <summary className="focus-ring cursor-pointer text-[12.5px] font-bold">
          也可以写在 server/.env 里
        </summary>
        <div className="mt-2 space-y-2 text-[11.5px] leading-relaxed text-inkSoft">
          <p>界面配置会自动保存到 server/.runtime-config.json，刷新页面 / 重启服务后仍然有效，优先级高于 .env。想长期固定，也可以写进文件：</p>
          <pre className="overflow-x-auto rounded-lg bg-paperDeep px-3 py-2 font-mono text-[11px] text-ink">
{`AI_API_KEY=sk-xxx
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat
AMAP_WEB_KEY=你的高德Web服务Key
AMAP_JS_KEY=你的高德JS API Key
AMAP_SECURITY_KEY=你的安全密钥`}
          </pre>
          <p className="text-inkFaint">
            server/.runtime-config.json 已加入 .gitignore，不会提交到仓库。
          </p>
        </div>
      </details>
    </Card>
  );
}
