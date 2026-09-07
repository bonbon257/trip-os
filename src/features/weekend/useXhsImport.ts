import { useCallback, useState } from 'react';

export interface XhsParsed {
  title: string;
  desc: string;
  locations: string[];
}

/**
 * 小红书链接导入：调后端 /api/xhs/parse，尽量抓出标题/正文/地点。
 * 解析出的文本交给页面用高德 POI 搜索真实坐标（不伪造）。
 */
export function useXhsImport() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<XhsParsed | null>(null);

  const parse = useCallback(async (url: string) => {
    const u = url.trim();
    if (!u) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/xhs/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string } & XhsParsed;
      if (!data.ok) {
        setError(data.error ?? '解析失败');
        setParsed(null);
        return;
      }
      setParsed({ title: data.title, desc: data.desc, locations: data.locations });
    } catch (e) {
      setError(e instanceof Error ? e.message : '网络错误');
      setParsed(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setParsed(null);
    setError(null);
  }, []);

  /** 图片（截图）识别：前端把图片转 dataURL 后调用后端多模态解析 */
  const parseImage = useCallback(async (dataUrl: string) => {
    if (!dataUrl) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/xhs/parse-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string } & XhsParsed;
      if (!data.ok) {
        setError(data.error ?? '识别失败');
        setParsed(null);
        return;
      }
      setParsed({ title: data.title, desc: data.desc, locations: data.locations });
    } catch (e) {
      setError(e instanceof Error ? e.message : '网络错误');
      setParsed(null);
    } finally {
      setLoading(false);
    }
  }, []);

  /** 攻略文本解析：用户粘贴整理好的攻略文字，后端 LLM 提取标题/地点 */
  const parseText = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/xhs/parse-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string } & XhsParsed;
      if (!data.ok) {
        setError(data.error ?? '识别失败');
        setParsed(null);
        return;
      }
      setParsed({ title: data.title, desc: data.desc, locations: data.locations });
    } catch (e) {
      setError(e instanceof Error ? e.message : '网络错误');
      setParsed(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, parsed, parse, parseImage, parseText, reset };
}
