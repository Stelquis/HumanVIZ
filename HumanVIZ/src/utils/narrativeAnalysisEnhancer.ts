/**
 * narrativeAnalysisEnhancer.ts — 叙事分析增强工具模块
 *
 * 提供 TypeScript 运行时 fallback 计算函数，用于在 Python 预计算数据
 * 不可用时补充缺失的增强分析维度。
 *
 * 设计原则：
 *   - 纯函数，无副作用
 *   - 所有函数都有 fallback 默认值
 *   - 与 compute_universal_narrative.py 的逻辑保持 1:1 对应
 *   - 输出格式与 universal-narrative-analysis.json 一致
 */

/* ================================================================
   类型定义 (与 universal-narrative-analysis.json 输出一致)
   ================================================================ */

export interface TurningPoint {
  sceneIndex: number;
  conflictValue: number;
  type: "primary_climax" | "secondary_climax";
  intensity: number; // 1-5
  label: string;
  prominence: number;
}

export interface PerformanceForm {
  singing: number;
  reciting: number;
  speaking: number;
  acting: number;
  fighting: number;
  entropy: number;
}

export interface StructureFramework {
  framework:
    | "单点突转型"
    | "起承转合式"
    | "三幕递进式"
    | "双线交织式"
    | "环状回归式"
    | "散点群像式"
    | "情感波浪式"
    | "未知";
  confidence: number;
}

export interface BaselineComparison {
  structureType: string;
  typeCount: number;
  conflictRangeVsBaseline: number;
  sentimentVolatilityVsBaseline: number;
  peakPositionVsBaseline: number;
  sceneCountVsBaseline: number;
  charCountVsBaseline: number;
  conflictTrendVsBaseline: number;
}

/* ================================================================
   1. 多高潮/转折点检测 (对应 维度3/4)
   ================================================================ */

/**
 * 从冲突弧中检测最多 5 个转折点
 * 使用局部极大值 + prominence 筛选
 */
export function detectAllClimaxes(
  conflictArc: number[],
  minProminence: number = 0.05
): TurningPoint[] {
  const n = conflictArc.length;
  if (n < 3) {
    if (n === 0) return [];
    const peakIdx = conflictArc.indexOf(Math.max(...conflictArc));
    return [
      {
        sceneIndex: peakIdx,
        conflictValue: conflictArc[peakIdx],
        type: "primary_climax",
        intensity: Math.min(conflictArc[peakIdx] * 5, 5),
        label: "主高潮",
        prominence: 0,
      },
    ];
  }

  // 局部极大值检测
  const peaks: { idx: number; val: number; prom: number }[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (conflictArc[i] > conflictArc[i - 1] && conflictArc[i] >= conflictArc[i + 1]) {
      const leftMin = Math.min(...conflictArc.slice(Math.max(0, i - 2), i + 1));
      const rightMin = Math.min(...conflictArc.slice(i, Math.min(n, i + 3)));
      const prominence = conflictArc[i] - Math.max(leftMin, rightMin);
      peaks.push({ idx: i, val: conflictArc[i], prom: prominence });
    }
  }

  if (peaks.length === 0) {
    const peakIdx = conflictArc.indexOf(Math.max(...conflictArc));
    return [
      {
        sceneIndex: peakIdx,
        conflictValue: conflictArc[peakIdx],
        type: "primary_climax",
        intensity: Math.min(conflictArc[peakIdx] * 5, 5),
        label: "主高潮",
        prominence: 0,
      },
    ];
  }

  // 按 prominence 排序取 top
  peaks.sort((a, b) => b.prom - a.prom);
  const topPeaks = peaks.filter((p) => p.prom >= minProminence);
  const selected = topPeaks.length > 0 ? topPeaks.slice(0, 5) : peaks.slice(0, 1);

  // 按场景位置排序
  selected.sort((a, b) => a.idx - b.idx);

  const maxVal = Math.max(...selected.map((p) => p.val));
  const labelMap = ["开端转折", "发展转折", "主高潮", "回落转折", "收束转折"];

  return selected.map((p, i) => ({
    sceneIndex: p.idx,
    conflictValue: p.val,
    type: (p.val === maxVal ? "primary_climax" : "secondary_climax") as
      | "primary_climax"
      | "secondary_climax",
    intensity: Math.max(1, Math.min(5, Math.round((p.prom * 8 + 0.3) * 10) / 10)),
    label: p.val === maxVal ? "主高潮" : labelMap[i] || `转折点${i + 1}`,
    prominence: Math.round(p.prom * 10000) / 10000,
  }));
}

