/* ================================================================
   Task4 — Shared Types, Interfaces, and Constants
   Extracted from Task4Layout.tsx
   ================================================================ */

import type { RibbonAnalysisResult, StoryFingerprint } from "../utils/storyRibbonCore";

/* ================================================================
   Script Card (Selection Report)
   ================================================================ */

export interface ScriptCard {
  id: number;
  name: string;
  alias: string;
  collection: string;
  collectionScale: string;
  era: string;
  charCount: number;
  roles: string;
  wordCount: string;
  summary: string;
  reasons: string[];
  structureType: string;
  dominantRole: string;
  narrativeArc: string;
}

/* ================================================================
   Narrative Pattern
   ================================================================ */

export interface NarrativePattern {
  type: string;
  color: string;
  description: string;
  rhythm: string;
  typicalStructure: string;
  emotionCurve: string;
  keyFeature: string;
}

export const NARRATIVE_PATTERNS: NarrativePattern[] = [
  {
    type: "悬念突转式", color: "#c44d4d",
    description: "以信息不对称为核心驱动力，观众知晓而剧中人不知，通过悬念的建立、维持与集中释放推动剧情发展。场景分布极不均匀，高潮处突然反转。常见于军事智谋剧与公案剧。",
    rhythm: "单峰急冲型：从悬念建立开始持续攀升，在高潮处集中释放",
    typicalStructure: "危机爆发 → 信息差建立 → 多方博弈 → 悬念揭示 → 危机解除",
    emotionCurve: "∧ 型（单峰）：紧张感持续上升至高潮后迅速回落",
    keyFeature: "观众处于「全知」位置，欣赏剧中人物在信息迷雾中的抉择",
  },
  {
    type: "情感波浪式", color: "#c77d8b",
    description: "外部事件仅作为触发，核心叙事围绕角色的内心情感变化展开。情感标记密集，以唱腔配合情感层层递进。剧情驱动从「发生了什么」转向「感受到了什么」。多见于旦角情感戏。",
    rhythm: "波浪递进型：情感层层叠加，每一波比前一波更深更烈",
    typicalStructure: "期待建立 → 期待受挫 → 情感内转 → 层层宣泄 → 疲惫归寂",
    emotionCurve: "层层递进上升型：微醺→沉醉→狂放，多阶递进",
    keyFeature: "极少的角色配置使情感弧线完全聚焦于单一角色的内在变化",
  },
  {
    type: "史诗铺陈式", color: "#6b5b4f",
    description: "场次众多（15+），跨越长时间尺度（数年至数十年），涉及多代人、多势力角逐。叙事分为多个大章节，每章有独立的起承转合，整体构成宏大的道德叙事。",
    rhythm: "双峰跨越型：前半部「崩塌」与后半部「重建」各形成独立高潮",
    typicalStructure: "秩序建立 → 秩序崩塌 → 潜伏隐匿 → 力量积蓄 → 秩序重建",
    emotionCurve: "M 型（双峰）：悲壮高潮→压抑低谷→复仇高潮→升华落幕",
    keyFeature: "道德叙事驱动，忠奸对立贯穿始终，大时间尺度赋予史诗厚重感",
  },
  {
    type: "双线交织式", color: "#5e6b76",
    description: "以对话/念白推动两条叙事线并行交错推进，最终汇合收束。两条线或为主副关系、或为正反对照，互相映衬。常见于侠义公案剧与历史演义剧。",
    rhythm: "锯齿递进型：双线交替推进，每轮交替形成小高潮，最终指向大对决",
    typicalStructure: "A线展开 → B线展开 → 双线交替 → 交叉碰撞 → 汇聚收束",
    emotionCurve: "锯齿上升型：双线轮流制造紧张-释放，但总体紧张度递增",
    keyFeature: "计中计的反间结构是核心叙事装置，双线视角增加叙事深度",
  },
  {
    type: "三叠反复式", color: "#c4a56e",
    description: "以三场/六场/九场的倍数结构组织剧情，相似情境逐次升级，采用「三次重复」的民间叙事模式，节奏平缓而有序。常见于喜剧与民间小戏。",
    rhythm: "阶梯攀升型：三次重复逐次升级，每一轮比前一轮更激烈或更荒诞",
    typicalStructure: "情境建立 → 第一次重复 → 第二次升级 → 第三次高潮 → 谐谑收场",
    emotionCurve: "台阶上升型：每一轮「重复-升级」构成一个节拍，三拍叠加至最终释放",
    keyFeature: "底层视角讽刺上位者，丑角主导叙事，颠覆常规行当权力结构",
  },
  {
    type: "回环照应式", color: "#7f968d",
    description: "以唱腔为主导驱动叙事，板式变化丰富（ban_variety ≥ 2），叙事结构呈环形——结局回归开篇情境，首尾呼应、余韵悠长。多见于抒情性强的剧目。",
    rhythm: "环形回落型：从原点出发，经历起伏后回归，形成闭合的叙事环",
    typicalStructure: "起始情境 → 情感展开 → 唱腔变奏 → 高潮抒发 → 回归起始",
    emotionCurve: "∩ 型（环形）：从起点上升再回落至原点，但经历了深刻的情感旅程",
    keyFeature: "唱腔板式的变化本身承载叙事功能，音乐结构与叙事结构合二为一",
  },
  {
    type: "多幕群像式", color: "#8a7a8e",
    description: "角色众多（12+）且台词分散（top3浓度低），多视角多线索交织推进。没有单一主角驱动全剧，每个角色群组承担各自叙事功能，形成群像叙事格局。",
    rhythm: "多点分散型：多条线索并行推进，在各视角间切换，形成立体叙事网络",
    typicalStructure: "群像登场 → 多线展开 → 线索交织 → 集中碰撞 → 分别收束",
    emotionCurve: "多轨并行型：不同角色群组的情感线各自发展，最终在关键节点交汇",
    keyFeature: "去中心化的叙事结构，集体命运代替个人英雄成为叙事焦点",
  },
  {
    type: "线性渐进式", color: "#b8926a",
    description: "剧情沿清晰的因果链逐场推进，冲突稳步升级，每场自然过渡到下一场，结构均衡、节奏平稳。是京剧叙事中最基础、最常见也最稳固的结构模式。",
    rhythm: "稳步爬升型：每场递进一层，冲突与情感同步增长，无突兀跳跃",
    typicalStructure: "情境引入 → 矛盾初现 → 逐步激化 → 高潮对决 → 平稳收束",
    emotionCurve: "/ 型（缓坡）：整剧呈平缓上升趋势，在高潮后温和回落",
    keyFeature: "经典「起承转合」的忠实体现，适合线性叙事的所有题材类型",
  },
];

