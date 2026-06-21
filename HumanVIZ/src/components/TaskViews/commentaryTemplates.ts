/**
 * commentaryTemplates.ts
 * Template engine for 4-dimension character performance commentary.
 *
 * Generates structured commentary data for each dimension (唱/念/做/打)
 * based on a character's score relative to category and global statistics.
 */

/* ── Types ── */

export type Dimension = "sing" | "speak" | "act" | "fight";

/** 4-level classification based on z-score relative to category mean */
export type CommentaryLevel = "卓越" | "优秀" | "中等" | "偏低";

export interface CommentaryCard {
  dim: Dimension;
  label: string;            // "唱"
  fullLabel: string;        // "歌唱"
  icon: string;             // "🎵"
  score: number;            // display value (0-100 scale)
  level: CommentaryLevel;
  levelColor: string;
  categoryName: string;     // 生/旦/净/丑/其他
  categoryMean: number;     // display scale
  deviationFromCategory: number;  // ± percentage points
  globalMean: number;
  globalPercentile: number;
  body: string;             // domain-knowledge paragraph
  summary: string;          // one-line summary
}

export interface CategoryStats {
  mean: number;   // 0-1 internal scale
  sd: number;
}

export interface CommentaryInput {
  charName: string;
  displayName?: string;     // colloquial name if different
  isExpert: boolean;
  category: string;         // 生/旦/净/丑/其他
  scriptCount: number;
  scores: Record<Dimension, number>;         // 0-1 internal
  percentiles: Record<Dimension, number>;    // 0-100
  categoryStats: Record<Dimension, CategoryStats>;
  globalStats: Record<Dimension, { mean: number; sd: number }>;
}

/* ── Dimension metadata ── */

interface DimMeta {
  label: string;
  full: string;
  icon: string;
  color: string;
  desc: string;
}

const DIM_META: Record<Dimension, DimMeta> = {
  sing: {
    label: "唱", full: "歌唱", icon: "🎵", color: "#b89b6d",
    desc: "唱功是京剧表演的核心声乐技能，以板腔体唱段为表现形式，是区分演唱型与对白型角色的关键维度。老生、青衣等行当以唱工见长，常通过大段唱腔塑造人物。",
  },
  speak: {
    label: "念", full: "念白", icon: "🎤", color: "#96544d",
    desc: "念白是京剧台词的艺术化表达，包含韵白与散白两种形式，体现角色的身份层级与文化修养。净行讲究『虎音』气势，旦行注重『莺声』韵味。",
  },
  act: {
    label: "做", full: "身段", icon: "💃", color: "#7f968d",
    desc: "做功即身段动作表演，涵盖面部表情、手势步法、水袖髯口等程式化动作体系，是展现人物行为特征与情感状态的核心手段。",
  },
  fight: {
    label: "打", full: "武打", icon: "⚔️", color: "#5e6b76",
    desc: "武打是京剧武戏的表演形式，融合武术套路、翻打跌扑与舞蹈化对打，集中体现角色的武戏属性与动作复杂度。武生、武旦、武丑等以武打为标志性技能。",
  },
};

/* ── Color constants ── */

const LEVEL_COLORS: Record<CommentaryLevel, string> = {
  "卓越": "#b89b6d",   // gold
  "优秀": "#7f968d",   // celadon
  "中等": "#5e6b76",   // slate
  "偏低": "#8a939b",   // muted grey
};

/* ── Level classification ── */

/**
 * Classify a character's score into one of 4 levels.
 * Uses z-score relative to category mean:
 *   z ≥ 1.5  → "卓越"
 *   z ≥ 0.5  → "优秀"
 *   z ≥ -0.5 → "中等"
 *   z < -0.5 → "偏低"
 */
function classifyLevel(zScore: number): CommentaryLevel {
  if (zScore >= 1.5) return "卓越";
  if (zScore >= 0.5) return "优秀";
  if (zScore >= -0.5) return "中等";
  return "偏低";
}

/* ── Template body text generators ── */

/**
 * Generate the domain-knowledge body paragraph for a given dimension and level.
 * Parameterized with character name, scores, and statistics.
 */
