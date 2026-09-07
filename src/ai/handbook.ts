import type { Destination } from '@/types';
import { llmChat } from '@/services/llm';

/**
 * 决策阶段（还没有行程）的「问 AI 关于这里」入口。
 * 直调 llmChat 的 qa 模式，不依赖任何 trip，点按钮才发请求。
 * 返回 null 表示未接入模型 / 调用失败，调用方应回退到友好提示。
 */
export async function askDestinationQA(question: string, dest: Destination): Promise<string | null> {
  const months = (dest.bestSeasons ?? []).join('、') || '—';
  const system = [
    '你是 Trip OS 的旅行达人，正在帮助用户做「去之前」的决策与种草。',
    `当前关注目的地：${dest.name}（${dest.country}）。`,
    `一句话简介：${dest.summary}`,
    `亮点：${(dest.highlights ?? []).join('、')}`,
    `最佳季节：${months} 月`,
    `建议天数：${dest.idealDays.min}–${dest.idealDays.max} 天 · 整体强度：${dest.intensity}`,
    `注意事项：${(dest.cautions ?? []).join('；')}`,
    '',
    '用户会问：常见路线怎么走、要几天、为什么推荐、有什么坑、和别的地方比如何、适合什么人、某个具体地点值不值得去。',
    '回答要求：',
    ' · 中文、有信息量，80–200 字，列 2–4 条要点更清晰；',
    ' · 不要编造票价 / 时刻表 / 营业时间 / 官方规定等硬数据，用量词「通常 / 一般 / 建议」；',
    ' · 必要时引导去官方渠道或「小红书 / 马蜂窝」搜索具体信息（不强迫）；',
    ' · 像朋友聊天一样自然，不要列干巴巴的条目感。',
    '只输出纯文本回答，不要 JSON、不要加引号包裹。',
  ].join('\n');
  return llmChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: question },
    ],
    { temperature: 0.4, maxTokens: 600 },
  );
}