/* ================================================================
   Character Narrative Role
   ================================================================ */

export interface CharacterNarrativeRole {
  role: string;
  function: string;
  description: string;
  examples: string[];
}

export const CHAR_NARRATIVE_ROLES: CharacterNarrativeRole[] = [
  { role: "主角/核心驱动者", function: "推动剧情发展的核心力量", description: "拥有最完整的叙事弧线，经历最显著的变化或揭示。其欲望/目标是叙事的核心驱动力。", examples: ["诸葛亮（空城计）", "杨贵妃（贵妃醉酒）", "程婴（赵氏孤儿）"] },
  { role: "对抗者/阻碍者", function: "制造冲突与障碍", description: "与主角形成对立，制造核心冲突。在京剧叙事中常以净行或反派角色承担，但京剧中的「反派」常具有人格复杂性。", examples: ["司马懿（空城计）", "屠岸贾（赵氏孤儿）", "窦尔敦（连环套）"] },
  { role: "辅助者/帮手", function: "协助主角完成叙事目标", description: "在关键时刻提供帮助、信息或情感支持。常为丑行或次要行当承担，但叙事功能不可或缺。", examples: ["朱光祖（连环套）", "公孙杵臼（赵氏孤儿）", "张才（打面缸）"] },
  { role: "信息传递者", function: "触发叙事转折的关键信息源", description: "通过传递消息改变剧情走向。在京剧中常由探子、太监、丫鬟等功能性角色承担。", examples: ["报信太监（贵妃醉酒）", "探子（空城计）", "周腊梅（打面缸）"] },
  { role: "旁观者/评论者", function: "提供外部视角与社会评价", description: "通过旁观评论，为观众提供道德判断或情感参照。丑角常承担此功能，以插科打诨承载社会批判。", examples: ["众将（空城计）", "宫人（贵妃醉酒）", "四老爷/王书吏（打面缸）"] },
];