/* ================================================================
   2. 冲突类型分类 (对应 维度8)
   ================================================================ */

const CONFLICT_TYPE_LABELS: Record<string, string> = {
  character_conflict: "人物冲突",
  inner_conflict: "内心冲突",
  social_conflict: "社会冲突",
  environmental_conflict: "环境冲突",
  information_conflict: "信息冲突",
  goal_conflict: "目标冲突",
  mixed: "混合型冲突",
};

export function getConflictTypeLabel(type: string): string {
  return CONFLICT_TYPE_LABELS[type] || type;
}

export const CONFLICT_TYPES = [
  { key: "character_conflict", label: "人物冲突", color: "#c44d4d" },
  { key: "inner_conflict", label: "内心冲突", color: "#c77d8b" },
  { key: "social_conflict", label: "社会冲突", color: "#5e6b76" },
  { key: "environmental_conflict", label: "环境冲突", color: "#7f968d" },
  { key: "information_conflict", label: "信息冲突", color: "#b8926a" },
  { key: "goal_conflict", label: "目标冲突", color: "#c4a56e" },
  { key: "mixed", label: "混合型冲突", color: "#8a7a8e" },
];

/**
 * 冲突类型分类 (fallback) — 当 Python 预计算值缺失时使用。
 * 基于冲突弧形状、情感弧特征和角色密度的规则引擎。
 */
export function classifyConflictType(params: {
  genre?: string;
  conflictArc: number[];
  sentimentArc: number[];
  characterCount: number;
  conflictDensity?: number;
  emotionDensity?: number;
  top3Concentration?: number;
}): string {
  const { genre = "", conflictArc, sentimentArc, characterCount } = params;
  const n = conflictArc.length;
  if (n === 0) return "mixed";

  const avgConflict = conflictArc.reduce((s, v) => s + v, 0) / n;
  const conflictRange = Math.max(...conflictArc) - Math.min(...conflictArc);

  // 情感波动
  const sentimentDiffs =
    sentimentArc.length > 1
      ? sentimentArc.slice(1).map((v, i) => Math.abs(v - sentimentArc[i]))
      : [];
  const sentimentVolatility =
    sentimentDiffs.length > 0
      ? sentimentDiffs.reduce((s, v) => s + v, 0) / sentimentDiffs.length
      : 0;

  const gl = genre.toLowerCase();

  // 悬念型: 大幅波动 + 末段冲突低于开端
  if (
    conflictRange > 0.3 &&
    n >= 3 &&
    Math.max(...conflictArc) > 0.6 &&
    conflictArc[n - 1] < conflictArc[0] * 0.8
  ) {
    return "information_conflict";
  }

  // 人物冲突: 高冲突密度 + 多角色 + 历史/公案戏
  if (
    (avgConflict > 0.4 || (params.conflictDensity ?? 0) > 0.015) &&
    (characterCount >= 5 || gl.includes("历史") || gl.includes("公案"))
  ) {
    return "character_conflict";
  }

  // 内心冲突: 高情感密度 + 低冲突 + 家庭/情感戏
  if (
    (params.emotionDensity ?? 0) > (params.conflictDensity ?? 0) * 1.5 &&
    avgConflict < 0.35 &&
    (gl.includes("家庭") || gl.includes("情感") || gl.includes("旦角"))
  ) {
    return "inner_conflict";
  }

  // 社会冲突
  if (
    gl.includes("公案") ||
    gl.includes("忠奸") ||
    (characterCount >= 8 && conflictRange > 0.3 && gl.includes("历史"))
  ) {
    return "social_conflict";
  }

  // 环境冲突
  if (gl.includes("神怪") || gl.includes("神话")) {
    return "environmental_conflict";
  }

  // 目标冲突
  if (
    (params.conflictDensity ?? 0) > 0.02 &&
    (params.top3Concentration ?? 0) > 0.5 &&
    characterCount >= 3 &&
    characterCount <= 8
  ) {
    return "goal_conflict";
  }

  // 信息冲突
  if (conflictRange > 0.2 && sentimentVolatility > 0.15 && avgConflict < 0.5) {
    return "information_conflict";
  }

  return "mixed";
}

