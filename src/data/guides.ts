import type { TravelGuide, GuideContent, GuideKind, PlaybookType } from '@/types';
import { getDestination } from '@/data/destinations';

/**
 * 目的地结构化攻略（Phase V2：Guide → Playbook → Plan）。
 *
 * 硬约束（来自产品规则）：
 *  - 所有 Playbook.stop.placeId 必须指向 CURATED / 真实地点池里的真实 POI，
 *    禁止编造不存在的地点 / 坐标 / 评分 / 价格。
 *  - playbooks 是「可执行计划模板」，一键「加入我的旅行」即映射成 Trip 的 Day + Activity，
 *    因此 stop 必须带真实时间 / 停留 / 顺序 / 交通，不能是「上午自由活动」这类模糊描述。
 *  - 无对应真实 POI 的目的地不写 Guide；缺数据的地方由 applyPlaybookToTrip 跳过并提示，
 *    绝不临时生成假 POI 补齐。
 */
export const GUIDES: Record<string, TravelGuide> = {
  // ───────────────────────── 西安 ─────────────────────────
  xian: {
    destinationId: 'xian',
    overview:
      '十三朝古都，历史密度极高：从兵马俑到大雁塔，从城墙到回民街，一条线就能串起周秦汉唐。第一次来建议把临潼东线（兵马俑+华清宫）单独留一天，市区文化线（陕历博+大雁塔+不夜城）留一天，古城墙片区留半天到一天。',
    bestTime: '3–5 月、9–11 月最舒服；避开 7–8 月高温与节假日人潮。',
    recommendedDays: '3–5 天',
    audience: ['first-timer', 'family', 'friends', 'any'],
    intensity: 'medium',
    highlights: ['兵马俑', '陕西历史博物馆', '城墙', '回民街', '大唐不夜城'],
    areas: [
      {
        id: 'xa-area-lintong',
        name: '临潼东线',
        summary: '兵马俑与华清宫所在，距市区约 1 小时车程，建议单独安排一天。',
        placeIds: ['xa-bingmayong', 'xa-huaqing'],
      },
      {
        id: 'xa-area-wall',
        name: '城墙南门片区',
        summary: '南门上城墙，顺路碑林、钟楼，步行可达。',
        placeIds: ['xa-wall', 'xa-beilin', 'xa-zhonglou'],
      },
      {
        id: 'xa-area-qujiang',
        name: '曲江片区',
        summary: '大雁塔、大唐不夜城、陕西历史博物馆集中于此，夜景与展览都在这里。',
        placeIds: ['xa-dayan', 'xa-datang', 'xa-shanxi'],
      },
    ],
    playbooks: [
      {
        id: 'xa-classic-3d',
        title: '三日经典玩法',
        type: 'classic',
        durationDays: 3,
        audience: ['first-timer', 'any'],
        intensity: 'medium',
        summary: '第一次来西安最稳的走法：东线一天、市区文化一天、古城墙半天补完。',
        days: [
          {
            index: 1,
            title: '临潼东线：兵马俑 + 华清宫',
            stops: [
              { placeId: 'xa-bingmayong', time: '09:00', duration: 240, order: 1 },
              {
                placeId: 'xa-huaqing',
                time: '14:00',
                duration: 150,
                order: 2,
                transportFromPrevious: { mode: 'taxi', min: 40 },
              },
            ],
          },
          {
            index: 2,
            title: '市区文化线：博物馆 + 大雁塔 + 不夜城',
            stops: [
              { placeId: 'xa-shanxi', time: '09:30', duration: 180, order: 1 },
              {
                placeId: 'xa-dayan',
                time: '13:30',
                duration: 90,
                order: 2,
                transportFromPrevious: { mode: 'walk', min: 15 },
              },
              {
                placeId: 'xa-datang',
                time: '16:30',
                duration: 120,
                order: 3,
                transportFromPrevious: { mode: 'walk', min: 10 },
              },
              {
                placeId: 'xa-huimin',
                time: '19:30',
                duration: 90,
                order: 4,
                transportFromPrevious: { mode: 'taxi', min: 20 },
              },
            ],
          },
          {
            index: 3,
            title: '古城墙片区：城墙 + 碑林 + 钟楼 + 小雁塔',
            stops: [
              { placeId: 'xa-wall', time: '09:30', duration: 150, order: 1 },
              {
                placeId: 'xa-beilin',
                time: '13:00',
                duration: 90,
                order: 2,
                transportFromPrevious: { mode: 'walk', min: 10 },
              },
              {
                placeId: 'xa-zhonglou',
                time: '15:00',
                duration: 60,
                order: 3,
                transportFromPrevious: { mode: 'walk', min: 10 },
              },
              {
                placeId: 'xa-xiaoyan',
                time: '16:30',
                duration: 90,
                order: 4,
                transportFromPrevious: { mode: 'taxi', min: 15 },
              },
            ],
          },
        ],
        tips: [
          '兵马俑与陕历博都需提前预约，旺季建议提前 1–3 天。',
          '城墙可租自行车骑行一圈（约 14 公里），傍晚上墙体感最好。',
          '回民街更适合晚上去，白天很多店没开。',
        ],
      },
      {
        id: 'xa-half-wall',
        title: '半日：城墙 + 回民街',
        type: 'half-day',
        durationDays: 1,
        audience: ['any', 'solo'],
        intensity: 'low',
        summary: '时间紧就上城墙走一段，傍晚顺路回民街吃一顿。',
        days: [
          {
            index: 1,
            title: '下午：城墙骑行 + 回民街',
            stops: [
              { placeId: 'xa-wall', time: '15:00', duration: 120, order: 1 },
              {
                placeId: 'xa-huimin',
                time: '17:30',
                duration: 90,
                order: 2,
                transportFromPrevious: { mode: 'walk', min: 15 },
              },
            ],
          },
        ],
        tips: ['城墙南门（永宁门）上去最方便，离钟楼、回民街都近。'],
      },
      {
        id: 'xa-couple',
        title: '情侣：大雁塔 + 不夜城 + 城墙夜游',
        type: 'couple',
        durationDays: 1,
        audience: ['partner'],
        intensity: 'low',
        summary: '白天大雁塔，傍晚不夜城看演出，晚上城墙夜景收尾。',
        days: [
          {
            index: 1,
            title: '一日：慢节奏的唐风浪漫',
            stops: [
              { placeId: 'xa-dayan', time: '10:00', duration: 90, order: 1 },
              {
                placeId: 'xa-datang',
                time: '16:00',
                duration: 120,
                order: 2,
                transportFromPrevious: { mode: 'walk', min: 10 },
              },
              {
                placeId: 'xa-wall',
                time: '19:30',
                duration: 90,
                order: 3,
                transportFromPrevious: { mode: 'taxi', min: 20 },
              },
            ],
          },
        ],
        tips: ['不夜城夜晚的演出和灯光最适合拍照，建议 18:30 后到。'],
      },
      {
        id: 'xa-friends',
        title: '朋友：回民街 + 钟楼 + 不夜城',
        type: 'friends',
        durationDays: 1,
        audience: ['friends'],
        intensity: 'medium',
        summary: '吃、逛、夜景一条龙，适合一群人边走边拍。',
        days: [
          {
            index: 1,
            title: '一日：吃逛拍',
            stops: [
              { placeId: 'xa-huimin', time: '11:00', duration: 90, order: 1 },
              {
                placeId: 'xa-zhonglou',
                time: '13:00',
                duration: 60,
                order: 2,
                transportFromPrevious: { mode: 'walk', min: 10 },
              },
              {
                placeId: 'xa-datang',
                time: '19:00',
                duration: 120,
                order: 3,
                transportFromPrevious: { mode: 'taxi', min: 20 },
              },
            ],
          },
        ],
        tips: ['回民街小吃分着买、多试几样比正餐划算。'],
      },
      {
        id: 'xa-low',
        title: '低能量：陕历博 + 回民街',
        type: 'low-energy',
        durationDays: 1,
        audience: ['any', 'solo'],
        intensity: 'low',
        summary: '只去两个 indoor 友好点，累了就歇，不赶路。',
        days: [
          {
            index: 1,
            title: '一日：博物馆 + 吃',
            stops: [
              { placeId: 'xa-shanxi', time: '10:00', duration: 180, order: 1 },
              {
                placeId: 'xa-huimin',
                time: '14:00',
                duration: 90,
                order: 2,
                transportFromPrevious: { mode: 'taxi', min: 20 },
              },
            ],
          },
        ],
        tips: ['陕历博空调足、有座椅，累了随时歇；珍宝馆值得另买票。'],
      },
    ],
    tips: [
      '节假日人流极大，热门馆提前预约、热门景区早去。',
      '夏季高温，户外（城墙、兵马俑）尽量安排在上午或傍晚。',
      '地铁 + 打车组合最省心，临潼东线打车约 1 小时。',
    ],
  },

  // ───────────────────────── 东京 ─────────────────────────
  tokyo: {
    destinationId: 'tokyo',
    overview:
      '传统与潮流并存：浅草的寺、上野的博物馆、涩谷原宿的街、台场的夜。第一次来建议老城一天、潮流一天、海湾/迪士尼一天。',
    bestTime: '3–5 月樱花季、10–11 月红叶季最佳；避开 7–8 月酷暑与年末人潮。',
    recommendedDays: '4–6 天',
    audience: ['first-timer', 'friends', 'family', 'any'],
    intensity: 'medium',
    highlights: ['浅草寺', '上野公园', '涩谷', 'teamLab', '迪士尼'],
    playbooks: [
      {
        id: 'tk-classic-3d',
        title: '三日经典玩法',
        type: 'classic',
        durationDays: 3,
        audience: ['first-timer', 'any'],
        intensity: 'medium',
        summary: '老城、潮流、海湾各一天，节奏均衡。',
        days: [
          {
            index: 1,
            title: '老城：浅草 + 上野',
            stops: [
              { placeId: 'tk-sensoji', time: '09:30', duration: 90, order: 1 },
              {
                placeId: 'tk-ueno',
                time: '13:00',
                duration: 120,
                order: 2,
                transportFromPrevious: { mode: 'walk', min: 15 },
              },
              {
                placeId: 'tk-yanaka',
                time: '16:00',
                duration: 90,
                order: 3,
                transportFromPrevious: { mode: 'walk', min: 10 },
              },
            ],
          },
          {
            index: 2,
            title: '潮流：原宿 + 涩谷 + 六本木',
            stops: [
              { placeId: 'tk-harajuku', time: '11:00', duration: 90, order: 1 },
              {
                placeId: 'tk-shibuya',
                time: '14:00',
                duration: 60,
                order: 2,
                transportFromPrevious: { mode: 'train', min: 15 },
              },
              {
                placeId: 'tk-mori',
                time: '16:30',
                duration: 120,
                order: 3,
                transportFromPrevious: { mode: 'train', min: 20 },
              },
            ],
          },
          {
            index: 3,
            title: '海湾：筑地 + teamLab + 台场',
            stops: [
              { placeId: 'tk-sushizanmai', time: '09:00', duration: 90, order: 1 },
              {
                placeId: 'tk-teamlab',
                time: '11:30',
                duration: 90,
                order: 2,
                transportFromPrevious: { mode: 'taxi', min: 25 },
              },
              {
                placeId: 'tk-onsen',
                time: '15:00',
                duration: 180,
                order: 3,
                transportFromPrevious: { mode: 'taxi', min: 25 },
              },
            ],
          },
        ],
        tips: ['teamLab 与迪士尼都需提前预约时段；筑地建议上午去。'],
      },
      {
        id: 'tk-food',
        title: '一日美食：筑地 + 银座 + 下北泽',
        type: 'food',
        durationDays: 1,
        audience: ['friends', 'solo'],
        intensity: 'low',
        summary: '从海鲜早餐到古着咖啡，一天吃逛。',
        days: [
          {
            index: 1,
            title: '一日：吃',
            stops: [
              { placeId: 'tk-sushizanmai', time: '08:00', duration: 90, order: 1 },
              {
                placeId: 'tk-ginza',
                time: '11:00',
                duration: 150,
                order: 2,
                transportFromPrevious: { mode: 'walk', min: 15 },
              },
              {
                placeId: 'tk-shimokita',
                time: '16:00',
                duration: 120,
                order: 3,
                transportFromPrevious: { mode: 'train', min: 20 },
              },
            ],
          },
        ],
        tips: ['筑地场外市场上午最新鲜，很多店 14:00 就收。'],
      },
    ],
    tips: ['地铁为主，买 Suica / PASMO 最方便；迪士尼建议单独留一整天。'],
  },

  // ───────────────────────── 成都 ─────────────────────────
  chengdu: {
    destinationId: 'chengdu',
    overview:
      '熊猫、火锅、老街、周边山水都在这里。市区慢，周边都江堰/青城山值得单日往返。',
    bestTime: '3–5 月、9–11 月最舒服；熊猫基地建议开园即入。',
    recommendedDays: '3–4 天',
    audience: ['first-timer', 'friends', 'family', 'any'],
    intensity: 'low',
    highlights: ['大熊猫基地', '宽窄巷子', '都江堰', '锦里'],
    playbooks: [
      {
        id: 'cd-classic-3d',
        title: '三日经典玩法',
        type: 'classic',
        durationDays: 3,
        audience: ['first-timer', 'any'],
        intensity: 'low',
        summary: '熊猫+文化一天、老城一天、周边山水一天。',
        days: [
          {
            index: 1,
            title: '熊猫 + 武侯祠 + 锦里',
            stops: [
              { placeId: 'cd-panda', time: '07:30', duration: 180, order: 1 },
              {
                placeId: 'cd-wuhou',
                time: '13:00',
                duration: 90,
                order: 2,
                transportFromPrevious: { mode: 'taxi', min: 30 },
              },
              {
                placeId: 'cd-jinli',
                time: '15:00',
                duration: 90,
                order: 3,
                transportFromPrevious: { mode: 'walk', min: 5 },
              },
            ],
          },
          {
            index: 2,
            title: '老城：宽窄 + 望平 + 玉林',
            stops: [
              { placeId: 'cd-kuanzhai', time: '10:00', duration: 90, order: 1 },
              {
                placeId: 'cd-wangping',
                time: '14:00',
                duration: 90,
                order: 2,
                transportFromPrevious: { mode: 'taxi', min: 15 },
              },
              {
                placeId: 'cd-yulin',
                time: '19:00',
                duration: 120,
                order: 3,
                transportFromPrevious: { mode: 'taxi', min: 15 },
              },
            ],
          },
          {
            index: 3,
            title: '周边：都江堰 + 青城山',
            stops: [
              { placeId: 'cd-dujiangyan', time: '08:00', duration: 240, order: 1 },
              {
                placeId: 'cd-qingcheng',
                time: '14:00',
                duration: 240,
                order: 2,
                transportFromPrevious: { mode: 'taxi', min: 20 },
              },
            ],
          },
        ],
        tips: ['熊猫基地开园（约 7:30）最活跃；都江堰/青城山城际高铁约 30 分钟。'],
      },
    ],
    tips: ['火锅店排队久，建议错峰或提前取号；玉林路小酒馆适合晚上。'],
  },
};

