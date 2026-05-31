/**
 * p4_story_ribbon_core.ts — 泛用性故事丝带（Story Ribbon）核心模块
 *
 * 最大程度复用现有 positions.ts / curve.ts / data.ts / consts.ts 的代码，
 * 提供统一的故事丝带分析与可视化 API，供京剧剧本等外部数据源调用。
 *
 * 设计原则:
 *   - 不修改现有模块，仅做包装和适配
 *   - 输入数据支持两种路径: (a) 原始 JSON → getAllData → getAllPositions
 *                           (b) 预计算数据 → 直接渲染
 *   - 输出标准化的丝带路径、位置、元数据
 */

import { getAllData, Scene, CharacterData, CharacterScene, SceneCharacter } from "./data";
import { getAllPositions, Position, Box } from "./positions";
import { bezierCommand, svgPath } from "./curve";
import {
  scene_offset,
  character_height,
  location_buffer,
} from "./consts";

// ═══════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════

/** 外部数据源输入格式（松散的 JSON，将被标准化） */
export interface RawStoryInput {
  title: string;
  type?: string;
  author?: string;
  year?: number;
  scenes: RawScene[];
  characters: RawCharacter[];
  locations?: RawLocation[];
  chapters?: RawChapter[];
  metadata?: Record<string, unknown>;
}

export interface RawScene {
  number: number;
  name: string;
  location?: string;
  characters?: RawSceneCharacter[];
  summary?: string;
  firstLine?: number;
  lastLine?: number;
  numLines?: number;
  chapter?: string;
  ratings?: { importance?: number; conflict?: number; sentiment?: number };
  text?: string;
}

export interface RawSceneCharacter {
  name: string;
  importance?: number;
  importance_rank?: number;
  emotion?: string;
  quote?: string;
  rating?: number; // sentiment score -1 to 1
  role?: string;
}

export interface RawCharacter {
  character: string;
  short?: string;
  key?: string;
  quote?: string;
  group?: string;
  color?: string;
  explanation?: string[];
}

export interface RawLocation {
  name: string;
  key?: string;
  quote?: string;
  emoji?: string;
}

export interface RawChapter {
  chapter: string;
  numScenes?: number;
  numLines?: number;
  summary?: string;
  conflict?: number;
  importance?: number;
  locations?: Record<string, number>;
  characters?: Record<string, number>;
  links?: RawLink[];
}

export interface RawLink {
  source: string;
  target: string;
  value: number;
  interaction?: string;
}

// ═══════════════════════════════════════════════════════════════
// 丝带分析结果类型
// ═══════════════════════════════════════════════════════════════

export interface RibbonAnalysisResult {
  /** 故事元信息 */
  meta: {
    title: string;
    sceneCount: number;
    characterCount: number;
    locationCount: number;
    chapterCount: number;
  };

  /** 标准化的场景数据 */
  scenes: Scene[];

  /** 角色出场信息 */
  characterScenes: CharacterScene[];

  /** 场景角色关系 */
  sceneCharacters: SceneCharacter[];

  /** 排序后的角色列表 */
  sortedCharacters: CharacterData[];

  /** 位置计算结果 */
  positions: RibbonPositions;

  /** 每角色丝带路径（SVG path d 字符串数组） */
  ribbonPaths: Map<string, string[]>;

  /** 叙事节奏指标 */
  narrativeMetrics: NarrativeMetrics;
}

export interface RibbonPositions {
  sceneWidth: number;
  plotWidth: number;
  plotHeight: number;
  scenePos: Position[];
  characterPos: Position[][];
  characterSquares: Box[][];
  characterPaths: string[][];
  sceneBoxes: Box[];
  firstPoints: Position[];
  lastPoints: Position[];
}

export interface NarrativeMetrics {
  /** 场景级情感变化序列 */
  sentimentArc: number[];

  /** 场景级冲突变化序列 */
  conflictArc: number[];

  /** 每场景角色数量变化 */
  characterDensity: number[];

  /** 情感波动指数 (0-1, 越大越动荡) */
  sentimentVolatility: number;

  /** 总体叙事节奏类型标签 */
  rhythmType: "渐进推进型" | "密集高潮型" | "长篇铺陈型" | "文武交替型" | "未知";

