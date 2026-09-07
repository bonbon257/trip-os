/**
 * 从自由文本里抽取「决策意图」需要的实体 —— 不调 LLM，纯关键词/名称匹配。
 *
 * 用于把首页输入框的 ?q= 接到各个决策页：
 *   · 旅游「对比 / 已经决定」页 → 从文本里挑出目的地
 *   · 测评页 → 推断出发地 / 范围
 *   · 抽签页 → 推断国内 / 海外范围
 *
 * 匹配不到就返回空（调用方必须优雅降级，不能因为识别不到就卡住）。
 */
import { fullDestinationPool } from '@/services/recommendation';
import { ORIGINS } from '@/data/taxonomy';
import type { Destination, DestinationScope } from '@/types';

let _pool: Destination[] | null = null;
function allDest(): Destination[] {
  if (!_pool) _pool = fullDestinationPool();
  return _pool;
}

/**
 * 从文本里挑出提到的目的地（按名称长度降序匹配，避免「大」误中「大理」）。
 * 最多返回 3 个，去重。
 */
export function destinationsInText(q: string): Destination[] {
  const text = q.trim();
  if (!text) return [];
  const list = allDest()
    .filter((d) => text.includes(d.name))
    // 同名长名优先（手工精修城市名通常更具体）
    .sort((a, b) => b.name.length - a.name.length);
  const seen = new Set<string>();
  const out: Destination[] = [];
  for (const d of list) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    out.push(d);
    if (out.length >= 3) break;
  }
  return out;
}

/** 推断旅行范围：海外 / 国内 / 无从文本判断 */
export function inferTravelScope(q: string): DestinationScope | null {
  const text = q.toLowerCase();
  if (/(海外|出国|国外|境外|去日本|去泰国|去韩国|欧洲|美洲|东南亚)/.test(text)) return 'international';
  if (/(国内|境内|周边游|省内)/.test(text)) return 'domestic';
  const matched = destinationsInText(q);
  if (matched.some((d) => d.scope === 'international')) return 'international';
  if (matched.length && matched.every((d) => d.scope === 'domestic')) return 'domestic';
  return null;
}

/** 从文本里推断出发城市（只匹配已知出发地列表，避免把目的地误当出发地） */
export function inferOrigin(q: string): string | null {
  const text = q.trim();
  if (!text) return null;
  for (const o of ORIGINS) {
    if (text.includes(o.name)) return o.name;
  }
  return null;
}