/** 取目的地攻略；无则返回 undefined（页面据此显示「暂无攻略」，不编造） */
export function getGuide(destinationId: string): TravelGuide | undefined {
  return GUIDES[destinationId];
}

// ─────────────────────────────────────────────────────────────
// Guide Market（攻略市场）内容池
//
// 攻略市场与「当前 Trip」解耦：用户即使没有任何旅行，也能浏览、收藏、
// 导入、组合攻略内容。内容池 = 目的地 Guide 派生 + 系统策展主题卡。
// 用户导入 / 自建的攻略不落这里，由 store.guideContents 提供（见 features/guide）。
// ─────────────────────────────────────────────────────────────

const KIND_OF_PLAYBOOK: Record<PlaybookType, GuideKind> = {
  classic: 'route',
  'half-day': 'route',
  'one-day': 'route',
  couple: 'audience',
  friends: 'audience',
  solo: 'audience',
  food: 'play',
  'low-energy': 'play',
  'high-energy': 'play',
};

function cityName(id: string): string {
  return getDestination(id)?.name ?? id;
}

/** 从推荐天数里取首个整数（如「3–5 天」→ 3） */
function leadDays(s: string): number | undefined {
  const m = s.match(/\d+/);
  return m ? Number(m[0]) : undefined;
}