/* ================================================================
   Narrative Type Info
   ================================================================ */

export const NARRATIVE_TYPE_INFO: Record<string, string> = {
  "线性渐进式": "剧情沿因果链逐场推进，冲突稳步升级，结构均衡清晰",
  "悬念突转式": "场景分布极不均匀，悬念建立后在高潮处集中释放反转",
  "双线交织式": "以对话/念白推动两条叙事线并行交错，最终汇合收束",
  "回环照应式": "以唱腔为主导，叙事结构呈环形，首尾呼应、余韵悠长",
  "情感波浪式": "情感标记密集，以人物内心情感起伏驱动叙事波浪式推进",
  "史诗铺陈式": "场次众多（15+），角色丰富，跨越长时间/空间尺度铺陈展开",
  "三叠反复式": "三/六/九场的倍数结构，相似情境逐次升级，节奏平稳有序",
  "多幕群像式": "角色众多且台词分散，多视角多线索交织的群像叙事格局",
};

/* ================================================================
   Narrative Type Config (filter)
   ================================================================ */

export interface NarrativeTypeConfigItem {
  id: string;
  label: string;
  color: string;
}

export const NARRATIVE_TYPE_CONFIG: NarrativeTypeConfigItem[] = [
  { id: "linear-progressive", label: "线性渐进式", color: "#b8926a" },
  { id: "epic-expansion", label: "史诗铺陈式", color: "#6b5b4f" },
  { id: "multi-ensemble", label: "多幕群像式", color: "#8a7a8e" },
  { id: "suspense-reversal", label: "悬念突转式", color: "#c44d4d" },
  { id: "circular-echo", label: "回环照应式", color: "#7f968d" },
  { id: "emotional-wave", label: "情感波浪式", color: "#c77d8b" },
  { id: "triple-repeat", label: "三叠反复式", color: "#c4a56e" },
  { id: "dual-thread", label: "双线交织式", color: "#5e6b76" },
];

export const USER_TYPE_TO_STARMAP: Record<string, string[]> = {
  "linear-progressive": ["线性渐进式"],
  "epic-expansion": ["史诗铺陈式"],
  "multi-ensemble": ["多幕群像式"],
  "suspense-reversal": ["悬念突转式"],
  "circular-echo": ["回环照应式"],
  "emotional-wave": ["情感波浪式"],
  "triple-repeat": ["三叠反复式"],
  "dual-thread": ["双线交织式"],
};

/* ================================================================
   Recommended Plays — 推荐剧本
   选择标准：
   - 叙事特征明显（starmap 叙事类型匹配度高）
   - 所属叙事类型剧目数充足（≥100部）
   - 每部 ≥4 场戏，叙事结构可解剖
   - 优先选用有深度 LLM 分析数据的剧本（RICH DATA）
   覆盖 6 种主要叙事类型
   ================================================================ */

export interface RecommendedPlay {
  key: string;
  label: string;
  narrType: string;       // Starmap narrative type
  reason: string;          // 叙事特征简述
  sceneCount: number;      // 场次数
}

export const RECOMMENDED_PLAYS: RecommendedPlay[] = [
  {
    key: "01001001_空城计", label: "空城计",
    narrType: "悬念突转式", sceneCount: 6,
    reason: "信息不对称驱动的经典心理博弈，单峰急冲型节奏，6场环环相扣",
  },
  {
    key: "01002016_打渔杀家", label: "打渔杀家",
    narrType: "线性渐进式", sceneCount: 6,
    reason: "官逼民反的经典线性叙事，因果链清晰，冲突逐场升级",
  },
  {
    key: "70002105_赵氏孤儿", label: "赵氏孤儿",
    narrType: "史诗铺陈式", sceneCount: 14,
    reason: "跨代复仇史诗，双峰跨越型节奏，忠奸对立贯穿全剧",
  },
  {
    key: "01006007_定军山", label: "定军山",
    narrType: "史诗铺陈式", sceneCount: 21,
    reason: "三国群英史诗，老将智勇双全，场面铺陈宏大",
  },
  {
    key: "01003002_群英会", label: "群英会",
    narrType: "线性渐进式", sceneCount: 8,
    reason: "蒋干中计逐层推进，多方角色博弈驱动剧情发展",
  },
  {
    key: "01006002_战长沙", label: "战长沙",
    narrType: "回环照应式", sceneCount: 11,
    reason: "唱腔主导叙事的回环结构，关黄对刀首尾呼应，余韵悠长",
  },
  {
    key: "03057003_黛玉葬花", label: "黛玉葬花",
    narrType: "情感波浪式", sceneCount: 4,
    reason: "以黛玉内心情感起伏驱动叙事，层层递进至高潮释放",
  },
  {
    key: "02003005_斩华雄", label: "斩华雄",
    narrType: "多幕群像式", sceneCount: 4,
    reason: "多视角多线索交织，群像叙事格局鲜明，各路诸侯悉数登场",
  },
];

