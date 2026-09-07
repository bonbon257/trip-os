import { parseIntent, routeForIntent, type AppContext, type IntentType } from '@/utils/parseIntent';
import { matchCitiesInText } from '@/data/cityAlias';
import { matchCountryInText } from '@/data/countries';

const checks: { label: string; ok: boolean; detail?: string }[] = [];
const assert = (label: string, ok: boolean, detail = '') => checks.push({ label, ok, detail });

function expect(
  input: string,
  want: { context?: AppContext; intent?: IntentType; city?: string; country?: string },
) {
  const p = parseIntent(input);
  const route = routeForIntent(p);
  let ok = true;
  const parts: string[] = [];
  if (want.context) {
    const got = p.context;
    ok = ok && got === want.context;
    parts.push(`ctx=${got}${got === want.context ? '' : `(期望${want.context})`}`);
  }
  if (want.intent) {
    const got = p.intent;
    ok = ok && got === want.intent;
    parts.push(`intent=${got}${got === want.intent ? '' : `(期望${want.intent})`}`);
  }
  if (want.city) {
    const got = p.entities.city?.name ?? '无';
    ok = ok && got === want.city;
    parts.push(`city=${got}${got === want.city ? '' : `(期望${want.city})`}`);
  }
  if (want.country) {
    const got = p.entities.country ?? '无';
    ok = ok && got === want.country;
    parts.push(`country=${got}${got === want.country ? '' : `(期望${want.country})`}`);
  }
  assert(input, ok, `${parts.join(' ')} → ${route}`);
}

// ── 实体识别：这是旧实现的致命伤 ───────────────────────────
assert('「北京」能识别为城市（旧实现识别不出）', matchCitiesInText('北京有什么好玩的').length > 0,
  matchCitiesInText('北京有什么好玩的').map((c) => c.name).join(',') || '无');
assert('「北京」命中的是北京市', matchCitiesInText('北京有什么好玩的')[0]?.name === '北京',
  matchCitiesInText('北京有什么好玩的')[0]?.name ?? '无');
assert('「上海」能识别为城市', matchCitiesInText('上海周末去哪')[0]?.name === '上海',
  matchCitiesInText('上海周末去哪')[0]?.name ?? '无');
assert('「广州北京路」不误判为北京市',
  matchCitiesInText('广州北京路好吃吗').every((c) => c.name !== '北京'),
  matchCitiesInText('广州北京路好吃吗').map((c) => c.name).join(','));
assert('「南京路」不误判为南京市',
  matchCitiesInText('南京路步行街').every((c) => c.name !== '南京'),
  matchCitiesInText('南京路步行街').map((c) => c.name).join(','));
assert('普通城市仍可识别', matchCitiesInText('想去大理')[0]?.name === '大理',
  matchCitiesInText('想去大理')[0]?.name ?? '无');
assert('海外城市可识别', matchCitiesInText('去东京玩')[0]?.name === '东京',
  matchCitiesInText('去东京玩')[0]?.name ?? '无');

// 国家
assert('识别国家：日本', matchCountryInText('下个月想去日本')?.country === '日本',
  matchCountryInText('下个月想去日本')?.country ?? '无');
assert('日本展开出城市候选', (matchCountryInText('想去日本')?.cities.length ?? 0) >= 3,
  `${matchCountryInText('想去日本')?.cities.map((c) => c.name).join(',')}`);
assert('「中国」不作为国家实体', matchCountryInText('国内去哪玩') === null);

// ── 六条验收场景 ────────────────────────────────────────────
expect('我下个月想去日本，但不知道去哪', {
  context: 'TRAVEL',
  intent: 'DESTINATION_DISCOVERY',
  country: '日本',
});
expect('我已经决定去北京了，帮我看看北京有什么好玩的', {
  context: 'TRAVEL',
  intent: 'ACTIVITY_DISCOVERY',
  city: '北京',
});
expect('这周末不想太累', { context: 'WEEKEND', intent: 'WEEKEND_DISCOVERY' });
expect('今晚想吃点不一样的', { context: 'NOW', intent: 'FOOD_DISCOVERY' });
expect('深圳有哪些著名商圈？随机给我一个', { context: 'WEEKEND', intent: 'AREA_DISCOVERY' });

// 附加回归
expect('下个月想出门，但不知道去哪', { context: 'TRAVEL', intent: 'DESTINATION_DISCOVERY' });
expect('大理和丽江选哪个', { context: 'TRAVEL', intent: 'DESTINATION_COMPARE' });
expect('这周末去哪比较合适', { context: 'WEEKEND', intent: 'WEEKEND_DISCOVERY' });
expect('附近有什么好玩的', { intent: 'NEARBY_DISCOVERY' });
expect('周末和朋友出去玩', { context: 'WEEKEND' });

// 约束抽取
{
  const p = parseIntent('这周末不想太累');
  assert('低强度约束被抽取', p.constraints.intensity === 'low', String(p.constraints.intensity));
}
{
  const p = parseIntent('周末和女朋友出去');
  assert('同行人被抽取（情侣）', p.constraints.companion === 'couple', String(p.constraints.companion));
}
{
  const p = parseIntent('今晚想吃点不一样的');
  assert('时间被抽取（今晚）', p.time?.kind === 'tonight', String(p.time?.kind));
}

// 澄清：说不清时必须要求澄清，不能硬跳
{
  const p = parseIntent('随便');
  assert('无实体无语境 → 需要澄清', p.needsClarify === true, `conf=${p.confidence.toFixed(2)}`);
  assert('澄清时给出问题', !!p.clarifyQuestion, p.clarifyQuestion ?? '无');
}

// 路由不允许落到杭州（旧实现的典型错误）
{
  const routes = [
    '我下个月想去日本，但不知道去哪',
    '我已经决定去北京了',
    '这周末不想太累',
  ].map((s) => routeForIntent(parseIntent(s)));
  assert('路由不含 hangzhou（不再硬跳杭州）', !routes.some((r) => r.includes('hangzhou')), routes.join(' | '));
}

// ── 输出 ────────────────────────────────────────────────────
let failed = 0;
for (const c of checks) {
  if (c.ok) console.log(`PASS  ${c.label}${c.detail ? `  · ${c.detail}` : ''}`);
  else {
    failed++;
    console.log(`FAIL  ${c.label}${c.detail ? `  · ${c.detail}` : ''}`);
  }
}
console.log(`\n${checks.length - failed}/${checks.length} parse-intent checks ok`);
if (failed) process.exit(1);