/** 从目的地 Guide 派生市场内容：每城一张城市卡 + 每个玩法一张卡 */
function deriveFromGuides(): GuideContent[] {
  const out: GuideContent[] = [];
  for (const g of Object.values(GUIDES)) {
    const dest = g.destinationId;
    const execPb = g.playbooks.find((p) => p.type === 'classic') ?? g.playbooks[0];
    const cityPlaceIds = Array.from(
      new Set(g.playbooks.flatMap((p) => p.days.flatMap((d) => d.stops.map((s) => s.placeId)))),
    );
    out.push({
      id: `city:${dest}`,
      kind: 'city',
      source: 'official',
      title: `${cityName(dest)}怎么玩`,
      destinationIds: [dest],
      audience: g.audience,
      durationDays: leadDays(g.recommendedDays),
      bestTime: g.bestTime,
      themes: ['城市', '经典'],
      summary: g.overview,
      placeIds: cityPlaceIds,
      days: execPb?.days,
      tips: g.tips,
      playbookRef: execPb ? { destinationId: dest, playbookId: execPb.id } : undefined,
    });
    for (const pb of g.playbooks) {
      const placeIds = Array.from(
        new Set(pb.days.flatMap((d) => d.stops.map((s) => s.placeId))),
      );
      out.push({
        id: pb.id,
        kind: KIND_OF_PLAYBOOK[pb.type],
        source: 'official',
        title: pb.title,
        destinationIds: [dest],
        audience: pb.audience,
        durationDays: pb.durationDays,
        themes: [pb.type, pb.intensity].filter(Boolean) as string[],
        summary: pb.summary,
        placeIds,
        days: pb.days,
        tips: pb.tips,
        playbookRef: { destinationId: dest, playbookId: pb.id },
      });
    }
  }
  return out;
}