/* ================================================================
   Helpers
   ================================================================ */

export function keyToLabel(key: string): string {
  return key.replace(".json", "").replace(/^\d+_/, "");
}

/* ================================================================
   Fallback Phases
   ================================================================ */

export const FALLBACK_PHASES = [
  { label: "开端", pct: [0, 0.2] },
  { label: "发展", pct: [0.2, 0.55] },
  { label: "高潮", pct: [0.55, 0.8] },
  { label: "结局", pct: [0.8, 1.0] },
];

/* ================================================================
   Role Colors Map
   ================================================================ */

export const ROLE_COLORS_MAP: Record<string, string> = {
  "主角/核心驱动者": "#96544D",
  "对抗者/阻碍者": "#5E6B76",
  "辅助者/帮手": "#7F968D",
  "信息传递者": "#B89B6D",
  "旁观者/评论者": "#C4A56E",
};

/* ================================================================
   DNA Radar Dimensions
   ================================================================ */

export const DNA_RADAR_DIMS = [
  { key: "sceneScale", label: "叙事广度", max: 25 },
  { key: "charDensity", label: "角色丰富度", max: 8 },
  { key: "conflictIntensity", label: "冲突烈度", max: 1 },
  { key: "emotionVolatility", label: "情感张力", max: 1 },
  { key: "climaxConcentration", label: "高潮聚焦度", max: 1 },
  { key: "suspenseRetention", label: "悬念持续力", max: 1 },
];

/* ================================================================
   Narrative Insight
   ================================================================ */

export interface NarrativeInsight {
  icon: string;
  text: string;
  severity: "info" | "highlight" | "warning";
}

/* ================================================================
   Component Props Interfaces
   ================================================================ */

export interface NarrativeInsightBarProps {
  fingerprint: StoryFingerprint | null;
  analysis: RibbonAnalysisResult | null;
  patternType: string;
  turningPoints: any[] | null;
  roleMapping: Record<string, string> | null;
}

export interface CharacterPhaseHeatmapProps {
  analysis: RibbonAnalysisResult | null;
  phases: { label: string; startScene: number; endScene: number }[];
}

export interface NarrativeTimelineProps {
  phases: { label: string; startScene: number; endScene: number }[];
  selectedPhase: number | null;
  onPhaseClick: (idx: number | null) => void;
}

export interface CombinedRhythmChartProps {
  analysis: RibbonAnalysisResult | null;
  fingerprint: StoryFingerprint | null;
  turningPoints?: any[] | null;
  selectedPhase?: number | null;
  onSceneHover?: (idx: number | null) => void;
  onSceneClick?: (idx: number | null) => void;
  onPhaseClick?: (idx: number | null) => void;
}

export interface PhaseExplainerProps {
  phase: { label: string; startScene: number; endScene: number; dominantFeature?: string };
  analysis: RibbonAnalysisResult;
  fingerprint: StoryFingerprint;
  turningPoints: any[] | null;
}

export interface RoleMappingLeaderboardProps {
  analysis: RibbonAnalysisResult | null;
  fingerprint: StoryFingerprint | null;
}

export interface NarrativeDNARadarProps {
  fingerprint: StoryFingerprint | null;
  analysis: RibbonAnalysisResult | null;
  compact?: boolean;
}
