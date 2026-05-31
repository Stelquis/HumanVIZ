/**
 * 朝代数据定义 — 衔尾龙之环
 * 北京城市演化历史时间线
 */

export interface Dynasty {
  id: string;
  nameCn: string;
  nameEn: string;
  startYear: number; // 负数表示公元前
  endYear: number;
  color: string; // 中国传统色
  capital: string; // 北京地区当时的名称
  description: string;
}

export interface DataDimension {
  id: string;
  nameCn: string;
  nameEn: string;
  icon: string;
  datasetId: string; // 对应 SQLite 中的 dataset_id
  color: string;
  category: "nature" | "society" | "culture" | "military";
}

// 15 个朝代/时期 — 北京城市演化关键节点
export const DYNASTIES: Dynasty[] = [
  {
    id: "neolithic",
    nameCn: "先秦",
    nameEn: "Pre-Qin",
    startYear: -6000,
    endYear: -221,
    color: "#8B6914", // 赭黄
    capital: "蓟",
    description: "北京地区人类活动的起源，周口店北京猿人遗址，燕国都城蓟城",
  },
  {
    id: "qin",
    nameCn: "秦",
    nameEn: "Qin",
    startYear: -221,
    endYear: -206,
    color: "#C41E3A", // 朱红
    capital: "蓟县",
    description: "秦统一六国，蓟城为广阳郡治所",
  },
  {
    id: "western_han",
    nameCn: "西汉",
    nameEn: "Western Han",
    startYear: -206,
    endYear: 25,
    color: "#E25822", // 赭橙
    capital: "蓟城",
    description: "西汉燕国都城，北方军事重镇",
  },
  {
    id: "eastern_han",
    nameCn: "东汉",
    nameEn: "Eastern Han",
    startYear: 25,
    endYear: 220,
    color: "#D4A017", // 金黄
    capital: "蓟城",
    description: "幽州治所，北方交通枢纽",
  },
  {
    id: "wei_jin",
    nameCn: "魏晋南北朝",
    nameEn: "Wei-Jin S. Dynasties",
    startYear: 220,
    endYear: 581,
    color: "#5B7065", // 青灰
    capital: "蓟城/幽州",
    description: "民族融合时期，佛教文化传入",
  },
  {
    id: "sui",
    nameCn: "隋",
    nameEn: "Sui",
    startYear: 581,
    endYear: 618,
    color: "#4B5320", // 军绿
    capital: "涿郡",
    description: "大运河北端，南北交通要冲",
  },
  {
    id: "tang",
    nameCn: "唐",
    nameEn: "Tang",
    startYear: 618,
    endYear: 907,
    color: "#6A5ACD", // 紫蓝
    capital: "幽州",
    description: "安史之乱重要战场，藩镇割据时期",
  },
  {
    id: "five_dynasties",
    nameCn: "五代",
    nameEn: "Five Dynasties",
    startYear: 907,
    endYear: 960,
    color: "#708090", // 石板灰
    capital: "幽州",
    description: "政权更迭频繁，幽州归属多变",
  },
  {
    id: "liao",
    nameCn: "辽",
    nameEn: "Liao",
    startYear: 907,
    endYear: 1125,
    color: "#2E8B57", // 海绿
    capital: "南京(燕京)",
    description: "辽陪都南京，契丹文化与汉族文化交融",
  },
  {
    id: "jin",
    nameCn: "金",
    nameEn: "Jin",
    startYear: 1115,
    endYear: 1234,
    color: "#DAA520", // 金菊
    capital: "中都",
    description: "金中都，北京首次成为王朝首都",
  },
  {
    id: "yuan",
    nameCn: "元",
    nameEn: "Yuan",
    startYear: 1206,
    endYear: 1368,
    color: "#B22222", // 火砖红
    capital: "大都",
    description: "元大都，世界性大都市，马可·波罗到访",
  },
  {
    id: "ming",
    nameCn: "明",
    nameEn: "Ming",
    startYear: 1368,
    endYear: 1644,
    color: "#1E90FF", // 道奇蓝
    capital: "北京(北平)",
    description: "明成祖迁都北京，紫禁城建成，长城修建",
  },
  {
    id: "qing",
    nameCn: "清",
    nameEn: "Qing",
    startYear: 1644,
    endYear: 1911,
    color: "#800080", // 紫
    capital: "京师",
    description: "清代京师，三山五园建设，近代化开端",
  },
];