/**
 * 系统策展的跨目的地主题 / 玩法 / 人群攻略（内容卡，链接到现有目的地 Guide）。
 * 不编造 POI，只做灵感与发现；点开会进入对应目的地攻略或第一个城市卡。
 */
const CURATED_THEME_GUIDES: GuideContent[] = [
  {
    id: 'theme-winter-snow',
    kind: 'theme',
    source: 'official',
    title: '冬天去哪看雪',
    destinationIds: ['xian', 'route-heilongjiang', 'sanya'],
    audience: ['any', 'family', 'friends'],
    bestTime: '12 月–次年 2 月',
    themes: ['冬季', '看雪', '冰雪', '跨年'],
    summary: '想看雪又怕冷？哈尔滨冰雪大世界、西安古城雪景、长白山温泉雪景都在这。',
    placeIds: [],
  },
  {
    id: 'theme-food',
    kind: 'theme',
    source: 'official',
    title: '为了吃也要去一次',
    destinationIds: ['chengdu', 'tokyo', 'chongqing'],
    audience: ['any', 'friends', 'solo'],
    themes: ['美食', '吃货', '夜市'],
    summary: '火锅、筑地、夜市小摊——把胃口排进行程里。',
    placeIds: [],
  },
  {
    id: 'theme-couple',
    kind: 'audience',
    source: 'official',
    title: '情侣去哪都浪漫',
    destinationIds: ['xian', 'dali', 'okinawa'],
    audience: ['partner'],
    themes: ['情侣', '浪漫', '拍照'],
    summary: '大雁塔夜景、洱海骑行、海岛日落——两个人的旅行清单。',
    placeIds: [],
  },
  {
    id: 'theme-solo',
    kind: 'audience',
    source: 'official',
    title: '一个人也能很自在',
    destinationIds: ['tokyo', 'chengdu', 'singapore'],
    audience: ['solo', 'any'],
    themes: ['独行', '一个人', '自由'],
    summary: '不用迁就任何人：博物馆、古着街、夜市，慢下来才是旅行。',
    placeIds: [],
  },
  {
    id: 'theme-weekend',
    kind: 'theme',
    source: 'official',
    title: '周末短途逃离城市',
    destinationIds: ['hangzhou', 'dali', 'quanzhou', 'jingdezhen'],
    audience: ['any', 'friends', 'partner'],
    bestTime: '周末',
    themes: ['周末', '短途', '周边', 'City Walk'],
    summary: '不请假也能走：高铁 2 小时圈里的慢生活目的地。',
    placeIds: [],
  },
  {
    id: 'theme-citywalk',
    kind: 'play',
    source: 'official',
    title: 'City Walk 怎么逛',
    destinationIds: ['chengdu', 'hangzhou', 'chongqing'],
    audience: ['any', 'friends', 'solo'],
    themes: ['City Walk', '步行', '老街', '拍照'],
    summary: '一条能步行的路线，把老街、咖啡、独立书店串起来。',
    placeIds: [],
  },
  {
    id: 'theme-escape-crowd',
    kind: 'theme',
    source: 'official',
    title: '国庆不想人挤人',
    destinationIds: ['jingdezhen', 'quanzhou', 'dali', 'chiangmai'],
    audience: ['any', 'friends', 'family'],
    bestTime: '国庆 / 节假日',
    themes: ['小众', '避开人潮', '冷门'],
    summary: '把热门城市换成小众目的地，体验密度一点不低。',
    placeIds: [],
  },
  {
    id: 'theme-first-overseas',
    kind: 'audience',
    source: 'official',
    title: '第一次出国去哪',
    destinationIds: ['tokyo', 'osaka', 'bangkok', 'singapore'],
    audience: ['first-timer', 'any'],
    themes: ['出境', '第一次', '签证友好'],
    summary: '签证简单、交通友好、节奏适合新手的第一批出境目的地。',
    placeIds: [],
  },
];

/** 攻略市场静态内容池（目的地 Guide 派生 + 策展主题卡） */
export function getGuideContents(): GuideContent[] {
  return [...deriveFromGuides(), ...CURATED_THEME_GUIDES];
}

/** 在静态池里按 id 取一条攻略内容 */
export function getStaticGuideContent(id: string): GuideContent | undefined {
  return getGuideContents().find((g) => g.id === id);
}