  /** 自适应检测的叙事阶段（数据驱动） */
  narrativePhases: NarrativePhase[];
}

/** 自适应检测的叙事阶段 */
export interface NarrativePhase {
  label: string;
  startScene: number;
  endScene: number;
  dominantFeature: "conflict" | "sentiment" | "density";
}

// ═══════════════════════════════════════════════════════════════
// 数据标准化
// ═══════════════════════════════════════════════════════════════

/**
 * 将外部原始数据标准化为 HumanVIZ 内部格式（getAllData 可接受的 JSON）
 */
export function normalizeRawInput(input: RawStoryInput): Record<string, unknown> {
  const sceneCount = input.scenes.length;
  const charCount = input.characters.length;

  // 标准化 locations
  const locations = (input.locations || []).map((loc, i) => ({
    name: loc.name || `地点${i + 1}`,
    key: loc.key || loc.name || `loc_${i}`,
    quote: loc.quote || "",
    emoji: loc.emoji || "",
  }));

  if (locations.length === 0) {
    // 从场景中推断地点
    const locSet = new Set(
      input.scenes.map((s) => s.location).filter(Boolean) as string[]
    );
    locSet.forEach((name) => {
      locations.push({ name, key: name, quote: "", emoji: "" });
    });
  }

  // 标准化 characters
  const characters = input.characters.map((c) => ({
    character: c.character,
    short: c.short || c.character.slice(0, 2),
    key: c.key || c.character,
    quote: c.quote || "",
    group: c.group || "默认分组",
    color: c.color || "",
    explanation: c.explanation || [],
  }));

  // 标准化 scenes
  const scenes = input.scenes.map((s, i) => {
    const chars = (s.characters || []).map((c) => ({
      name: c.name,
      importance: c.importance ?? (s.characters ? (s.characters.length - (c.importance_rank || i + 1) + 1) / Math.max(s.characters.length, 1) : 0.5),
      importance_rank: c.importance_rank ?? (s.characters?.indexOf(c) ?? 0) + 1,
      emotion: c.emotion || "neutral",
      quote: c.quote || "",
      rating: c.rating ?? 0,
      role: c.role || "",
    }));

    return {
      number: s.number,
      name: s.name,
      location: s.location || "舞台",
      characters: chars,
      summary: s.summary || `${s.name}：${chars.length}位角色`,
      firstLine: s.firstLine ?? 1,
      lastLine: s.lastLine ?? s.numLines ?? 0,
      numLines: s.numLines ?? 0,
      chapter: s.chapter || "全剧",
      ratings: {
        importance: s.ratings?.importance ?? 0.5,
        conflict: s.ratings?.conflict ?? 0.3,
        sentiment: s.ratings?.sentiment ?? 0.0,
      },
    };
  });

  // 标准化 chapters
  const chapters = (input.chapters || []).map((ch) => ({
    chapter: ch.chapter,
    numScenes: ch.numScenes ?? 1,
    numLines: ch.numLines ?? 0,
    summary: ch.summary || "",
    conflict: ch.conflict ?? 0.3,
    importance: ch.importance ?? 0.5,
    locations: ch.locations || {},
    characters: ch.characters || {},
    links: ch.links || [],
  }));

  return {
    title: input.title,
    type: input.type || "叙事文本",
    author: input.author || "未知",
    year: input.year || 2024,
    url: "",
    image: "",
    num_chapters: chapters.length || 1,
    num_scenes: sceneCount,
    num_characters: charCount,
    num_locations: locations.length,
    chapters,
    scenes,
    characters,
    locations,
  };
}

// ═══════════════════════════════════════════════════════════════
// 核心：丝带分析流水线
// ═══════════════════════════════════════════════════════════════

/**
 * 完整的丝带分析流水线：
 * RawStoryInput → normalize → getAllData → getAllPositions → RibbonAnalysisResult
 */
