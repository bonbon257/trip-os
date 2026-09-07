/**
 * 周末「去哪玩」统一的地点质量门槛（纯函数，可被前端与 build-spin-pool 脚本共用）。
 *
 * 这是 **唯一** 的周末候选质量规则来源。大转盘（Roulette）、附近（Nearby）、
 * 城市级发现（City Discovery）、实时探索（Explore）都走同一套基础门槛，
 * 避免出现「某条入口漏放小区 / 花园 / 居民楼」这类低价值 POI。
 *
 * 原则（见 P0-2/P0-3）：
 *   · 真实 POI ≠ 高质量推荐 POI —— 高德返回的数据必须先过这道价值判断才能进候选池。
 *   · 不删除真实高质量 POI（如真实景区、名校、博物馆），只拦明显非玩乐的地点。
 *   · 不编造 POI。
 */

export interface QualitySpot {
  category?: string;
  name?: string;
}

/** 按名称剔除明显不是玩乐目的地的 POI（纪念 / 殡葬 / 交通 / 政企 / 宗教 等） */
export const JUNK_NAME: string[] = [
  '墓', '陵园', '烈士', '纪念', '革命', '抗日', '抗战', '解放碑', '解放塔',
  '殡', '看守', '监狱', '派出所', '加油', '停车', '收费', '办事',
  '公司', '工厂', '基地', '养老', '福利院', '殡仪', '卫生服务', '卫生所',
  '管理处', '管理局', '指挥', '仓库', '实验', '培训学校', '中心校',
  '售票', '公交站', '公交', '地铁站', '地铁', '入口', '出口', '打卡点', '舞台', '酒店',
  '寺', '庙', '教堂', '道观', '清真', '庵', '福音堂', '基督教', '福音',
];

/** 按高德分类名剔除非玩乐类（汽车 / 金融 / 政企 / 医疗 / 交通 等） */
export const JUNK_CATEGORY: string[] = [
  '汽车服务', '汽车维修', '摩托车', '加油', '充电', '金融', '银行', 'ATM',
  '公司', '工厂', '行政', '政府机构', '政党', '社会团体', '公检法', '医疗',
  '卫生院', '医院', '诊所', '急救', '殡葬', '道路', '出入口', '收费站',
  '公共厕所', '车辆', '交通', '公交', '地铁', '售票',
];

/**
 * 住宅 / 生活区类名称关键词 —— 高德「景点 / 公园」分类下常混进这些非游玩地点。
 * 例如「金色家园」「阳光花园」「XX小区」「XX公寓」「XX别墅区」「教师家属院」。
 */
export const RESIDENTIAL_NAME: string[] = [
  '小区', '花园', '居民楼', '住宅', '公寓', '组团', '别墅', '住宅区',
  '宿舍', '家属院', '生活区', '安置区', '社区', '家园', '雅苑', '新村',
];

/**
 * 风景名胜区豁免：名字里虽含 RESIDENTIAL_NAME 中的词（如「世博花园」），
 * 但同时带有这些明显是景区的 token，就不算低价值住宅，放行。
 */
const SCENIC_SAFE = /公园|植物园|花卉|园博|博览|湿|绿道|景|山|湖|海|岛|江|河|主题|乐园|游乐|景区|度假|雕塑|广场|古城|古镇|老街|遗址|故居/;

/**
 * 基础质量门槛：是否为「能玩能逛」的周末候选。
 * Roulette / Nearby / City Discovery / Explore 全部共用。
 */
export function isWeekendCandidate(spot: QualitySpot): boolean {
  const name = spot.name ?? '';
  const cat = spot.category ?? '';
  if (JUNK_NAME.some((k) => name.includes(k))) return false;
  if (JUNK_CATEGORY.some((k) => cat.includes(k))) return false;
  // 住宅 / 生活区：除非名字同时明显是景区，否则剔除
  if (RESIDENTIAL_NAME.some((k) => name.includes(k)) && !SCENIC_SAFE.test(name)) return false;
  return true;
}
