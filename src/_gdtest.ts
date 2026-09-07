// 一次性测试，运行后删除
import { getDestination } from '@/data/destinations';
console.log('杭州:', getDestination('cn-330100')?.name);
console.log('东京:', getDestination('tokyo')?.name);
console.log('广州:', getDestination('cn-440100')?.name);
console.log('不存在:', getDestination('nonexistent'));