function generateBody(
  dim: Dimension,
  level: CommentaryLevel,
  input: CommentaryInput,
  scoreDisplay: number,
  catMeanDisplay: number,
  _devDisplay: number,
): string {
  const name = input.displayName || input.charName;
  const cat = input.category === "其他" ? "未归类" : input.category + "行";
  const confNote = input.isExpert
    ? "（领域知识参考值）"
    : input.scriptCount < 5
      ? `（基于 ${input.scriptCount} 部剧本统计，样本较少）`
      : `（基于 ${input.scriptCount} 部剧本聚合统计）`;

  const templates: Record<CommentaryLevel, Record<Dimension, string>> = {
    "卓越": {
      sing:
        `${name}的唱功表现（${scoreDisplay}%）显著超越${cat}均值（${catMeanDisplay}%），` +
        `在全部 3,581 个角色中位列前 ${input.percentiles.sing}%。` +
        `大段板腔体唱段是塑造该人物的核心表演手段，体现了京剧「以唱传情」的艺术特征。` +
        `${confNote}${DIM_META.sing.desc}`,
      speak:
        `${name}的念白表现（${scoreDisplay}%）显著超越${cat}均值（${catMeanDisplay}%），` +
        `在全部角色中位列前 ${input.percentiles.speak}%。` +
        `念白比重偏高反映角色以台词交锋为核心戏剧动作，可能属于白口功夫突出的行当类型。` +
        `${confNote}`,
      act:
        `${name}的身段表现（${scoreDisplay}%）显著超越${cat}均值（${catMeanDisplay}%），` +
        `在全部角色中位列前 ${input.percentiles.act}%。` +
        `身段动作密度突出，表明该角色依赖丰富的程式化肢体语言来塑造人物。` +
        `${confNote}${DIM_META.act.desc}`,
      fight:
        `${name}的武打表现（${scoreDisplay}%）显著超越${cat}均值（${catMeanDisplay}%），` +
        `在全部角色中位列前 ${input.percentiles.fight}%。` +
        `武打场面的高比重揭示该角色的武戏属性，具备「打中有戏、戏中有打」的武行特征。` +
        `${confNote}${DIM_META.fight.desc}`,
    },

    "优秀": {
      sing:
        `${name}的唱功表现（${scoreDisplay}%）高于${cat}均值（${catMeanDisplay}%），` +
        `位列全角色前 ${input.percentiles.sing}%。` +
        `唱段占比偏高说明该角色的音乐性表达在表演中占据较重要位置。${confNote}`,
      speak:
        `${name}的念白表现（${scoreDisplay}%）高于${cat}均值（${catMeanDisplay}%），` +
        `位列全角色前 ${input.percentiles.speak}%。` +
        `台词对白比重较大，角色的戏剧推进主要依靠念白完成。${confNote}`,
      act:
        `${name}的身段表现（${scoreDisplay}%）高于${cat}均值（${catMeanDisplay}%），` +
        `位列全角色前 ${input.percentiles.act}%。` +
        `身段动作密度略高于同类，具有一定的做功表现力。${confNote}`,
      fight:
        `${name}的武打表现（${scoreDisplay}%）高于${cat}均值（${catMeanDisplay}%），` +
        `位列全角色前 ${input.percentiles.fight}%。` +
        `武打场面比重略高，角色具有一定的武戏色彩。${confNote}`,
    },

    "中等": {
      sing:
        `${name}的唱功表现（${scoreDisplay}%）接近${cat}均值（${catMeanDisplay}%），` +
        `处于全角色中等水平（前 ${input.percentiles.sing}%）。` +
        `唱段占比适中，角色的戏剧表达可能以念白或做功为主要手段。${confNote}`,
      speak:
        `${name}的念白表现（${scoreDisplay}%）接近${cat}均值（${catMeanDisplay}%），` +
        `处于全角色中等水平（前 ${input.percentiles.speak}%）。` +
        `念白占比处于常态范围，角色在唱念做打之间保持常规配比。${confNote}`,
      act:
        `${name}的身段表现（${scoreDisplay}%）接近${cat}均值（${catMeanDisplay}%），` +
        `处于全角色中等水平（前 ${input.percentiles.act}%）。` +
        `身段动作频率属正常范围，舞台调度以台词驱动为主。${confNote}`,
      fight:
        `${name}的武打表现（${scoreDisplay}%）接近${cat}均值（${catMeanDisplay}%），` +
        `处于全角色中等水平（前 ${input.percentiles.fight}%）。` +
        `武打场面占比处于常规水准，非武行核心角色。${confNote}`,
    },

    "偏低": {
      sing:
        `${name}的唱功表现（${scoreDisplay}%）低于${cat}均值（${catMeanDisplay}%），` +
        `在全角色中位列后 ${100 - input.percentiles.sing}%。` +
        `唱段占比较少，角色的戏剧张力更依赖于念白身段等非声乐手段。${confNote}`,
      speak:
        `${name}的念白表现（${scoreDisplay}%）低于${cat}均值（${catMeanDisplay}%），` +
        `在全角色中位列后 ${100 - input.percentiles.speak}%。` +
        `台词负荷较轻，可能为功能性配角或以动作表演为主的角色。${confNote}`,
      act:
        `${name}的身段表现（${scoreDisplay}%）低于${cat}均值（${catMeanDisplay}%），` +
        `在全角色中位列后 ${100 - input.percentiles.act}%。` +
        `身段动作较少，角色以声乐表达（唱/念）为绝对主导。${confNote}`,
      fight:
        `${name}的武打表现（${scoreDisplay}%）低于${cat}均值（${catMeanDisplay}%），` +
        `在全角色中位列后 ${100 - input.percentiles.fight}%。` +
        `武打成分极少，属于文戏角色，远离交战与动作场面。${confNote}`,
    },
  };

  return templates[level][dim];
}