/* ================================================================
   3. 结构框架映射 (对应 维度1)
   ================================================================ */

const FRAMEWORK_LABELS: Record<string, string> = {
  "单点突转型": "单次高潮、集中释放",
  "起承转合式": "经典四段式推进",
  "三幕递进式": "三阶段逐步升级",
  "双线交织式": "两条叙事线交替推进",
  "环状回归式": "首尾呼应、回归起点",
  "散点群像式": "多角色平等展开",
  "情感波浪式": "情绪多波次推进",
};

export function getFrameworkDescription(framework: string): string {
  return FRAMEWORK_LABELS[framework] || "";
}

/**
 * 结构框架判定 (fallback) — 对应 维度1。
 * 当 Python 预计算值缺失时，从 fingerprint 数据推断。
 */
export function computeStructureFramework(params: {
  sceneCount: number;
  conflictArc: number[];
  sentimentArc: number[];
  conflictTrend: number;
  peakPosition: number;
  conflictRange: number;
  avgCharsPerScene: number;
  rhythmType: string;
}): StructureFramework {
  const { sceneCount: n, conflictArc, sentimentArc, conflictTrend, peakPosition, conflictRange, avgCharsPerScene: avgDensity } = params;

  if (n <= 2) return { framework: "单点突转型", confidence: 0.85 };

  // 高峰冲突段数
  const highConflictSegments = conflictArc.filter((v) => v > 0.5).length;

  // 情感跳跃次数
  const sentimentJumps = sentimentArc.reduce((count, v, i) => {
    if (i === 0) return count;
    return Math.abs(v - sentimentArc[i - 1]) > 0.25 ? count + 1 : count;
  }, 0);

  // 环状回归: 结尾冲突与开端接近
  if (
    n >= 4 &&
    Math.abs(conflictArc[n - 1] - conflictArc[0]) < 0.15 &&
    Math.abs(sentimentArc[n - 1] - sentimentArc[0]) < 0.2
  ) {
    return { framework: "环状回归式", confidence: 0.75 };
  }

  // 散点群像: 多角色 + 低冲突 + 多情感跳跃
  if (avgDensity > 3 && highConflictSegments < 2 && sentimentJumps >= 3) {
    return { framework: "散点群像式", confidence: 0.8 };
  }

  // 双线交织: 冲突多次交替起伏
  let alternations = 0;
  for (let i = 2; i < n; i++) {
    if (
      (conflictArc[i] - conflictArc[i - 1]) *
        (conflictArc[i - 1] - conflictArc[i - 2]) <
      0
    ) {
      alternations++;
    }
  }
  if (n >= 6 && alternations >= 3 && conflictRange > 0.3) {
    return { framework: "双线交织式", confidence: 0.7 };
  }

  // 情感波浪
  if (sentimentJumps >= 3 && conflictRange < 0.35 && n >= 4) {
    return { framework: "情感波浪式", confidence: 0.75 };
  }

  // 三幕递进: 冲突持续上升 + 中篇以上
  if (conflictTrend > 0.01 && n >= 5 && peakPosition > 0.6) {
    return { framework: "三幕递进式", confidence: 0.8 };
  }

  // 起承转合
  if (peakPosition >= 0.4 && peakPosition <= 0.85 && conflictRange > 0.2 && n >= 4) {
    return { framework: "起承转合式", confidence: 0.7 };
  }

  // 单点突转: 早期高潮或短剧
  if (peakPosition < 0.3 || n <= 3) {
    return { framework: "单点突转型", confidence: 0.8 };
  }

  return { framework: "起承转合式", confidence: 0.5 };
}