// 15 个数据维度
export const DIMENSIONS: DataDimension[] = [
  {
    id: "waterway",
    nameCn: "水系",
    nameEn: "Waterways",
    icon: "🌊",
    datasetId: "02水系 - 总数据和各朝代数据",
    color: "#4FC3F7",
    category: "nature",
  },
  {
    id: "climate",
    nameCn: "气候",
    nameEn: "Climate",
    icon: "🌡️",
    datasetId: "03气候 - 总数据和各朝代数据",
    color: "#FFB74D",
    category: "nature",
  },
  {
    id: "vegetation",
    nameCn: "植被",
    nameEn: "Vegetation",
    icon: "🌿",
    datasetId: "04植被 - 总数据和各朝代数据",
    color: "#81C784",
    category: "nature",
  },
  {
    id: "disaster",
    nameCn: "灾害",
    nameEn: "Disasters",
    icon: "⚡",
    datasetId: "05灾害 - 总数据和各朝代数据",
    color: "#EF5350",
    category: "nature",
  },
  {
    id: "admin",
    nameCn: "建制沿革",
    nameEn: "Administration",
    icon: "📜",
    datasetId: "07建制沿革 - 总数据和各朝代数据",
    color: "#FFD54F",
    category: "society",
  },
  {
    id: "key_building",
    nameCn: "重点建筑",
    nameEn: "Key Buildings",
    icon: "🏛️",
    datasetId: "09重点建筑 - 总数据和各朝代数据",
    color: "#BCAAA4",
    category: "culture",
  },
  {
    id: "other_building",
    nameCn: "其他建筑",
    nameEn: "Other Buildings",
    icon: "🏘️",
    datasetId: "10其他建筑 - 总数据和各朝代数据",
    color: "#A1887F",
    category: "culture",
  },
  {
    id: "population",
    nameCn: "人口",
    nameEn: "Population",
    icon: "👥",
    datasetId: "11人口 - 总数据和各朝代数据",
    color: "#4DB6AC",
    category: "society",
  },
  {
    id: "culture",
    nameCn: "文化",
    nameEn: "Culture",
    icon: "🎭",
    datasetId: "13文化 - 总数据和各朝代数据",
    color: "#9575CD",
    category: "culture",
  },
  {
    id: "commerce",
    nameCn: "商业手工业",
    nameEn: "Commerce",
    icon: "🏪",
    datasetId: "14商业手工业 -总数据和各朝代数据",
    color: "#FF8A65",
    category: "society",
  },
  {
    id: "product",
    nameCn: "物产",
    nameEn: "Products",
    icon: "📦",
    datasetId: "15物产 - 总数据和各朝代数据",
    color: "#AED581",
    category: "society",
  },
  {
    id: "transport",
    nameCn: "交通",
    nameEn: "Transportation",
    icon: "🚂",
    datasetId: "16交通 - 总数据和各朝代数据",
    color: "#64B5F6",
    category: "society",
  },
  {
    id: "event",
    nameCn: "事件",
    nameEn: "Events",
    icon: "📅",
    datasetId: "17事件 - 总数据和各朝代数据",
    color: "#E57373",
    category: "military",
  },
  {
    id: "war",
    nameCn: "战争",
    nameEn: "Wars",
    icon: "⚔️",
    datasetId: "18战争 - 总数据和各朝代数据",
    color: "#D32F2F",
    category: "military",
  },
  {
    id: "figure",
    nameCn: "人物",
    nameEn: "Figures",
    icon: "👤",
    datasetId: "19人物 - 总数据和各朝代数据",
    color: "#7986CB",
    category: "culture",
  },
];

// 按类别分组的维度
export const DIMENSION_CATEGORIES = {
  nature: { nameCn: "自然环境", icon: "🌍", dimensions: DIMENSIONS.filter((d) => d.category === "nature") },
  society: { nameCn: "社会经济", icon: "🏙️", dimensions: DIMENSIONS.filter((d) => d.category === "society") },
  culture: { nameCn: "文化建筑", icon: "🏛️", dimensions: DIMENSIONS.filter((d) => d.category === "culture") },
  military: { nameCn: "军事事件", icon: "⚔️", dimensions: DIMENSIONS.filter((d) => d.category === "military") },
};

