import { recommend, fullDestinationPool } from '@/services/recommendation';
import type { QuizAnswers } from '@/types';

const pool = fullDestinationPool();
console.log('候选池总数:', pool.length);
console.log('  国内:', pool.filter((d) => d.scope === 'domestic').length);
console.log('  海外:', pool.filter((d) => d.scope === 'international').length);

const cases: [string, Partial<QuizAnswers>][] = [
  ['海岛躺平 · 高预算', { interests: ['island', 'chill', 'photo'], dislikes: ['rush'], pace: 'free', budget: 'b5', destinationScope: 'any', travelMood: 'tired', duration: 'd67', origin: '上海', companions: 'partner' }],
  ['西北自然 · 穷游', { interests: ['nature', 'outdoor', 'photo'], dislikes: ['highCost'], pace: 'balanced', budget: 'b2', destinationScope: 'domestic', travelMood: 'change', duration: 'd810', origin: '北京', companions: 'solo' }],
  ['古都人文 · 带娃', { interests: ['architecture', 'museum', 'food'], dislikes: ['earlyRise', 'rush'], pace: 'focused', budget: 'b3', destinationScope: 'domestic', travelMood: 'reward', duration: 'd45', origin: '上海', companions: 'family' }],
  ['咖啡小众 · 短假', { interests: ['coffee', 'niche', 'citywalk'], dislikes: ['crowds'], pace: 'focused', budget: 'b2', destinationScope: 'domestic', travelMood: 'alone', duration: 'd23', origin: '杭州', companions: 'solo' }],
  ['美食夜生活', { interests: ['food', 'nightlife', 'shopping'], dislikes: [], pace: 'intense', budget: 'b3', destinationScope: 'any', travelMood: 'energetic', duration: 'd45', origin: '广州', companions: 'friends' }],
  ['温泉滑雪 · 冬天', { interests: ['onsen', 'nature', 'photo'], dislikes: ['crowds'], pace: 'balanced', budget: 'b4', destinationScope: 'domestic', travelMood: 'reward', duration: 'd45', origin: '北京', companions: 'partner' }],
];

for (const [label, a] of cases) {
  const t0 = Date.now();
  const month = label.includes('冬天') ? 1 : 10;
  const recs = recommend(a as QuizAnswers, month, 3);
  const ms = Date.now() - t0;
  console.log('\n' + label + '  (' + ms + 'ms)');
  recs.forEach((r, i) => {
    const d = r.destination as unknown as { province?: string };
    console.log('  ' + (i + 1) + '. ' + r.destination.name + '(' + (d.province ?? '海外') + ') ' + r.score + '分 · ' + r.destination.tags.slice(0, 3).join('/'));
  });
}