export function analyzeStoryRibbons(input: RawStoryInput): RibbonAnalysisResult {
  // Step 1: 标准化
  const normalized = normalizeRawInput(input);

  // Step 2: 数据结构化（复用现有 data.ts）
  const data = getAllData(normalized, false);

  // Step 3: 位置与路径计算（复用现有 positions.ts）
  const positions = getAllPositions(
    data.scene_data,
    data.scenes,
    data.locations,
    data.characterScenes,
    data.sceneLocations,
    data.sceneCharacters,
    data.sortedCharacters,
    false, // evenSpacing
    "location", // default yAxis
    []
  );

  // Step 4: 构建角色→路径映射
  const ribbonPaths = new Map<string, string[]>();
  data.characterScenes.forEach((cs, i) => {
    ribbonPaths.set(cs.character, positions.characterPaths[i] || []);
  });

  // Step 5: 计算叙事指标
  const metrics = computeNarrativeMetrics(data.scene_data);

  return {
    meta: {
      title: input.title,
      sceneCount: input.scenes.length,
      characterCount: input.characters.length,
      locationCount: data.locations.length,
      chapterCount: data.num_chapters,
    },
    scenes: data.scene_data,
    characterScenes: data.characterScenes,
    sceneCharacters: data.sceneCharacters,
    sortedCharacters: data.sortedCharacters,
    positions: {
      sceneWidth: positions.sceneWidth,
      plotWidth: positions.plotWidth,
      plotHeight: positions.plotHeight,
      scenePos: positions.scenePos,
      characterPos: positions.characterPos,
      characterSquares: positions.characterSquares,
      characterPaths: positions.characterPaths,
      sceneBoxes: positions.sceneBoxes,
      firstPoints: positions.firstPoints,
      lastPoints: positions.lastPoints,
    },
    ribbonPaths,
    narrativeMetrics: metrics,
  };
}

// ═══════════════════════════════════════════════════════════════
// 叙事指标计算
// ═══════════════════════════════════════════════════════════════

function computeNarrativeMetrics(scenes: Scene[]): NarrativeMetrics {
  const sentimentArc = scenes.map((s) => s.ratings.sentiment);
  const conflictArc = scenes.map((s) => s.ratings.conflict);
  const characterDensity = scenes.map((s) => s.characters.length);

  // 情感波动指数
  const diffs = [];
  for (let i = 1; i < sentimentArc.length; i++) {
    diffs.push(Math.abs(sentimentArc[i] - sentimentArc[i - 1]));
  }
  const avgDiff = diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
  const sentimentVolatility = Math.min(avgDiff * 3, 1.0);

  // 节奏类型判定
  const n = scenes.length;
  const avgDensity = characterDensity.reduce((a, b) => a + b, 0) / Math.max(n, 1);
  const conflictVariance =
    conflictArc.length > 1
      ? conflictArc.reduce((s, v) => s + (v - conflictArc[0]) ** 2, 0) / conflictArc.length
      : 0;

  let rhythmType: NarrativeMetrics["rhythmType"] = "未知";
  if (n <= 4 && sentimentVolatility > 0.4) {
    rhythmType = "密集高潮型";
  } else if (n >= 10 && conflictVariance < 0.05) {
    rhythmType = "长篇铺陈型";
  } else if (conflictVariance > 0.1 && avgDensity > 3) {
    rhythmType = "文武交替型";
  } else if (n >= 5 && n <= 9) {
    rhythmType = "渐进推进型";
  }

  // 自适应阶段检测
  const narrativePhases = detectNarrativePhases(
    scenes,
    conflictArc,
    sentimentArc,
    characterDensity
  );

  return {
    sentimentArc,
    conflictArc,
    characterDensity,
    sentimentVolatility,
    rhythmType,
    narrativePhases,
  };
}

// ═══════════════════════════════════════════════════════════════
// 自适应叙事阶段检测
// ═══════════════════════════════════════════════════════════════

/** 寻找局部极值点（返回索引数组） */
function findLocalExtrema(arr: number[], type: "max" | "min"): number[] {
  const extrema: number[] = [];
  if (arr.length < 3) return extrema;
  for (let i = 1; i < arr.length - 1; i++) {
    if (type === "max" && arr[i] > arr[i - 1] && arr[i] >= arr[i + 1]) {
      extrema.push(i);
    } else if (type === "min" && arr[i] < arr[i - 1] && arr[i] <= arr[i + 1]) {
      extrema.push(i);
    }
  }
  return extrema;
}