// 朝代总时间跨度（用于计算角度）
export const TIME_SPAN_START = -6000;
export const TIME_SPAN_END = 1911;
export const TOTAL_YEARS = TIME_SPAN_END - TIME_SPAN_START;

// Mock 数据：各朝代各维度的记录数量（后续从后端获取）
export const MOCK_DYNASTY_DIMENSION_COUNTS: Record<string, Record<string, number>> = {
  neolithic: { waterway: 45, climate: 2, vegetation: 15, disaster: 30, admin: 80, key_building: 10, other_building: 50, population: 8, culture: 200, commerce: 150, product: 30, transport: 15, event: 50, war: 10, figure: 80 },
  qin: { waterway: 20, climate: 1, vegetation: 8, disaster: 15, admin: 60, key_building: 5, other_building: 30, population: 5, culture: 80, commerce: 60, product: 15, transport: 20, event: 30, war: 8, figure: 40 },
  western_han: { waterway: 35, climate: 2, vegetation: 12, disaster: 45, admin: 100, key_building: 15, other_building: 80, population: 12, culture: 180, commerce: 120, product: 40, transport: 35, event: 60, war: 20, figure: 90 },
  eastern_han: { waterway: 25, climate: 2, vegetation: 10, disaster: 35, admin: 80, key_building: 10, other_building: 60, population: 8, culture: 120, commerce: 80, product: 25, transport: 25, event: 40, war: 15, figure: 60 },
  wei_jin: { waterway: 30, climate: 3, vegetation: 18, disaster: 55, admin: 150, key_building: 20, other_building: 120, population: 15, culture: 300, commerce: 200, product: 50, transport: 40, event: 80, war: 30, figure: 150 },
  sui: { waterway: 15, climate: 1, vegetation: 5, disaster: 10, admin: 40, key_building: 8, other_building: 25, population: 4, culture: 60, commerce: 40, product: 12, transport: 20, event: 15, war: 5, figure: 25 },
  tang: { waterway: 50, climate: 4, vegetation: 25, disaster: 80, admin: 180, key_building: 30, other_building: 200, population: 20, culture: 500, commerce: 350, product: 80, transport: 60, event: 120, war: 35, figure: 250 },
  five_dynasties: { waterway: 10, climate: 1, vegetation: 5, disaster: 20, admin: 30, key_building: 5, other_building: 20, population: 3, culture: 40, commerce: 25, product: 8, transport: 10, event: 20, war: 15, figure: 20 },
  liao: { waterway: 40, climate: 3, vegetation: 20, disaster: 60, admin: 150, key_building: 25, other_building: 180, population: 18, culture: 350, commerce: 280, product: 60, transport: 50, event: 100, war: 25, figure: 180 },
  jin: { waterway: 35, climate: 2, vegetation: 15, disaster: 50, admin: 130, key_building: 20, other_building: 150, population: 15, culture: 280, commerce: 220, product: 45, transport: 40, event: 80, war: 20, figure: 140 },
  yuan: { waterway: 45, climate: 3, vegetation: 18, disaster: 70, admin: 200, key_building: 35, other_building: 250, population: 25, culture: 500, commerce: 400, product: 70, transport: 70, event: 130, war: 30, figure: 280 },
  ming: { waterway: 60, climate: 4, vegetation: 22, disaster: 90, admin: 250, key_building: 40, other_building: 350, population: 30, culture: 800, commerce: 600, product: 100, transport: 80, event: 200, war: 40, figure: 400 },
  qing: { waterway: 55, climate: 3, vegetation: 20, disaster: 85, admin: 220, key_building: 35, other_building: 300, population: 28, culture: 750, commerce: 550, product: 90, transport: 70, event: 180, war: 35, figure: 380 },
};

// Mock 事件数据
export interface MockEvent {
  year: number;
  dynasty: string;
  title: string;
  type: "war" | "disaster" | "reform" | "construction" | "other";
  description: string;
}