function generateSummary(
  dim: Dimension,
  level: CommentaryLevel,
  scoreDisplay: number,
  devDisplay: number,
): string {
  const dir = devDisplay >= 0 ? "高于" : "低于";
  const cat = DIM_META[dim].full;
  const summaries: Record<CommentaryLevel, string> = {
    "卓越": `${cat}表现卓越（${scoreDisplay}%），${dir}同类均值 ${Math.abs(devDisplay).toFixed(1)}pp`,
    "优秀": `${cat}表现优秀（${scoreDisplay}%），${dir}同类均值 ${Math.abs(devDisplay).toFixed(1)}pp`,
    "中等": `${cat}表现中等（${scoreDisplay}%），${dir}同类均值 ${Math.abs(devDisplay).toFixed(1)}pp`,
    "偏低": `${cat}表现偏低（${scoreDisplay}%），${dir}同类均值 ${Math.abs(devDisplay).toFixed(1)}pp`,
  };
  return summaries[level];
}

/* ── Main function ── */

/**
 * Build a full CommentaryCard for a single dimension.
 */
export function buildCommentaryCard(
  dim: Dimension,
  input: CommentaryInput,
): CommentaryCard {
  const meta = DIM_META[dim];
  const score = input.scores[dim];              // 0-1 internal
  const catStats = input.categoryStats[dim];
  const globStats = input.globalStats[dim];

  // Convert to 0-100 display scale
  const scoreDisplay = Math.round(score * 100);
  const catMeanDisplay = Math.round(catStats.mean * 100);
  const globMeanDisplay = Math.round(globStats.mean * 100);

  // Compute z-score relative to category
  const zScore = catStats.sd > 0
    ? (score - catStats.mean) / catStats.sd
    : 0;

  const level = classifyLevel(zScore);
  const deviationFromCategory = scoreDisplay - catMeanDisplay;
  const body = generateBody(dim, level, input, scoreDisplay, catMeanDisplay, deviationFromCategory);
  const summary = generateSummary(dim, level, scoreDisplay, deviationFromCategory);

  return {
    dim,
    label: meta.label,
    fullLabel: meta.full,
    icon: meta.icon,
    score: scoreDisplay,
    level,
    levelColor: LEVEL_COLORS[level],
    categoryName: input.category === "其他" ? "未归类" : input.category + "行",
    categoryMean: catMeanDisplay,
    deviationFromCategory,
    globalMean: globMeanDisplay,
    globalPercentile: input.percentiles[dim],
    body,
    summary,
  };
}

/**
 * Build all 4 CommentaryCards for a character.
 */
export function buildAllCommentaries(input: CommentaryInput): CommentaryCard[] {
  return (["sing", "speak", "act", "fight"] as Dimension[]).map(dim =>
    buildCommentaryCard(dim, input),
  );
}

/**
 * Get dimension metadata for display.
 */
export function getDimMeta(dim: Dimension): DimMeta {
  return DIM_META[dim];
}

export { DIM_META, LEVEL_COLORS };