/** 融合多源断点并按重要性排序 */
function mergeBreakpoints(
  conflictPeaks: number[],
  sentimentBreakpoints: number[],
  densityBreakpoints: number[]
): number[] {
  const scoreMap = new Map<number, number>();

  for (const bp of conflictPeaks) {
    scoreMap.set(bp, (scoreMap.get(bp) || 0) + 3);
  }
  for (const bp of sentimentBreakpoints) {
    scoreMap.set(bp, (scoreMap.get(bp) || 0) + 2);
  }
  for (const bp of densityBreakpoints) {
    scoreMap.set(bp, (scoreMap.get(bp) || 0) + 1);
  }

  // 合并相邻断点（距离 ≤ 1 的场景合并为得分最高的那个）
  const merged: { index: number; score: number }[] = [];
  const sorted = [...scoreMap.entries()].sort((a, b) => a[0] - b[0]);

  for (const [idx, score] of sorted) {
    const last = merged[merged.length - 1];
    if (last && idx - last.index <= 1) {
      if (score > last.score) {
        last.index = idx;
        last.score = score;
      }
    } else {
      merged.push({ index: idx, score });
    }
  }

  // 按得分降序排列，返回索引
  return merged.sort((a, b) => b.score - a.score).map((m) => m.index);
}

/** 根据断点特征自动标注阶段类型 */
function classifyPhases(
  breakpoints: number[],
  scenes: Scene[],
  conflictArc: number[],
  sentimentArc: number[]
): NarrativePhase[] {
  const n = scenes.length;
  if (n < 3) {
    return [
      { label: "全剧", startScene: 0, endScene: n - 1, dominantFeature: "conflict" },
    ];
  }

  // 取 top-3 断点作为阶段边界（至少保证 开端/发展/高潮/结局 四段）
  const topBps = breakpoints.slice(0, 3).sort((a, b) => a - b);
  const boundaries = [0, ...topBps.filter((bp) => bp > 0 && bp < n - 1), n - 1];
  // 去重并排序
  const unique = [...new Set(boundaries)].sort((a, b) => a - b);

  const phaseLabels = ["开端", "发展", "高潮", "结局", "尾声"];
  const phases: NarrativePhase[] = [];

  for (let i = 0; i < unique.length - 1; i++) {
    const start = unique[i];
    const end = unique[i + 1];
    const segConflict = conflictArc.slice(start, end + 1);
    const segSentiment = sentimentArc.slice(start, end + 1);
    const avgConflict = segConflict.reduce((a, b) => a + b, 0) / segConflict.length;
    const avgSentiment = segSentiment.reduce((a, b) => a + b, 0) / segSentiment.length;
    const sentimentRange =
      Math.max(...segSentiment) - Math.min(...segSentiment);

    const label = phaseLabels[i] || `阶段${i + 1}`;
    const dominantFeature: NarrativePhase["dominantFeature"] =
      avgConflict > 0.5 || (avgConflict > avgSentiment && sentimentRange < 0.3)
        ? "conflict"
        : sentimentRange > 0.3
        ? "sentiment"
        : "density";

    phases.push({ label, startScene: start, endScene: end, dominantFeature });
  }

  return phases;
}

/**
 * 自适应检测叙事阶段边界
 * 利用冲突弧、情感弧和角色密度的局部极值自动划分阶段
 * @param scenes - 场景数据
 * @param conflictArc - 冲突弧序列
 * @param sentimentArc - 情感弧序列
 * @param characterDensity - 角色密度序列
 * @returns 检测到的叙事阶段数组
 */
export function detectNarrativePhases(
  scenes: Scene[],
  conflictArc: number[],
  sentimentArc: number[],
  characterDensity: number[]
): NarrativePhase[] {
  const n = scenes.length;

  // 过短剧本无法提取有意义的阶段，返回单一阶段
  if (n <= 3) {
    return [
      { label: "全剧", startScene: 0, endScene: n - 1, dominantFeature: "conflict" },
    ];
  }

  // 1. 计算 conflictArc 的转折点（局部极大值 → 高潮候选）
  const conflictPeaks = findLocalExtrema(conflictArc, "max");

  // 2. 计算 sentimentArc 的变化率（大斜率跳跃 → 转折候选）
  const sentimentSlopes = sentimentArc.map((v, i) =>
    i === 0 ? 0 : Math.abs(v - sentimentArc[i - 1])
  );
  const sentimentBreakpoints = findLocalExtrema(sentimentSlopes, "max");

  // 3. 计算 characterDensity 的骤变点（群戏切换 → 阶段候选）
  const densityChanges = characterDensity.map((v, i) =>
    i === 0 ? 0 : Math.abs(v - characterDensity[i - 1])
  );
  const densityBreakpoints = findLocalExtrema(densityChanges, "max");

  // 4. 融合三类断点，取 top-N 个作为阶段边界
  const allBreakpoints = mergeBreakpoints(
    conflictPeaks,
    sentimentBreakpoints,
    densityBreakpoints
  );

  // 5. 根据断点特征自动标注阶段类型
  return classifyPhases(allBreakpoints, scenes, conflictArc, sentimentArc);
}

