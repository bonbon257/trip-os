import { detectScene, detectWeekendMode, detectTravelMode, detectEnergy, intentRoute } from '@/utils/intent';

const checks: { label: string; ok: boolean; detail?: string }[] = [];
const assert = (label: string, ok: boolean, detail?: string) => checks.push({ label, ok, detail });

// 场景识别
assert('周末场景', detectScene('这周末想出去') === 'weekend');
assert('旅行场景', detectScene('下个月想去日本') === 'travel');
assert('今晚算周末', detectScene('今晚想吃点不一样的') === 'weekend');
assert('说不清场景', detectScene('随便去哪') === null);

// 周末模式
assert('活动模式：咖啡', detectWeekendMode('想喝咖啡') === 'activity');
assert('地点模式：公园', detectWeekendMode('想去公园') === 'place');
assert('附近模式', detectWeekendMode('附近有什么') === 'nearby');
assert('收藏模式', detectWeekendMode('从收藏里挑') === 'saved');
assert('默认地点模式', detectWeekendMode('这周末想出去') === 'place');

// 旅行模式
assert('不知道去哪', detectTravelMode('不知道去哪') === 'unknown');
assert('对比模式', detectTravelMode('京都和大阪怎么选') === 'compare');
assert('随机模式', detectTravelMode('随便抽一个') === 'random');
assert('已决定模式', detectTravelMode('已经决定去北京') === 'decided');

// 能量
assert('想近/轻松', detectEnergy('不想太累') === 'near');
assert('想远/没去过', detectEnergy('想去远点没去过') === 'far');
assert('无能量', detectEnergy('随便') === null);

// 路由 href
const w = intentRoute('这周末想出去，但不想太累');
assert('周末近处路由到 /weekend', w.href.startsWith('/weekend?'), w.href);
assert('周末近处 mode=place', w.href.includes('mode=place'), w.href);
assert('周末近处 energy=near', w.href.includes('energy=near'), w.href);

const t = intentRoute('下个月想去日本，但不知道去哪');
assert('提到日本直接路由到 /destinations', t.href.startsWith('/destinations?'), t.href);

const beijing = intentRoute('下个月想去北京旅游');
assert('提到北京直接路由到 /destinations', beijing.href.startsWith('/destinations?'), beijing.href);

const vague = intentRoute('下个月想出门，但不知道去哪');
assert('没有目的地才路由到 /quiz', vague.href.startsWith('/quiz?'), vague.href);

const a = intentRoute('今晚想吃点不一样的');
assert('今晚路由到周末活动', a.href.startsWith('/weekend?mode=activity'), a.href);

const fallback = intentRoute('随便走走');
assert('分不清时回落 /discover', fallback.href.startsWith('/discover?'), fallback.href);

const ok = checks.filter((c) => c.ok).length;
console.log(`\n${ok}/${checks.length} intent checks ok`);
checks.forEach((c) => console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.detail ? '  · ' + c.detail : ''}`));
if (ok !== checks.length) process.exit(1);
