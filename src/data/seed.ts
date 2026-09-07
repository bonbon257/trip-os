import type {
  Activity,
  ActivityType,
  Booking,
  Checklist,
  ChecklistItem,
  Day,
  Expense,
  FileAsset,
  Journal,
  TransportMode,
  Trip,
  TripMember,
} from '@/types';
import { DESTINATIONS } from './destinations';
import { dateRange } from '@/utils/date';

interface ActSpec {
  title: string;
  start: string;
  dur: number;
  type: ActivityType;
  placeId?: string;
  cost?: number;
  mode?: TransportMode;
  transit?: number;
  note?: string;
  status?: Activity['status'];
  pinned?: boolean;
}

interface DaySpec {
  title: string;
  note?: string;
  activities: ActSpec[];
}

interface TripSeed extends Omit<Trip, 'createdAt' | 'updatedAt'> {
  days: DaySpec[];
}

const uid = (p: string, i: number | string) => `${p}-${i}`;

function buildDaysActivities(tripId: string, startDate: string, specs: DaySpec[]) {
  const dates = dateRange(startDate, addIdx(startDate, specs.length - 1));
  const days: Day[] = [];
  const activities: Activity[] = [];
  specs.forEach((spec, i) => {
    const date = dates[i];
    const dayId = uid(tripId, `d${i + 1}`);
    days.push({ id: dayId, tripId, date, index: i + 1, title: spec.title, note: spec.note });
    spec.activities.forEach((a, j) => {
      activities.push({
        id: uid(dayId, `a${j + 1}`),
        tripId,
        dayId,
        placeId: a.placeId,
        title: a.title,
        startTime: a.start,
        endTime: shiftTime(a.start, a.dur),
        type: a.type,
        note: a.note,
        estimatedCost: a.cost ?? 0,
        transportMode: a.mode ?? 'walk',
        transportMin: a.transit ?? 0,
        status: a.status ?? 'planned',
        pinned: a.pinned,
        order: j,
      });
    });
  });
  return { days, activities };
}

