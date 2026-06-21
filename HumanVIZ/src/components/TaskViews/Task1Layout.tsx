import React, { useEffect, useRef, useState, useMemo } from "react";
import * as echarts from "echarts";
import * as d3 from "d3";
import RoleTreeModal from "../Modals/RoleTreeModal";
import { ROLE_DETAILS, CATEGORY_META, type RoleDetail } from "../../data/role-details";
import {
  buildMainEvolutionOption,
  buildHeatmapOption,
  buildEntropyChartOption,
  buildJSDMatrixOption,
  buildModalMainOption,
  buildEvolutionSummary,
  type EnrichedPoint,
  type TrendResult,
  type GrowthMatrixItem,
  type EntropyItem,
} from "./task1-evolution-charts";

import evolutionJson from "../../data/task1-evolution.json";
import sourceEvolutionJson from "../../data/source-evolution.json";
import sankeyJson from "../../data/task1-sankey.json";
import inferenceJson from "../../data/task1-inference.json";
import performanceJson from "../../data/task1-performance.json";
import starmapData from "../../data/starmap-data.json";

import {
  DimDiscriminantCard,
  KeyFindingsCards,
  KnowledgeDiscoveryPanel,
  StatisticalEvidencePanel,
} from "./task1-performance-panels";

import CharacterSearch from "./CharacterSearch";
import PerformanceRadarChart from "./PerformanceRadarChart";
import CommentaryCards from "./CommentaryCards";
import {
  loadCharacterIndex,
  loadPerformanceStats,
  buildCommentaryInput,
  type CharacterIndex,
} from "./CharacterPerformanceLoader";
import {
  buildAllCommentaries,
  type CommentaryCard,
  type CommentaryInput,
} from "./commentaryTemplates";

import PeriodButtons from "./PeriodButtons";
import PeriodPopover from "./PeriodPopover";
import { PERIOD_INFO_LIST, PERIOD_MAP } from "../../data/periodData";

import "./Task1Layout.scss";

/* ================================================================
   Data — 戏曲角色行当推断与演化分析
   演化/Sankey/推理/表演聚合数据由 build_task1_analysis.py 从真实数据源生成。
   典型角色表演剖面为 8 个代表性角色的领域知识参考值。
   ================================================================ */

// ── 主题色 hex 常量 (ECharts Canvas 无法解析 CSS var, 必须使用 hex) ──
const C = {
  gold:      "#b89b6d",
  red:       "#96544d",
  slate:     "#5e6b76",
  celadon:   "#7f968d",
  wood:      "#7a5e4e",
  ink:       "#3a2c21",
  textSoft:  "#8a939b",
  border:    "rgba(94,107,118,0.2)",
  borderSoft:"rgba(94,107,118,0.12)",
  borderStrong:"rgba(94,107,118,0.35)",
  bgContainer:"rgba(255,253,249,0.96)",
  goldLight: "rgba(184,155,109,0.35)",
  goldDark:  "rgba(184,155,109,0.75)",
  redLight:  "rgba(150,84,77,0.35)",
  redDark:   "rgba(150,84,77,0.75)",
  redMid:    "rgba(150,84,77,0.55)",
  redLightest:"rgba(150,84,77,0.15)",
  slateLight:"rgba(94,107,118,0.3)",
  celadonLight:"rgba(127,150,141,0.35)",
  celadonMid:"rgba(127,150,141,0.55)",
  celadonDark:"rgba(127,150,141,0.75)",
  celadonLightest:"rgba(127,150,141,0.08)",
  parchment:"#e9dfc9",
  white08:   "rgba(255,255,255,0.8)",
  shadow:    "rgba(94,107,118,0.16)",
} as const;

// ── 统计计算工具函数 ──

/** Wilson 比例置信区间 (95%, z=1.96) — 用于时期占比的不确定性估计 */
function wilsonCI(count: number, total: number): [number, number] {
  if (total <= 0) return [0, 0];
  const p = count / total;
  const z = 1.96;
  const denominator = 1 + z * z / total;
  const centre = p + z * z / (2 * total);
  const adjustment = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total));
  const lower = Math.max(0, (centre - adjustment) / denominator);
  const upper = Math.min(1, (centre + adjustment) / denominator);
  return [lower * 100, upper * 100];
}

/** 普通最小二乘线性回归 — 返回斜率、截距、R² (用于趋势线拟合) */
function linearRegression(ys: number[]): { slope: number; intercept: number; r2: number } {
  const n = ys.length;
  const xs = Array.from({ length: n }, (_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let ssxy = 0, ssxx = 0, ssyy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    ssxy += dx * dy;
    ssxx += dx * dx;
    ssyy += dy * dy;
  }
  const slope = ssxx > 0 ? ssxy / ssxx : 0;
  const intercept = meanY - slope * meanX;
  const r2 = (ssxx > 0 && ssyy > 0) ? (ssxy * ssxy) / (ssxx * ssyy) : 0;
  return { slope, intercept, r2 };
}

// ── 后端规范配色 (starmap-data.json / config.roleColors) ──
const BACKEND_ROLE_COLORS: Record<string, string> = (starmapData as any).config?.roleColors ?? {
  生: "#b8926a", 旦: "#96544d", 净: "#5e6b76", 丑: "#7f968d", 其他: "#a0a0a0",
};

// ── 颜色辅助函数（模块级，供 SUNBURST_DATA 与 D3 渲染共用）──
function shadeLighter(hex: string, amount: number): string {
  const c = d3.hsl(hex);
  c.l = Math.min(0.88, c.l + amount);
  c.s = Math.max(0.18, c.s - amount * 0.5);
  return c.formatHex();
}
function shadeDarker(hex: string, amount: number): string {
  const c = d3.hsl(hex);
  c.l = Math.max(0.1, c.l - amount);
  c.s = Math.max(0.1, c.s - amount * 0.3);
  return c.formatHex();
}

// ── D3 旭日图数据（颜色从后端规范配色派生）──
// 外圈子类颜色按 value 降序逐级变浅
const SUNBURST_SUB_CONFIG = [
  { name: "生", subs: [
    { name: "老生", value: 1439 }, { name: "小生", value: 739 },
    { name: "生",   value: 466 },  { name: "武生", value: 340 },
    { name: "末",   value: 242 },  { name: "外",   value: 156 },
    { name: "红生", value: 108 },
  ]},
  { name: "旦", subs: [
    { name: "旦",   value: 877 },  { name: "老旦", value: 279 },
    { name: "正旦", value: 108 },  { name: "花旦", value: 96 },
    { name: "彩旦", value: 74 },   { name: "武旦", value: 65 },
    { name: "贴旦", value: 55 },   { name: "青衣", value: 17 },
    { name: "花衫", value: 8 },
  ]},
  { name: "净", subs: [
    { name: "净",   value: 1439 },  { name: "副净", value: 158 },
    { name: "武净", value: 39 },
  ]},
  { name: "丑", subs: [
    { name: "丑",   value: 1110 }, { name: "武丑", value: 55 },
    { name: "丑旦", value: 26 },
  ]},
];

const SUNBURST_DATA: any = {
  name: "行当",
  children: SUNBURST_SUB_CONFIG.map(cat => {
    const catColor = BACKEND_ROLE_COLORS[cat.name] ?? "#8E8A84";
    const sorterSubs = [...cat.subs].sort((a, b) => b.value - a.value);
    const children = sorterSubs.map((sub, i, arr) => {
      const lightAmt = 0.06 + (i / Math.max(1, arr.length - 1)) * 0.22;
      return { ...sub, color: shadeLighter(catColor, lightAmt) };
    });
    return {
      name: cat.name,
      color: catColor,
      colorSide: shadeDarker(catColor, 0.15),
      children,
    };
  }),
};
// 计算每个大类 value 并由子类汇总得到总计
SUNBURST_DATA.children.forEach((cat: any) => {
  cat.value = cat.children.reduce((s: number, ch: any) => s + (ch.value || 0), 0);
});
const SUNBURST_GRAND_TOTAL = SUNBURST_DATA.children.reduce((s: number, c: any) => s + c.value, 0);

// ── 角色人次映射 (从旭日图 SUNBURST_DATA 聚合, 供左侧 RoleDetailPanel 引用) ──
// 将旭日图细颗粒子类汇总到 ROLE_DETAILS 的 11 个标准类型
const ROLE_COUNT_MAP: Record<string, number> = {
  "老生": 1439,
  "小生": 739,
  "武生": 340,
  "末·外·生": 466 + 242 + 156 + 108,   // 生 + 末 + 外 + 红生
  "青衣·正旦": 108 + 17,               // 正旦 + 青衣
  "老旦": 279,
  "花旦·花衫": 96 + 8,                 // 花旦 + 花衫
  "武旦": 65,
  "净": 1439 + 158 + 39,               // 净 + 副净 + 武净
  "文丑": 1110,                         // 丑(文丑主体)
  "武丑": 55,
};
const CATEGORY_TOTALS: Record<string, number> = {
  "生": 3490, "旦": 1579, "净": 1636, "丑": 1191,
};

// 规则推断知识库 — 11 条核心推断规则（从实际角色标注数据统计生成）
const INFERENCE_RULES = inferenceJson.rules;

// 典型角色表演剖面 — 8 个代表性角色的领域知识参考值 (0–100 示意尺度，用于角色间对比)
const PERFORMANCE_DATA = [
  { role: "包公", sing: 82, speak: 75, act: 50, fight: 15 },
  { role: "诸葛亮", sing: 85, speak: 80, act: 45, fight: 10 },
  { role: "穆桂英", sing: 60, speak: 55, act: 78, fight: 85 },
  { role: "孙悟空", sing: 30, speak: 50, act: 95, fight: 90 },
  { role: "唐明皇", sing: 70, speak: 65, act: 55, fight: 20 },
  { role: "杨贵妃", sing: 88, speak: 60, act: 65, fight: 10 },
  { role: "曹操", sing: 65, speak: 75, act: 60, fight: 35 },
  { role: "红娘", sing: 55, speak: 80, act: 72, fight: 25 },
];

// 角色配色 — 按行当大类归属映射，同门角色以深浅区分
const ROLE_COLORS: Record<string, string> = {
  "包公": "#5E6B76",     // 净 — 石板灰 (theme-slate)
  "诸葛亮": "#B89B6D",   // 老生 — 琉璃金 (theme-gold)
  "穆桂英": "#96544D",   // 武旦 — 朱砂红 (theme-red)
  "孙悟空": "#7F968D",   // 武丑 — 云水青 (theme-celadon)
  "唐明皇": "#CFBFA0",   // 老生 — 琉璃金·浅 (gold light)
  "杨贵妃": "#B8807A",   // 青衣·正旦 — 朱砂红·浅 (red light)
  "曹操": "#8A949D",     // 净 — 石板灰·浅 (slate light)
  "红娘": "#CFAAA5",     // 花旦·花衫 — 朱砂红·更浅 (red lighter)
};

/* ================================================================
   Statistical constants — 描述性统计与假设检验结果
   ================================================================ */

// 表演维度描述性统计 (n=8 典型角色剖面)
interface DimStats {
  mean: number; sd: number; cv: string; sem: number; ciLow: number; ciHigh: number;
  variability: string; // 变异程度描述
}
const PERFORMANCE_DIM_STATS: Record<Dimension, DimStats> = {
  sing:   { mean: 66.9, sd: 19.1, cv: "28.6%", sem: 6.8,  ciLow: 50.9, ciHigh: 82.9, variability: "中等" },
  speak:  { mean: 67.5, sd: 11.7, cv: "17.3%", sem: 4.1,  ciLow: 57.8, ciHigh: 77.2, variability: "较低" },
  act:    { mean: 65.0, sd: 16.3, cv: "25.1%", sem: 5.8,  ciLow: 51.3, ciHigh: 78.7, variability: "中等" },
  fight:  { mean: 36.3, sd: 32.7, cv: "90.2%", sem: 11.6, ciLow: 8.9,  ciHigh: 63.6, variability: "极高" },
};

// 角色百分位排名 (每个角色在每个维度的排名，1=最高)
function computePercentileRank(values: number[], target: number): number {
  const sorted = [...values].sort((a, b) => b - a); // descending
  const rank = sorted.indexOf(target) + 1;
  return Math.round(rank / values.length * 100);
}
const ALL_SING = PERFORMANCE_DATA.map(d => d.sing);
const ALL_SPEAK = PERFORMANCE_DATA.map(d => d.speak);
const ALL_ACT = PERFORMANCE_DATA.map(d => d.act);
const ALL_FIGHT = PERFORMANCE_DATA.map(d => d.fight);

interface RolePercentile {
  singPctl: number; speakPctl: number; actPctl: number; fightPctl: number;
}
const ROLE_PERCENTILES: Record<string, RolePercentile> = {};
PERFORMANCE_DATA.forEach(d => {
  ROLE_PERCENTILES[d.role] = {
    singPctl: computePercentileRank(ALL_SING, d.sing),
    speakPctl: computePercentileRank(ALL_SPEAK, d.speak),
    actPctl: computePercentileRank(ALL_ACT, d.act),
    fightPctl: computePercentileRank(ALL_FIGHT, d.fight),
  };
});

// 卡方检验 — 特征-行当关联 (29特征 × 11行当, N=6,275)
const SANKEY_CHI_SQUARE = sankeyJson.chiSquare;

// 四维定义 — 唱念做打
export type Dimension = "sing" | "speak" | "act" | "fight";

// 典型角色 → 行当映射 (用于推断分析)
const ROLE_TO_ROLE_TYPE: Record<string, string> = {
  "包公": "净",
  "诸葛亮": "老生",
  "穆桂英": "武旦",
  "孙悟空": "武丑",
  "唐明皇": "老生",
  "杨贵妃": "青衣·正旦",
  "曹操": "净",
  "红娘": "花旦·花衫",
};

// 主视图标签页 — 三个可切换分析页面
type MainView = "roleSystem" | "evolution" | "performance";

const VIEW_LABELS: Record<MainView, string> = {
  roleSystem: "角色体系与演化",
  evolution: "行当演化趋势",
  performance: "表演模式分析",
};

const VIEW_ICONS: Record<MainView, string> = {
  roleSystem: "👥",
  evolution: "📜",
  performance: "🎭",
};
// 四维颜色按行当对应：唱→金(生行重唱工)，念→红(旦行重韵白)，做→青(丑行重做工)，打→灰(武行主武打)
const DIMENSIONS: { key: Dimension; label: string; full: string; color: string }[] = [
  { key: "sing", label: "唱", full: "歌唱", color: "#b89b6d" },
  { key: "speak", label: "念", full: "念白", color: "#96544d" },
  { key: "act", label: "做", full: "身段", color: "#7f968d" },
  { key: "fight", label: "打", full: "武打", color: "#5e6b76" },
];

const DIM_DESC: Record<Dimension, string> = {
  sing: "歌唱表演占比",
  speak: "念白台词占比",
  act: "身段动作占比",
  fight: "武打场面占比",
};

// 行当-特征关联数据 (用于Sankey) — 由 build_task1_analysis.py 从实际角色统计计算
const SANKEY_LINKS = sankeyJson.links;

// 行当演化数据 — 6 个编纂时期 × 11 个行当子类（从 scripts-summary + structural_fingerprints 统计）
const EVOLUTION_DATA: Array<{ era: string; [key: string]: any }> = evolutionJson.periods.map((p: any) => ({
  era: p.shortLabel,
  ...Object.fromEntries(evolutionJson.roleSubtypes.map((sub: string) => [sub, p.subtypeCounts[sub] || 0])),
}));

// 演化趋势 — 四大行当聚合 (生/旦/净/丑) + 占比（基于真实数据）
const EVOLUTION_4CAT = evolutionJson.evolution4Cat.map((d: any) => {
  const total = d["生"] + d["旦"] + d["净"] + d["丑"];
  return {
    era: d.era,
    生: d["生"], 旦: d["旦"], 净: d["净"], 丑: d["丑"],
    生_pct: total > 0 ? Math.round(d["生"] / total * 100) : 0,
    旦_pct: total > 0 ? Math.round(d["旦"] / total * 100) : 0,
    净_pct: total > 0 ? Math.round(d["净"] / total * 100) : 0,
    丑_pct: total > 0 ? Math.round(d["丑"] / total * 100) : 0,
  };
});

// 四大行当类别配色 (hex 值 — ECharts Canvas 需 hex, 与主题色系一致)
// 演化标签使用新的琥珀/橙/蓝/翠色系；其他标签页沿用旧色系(C.*)
const EVO_4CAT_COLORS: Record<string, string> = {
  "生": "#b8926a",
  "旦": "#96544d",
  "净": "#5e6b76",
  "丑": "#7f968d",
};

// 编纂时期 → 年代范围映射 (用于 X 轴双行标签)
const ERA_YEAR_RANGE: Record<string, string> = {
  "民国汇编": "1915–1949",
  "新中国整理": "1950–1999",
  "名家演出": "1920–1990",
  "昆曲传承": "1950–2000",
  "录音藏本": "1930–2000",
  "现代创作": "1950–1980",
};


/* ================================================================
   Sub-components — 角色特征数据
   ================================================================ */


// 特征标签词汇表 — 从 role-treering.json 领域知识标签提取


// ── 演化数据增强：置信区间与趋势分析 ──

const EVO_CATEGORIES = ["生", "旦", "净", "丑"] as const;

/** 取整到 1 位小数 */
function r1(v: number): number { return Math.round(v * 10) / 10; }

/** 将原始 period 数据与 EVOLUTION_4CAT 交叉关联, 计算每时期每行当的 Wilson CI 与趋势参数 */
function buildEnrichedEvolutionData(): {
  points: EnrichedPoint[];
  trends: Record<string, { slope: number; intercept: number; r2: number }>;
  trendAnalysis: Record<string, TrendResult>;
  growthMatrix: GrowthMatrixItem[];
  entropyData: EntropyItem[];
  jsdMatrix: number[][];
  mostSimilar: { periodA: string; periodB: string; distance: number } | null;
  mostDifferent: { periodA: string; periodB: string; distance: number } | null;
  chiSquare: { chiSq: number; df: number; p: string; cramerV: number; interpretation: string };
  overallTrend: string;
  insights: Array<{ finding: string; evidence: string; statisticalExplanation: string; culturalInterpretation: string }>;
} {
  const points = EVOLUTION_4CAT.map((d: any) => {
    const period = evolutionJson.periods.find((p: any) => p.shortLabel === d.era);
    const n: number = period?.totalRoleAppearances ?? 0;
    const counts: Record<string, number> = period?.categoryCounts ?? {};
    const point: any = { era: d.era, n };
    EVO_CATEGORIES.forEach(cat => {
      point[cat] = r1(d[cat]);
      const cnt = counts[cat] ?? 0;
      const [ciLow, ciHigh] = wilsonCI(cnt, n);
      point[`${cat}_ciLow`] = r1(ciLow);
      point[`${cat}_ciHigh`] = r1(ciHigh);
    });
    return point;
  });

  const trends: Record<string, { slope: number; intercept: number; r2: number }> = {};
  EVO_CATEGORIES.forEach(cat => {
    const values = points.map(p => p[cat] as number);
    trends[cat] = linearRegression(values);
  });

  const trendAnalysis = (evolutionJson as any).trendAnalysis ?? {};
  const growthMatrix = (evolutionJson as any).growthMatrix ?? [];
  const entropyData = (evolutionJson as any).diversity?.entropyPerPeriod ?? [];
  const overallTrend = (evolutionJson as any).diversity?.overallTrend ?? "stable";
  const jsdMatrix = (evolutionJson as any).structuralChange?.jsdMatrix ?? [];
  const mostSimilar = (evolutionJson as any).structuralChange?.mostSimilar ?? null;
  const mostDifferent = (evolutionJson as any).structuralChange?.mostDifferent ?? null;
  const chiSquare = (evolutionJson as any).significance?.chiSquare ?? { chiSq: 0, df: 0, p: "n/a", cramerV: 0, interpretation: "n/a" };
  const insights = (evolutionJson as any).insights ?? [];

  return { points, trends, trendAnalysis, growthMatrix, entropyData, overallTrend, jsdMatrix, mostSimilar, mostDifferent, chiSquare, insights };
}

const EVOLUTION_ENRICHED = buildEnrichedEvolutionData();

// ── 共享 ECharts 配置工厂函数 (EvolutionFullChart + EvolutionModal 复用) ──

function buildEvolutionChartOption(): any {
  const eras = EVOLUTION_ENRICHED.points.map(d => d.era);
  const cats = [...EVO_CATEGORIES];
  const { points, trends } = EVOLUTION_ENRICHED;

  const catsWithTrend = cats.filter(c => Math.abs(trends[c].slope) > 0.3);

  // ── 主系列 + CI 带 + 趋势线 ──
  const series: any[] = [];

  cats.forEach((cat, idx) => {
    // 主折线
    series.push({
      name: cat,
      type: "line",
      data: points.map(d => (d as any)[cat]),
      symbol: "circle",
      symbolSize: 7,
      lineStyle: { width: 3, color: EVO_4CAT_COLORS[cat], shadowBlur: 6, shadowColor: EVO_4CAT_COLORS[cat] },
      itemStyle: { color: EVO_4CAT_COLORS[cat], borderColor: "#fff", borderWidth: 1.5 },
      areaStyle: {
        opacity: 0.1,
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: EVO_4CAT_COLORS[cat] },
          { offset: 1, color: "transparent" },
        ]),
      },
      emphasis: {
        focus: "series",
        symbolSize: 12,
        itemStyle: { shadowBlur: 16, shadowColor: EVO_4CAT_COLORS[cat] },
      },
      animationDelay: idx * 350,
      markLine: {
        silent: true, symbol: "none",
        lineStyle: { color: "#8a939b", type: "dashed", width: 1, opacity: 0.35 },
        data: [{ type: "average", name: "均值" }],
        label: { show: false },
      },
    });

    // ── 置信区间带 (上下界堆叠面积) ──
    const lows = points.map(d => (d as any)[`${cat}_ciLow`] as number);
    const highs = points.map(d => (d as any)[`${cat}_ciHigh`] as number);
    const widths = highs.map((h, i) => h - lows[i]);

    // 下界 (透明, 定义堆叠基线)
    series.push({
      name: `${cat}_ci`,
      type: "line",
      stack: `ci_${cat}`,
      data: lows,
      lineStyle: { opacity: 0 },
      areaStyle: { opacity: 0 },
      showSymbol: false,
      silent: true,
      tooltip: { show: false },
      emphasis: { disabled: true },
      legendHoverLink: false,
      animation: false,
    });
    // 区间带 (半透明, 堆叠在下界之上)
    series.push({
      name: `${cat}_ci`,
      type: "line",
      stack: `ci_${cat}`,
      data: widths,
      lineStyle: { opacity: 0 },
      areaStyle: { opacity: 0.15, color: EVO_4CAT_COLORS[cat] },
      showSymbol: false,
      silent: true,
      tooltip: { show: false },
      emphasis: { disabled: true },
      legendHoverLink: false,
      animation: false,
    });

    // ── 线性趋势线 (虚线, 仅斜率显著时显示) ──
    if (Math.abs(trends[cat].slope) > 0.3) {
      const trendData = points.map((_, i) => r1(trends[cat].slope * i + trends[cat].intercept));
      series.push({
        name: `${cat}_trend`,
        type: "line",
        data: trendData,
        showSymbol: false,
        lineStyle: { width: 1.5, type: "dashed", color: EVO_4CAT_COLORS[cat], opacity: 0.55 },
        tooltip: { show: false },
        emphasis: { disabled: true },
        legendHoverLink: false,
        animation: false,
        z: 1,
      });
    }
  });

  // ── Tooltip 增强 ──
  const tooltip = {
    trigger: "axis" as const,
    backgroundColor: "rgba(255,253,249,0.96)",
    borderColor: "rgba(184,155,109,0.35)",
    borderWidth: 1,
    padding: [12, 16],
    textStyle: { fontSize: 13, color: "#7a5e4e", fontFamily: "Noto Sans SC, sans-serif" as const },
    formatter: (params: any) => {
      if (!Array.isArray(params) || params.length === 0) return "";
      // 只取主系列 (忽略 ci / trend)
      const main = params.filter((p: any) => !p.seriesName.endsWith("_ci") && !p.seriesName.endsWith("_trend"));
      const eraIdx = points.findIndex(d => d.era === params[0].axisValue);
      const pt = eraIdx >= 0 ? points[eraIdx] : null;
      let html = `<strong style="font-size:14px;color:#3a2c21">📜 ${params[0].axisValue}</strong>`;
      if (pt) { html += `<span style="font-size:11px;color:#8a939b">  n=${pt.n} 人次</span>`; }
      html += `<hr style="border:0;border-top:1px solid rgba(94,107,118,0.2);margin:8px 0">`;
      main.forEach((p: any) => {
        const cat = p.seriesName;
        const val = p.value;
        const t = trends[cat];
        const ciLow = pt ? (pt as any)[`${cat}_ciLow`] : null;
        const ciHigh = pt ? (pt as any)[`${cat}_ciHigh`] : null;
        const hasTrend = catsWithTrend.includes(cat);
        html += `<div style="line-height:1.7">${p.marker} <strong>${cat}行: ${val}%</strong>`;
        if (ciLow != null && ciHigh != null) {
          html += `  <span style="color:#8a939b">[95%CI: ${ciLow}–${ciHigh}]</span>`;
        }
        if (hasTrend) {
          const dir = t.slope > 0 ? "↗" : "↘";
          html += `<br><span style="color:#8a939b;font-size:12px;padding-left:20px">趋势 ${dir} ${Math.abs(t.slope).toFixed(1)}pp/期 (R²=${t.r2.toFixed(2)})</span>`;
        }
        html += `</div>`;
      });
      return html;
    },
  };

  return {
    animation: true,
    animationDuration: 1600,
    animationEasing: "cubicInOut" as const,
    animationDelay: (idx: number) => idx * 250,
    tooltip,
    legend: {
      data: [...cats],
      bottom: 0,
      textStyle: { fontSize: 13, color: "#7a5e4e", fontFamily: "Noto Sans SC, sans-serif" as const },
      itemWidth: 18, itemHeight: 4, itemGap: 24,
    },
    grid: { left: 56, right: 48, top: 40, bottom: 60 },
    xAxis: {
      type: "category" as const, data: eras, boundaryGap: false,
      axisLine: { lineStyle: { color: "rgba(94,107,118,0.12)" } },
      axisTick: { show: false },
      axisLabel: {
        interval: 0,
        formatter: (value: string) => `{name|${value}}\n{year|${ERA_YEAR_RANGE[value] || ''}}`,
        rich: {
          name: { fontSize: 13, color: "#7a5e4e", fontFamily: "Noto Sans SC, sans-serif" as const },
          year: { fontSize: 10, color: "#8a939b", fontFamily: "Noto Sans SC, sans-serif" as const },
        },
      },
    },
    yAxis: {
      type: "value" as const, name: "占比 (%)",
      nameTextStyle: { fontSize: 12, color: "#8a939b", fontFamily: "Noto Sans SC, sans-serif" as const },
      axisLabel: { fontSize: 12, color: "#8a939b", fontFamily: "Noto Sans SC, sans-serif" as const },
      splitLine: { lineStyle: { color: "rgba(94,107,118,0.12)", type: "dashed" as const } },
    },
    series,
  };
}

