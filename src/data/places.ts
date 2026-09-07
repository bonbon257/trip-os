import type { Place } from '@/types';

/** 精编地点池（真实数据）。无精编数据的目的地返回空数组，绝不合成假地点。 */
const CURATED: Record<string, Place[]> = {
  tokyo: [
    { id: 'tk-sensoji', destinationId: 'tokyo', name: '浅草寺', category: 'sight', x: 72, y: 40, lng: 139.7967, lat: 35.7148, rating: 4.6, avgCost: 0, durationMin: 90, open: '06:00', close: '17:00', tags: ['culture', 'photo', 'citywalk'], indoor: false, emoji: '⛩️', description: '东京最古老的寺庙，雷门与仲见世通。' },
    { id: 'tk-ueno', destinationId: 'tokyo', name: '上野公园', category: 'nature', x: 66, y: 33, lng: 139.7713, lat: 35.7140, rating: 4.5, avgCost: 0, durationMin: 120, open: '05:00', close: '20:00', tags: ['nature', 'photo', 'chill'], indoor: false, emoji: '🌸', description: '博物馆群与樱花名所。' },
    { id: 'tk-akihabara', destinationId: 'tokyo', name: '秋叶原', category: 'shopping', x: 63, y: 42, lng: 139.7713, lat: 35.6995, rating: 4.4, avgCost: 400, durationMin: 120, open: '10:00', close: '20:00', tags: ['shopping', 'citywalk', 'niche'], indoor: true, emoji: '🎮', description: '电器街与二次元文化。' },
    { id: 'tk-ginza', destinationId: 'tokyo', name: '银座', category: 'shopping', x: 58, y: 58, lng: 139.7644, lat: 35.6717, rating: 4.5, avgCost: 800, durationMin: 150, open: '11:00', close: '20:00', tags: ['shopping', 'food', 'architecture'], indoor: true, emoji: '🛍️', description: '高端商圈与旗舰店建筑。' },
    { id: 'tk-tokyostation', destinationId: 'tokyo', name: '东京站', category: 'sight', x: 60, y: 52, lng: 139.7673, lat: 35.6815, rating: 4.4, avgCost: 0, durationMin: 60, open: '00:00', close: '23:59', tags: ['architecture', 'photo', 'food'], indoor: true, emoji: '🚉', description: '红砖站舍与地下街。' },
    { id: 'tk-teamlab', destinationId: 'tokyo', name: 'teamLab Planets', category: 'entertainment', x: 76, y: 66, lng: 139.7920, lat: 35.6490, rating: 4.7, avgCost: 230, durationMin: 90, open: '09:00', close: '21:00', tags: ['art', 'photo'], indoor: true, requiredBooking: true, emoji: '🎨', description: '沉浸式数字艺术，需预约时段。' },
    { id: 'tk-shibuya', destinationId: 'tokyo', name: '涩谷十字路口', category: 'sight', x: 34, y: 60, lng: 139.7016, lat: 35.6595, rating: 4.5, avgCost: 0, durationMin: 60, open: '00:00', close: '23:59', tags: ['photo', 'citywalk', 'nightlife'], indoor: false, emoji: '🚦', description: '世界最繁忙的十字路口。' },
    { id: 'tk-harajuku', destinationId: 'tokyo', name: '原宿竹下通', category: 'shopping', x: 33, y: 52, lng: 139.7063, lat: 35.6710, rating: 4.2, avgCost: 300, durationMin: 90, open: '11:00', close: '19:00', tags: ['shopping', 'photo', 'food'], indoor: false, emoji: '🧸', description: '潮流小店与可丽饼。' },
    { id: 'tk-disney', destinationId: 'tokyo', name: '东京迪士尼乐园', category: 'entertainment', x: 88, y: 74, lng: 139.8902, lat: 35.6250, rating: 4.8, avgCost: 560, durationMin: 480, fullDay: true, open: '09:00', close: '21:00', tags: ['themePark', 'photo'], indoor: false, requiredBooking: true, emoji: '🏰', description: '整天行程，建议单独安排一日。' },
    { id: 'tk-shimokita', destinationId: 'tokyo', name: '下北泽', category: 'shopping', x: 27, y: 47, lng: 139.6672, lat: 35.6610, rating: 4.3, avgCost: 300, durationMin: 120, open: '11:00', close: '20:00', tags: ['niche', 'coffee', 'citywalk'], indoor: false, emoji: '🎸', description: '古着、小剧场与咖啡。' },
    { id: 'tk-sushizanmai', destinationId: 'tokyo', name: '筑地场外市场', category: 'food', x: 63, y: 63, lng: 139.7700, lat: 35.6650, rating: 4.4, avgCost: 260, durationMin: 90, open: '05:00', close: '14:00', tags: ['food', 'photo'], indoor: false, emoji: '🍣', description: '海鲜早餐，建议早去。' },
    { id: 'tk-mori', destinationId: 'tokyo', name: '森美术馆', category: 'culture', x: 40, y: 66, lng: 139.7223, lat: 35.6604, rating: 4.5, avgCost: 120, durationMin: 120, open: '10:00', close: '22:00', tags: ['art', 'museum', 'photo'], indoor: true, emoji: '🖼️', description: '六本木之丘顶层，夜景与展览。' },
    { id: 'tk-yanaka', destinationId: 'tokyo', name: '谷中银座', category: 'sight', x: 60, y: 30, lng: 139.7665, lat: 35.7270, rating: 4.3, avgCost: 120, durationMin: 90, open: '10:00', close: '18:00', tags: ['citywalk', 'niche', 'photo'], indoor: false, emoji: '🏘️', description: '下町老街，适合慢慢走。' },
    { id: 'tk-onsen', destinationId: 'tokyo', name: '大江户温泉物语', category: 'other', x: 80, y: 78, lng: 139.7865, lat: 35.6190, rating: 4.2, avgCost: 200, durationMin: 180, open: '11:00', close: '23:00', tags: ['onsen', 'chill'], indoor: true, emoji: '♨️', description: '台场温泉，适合疲惫日收尾。' },
  ],
  osaka: [
    { id: 'os-usj', destinationId: 'osaka', name: '日本环球影城', category: 'entertainment', x: 74, y: 68, lng: 135.4324, lat: 34.6654, rating: 4.8, avgCost: 520, durationMin: 480, fullDay: true, open: '08:30', close: '21:00', tags: ['themePark', 'photo', 'family'], indoor: false, requiredBooking: true, emoji: '🎢', description: '一整天都不够，建议单独安排一日并提前买快速通关。' },
    { id: 'os-dotonbori', destinationId: 'osaka', name: '道顿堀', category: 'sight', x: 52, y: 58, lng: 135.5010, lat: 34.6687, rating: 4.5, avgCost: 200, durationMin: 120, open: '10:00', close: '23:00', tags: ['food', 'photo', 'nightlife', 'citywalk'], indoor: false, emoji: '🌃', description: '格力高跑跑人招牌与霓虹招牌街。' },
    { id: 'os-kuromon', destinationId: 'osaka', name: '黑门市场', category: 'food', x: 54, y: 62, lng: 135.5065, lat: 34.6654, rating: 4.4, avgCost: 180, durationMin: 90, open: '09:00', close: '18:00', tags: ['food', 'photo'], indoor: false, emoji: '🦀', description: '海鲜与和牛小吃，上午来最新鲜。' },
    { id: 'os-castle', destinationId: 'osaka', name: '大阪城', category: 'sight', x: 62, y: 42, lng: 135.5261, lat: 34.6873, rating: 4.6, avgCost: 120, durationMin: 150, open: '09:00', close: '17:00', tags: ['culture', 'photo', 'architecture'], indoor: false, emoji: '🏯', description: '天守阁与护城河，樱花季尤其推荐。' },
    { id: 'os-shinsaibashi', destinationId: 'osaka', name: '心斋桥', category: 'shopping', x: 48, y: 56, lng: 135.5009, lat: 34.6731, rating: 4.3, avgCost: 400, durationMin: 120, open: '11:00', close: '21:00', tags: ['shopping', 'food', 'citywalk'], indoor: false, emoji: '🛍️', description: '药妆店与潮牌密集，适合傍晚逛。' },
    { id: 'os-umeda', destinationId: 'osaka', name: '梅田蓝天大厦', category: 'sight', x: 38, y: 30, lng: 135.4902, lat: 34.7055, rating: 4.5, avgCost: 120, durationMin: 90, open: '09:30', close: '22:00', tags: ['architecture', 'photo', 'nightlife'], indoor: true, emoji: '🌆', description: '空中庭园展望台，夜景首选。' },
    { id: 'os-tsutenkaku', destinationId: 'osaka', name: '通天阁', category: 'sight', x: 42, y: 70, lng: 135.5030, lat: 34.6525, rating: 4.2, avgCost: 80, durationMin: 60, open: '09:00', close: '21:00', tags: ['photo', 'food', 'citywalk'], indoor: false, emoji: '🗼', description: '新世界街区地标，炸串店林立。' },
    { id: 'os-kaiyukan', destinationId: 'osaka', name: '海游馆', category: 'entertainment', x: 28, y: 78, lng: 135.4286, lat: 34.6545, rating: 4.6, avgCost: 200, durationMin: 150, open: '10:00', close: '20:00', tags: ['family', 'photo'], indoor: true, emoji: '🐋', description: '巨型水槽与鲸鲨，适合亲子。' },
    { id: 'os-sumiyoshi', destinationId: 'osaka', name: '住吉大社', category: 'culture', x: 66, y: 82, lng: 135.4931, lat: 34.6179, rating: 4.4, avgCost: 0, durationMin: 90, open: '06:00', close: '17:00', tags: ['culture', 'photo', 'niche'], indoor: false, emoji: '⛩️', description: '古老神社与朱红反桥。' },
    { id: 'os-takoyaki', destinationId: 'osaka', name: '章魚燒道樂 わなか', category: 'food', x: 50, y: 60, lng: 135.5050, lat: 34.6660, rating: 4.5, avgCost: 60, durationMin: 45, open: '10:00', close: '22:00', tags: ['food'], indoor: false, emoji: '🐙', description: '现做章鱼烧，道顿堀附近。' },
  ],
  hangzhou: [
    { id: 'hz-xihu', destinationId: 'hangzhou', name: '西湖·断桥', category: 'nature', x: 42, y: 52, lng: 120.1450, lat: 30.2580, rating: 4.7, avgCost: 0, durationMin: 120, open: '00:00', close: '23:59', tags: ['nature', 'photo', 'citywalk'], indoor: false, emoji: '🌉', description: '环湖漫步核心段。' },
    { id: 'hz-beishan', destinationId: 'hangzhou', name: '北山街', category: 'sight', x: 38, y: 44, lng: 120.1400, lat: 30.2600, rating: 4.5, avgCost: 0, durationMin: 90, open: '00:00', close: '23:59', tags: ['citywalk', 'photo', 'architecture'], indoor: false, emoji: '🏛️', description: '民国建筑与湖景。' },
    { id: 'hz-longjing', destinationId: 'hangzhou', name: '龙井村', category: 'nature', x: 22, y: 62, lng: 120.1000, lat: 30.2200, rating: 4.5, avgCost: 80, durationMin: 150, open: '08:00', close: '18:00', tags: ['nature', 'coffee', 'chill', 'outdoor'], indoor: false, emoji: '🍵', description: '茶山与村落，可骑行。' },
    { id: 'hz-lingyin', destinationId: 'hangzhou', name: '灵隐寺', category: 'sight', x: 26, y: 56, lng: 120.0980, lat: 30.2400, rating: 4.6, avgCost: 75, durationMin: 120, open: '06:30', close: '18:00', tags: ['culture', 'nature'], indoor: false, emoji: '🛕', description: '古刹与飞来峰石窟。' },
    { id: 'hz-tianmuli', destinationId: 'hangzhou', name: '天目里', category: 'culture', x: 30, y: 70, lng: 120.0800, lat: 30.2700, rating: 4.6, avgCost: 150, durationMin: 120, open: '10:00', close: '22:00', tags: ['architecture', 'coffee', 'art', 'photo'], indoor: true, emoji: '🏢', description: '清水混凝土建筑群与书店。' },
    { id: 'hz-liangzhu', destinationId: 'hangzhou', name: '良渚古城遗址', category: 'culture', x: 14, y: 26, lng: 119.9850, lat: 30.4200, rating: 4.5, avgCost: 80, durationMin: 180, open: '09:00', close: '17:00', tags: ['museum', 'culture', 'niche'], indoor: true, emoji: '🏺', description: '世界遗产，需半天。' },
    { id: 'hz-canal', destinationId: 'hangzhou', name: '桥西历史街区', category: 'sight', x: 46, y: 38, lng: 120.1500, lat: 30.3150, rating: 4.3, avgCost: 60, durationMin: 90, open: '09:00', close: '21:00', tags: ['citywalk', 'museum', 'coffee'], indoor: false, emoji: '🛶', description: '运河边老街与刀剪剑博物馆。' },
    { id: 'hz-hefang', destinationId: 'hangzhou', name: '南宋御街', category: 'shopping', x: 48, y: 58, lng: 120.1650, lat: 30.2450, rating: 4.1, avgCost: 120, durationMin: 90, open: '10:00', close: '22:00', tags: ['food', 'shopping', 'citywalk'], indoor: false, emoji: '🏮', description: '小吃与老字号。' },
    { id: 'hz-xixi', destinationId: 'hangzhou', name: '西溪湿地', category: 'nature', x: 18, y: 72, lng: 120.0600, lat: 30.2700, rating: 4.4, avgCost: 100, durationMin: 180, open: '08:00', close: '17:30', tags: ['nature', 'outdoor', 'photo'], indoor: false, emoji: '🦆', description: '摇橹船与芦苇荡。' },
    { id: 'hz-museum', destinationId: 'hangzhou', name: '浙江省博物馆之江馆', category: 'culture', x: 34, y: 78, lng: 120.0800, lat: 30.1600, rating: 4.6, avgCost: 0, durationMin: 150, open: '09:00', close: '17:00', tags: ['museum', 'art'], indoor: true, emoji: '🗿', description: '需预约，周一闭馆。' },
    { id: 'hz-coffee', destinationId: 'hangzhou', name: '中山中路咖啡街', category: 'food', x: 46, y: 54, lng: 120.1650, lat: 30.2550, rating: 4.4, avgCost: 80, durationMin: 90, open: '09:00', close: '20:00', tags: ['coffee', 'chill', 'citywalk'], indoor: true, emoji: '☕', description: '独立咖啡馆密集。' },
    { id: 'hz-sudi', destinationId: 'hangzhou', name: '苏堤春晓', category: 'nature', x: 36, y: 60, lng: 120.1300, lat: 30.2300, rating: 4.6, avgCost: 0, durationMin: 90, open: '00:00', close: '23:59', tags: ['nature', 'photo', 'chill'], indoor: false, emoji: '🌿', description: '清晨人少体验最好。' },
  ],
  chengdu: [
    { id: 'cd-panda', destinationId: 'chengdu', name: '大熊猫繁育研究基地', category: 'nature', x: 58, y: 22, lng: 104.1450, lat: 30.7344, rating: 4.7, avgCost: 55, durationMin: 180, open: '07:30', close: '18:00', tags: ['nature', 'photo', 'family'], indoor: false, emoji: '🐼', description: '建议开园即入，上午最活跃。' },
    { id: 'cd-yulin', destinationId: 'chengdu', name: '玉林路', category: 'food', x: 40, y: 60, lng: 104.0550, lat: 30.6350, rating: 4.4, avgCost: 120, durationMin: 120, open: '10:00', close: '23:00', tags: ['food', 'citywalk', 'nightlife', 'music'], indoor: false, emoji: '🎸', description: '小酒馆与串串。' },
    { id: 'cd-jinli', destinationId: 'chengdu', name: '锦里古街', category: 'shopping', x: 34, y: 48, lng: 104.0450, lat: 30.6450, rating: 4.2, avgCost: 100, durationMin: 90, open: '00:00', close: '23:59', tags: ['shopping', 'photo', 'food'], indoor: false, emoji: '🏮', description: '夜晚灯笼更好看。' },
    { id: 'cd-wuhou', destinationId: 'chengdu', name: '武侯祠', category: 'culture', x: 36, y: 46, lng: 104.0440, lat: 30.6420, rating: 4.5, avgCost: 50, durationMin: 90, open: '08:00', close: '18:00', tags: ['culture', 'architecture'], indoor: false, emoji: '⛩️', description: '三国文化核心。' },
    { id: 'cd-jinsha', destinationId: 'chengdu', name: '金沙遗址博物馆', category: 'culture', x: 26, y: 42, lng: 103.9950, lat: 30.6800, rating: 4.6, avgCost: 70, durationMin: 150, open: '08:00', close: '18:00', tags: ['museum', 'culture', 'art'], indoor: true, emoji: '🌞', description: '太阳神鸟金饰。' },
    { id: 'cd-kuanzhai', destinationId: 'chengdu', name: '宽窄巷子', category: 'sight', x: 32, y: 40, lng: 104.0560, lat: 30.6680, rating: 4.2, avgCost: 120, durationMin: 90, open: '00:00', close: '23:59', tags: ['citywalk', 'photo', 'coffee'], indoor: false, emoji: '🍵', description: '茶馆与盖碗茶。' },
    { id: 'cd-dujiangyan', destinationId: 'chengdu', name: '都江堰', category: 'nature', x: 12, y: 18, lng: 103.6120, lat: 30.9980, rating: 4.6, avgCost: 80, durationMin: 240, fullDay: true, open: '08:00', close: '18:00', tags: ['nature', 'culture', 'outdoor'], indoor: false, emoji: '💧', description: '需一整天，城际高铁 30 分钟。' },
    { id: 'cd-qingcheng', destinationId: 'chengdu', name: '青城山', category: 'nature', x: 8, y: 26, lng: 103.5630, lat: 30.9010, rating: 4.5, avgCost: 90, durationMin: 240, fullDay: true, open: '08:00', close: '17:00', tags: ['nature', 'outdoor', 'chill'], indoor: false, emoji: '⛰️', description: '前山文化，后山自然。' },
    { id: 'cd-tianfu', destinationId: 'chengdu', name: '天府广场', category: 'sight', x: 44, y: 50, lng: 104.0640, lat: 30.6570, rating: 4.0, avgCost: 0, durationMin: 60, open: '00:00', close: '23:59', tags: ['citywalk'], indoor: false, emoji: '🏙️', description: '城市中心。' },
    { id: 'cd-dongjiao', destinationId: 'chengdu', name: '东郊记忆', category: 'culture', x: 66, y: 52, lng: 104.1150, lat: 30.6680, rating: 4.3, avgCost: 60, durationMin: 120, open: '10:00', close: '22:00', tags: ['art', 'photo', 'coffee', 'niche'], indoor: true, emoji: '🎨', description: '工业风文创园。' },
    { id: 'cd-hotpot', destinationId: 'chengdu', name: '蜀九香火锅（总店）', category: 'food', x: 42, y: 56, lng: 104.0570, lat: 30.6500, rating: 4.5, avgCost: 160, durationMin: 120, open: '11:00', close: '23:00', tags: ['food'], indoor: true, emoji: '🍲', description: '排队较久，建议错峰。' },
    { id: 'cd-wangping', destinationId: 'chengdu', name: '望平街', category: 'food', x: 52, y: 48, lng: 104.0830, lat: 30.6600, rating: 4.4, avgCost: 90, durationMin: 90, open: '10:00', close: '22:00', tags: ['food', 'coffee', 'citywalk', 'niche'], indoor: false, emoji: '🍢', description: '河边香香巷与咖啡。' },
  ],
  xian: [
    // 真实地标，坐标来自公开地理数据；x/y 为地图画布展示坐标，非地理断言。
    { id: 'xa-bingmayong', destinationId: 'xian', name: '秦始皇兵马俑', category: 'sight', x: 84, y: 22, lng: 109.2787, lat: 34.3846, rating: 4.8, avgCost: 120, durationMin: 240, fullDay: true, open: '08:30', close: '18:00', tags: ['culture', 'museum', 'photo', 'first-timer'], indoor: false, requiredBooking: true, emoji: '🗿', description: '世界第八大奇迹，建议上午去，配合讲解。' },
    { id: 'xa-huaqing', destinationId: 'xian', name: '华清宫', category: 'sight', x: 82, y: 26, lng: 109.2112, lat: 34.3672, rating: 4.6, avgCost: 120, durationMin: 150, open: '07:30', close: '18:30', tags: ['culture', 'history', 'photo'], indoor: false, emoji: '♨️', description: '唐御汤遗址与《长恨歌》实景演出地，与兵马俑同属临潼东线。' },
    { id: 'xa-shanxi', destinationId: 'xian', name: '陕西历史博物馆', category: 'culture', x: 52, y: 58, lng: 108.9669, lat: 34.2192, rating: 4.7, avgCost: 0, durationMin: 180, open: '08:30', close: '18:00', tags: ['museum', 'culture', 'art', 'first-timer'], indoor: true, requiredBooking: true, emoji: '🏺', description: '免费但需提前预约，周一闭馆，珍宝馆另购票。' },
    { id: 'xa-dayan', destinationId: 'xian', name: '大雁塔', category: 'sight', x: 54, y: 56, lng: 108.9643, lat: 34.2185, rating: 4.6, avgCost: 50, durationMin: 90, open: '08:00', close: '18:30', tags: ['culture', 'architecture', 'photo', 'citywalk'], indoor: false, emoji: '🏯', description: '大慈恩寺与大雁塔，北广场音乐喷泉夜景。' },
    { id: 'xa-datang', destinationId: 'xian', name: '大唐不夜城', category: 'entertainment', x: 56, y: 54, lng: 108.9677, lat: 34.2176, rating: 4.5, avgCost: 0, durationMin: 120, open: '10:00', close: '22:30', tags: ['photo', 'nightlife', 'citywalk', 'food'], indoor: false, emoji: '🏮', description: '步行文化街区，夜景与演出密集，适合傍晚到夜间。' },
    { id: 'xa-huimin', destinationId: 'xian', name: '回民街', category: 'food', x: 46, y: 40, lng: 108.9342, lat: 34.2657, rating: 4.4, avgCost: 60, durationMin: 90, open: '10:00', close: '23:00', tags: ['food', 'citywalk', 'photo'], indoor: false, emoji: '🍜', description: '西安小吃集中地，肉夹馍、泡馍、酸梅汤。' },
    { id: 'xa-wall', destinationId: 'xian', name: '西安城墙', category: 'sight', x: 50, y: 44, lng: 108.9461, lat: 34.2583, rating: 4.6, avgCost: 54, durationMin: 150, open: '08:00', close: '22:00', tags: ['architecture', 'photo', 'citywalk', 'cycling'], indoor: false, emoji: '🧱', description: '中国现存最完整的古城墙，可骑行一圈（约 14 公里）。' },
    { id: 'xa-zhonglou', destinationId: 'xian', name: '钟楼', category: 'sight', x: 48, y: 42, lng: 108.9461, lat: 34.2603, rating: 4.5, avgCost: 30, durationMin: 60, open: '08:30', close: '21:30', tags: ['architecture', 'photo', 'citywalk'], indoor: false, emoji: '🕰️', description: '城市中心地标，可与鼓楼联票，夜晚亮灯。' },
    { id: 'xa-xiaoyan', destinationId: 'xian', name: '小雁塔', category: 'sight', x: 44, y: 52, lng: 108.9489, lat: 34.2473, rating: 4.5, avgCost: 0, durationMin: 90, open: '09:00', close: '17:00', tags: ['culture', 'chill', 'photo'], indoor: false, emoji: '🏯', description: '安静的唐代古塔，西安博物院就在院内，免费需预约。' },
    { id: 'xa-beilin', destinationId: 'xian', name: '碑林博物馆', category: 'culture', x: 49, y: 45, lng: 108.9512, lat: 34.2525, rating: 4.5, avgCost: 65, durationMin: 90, open: '08:00', close: '18:00', tags: ['museum', 'culture', 'art'], indoor: true, emoji: '🪨', description: '书法碑刻宝库，书法爱好者必去，紧邻城墙南门。' },
  ],
  'route-heilongjiang': [
    // ── 哈尔滨（枢纽）──
    { id: 'hb-zhongyang', destinationId: 'route-heilongjiang', name: '中央大街', category: 'sight', x: 50, y: 52, lng: 126.6180, lat: 45.7804, rating: 4.6, avgCost: 0, durationMin: 120, open: '00:00', close: '23:59', tags: ['citywalk', 'photo', 'architecture', 'food'], indoor: false, emoji: '🌆', description: '百年面包石步行街，索菲亚教堂与松花江都在附近。' },
    { id: 'hb-suofeiya', destinationId: 'route-heilongjiang', name: '圣索菲亚教堂', category: 'culture', x: 54, y: 48, lng: 126.6220, lat: 45.7699, rating: 4.5, avgCost: 0, durationMin: 90, open: '08:30', close: '17:00', tags: ['culture', 'photo', 'architecture'], indoor: true, emoji: '🕍', description: '远东最大东正教堂，外观最出片。' },
    { id: 'hb-songhua', destinationId: 'route-heilongjiang', name: '松花江畔·斯大林公园', category: 'nature', x: 46, y: 56, lng: 126.6100, lat: 45.7770, rating: 4.3, avgCost: 0, durationMin: 90, open: '00:00', close: '23:59', tags: ['nature', 'photo', 'chill', 'citywalk'], indoor: false, emoji: '🌊', description: '江边散步，对岸太阳岛索道。' },
    { id: 'hb-daowai', destinationId: 'route-heilongjiang', name: '老道外中华巴洛克', category: 'culture', x: 58, y: 60, lng: 126.6700, lat: 45.7670, rating: 4.4, avgCost: 60, durationMin: 90, open: '09:00', close: '21:00', tags: ['culture', 'architecture', 'photo', 'food'], indoor: false, emoji: '🏘️', description: '国内最大中华巴洛克建筑群，老字号小吃密集。' },
    // ── 伊春（东北支线，森林秋色）──
    { id: 'yc-wuying', destinationId: 'route-heilongjiang', name: '五营国家森林公园', category: 'nature', x: 72, y: 30, lng: 129.2700, lat: 48.1330, rating: 4.7, avgCost: 80, durationMin: 240, fullDay: true, open: '08:00', close: '17:00', tags: ['nature', 'photo', 'outdoor', 'niche'], indoor: false, emoji: '🌲', description: '红松原始林，五花山秋色核心。建议单独半天到一天。' },
    { id: 'yc-tangwanghe', destinationId: 'route-heilongjiang', name: '汤旺河林海奇石', category: 'nature', x: 80, y: 22, lng: 129.5700, lat: 48.4700, rating: 4.6, avgCost: 95, durationMin: 180, open: '08:00', close: '17:00', tags: ['nature', 'photo', 'outdoor'], indoor: false, emoji: '🪨', description: '花岗岩石林与原始林交织，徒步看秋色。' },
    { id: 'yc-maolan', destinationId: 'route-heilongjiang', name: '嘉荫茅兰沟', category: 'nature', x: 86, y: 28, lng: 130.4300, lat: 48.5300, rating: 4.6, avgCost: 65, durationMin: 180, open: '08:00', close: '17:00', tags: ['nature', 'photo', 'outdoor', 'niche'], indoor: false, emoji: '🍁', description: '峡谷溪流与红叶，人称「北方九寨」。' },
    { id: 'yc-xishui', destinationId: 'route-heilongjiang', name: '上甘岭溪水森林公园', category: 'nature', x: 74, y: 34, lng: 129.0700, lat: 47.8800, rating: 4.4, avgCost: 50, durationMin: 150, open: '08:00', close: '17:00', tags: ['nature', 'chill', 'outdoor'], indoor: false, emoji: '🌿', description: '小兴安岭深处，负氧离子高，轻松徒步。' },
    // ── 长春（南端收尾）──
    { id: 'cc-weiman', destinationId: 'route-heilongjiang', name: '伪满皇宫博物院', category: 'culture', x: 30, y: 80, lng: 125.4200, lat: 43.9900, rating: 4.6, avgCost: 70, durationMin: 180, open: '08:30', close: '17:00', tags: ['culture', 'museum', 'photo', 'history'], indoor: true, emoji: '🏯', description: '近代史重要遗址，建议预留半天。' },
    { id: 'cc-jingyue', destinationId: 'route-heilongjiang', name: '净月潭国家森林公园', category: 'nature', x: 24, y: 88, lng: 125.4300, lat: 43.7300, rating: 4.5, avgCost: 30, durationMin: 180, open: '06:00', close: '19:00', tags: ['nature', 'outdoor', 'photo', 'chill'], indoor: false, emoji: '🌳', description: '长春绿肺，环潭骑行或徒步。' },
    { id: 'cc-zheyou', destinationId: 'route-heilongjiang', name: '这有山', category: 'shopping', x: 34, y: 78, lng: 125.2900, lat: 43.8600, rating: 4.5, avgCost: 120, durationMin: 120, open: '10:00', close: '22:00', tags: ['shopping', 'food', 'photo', 'citywalk'], indoor: true, emoji: '🛍️', description: '室内山景商业体，网红打卡与餐饮。' },
    { id: 'cc-changying', destinationId: 'route-heilongjiang', name: '长影旧址博物馆', category: 'culture', x: 32, y: 84, lng: 125.3000, lat: 43.8800, rating: 4.4, avgCost: 90, durationMin: 150, open: '09:00', close: '17:00', tags: ['culture', 'museum', 'niche'], indoor: true, emoji: '🎬', description: '新中国电影摇篮，老影院与展陈。' },
  ],
};

