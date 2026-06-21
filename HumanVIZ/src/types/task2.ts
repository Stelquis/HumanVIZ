/* ================================================================
   Task2 — Shared Types, Interfaces, and Constants
   角色关系网络与剧目类型分析
   ================================================================ */

/* ================================================================
   Network Primitives — 网络基本元素
   ================================================================ */

/** 网络节点 — 代表一个角色 */
export interface NetworkNode {
  name: string;
  degree: number;
  scene_count: number;
  role_type: string; // "生" | "旦" | "净" | "丑" | "其他"
  dialogue_count: number;
  betweenness: number;
}

/** 网络边 — 代表两个角色的共现/互动关系 */
export interface NetworkEdge {
  source: string;
  target: string;
  weight: number;
  relation_type: RelationType; // "同盟" | "从属" | "敌对" | "亲属" | "情感" | "中立"
  micro_type: string;          // 子类型，如 "同盟-结义"
  source_tag: string;
}

/** 完整剧本网络 */
export interface PlayNetwork {
  entity_id: number;
  title: string;
  genre: DramaType;
  structure_label: StructureLabel;
  total_characters: number;
  total_edges: number;
  total_scenes?: number;
  density?: number;
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

/* ================================================================
   Enums & Literal Unions — 枚举与字面量联合类型
   ================================================================ */

/** 7 种剧目类型 */
export const DRAMA_TYPES = [
  "历史戏", "家庭戏", "侠义戏", "爱情戏", "神话戏", "公案戏", "技法展示戏",
] as const;
export type DramaType = (typeof DRAMA_TYPES)[number];

/** 6 种网络结构标签 */
export const STRUCTURE_LABELS = [
  "弱关系碎片型", "单核心型", "双核心型", "双核心对抗型", "多核心群像型", "分散型",
] as const;
export type StructureLabel = (typeof STRUCTURE_LABELS)[number];

/** 6 种关系类型 */
export const RELATION_TYPES = [
  "同盟", "从属", "敌对", "亲属", "情感", "中立",
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

/** 5 种行当（角色类型） */
export const ROLE_TYPES = ["生", "旦", "净", "丑", "其他"] as const;
export type RoleType = (typeof ROLE_TYPES)[number];

/** 7 个网络指标 key */
export const METRIC_KEYS = [
  "density", "centralization", "clustering", "modularity",
  "degree_entropy", "bridge_ratio", "top2_concentration",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

/** Task2 子视图标识 */
export const TASK2_SUB_VIEWS = [
  "network", "fingerprint", "spacemap", "profile",
] as const;
export type Task2SubView = (typeof TASK2_SUB_VIEWS)[number];

/* ================================================================
   PCA / Dimensionality Reduction — 降维空间数据
   ================================================================ */

/** 单个剧本在 PCA 空间中的坐标 */
export interface PCAPoint {
  entity_id: number;
  title: string;
  genre: DramaType;
  x: number;                // PC1
  y: number;                // PC2
  n_nodes: number;
  n_edges: number;
  structure_label: StructureLabel;
  semantic_fragmented: number;
  betweenness: number;
}

/** 类型质心坐标 */
export interface PCACentroid {
  x: number;
  y: number;
  count: number;
}

/* ================================================================
   Type-Level Aggregation — 类型级别聚合指标
   ================================================================ */

/** 单个类型的聚合度量值 */
export interface TypeAggregatedMetrics {
  density: number;
  centralization: number;
  clustering: number;
  modularity: number;
  degree_entropy: number;
  bridge_ratio: number;
  top2_concentration: number;
}

/** 类型度量 + 剧本数量 */
export interface TypeMeans {
  metrics: TypeAggregatedMetrics;
  count: number;
}

/** 雷达图归一化数据 */
export interface RadarMetrics {
  node_count_norm: number;
  density: number;
  clustering: number;
  centralization: number;
  degree_entropy: number;
}

/** 行当分布 — 单个类型的行当占比 */
export interface HangdangDistribution {
  distribution: Record<RoleType, { count: number; ratio: number }>;
}

/** 结构标签分布 — 单个类型中各结构标签的百分比 */
export type StructureDistribution = Record<StructureLabel, { count: number; pct: number }>;

/* ================================================================
   Play Index — 剧本索引（轻量级，用于列表和筛选）
   ================================================================ */

/** 剧本索引条目 */
export interface PlayIndexEntry {
  entity_id: number;
  title: string;
  genre: DramaType;
  structure_label: StructureLabel;
  node_count: number;
  edge_count: number;
  density: number;
  degree_centralization: number;
  largest_component_ratio: number;
  semantic_fragmented: number;
}

/* ================================================================
   Sankey Data — 关系流向桑基图
   ================================================================ */

export interface SankeyNode {
  name: string;
}

export interface SankeyLink {
  source: number | string;
  target: number | string;
  value: number;
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

/* ================================================================
   Top Characters — 各类型核心角色
   ================================================================ */

export interface TopCharacter {
  name: string;
  role_type: RoleType;
  degree?: number;
  scene_count?: number;
}

/* ================================================================
   Main Characters Map — 主要角色标注
   ================================================================ */

export interface MainCharacterPlay {
  entity_id: number;
  title?: string;
  genre?: DramaType;
  main_characters: string[];
}

/* ================================================================
   Relation Type Distribution — 关系类型分布
   ================================================================ */

export type RelationTypeDistribution = Record<
  DramaType,
  Partial<Record<RelationType, { count: number; ratio: number }>>
>;

/* ================================================================
   Root Data Shape — network-data.json 的顶层结构
   ================================================================ */

export interface NetworkDataRoot {
  total_scripts: number;
  type_means: Record<DramaType, TypeMeans>;
  type_colors: Record<DramaType, string>;
  type_order: DramaType[];
  pca_points: PCAPoint[];
  pca_centroids: Record<DramaType, PCACentroid>;
  rep_networks: Record<DramaType, PlayNetwork[]>;
  top_chars: Record<DramaType, TopCharacter[]>;
  metric_labels: Record<MetricKey, string>;
  metric_order: MetricKey[];
  structure_labels: StructureLabel[];
  structure_colors: Record<StructureLabel, string>;
  structure_by_type: Record<DramaType, StructureDistribution>;
  hangdang_distribution: Record<DramaType, HangdangDistribution>;
  radar_metrics: Record<DramaType, RadarMetrics>;
  sankey_data: SankeyData;
  play_index: PlayIndexEntry[];
  relation_type_distribution: RelationTypeDistribution;
}

/* ================================================================
   Color Maps — 颜色映射常量
   ================================================================ */

/** 剧目类型颜色（古籍色板） */
export const TYPE_COLORS: Record<DramaType, string> = {
  历史戏: "#b8926a",
  家庭戏: "#96544d",
  侠义戏: "#5e6b76",
  爱情戏: "#c77d8b",
  神话戏: "#7f968d",
  公案戏: "#6b7b8e",
  技法展示戏: "#c4a56e",
};

/** 行当颜色 */
export const ROLE_COLORS: Record<RoleType, string> = {
  生: "#b8926a",
  旦: "#96544d",
  净: "#5e6b76",
  丑: "#7f968d",
  其他: "#a09080",
};

/** 关系类型颜色 */
export const EDGE_RELATION_COLORS: Record<RelationType, string> = {
  同盟: "#55a868",
  从属: "#4c72b0",
  敌对: "#c44e52",
  亲属: "#937860",
  情感: "#c77d8b",
  中立: "#c0c0c0",
};

/** 结构标签颜色 */
export const DEFAULT_STRUCTURE_COLORS: Record<StructureLabel, string> = {
  "弱关系碎片型": "#c0c0c0",
  "单核心型": "#b8926a",
  "双核心型": "#96544d",
  "双核心对抗型": "#c44e52",
  "多核心群像型": "#5e6b76",
  "分散型": "#7f968d",
};

/** 古籍风格色板 */
export const INK_DARK = "#4a3424";
export const INK_WARM = "#6b5540";
export const INK_SOFT = "#6b5340";
export const PAPER_BG = "#f6efe0";
export const GOLD_NODE = "#b8926a";
export const FONT_SERIF = '"Noto Serif SC","PT Serif","STSong","SimSun",serif';

/** 默认行当颜色（未知角色） */
export const DEFAULT_ROLE_COLOR = "#a09080";

/* ================================================================
   Metric Labels — 指标中文标签
   ================================================================ */

export const METRIC_LABELS: Record<MetricKey, string> = {
  density: "网络密度",
  centralization: "中心性偏离度",
  clustering: "聚类系数",
  modularity: "模块度",
  degree_entropy: "度分布熵",
  bridge_ratio: "桥接节点比",
  top2_concentration: "Top-2集中度",
};

/* ================================================================
   Sub-View Labels — 子视图标签
   ================================================================ */

export const TASK2_SUB_VIEW_LABELS: Record<Task2SubView, string> = {
  network: "角色关系网络",
  fingerprint: "类型拓扑指纹",
  spacemap: "结构空间地图",
  profile: "互动剖面解码",
};

/* ================================================================
   Edge Relation Labels — 边关系类型中文
   ================================================================ */

export const EDGE_RELATION_LABELS: Record<RelationType, string> = {
  同盟: "同盟",
  从属: "从属",
  敌对: "敌对",
  亲属: "亲属",
  情感: "情感",
  中立: "中立/同场",
};

/* ================================================================
   Tagged Play Network — 从动态 JSON 加载的原始格式
   ================================================================ */

/** 动态 JSON 中的原始剧本网络（key = entity_id 字符串） */
export interface TaggedPlayNetworks {
  [entityId: string]: {
    ti: string;       // title
    ge: string;       // genre
    nc: number;       // node_count
    ec: number;       // edge_count
    no: Array<{       // nodes
      n: string;      // name
      d: number;      // degree
      sc: number;     // scene_count
      r: string;      // role_type
    }>;
    ed: Array<{       // edges
      s: string;      // source
      t: string;      // target
      w: number;      // weight
      rl: string;     // relation_type
    }>;
  };
}
