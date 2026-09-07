import { destinationsInText, inferTravelScope, inferOrigin } from '@/utils/queryIntent';

const checks: { label: string; ok: boolean; detail?: string }[] = [];
const assert = (label: string, ok: boolean, detail?: string) => checks.push({ label, ok, detail });

// destinationsInText
const d1 = destinationsInText('大理和丽江哪个好');
assert('从文本挑出大理+丽江', d1.length >= 2 && d1.some((d) => d.name === '大理') && d1.some((d) => d.name === '丽江'), d1.map((d) => d.name).join(','));

const d2 = destinationsInText('下个月去东京');
assert('从文本挑出东京', d2.some((d) => d.name === '东京'), d2.map((d) => d.name).join(','));

const d3 = destinationsInText('随便走走');
assert('无目的地时返回空', d3.length === 0);

// inferTravelScope
assert('海外关键词→international', inferTravelScope('想去日本玩') === 'international');
assert('国内关键词→domestic', inferTravelScope('国内周边游') === 'domestic');
assert('无范围→null', inferTravelScope('这周末想出去') === null);

// inferOrigin
assert('从文本推断出发地上海', inferOrigin('从上海出发去东京') === '上海');
assert('无出发地→null', inferOrigin('去东京') === null);

const ok = checks.filter((c) => c.ok).length;
console.log(`\n${ok}/${checks.length} query-intent checks ok`);
checks.forEach((c) => console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.detail ? '  · ' + c.detail : ''}`));
if (ok !== checks.length) process.exit(1);