export function getPlaces(destId: string): Place[] {
  // 只返回真实精编地点（CURATED）。没有精编数据的目的地一律返回空数组，
  // 绝不编造坐标 / 评分 / 价格 / 地址伪装成真实 POI（产品硬规则）。
  return CURATED[destId] ?? [];
}

export function getPlace(destId: string, placeId: string): Place | undefined {
  return getPlaces(destId).find((p) => p.id === placeId);
}

/** 跨所有目的地按 id 找地点（用于全局地点收藏等脱离单目的地的场景） */
export function getPlaceAnywhere(placeId: string): Place | undefined {
  for (const destId of Object.keys(CURATED)) {
    const found = CURATED[destId].find((p) => p.id === placeId);
    if (found) return found;
  }
  return undefined;
}

/** 按关键词（名称包含 / 被包含）跨所有目的地模糊找地点，用于小红书导入识别地点 */
export function searchPlacesByName(kw: string): Place[] {
  const q = kw.trim().toLowerCase();
  if (!q) return [];
  const out: Place[] = [];
  for (const destId of Object.keys(CURATED)) {
    for (const p of CURATED[destId]) {
      if (p.name.toLowerCase().includes(q) || q.includes(p.name.toLowerCase())) out.push(p);
    }
  }
  return out.slice(0, 6);
}

/**
 * 多城市：解析一趟旅行的城市列表。
 * 有 destinationIds 用有序列表，否则退化为 [destinationId]。
 */
export function resolveCityIds(trip: { destinationIds?: string[]; destinationId: string }): string[] {
  return trip.destinationIds && trip.destinationIds.length ? trip.destinationIds : [trip.destinationId];
}

/** 合并一趟旅行所有城市的地点（用于地点池 / AI 规划） */
export function getPlacesForTrip(trip: { destinationIds?: string[]; destinationId: string }): Place[] {
  return resolveCityIds(trip).flatMap((id) => getPlaces(id));
}

/** 跨城查找地点（按城市顺序，找到即返回） */
export function findPlace(
  trip: { destinationIds?: string[]; destinationId: string } | undefined,
  placeId: string,
): Place | undefined {
  if (!trip) return undefined;
  for (const id of resolveCityIds(trip)) {
    const p = getPlace(id, placeId);
    if (p) return p;
  }
  return undefined;
}