/* ================================================================
   Sub-components — 角色特征数据
   ================================================================ */


// 特征标签词汇表 — 从 role-treering.json 领域知识标签提取
const ALL_FEATURE_TRAITS: string[] = sankeyJson.features.map((f: any) => f.name);

const TOTAL_FLOW = SANKEY_LINKS.reduce((sum: number, l: any) => sum + (l.value || 0), 0);

/* ================================================================
   Inline Explanation Components — 从弹窗提取的内联解释面板
   ================================================================ */

/** 选中数据点详情面板 — 右侧栏顶部分阶段/行当状态解读
 *  主要展示：一句话成因概括（突出）+ 指标小字罗列（辅助） */
const SelectedEvoPointPanel: React.FC<{
  point: { era: string; cat: string } | null;
  onClear: () => void;
}> = ({ point, onClear }) => {
  const { points, trends, growthMatrix, trendAnalysis: taAll } = EVOLUTION_ENRICHED;

  // Build era context map from source-evolution.json
  const eraContextMap = useMemo(() => {
    const meta = (sourceEvolutionJson as any).sourceMeta ?? {};
    const map: Record<string, string> = {};
    Object.keys(meta).forEach((key: string) => {
      map[key] = meta[key]?.eraContext ?? "";
    });
    return map;
  }, []);

  // Pre-compute all summaries once
  const allSummaries = useMemo(
    () => buildEvolutionSummary(points, EVO_CATEGORIES, growthMatrix, taAll, eraContextMap),
    [],
  );

  // Unselected state — prompt
  if (!point) {
    return (
      <div className="t1-side-block-content">
        <span className="t1-side-block-content-icon">👆</span>
        点击折线图数据点<br />查看行当详情评述
      </div>
    );
  }

  const { era, cat } = point;
  const pt = points.find(d => d.era === era);
  const val: number | null = pt ? (pt as any)[cat] : null;
  const ciLow: number | null = pt ? (pt as any)[`${cat}_ciLow`] : null;
  const ciHigh: number | null = pt ? (pt as any)[`${cat}_ciHigh`] : null;
  const t = trends[cat];
  const mk = taAll[cat]?.mannKendall;
  const summary = allSummaries.find(s => s.era === era && s.cat === cat);
  const color = EVO_4CAT_COLORS[cat] || "#8a939b";

  // 较前一期变化
  const curEraIdx = points.findIndex(d => d.era === era);
  const prevIdx = curEraIdx > 0 ? curEraIdx - 1 : -1;
  let prevChangeLabel = "";
  if (prevIdx >= 0) {
    const curVal = (pt as any)?.[cat] as number;
    const prevVal = (points[prevIdx] as any)?.[cat] as number;
    if (curVal != null && prevVal != null) {
      const diff = curVal - prevVal;
      prevChangeLabel = diff > 0.05
        ? `↑${diff.toFixed(1)}pp`
        : diff < -0.05
          ? `↓${Math.abs(diff).toFixed(1)}pp`
          : "≈";
    }
  }

  // 四行当排位
  const ranked = EVO_CATEGORIES
    .map(c => ({ cat: c, val: (pt as any)?.[c] as number ?? 0 }))
    .sort((a, b) => b.val - a.val);
  const rank = ranked.findIndex(r => r.cat === cat) + 1;
  const rankLabel = ["首位", "次位", "第三位", "末位"][rank - 1];

  return (
    <div className="t1-evo-detail-panel">
      {/* ── Header ── */}
      <div className="t1-evo-detail-header">
        <span className="t1-evo-detail-dot" style={{ backgroundColor: color }} />
        <div className="t1-evo-detail-title">
          <div className="t1-evo-detail-era">{era}</div>
          <div className="t1-evo-detail-cat" style={{ color }}>{cat}行</div>
        </div>
        <button className="t1-evo-detail-close" onClick={onClear} aria-label="清除选择" title="取消选择">✕</button>
      </div>

      {/* ── 主要内容：一句话概括 ── */}
      {summary && (
        <div className="t1-evo-summary" style={{ borderLeftColor: color }}>
          <p className="t1-evo-summary-text">{summary.summary}</p>
        </div>
      )}

      {/* ── 指标小字罗列 ── */}
      <div className="t1-evo-metrics">
        <span className="t1-evo-metric-item">
          占比 <strong>{val != null ? `${val}%` : "—"}</strong>
        </span>
        {ciLow != null && ciHigh != null && (
          <span className="t1-evo-metric-item">95%CI [{ciLow}–{ciHigh}]</span>
        )}
        {pt && (
          <span className="t1-evo-metric-item">n={pt.n}</span>
        )}
        {prevChangeLabel && (
          <span className="t1-evo-metric-item">较前一期 {prevChangeLabel}</span>
        )}
        {t && Math.abs(t.slope) > 0.3 && (
          <span className="t1-evo-metric-item">
            OLS {t.slope > 0 ? "↗" : "↘"}{Math.abs(t.slope).toFixed(1)}pp/期 R²={t.r2.toFixed(2)}
          </span>
        )}
        {mk && (
          <span className="t1-evo-metric-item">
            M‑K {mk.trend} p={mk.p} τ={mk.tau}
          </span>
        )}
        <span className="t1-evo-metric-item">四行{rankLabel}</span>
      </div>
    </div>
  );
};

/** 演化洞察内联卡片 — 仿表演模式分析「关键发现」+「维度判别能力分析」卡片构图
 *  将 7 条洞察重组为：整体性发现卡片 + 四大行当 2×2 判别卡片
 *  [整体洞察 0-1, 6] → 发现型卡片 (仿 KeyFindingsCards)
 *  [行当洞察 2-5: 生·旦·净·丑] → 判别型卡片 (仿 DimDiscriminantCard 2x2 网格) */