// ═══════════════════════════════════════════════════════════════
// SVG 路径生成工具（复用 curve.ts）
// ═══════════════════════════════════════════════════════════════

export { bezierCommand, svgPath };

/**
 * 为给定坐标序列生成平滑丝带路径
 * @param topCoords - 丝带上沿坐标 [[x, y], ...]
 * @param bottomCoords - 丝带下沿坐标 [[x, y], ...]
 * @returns SVG path d 字符串
 */
export function createRibbonPath(
  topCoords: number[][],
  bottomCoords: number[][],
  adjustments: number[] = []
): string {
  const topPath = svgPath(topCoords, adjustments, bezierCommand);
  const bottomPath = reverseSvgPath(svgPath(bottomCoords, adjustments, bezierCommand));
  const [, rightJoin] = bottomPath.split(" C ")[0].split(",");
  const [, leftJoin] = topPath.split(" C ")[0].split(",");
  return `${topPath} V ${rightJoin} ${bottomPath} V ${leftJoin}`;
}

function reverseSvgPath(path: string): string {
  const pathArr = path.split(" C ");
  pathArr[0] = pathArr[0].replace("M", "").trim();
  const posStr = pathArr.join(" ");
  const posStrSplit = posStr.split(" ").reverse();
  let newPath = "M " + posStrSplit[0];
  posStrSplit.shift();
  posStrSplit.forEach((pos, i) => {
    newPath += i % 3 === 0 ? " C " + pos : " " + pos;
  });
  return newPath;
}

// ═══════════════════════════════════════════════════════════════
// 叙事结构指纹（供批量分类使用）
// ═══════════════════════════════════════════════════════════════

export interface StoryFingerprint {
  title: string;
  sceneCount: number;
  charCount: number;
  avgCharsPerScene: number;
  sentimentVolatility: number;
  rhythmType: string;
  totalLines: number;
  sceneLengthCV: number; // 场景长度变异系数
}

/**
 * 从分析结果中提取结构化指纹
 */
export function extractFingerprint(result: RibbonAnalysisResult): StoryFingerprint {
  const { scenes, narrativeMetrics } = result;
  const totalLines = scenes.reduce((s, sc) => s + sc.numLines, 0);
  const lineLengths = scenes.map((s) => s.numLines);
  const meanLines = totalLines / Math.max(scenes.length, 1);
  const variance =
    lineLengths.reduce((s, l) => s + (l - meanLines) ** 2, 0) / Math.max(lineLengths.length, 1);
  const sceneLengthCV = meanLines > 0 ? Math.sqrt(variance) / meanLines : 0;

  return {
    title: result.meta.title,
    sceneCount: result.meta.sceneCount,
    charCount: result.meta.characterCount,
    avgCharsPerScene:
      narrativeMetrics.characterDensity.reduce((a, b) => a + b, 0) /
      Math.max(narrativeMetrics.characterDensity.length, 1),
    sentimentVolatility: narrativeMetrics.sentimentVolatility,
    rhythmType: narrativeMetrics.rhythmType,
    totalLines,
    sceneLengthCV,
  };
}

// ═══════════════════════════════════════════════════════════════
// 场景默认坐标（独立模式下可用，不依赖 positionStore）
// ═══════════════════════════════════════════════════════════════

export function computeDefaultScenePositions(
  sceneCount: number,
  plotWidth_: number = 2200
): Position[] {
  const sw = plotWidth_ / sceneCount;
  return Array.from({ length: sceneCount }, (_, i) => ({
    x: scene_offset + sw * i,
    y: location_buffer + character_height * 3,
  }));
}