/* ================================================================
   4. 角色叙事驱动评分 (对应 维度6)
   ================================================================ */

interface CharacterMetrics {
  character: string;
  sceneCount: number;
  avgConflict: number;
  firstPos: number; // 0~1
  lastPos: number; // 0~1
  span: number; // lastPos - firstPos
}

/**
 * 为每个角色计算叙事驱动评分
 *
 * 评分公式: 出场范围权重 × 冲突参与权重 × 持续存在权重
 *   - 出场范围: 存在于全剧的跨度 (span)
 *   - 冲突参与: 所处场景的平均冲突强度
 *   - 持续存在: 出场场景数占比
 */
export function computeCharacterNarrativeDriveScore(
  chars: CharacterMetrics[]
): (CharacterMetrics & { driveScore: number })[] {
  if (chars.length === 0) return [] as (CharacterMetrics & { driveScore: number })[];
  const n = chars.length;

  return chars
    .map((c) => {
      const spanScore = c.span;
      const conflictScore = c.avgConflict;
      const presenceScore = c.sceneCount / Math.max(n, 1);

      const driveScore = Math.round(
        (spanScore * 0.35 + conflictScore * 0.4 + presenceScore * 0.25) * 100
      ) / 100;

      return { ...c, driveScore };
    })
    .sort((a, b) => b.driveScore - a.driveScore);
}

/* ================================================================
   5. 叙事DNA综合评价文本生成 (对应 维度9/10)
   ================================================================ */

interface DNAValues {
  sceneScale: number; // 0-100
  charDensity: number;
  conflictIntensity: number;
  emotionVolatility: number;
  climaxConcentration: number;
  suspenseRetention: number;
  perfFormComplexity: number; // 第7维: 表演形式复杂度
}

/**
 * 根据 7 维 DNA 值生成 2-3 句综合评价文本
 * 基于模板，无需 LLM。
 */
export function generateNarrativeDNAText(values: DNAValues, framework: string): string {
  const parts: string[] = [];

  // 冲突强度
  if (values.conflictIntensity >= 70) parts.push("冲突强度高");
  else if (values.conflictIntensity >= 45) parts.push("冲突强度中等");
  else parts.push("冲突强度较低");

  // 情绪波动
  if (values.emotionVolatility >= 65) parts.push("情绪波动剧烈");
  else if (values.emotionVolatility >= 40) parts.push("情绪有较明显起伏");
  else parts.push("情绪平稳推进");

  // 高潮位置
  if (values.climaxConcentration >= 70) parts.push("高潮高度集中");
  else if (values.climaxConcentration >= 45) parts.push("高潮分布适中");
  else parts.push("高潮较为分散");

  // 场景规模
  if (values.sceneScale >= 60) parts.push("场景宏阔");
  else if (values.sceneScale >= 30) parts.push("场景中等");
  else parts.push("场景紧凑");

  // 悬念保持
  const suspenseDesc =
    values.suspenseRetention >= 60
      ? "悬念保持能力强"
      : values.suspenseRetention >= 35
      ? "悬念保持能力一般"
      : "悬念快速释放";

  return `该剧本${parts.slice(0, 3).join("，")}，${suspenseDesc}，整体属于${framework}叙事模式。`;
}

/* ================================================================
   6. 表演形式复杂度计算
   ================================================================ */

/**
 * 从表演形式比率计算信息熵 (复杂度)
 * 熵越高说明表演形式越多样化
 */
export function computePerformanceFormEntropy(
  ratios: { singing: number; reciting: number; speaking: number; acting: number; fighting: number }
): number {
  const values = [
    Math.abs(ratios.singing),
    Math.abs(ratios.reciting),
    Math.abs(ratios.speaking),
    Math.abs(ratios.acting),
    Math.abs(ratios.fighting),
  ].filter((v) => v > 0);

  const total = values.reduce((s, v) => s + v, 0) || 1;
  const proportions = values.map((v) => v / total);

  let entropy = 0;
  for (const p of proportions) {
    entropy -= p * Math.log(p);
  }

  return entropy / Math.log(5); // 归一化 0~1
}