export const MOCK_EVENTS: MockEvent[] = [
  { year: -1046, dynasty: "neolithic", title: "周武王灭商", type: "war", description: "周武王伐纣，建立西周，封召公于燕" },
  { year: -226, dynasty: "neolithic", title: "秦灭燕", type: "war", description: "秦将王翦攻破蓟城，燕国灭亡" },
  { year: -221, dynasty: "qin", title: "秦统一六国", type: "reform", description: "秦始皇统一中国，蓟城为广阳郡治" },
  { year: 755, dynasty: "tang", title: "安史之乱", type: "war", description: "安禄山起兵范阳(幽州)，唐朝由盛转衰" },
  { year: 938, dynasty: "liao", title: "辽建南京", type: "reform", description: "石敬瑭割让燕云十六州，辽以幽州为南京" },
  { year: 1153, dynasty: "jin", title: "金迁都中都", type: "reform", description: "海陵王迁都燕京，改名中都，北京首次成为王朝首都" },
  { year: 1215, dynasty: "jin", title: "蒙古攻占中都", type: "war", description: "成吉思汗攻占金中都，城市遭受严重破坏" },
  { year: 1267, dynasty: "yuan", title: "元建大都", type: "construction", description: "忽必烈命刘秉忠营建大都城" },
  { year: 1293, dynasty: "yuan", title: "通惠河通航", type: "construction", description: "郭守敬主持修建通惠河，大运河直通大都" },
  { year: 1403, dynasty: "ming", title: "明成祖迁都", type: "reform", description: "朱棣改北平为北京，开始营建紫禁城" },
  { year: 1421, dynasty: "ming", title: "正式迁都北京", type: "reform", description: "明成祖正式迁都北京，北京成为全国政治中心" },
  { year: 1550, dynasty: "ming", title: "庚戌之变", type: "war", description: "俺答汗率军攻至北京城下" },
  { year: 1629, dynasty: "ming", title: "己巳之变", type: "war", description: "皇太极率后金军绕道蒙古攻至北京" },
  { year: 1644, dynasty: "qing", title: "清军入关", type: "war", description: "吴三桂引清兵入关，清朝定都北京" },
  { year: 1750, dynasty: "qing", title: "三山五园建设", type: "construction", description: "乾隆大规模修建圆明园、清漪园等皇家园林" },
  { year: 1860, dynasty: "qing", title: "英法联军火烧圆明园", type: "war", description: "第二次鸦片战争，圆明园被焚毁" },
  { year: 1900, dynasty: "qing", title: "八国联军侵华", type: "war", description: "八国联军攻占北京，签订《辛丑条约》" },
];

// Mock 人物数据
export interface MockFigure {
  name: string;
  dynasty: string;
  role: string;
  description: string;
}

export const MOCK_FIGURES: MockFigure[] = [
  { name: "周武王", dynasty: "neolithic", role: "帝王", description: "西周开国君主，封召公于燕" },
  { name: "召公奭", dynasty: "neolithic", role: "诸侯", description: "燕国始封君，开发北京地区" },
  { name: "秦始皇", dynasty: "qin", role: "帝王", description: "统一六国，蓟城为广阳郡" },
  { name: "安禄山", dynasty: "tang", role: "将领", description: "安史之乱发起者，范阳节度使" },
  { name: "耶律阿保机", dynasty: "liao", role: "帝王", description: "辽朝建立者" },
  { name: "完颜亮", dynasty: "jin", role: "帝王", description: "金海陵王，迁都中都" },
  { name: "忽必烈", dynasty: "yuan", role: "帝王", description: "元世祖，营建大都" },
  { name: "郭守敬", dynasty: "yuan", role: "科学家", description: "天文学家、水利专家，修建通惠河" },
  { name: "刘秉忠", dynasty: "yuan", role: "建筑师", description: "大都城总设计师" },
  { name: "朱棣", dynasty: "ming", role: "帝王", description: "明成祖，迁都北京" },
  { name: "蒯祥", dynasty: "ming", role: "建筑师", description: "紫禁城总设计师" },
  { name: "于谦", dynasty: "ming", role: "大臣", description: "北京保卫战指挥者" },
  { name: "康熙", dynasty: "qing", role: "帝王", description: "清朝盛世开创者" },
  { name: "乾隆", dynasty: "qing", role: "帝王", description: "三山五园建设者" },
  { name: "詹天佑", dynasty: "qing", role: "工程师", description: "中国铁路之父，主持修建京张铁路" },
];
