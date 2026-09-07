import { getDestination } from '@/data/destinations';
console.log('杭州:', getDestination('cn-330100')?.name);
console.log('东京:', getDestination('tokyo')?.name);
console.log('不存在:', getDestination('xyz'));