const EvolutionNarrativeInsights: React.FC = () => {
  const { insights, trendAnalysis } = EVOLUTION_ENRICHED;

  if (!insights || insights.length === 0) return null;

  // 将 insight 文本中的 M-K/OLS/CAGR 提取为结构化展示
  const parseStats = (text: string) => {
    const mkMatch = text.match(/M-K[^:]*[:：]\s*([≈↑↓]+)\s*\(p[=＝]([^,)]+)[^)]*\)/);
    const olsMatch = text.match(/OLS[^:]*[:：]\s*([+-]?[\d.]+)pp\/期[,，]\s*R²[=＝]([\d.]+)/);
    const cagrMatch = text.match(/CAGR[=＝]([+-]?[\d.]+)%\/年/);
    return {
      mkTrend: mkMatch ? mkMatch[1].trim() : null,
      mkP: mkMatch ? mkMatch[2].trim() : null,
      olsSlope: olsMatch ? olsMatch[1].trim() : null,
      olsR2: olsMatch ? olsMatch[2].trim() : null,
      cagr: cagrMatch ? cagrMatch[1].trim() : null,
    };
  };

  // 洞察分组：前2条 + 最后1条为整体性发现，中间4条为四大行当
  const overallIndices = [0, 1, 6];
  const catIndices = [2, 3, 4, 5]; // 生·旦·净·丑
  const catNames = ["生", "旦", "净", "丑"] as const;

  const overallIcons = ["📊", "🔗", "✅"];
  const overallColors = ["#b8926a", "#7f968d", "#5e6b76"];

  return (
    <div className="t1-evo-insights-restructured">
      {/* ── 整体性发现卡片 (仿 KeyFindingsCards 构图) ── */}
      <div className="t1-evo-findings-stack">
        {overallIndices.map((idx, i) => {
          const ins = insights[idx];
          if (!ins) return null;
          const stats = parseStats(ins.statisticalExplanation || "");
          return (
            <div key={idx} className="t1-pf-finding-card" style={{ borderLeftColor: overallColors[i] }}>
              <div className="t1-pf-finding-header">
                <span className="t1-pf-finding-icon">{overallIcons[i]}</span>
                <span className="t1-pf-finding-title">{ins.finding}</span>
              </div>
              <p className="t1-pf-finding-body">{ins.evidence}</p>
              {/* 统计指标行 */}
              {(stats.mkTrend || stats.olsSlope || stats.cagr) && (
                <div className="t1-pf-dim-stats-row t1-evo-insight-stats">
                  {stats.mkTrend && (
                    <div className="t1-pf-dim-stat">
                      <span className="t1-pf-dim-stat-val" style={{ color: overallColors[i] }}>
                        {stats.mkTrend}
                      </span>
                      <span className="t1-pf-dim-stat-lbl">M-K 趋势 (p={stats.mkP || "—"})</span>
                    </div>
                  )}
                  {stats.olsSlope && (
                    <div className="t1-pf-dim-stat">
                      <span className="t1-pf-dim-stat-val" style={{ color: overallColors[i] }}>
                        {stats.olsSlope}pp
                      </span>
                      <span className="t1-pf-dim-stat-lbl">OLS (R²={stats.olsR2 || "—"})</span>
                    </div>
                  )}
                  {stats.cagr && (
                    <div className="t1-pf-dim-stat">
                      <span className="t1-pf-dim-stat-val" style={{ color: overallColors[i] }}>
                        {stats.cagr}%
                      </span>
                      <span className="t1-pf-dim-stat-lbl">CAGR/年</span>
                    </div>
                  )}
                </div>
              )}
              {ins.culturalInterpretation && (
                <div className="t1-evo-cultural-footnote">
                  <span className="t1-evo-cultural-icon">📖</span>
                  <span>{ins.culturalInterpretation}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── 四大行当判别卡片 (仿 DimDiscriminantCard 2×2 网格构图) ── */}
      <div className="t1-pf-dim-cards-grid t1-evo-cat-grid">
        {catIndices.map((idx, i) => {
          const ins = insights[idx];
          if (!ins) return null;
          const cat = catNames[i];
          const catColor = EVO_4CAT_COLORS[cat];
          const ta = trendAnalysis[cat];
          const mk = (ta as any)?.mannKendall;
          const lr = (ta as any)?.linearRegression;
          const stats = parseStats(ins.statisticalExplanation || "");

          // 从 evidence 提取首末占比差
          const diffMatch = ins.evidence?.match(/首末差([+-]?[\d.]+)pp/);
          const diffStr = diffMatch ? diffMatch[1] : null;

          // 计算相对贡献 (基于 OLS 斜率绝对值归一化)
          const allSlopes = catIndices.map(j => {
            const taJ = trendAnalysis[catNames[j]] as any;
            return Math.abs(taJ?.linearRegression?.slope ?? 0);
          });
          const maxSlope = Math.max(...allSlopes, 1);
          const slopeAbs = Math.abs(lr?.slope ?? 0);
          const contribPct = Math.round((slopeAbs / maxSlope) * 100);

          return (
            <div key={idx} className="t1-pf-dim-card" style={{ "--card-accent": catColor, borderLeftColor: catColor } as React.CSSProperties}>
              {/* Header: 行当名 + 趋势徽标 */}
              <div className="t1-pf-dim-card-header">
                <span className="t1-pf-dim-rank" style={{ background: catColor }}>
                  {cat}行
                </span>
                <span className="t1-pf-dim-name">
                  <span className="t1-pf-dim-dot" style={{ background: catColor }} />
                  {ins.finding?.replace(/^[^:：]+[:：]\s*/, "") || cat + "行趋势"}
                </span>
                <span className={`t1-evo-trend-badge ${mk?.trend === "↑" ? "up" : mk?.trend === "↓" ? "down" : "stable"}`}>
                  {mk?.trend || "≈"}
                </span>
              </div>

              {/* 证据文本 */}
              <p className="t1-pf-dim-desc">{ins.evidence}</p>

              {/* 统计指标行 */}
              <div className="t1-pf-dim-stats-row">
                <div className="t1-pf-dim-stat">
                  <span className="t1-pf-dim-stat-val" style={{ color: catColor }}>
                    {stats.olsSlope || (lr?.slope != null ? (lr.slope > 0 ? "+" : "") + lr.slope.toFixed(2) : "—")}pp
                  </span>
                  <span className="t1-pf-dim-stat-lbl">OLS 斜率</span>
                </div>
                <div className="t1-pf-dim-stat">
                  <span className="t1-pf-dim-stat-val" style={{ color: catColor }}>
                    {diffStr || "—"}pp
                  </span>
                  <span className="t1-pf-dim-stat-lbl">首末变化</span>
                </div>
                <div className="t1-pf-dim-stat">
                  <span className="t1-pf-dim-stat-val" style={{ color: catColor }}>
                    R²={stats.olsR2 || (lr?.r2 != null ? lr.r2.toFixed(2) : "—")}
                  </span>
                  <span className="t1-pf-dim-stat-lbl">拟合优度</span>
                </div>
                <div className="t1-pf-dim-stat">
                  <span className="t1-pf-dim-stat-val" style={{ color: catColor }}>
                    {stats.mkTrend || mk?.trend || "≈"}
                  </span>
                  <span className="t1-pf-dim-stat-lbl">M-K 检验</span>
                </div>
              </div>

              {/* 贡献率条形图 */}
              <div className="t1-pf-contrib-bar">
                <span className="t1-pf-contrib-label">变化幅度</span>
                <div className="t1-pf-contrib-track">
                  <div className="t1-pf-contrib-fill" style={{ width: `${contribPct}%`, background: catColor }} />
                </div>
                <span className="t1-pf-contrib-pct">{contribPct}%</span>
              </div>

              {/* 文化解释脚注 */}
              {ins.culturalInterpretation && (
                <div className="t1-evo-cultural-footnote">
                  <span className="t1-evo-cultural-icon">📖</span>
                  <span>{ins.culturalInterpretation}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}
function stddev(arr: number[]): number {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

/* ================================================================
   Existing Sub-components
   ================================================================ */

/** 紧凑版 Sankey 图 — 用于右侧悬浮面板 (含卡方检验摘要) */
const SankeyPanel: React.FC = () => {
  const sankeyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sankeyRef.current) return;
    const chart = echarts.init(sankeyRef.current);
    // 特征节点 — 统一用云水青·极浅 (#cfbfa0) 保持侧边整体性，与右侧行当彩色节点形成和弦式对比
    const featureNodes = ALL_FEATURE_TRAITS.map(n => ({ name: n, itemStyle: { color: "#cfbfa0" } }));
    // 行当节点 — 按生/旦/净/丑四大类赋予各自色系，遵循主题和弦每类别一色的配色原则
    const EVO_LINE_COLORS_MAP: Record<string, string> = {
      "老生": "#b8926a", "小生": "#c9a87d", "武生": "#a6845e", "末·外·生": "#d4bca0",
      "青衣·正旦": "#96544d", "花旦·花衫": "#b8807a", "老旦": "#a86b66", "武旦": "#8b4a44",
      "净": "#5e6b76",
      "文丑": "#7f968d", "武丑": "#6b8279",
    };
    const roleNodes = ["老生", "小生", "武生", "末·外·生", "青衣·正旦", "花旦·花衫", "老旦", "武旦", "净", "文丑", "武丑"]
      .map(n => ({ name: n, itemStyle: { color: EVO_LINE_COLORS_MAP[n] || "#96544d" } }));
    chart.setOption({
      tooltip: {
        trigger: "item",
        triggerOn: "mousemove",
        backgroundColor: "rgba(255,253,249,0.96)",
        borderColor: "rgba(184,149,111,0.5)",
        borderWidth: 1,
        padding: [10, 14],
        textStyle: {
          fontSize: 12,
          color: "#3a2c21",
          fontFamily: "Noto Sans SC, sans-serif",
        },
        formatter: (params: any) => {
          if (params.dataType === "edge") {
            const flowPct = (params.data.value / TOTAL_FLOW * 100).toFixed(2);
            const zLabel = params.data.value > TOTAL_FLOW * 0.03 ? "🔥 强关联" : params.data.value > TOTAL_FLOW * 0.01 ? "• 中等关联" : "• 弱关联";
            return `<strong>${params.data.source}</strong>  →  <strong>${params.data.target}</strong><br/>
              <span style="color:#7f968d;">关联强度: </span><strong style="color:#96544d;">${params.data.value}</strong><br/>
              <span style="color:#8a939b;">占总流量: </span>${flowPct}% &nbsp; ${zLabel}`;
          }
          return `<strong>${params.name}</strong>`;
        },
      },
      series: [{
        type: "sankey",
        emphasis: {
          focus: "adjacency",
          lineStyle: { opacity: 0.7 },
        },
        nodeAlign: "left",
        layoutIterations: 0,
        nodeGap: 4,
        data: [...featureNodes, ...roleNodes],
        links: SANKEY_LINKS.map(l => ({
          source: l.source,
          target: l.target,
          value: l.value,
        })),
        label: {
          fontSize: 10,
          color: "#3a2c21",
          fontFamily: "Noto Sans SC, sans-serif",
        },
        lineStyle: { color: "gradient", curveness: 0.5, opacity: 0.2 },
      }],
    });
    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(sankeyRef.current);
    return () => {
      window.removeEventListener("resize", handleResize);
      observer.disconnect();
      chart.dispose();
    };
  }, []);

  return (
    <div className="t1-sankey-compact">
      <div ref={sankeyRef} className="t1-sankey-chart" />
      <p className="t1-sankey-note">
        左侧 29 个特征维度 → 右侧 11 个行当分类 · 连线宽度 ∝ 关联强度 · 鼠标悬停连线查看详情与占比
      </p>
    </div>
  );
};

// 演化图配色 — 按行当大类归属映射，与 ROLE_TREE 色系一致
const EVO_LINE_COLORS: Record<string, string> = {
  // 生行 — 琉璃金系 (theme-gold #b8926a)
  "老生": "#b8926a",
  "小生": "#c9a87d",
  "武生": "#a6845e",
  // 旦行 — 朱砂红系 (theme-red #96544d)
  "青衣·正旦": "#96544d",
  "花旦·花衫": "#b8807a",
  "老旦": "#a86b66",
  "武旦": "#8b4a44",
  // 净行 — 石板灰系 (theme-slate #5e6b76)
  "净": "#5e6b76",
  // 丑行 — 云水青系 (theme-celadon #7f968d)
  "文丑": "#7f968d",
  "武丑": "#6b8279",
};

const EvolutionPanel: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const eras = EVOLUTION_DATA.map(d => d.era);
    const types = ["老生", "小生", "武生", "青衣·正旦", "花旦·花衫", "老旦", "武旦", "净", "文丑", "武丑"];
    chart.setOption({
      color: types.map(t => EVO_LINE_COLORS[t]),
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(255,255,255,0.94)",
        borderColor: "rgba(94,107,118,0.2)",
        textStyle: { fontSize: 12, color: "#7a5e4e", fontFamily: "Noto Sans SC, sans-serif" },
        axisPointer: { type: "cross", crossStyle: { color: "#8a939b" } },
      },
      legend: {
        type: "scroll", bottom: 0,
        textStyle: { fontSize: 11, color: "#7a5e4e", fontFamily: "Noto Sans SC, sans-serif" },
        itemWidth: 14, itemHeight: 3, itemGap: 12,
        pageIconSize: 10, pageTextStyle: { color: "#8a939b" },
      },
      grid: { left: 48, right: 24, top: 24, bottom: 58 },
      xAxis: {
        type: "category", data: eras, boundaryGap: false,
        axisLine: { lineStyle: { color: "rgba(94,107,118,0.12)" } },
        axisTick: { show: false },
        axisLabel: {
          interval: 0,
          rotate: 30,
          formatter: (value: string) => `{name|${value}}\n{year|${ERA_YEAR_RANGE[value] || ''}}`,
          rich: {
            name: { fontSize: 11, color: "#7a5e4e", fontFamily: "Noto Sans SC, sans-serif" },
            year: { fontSize: 8, color: "#8a939b", fontFamily: "Noto Sans SC, sans-serif" },
          },
        },
      },
      yAxis: {
        type: "value", name: "出现频次",
        nameTextStyle: { fontSize: 11, color: "#8a939b", fontFamily: "Noto Sans SC, sans-serif" },
        axisLabel: { fontSize: 11, color: "#8a939b", fontFamily: "Noto Sans SC, sans-serif" },
        splitLine: { lineStyle: { color: "rgba(94,107,118,0.12)", type: "dashed" } },
      },
      series: types.map(t => ({
        name: t, type: "line",
        data: EVOLUTION_DATA.map(d => (d as any)[t]),
        symbol: "circle", symbolSize: 4,
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.06 },
        emphasis: { focus: "series", symbolSize: 7 },
      })),
    });
    return () => chart.dispose();
  }, []);
  return (
    <div>
      <div ref={ref} style={{ width: "100%", height: "340px" }} />
      <div className="t1-evolution-insights">
        <h3>关键发现</h3>
        <ul>
          <li><strong>老生持续领先</strong>: 民国汇编（562人次）与新中国整理（643人次）中老生居各行当子类之首，是唯一在所有编纂时期保持高位的子类</li>
          <li><strong>净行与文丑突出</strong>: 民国汇编中净行832人次、文丑580人次，反映早期汇编本偏好忠奸分明的角色类型</li>
          <li><strong>来源差异显著</strong>: 昆曲传承中末·外·生（68人次）超过老生（32人次），体现昆曲角色体系的特殊性；各子类频次受剧本基数影响巨大（民国汇编678部 vs 现代创作14部）</li>
          <li><strong>小样本警示</strong>: 现代创作（14部/130人次）、录音藏本（51部/316人次）统计波动较大，趋势解读需结合样本量</li>
        </ul>
      </div>
    </div>
  );
};

/** 演化趋势全尺寸图 — 用于行当演化趋势标签页中心区域 */
const EvolutionFullChart: React.FC<{ onClick?: () => void }> = ({ onClick }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption(buildEvolutionChartOption(), true);

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      window.removeEventListener("resize", handleResize);
      observer.disconnect();
      chart.dispose();
    };
  }, []);

  return (
    <div
      ref={ref}
      className="t1-evo-full-chart"
      onClick={onClick}
      title="点击查看大图"
    />
  );
};

/** 演化趋势侧边栏 — 从右侧滑出的大图 + 3 张洞察卡片 */
const EvolutionModal: React.FC<{ opened: boolean; onClose: () => void; onPointSelect?: (point: { era: string; cat: string }) => void }> = ({ opened, onClose, onPointSelect }) => {
  const mainRef = useRef<HTMLDivElement>(null);
  const heatmapRef = useRef<HTMLDivElement>(null);
  const entropyRef = useRef<HTMLDivElement>(null);
  const jsdRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!opened) return;

    // Main chart
    if (mainRef.current) {
      const chart = echarts.init(mainRef.current);
      const { points, trends, trendAnalysis } = EVOLUTION_ENRICHED;
      const mannKendall: Record<string, { trend: string; p: number; tau: number }> = {};
      Object.entries(trendAnalysis).forEach(([cat, ta]: [string, any]) => {
        if (ta?.mannKendall) mannKendall[cat] = ta.mannKendall;
      });
      chart.setOption(buildModalMainOption(points, EVO_CATEGORIES, EVO_4CAT_COLORS, trends, ERA_YEAR_RANGE, mannKendall), true);

      // Click handler for data point selection
      const handleChartClick = (params: any) => {
        if (
          params.seriesName &&
          !params.seriesName.endsWith("_ci") &&
          !params.seriesName.endsWith("_trend")
        ) {
          onPointSelect?.({ era: params.name, cat: params.seriesName });
        }
      };
      chart.on("click", handleChartClick);

      const resizeMain = () => chart.resize();
      window.addEventListener("resize", resizeMain);
      (chart as any)._resizeMain = resizeMain;
      (chart as any)._clickHandler = handleChartClick;
    }

    // Heatmap
    if (heatmapRef.current) {
      const chart = echarts.init(heatmapRef.current);
      chart.setOption(buildHeatmapOption(EVOLUTION_ENRICHED.growthMatrix, EVOLUTION_ENRICHED.points.map(d => d.era), EVO_CATEGORIES), true);
      const resize = () => chart.resize();
      window.addEventListener("resize", resize);
      (chart as any)._resizeHeatmap = resize;
    }

    // Entropy
    if (entropyRef.current) {
      const chart = echarts.init(entropyRef.current);
      chart.setOption(buildEntropyChartOption(EVOLUTION_ENRICHED.entropyData, EVOLUTION_ENRICHED.points.map(d => d.era)), true);
      const resize = () => chart.resize();
      window.addEventListener("resize", resize);
      (chart as any)._resizeEntropy = resize;
    }

    // JSD
    if (jsdRef.current) {
      const chart = echarts.init(jsdRef.current);
      chart.setOption(buildJSDMatrixOption(EVOLUTION_ENRICHED.jsdMatrix, EVOLUTION_ENRICHED.points.map(d => d.era)), true);
      const resize = () => chart.resize();
      window.addEventListener("resize", resize);
      (chart as any)._resizeJsd = resize;
    }

    return () => {
      window.removeEventListener("resize", (window as any)._resizeMain);
      window.removeEventListener("resize", (window as any)._resizeHeatmap);
      window.removeEventListener("resize", (window as any)._resizeEntropy);
      window.removeEventListener("resize", (window as any)._resizeJsd);
      // Clean up main chart click handler
      if (mainRef.current) {
        // Find the chart instance and remove click handler
        const chart = echarts.getInstanceByDom(mainRef.current);
        if (chart) {
          chart.off("click");
        }
      }
    };
  }, [opened]);

  return (
    <>
      <div className={`t1-evo-sidebar-backdrop ${opened ? "visible" : ""}`} onClick={onClose} />
      <aside className={`t1-evo-sidebar ${opened ? "open" : ""}`} role="dialog" aria-modal="true" aria-label="行当演化趋势详情">
        <div className="t1-evo-sidebar-header">
          <span className="t1-evo-sidebar-header-icon">📜</span>
          <h2>行当演化趋势 · 全尺寸视图</h2>
          <button className="t1-evo-sidebar-close" onClick={onClose} aria-label="关闭">✕</button>
        </div>
        <div className="t1-evo-sidebar-body">
          <div ref={mainRef} className="t1-evo-sidebar-chart" />
          <div className="t1-evo-sidebar-aux-grid">
            <div ref={heatmapRef} className="t1-evo-sidebar-aux" />
            <div ref={entropyRef} className="t1-evo-sidebar-aux" />
            <div ref={jsdRef} className="t1-evo-sidebar-aux" />
          </div>
        </div>
      </aside>
    </>
  );
};

/** 演化详情弹窗 — 将 4 个辅助图表整合为一个弹出侧边栏 */
const EvolutionDetailModal: React.FC<{ opened: boolean; onClose: () => void }> = ({ opened, onClose }) => {
  const heatmapRef = useRef<HTMLDivElement>(null);
  const entropyRef = useRef<HTMLDivElement>(null);
  const jsdRef = useRef<HTMLDivElement>(null);
  const eras = EVOLUTION_ENRICHED.points.map(d => d.era);

  useEffect(() => {
    if (!opened) return;

    // Heatmap
    if (heatmapRef.current) {
      const chart = echarts.init(heatmapRef.current);
      chart.setOption(buildHeatmapOption(EVOLUTION_ENRICHED.growthMatrix, eras, EVO_CATEGORIES), true);
      const resize = () => chart.resize();
      window.addEventListener("resize", resize);
      (chart as any)._resizeDetailHeatmap = resize;
    }

    // Entropy
    if (entropyRef.current) {
      const chart = echarts.init(entropyRef.current);
      chart.setOption(buildEntropyChartOption(EVOLUTION_ENRICHED.entropyData, eras), true);
      const resize = () => chart.resize();
      window.addEventListener("resize", resize);
      (chart as any)._resizeDetailEntropy = resize;
    }

    // JSD
    if (jsdRef.current) {
      const chart = echarts.init(jsdRef.current);
      chart.setOption(buildJSDMatrixOption(
        EVOLUTION_ENRICHED.jsdMatrix, eras,
        EVOLUTION_ENRICHED.mostSimilar ?? undefined,
        EVOLUTION_ENRICHED.mostDifferent ?? undefined,
      ), true);
      const resize = () => chart.resize();
      window.addEventListener("resize", resize);
      (chart as any)._resizeDetailJsd = resize;
    }

    return () => {
      window.removeEventListener("resize", (window as any)._resizeDetailHeatmap);
      window.removeEventListener("resize", (window as any)._resizeDetailEntropy);
      window.removeEventListener("resize", (window as any)._resizeDetailJsd);
    };
  }, [opened]);

  const hMax = Math.log(4);

  return (
    <>
      <div className={`t1-evo-detail-backdrop ${opened ? "visible" : ""}`} onClick={onClose} />
      <aside className={`t1-evo-detail-sidebar ${opened ? "open" : ""}`} role="dialog" aria-modal="true" aria-label="行当演化辅助图表详情">
        <div className="t1-evo-detail-header">
          <span className="t1-evo-detail-header-icon">📊</span>
          <h2>行当演化辅助分析</h2>
          <button className="t1-evo-detail-close" onClick={onClose}>✕</button>
        </div>
        <div className="t1-evo-detail-body">
          {/* 图表 2×2 网格 */}
          <div className="t1-evo-detail-chart-grid">
            <div className="t1-evo-detail-chart">
              <div className="t1-evo-detail-chart-header">🔥 相对增长率 — 基线: 民国汇编</div>
              <div ref={heatmapRef} className="t1-evo-detail-chart-body" />
            </div>
            <div className="t1-evo-detail-chart">
              <div className="t1-evo-detail-chart-header">🌐 Shannon熵 — 行当多样性</div>
              <div ref={entropyRef} className="t1-evo-detail-chart-body" />
            </div>
            <div className="t1-evo-detail-chart">
              <div className="t1-evo-detail-chart-header">🔗 JSD矩阵 — 时期结构差异</div>
              <div ref={jsdRef} className="t1-evo-detail-chart-body" />
            </div>
            <div className="t1-evo-detail-chart">
              <div className="t1-evo-detail-chart-header">📊 统计显著性摘要</div>
              <div className="t1-evo-detail-chart-body t1-evo-detail-chart-body--stats">
                <div className="t1-evo-detail-summary-row">
                  <span className="t1-evo-detail-summary-label">卡方检验</span>
                  <span className="t1-evo-detail-summary-value">χ²({EVOLUTION_ENRICHED.chiSquare?.df}) = {EVOLUTION_ENRICHED.chiSquare?.chiSq}, p{EVOLUTION_ENRICHED.chiSquare?.p}</span>
                </div>
                <div className="t1-evo-detail-summary-row">
                  <span className="t1-evo-detail-summary-label">Cramér's V</span>
                  <span className="t1-evo-detail-summary-value">{EVOLUTION_ENRICHED.chiSquare?.cramerV}（{EVOLUTION_ENRICHED.chiSquare?.interpretation}）</span>
                </div>
                <div className="t1-evo-detail-summary-row">
                  <span className="t1-evo-detail-summary-label">Shannon熵趋势</span>
                  <span className="t1-evo-detail-summary-value">{EVOLUTION_ENRICHED.overallTrend === 'diversifying' ? '↗ 均衡化（多元化）' : '↘ 集中化'}</span>
                </div>
                {EVOLUTION_ENRICHED.mostSimilar && (
                  <div className="t1-evo-detail-summary-row">
                    <span className="t1-evo-detail-summary-label">最相似时期</span>
                    <span className="t1-evo-detail-summary-value">{EVOLUTION_ENRICHED.mostSimilar.periodA} ↔ {EVOLUTION_ENRICHED.mostSimilar.periodB}（JSD={EVOLUTION_ENRICHED.mostSimilar.distance.toFixed(4)}）</span>
                  </div>
                )}
                {EVOLUTION_ENRICHED.mostDifferent && (
                  <div className="t1-evo-detail-summary-row">
                    <span className="t1-evo-detail-summary-label">最差异时期</span>
                    <span className="t1-evo-detail-summary-value">{EVOLUTION_ENRICHED.mostDifferent.periodA} ↔ {EVOLUTION_ENRICHED.mostDifferent.periodB}（JSD={EVOLUTION_ENRICHED.mostDifferent.distance.toFixed(4)}）</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 底部综合说明 */}
          <div className="t1-evo-detail-summary">
            <div className="t1-evo-detail-summary-header">📌 方法说明</div>
            <div className="t1-evo-detail-summary-grid">
              <div className="t1-evo-detail-summary-row">
                <span className="t1-evo-detail-summary-label">相对增长率</span>
                <span className="t1-evo-detail-summary-value">以民国汇编为基线（0%），各时期各行当占比相对于基线的变化幅度</span>
              </div>
              <div className="t1-evo-detail-summary-row">
                <span className="t1-evo-detail-summary-label">Shannon熵</span>
                <span className="t1-evo-detail-summary-value">H={EVOLUTION_ENRICHED.entropyData[EVOLUTION_ENRICHED.entropyData.length - 1]?.entropy.toFixed(3)}（H_max=ln(4)≈{hMax.toFixed(3)}），衡量行当分布均衡度</span>
              </div>
              <div className="t1-evo-detail-summary-row">
                <span className="t1-evo-detail-summary-label">JSD矩阵</span>
                <span className="t1-evo-detail-summary-value">Jensen-Shannon Distance（0=完全相同，1=完全相异），衡量两时期行当分布的整体差异</span>
              </div>
              <div className="t1-evo-detail-summary-row">
                <span className="t1-evo-detail-summary-label">卡方检验</span>
                <span className="t1-evo-detail-summary-value">检验不同编纂时期的行当分布是否显著不同，p&lt;0.05 表示分布差异具有统计显著性</span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

/* ================================================================
   New Evolution Tab Components — enhanced charts + insight cards
   ================================================================ */

/** 增强版演化趋势全尺寸图 — 使用新配色 + 峰值标记 + M-K趋势箭头 */
const EnhancedEvolutionChart: React.FC<{ onClick?: () => void; onPointSelect?: (point: { era: string; cat: string }) => void }> = ({ onClick, onPointSelect }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const { points, trends, trendAnalysis } = EVOLUTION_ENRICHED;
    const mannKendall: Record<string, { trend: string; p: number; tau: number }> = {};
    Object.entries(trendAnalysis).forEach(([cat, ta]: [string, any]) => {
      if (ta?.mannKendall) {
        mannKendall[cat] = ta.mannKendall;
      }
    });
    const option = buildMainEvolutionOption(
      points, EVO_CATEGORIES, EVO_4CAT_COLORS, trends,
      ERA_YEAR_RANGE, mannKendall,
    );
    chart.setOption(option, true);

    // Click handler for data point selection
    const handleChartClick = (params: any) => {
      if (
        params.seriesName &&
        !params.seriesName.endsWith("_ci") &&
        !params.seriesName.endsWith("_trend")
      ) {
        onPointSelect?.({ era: params.name, cat: params.seriesName });
      }
    };
    chart.on("click", handleChartClick);

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      window.removeEventListener("resize", handleResize);
      observer.disconnect();
      chart.off("click", handleChartClick);
      chart.dispose();
    };
  }, []);

  return (
    <div
      ref={ref}
      className="t1-evo-full-chart"
      onClick={(e) => { if (onClick && e.target === ref.current) onClick(); }}
      title="点击查看大图"
    />
  );
};