const addIdx = (start: string, n: number) => {
  const d = new Date(`${start}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
};

function shiftTime(start: string, minutes: number) {
  const [h, m] = start.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${`${Math.floor(total / 60) % 24}`.padStart(2, '0')}:${`${total % 60}`.padStart(2, '0')}`;
}

const members = {
  me: { id: 'u-me', name: '我', avatar: '🦊', role: 'owner' } as TripMember,
  ann: { id: 'u-ann', name: '小安', avatar: '🐼', role: 'member' } as TripMember,
  ken: { id: 'u-ken', name: '阿Ken', avatar: '🐧', role: 'member' } as TripMember,
};

// ─────────────────────────────────────────────────────────────
// 1. 东京 —— 旅行中（Traveling）
// ─────────────────────────────────────────────────────────────
const tokyoSeed: TripSeed = {
  id: 'trip-tokyo',
  title: '东京 2026',
  destinationId: 'tokyo',
  destinationName: '东京',
  emoji: '🗼',
  startDate: '2026-09-01',
  endDate: '2026-09-06',
  status: 'traveling',
  planningPreference: 'delegator',
  totalBudget: 10000,
  members: [members.me, members.ann],
  profile: {
    travelMood: 'reward',
    pace: 'balanced',
    companions: 'friends',
    interests: ['citywalk', 'food', 'shopping', 'museum', 'photo', 'coffee'],
    dislikes: ['rush', 'earlyRise'],
    origin: '上海',
    durationDays: 6,
  },
  days: [
    {
      title: '抵达 + 浅草',
      activities: [
        { title: '羽田机场 → 市区', start: '12:00', dur: 60, type: 'transport', cost: 320, mode: 'train', transit: 0 },
        { title: '酒店办理入住', start: '14:00', dur: 60, type: 'stay', mode: 'walk', transit: 15 },
        { title: '浅草寺', start: '15:30', dur: 90, type: 'sight', placeId: 'tk-sensoji', cost: 0, mode: 'transit', transit: 25 },
        { title: '晚餐：浅草周边', start: '18:00', dur: 90, type: 'food', cost: 280, mode: 'walk', transit: 10 },
      ],
    },
    {
      title: '上野 + 秋叶原',
      activities: [
        { title: '上野公园', start: '09:30', dur: 120, type: 'nature', placeId: 'tk-ueno', cost: 0, transit: 0 },
        { title: '午餐：上野', start: '12:00', dur: 90, type: 'food', cost: 220, mode: 'walk', transit: 10 },
        { title: '秋叶原', start: '14:00', dur: 120, type: 'shopping', placeId: 'tk-akihabara', cost: 420, mode: 'transit', transit: 20 },
        { title: '谷中银座', start: '17:00', dur: 90, type: 'sight', placeId: 'tk-yanaka', cost: 120, mode: 'transit', transit: 25 },
      ],
    },
    {
      title: 'teamLab + 银座',
      note: '今天行程偏满，建议减少一个地点。',
      activities: [
        { title: 'teamLab Planets', start: '09:00', dur: 90, type: 'entertainment', placeId: 'tk-teamlab', cost: 230, mode: 'transit', transit: 30, note: '已预约 09:00 场', pinned: true },
        { title: '银座', start: '11:30', dur: 150, type: 'shopping', placeId: 'tk-ginza', cost: 800, mode: 'transit', transit: 25 },
        { title: '东京站', start: '15:00', dur: 60, type: 'sight', placeId: 'tk-tokyostation', cost: 0, mode: 'transit', transit: 20 },
        { title: '森美术馆', start: '18:00', dur: 120, type: 'culture', placeId: 'tk-mori', cost: 120, mode: 'transit', transit: 30 },
      ],
    },
    {
      title: '迪士尼一日',
      activities: [
        { title: '东京迪士尼乐园', start: '09:00', dur: 600, type: 'entertainment', placeId: 'tk-disney', cost: 560, mode: 'transit', transit: 45, pinned: true },
      ],
    },
    {
      title: '涩谷 + 原宿 + 下北泽',
      activities: [
        { title: '涩谷十字路口', start: '10:00', dur: 60, type: 'sight', placeId: 'tk-shibuya', cost: 0, transit: 0 },
        { title: '原宿竹下通', start: '11:30', dur: 90, type: 'shopping', placeId: 'tk-harajuku', cost: 320, mode: 'walk', transit: 15 },
        { title: '下北泽', start: '14:00', dur: 120, type: 'shopping', placeId: 'tk-shimokita', cost: 300, mode: 'transit', transit: 20 },
        { title: '大江户温泉物语', start: '17:00', dur: 180, type: 'other', placeId: 'tk-onsen', cost: 200, mode: 'transit', transit: 30 },
      ],
    },
    {
      title: '自由时间 + 回程',
      activities: [
        { title: '自由活动 / 咖啡', start: '10:00', dur: 150, type: 'free', cost: 120, transit: 0 },
        { title: '午餐', start: '12:30', dur: 90, type: 'food', cost: 200, mode: 'walk', transit: 10 },
        { title: '市区 → 羽田机场', start: '15:00', dur: 60, type: 'transport', cost: 320, mode: 'train', transit: 0 },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// 2. 杭州 —— 规划中（Planning）
// ─────────────────────────────────────────────────────────────
const hangzhouSeed: TripSeed = {
  id: 'trip-hangzhou',
  title: '杭州 2026',
  destinationId: 'hangzhou',
  destinationName: '杭州',
  emoji: '🍃',
  startDate: '2026-10-03',
  endDate: '2026-10-07',
  status: 'planning',
  planningPreference: 'planner',
  totalBudget: 5000,
  members: [members.me],
  profile: {
    travelMood: 'tired',
    pace: 'focused',
    companions: 'solo',
    interests: ['chill', 'nature', 'coffee', 'citywalk', 'food'],
    dislikes: ['rush', 'earlyRise', 'crowds', 'checkin'],
    origin: '上海',
    durationDays: 5,
  },
  days: [
    {
      title: '抵达 + 西湖',
      activities: [
        { title: '上海虹桥 → 杭州东', start: '10:00', dur: 60, type: 'transport', cost: 155, mode: 'train' },
        { title: '酒店入住', start: '11:30', dur: 60, type: 'stay', mode: 'transit', transit: 25 },
        { title: '北山街', start: '13:30', dur: 90, type: 'sight', placeId: 'hz-beishan', cost: 0, mode: 'transit', transit: 15 },
        { title: '西湖·断桥', start: '15:30', dur: 120, type: 'nature', placeId: 'hz-xihu', cost: 0, mode: 'walk', transit: 15 },
        { title: '晚餐：南宋御街', start: '18:30', dur: 90, type: 'food', placeId: 'hz-hefang', cost: 150, mode: 'transit', transit: 20 },
      ],
    },
    {
      title: '灵隐 + 龙井',
      activities: [
        { title: '灵隐寺', start: '09:30', dur: 120, type: 'sight', placeId: 'hz-lingyin', cost: 75, mode: 'transit', transit: 30 },
        { title: '午餐：龙井村', start: '12:00', dur: 90, type: 'food', cost: 160, mode: 'transit', transit: 20 },
        { title: '龙井村', start: '13:30', dur: 150, type: 'nature', placeId: 'hz-longjing', cost: 80, mode: 'walk', transit: 10 },
        { title: '中山中路咖啡街', start: '16:30', dur: 90, type: 'food', placeId: 'hz-coffee', cost: 80, mode: 'transit', transit: 35 },
      ],
    },
    {
      title: '良渚 + 天目里',
      activities: [
        { title: '良渚古城遗址', start: '09:30', dur: 180, type: 'culture', placeId: 'hz-liangzhu', cost: 80, mode: 'transit', transit: 45 },
        { title: '午餐', start: '12:30', dur: 60, type: 'food', cost: 120, mode: 'transit', transit: 30 },
        { title: '天目里', start: '14:30', dur: 150, type: 'culture', placeId: 'hz-tianmuli', cost: 150, mode: 'transit', transit: 25 },
      ],
    },
    {
      title: '西溪 + 博物馆',
      note: '这一天地跨城西到城南，移动时间偏长。',
      activities: [
        { title: '西溪湿地', start: '09:00', dur: 180, type: 'nature', placeId: 'hz-xixi', cost: 100, mode: 'transit', transit: 35 },
        { title: '午餐', start: '12:00', dur: 60, type: 'food', cost: 120, mode: 'transit', transit: 25 },
        { title: '浙江省博物馆之江馆', start: '13:30', dur: 150, type: 'culture', placeId: 'hz-museum', cost: 0, mode: 'transit', transit: 30 },
        { title: '桥西历史街区', start: '16:30', dur: 90, type: 'sight', placeId: 'hz-canal', cost: 60, mode: 'transit', transit: 35 },
        { title: '晚餐：南宋御街', start: '18:30', dur: 90, type: 'food', placeId: 'hz-hefang', cost: 150, mode: 'transit', transit: 30 },
      ],
    },
    {
      title: '苏堤 + 返程',
      activities: [
        { title: '苏堤春晓', start: '09:30', dur: 90, type: 'nature', placeId: 'hz-sudi', cost: 0, transit: 0 },
        { title: '咖啡 + 自由时间', start: '11:30', dur: 120, type: 'free', placeId: 'hz-coffee', cost: 80, mode: 'walk', transit: 15 },
        { title: '杭州东 → 上海虹桥', start: '15:00', dur: 60, type: 'transport', cost: 155, mode: 'train', transit: 40 },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// 3. 成都 —— 已完成（Completed → Journey）
// ─────────────────────────────────────────────────────────────
const chengduSeed: TripSeed = {
  id: 'trip-chengdu',
  title: '成都 2026',
  destinationId: 'chengdu',
  destinationName: '成都',
  emoji: '🐼',
  startDate: '2026-06-12',
  endDate: '2026-06-16',
  status: 'completed',
  planningPreference: 'delegator',
  totalBudget: 4000,
  members: [members.me, members.ken],
  profile: {
    travelMood: 'change',
    pace: 'balanced',
    companions: 'friends',
    interests: ['food', 'citywalk', 'coffee', 'nature', 'niche'],
    dislikes: ['earlyRise', 'rush'],
    origin: '北京',
    durationDays: 5,
  },
  days: [
    {
      title: '抵达 + 玉林',
      activities: [
        { title: '北京 → 成都', start: '08:00', dur: 180, type: 'transport', cost: 780, mode: 'flight' },
        { title: '酒店入住', start: '12:00', dur: 60, type: 'stay', mode: 'taxi', transit: 40 },
        { title: '武侯祠', start: '14:00', dur: 90, type: 'culture', placeId: 'cd-wuhou', cost: 50, mode: 'transit', transit: 20 },
        { title: '玉林路', start: '18:00', dur: 150, type: 'food', placeId: 'cd-yulin', cost: 220, mode: 'transit', transit: 25, status: 'done' },
      ],
    },
    {
      title: '熊猫 + 宽窄巷子',
      activities: [
        { title: '大熊猫繁育研究基地', start: '08:00', dur: 180, type: 'nature', placeId: 'cd-panda', cost: 55, mode: 'taxi', transit: 35, status: 'done' },
        { title: '宽窄巷子', start: '12:30', dur: 120, type: 'sight', placeId: 'cd-kuanzhai', cost: 120, mode: 'taxi', transit: 30, status: 'done' },
        { title: '蜀九香火锅', start: '18:00', dur: 120, type: 'food', placeId: 'cd-hotpot', cost: 320, mode: 'transit', transit: 25, status: 'done' },
      ],
    },
    {
      title: '都江堰 + 青城山',
      activities: [
        { title: '都江堰', start: '08:30', dur: 240, type: 'nature', placeId: 'cd-dujiangyan', cost: 80, mode: 'train', transit: 60, status: 'done' },
        { title: '青城山', start: '13:30', dur: 240, type: 'nature', placeId: 'cd-qingcheng', cost: 90, mode: 'taxi', transit: 40, status: 'done' },
      ],
    },
    {
      title: '金沙 + 东郊记忆',
      activities: [
        { title: '金沙遗址博物馆', start: '09:30', dur: 150, type: 'culture', placeId: 'cd-jinsha', cost: 70, mode: 'transit', transit: 30, status: 'done' },
        { title: '东郊记忆', start: '13:30', dur: 120, type: 'culture', placeId: 'cd-dongjiao', cost: 60, mode: 'transit', transit: 35, status: 'done' },
        { title: '望平街', start: '17:00', dur: 150, type: 'food', placeId: 'cd-wangping', cost: 180, mode: 'transit', transit: 25, status: 'done' },
      ],
    },
    {
      title: '锦里 + 返程',
      activities: [
        { title: '锦里古街', start: '10:00', dur: 120, type: 'shopping', placeId: 'cd-jinli', cost: 150, transit: 25, status: 'done' },
        { title: '天府广场', start: '13:00', dur: 60, type: 'sight', placeId: 'cd-tianfu', cost: 0, mode: 'transit', transit: 20, status: 'done' },
        { title: '成都 → 北京', start: '16:00', dur: 180, type: 'transport', cost: 780, mode: 'flight', transit: 50, status: 'done' },
      ],
    },
  ],
};

const SEEDS = [tokyoSeed, hangzhouSeed, chengduSeed];

export interface SeedDB {
  trips: Trip[];
  days: Day[];
  activities: Activity[];
  bookings: Booking[];
  expenses: Expense[];
  checklists: Checklist[];
  files: FileAsset[];
  journals: Journal[];
}

export function buildSeed(): SeedDB {
  const trips: Trip[] = [];
  const days: Day[] = [];
  const activities: Activity[] = [];

  for (const seed of SEEDS) {
    const { days: d, activities: a } = buildDaysActivities(seed.id, seed.startDate, seed.days);
    trips.push({
      id: seed.id,
      title: seed.title,
      destinationId: seed.destinationId,
      destinationName: seed.destinationName,
      emoji: seed.emoji,
      startDate: seed.startDate,
      endDate: seed.endDate,
      status: seed.status,
      planningPreference: seed.planningPreference,
      totalBudget: seed.totalBudget,
      members: seed.members,
      profile: seed.profile,
      createdAt: '2026-08-01T09:00:00.000Z',
      updatedAt: '2026-08-28T09:00:00.000Z',
    });
    days.push(...d);
    activities.push(...a);
  }

  return {
    trips,
    days,
    activities,
    bookings: BOOKINGS,
    expenses: EXPENSES,
    checklists: [],
    files: FILES,
    journals: JOURNALS,
  };
}

// ── 预订 ─────────────────────────────────────────────────────
const BOOKINGS: Booking[] = [
  { id: 'bk-tk-1', tripId: 'trip-tokyo', type: 'flight', title: '上海浦东 → 东京羽田', provider: 'ANA NH960', bookingNumber: 'NH960-SHA', startTime: '2026-09-01T09:20', endTime: '2026-09-01T13:05', cost: 1640, status: 'confirmed', dayId: 'trip-tokyo-d1' },
  { id: 'bk-tk-2', tripId: 'trip-tokyo', type: 'flight', title: '东京羽田 → 上海浦东', provider: 'ANA NH959', bookingNumber: 'NH959-HND', startTime: '2026-09-06T17:40', endTime: '2026-09-06T20:15', cost: 1640, status: 'confirmed', dayId: 'trip-tokyo-d6' },
  { id: 'bk-tk-3', tripId: 'trip-tokyo', type: 'hotel', title: '浅草 View 酒店 · 5 晚', provider: 'Booking.com', bookingNumber: 'BK-77213', startTime: '2026-09-01T15:00', endTime: '2026-09-06T11:00', cost: 3900, status: 'confirmed' },
  { id: 'bk-tk-4', tripId: 'trip-tokyo', type: 'ticket', title: 'teamLab Planets 门票', provider: 'Klook', bookingNumber: 'KL-3312', startTime: '2026-09-03T09:00', endTime: '2026-09-03T10:30', cost: 230, status: 'confirmed', dayId: 'trip-tokyo-d3', placeId: 'tk-teamlab' },
  { id: 'bk-tk-5', tripId: 'trip-tokyo', type: 'ticket', title: '东京迪士尼 1 日券', provider: '官方 App', bookingNumber: '—', startTime: '2026-09-04T09:00', cost: 560, status: 'pending', dayId: 'trip-tokyo-d4', placeId: 'tk-disney', note: '仍未出票，建议尽快确认' },
  { id: 'bk-hz-1', tripId: 'trip-hangzhou', type: 'train', title: '上海虹桥 → 杭州东', provider: 'G7301', bookingNumber: 'CR-8812', startTime: '2026-10-03T10:00', endTime: '2026-10-03T11:00', cost: 155, status: 'confirmed', dayId: 'trip-hangzhou-d1' },
  { id: 'bk-hz-2', tripId: 'trip-hangzhou', type: 'hotel', title: '西湖边民宿 · 4 晚', provider: 'Airbnb', bookingNumber: 'AB-4412', startTime: '2026-10-03T14:00', endTime: '2026-10-07T11:00', cost: 1800, status: 'pending', note: '房东确认中' },
  { id: 'bk-hz-3', tripId: 'trip-hangzhou', type: 'ticket', title: '良渚古城遗址门票', provider: '官方小程序', bookingNumber: 'LZ-0091', startTime: '2026-10-05T09:30', cost: 80, status: 'pending', dayId: 'trip-hangzhou-d3' },
];

// ── 预算 ─────────────────────────────────────────────────────
const EXPENSES: Expense[] = [
  { id: 'ex-tk-1', tripId: 'trip-tokyo', title: '往返机票', category: 'transport', amount: 3280, status: 'paid', date: '2026-08-05' },
  { id: 'ex-tk-2', tripId: 'trip-tokyo', title: '酒店 5 晚', category: 'stay', amount: 3900, status: 'paid', date: '2026-08-05' },
  { id: 'ex-tk-3', tripId: 'trip-tokyo', title: 'teamLab 门票', category: 'ticket', amount: 230, status: 'paid', date: '2026-08-20', activityId: 'trip-tokyo-d3-a1' },
  { id: 'ex-tk-4', tripId: 'trip-tokyo', title: '迪士尼门票', category: 'ticket', amount: 560, status: 'planned', activityId: 'trip-tokyo-d4-a1' },
  { id: 'ex-tk-5', tripId: 'trip-tokyo', title: '市内交通（地铁+JR）', category: 'transport', amount: 600, status: 'planned' },
  { id: 'ex-tk-6', tripId: 'trip-tokyo', title: '餐饮预算', category: 'food', amount: 2400, status: 'planned' },
  { id: 'ex-tk-7', tripId: 'trip-tokyo', title: '购物预留', category: 'shopping', amount: 1200, status: 'planned' },
  { id: 'ex-tk-8', tripId: 'trip-tokyo', title: '森美术馆', category: 'ticket', amount: 120, status: 'planned' },

  { id: 'ex-hz-1', tripId: 'trip-hangzhou', title: '往返高铁', category: 'transport', amount: 310, status: 'paid', date: '2026-09-20' },
  { id: 'ex-hz-2', tripId: 'trip-hangzhou', title: '民宿 4 晚', category: 'stay', amount: 1800, status: 'planned' },
  { id: 'ex-hz-3', tripId: 'trip-hangzhou', title: '餐饮预算', category: 'food', amount: 1200, status: 'planned' },
  { id: 'ex-hz-4', tripId: 'trip-hangzhou', title: '门票合计', category: 'ticket', amount: 400, status: 'planned' },
  { id: 'ex-hz-5', tripId: 'trip-hangzhou', title: '市内交通', category: 'transport', amount: 180, status: 'planned' },
  { id: 'ex-hz-6', tripId: 'trip-hangzhou', title: '咖啡与手信', category: 'shopping', amount: 500, status: 'planned' },

  { id: 'ex-cd-1', tripId: 'trip-chengdu', title: '往返机票', category: 'transport', amount: 1560, status: 'paid', date: '2026-05-20' },
  { id: 'ex-cd-2', tripId: 'trip-chengdu', title: '酒店 4 晚', category: 'stay', amount: 1120, status: 'paid', date: '2026-06-16' },
  { id: 'ex-cd-3', tripId: 'trip-chengdu', title: '餐饮总计', category: 'food', amount: 860, status: 'paid', date: '2026-06-16' },
  { id: 'ex-cd-4', tripId: 'trip-chengdu', title: '门票与交通', category: 'ticket', amount: 320, status: 'paid', date: '2026-06-16' },
];

// ── 文件 ─────────────────────────────────────────────────────
const FILES: FileAsset[] = [
  { id: 'fl-1', tripId: 'trip-tokyo', name: 'ANA 电子客票.pdf', type: 'flight', sizeKb: 328, uploadedAt: '2026-08-05', linkedType: 'booking', linkedId: 'bk-tk-1' },
  { id: 'fl-2', tripId: 'trip-tokyo', name: '酒店确认单.pdf', type: 'hotel', sizeKb: 210, uploadedAt: '2026-08-05', linkedType: 'booking', linkedId: 'bk-tk-3' },
  { id: 'fl-3', tripId: 'trip-tokyo', name: 'teamLab 二维码.png', type: 'ticket', sizeKb: 96, uploadedAt: '2026-08-20', linkedType: 'booking', linkedId: 'bk-tk-4' },
  { id: 'fl-4', tripId: 'trip-tokyo', name: '护照首页.jpg', type: 'id', sizeKb: 512, uploadedAt: '2026-08-02' },
  { id: 'fl-5', tripId: 'trip-hangzhou', name: '高铁购票记录.png', type: 'ticket', sizeKb: 148, uploadedAt: '2026-09-20', linkedType: 'booking', linkedId: 'bk-hz-1' },
  { id: 'fl-6', tripId: 'trip-chengdu', name: '成都行程单.pdf', type: 'order', sizeKb: 402, uploadedAt: '2026-06-10' },
];

// ── Journey ──────────────────────────────────────────────────
const JOURNALS: Journal[] = [
  { id: 'jr-cd-1', tripId: 'trip-chengdu', dayId: 'trip-chengdu-d1', date: '2026-06-12', title: '降落，先吃一顿', mood: '😌', note: '落地就是火锅味。晚上玉林路的小酒馆人不多，唱歌的人唱得很一般但很真诚。', photos: ['🍲', '🎸', '🌃'], placeNames: ['武侯祠', '玉林路'] },
  { id: 'jr-cd-2', tripId: 'trip-chengdu', dayId: 'trip-chengdu-d2', date: '2026-06-13', title: '熊猫看了三小时', mood: '🐼', note: '开园就进，值。下午宽窄巷子人太多，草草走了半圈。', photos: ['🐼', '🍵', '🎋'], placeNames: ['大熊猫繁育研究基地', '宽窄巷子'] },
  { id: 'jr-cd-3', tripId: 'trip-chengdu', dayId: 'trip-chengdu-d3', date: '2026-06-14', title: '山里一天', mood: '⛰️', note: '都江堰的水声很大，青城山后山一路都是树。腿废了但很值。', photos: ['💧', '⛰️', '🌿'], placeNames: ['都江堰', '青城山'] },
  { id: 'jr-cd-4', tripId: 'trip-chengdu', dayId: 'trip-chengdu-d4', date: '2026-06-15', title: '太阳神鸟', mood: '🌞', note: '金沙的太阳神鸟比想象中小。东郊记忆的红砖很好拍。', photos: ['🌞', '🧱', '☕'], placeNames: ['金沙遗址博物馆', '东郊记忆'] },
  { id: 'jr-cd-5', tripId: 'trip-chengdu', dayId: 'trip-chengdu-d5', date: '2026-06-16', title: '走了', mood: '👋', note: '锦里的灯笼白天也亮着。下次还来。', photos: ['🏮', '🛫'], placeNames: ['锦里古街'] },
];

// ── Checklist 模板（由 ChecklistService 依据 Trip 生成）─────────
export const BASE_BEFORE: string[] = [
  '确定往返大交通',
  '预订住宿',
  '确认重要门票 / 预约',
  '检查证件有效期',
  '整理随身行李清单',
];

export const BASE_DURING: string[] = ['每日出发前看一眼今日行程', '记录当天花费'];
export const BASE_AFTER: string[] = ['整理照片', '核对账单与分摊', '补记 Journey'];

export const scopeItems = (trip: Trip): { before: string[]; during: string[] } => {
  const international =
    DESTINATIONS.find((d) => d.id === trip.destinationId)?.scope === 'international';
  const before = [...BASE_BEFORE];
  const during = [...BASE_DURING];
  if (international) {
    before.push('护照有效期 ≥ 6 个月', '签证 / 入境卡', '购买境外流量或 eSIM', '换汇或确认刷卡', '旅行保险');
    during.push('保存护照电子件', '留意回国航班值机时间');
  } else {
    before.push('提前值机', '查看目的地天气');
  }
  if (trip.planningPreference === 'planner') before.push('导出一份行程单备用');
  return { before, during };
};

export const makeChecklist = (
  tripId: string,
  phase: Checklist['phase'],
  title: string,
  titles: string[],
): Checklist => ({
  id: `${tripId}-cl-${phase}`,
  tripId,
  phase,
  title,
  items: titles.map<ChecklistItem>((t, i) => ({
    id: `${tripId}-cl-${phase}-${i}`,
    title: t,
    done: false,
    auto: true,
  })),
});
