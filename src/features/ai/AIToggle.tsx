import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/services/store';
import { llmStatus, type LLMStatus } from '@/services/llm';
import { Button, Modal, cx, toast } from '@/components/ui';

const SNIPPET = `AI_API_KEY=sk-你的key
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat`;

/**
 * AI 辅助开关 —— 「按需调用」的入口
 * ────────────────────────────────────────────────────────────
 * 默认关闭：所有功能走本地规则引擎，零网络请求。
 * 只有用户主动点亮，才会在需要时调用模型。
 * 未接入模型时点击会给出指引，而不是静默失败。
 */
export function AIToggle({ className }: { className?: string }) {
  const aiAssist = useStore((s) => s.settings.aiAssist);
  const useLLM = useStore((s) => s.settings.useLLM);
  const setSetting = useStore((s) => s.updateSettings);
  const [status, setStatus] = useState<LLMStatus | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    llmStatus().then(setStatus);
  }, []);

  const on = aiAssist && useLLM;

  const toggle = async () => {
    if (on) {
      setSetting({ aiAssist: false });
      return;
    }
    if (!useLLM) {
      toast('模型调用已在设置里关闭', 'warn');
      return;
    }
    const st = await llmStatus(true);
    setStatus(st);
    if (!st.enabled) {
      setGuideOpen(true);
      return;
    }
    setSetting({ aiAssist: true });
    toast(`已开启：${st.provider} · ${st.model}`, 'good');
  };

  return (
    <>
    <button
      type="button"
      onClick={toggle}
      title={
        on
          ? '模型已开启：理解不了的话会问模型，改动说明也会润色'
          : '未开启：全部走本地规则，不产生请求'
      }
      className={cx(
        'focus-ring inline-flex shrink-0 items-center gap-1 rounded-full border-[1.5px] px-2.5 py-1.5 text-[11.5px] font-bold transition',
        on
          ? 'border-violet bg-violet/20 text-ink'
          : 'border-ink/15 bg-white text-inkFaint hover:border-ink/40 hover:text-ink',
        className,
      )}
    >
      <span className={cx('text-[12px] leading-none', on ? '' : 'grayscale')}>✨</span>
      {on ? (status?.provider ?? 'AI') : '本地'}
    </button>
    <LLMGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  );
}

/** 还没接入模型时，直接把接法摊开给用户看，而不是只弹一句提示 */
export function LLMGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SNIPPET);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('复制失败，手动选中下面的文本', 'warn');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="接入一个模型（可跳过）"
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => navigate('/settings')}>
            去设置页
          </Button>
          <Button variant="primary" onClick={onClose}>
            知道了
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <p className="muted">
          不接入也能用全部功能。接入只是让 AI 能听懂更复杂的句子，比如「我妈腿不好，走不了太多路」。
        </p>

        <div className="rounded-xl border-[1.5px] border-ink/12 bg-paperDeep p-3.5">
          <p className="text-[12.5px] font-bold">第 1 步 · 在项目根目录创建 .env.local</p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-white px-3 py-2 font-mono text-[11px] leading-relaxed">
{SNIPPET}
          </pre>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={copy}>
              {copied ? '已复制' : '复制'}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border-[1.5px] border-ink/12 px-3.5 py-3">
          <p className="text-[12.5px] font-bold">第 2 步 · 重启服务</p>
          <pre className="mt-1.5 overflow-x-auto rounded-lg bg-paperDeep px-3 py-2 font-mono text-[11px]">
{ './scripts/dev.sh restart' }
          </pre>
        </div>

        <p className="text-[11.5px] leading-relaxed text-inkSoft">
          <b>换服务商</b>：改 <code>AI_BASE_URL</code> 和 <code>AI_MODEL</code> 两行即可，代码不用动。
          DeepSeek / 通义 / 智谱 / Kimi / OpenRouter / 本地 Ollama / OpenAI 都能接，
          完整地址列表在项目的 <code>.env.example</code> 里。
        </p>
        <p className="text-[11.5px] text-inkFaint">
          密钥只存在本地，走 <code>/api/ai</code> 代理转发，浏览器拿不到。
        </p>
      </div>
    </Modal>
  );
}

/** 给页面用的便捷 hook：返回这一句话是否应该调用模型 */
export function useAIFlag(): boolean {
  const aiAssist = useStore((s) => s.settings.aiAssist);
  const useLLM = useStore((s) => s.settings.useLLM);
  return aiAssist && useLLM;
}