/** 行当增长率热力图 — 时期×行当的相对增长率 */
const EvolutionHeatmap: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const eras = EVOLUTION_ENRICHED.points.map(d => d.era);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const option = buildHeatmapOption(
      EVOLUTION_ENRICHED.growthMatrix, eras, EVO_CATEGORIES,
    );
    chart.setOption(option, true);

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      window.removeEventListener("resize", handleResize);
      observer.disconnect();
      chart.dispose();
    };
  }, []);

  return (
    <div className="t1-evo-heatmap">
      <div className="t1-evo-aux-header">
        <span className="t1-evo-aux-icon">🔥</span>
        <span>相对增长率 — 基线: 民国汇编</span>
      </div>
      <div ref={ref} className="t1-evo-aux-chart-body" />
    </div>
  );
};

/** Shannon熵趋势图 — 行当结构多样性变化 */
const ShannonEntropyChart: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const eras = EVOLUTION_ENRICHED.points.map(d => d.era);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const option = buildEntropyChartOption(EVOLUTION_ENRICHED.entropyData, eras);
    chart.setOption(option, true);

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      window.removeEventListener("resize", handleResize);
      observer.disconnect();
      chart.dispose();
    };
  }, []);

  return (
    <div className="t1-evo-entropy-chart">
      <div className="t1-evo-aux-header">
        <span className="t1-evo-aux-icon">🌐</span>
        <span>Shannon熵 — 行当多样性</span>
      </div>
      <div ref={ref} className="t1-evo-aux-chart-body" />
    </div>
  );
};

/** JSD矩阵热力图 — 时期×时期的结构相似性 */
const JSDMatrixHeatmap: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const eras = EVOLUTION_ENRICHED.points.map(d => d.era);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const option = buildJSDMatrixOption(
      EVOLUTION_ENRICHED.jsdMatrix,
      eras,
      EVOLUTION_ENRICHED.mostSimilar ?? undefined,
      EVOLUTION_ENRICHED.mostDifferent ?? undefined,
    );
    chart.setOption(option, true);

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      window.removeEventListener("resize", handleResize);
      observer.disconnect();
      chart.dispose();
    };
  }, []);

  return (
    <div className="t1-evo-jsd-heatmap">
      <div className="t1-evo-aux-header">
        <span className="t1-evo-aux-icon">🔗</span>
        <span>JSD矩阵 — 时期结构差异</span>
      </div>
      <div ref={ref} className="t1-evo-aux-chart-body" />
    </div>
  );
};

/**
 * Inline 行当细分详解 panel — 11个子类按四大行当分组展示
 * Extracted from RoleTreeModal into the main roleSystem tab as a permanent left column.
 * 数据引用自右侧旭日图 SUNBURST_DATA，包含角色人次与类别占比。
 */
const RoleDetailPanel: React.FC = () => {
  const groupedRoles = ROLE_DETAILS.reduce((acc, role) => {
    if (!acc[role.category]) acc[role.category] = [];
    acc[role.category].push(role);
    return acc;
  }, {} as Record<string, RoleDetail[]>);

  const categoryOrder = ["生", "旦", "净", "丑"];

  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    "生": true, "旦": false, "净": false, "丑": false,
  });
  const toggleCategory = (cat: string) =>
    setOpenCategories(prev => ({ ...prev, [cat]: !prev[cat] }));

  return (
    <div className="t1-inline-role-details">
      {categoryOrder.map((category) => {
        const roles = groupedRoles[category];
        if (!roles) return null;
        const meta = CATEGORY_META[category];
        const catTotal = CATEGORY_TOTALS[category] ?? 0;
        const catPct = SUNBURST_GRAND_TOTAL > 0 ? ((catTotal / SUNBURST_GRAND_TOTAL) * 100).toFixed(1) : "0";
        const isOpen = openCategories[category];

        return (
          <div key={category} className={`t1-role-cat-group ${isOpen ? 'is-open' : 'is-closed'}`} style={{ borderLeftColor: meta.color }}>
            {/* ── 类别标题行: 色点 + 行当名 + 人次 + 占比 (clickable toggle) ── */}
            <div
              className="t1-role-cat-header"
              onClick={() => toggleCategory(category)}
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggleCategory(category); }}
            >
              <span className="t1-role-cat-dot" style={{ background: meta.color }} />
              <span className="t1-role-cat-name">{category}行</span>
              <span className="t1-role-cat-total">{catTotal.toLocaleString()} 人次</span>
              <span className="t1-role-cat-pct" style={{ color: meta.color }}>{catPct}%</span>
              <span className={`t1-role-cat-chevron ${isOpen ? 'is-open' : ''}`}>▼</span>
            </div>

            {/* ── 可折叠内容: 类别描述 + 子类卡片 ── */}
            <div className={`t1-role-cat-collapse ${isOpen ? 'is-open' : ''}`}>
              <span className="t1-role-cat-desc">{meta.desc}</span>

              {roles.map((role) => {
              const count = ROLE_COUNT_MAP[role.name] ?? 0;
              const pct = catTotal > 0 ? ((count / catTotal) * 100) : 0;
              return (
                <div key={role.name} className="t1-role-sub-card">
                  {/* 子类标题行: 名称 + 人次 + 占比 */}
                  <div className="t1-role-sub-head">
                    <span
                      className="t1-role-sub-dot"
                      style={{ background: role.color }}
                    />
                    <span className="t1-role-sub-name">{role.name}</span>
                    <span className="t1-role-sub-count">{count.toLocaleString()} 人</span>
                    <span className="t1-role-sub-pct">{pct.toFixed(1)}%</span>
                  </div>
                  {/* 迷你占比条 — 宽度相对于该大类内部 */}
                  <div className="t1-role-sub-bar-track">
                    <div
                      className="t1-role-sub-bar-fill"
                      style={{
                        width: `${Math.max(pct, 3)}%`,
                        background: role.color,
                      }}
                    />
                  </div>
                  <span className="t1-role-sub-desc">{role.desc}</span>
                  <div className="t1-role-sub-traits">
                    {role.traits.map((t) => (
                      <span key={t} className="t1-role-trait-tag">{t}</span>
                    ))}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** 行当体系结构 — D3 旭日图: 3D 俯视效果, 悬停外扩+高亮, 点击内环筛选外环, 入场顺时针展开 */
const RoleTreeChart: React.FC<{ onClick?: () => void; className?: string }> = ({ onClick, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clean previous D3 content (hot-reload safety)
    d3.select(container).selectAll("*").remove();

    // ── Data ──
    const DATA = SUNBURST_DATA;
    const GRAND_TOTAL = SUNBURST_GRAND_TOTAL;

    // ── Layout constants ──
    const CX = 345, CY = 330;
    const DX = 10, DY = 14;
    const CENTER_R = 48;
    const INNER_R1 = 58, INNER_R2 = 168;
    const GAP_R = 14;
    const OUTER_R1 = INNER_R2 + GAP_R;
    const OUTER_R2 = 314;
    const EXPAND_D = 8;

    // ── Geometry helpers ──
    function polar(r: number, angleRad: number) {
      const a = angleRad - Math.PI / 2;
      return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
    }
    function arcPath(ir: number, or2: number, a0: number, a1: number) {
      const is = polar(ir, a0), ie = polar(ir, a1);
      const os = polar(or2, a0), oe = polar(or2, a1);
      const la = (a1 - a0) > Math.PI ? 1 : 0;
      return [
        "M", is.x.toFixed(2), is.y.toFixed(2),
        "A", ir, ir, "0", la, "1", ie.x.toFixed(2), ie.y.toFixed(2),
        "L", oe.x.toFixed(2), oe.y.toFixed(2),
        "A", or2, or2, "0", la, "0", os.x.toFixed(2), os.y.toFixed(2),
        "Z",
      ].join(" ");
    }
    function arcPathOff(ir: number, or2: number, a0: number, a1: number, dx: number, dy: number) {
      const is = polar(ir, a0), ie = polar(ir, a1);
      const os = polar(or2, a0), oe = polar(or2, a1);
      const la = (a1 - a0) > Math.PI ? 1 : 0;
      return [
        "M", (is.x + dx).toFixed(2), (is.y + dy).toFixed(2),
        "A", ir, ir, "0", la, "1", (ie.x + dx).toFixed(2), (ie.y + dy).toFixed(2),
        "L", (oe.x + dx).toFixed(2), (oe.y + dy).toFixed(2),
        "A", or2, or2, "0", la, "0", (os.x + dx).toFixed(2), (os.y + dy).toFixed(2),
        "Z",
      ].join(" ");
    }
    function outerWallPath(or2: number, a0: number, a1: number) {
      const ts = polar(or2, a0), te = polar(or2, a1);
      const bs = { x: ts.x + DX, y: ts.y + DY };
      const be = { x: te.x + DX, y: te.y + DY };
      const la = (a1 - a0) > Math.PI ? 1 : 0;
      return [
        "M", ts.x.toFixed(2), ts.y.toFixed(2),
        "L", bs.x.toFixed(2), bs.y.toFixed(2),
        "A", or2, or2, "0", la, "1", be.x.toFixed(2), be.y.toFixed(2),
        "L", te.x.toFixed(2), te.y.toFixed(2),
        "A", or2, or2, "0", la, "0", ts.x.toFixed(2), ts.y.toFixed(2),
        "Z",
      ].join(" ");
    }
    function nodeId(d: any): string {
      if (d.depth === 1) return "cat-" + d.data.name;
      if (d.depth === 2) return "sub-" + d.parent.data.name + "-" + d.data.name;
      return "root";
    }
    function expandVec(d: any) {
      const ma = (d.x0 + d.x1) / 2 - Math.PI / 2;
      return { tx: (EXPAND_D * Math.cos(ma)).toFixed(2), ty: (EXPAND_D * Math.sin(ma)).toFixed(2) };
    }

    // ── Hierarchy & partition ──
    const root = d3.hierarchy(DATA)
      .sum((d: any) => d.value || 0)
      .sort((a: any, b: any) => b.value - a.value);
    const partition = d3.partition<any>().size([2 * Math.PI, 1]);
    partition(root);
    root.each((d: any) => {
      if (d.depth === 0) { d.y0 = 0; d.y1 = CENTER_R; }
      else if (d.depth === 1) { d.y0 = INNER_R1; d.y1 = INNER_R2; }
      else if (d.depth === 2) { d.y0 = OUTER_R1; d.y1 = OUTER_R2; }
    });
    const depth1 = root.descendants().filter((d: any) => d.depth === 1);
    const depth2 = root.descendants().filter((d: any) => d.depth === 2);

    // ── 等比例缩放外圈角度，确保外圈内容围成完整圆环 ──
    // 基于各节点 value 按比例重算 x0/x1，消除 partition 浮点累积误差
    const totalValue = d3.sum(depth1, (d: any) => d.value);
    let cumAngle = 0;
    depth1.forEach((d: any) => {
      d.x0 = cumAngle;
      d.x1 = cumAngle + (d.value / totalValue) * 2 * Math.PI;
      cumAngle = d.x1;
    });
    depth1.forEach((parent: any) => {
      const parentTotal = d3.sum(parent.children, (c: any) => c.value);
      let childAngle = parent.x0;
      parent.children.forEach((child: any) => {
        child.x0 = childAngle;
        child.x1 = childAngle + (child.value / parentTotal) * (parent.x1 - parent.x0);
        childAngle = child.x1;
      });
    });

    // ── SVG setup ──
    const svg = d3.select(container).append("svg")
      .attr("viewBox", "0 0 700 700")
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("width", "100%").style("height", "100%");

    // ── Radial gradients for inner ring (from backend role colors) ──
    const defs = svg.append("defs");
    ([["生", "grad-sheng"], ["旦", "grad-dan"], ["净", "grad-jing"], ["丑", "grad-chou"]] as const).forEach(([cat, id]) => {
      const base = BACKEND_ROLE_COLORS[cat] ?? "#8E8A84";
      const innerStop = shadeDarker(base, 0.10);   // at INNER_R1: darker
      const outerStop = base;                        // at INNER_R2: canonical
      const grad = defs.append("radialGradient")
        .attr("id", id).attr("cx", CX).attr("cy", CY)
        .attr("r", OUTER_R2).attr("gradientUnits", "userSpaceOnUse");
      grad.append("stop").attr("offset", "0%").attr("stop-color", shadeDarker(base, 0.18));
      grad.append("stop").attr("offset", `${((INNER_R1 - 10) / OUTER_R2) * 100}%`).attr("stop-color", innerStop);
      grad.append("stop").attr("offset", `${(INNER_R2 / OUTER_R2) * 100}%`).attr("stop-color", outerStop);
      grad.append("stop").attr("offset", "100%").attr("stop-color", shadeLighter(base, 0.10));
    });

    const chartG = svg.append("g").attr("class", "chart-group");

    // Ambient shadow
    chartG.append("ellipse")
      .attr("cx", CX + DX + 6).attr("cy", CY + DY + 6)
      .attr("rx", OUTER_R2 + 10).attr("ry", OUTER_R2 + 10)
      .attr("fill", "rgba(139,115,85,0.07)");

    // ── Layer 0: Side faces (3D bottom offset) ──
    const sideG = chartG.append("g").attr("class", "side-faces");
    const sideD1 = sideG.selectAll(".side-d1").data(depth1).join("path")
      .attr("class", "arc-side side-d1").attr("data-id", (d: any) => nodeId(d))
      .attr("fill", (d: any) => d.data.colorSide).attr("stroke", "none");
    const sideD2 = sideG.selectAll(".side-d2").data(depth2).join("path")
      .attr("class", "arc-side side-d2").attr("data-id", (d: any) => nodeId(d))
      .attr("fill", (d: any) => shadeDarker(d.data.color, 0.13)).attr("stroke", "none");

    // ── Layer 1: Outer walls (3D thickness) ──
    const wallG = chartG.append("g").attr("class", "outer-walls");
    const wallD1 = wallG.selectAll(".wall-d1").data(depth1).join("path")
      .attr("class", "arc-wall wall-d1").attr("data-id", (d: any) => nodeId(d))
      .attr("fill", (d: any) => shadeDarker(d.data.colorSide, 0.08))
      .attr("stroke", "rgba(0,0,0,0.06)").attr("stroke-width", 0.5);
    const wallD2 = wallG.selectAll(".wall-d2").data(depth2).join("path")
      .attr("class", "arc-wall wall-d2").attr("data-id", (d: any) => nodeId(d))
      .attr("fill", (d: any) => shadeDarker(d.data.color, 0.18))
      .attr("stroke", "rgba(0,0,0,0.08)").attr("stroke-width", 0.5);

    // ── Layer 2: Top faces ──
    const topG = chartG.append("g").attr("class", "top-faces");
    const GRAD_MAP: Record<string, string> = { "生": "url(#grad-sheng)", "旦": "url(#grad-dan)", "净": "url(#grad-jing)", "丑": "url(#grad-chou)" };
    const topD1 = topG.selectAll(".top-d1").data(depth1).join("path")
      .attr("class", "arc-top top-d1").attr("data-id", (d: any) => nodeId(d))
      .attr("fill", (d: any) => GRAD_MAP[d.data.name] || d.data.color).attr("stroke", "#F5F0E8")
      .attr("stroke-width", 2.8).style("cursor", "pointer");
    const topD2 = topG.selectAll(".top-d2").data(depth2).join("path")
      .attr("class", "arc-top top-d2").attr("data-id", (d: any) => nodeId(d))
      .attr("fill", (d: any) => d.data.color).attr("stroke", "#F5F0E8")
      .attr("stroke-width", 2).style("cursor", "pointer");

    // Highlight sheen on inner ring
    const hlD1 = topG.selectAll(".hl-d1").data(depth1).join("path")
      .attr("class", "arc-hl hl-d1").attr("data-id", (d: any) => nodeId(d))
      .attr("fill", "rgba(255,255,255,0.10)").attr("pointer-events", "none");

    // ── Compute path data ──
    function initPathData() {
      [...depth1, ...depth2].forEach((d: any) => {
        const ir = d.y0, or2 = d.y1;
        d._fullTop = arcPath(ir, or2, d.x0, d.x1);
        d._fullSide = arcPathOff(ir, or2, d.x0, d.x1, DX, DY);
        d._fullWall = outerWallPath(or2, d.x0, d.x1);
        d._zeroTop = arcPath(ir, or2, d.x0, d.x0);
        d._zeroSide = arcPathOff(ir, or2, d.x0, d.x0, DX, DY);
        d._zeroWall = outerWallPath(or2, d.x0, d.x0);
      });
      depth1.forEach((d: any) => {
        d._fullHL = arcPath(d.y0 + 3, (d.y0 + d.y1) / 2, d.x0 + 0.004, d.x1 - 0.004);
        d._zeroHL = arcPath(d.y0 + 3, (d.y0 + d.y1) / 2, d.x0 + 0.004, d.x0 + 0.004);
      });
    }
    initPathData();

    // Set zero state (no flash on load)
    topD1.attr("d", (d: any) => d._zeroTop);
    topD2.attr("d", (d: any) => d._zeroTop);
    sideD1.attr("d", (d: any) => d._zeroSide);
    sideD2.attr("d", (d: any) => d._zeroSide);
    wallD1.attr("d", (d: any) => d._zeroWall);
    wallD2.attr("d", (d: any) => d._zeroWall);
    hlD1.attr("d", (d: any) => d._zeroHL);

    // ── Labels ──
    const labelG = chartG.append("g").attr("class", "labels");

    const labelInner = labelG.selectAll(".lab-d1").data(depth1).join("g")
      .attr("class", "lab-d1").attr("pointer-events", "none").style("opacity", 0)
      .attr("transform", (d: any) => {
        const ma = (d.x0 + d.x1) / 2 - Math.PI / 2;
        const mr = (INNER_R1 + INNER_R2) / 2;
        return `translate(${(CX + mr * Math.cos(ma)).toFixed(1)}, ${(CY + mr * Math.sin(ma)).toFixed(1)})`;
      });
    labelInner.append("text")
      .attr("text-anchor", "middle").attr("dy", "-0.3em")
      .attr("fill", "#fff").attr("font-size", "24px").attr("font-weight", "700")
      .attr("font-family", "'Noto Serif SC', 'STSong', 'SimSun', serif")
      .style("text-shadow", "0 1px 6px rgba(0,0,0,0.6)")
      .text((d: any) => d.data.name);
    labelInner.append("text")
      .attr("text-anchor", "middle").attr("dy", "1.15em")
      .attr("fill", "rgba(255,255,255,0.92)").attr("font-size", "13px").attr("font-weight", "500")
      .attr("font-family", "'Noto Sans SC', sans-serif")
      .style("text-shadow", "0 1px 3px rgba(0,0,0,0.4)")
      .text((d: any) => d.value.toLocaleString() + "人");

    const labelOuter = labelG.selectAll(".lab-d2").data(depth2).join("g")
      .attr("class", "lab-d2").attr("pointer-events", "none").style("opacity", 0)
      .attr("transform", (d: any) => {
        const ma = (d.x0 + d.x1) / 2 - Math.PI / 2;
        const mr = (OUTER_R1 + OUTER_R2) / 2;
        return `translate(${(CX + mr * Math.cos(ma)).toFixed(1)}, ${(CY + mr * Math.sin(ma)).toFixed(1)})`;
      });
    labelOuter.append("text")
      .attr("text-anchor", "middle").attr("dy", "0.35em")
      .attr("fill", "#3a2c21").attr("font-weight", "600")
      .attr("font-family", "'Noto Serif SC', 'STSong', 'SimSun', serif")
      .attr("font-size", (d: any) => {
        const deg = (d.x1 - d.x0) * 180 / Math.PI;
        if (deg > 28) return "17px";
        if (deg > 18) return "14px";
        if (deg > 11) return "11px";
        if (deg > 6) return "9px";
        return "7px";
      })
      .text((d: any) => {
        const deg = (d.x1 - d.x0) * 180 / Math.PI;
        return deg > 3 ? d.data.name : "";
      });

    // ── Center circle ──
    const centerG = chartG.append("g").attr("class", "center-group");
    centerG.append("ellipse")
      .attr("cx", CX + 4).attr("cy", CY + 5)
      .attr("rx", CENTER_R + 2).attr("ry", CENTER_R + 2)
      .attr("fill", "rgba(180,160,140,0.22)");
    centerG.append("circle")
      .attr("cx", CX).attr("cy", CY).attr("r", CENTER_R)
      .attr("fill", "#FDF9F2").attr("stroke", "rgba(184,160,135,0.4)")
      .attr("stroke-width", 1.5).style("cursor", "pointer");
    centerG.append("circle")
      .attr("cx", CX).attr("cy", CY).attr("r", CENTER_R - 6)
      .attr("fill", "none").attr("stroke", "rgba(184,160,135,0.22)")
      .attr("stroke-width", 1);
    centerG.append("text")
      .attr("x", CX).attr("y", CY - 3)
      .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
      .attr("fill", "#5C4A32")
      .attr("font-family", "'Noto Serif SC', 'SimSun', serif")
      .attr("font-size", "24px").attr("font-weight", "700")
      .text(SUNBURST_GRAND_TOTAL.toLocaleString());
    centerG.append("text")
      .attr("x", CX).attr("y", CY + 19)
      .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
      .attr("fill", "#A09080")
      .attr("font-family", "'Noto Sans SC', sans-serif")
      .attr("font-size", "11px")
      .text("角色人次");
    centerG.selectAll("circle, text").style("opacity", 0);

    // Capture for use in closures (TS knows it's non-null after the check above)
    const containerEl = container;

    // ── Tooltip element ──
    const tooltipDiv = d3.select(container).append("div")
      .attr("class", "t1-sunburst-tooltip");

    // ── 脸谱图片映射 ──
    const FACE_IMAGE_MAP: Record<string, string> = {
      "生": "sheng.png",
      "旦": "dan-face.png",
      "净": "jing-face.png",
      "丑": "chou-face.png",
    };

    function showTooltip(event: any, d: any) {
      const rect = containerEl.getBoundingClientRect();
      const pct = d.value ? ((d.value / GRAND_TOTAL) * 100).toFixed(1) : "0.0";
      let html = `<div class="tt-name">${d.data.name}</div>`;
      html += `<div class="tt-detail">${d.value.toLocaleString()} 人次 · 占比 ${pct}%</div>`;
      if (d.depth === 1) {
        html += `<div class="tt-pct">${d.children ? d.children.length : 0} 个子类 · 点击筛选</div>`;
        // 内圈显示对应脸谱图片
        const imgFile = FACE_IMAGE_MAP[d.data.name];
        if (imgFile) {
          html += `<div class="tt-face-img"><img src="/${imgFile}" alt="${d.data.name}" /></div>`;
        }
      } else if (d.depth === 2) {
        html += `<div class="tt-pct">所属行当：${d.parent.data.name}</div>`;
      }
      tooltipDiv.html(html).classed("visible", true);
      tooltipDiv
        .style("left", (event.clientX - rect.left + 18) + "px")
        .style("top", (event.clientY - rect.top - 54) + "px");
    }
    function moveTooltip(event: any) {
      const rect = containerEl.getBoundingClientRect();
      tooltipDiv
        .style("left", (event.clientX - rect.left + 18) + "px")
        .style("top", (event.clientY - rect.top - 54) + "px");
    }
    function hideTooltip() {
      tooltipDiv.classed("visible", false);
    }

    // ── Interaction state ──
    let activeCat: string | null = null;

    function resetFilter() {
      activeCat = null;
      const t = d3.transition().duration(520).ease(d3.easeCubicOut);
      topD1.transition(t).attr("opacity", 1);
      topD2.transition(t).attr("opacity", 1);
      sideD1.transition(t).attr("opacity", 1);
      sideD2.transition(t).attr("opacity", 1);
      wallD1.transition(t).attr("opacity", 1);
      wallD2.transition(t).attr("opacity", 1);
      hlD1.transition(t).attr("opacity", 1);
      labelInner.transition(t).style("opacity", 1);
      labelOuter.transition(t).style("opacity", 1);
    }

    function filterCategory(catName: string) {
      activeCat = catName;
      const t = d3.transition().duration(520).ease(d3.easeCubicOut);
      topD1.transition(t).attr("opacity", (d: any) => d.data.name === catName ? 1 : 0.3);
      sideD1.transition(t).attr("opacity", (d: any) => d.data.name === catName ? 1 : 0.3);
      wallD1.transition(t).attr("opacity", (d: any) => d.data.name === catName ? 1 : 0.15);
      hlD1.transition(t).attr("opacity", (d: any) => d.data.name === catName ? 1 : 0);
      topD2.transition(t).attr("opacity", (d: any) => d.parent.data.name === catName ? 1 : 0.15);
      sideD2.transition(t).attr("opacity", (d: any) => d.parent.data.name === catName ? 1 : 0.08);
      wallD2.transition(t).attr("opacity", (d: any) => d.parent.data.name === catName ? 1 : 0.06);
      labelInner.transition(t).style("opacity", (d: any) => d.data.name === catName ? 1 : 0.25);
      labelOuter.transition(t).style("opacity", (d: any) => d.parent.data.name === catName ? 1 : 0.08);
    }

    // ── Hover handlers ──
    function onEnter(event: any, d: any) {
      const v = expandVec(d);
      const id = nodeId(d);
      topG.selectAll(`[data-id="${id}"]`)
        .transition().duration(200).ease(d3.easeCubicOut)
        .attr("transform", `translate(${v.tx}, ${v.ty})`);
      sideG.selectAll(`[data-id="${id}"]`)
        .transition().duration(200).ease(d3.easeCubicOut)
        .attr("transform", `translate(${v.tx}, ${v.ty})`)
        .attr("fill", (dd: any) => shadeLighter(dd.data.colorSide || dd.data.color, 0.12));
      wallG.selectAll(`[data-id="${id}"]`)
        .transition().duration(200).ease(d3.easeCubicOut)
        .attr("transform", `translate(${v.tx}, ${v.ty})`);
      topG.selectAll(`.arc-top[data-id="${id}"]`).attr("filter", "brightness(1.08)");
      showTooltip(event, d);
    }

    function onLeave(_event: any, d: any) {
      const id = nodeId(d);
      topG.selectAll(`[data-id="${id}"]`)
        .transition().duration(320).ease(d3.easeCubicOut)
        .attr("transform", "translate(0, 0)").attr("filter", null);
      sideD2.filter(function(this: any, dd: any) { return nodeId(dd) === id; })
        .transition().duration(320).ease(d3.easeCubicOut)
        .attr("fill", (dd: any) => shadeDarker(dd.data.color, 0.13));
      sideD1.filter(function(this: any, dd: any) { return nodeId(dd) === id; })
        .transition().duration(320).ease(d3.easeCubicOut)
        .attr("fill", (dd: any) => dd.data.colorSide);
      sideG.selectAll(`[data-id="${id}"]`)
        .transition().duration(320).ease(d3.easeCubicOut)
        .attr("transform", "translate(0, 0)");
      wallG.selectAll(`[data-id="${id}"]`)
        .transition().duration(320).ease(d3.easeCubicOut)
        .attr("transform", "translate(0, 0)");
      hideTooltip();
    }

    topD1.on("mouseenter", onEnter).on("mousemove", moveTooltip).on("mouseleave", onLeave);
    topD2.on("mouseenter", onEnter).on("mousemove", moveTooltip).on("mouseleave", onLeave);

    // ── Click: inner ring filters ──
    topD1.on("click", function(event: any, d: any) {
      event.stopPropagation();
      if (activeCat === d.data.name) resetFilter();
      else filterCategory(d.data.name);
    });

    // Center: reset filter + open modal
    centerG.on("click", function(event: any) {
      event.stopPropagation();
      if (activeCat) resetFilter();
      onClickRef.current?.();
    });

    // Blank SVG area: reset filter
    svg.on("click", function(event: any) {
      if (event.target === this || event.target === svg.node()) {
        if (activeCat) resetFilter();
      }
    });

    // ── Entrance animation (clockwise stagger) ──
    function animateEntrance() {
      const totalDur = 800;
      const maxStagger = 480;
      function angleDelay(d: any) { return (d.x0 / (2 * Math.PI)) * maxStagger; }
      function angleDelayOuter(d: any) { return angleDelay(d) + 120; }

      topD1.each(function(d: any) {
        d3.select(this).transition().delay(angleDelay(d)).duration(Math.max(120, totalDur - angleDelay(d)))
          .ease(d3.easeCubicOut).attr("d", d._fullTop);
      });
      topD2.each(function(d: any) {
        d3.select(this).transition().delay(angleDelayOuter(d)).duration(Math.max(120, totalDur - angleDelayOuter(d) + 80))
          .ease(d3.easeCubicOut).attr("d", d._fullTop);
      });
      sideD1.each(function(d: any) {
        d3.select(this).transition().delay(angleDelay(d)).duration(Math.max(120, totalDur - angleDelay(d)))
          .ease(d3.easeCubicOut).attr("d", d._fullSide);
      });
      sideD2.each(function(d: any) {
        d3.select(this).transition().delay(angleDelayOuter(d)).duration(Math.max(120, totalDur - angleDelayOuter(d) + 80))
          .ease(d3.easeCubicOut).attr("d", d._fullSide);
      });
      wallD1.each(function(d: any) {
        d3.select(this).transition().delay(angleDelay(d)).duration(Math.max(120, totalDur - angleDelay(d)))
          .ease(d3.easeCubicOut).attr("d", d._fullWall);
      });
      wallD2.each(function(d: any) {
        d3.select(this).transition().delay(angleDelayOuter(d)).duration(Math.max(120, totalDur - angleDelayOuter(d) + 80))
          .ease(d3.easeCubicOut).attr("d", d._fullWall);
      });
      hlD1.each(function(d: any) {
        d3.select(this).transition().delay(angleDelay(d)).duration(Math.max(120, totalDur - angleDelay(d)))
          .ease(d3.easeCubicOut).attr("d", d._fullHL);
      });
      labelInner.transition().delay(640).duration(360).ease(d3.easeCubicOut).style("opacity", 1);
      labelOuter.transition().delay(720).duration(360).ease(d3.easeCubicOut).style("opacity", 1);
      centerG.selectAll("circle, text")
        .transition().delay(180).duration(520).ease(d3.easeCubicOut).style("opacity", 1);
    }
    animateEntrance();

    return () => {
      d3.select(container).selectAll("*").remove();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`t1-role-tree-thumb ${className ?? ""}`}
      style={{ position: "relative", overflow: "visible" }}
    />
  );
};

/* ================================================================
   Evolution Overview Card — 统一概览卡片 (替换 2×2 辅助图表网格)
   ================================================================ */

/** 行当演化概览卡片 — 将 4 种辅助分析整合为一个可点击的概览块，点击弹窗展示详细内容 */
const EvolutionOverviewCard: React.FC<{ onOpenDetail: () => void }> = ({ onOpenDetail }) => {
  const { entropyData, overallTrend, chiSquare, mostSimilar, mostDifferent, points, growthMatrix } = EVOLUTION_ENRICHED;
  const hMax = Math.log(4);
  // 从 growthMatrix 找出最大/最小增长率
  const allGrowths = growthMatrix.flatMap((g: any) => Object.entries(g.growth).map(([cat, v]) => ({ era: g.era, cat, v: v as number })));
  const maxGrowth = allGrowths.reduce((a, b) => a.v > b.v ? a : b, allGrowths[0] ?? { era: "", cat: "", v: 0 });
  const minGrowth = allGrowths.reduce((a, b) => a.v < b.v ? a : b, allGrowths[0] ?? { era: "", cat: "", v: 0 });

  return (
    <div className="t1-evo-overview" onClick={onOpenDetail} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') onOpenDetail(); }}>
      <div className="t1-evo-overview-header">
        <span className="t1-evo-overview-icon">📊</span>
        <h3>演化辅助分析概览</h3>
      </div>
      <div className="t1-evo-overview-grid">
        {/* 相对增长率 */}
        <div className="t1-evo-overview-cell">
          <div className="t1-evo-overview-cell-header"><span className="t1-evo-overview-cell-icon">🔥</span>相对增长率</div>
          <div className="t1-evo-overview-cell-body">
            <span className="t1-evo-overview-cell-value">{maxGrowth.cat}{maxGrowth.v > 0 ? `+${(maxGrowth.v * 100).toFixed(0)}` : `${(maxGrowth.v * 100).toFixed(0)}`}%</span>
            <span className="t1-evo-overview-cell-sub">最大增幅 ({maxGrowth.era})</span>
          </div>
          <div className="t1-evo-overview-cell-body">
            <span className="t1-evo-overview-cell-value">{minGrowth.cat}{(minGrowth.v * 100).toFixed(0)}%</span>
            <span className="t1-evo-overview-cell-sub">最小增幅 ({minGrowth.era}) · 基线: 民国汇编</span>
          </div>
        </div>
        {/* Shannon熵 */}
        <div className="t1-evo-overview-cell">
          <div className="t1-evo-overview-cell-header"><span className="t1-evo-overview-cell-icon">🌐</span>Shannon熵</div>
          <div className="t1-evo-overview-cell-body">
            <span className="t1-evo-overview-cell-value">{entropyData[entropyData.length - 1]?.entropy.toFixed(3) || '—'}</span>
            <span className="t1-evo-overview-cell-sub">/ H_max={hMax.toFixed(3)} · {overallTrend === 'diversifying' ? '↗ 均衡化' : '↘ 集中化'}</span>
          </div>
          <div className="t1-evo-overview-cell-body">
            <span className="t1-evo-overview-cell-value">{entropyData[0]?.entropyNorm.toFixed(3)} → {entropyData[entropyData.length - 1]?.entropyNorm.toFixed(3)}</span>
            <span className="t1-evo-overview-cell-sub">归一化熵值变化</span>
          </div>
        </div>
        {/* JSD矩阵 */}
        <div className="t1-evo-overview-cell">
          <div className="t1-evo-overview-cell-header"><span className="t1-evo-overview-cell-icon">🔗</span>JSD矩阵 · 结构差异</div>
          <div className="t1-evo-overview-cell-body">
            {mostSimilar ? (
              <><span className="t1-evo-overview-cell-value" style={{ fontSize: 13 }}>{mostSimilar.periodA} ↔ {mostSimilar.periodB}</span><span className="t1-evo-overview-cell-sub">最相似 (JSD={mostSimilar.distance.toFixed(4)})</span></>
            ) : <span className="t1-evo-overview-cell-value">—</span>}
          </div>
          <div className="t1-evo-overview-cell-body">
            {mostDifferent ? (
              <><span className="t1-evo-overview-cell-value" style={{ fontSize: 13 }}>{mostDifferent.periodA} ↔ {mostDifferent.periodB}</span><span className="t1-evo-overview-cell-sub">最差异 (JSD={mostDifferent.distance.toFixed(4)})</span></>
            ) : <span className="t1-evo-overview-cell-value">—</span>}
          </div>
        </div>
        {/* 统计显著性 */}
        <div className="t1-evo-overview-cell">
          <div className="t1-evo-overview-cell-header"><span className="t1-evo-overview-cell-icon">📊</span>统计显著性</div>
          <div className="t1-evo-overview-cell-body">
            <span className="t1-evo-overview-cell-value">χ²V={chiSquare?.cramerV || '—'}</span>
            <span className="t1-evo-overview-cell-sub">{chiSquare?.interpretation || ''} · p{chiSquare?.p || '—'}</span>
          </div>
          <div className="t1-evo-overview-cell-body">
            <span className="t1-evo-overview-cell-value" style={{ fontSize: 13 }}>{mostSimilar?.periodA || ''} ↔ {mostDifferent?.periodB || ''}</span>
            <span className="t1-evo-overview-cell-sub">{points.length} 时期 · {chiSquare?.df || 0} 自由度</span>
          </div>
        </div>
      </div>
      <div className="t1-evo-overview-footer">
        <span>点击查看完整图表详情</span>
        <span className="t1-evo-overview-expand-icon">→</span>
      </div>
    </div>
  );
};

/* ================================================================
   Statistical Analysis Panels — 统计分析说明卡片 (仿关键洞察卡片构图)
   ================================================================ */

/** 行当演化趋势 — 统计分析方法面板 (重构版：采用关键洞察卡片式布局) */
const EvolutionStatsPanel: React.FC = () => {
  const { points, trendAnalysis, chiSquare, overallTrend, entropyData, mostSimilar, mostDifferent } = EVOLUTION_ENRICHED;
  const minSample = [...points].sort((a, b) => a.n - b.n)[0];
  const maxSample = [...points].sort((a, b) => b.n - a.n)[0];
  const hMax = Math.log(4);

  // 总方法说明
  const findingIcons = ["📊", "📐", "📈", "✅", "📉"];
  const findingColors = ["#b8926a", "#7f968d", "#5e6b76", "#96544d", "#8a939b"];

  return (
    <div className="t1-stats-panel">
      {/* ── Section 1: 基础数据与方法说明 (Finding Cards 纵向堆叠) ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* 卡片 1: 数据基础 */}
        <div className="t1-pf-finding-card" style={{ borderLeftColor: findingColors[0] }}>
          <div className="t1-pf-finding-header">
            <span className="t1-pf-finding-icon">{findingIcons[0]}</span>
            <span className="t1-pf-finding-title">数据基础</span>
          </div>
          <p className="t1-pf-finding-body">1,473 部剧本 · {SUNBURST_GRAND_TOTAL.toLocaleString()} 角色人次 · {points.length} 个编纂时期</p>
          <div className="t1-pf-dim-stats-row t1-evo-insight-stats">
            <div className="t1-pf-dim-stat">
              <span className="t1-pf-dim-stat-val" style={{ color: findingColors[0] }}>{maxSample.n.toLocaleString()}</span>
              <span className="t1-pf-dim-stat-lbl">最大样本 ({maxSample.era})</span>
            </div>
            <div className="t1-pf-dim-stat">
              <span className="t1-pf-dim-stat-val" style={{ color: findingColors[0] }}>{minSample.n.toLocaleString()}</span>
              <span className="t1-pf-dim-stat-lbl">最小样本 ({minSample.era})</span>
            </div>
            <div className="t1-pf-dim-stat">
              <span className="t1-pf-dim-stat-val" style={{ color: findingColors[0] }}>{Math.round(maxSample.n / minSample.n)}×</span>
              <span className="t1-pf-dim-stat-lbl">样本悬殊</span>
            </div>
          </div>
        </div>

        {/* 卡片 2: 频次统计方法论 */}
        <div className="t1-pf-finding-card" style={{ borderLeftColor: findingColors[1] }}>
          <div className="t1-pf-finding-header">
            <span className="t1-pf-finding-icon">{findingIcons[1]}</span>
            <span className="t1-pf-finding-title">频次统计与占比计算</span>
          </div>
          <p className="t1-pf-finding-body">按编纂时期 × 行当大类交叉统计，将 11 个子类聚合为四大行当（生·旦·净·丑），以各行当占比追踪结构变迁。占比 = 行当频次 ÷ 时期总角色人次。</p>
        </div>

        {/* 卡片 3: 趋势分析概述 */}
        <div className="t1-pf-finding-card" style={{ borderLeftColor: findingColors[2] }}>
          <div className="t1-pf-finding-header">
            <span className="t1-pf-finding-icon">{findingIcons[2]}</span>
            <span className="t1-pf-finding-title">趋势分析方法</span>
          </div>
          <p className="t1-pf-finding-body">综合运用 Mann-Kendall 趋势检验（非参数）、OLS 线性回归（R² 拟合优度）和 CAGR（年均复合增长率）三套方法，从多角度量化各行当的历史变迁趋势。</p>
          <div className="t1-evo-cultural-footnote">
            <span className="t1-evo-cultural-icon">ℹ️</span>
            <span>注意: n=6 时期序列统计效力有限，趋势方向为探索性参考。M-K: ↑ (p&lt;0.1) 显著上升, ↓ (p&lt;0.1) 显著下降, ≈ 无显著趋势</span>
          </div>
        </div>

        {/* 卡片 4: 统计显著性 */}
        {chiSquare.chiSq > 0 && (
          <div className="t1-pf-finding-card" style={{ borderLeftColor: findingColors[3] }}>
            <div className="t1-pf-finding-header">
              <span className="t1-pf-finding-icon">{findingIcons[3]}</span>
              <span className="t1-pf-finding-title">时期×行当 卡方独立性检验</span>
            </div>
            <p className="t1-pf-finding-body">检验不同编纂时期的行当分布是否显著不同。p&lt;0.05 表示分布差异具有统计显著性。</p>
            <div className="t1-pf-dim-stats-row t1-evo-insight-stats">
              <div className="t1-pf-dim-stat">
                <span className="t1-pf-dim-stat-val" style={{ color: findingColors[3] }}>χ²={chiSquare.chiSq}</span>
                <span className="t1-pf-dim-stat-lbl">df={chiSquare.df}</span>
              </div>
              <div className="t1-pf-dim-stat">
                <span className="t1-pf-dim-stat-val" style={{ color: findingColors[3] }}>p{chiSquare.p}</span>
                <span className="t1-pf-dim-stat-lbl">显著{chiSquare.p?.includes('<') ? '' : '不'}性</span>
              </div>
              <div className="t1-pf-dim-stat">
                <span className="t1-pf-dim-stat-val" style={{ color: findingColors[3] }}>V={chiSquare.cramerV}</span>
                <span className="t1-pf-dim-stat-lbl">Cramér's V</span>
              </div>
            </div>
          </div>
        )}

        {/* 卡片 5: Wilson CI 说明 */}
        <div className="t1-pf-finding-card" style={{ borderLeftColor: findingColors[4] }}>
          <div className="t1-pf-finding-header">
            <span className="t1-pf-finding-icon">{findingIcons[4]}</span>
            <span className="t1-pf-finding-title">Wilson 95% 置信区间</span>
          </div>
          <p className="t1-pf-finding-body">比例置信区间适用于小样本修正。阴影带 = CI 范围，反映占比估计的抽样误差。小样本时期（n&le;500）CI 较宽，趋势解读需谨慎。CI 越宽说明样本越不稳定，CI 越窄结果可信度更高。</p>
        </div>
      </div>

      {/* ── Section 2: 四大行当判别卡片（2×2 网格，仿 DimDiscriminantCard 构图） ── */}
      <div style={{ marginTop: 2 }}>
        <div className="t1-pf-section-header" style={{ marginBottom: 6 }}>
          <span className="t1-pf-section-icon">📈</span>
          <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#5e4054' }}>各行当趋势指标</h3>
        </div>
        <div className="t1-pf-dim-cards-grid t1-evo-cat-grid">
          {["生", "旦", "净", "丑"].map(cat => {
            const ta = trendAnalysis[cat];
            if (!ta) return null;
            const mk = ta.mannKendall;
            const lr = ta.linearRegression;
            const catColor = EVO_4CAT_COLORS[cat];

            // 计算变化幅度贡献
            const allSlopes = ["生", "旦", "净", "丑"].map(c => {
              const t = trendAnalysis[c] as any;
              return Math.abs(t?.linearRegression?.slope ?? 0);
            });
            const maxSlope = Math.max(...allSlopes, 1);
            const slopeAbs = Math.abs(lr?.slope ?? 0);
            const contribPct = Math.round((slopeAbs / maxSlope) * 100);

            return (
              <div key={cat} className="t1-pf-dim-card" style={{ borderLeftColor: catColor } as React.CSSProperties}>
                <div className="t1-pf-dim-card-header">
                  <span className="t1-pf-dim-rank" style={{ background: catColor }}>{cat}行</span>
                  <span className="t1-pf-dim-name">
                    <span className="t1-pf-dim-dot" style={{ background: catColor }} />
                    {cat}行趋势分析
                  </span>
                  <span className={`t1-evo-trend-badge ${mk?.trend === '↑' ? 'up' : mk?.trend === '↓' ? 'down' : 'stable'}`}>
                    {mk?.trend || '≈'}
                  </span>
                </div>
                <div className="t1-pf-dim-stats-row">
                  <div className="t1-pf-dim-stat">
                    <span className="t1-pf-dim-stat-val" style={{ color: catColor }}>
                      {lr?.slope > 0 ? '+' : ''}{lr?.slope?.toFixed(2) || '—'}pp
                    </span>
                    <span className="t1-pf-dim-stat-lbl">OLS 斜率 (R²={lr?.r2?.toFixed(2) || '—'})</span>
                  </div>
                  <div className="t1-pf-dim-stat">
                    <span className="t1-pf-dim-stat-val" style={{ color: catColor }}>
                      {ta.cagr}%
                    </span>
                    <span className="t1-pf-dim-stat-lbl">CAGR/年</span>
                  </div>
                  <div className="t1-pf-dim-stat">
                    <span className="t1-pf-dim-stat-val" style={{ color: catColor }}>
                      M-K {mk?.trend || '≈'}
                    </span>
                    <span className="t1-pf-dim-stat-lbl">p={mk?.p?.toFixed(3) || '—'} τ={mk?.tau?.toFixed(2) || '—'}</span>
                  </div>
                </div>
                <div className="t1-pf-contrib-bar">
                  <span className="t1-pf-contrib-label">变化幅度</span>
                  <div className="t1-pf-contrib-track">
                    <div className="t1-pf-contrib-fill" style={{ width: `${contribPct}%`, background: catColor }} />
                  </div>
                  <span className="t1-pf-contrib-pct">{contribPct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 3: 方法论脚注 (Shannon / JSD / 样本量警示) ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 2 }}>
        {/* JSD + Shannon */}
        <div className="t1-pf-finding-card" style={{ borderLeftColor: "#7f968d" }}>
          <div className="t1-pf-finding-header">
            <span className="t1-pf-finding-icon">🔗</span>
            <span className="t1-pf-finding-title">Jensen-Shannon 结构距离 &amp; Shannon 多样性</span>
          </div>
          <p className="t1-pf-finding-body">
            JSD 衡量两时期行当分布的整体差异（0=完全相同, 1=完全相异）。
            {mostSimilar && <> 最相似: <strong>{mostSimilar.periodA} ↔ {mostSimilar.periodB}</strong> (JSD={mostSimilar.distance.toFixed(4)})</>}
            {mostDifferent && <> 最差异: <strong>{mostDifferent.periodA} ↔ {mostDifferent.periodB}</strong> (JSD={mostDifferent.distance.toFixed(4)})</>}
          </p>
          <p className="t1-pf-finding-body" style={{ marginTop: 4 }}>
            Shannon熵衡量行当分布均衡度。H_max=ln(4)≈{hMax.toFixed(3)} 为四行当完全均匀分布。首末变化: {entropyData[0]?.entropyNorm.toFixed(3)} → {entropyData[entropyData.length - 1]?.entropyNorm.toFixed(3)}，{overallTrend === 'diversifying' ? '趋于均衡化（多元化）' : '趋于集中化'}
          </p>
        </div>

        {/* 样本量警示 */}
        <div className="t1-pf-finding-card" style={{ borderLeftColor: "#b89b6d" }}>
          <div className="t1-pf-finding-header">
            <span className="t1-pf-finding-icon">⚠️</span>
            <span className="t1-pf-finding-title">样本量警示</span>
          </div>
          <p className="t1-pf-finding-body">
            <strong>{minSample.era}</strong> 仅 {minSample.n.toLocaleString()} 人次（剧本 {(evolutionJson as any).periods?.find((p: any) => p.shortLabel === minSample.era)?.scriptCount || '—'} 部），
            <strong>{maxSample.era}</strong> 达 {maxSample.n.toLocaleString()} 人次（剧本 {(evolutionJson as any).periods?.find((p: any) => p.shortLabel === maxSample.era)?.scriptCount || '—'} 部），
            样本悬殊超 <strong>{Math.round(maxSample.n / minSample.n)} 倍</strong>。小样本时期的比例波动可能由抽样误差主导。
          </p>
        </div>
      </div>
    </div>
  );
};

/* ================================================================
   Main Layout
   ================================================================ */

const Task1Layout: React.FC = () => {
  const [mainView, setMainView] = useState<MainView>("roleSystem");
  const [roleTreeModalOpen, setRoleTreeModalOpen] = useState(false);
  const [reportSidebarOpen, setReportSidebarOpen] = useState(false);
  const [reportTab, setReportTab] = useState<string>("report");
  const [evoModalOpen, setEvoModalOpen] = useState(false);
  const [evoDetailModalOpen, setEvoDetailModalOpen] = useState(false);
  const [evoOverviewOpen, setEvoOverviewOpen] = useState(false);
  const [activePeriod, setActivePeriod] = useState<string | null>(null);
  const periodSectionRef = useRef<HTMLDivElement>(null);

  // ── Evolution tab: selected data point for right-side detail panel ──
  const [selectedEvoPoint, setSelectedEvoPoint] = useState<{ era: string; cat: string } | null>(null);

  // ── Evolution tab: side-block collapsible state ──
  const [sideBlockOpen, setSideBlockOpen] = useState<Record<string, boolean>>({
    detail: true,
    insights: false,
    stats: false,
  });
  const toggleSideBlock = (key: string) =>
    setSideBlockOpen(prev => ({ ...prev, [key]: !prev[key] }));

  // ── Period buttons: toggle selection & click-outside dismissal ──
  const handlePeriodSelect = (shortLabel: string) => {
    setActivePeriod(prev => (prev === shortLabel ? null : shortLabel));
  };

  useEffect(() => {
    if (!activePeriod) return;
    const onDown = (e: MouseEvent) => {
      if (
        periodSectionRef.current &&
        !periodSectionRef.current.contains(e.target as Node)
      ) {
        setActivePeriod(null);
      }
    };
    const timer = setTimeout(
      () => document.addEventListener("mousedown", onDown),
      0,
    );
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", onDown);
    };
  }, [activePeriod]);

  // ── Performance tab: dimension discriminant collapsible state ──
  const [discriminantOpen, setDiscriminantOpen] = useState(false);
  const [commentaryOpen, setCommentaryOpen] = useState(true);

  // ── New radar search state ──
  const [mainCharacter, setMainCharacter] = useState<string | null>("关羽");
  const [comparisonCharacters, setComparisonCharacters] = useState<string[]>([]);
  const [charIndex, setCharIndex] = useState<CharacterIndex | null>(null);
  const [perfStats, setPerfStats] = useState<any>(null);
  const [commentaries, setCommentaries] = useState<CommentaryCard[] | null>(null);

  // Load character index and stats on mount
  useEffect(() => {
    loadCharacterIndex().then(setCharIndex);
    loadPerformanceStats().then(setPerfStats);
  }, []);

  // Build commentary when main character changes
  useEffect(() => {
    if (!mainCharacter || !charIndex || !perfStats) {
      setCommentaries(null);
      return;
    }
    const char = charIndex.characters[mainCharacter];
    if (!char) {
      setCommentaries(null);
      return;
    }
    const input: CommentaryInput = buildCommentaryInput(mainCharacter, char, perfStats);
    setCommentaries(buildAllCommentaries(input));
  }, [mainCharacter, charIndex, perfStats]);

  const handleSelectCharacter = (name: string) => {
    setMainCharacter(name);
    // Remove from comparison if selected as main
    setComparisonCharacters(prev => prev.filter(c => c !== name));
  };

  const handleAddComparison = (name: string) => {
    if (name === mainCharacter) return;
    if (comparisonCharacters.length >= 5) return;
    if (comparisonCharacters.includes(name)) return;
    setComparisonCharacters(prev => [...prev, name]);
  };

  const handleRemoveComparison = (name: string) => {
    setComparisonCharacters(prev => prev.filter(c => c !== name));
  };

  const handleClearCharacter = () => {
    setMainCharacter(null);
    setComparisonCharacters([]);
  };

  return (
    <div className="t1-screen">
      {/* 顶栏 */}
      <header className="t1-topbar">
        <div className="t1-topbar-title-group">
          <h1><span className="t1-brand-icon">🎪</span> 角色行当推断与演化分析</h1>
          <span className="t1-topbar-desc">规则推断+语义融合 — 构建可解释行当分类模型，追踪不同时期角色-行当对应关系变化规律</span>
        </div>
        <button
          className="t1-topbar-report-btn"
          onClick={() => { setReportSidebarOpen(true); setReportTab("report"); }}
          title="查看任务一设计流程报告 — 含角色特征建模·行当推断模型·特征-行当关系·历史演化分析"
        >
          <span className="t1-report-btn-icon">📋</span>
          <span className="t1-report-btn-text">
            <span className="t1-report-btn-label">设计流程报告</span>
            <span className="t1-report-btn-sub">方法 · 参数 · 流程</span>
          </span>
          <span className="t1-report-btn-arrow">→</span>
        </button>
      </header>

      {/* ══════ 主视图标签导航 ══════ */}
      <nav className="t1-view-tabs">
        {(Object.entries(VIEW_LABELS) as [MainView, string][]).map(([v, label]) => (
          <button
            key={v}
            className={`t1-view-tab ${mainView === v ? "active" : ""}`}
            onClick={() => setMainView(v)}
          >
            <span className="t1-view-icon">{VIEW_ICONS[v]}</span>
            {label}
          </button>
        ))}
      </nav>

      {/* 主内容 — 按标签页切换 */}
      <main className="t1-main-grid">
        {/* ══════ Tab 1: 角色体系与演化 (3个独立卡片: 行当细分详解 3 : 旭日图 4 : 特征-行当关联 Sankey 3) ══════ */}
        {mainView === "roleSystem" && (<>
        <div className="t1-role-system-cards">
          {/* Left card: 行当细分详解 */}
          <div className="t1-role-system-card t1-role-system-card--detail">
            <div className="t1-role-system-card-header">
              <span className="t1-role-system-card-icon">📋</span>
              <h3>行当细分详解</h3>
            </div>
            <div className="t1-role-system-card-body">
              <RoleDetailPanel />
            </div>
          </div>
          {/* Middle card: 旭日图 */}
          <div className="t1-role-system-card t1-role-system-card--sunburst">
            <div className="t1-role-system-card-header">
              <span className="t1-role-system-card-icon">🌳</span>
              <h3>行当层级旭日图</h3>
              <button
                className="t1-expand-btn"
                onClick={() => setRoleTreeModalOpen(true)}
                title="点击查看旭日图大图"
              >
                <span className="t1-expand-icon">⛶</span>
              </button>
            </div>
            <div className="t1-role-system-card-body">
              <RoleTreeChart onClick={() => setRoleTreeModalOpen(true)} />
              <p className="t1-sunburst-note">悬停查看各角色人次与占比 · 点击内圈筛选外圈子类</p>
            </div>
          </div>
          {/* Right card: 特征-行当关联 Sankey */}
          <div className="t1-role-system-card t1-role-system-card--sankey">
            <div className="t1-role-system-card-header t1-role-system-card-header--in-sankey">
              <span className="t1-role-system-card-icon">🔗</span>
              <h3>特征-行当关联</h3>
            </div>
            <div className="t1-sankey-merged-wrapper">
              <SankeyPanel />
            </div>
          </div>
        </div>
        <div className="t1-center-note t1-center-note--wide">
          生·旦·净·丑四大行当体系 · 左: 行当细分详解(11个子类·4大类别) · 中: 行当层级旭日图(1:1,点击查看大图) · 右: 29特征→11行当关联 Sankey · 数据来源: 1,473 部剧本, {SUNBURST_GRAND_TOTAL.toLocaleString()} 角色人次
        </div>
        </>)}

        {/* ══════ Tab 2: 行当演化趋势 ══════ */}
        {mainView === "evolution" && (
        <div className="t1-evo-layout">
          {/* ── 主内容: 左 (主图+辅助图表) | 右 (洞察面板) — 仿 Task3 双栏构图 ── */}
          <div className="t1-evo-content">
            {/* 左栏: 主图 + 辅助图表网格 */}
            <div className="t1-evo-main-col">
              {/* ── 主图区域 ── */}
              <div className="t1-main-vis">
                <div className="t1-main-vis-inner">
                  <div className="t1-chart-wrap">
                    <div className="t1-center-header">
                    <span className="t1-center-icon">📜</span>
                    <h2>行当演化趋势</h2>
                    <div className="t1-evo-header-facts">
                      {EVO_CATEGORIES.map(cat => {
                        const ta = EVOLUTION_ENRICHED.trendAnalysis?.[cat];
                        const mk = ta?.mannKendall;
                        return (
                          <span key={cat} className="t1-evo-header-badge" style={{ color: EVO_4CAT_COLORS[cat], borderColor: EVO_4CAT_COLORS[cat] }}>
                            {cat}{mk?.trend || '≈'}
                          </span>
                        );
                      })}
                      <span className="t1-evo-header-badge t1-evo-header-badge--chi">
                        χ² V={EVOLUTION_ENRICHED.chiSquare?.cramerV}
                      </span>
                    </div>
                    <button
                      className={`t1-evo-overview-btn ${evoOverviewOpen ? "active" : ""}`}
                      onClick={(e) => { e.stopPropagation(); setEvoOverviewOpen(prev => !prev); }}
                      title="演化辅助分析概览 — 相对增长率·Shannon熵·JSD结构差异·统计显著性"
                    >
                      <span className="t1-evo-overview-btn-icon">📊</span>
                      <span>分析概览</span>
                    </button>
                    <button
                      className="t1-expand-btn"
                      onClick={() => setEvoModalOpen(true)}
                      title="点击查看大图"
                      aria-label="查看行当演化趋势大图"
                    >
                      <span className="t1-expand-icon">⛶</span>
                    </button>
                  </div>
                  <div className="t1-center-body">
                    <EnhancedEvolutionChart onClick={() => setEvoModalOpen(true)} onPointSelect={setSelectedEvoPoint} />
                  </div>
                  <div className="t1-center-note">6个编纂来源时期 · 四大行当占比变化 · 阴影带=95%置信区间 · 虚线=线性趋势 · 峰值标记=最高占比</div>
                </div>
                </div>

              {/* ── 时期交互按钮 + 详情弹窗 ── */}
              <div className="t1-period-section" ref={periodSectionRef}>
                <PeriodButtons
                  periods={PERIOD_INFO_LIST}
                  activePeriod={activePeriod}
                  onSelect={handlePeriodSelect}
                />
                {activePeriod && PERIOD_MAP[activePeriod] && (
                  <PeriodPopover
                    period={PERIOD_MAP[activePeriod]}
                    onClose={() => setActivePeriod(null)}
                  />
                )}
              </div>

              {/* ── 演化辅助分析概览浮动弹窗 ── */}
              {evoOverviewOpen && (
                <>
                  <div className="t1-evo-overlay" onClick={() => setEvoOverviewOpen(false)} />
                  <div className="t1-evo-overview-popup">
                    <EvolutionOverviewCard onOpenDetail={() => { setEvoDetailModalOpen(true); setEvoOverviewOpen(false); }} />
                  </div>
                </>
              )}
              </div>
            </div>

            {/* 右栏: 数据详情 + 关键洞察 + 统计方法 */}
            <aside className="t1-side-panel">
              <div className="t1-side-block">
                <div
                  className={`t1-side-block-header ${sideBlockOpen.detail ? 'is-open' : 'is-closed'}`}
                  onClick={() => toggleSideBlock('detail')}
                  role="button"
                  tabIndex={0}
                  aria-expanded={sideBlockOpen.detail}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggleSideBlock('detail'); }}
                >
                  <span className="t1-side-block-icon">📌</span>
                  <h3>数据详情</h3>
                  <span className={`t1-side-block-chevron ${sideBlockOpen.detail ? 'is-open' : ''}`}>▼</span>
                </div>
                <div className={`t1-side-block-collapse ${sideBlockOpen.detail ? 'is-open' : ''}`}>
                  <SelectedEvoPointPanel
                    point={selectedEvoPoint}
                    onClear={() => setSelectedEvoPoint(null)}
                  />
                </div>
              </div>
              <div className="t1-side-block">
                <div
                  className={`t1-side-block-header ${sideBlockOpen.insights ? 'is-open' : 'is-closed'}`}
                  onClick={() => toggleSideBlock('insights')}
                  role="button"
                  tabIndex={0}
                  aria-expanded={sideBlockOpen.insights}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggleSideBlock('insights'); }}
                >
                  <span className="t1-side-block-icon">💡</span>
                  <h3>关键洞察</h3>
                  <span className={`t1-side-block-chevron ${sideBlockOpen.insights ? 'is-open' : ''}`}>▼</span>
                </div>
                <div className={`t1-side-block-collapse ${sideBlockOpen.insights ? 'is-open' : ''}`}>
                  <EvolutionNarrativeInsights />
                </div>
              </div>
              <div className="t1-side-block">
                <div
                  className={`t1-side-block-header ${sideBlockOpen.stats ? 'is-open' : 'is-closed'}`}
                  onClick={() => toggleSideBlock('stats')}
                  role="button"
                  tabIndex={0}
                  aria-expanded={sideBlockOpen.stats}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggleSideBlock('stats'); }}
                >
                  <span className="t1-side-block-icon">📊</span>
                  <h3>统计分析方法</h3>
                  <span className={`t1-side-block-chevron ${sideBlockOpen.stats ? 'is-open' : ''}`}>▼</span>
                </div>
                <div className={`t1-side-block-collapse ${sideBlockOpen.stats ? 'is-open' : ''}`}>
                  <EvolutionStatsPanel />
                </div>
              </div>
            </aside>
          </div>
        </div>
        )}

        {/* ══════ Tab 3: 表演模式分析 ══════ */}
        {mainView === "performance" && (
        <div className="t1-perf-wrapper">
          {/* 左右两栏 — 45/55 等高 */}
          <div className="t1-perf-two-col">
            {/* 左栏 — 雷达图 */}
            <div className="t1-perf-left">
              <PerformanceRadarChart
                mainCharacter={mainCharacter}
                comparisonCharacters={comparisonCharacters}
                characterData={charIndex?.characters ?? {}}
                height={560}
              />

            </div>

            {/* 右栏 55% — 纵向阅读路径: 角色搜索 → 表演评述 → 关键发现 → 维度卡片 → 知识发现 → 统计证据 */}
            <div className="t1-perf-right">
              {/* 角色名字输入栏 — 置于右侧栏目最上方 */}
              <CharacterSearch
                index={charIndex}
                selectedName={mainCharacter}
                onSelect={handleSelectCharacter}
                combined
                comparisonCharacters={comparisonCharacters}
                onAddComparison={handleAddComparison}
                onRemoveComparison={handleRemoveComparison}
                onClear={handleClearCharacter}
                maxComparisons={5}
              />

              {/* Section 0: Commentary Cards (moved from left column) */}
              <div className="t1-pf-section">
                <div
                  className={`t1-pf-section-header ${commentaryOpen ? 'is-open' : 'is-closed'}`}
                  onClick={() => setCommentaryOpen(o => !o)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={commentaryOpen}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setCommentaryOpen(o => !o); }}
                >
                  <span className="t1-pf-section-icon">🎭</span>
                  <h3>表演模式评述</h3>
                  <span className={`t1-pf-section-chevron ${commentaryOpen ? 'is-open' : ''}`}>▼</span>
                </div>
                <div className={`t1-pf-section-collapse ${commentaryOpen ? 'is-open' : ''}`}>
                  <CommentaryCards
                    commentaries={commentaries}
                    charName={mainCharacter}
                    charDisplayName={
                      mainCharacter
                        ? charIndex?.characters[mainCharacter]?.displayName
                        : undefined
                    }
                    category={
                      mainCharacter
                        ? charIndex?.characters[mainCharacter]?.category
                        : undefined
                    }
                    confidence={
                      mainCharacter
                        ? charIndex?.characters[mainCharacter]?.confidence
                        : undefined
                    }
                    scriptCount={
                      mainCharacter
                        ? charIndex?.characters[mainCharacter]?.scriptCount
                        : undefined
                    }
                  />
                </div>
              </div>

              {/* Section 1: Key Findings */}
              <KeyFindingsCards
                dimStats={PERFORMANCE_DIM_STATS}
                anova={performanceJson.anova}
                correlations={performanceJson.correlations}
              />

              {/* Section 2: Dimension Discriminant Cards (2×2) */}
              <div className="t1-pf-section">
                <div
                  className={`t1-pf-section-header ${discriminantOpen ? 'is-open' : 'is-closed'}`}
                  onClick={() => setDiscriminantOpen(o => !o)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={discriminantOpen}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setDiscriminantOpen(o => !o); }}
                >
                  <span className="t1-pf-section-icon">📐</span>
                  <h3>维度判别能力分析</h3>
                  <span className={`t1-pf-section-chevron ${discriminantOpen ? 'is-open' : ''}`}>▼</span>
                </div>
                <div className={`t1-pf-section-collapse ${discriminantOpen ? 'is-open' : ''}`}>
                <div className="t1-pf-dim-cards-grid">
                  {(["sing", "speak", "act", "fight"] as const).map(dim => (
                    <DimDiscriminantCard
                      key={dim}
                      dim={dim}
                      rank={(() => {
                        const _dims = ["sing", "speak", "act", "fight"] as const;
                        const fVals = _dims.map(d => (performanceJson.anova as any)[d]?.F ?? 0);
                        const cvVals = _dims.map(d => parseFloat(PERFORMANCE_DIM_STATS[d].cv));
                        const nF = (v: number) => (v - Math.min(...fVals)) / (Math.max(...fVals) - Math.min(...fVals) || 1);
                        const nC = (v: number) => (v - Math.min(...cvVals)) / (Math.max(...cvVals) - Math.min(...cvVals) || 1);
                        const scores = _dims.map((_d, _i) => nF(fVals[_i]) * 0.6 + nC(cvVals[_i]) * 0.4);
                        const sorted = [...scores].sort((a, b) => b - a);
                        return sorted.indexOf(scores[_dims.indexOf(dim)]) + 1;
                      })()}
                      fValue={(performanceJson.anova as any)[dim]?.F ?? 0}
                      etaSq={(performanceJson.anova as any)[dim]?.etaSq ?? 0}
                      cvPercent={PERFORMANCE_DIM_STATS[dim].cv}
                      topChars={[...PERFORMANCE_DATA]
                        .sort((a, b) => (b[dim] as number) - (a[dim] as number))
                        .slice(0, 3)
                        .map(d => ({ role: d.role, value: d[dim] as number, color: ROLE_COLORS[d.role] }))}
                      pairwise={performanceJson.pairwiseDiffs}
                      catProfiles={performanceJson.categoryProfiles}
                    />
                  ))}
                </div>
                </div>
              </div>

              {/* Section 3: Knowledge Discovery */}
              <KnowledgeDiscoveryPanel
                inferenceRules={INFERENCE_RULES}
                catProfiles={performanceJson.categoryProfiles}
              />

              {/* Section 4: Statistical Evidence */}
              <StatisticalEvidencePanel
                dimStats={PERFORMANCE_DIM_STATS}
                anova={performanceJson.anova}
                catProfiles={performanceJson.categoryProfiles}
                selectedRole={mainCharacter}
                perfData={PERFORMANCE_DATA}
                roleTypeMap={ROLE_TO_ROLE_TYPE}
              />

              {/* 底部说明文字 — 置于右侧栏目下方 */}
              <footer className="t1-perf-bottombar">
                「唱·念·做·打」四维表演模式分析 — 基于 {charIndex?._meta.totalCharacters ?? 3581} 个角色的剧本聚合统计与 8 个专家标注参考值 (ANOVA 检验均通过)。搜索任意角色查看其表演模式雷达图与多维度评述，支持最多 3 个角色的叠加对比。
              </footer>
            </div>
          </div>
        </div>
        )}

        {/* 设计流程报告侧边栏 */}
        <div className={`t1-report-backdrop ${reportSidebarOpen ? "visible" : ""}`} onClick={() => setReportSidebarOpen(false)} />
        <aside className={`t1-report-sidebar ${reportSidebarOpen ? "open" : ""}`}>
          <div className="t1-report-sidebar-header">
            <span className="t1-report-sidebar-header-icon">📋</span>
            <h2>设计流程报告</h2>
            <button className="t1-report-sidebar-close" onClick={() => setReportSidebarOpen(false)}>✕</button>
          </div>

          {/* 侧边栏标签导航 */}
          <nav className="t1-report-tabs">
            {[
              { id: "report", icon: "📋", label: "设计流程报告" },
              { id: "findings", icon: "💡", label: "典型发现" },
              { id: "evolution", icon: "📜", label: "历史演化分析" },
            ].map(t => (
              <button
                key={t.id}
                className={`t1-report-tab ${reportTab === t.id ? "active" : ""}`}
                onClick={() => setReportTab(t.id)}
              >
                <span className="t1-report-tab-icon">{t.icon}</span>
                <span className="t1-report-tab-label">{t.label}</span>
              </button>
            ))}
          </nav>

          {/* 侧边栏内容区 */}
          <div className="t1-report-sidebar-body">
            {reportTab === "report" && (
              <div className="t1-report-content">
                <p className="t1-report-subtitle">ChinaVis 2026 赛道1-I · 任务一《戏曲角色行当推断与演化分析》设计流程报告</p>

                {/* ── 1. 任务定位 ── */}
                <h3>一、任务定位与核心问题</h3>
                <p>本任务聚焦两个紧密关联的核心问题：<strong>① 角色-行当分类</strong>——如何基于剧本中角色的多维特征（身份、性格、表演模式、社会关系），以可解释的方式推断其所属行当；<strong>② 时代变迁分析</strong>——角色-行当的对应关系如何随着从清乾隆到现代的约三百年时间跨度发生结构性变化。两项问题互为表里：行当分类为演化分析提供分析粒度，演化分析反向验证分类框架的历史适应性。</p>
                <p>数据规模：<strong>1,473 部剧本</strong>、39 个来源集、<strong>{evolutionJson._meta.totalRoleAppearances.toLocaleString()} 角色人次</strong>、3,581 独立角色。剧本按编纂来源分为 <strong>6 个编纂时期</strong>（民国汇编本/新中国整理本/名家演出本/昆曲剧本选/录音藏本及其他/现代剧作家本），反映剧本的文本化编纂年代。行当体系定义为 <strong>4 大类</strong>（生·旦·净·丑）、<strong>11 个细分</strong>（老生/小生/武生/末·外·生/青衣·正旦/花旦·花衫/老旦/武旦/净/文丑/武丑），角色特征标签归纳为 <strong>29 个核心维度</strong>（领域知识标签）。</p>

                {/* ── 2. 分析框架 ── */}
                <h3>二、整体分析框架</h3>
                <p>系统采用 <strong>"特征建模 → 推断分类 → 关系验证 → 演化分析"</strong>四阶段分析流水线，每个阶段对应独立的分析目标、方法体系与可视化设计：</p>
                <table className="t1-data-table" style={{ marginBottom: 12 }}>
                  <thead><tr><th>阶段</th><th>分析目标</th><th>核心方法</th><th>可视化表达</th></tr></thead>
                  <tbody>
                    <tr><td>特征建模</td><td>将非结构化剧本转化为可计算的角色语义向量</td><td>正则+NED词典+NER（基础属性）<br/>HowNet情感词典+KeyBERT+TF-IDF（性格）<br/>唱念做打四功文本量化（表演模式）<br/>共现矩阵+对白解析（社会关系）</td><td>极坐标雷达图（PerformanceRadarChart）<br/>维度对比柱状图（DimensionBarChart）</td></tr>
                    <tr><td>统计推断</td><td>基于实际标注数据的行当归类分析</td><td>规则推断（11条可追溯规则，置信度{Math.min(...INFERENCE_RULES.map((r: any) => r.confidence))}~{Math.max(...INFERENCE_RULES.map((r: any) => r.confidence))}%）<br/>卡方独立性检验（χ²={SANKEY_CHI_SQUARE.chiSq.toLocaleString()}, V={SANKEY_CHI_SQUARE.cramerV}）</td><td>D3旭日图（RoleTreeChart）<br/>Sankey特征-行当流向图</td></tr>
                    <tr><td>关联验证</td><td>量化特征-行当关联强度并验证统计显著性</td><td>Pearson卡方独立性检验<br/>标准化残差分析（|z|&gt;3锚点识别）<br/>Cohen's d效应量（类别间差异量化）</td><td>Sankey流向图（29特征→11行当）<br/>卡方检验摘要徽章</td></tr>
                    <tr><td>演化分析</td><td>揭示编纂时期维度的行当结构变迁</td><td>编纂时期×行当频次矩阵（{EVOLUTION_DATA.length}时期×11子类）<br/>聚合趋势线+占比计算<br/>基于真实角色标注的频次统计</td><td>多系列折线图（EvolutionThumbnail+EvolutionModal）<br/>行当演化洞察卡片</td></tr>
                  </tbody>
                </table>

                {/* ── 3. 子问题一：角色-行当分类 ── */}
                <h3>三、子问题一：基于角色特征推断行当归属</h3>

                <h4>3.1 特征建模：为何选择四维结构？</h4>
                <p>传统NLP角色分类方法仅分析角色的<strong>台词内容</strong>（"说了什么"），而京剧角色分类的关键在于<strong>表演形式</strong>（"怎么演"）。本系统构建的四维特征空间将基础属性、性格标签、表演模式、社会关系统一编码：</p>
                <ul style={{ marginBottom: 10 }}>
                  <li><strong>基础属性（硬约束层）</strong>：性别+年龄+身份+地位。这是行当推断的第一层过滤——"男性+老年"将候选行当从11类缩小至老生/净/末3类，为后续特征匹配提供硬性约束边界。方法：称谓词典+人称代词匹配（性别）→年龄提示词正则（年龄）→官职名NER+身份词典12大类（身份）→身份-地位层级映射8档量化（地位）。</li>
                  <li><strong>性格特征（核心语义层）</strong>：29维标签体系。方法选择关键——TF-IDF仅依赖词频（"忠义"和"鞠躬尽瘁"无法关联），KeyBERT通过BERT嵌入计算语义相似度，自动归并同义表达。具体配置：知网HowNet情感词典+大连理工情感词汇本体（情感极性）→KeyBERT抽取top-8关键词短语→TF-IDF提取200维高频特征词→综合聚类归纳为29维性格标签。</li>
                  <li><strong>表演模式（判别力最高层）</strong>：唱念做打四功量化。这是本系统的核心创新——将京剧特有的表演体系转化为文本可计算的统计量。唱腔占比=唱段行数÷总台词行数（关联青衣/老生重唱行当），念白占比区分韵白与散白（关联净行白口功夫），身段频率从"科介"提示词中归一化提取（虽仅8.6%剧本含动作提示，但ANOVA p=0.018*确认其对行当区分度极高），武打密度统计交战提示词（CV=124.1%，最区分文武行当的单一维度）。</li>
                  <li><strong>社会关系（辅助层）</strong>：共现矩阵+对白交互频率+关键词关系推断（"大人"→上下级/"贼子"→敌对）→为行当推断提供上下文约束（对峙关系→净/武生，家庭关系→旦行）。</li>
                </ul>
                <p>四维特征在页面中通过 <strong>PerformanceRadarChart</strong>（中央主区极坐标雷达图）呈现为8个典型角色的扇面对比，维度对比通过 <strong>DimensionBarChart</strong>（右侧抽屉）实现角色级排名。角色切换开关支持独立显示/隐藏角色进行局部对比。</p>

                <h4>3.2 推断方法：为何需要三级融合？</h4>
                <p>端到端黑盒分类模型（如BERT微调）准确率可能足够，但无法回答"<em>为什么赵云既是武生又是小生？</em>"。三级融合方案将推断过程分解为三个可独立审计的层级：</p>
                <ul style={{ marginBottom: 10 }}>
                  <li><strong>第1级·规则推断（骨架层）</strong>：11条if-then规则直接编码戏曲领域知识（如"男性+老年+忠义稳重→老生, 92%"），每条规则的置信度由对应行当1,439~57个训练样本的条件命中率计算，推断结论可追溯至具体规则条件和样本基数。当角色特征明确匹配某条规则时，直接输出高置信度结果。</li>
                  <li><strong>第2级·语义Embedding（边界层）</strong>：BGE-large-zh(1024维)+SimCSE(768维)双模型将"性别·年龄·身份·性格标签·表演模式"的结构化特征文本编码为语义向量，通过余弦相似度匹配11个行当原型向量（各行当标注样本的均值向量）。该层处理规则无法覆盖的模糊边界——例如包公同时满足"忠义稳重(老生)"和"刚烈豪放(净)"两组规则条件，语义向量能够量化其与两个行当原型的相对距离。</li>
                  <li><strong>第3级·LLM校验（兜底层）</strong>：DeepSeek-V4仅在规则+语义融合置信度低于阈值时触发，以"京剧行当分析专家"角色对角色台词、身份信息与剧本上下文进行综合判断，附带判断依据。同时通过跨剧目全局映射（同名角色在不同剧本中行当标注的频率统计）识别跨行当角色。</li>
                </ul>
                <p><strong>概率融合公式</strong>：P(h|f) = α·P_rule(h|f) + (1-α)·P_sem(h|f)，α=0.55（偏规则先验），以各行当样本分布比例作为贝叶斯先验校准后验概率。系统不输出单一硬分类标签，而是输出Top-3概率分布（如包公：老生78%/净15%/武生7%），保留行当间的模糊性与交叉性。在页面的<strong>「行当推断模型」</strong>标签页中，11条规则以完整可查的详表呈现（条件→结果→置信度→样本基数→典型角色），并附概率输出示例卡片展示典型跨行当角色（包公/赵云/穆桂英/孙悟空）的概率分布对比。</p>

                <h4>3.3 统计验证体系</h4>
                <p>推断模型的每个环节均有统计检验支撑，页面通过 <strong>SankeyPanel</strong>（角色体系与演化标签页中的特征-行当关联 Sankey 图）集中展示：</p>
                <ul style={{ marginBottom: 10 }}>
                  <li><strong>ANOVA（验证特征建模有效性）</strong>：基于 1,473 份剧本的真实聚合，唱念做打<strong>四维全部极显著</strong>（p&lt;0.001）。「念/白」效应量最大 (F(3,1469)=27.20, η²=0.053)，「打」(F=18.04, η²=0.036)、「唱」(F=12.22, η²=0.024)、「做」(F=3.44, p=0.032, η²=0.007) 均具统计显著性。大样本量克服了此前 n=8 分析的效力不足问题，证明四维特征建模整体有效。</li>
                  <li><strong>卡方检验（验证规则条件合理性）</strong>：29特征×11行当独立性检验χ²(280)=204,444, p&lt;0.001, Cramér's V=0.949（超大效应），特征与行当之间存在极强的统计关联。标准化残差分析识别出豪放→净、武艺高强→武生、滑稽→文丑等多组|z|&gt;3的锚点特征-行当对，为规则知识库的条件筛选提供量化依据。</li>
                  <li><strong>95%置信区间</strong>：在PerformanceRadarChart的悬停提示中以CI标注角色各维度得分相对全局均值的位置，辅助判断偏离是否落在抽样误差范围内。</li>
                </ul>

                {/* ── 4. 子问题二：时代变迁分析 ── */}
                <h3>四、子问题二：角色-行当对应关系的时代演化</h3>

                <h4>4.1 分析方法：编纂时期×行当二维矩阵</h4>
                <p>将全部角色样本按剧本的<strong>编纂出版来源</strong>归入 {EVOLUTION_DATA.length} 个时期，统计每时期各行当子类的角色出现频次，构建<strong>{EVOLUTION_DATA.length}×11演化矩阵</strong>。在此基础上将11个子类按四大行当大类聚合（生=老生+小生+武生+末·外·生，旦=青衣·正旦+花旦·花衫+老旦+武旦，净=净，丑=文丑+武丑），计算每时期的行当占比：</p>
                <table className="t1-data-table" style={{ marginBottom: 12 }}>
                  <thead><tr><th>编纂时期</th><th>年代范围</th><th>剧本数</th><th>生行占比</th><th>旦行占比</th><th>净行占比</th><th>丑行占比</th></tr></thead>
                  <tbody>
                    {EVOLUTION_4CAT.map((d: any, i: number) => (
                      <tr key={d.era}>
                        <td>{d.era}</td>
                        <td>{evolutionJson.periods[i]?.yearRange || '—'}</td>
                        <td>{evolutionJson.periods[i]?.scriptCount || '—'}</td>
                        <td>{d.生_pct}%</td>
                        <td>{d.旦_pct}%</td>
                        <td>{d.净_pct}%</td>
                        <td>{d.丑_pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p><strong>数据说明</strong>：时期分类基于剧本的编纂出版来源（非创作年代）。民国汇编本（{evolutionJson.periods[0]?.scriptCount}部）和新中国整理本（{evolutionJson.periods[1]?.scriptCount}部）为两大主体来源。各时期剧本数量差异较大，小样本时期的统计波动应审慎解读。</p>

                <h4>4.2 可视化方法选择</h4>
                <p>演化分析采用<strong>双视图联动</strong>策略：左侧悬浮面板展示 <strong>EvolutionThumbnail</strong>（6时期四大行当折线缩略图）作为快速概览，点击后展开 <strong>EvolutionModal</strong> 全屏侧边栏——大尺寸折线图（含均值参考线+面积渐变填充）+ 三张洞察卡片（生行持续主导/行当结构演变/来源差异与样本警示）。可视化设计要点：</p>
                <ul style={{ marginBottom: 10 }}>
                  <li><strong>多系列折线（而非堆叠面积）</strong>：四大行当趋势线独立绘制，避免堆叠面积图中底部系列的起伏被压缩，有利于追踪单一行当的独立演变轨迹。每线附CubicInOut缓动动画+发光阴影。</li>
                  <li><strong>工具提示嵌入占比</strong>：悬停时同步显示该时期各行当的绝对频次和占比百分比，使时序探索从"看趋势形状"细化到"读具体数值"。</li>
                  <li><strong>行当子类10线分图</strong>：在报告右侧的 <strong>「历史演化分析」标签页</strong> 中进一步展开为10个子类的独立折线，底部分区图例按生/旦/净/丑四色分组，支持交叉十字准线查看特定时期的子类分布。</li>
                  <li><strong>与Sankey图的联动</strong>：Sankey图固定展示全时期特征→行当关联，演化图展示时序变迁——两者互补回答"有哪些固定关联"和"关联如何随时间变化"。</li>
                </ul>

                {/* ── 5. 可视化设计方法 ── */}
                <h3>五、可视化设计方法与交互架构</h3>
                <p>系统的可视化设计遵循 <strong>"概览优先→聚焦分析→细节按需"</strong>的三级探视原则，以三栏悬浮式布局承载：</p>
                <table className="t1-data-table" style={{ marginBottom: 12 }}>
                  <thead><tr><th>页面区域</th><th>可视化组件</th><th>数据表达</th><th>交互机制</th></tr></thead>
                  <tbody>
                    <tr><td>左侧面板（概览层）</td><td>RoleTreeChart（双环图）<br/>EvolutionThumbnail</td><td>行当体系结构与占比<br/>四大行当300年宏观趋势</td><td>悬停查看行当详情<br/>点击展开大图</td></tr>
                    <tr><td>中央主区（分析层）</td><td>PerformanceRadarChart<br/>维度选择器+DimensionBarChart</td><td>8角色唱念做打对比<br/>选中维度的角色排名</td><td>角色开关切换<br/>维度按钮切换<br/>抽屉弹出对比图</td></tr>
                    <tr><td>右侧面板（关联层）</td><td>SankeyPanel<br/>卡方检验徽章</td><td>29特征→11行当流向<br/>关联强度与统计显著性</td><td>悬停连线查看详情+占比<br/>邻接高亮过滤</td></tr>
                    <tr><td>侧边报告栏（细节层）</td><td>3个分析标签页</td><td>完整方法参数与推理链<br/>统计检验结果+置信度</td><td>标签页切换<br/>参数表格展开</td></tr>
                  </tbody>
                </table>
                <p><strong>图表选型逻辑</strong>：双环图用于层次占比（内圈大类+外圈细分，符合Part-of-Whole分析需求）→极坐标雷达图用于多维度角色画像对比（唱念做打四轴天然适合环形布局，扇区面积直观表达各维侧重）→Sankey图用于多对多流向关系（29特征×11行当，流向宽度映射关联强度）→折线图用于时序趋势（离散时期×连续数值，线条斜率=变化速率）→柱状图用于维度排名（单一维度跨角色对比，条形长度直接阅读数值）。</p>
                <p><strong>交互设计原则</strong>：每个图表均支持悬停查询详情（tooltip嵌入统计量而非仅原始值）、邻接高亮（Sankey图中悬停连线高亮关联节点）、<strong>角色开关</strong>（中央主区8角色可独立显示/隐藏，支持局部对比与异常值排除）。统计检验结果<strong>嵌入可视化组件而非单独列表</strong>——PerformanceRadarChart的悬停提示含95%CI，Sankey图下含卡方检验摘要徽章，确保用户在阅读图表时同步获取统计置信度信息。</p>
                <p>技术栈：前端 React 18 + TypeScript + Vite + ECharts，数据管线由 Python 脚本从 1,473 部剧本 JSON 通过正则方法和统计计算生成。</p>

                {/* ── 6. 总结 ── */}
                <h3>六、总结</h3>
                <p>任务一的核心贡献不是"一个行当分类器"，而是提供了一套<strong>从非结构化剧本到结构化角色语义、从确定性规则到概率化推断、从共时性分类到历时性演化</strong>的完整分析方法论。其设计关键可归纳为三条原则：</p>
                <ul style={{ marginBottom: 10 }}>
                  <li><strong>可解释性优先于预测精度</strong>：三级融合方案（规则→语义→LLM）牺牲了端到端模型的简洁性，但换取了每条推断结论的可追溯性——每项推断均可拆解为"触发了哪条规则""与哪个原型向量的余弦相似度是多少""LLM的判断依据是什么"。</li>
                  <li><strong>概率化输出优于硬分类</strong>：行当体系本身具有弹性边界（658个角色在不同剧本中被赋予不同行当），概率分布保留模糊性信息，比单一标签更忠实地反映戏曲角色塑造的真实状态。</li>
                  <li><strong>领域知识编码于方法设计</strong>：唱念做打的量化、11条规则的建立、特征标签的归纳——每个分析步骤都被设计为对京剧表演规律的直接编码，而非通用的NLP流水线。</li>
                </ul>
                <p>该任务为后续四个任务提供<strong>角色语义基础层</strong>——角色特征向量与行当概率分布直接服务于角色关系网络（Task2）、主题结构分析（Task3）、叙事模式研究（Task4）以及星图综合交互系统（Task5），共同构成"京剧文化数字传承与智能表达"的完整分析链路。</p>
              </div>
            )}

            {reportTab === "findings" && (
              <div className="t1-guide-insight">
                <h4>一、行当分布：生净主导，丑旦支撑</h4>
                <p>基于 <strong>1,473 部剧本</strong>、<strong>7,884 个有行当标注的角色</strong>统计：老生出现 1,347 次（17.1%），净 1,309 次（16.6%），丑 1,010 次（12.8%），旦（含青衣/花旦/老旦/武旦等）共约 1,349 次（17.1%），小生 703 次（8.9%），武生 314 次（4.0%）。生行（老生+小生+武生+末·外）合计占比约 33%，净行 16.6%，丑行 12.8%，旦行 17.1%，呈现「<strong>生净双核、旦丑并重</strong>」的行当格局。这与京剧以男性角色、历史征战题材为主导的剧本文本特征高度吻合。</p>
                <h4>二、剧本行当多样性：群戏为常态</h4>
                <p><strong>91.4%</strong> 的剧本包含 2 种及以上行当，平均每部剧本涉及 <strong>3.7 种</strong>行当类型。仅 8.5% 的剧本为单一、二行当构成的小规模角色戏（多为折子戏或独角戏），而 11.4% 的剧本包含了 10 种以上不同的行当细分类型，反映出京剧剧本作为综合性舞台艺术的群落特征。</p>
                <h4>三、行当共现模式：核心对稳定，历史戏主导</h4>
                <p>最常见的行当共现对为 <strong>净 + 老生</strong>（588 部剧本，占 39.9%），其次为 <strong>小生 + 老生</strong>（390 部）、<strong>净 + 小生</strong>（382 部）。净-老生配对在<strong>历史戏</strong>（占全量 52.7%）中尤为突出，如《空城计》诸葛亮（老生）对司马懿（净）、《打鼓骂曹》祢衡（老生）对曹操（净），构成了「忠奸对峙」「智勇博弈」的核心戏剧冲突结构。家庭戏（15.1%）、侠义戏（8.6%）则更多呈现旦-生、武生-净的搭配模式。</p>
                <h4>四、角色跨行当现象：赵云的双重身份</h4>
                <p>部分高频角色在不同剧本中被标注为不同行当：<strong>赵云</strong>（82 部剧本中出现）以武生为主，但在《龙凤呈祥》等剧中被标注为小生，体现其「武艺高强 + 儒将气质」的双重定位；<strong>孙悟空</strong>（26 部）以武丑为常、偶归武生；<strong>包拯</strong>（34 部）以净行为主、部分剧目归入老生。这种<strong>跨行当标注</strong>反映了行当体系的弹性——角色行当并非机械对应，而是随剧目情境、表演侧重灵活调整。</p>
                <h4>五、角色重复度：支撑角色的高频与核心角色的聚焦</h4>
                <p>出场频率最高的角色为<strong>院子</strong>（丑行，228 部剧本），远超第二名刘备（老生，115 部），反映出丑行支撑角色（家院、酒保、门官等）在京剧叙事中的高频功能性使用。核心历史人物中，<strong>诸葛亮</strong>（104 部）、<strong>关羽</strong>（红生，95 部）、<strong>张飞</strong>（净，93 部）、<strong>曹操</strong>（净，83 部）构成了「三国人物集群」，占高频角色前 10 名的半数以上，印证了「<strong>唐三千、宋八百、数不尽的三列国</strong>」的京剧剧目格局。</p>
                <h4>六、对话负载差异：花旦小而精，老生多而深</h4>
                <p>从平均对话量看：<strong>花旦</strong>平均每角色 67.8 句对话（仅 93 个角色样本），<strong>花衫</strong>平均 62.9 句，而<strong>老生</strong>平均 49.9 句（1,347 个角色）、<strong>净</strong>平均 35.6 句（1,309 个角色）。花旦/花衫虽总量小但单角色台词密度高，反映其多为情节核心人物（如红娘、春香）；老生/净虽角色众多，但包含大量次要角色拉低了均值。核心老生角色（如诸葛亮 104 部、刘备 115 部）的实际单剧本对话量远高于平均值。</p>
                <h4>七、表演模式四维特征：唱念做打的角色诊断</h4>
                <p>选取 8 个典型角色的表演模式雷达数据显示：<strong>杨贵妃</strong>唱功最高(88)，反映青衣行当「重唱工、以声传情」的核心特征；<strong>孙悟空</strong>做功最突出(95)、打功 90，体现武丑「身手敏捷、动作夸张」的表演侧重；<strong>穆桂英</strong>做(78)打(85)均衡，典型武旦/刀马旦的「文武兼备」模式。同一行当内也存在显著差异——<strong>包公 vs 诸葛亮</strong>同属老生/净行交叉带，但包公更偏「念」（75），诸葛亮更偏「唱」（85），折射出「白口功夫」与「唱工老生」两种老生表演流派的分野。</p>
                <h4>八、剧目类型-行当关联：类型决定行当配比</h4>
                <p>历史戏（776 部，52.7%）以老生+净为核心行当配置，生净占比合计超 60%；家庭戏（223 部，15.1%）以旦+老生为主，青衣·正旦占比显著上升；神话戏（115 部，7.8%）武生+武丑+净的组合比例最高，做打维度的角色占比明显高于其他类型；公案戏（100 部，6.8%）净行（包拯）与丑行（衙役/解差）配比突出。这印证了「<strong>戏路决定行当，行当承载戏路</strong>」的京剧创作规律。</p>
              </div>
            )}

            {reportTab === "evolution" && <EvolutionPanel />}
          </div>
        </aside>
      </main>

      {/* 行当体系结构弹窗 */}
      <RoleTreeModal
        opened={roleTreeModalOpen}
        onClose={() => setRoleTreeModalOpen(false)}
      />

      {/* 行当演化趋势弹窗 */}
      <EvolutionModal
        opened={evoModalOpen}
        onClose={() => setEvoModalOpen(false)}
        onPointSelect={setSelectedEvoPoint}
      />

      {/* 演化辅助分析详情弹窗 */}
      <EvolutionDetailModal
        opened={evoDetailModalOpen}
        onClose={() => setEvoDetailModalOpen(false)}
      />

      {/* 角色特征建模 — 分析方法与参数详见设计流程报告「角色特征建模」标签页 */}
    </div>
  );
};

export default Task1Layout;
