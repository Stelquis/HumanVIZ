/* ============================================================
   task1-evolution-charts.ts — ECharts option factories for the
   Role Evolution tab (Task1). Extracted from Task1Layout.tsx
   to keep chart config separate from component logic.

   All functions return ECharts option objects.
   ============================================================ */

import * as echarts from "echarts";

// ── Type interfaces ──

export interface EnrichedPoint {
  era: string;
  n: number;
  生: number; 旦: number; 净: number; 丑: number;
  生_ciLow: number; 生_ciHigh: number;
  旦_ciLow: number; 旦_ciHigh: number;
  净_ciLow: number; 净_ciHigh: number;
  丑_ciLow: number; 丑_ciHigh: number;
}

export interface TrendResult {
  cagr: number;
  mannKendall: { S: number; p: number; trend: string; tau: number };
  linearRegression: { slope: number; intercept: number; r2: number };
}

export interface GrowthMatrixItem {
  era: string;
  growth: Record<string, number>;
}

export interface EntropyItem {
  era: string;
  entropy: number;
  entropyNorm: number;
}

export interface ColorMap {
  [key: string]: string;
}

/** 每(时期, 行当)数据点的个性化评述 */
export interface PointCommentary {
  era: string;
  cat: string;
  text: string;
}

/** 每(时期, 行当)数据点的一句话概括性解释 */
export interface PointSummary {
  era: string;
  cat: string;
  summary: string;
}

/** era (shortLabel) → 时代背景文字 映射 */
export type EraContextMap = Record<string, string>;

// ── Evolution tab color palette ──

export const EVO_COLORS: ColorMap = {
  "生": "#b8926a",  // 琉璃金 (amber-gold, matches backend)
  "旦": "#96544d",  // 朱砂红 (vermillion, matches backend)
  "净": "#5e6b76",  // 石板灰 (slate, matches backend)
  "丑": "#7f968d",  // 云水青 (celadon, matches backend)
};

const EVO_CATS = ["生", "旦", "净", "丑"] as const;

// ── Helpers ──

function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

/* ================================================================
   1a. Point Commentary — per (era, cat) personalized analysis
   ================================================================ */

/** 为折线图中每个(时期, 行当)数据点生成简要个性化评述 */
export function buildEvolutionCommentary(
  points: EnrichedPoint[],
  cats: readonly string[],
  growthMatrix: GrowthMatrixItem[],
  trendAnalysis: Record<string, TrendResult>,
): PointCommentary[] {
  const result: PointCommentary[] = [];

  points.forEach((pt, idx) => {
    const era = pt.era;

    // 该时期四大行当占比排序
    const ranked = cats
      .map(c => ({ cat: c, val: (pt as any)[c] as number }))
      .sort((a, b) => b.val - a.val);

    const growthItem = growthMatrix.find(g => g.era === era);
    const isFirst = idx === 0;
    const isLast = idx === points.length - 1;

    cats.forEach(cat => {
      const val = (pt as any)[cat] as number;
      const ciLow = (pt as any)[`${cat}_ciLow`] as number;
      const ciHigh = (pt as any)[`${cat}_ciHigh`] as number;
      const ciWidth = ciHigh - ciLow;
      const rank = ranked.findIndex(r => r.cat === cat) + 1;
      const ta = trendAnalysis[cat];
      const slope = ta?.linearRegression?.slope || 0;
      const mkTrend = ta?.mannKendall?.trend || "≈";
      const growth = growthItem?.growth?.[cat];

      // 较前一期变化
      let prevChange: string | null = null;
      if (!isFirst) {
        const prevPt = points[idx - 1];
        const prevVal = (prevPt as any)[cat] as number;
        const diff = val - prevVal;
        prevChange =
          diff > 0.05
            ? `上升 ${diff.toFixed(1)}pp`
            : diff < -0.05
              ? `下降 ${Math.abs(diff).toFixed(1)}pp`
              : "基本持平";
      }

      const rankLabels = ["首位", "次位", "第三位", "末位"];
      const parts: string[] = [];

      // 1) 在四行当中的排位
      parts.push(`占比 ${val}%，在四行当中居${rankLabels[rank - 1]}`);

      // 2) 置信区间宽度
      if (ciWidth > 6) {
        parts.push(`置信区间较宽(±${(ciWidth / 2).toFixed(1)}pp)，该期样本占比估算存在一定不确定性`);
      }

      // 3) 较前一期变化
      if (prevChange) {
        parts.push(`较前一期${prevChange}`);
      }

      // 4) 相对基准增长率
      if (growth != null && Math.abs(growth) > 5) {
        parts.push(`相对基准期变化 ${growth > 0 ? "+" : ""}${growth}%`);
      }

      // 5) 整体趋势
      if (Math.abs(slope) > 0.3) {
        const trendDesc = slope > 0 ? "上升" : "下降";
        parts.push(
          `整体呈${trendDesc}趋势(${Math.abs(slope).toFixed(1)}pp/期)${
            mkTrend !== "≈" ? "，趋势具有统计显著性" : ""
          }`,
        );
      } else {
        parts.push("整体趋势平稳，无显著单调变化");
      }

      // 6) 时期语境
      if (isFirst) parts.push("该时期为整体系列的基准期");
      if (isLast) parts.push("该时期为数据集中最新期");

      result.push({ era, cat, text: parts.join("；") });
    });
  });

  return result;
}

/* ================================================================
   1b. Point Summary — per (era, cat) one-sentence explanation
       combining data analysis with era-specific context
   ================================================================ */

/** 为每个(时期, 行当)数据点生成一句话概括——结合数据分析与时代背景，解释该行当该阶段状态的成因 */
export function buildEvolutionSummary(
  points: EnrichedPoint[],
  cats: readonly string[],
  growthMatrix: GrowthMatrixItem[],
  trendAnalysis: Record<string, TrendResult>,
  eraContextMap: EraContextMap,
): PointSummary[] {
  const rankLabels = ["居首位", "位居次席", "列第三位", "排名末位"];
  // short era labels → source-evolution.json full name mapping
  const ERA_FULL: Record<string, string> = {
    "民国汇编": "民国汇编本",
    "新中国整理": "新中国整理本",
    "名家演出": "名家演出本",
    "昆曲传承": "昆曲剧本选",
    "录音藏本": "录音藏本及其他",
    "现代创作": "现代剧作家本",
  };

  return points.map((pt) => {
    const era = pt.era;
    const eraCtx = eraContextMap[ERA_FULL[era]] ?? "";

    // 该时期四大行当排序
    const ranked = cats
      .map(c => ({ cat: c, val: (pt as any)[c] as number }))
      .sort((a, b) => b.val - a.val);

    const isFirst = pt === points[0];
    const isLast = pt === points[points.length - 1];
    const growthItem = growthMatrix.find(g => g.era === era);

    return cats.map((cat): PointSummary => {
      const val = (pt as any)[cat] as number;
      const ciLow = (pt as any)[`${cat}_ciLow`] as number;
      const ciHigh = (pt as any)[`${cat}_ciHigh`] as number;
      const ciWidth = ciHigh - ciLow;
      const rank = ranked.findIndex(r => r.cat === cat) + 1;
      const ta = trendAnalysis[cat];
      const slope = ta?.linearRegression?.slope ?? 0;
      const mkTrend = ta?.mannKendall?.trend ?? "≈";
      const growth = growthItem?.growth?.[cat] ?? 0;

      // ── 构建一句话 ──
      const sentenceParts: string[] = [];

      // ① 时代背景起因
      if (eraCtx) {
        sentenceParts.push(eraCtx);
      }

      // ② 因此 → 该时期该行当的状态
      const rankPhrase = rankLabels[rank - 1];
      const ciNote = ciWidth > 6 && ciWidth < 15
        ? "（存在一定统计不确定性）"
        : ciWidth >= 15
          ? "（统计不确定性较大）"
          : "";
      const trendPhrase = Math.abs(slope) > 0.3
        ? `，整体呈${slope > 0 ? "上升" : "下降"}趋势（${Math.abs(slope).toFixed(1)}pp/期）${mkTrend !== "≈" ? "，趋势显著" : ""}`
        : "，整体走势相对平稳";
      const growthPhrase = Math.abs(growth) > 5
        ? `，较基准期${growth > 0 ? "+" : ""}${growth}%`
        : "";
      const periodPhrase = isFirst ? "（该时期为整体系列之基准期）" : isLast ? "（该时期为数据集中最新期）" : "";

      sentenceParts.push(
        `因此该时期${cat}行以${val}%的占比在四大行当中${rankPhrase}${ciNote}`,
        `${trendPhrase}${growthPhrase}${periodPhrase}。`,
      );

      return { era, cat, summary: sentenceParts.join("") };
    });
  }).flat();
}

/* ================================================================
   1. Main Evolution Chart — 4-category line chart with CI bands,
      trend lines, and historical annotations
   ================================================================ */

export function buildMainEvolutionOption(
  points: EnrichedPoint[],
  cats: readonly string[],
  colors: ColorMap,
  trends: Record<string, { slope: number; intercept: number; r2: number }>,
  eraYearRange: Record<string, string>,
  mannKendall?: Record<string, { trend: string; p: number; tau: number }>,
): any {
  const eras = points.map(d => d.era);
  const catsWithTrend = cats.filter(c => Math.abs(trends[c]?.slope ?? 0) > 0.3);

  // Direction suffix for legend
  const legendData = cats.map(cat => {
    const mk = mannKendall?.[cat];
    const dir = mk?.trend || "≈";
    return `${cat} ${dir}`;
  });

  const series: any[] = [];

  cats.forEach((cat, idx) => {
    // ── Main line ──
    series.push({
      name: cat,
      type: "line",
      data: points.map(d => (d as any)[cat]),
      symbol: "circle",
      symbolSize: 7,
      lineStyle: {
        width: 3,
        color: colors[cat],
        shadowBlur: 6,
        shadowColor: colors[cat],
      },
      itemStyle: {
        color: colors[cat],
        borderColor: "#fff",
        borderWidth: 1.5,
      },
      areaStyle: {
        opacity: 0.1,
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: colors[cat] },
          { offset: 1, color: "transparent" },
        ]),
      },
      emphasis: {
        focus: "series",
        symbolSize: 12,
        itemStyle: { shadowBlur: 16, shadowColor: colors[cat] },
      },
      animationDelay: idx * 350,
      // Average reference line (keep existing)
      markLine: {
        silent: true,
        symbol: "none",
        lineStyle: {
          color: "#8a939b",
          type: "dashed",
          width: 1,
          opacity: 0.35,
        },
        data: [{ type: "average", name: "均值" }],
        label: { show: false },
      },
    });

    // ── CI band (lower bound + width, stacked area) ──
    const lows = points.map(d => (d as any)[`${cat}_ciLow`] as number);
    const highs = points.map(d => (d as any)[`${cat}_ciHigh`] as number);
    const widths = highs.map((h, i) => h - lows[i]);

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
    series.push({
      name: `${cat}_ci`,
      type: "line",
      stack: `ci_${cat}`,
      data: widths,
      lineStyle: { opacity: 0 },
      areaStyle: { opacity: 0.15, color: colors[cat] },
      showSymbol: false,
      silent: true,
      tooltip: { show: false },
      emphasis: { disabled: true },
      legendHoverLink: false,
      animation: false,
    });

    // ── Linear trend line (dashed, shown only when |slope| > 0.3) ──
    if (Math.abs(trends[cat]?.slope ?? 0) > 0.3) {
      const trendData = points.map((_, i) =>
        r1(trends[cat].slope * i + trends[cat].intercept),
      );
      series.push({
        name: `${cat}_trend`,
        type: "line",
        data: trendData,
        showSymbol: false,
        lineStyle: {
          width: 1.5,
          type: "dashed",
          color: colors[cat],
          opacity: 0.55,
        },
        tooltip: { show: false },
        emphasis: { disabled: true },
        legendHoverLink: false,
        animation: false,
        z: 1,
      });
    }
  });

  // ── Historical event annotations (markLines) ──
  const eventMarkLines = [
    {
      xAxis: "民国汇编",
      label: { formatter: "起始期", color: "#8a939b", fontSize: 9 },
      lineStyle: { color: "#8a939b", type: "dotted", width: 0.8, opacity: 0.3 },
    },
    {
      xAxis: "现代创作",
      label: { formatter: "现代期", color: "#8a939b", fontSize: 9 },
      lineStyle: { color: "#8a939b", type: "dotted", width: 0.8, opacity: 0.3 },
    },
  ];

  // ── Tooltip (axis trigger — concise, no commentary) ──
  const tooltip = {
    trigger: "axis" as const,
    backgroundColor: "rgba(255,253,249,0.96)",
    borderColor: "rgba(184,155,109,0.35)",
    borderWidth: 1,
    padding: [10, 14],
    textStyle: {
      fontSize: 13,
      color: "#7a5e4e",
      fontFamily: "Noto Sans SC, sans-serif" as const,
    },
    formatter: (params: any) => {
      if (!Array.isArray(params) || params.length === 0) return "";
      const main = params.filter(
        (p: any) =>
          !p.seriesName.endsWith("_ci") && !p.seriesName.endsWith("_trend"),
      );
      const eraIdx = points.findIndex(d => d.era === params[0].axisValue);
      const pt = eraIdx >= 0 ? points[eraIdx] : null;
      let html = `<div style="font-size:14px;color:#3a2c21;font-weight:700">📜 ${params[0].axisValue}</div>`;
      if (pt) {
        html += `<div style="font-size:11px;color:#8a939b">n=${pt.n} 人次</div>`;
      }
      html += `<hr style="border:0;border-top:1px solid rgba(94,107,118,0.2);margin:6px 0">`;
      main.forEach((p: any) => {
        const cat = p.seriesName;
        const val = p.value;
        const ciLow = pt ? (pt as any)[`${cat}_ciLow`] : null;
        const ciHigh = pt ? (pt as any)[`${cat}_ciHigh`] : null;
        html += `<div style="line-height:1.6">${p.marker} <strong style="font-size:13px">${cat}行: ${val}%</strong>`;
        if (ciLow != null && ciHigh != null) {
          html += ` <span style="color:#8a939b;font-size:11px">[${ciLow}–${ciHigh}]</span>`;
        }
        html += `</div>`;
      });
      html += `<div style="font-size:11px;color:#8a939b;margin-top:4px;border-top:1px solid rgba(94,107,118,0.1);padding-top:4px">点击数据点查看详情 →</div>`;
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
      data: legendData,
      bottom: 0,
      textStyle: {
        fontSize: 13,
        color: "#7a5e4e",
        fontFamily: "Noto Sans SC, sans-serif" as const,
      },
      itemWidth: 18,
      itemHeight: 4,
      itemGap: 24,
    },
    grid: { left: 56, right: 48, top: 40, bottom: 60 },
    xAxis: {
      type: "category" as const,
      data: eras,
      boundaryGap: false,
      axisLine: { lineStyle: { color: "rgba(94,107,118,0.12)" } },
      axisTick: { show: false },
      axisLabel: {
        interval: 0,
        formatter: (value: string) =>
          `{name|${value}}\n{year|${eraYearRange[value] || ""}}`,
        rich: {
          name: {
            fontSize: 11,
            color: "#7a5e4e",
            fontFamily: "Noto Sans SC, sans-serif" as const,
          },
          year: {
            fontSize: 9,
            color: "#8a939b",
            fontFamily: "Noto Sans SC, sans-serif" as const,
          },
        },
      },
    },
    yAxis: {
      type: "value" as const,
      name: "占比 (%)",
      nameTextStyle: {
        fontSize: 12,
        color: "#8a939b",
        fontFamily: "Noto Sans SC, sans-serif" as const,
      },
      axisLabel: {
        fontSize: 12,
        color: "#8a939b",
        fontFamily: "Noto Sans SC, sans-serif" as const,
      },
      splitLine: {
        lineStyle: {
          color: "rgba(94,107,118,0.12)",
          type: "dashed" as const,
        },
      },
    },
    series,
  };
}

/* ================================================================
   2. Growth Rate Heatmap — period × category relative growth
   ================================================================ */

export function buildHeatmapOption(
  data: GrowthMatrixItem[],
  eras: string[],
  categories: readonly string[],
): any {
  const heatmapData: [number, number, number][] = [];
  data.forEach((d, eraIdx) => {
    categories.forEach((cat, catIdx) => {
      heatmapData.push([eraIdx, catIdx, d.growth[cat] ?? 0]);
    });
  });

  // Auto range from data
  const values = heatmapData.map(d => d[2]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const absMax = Math.max(Math.abs(min), Math.abs(max), 10);

  return {
    tooltip: {
      trigger: "item" as const,
      formatter: (p: any) => {
        const era = eras[p.value[0]];
        const cat = categories[p.value[1]];
        return `<strong>${era}</strong> · ${cat}行<br/>相对增长率: <strong>${p.value[2]}%</strong>`;
      },
    },
    grid: { left: 50, right: 30, top: 30, bottom: 80 },
    xAxis: {
      type: "category" as const,
      data: eras,
      axisLabel: { rotate: 30, fontSize: 11, color: "#7a5e4e" },
      axisLine: { lineStyle: { color: "rgba(94,107,118,0.12)" } },
    },
    yAxis: {
      type: "category" as const,
      data: categories.map(c => `${c}行`),
      axisLabel: { fontSize: 12, color: "#7a5e4e", fontWeight: 600 },
      axisLine: { lineStyle: { color: "rgba(94,107,118,0.12)" } },
    },
    visualMap: {
      min: -absMax,
      max: absMax,
      inRange: { color: ["#5e6b76", "#FAF8F5", "#b8926a"] },
      calculable: true,
      orient: "horizontal",
      bottom: 10,
      left: "center",
      itemWidth: 12,
      itemHeight: 100,
      textStyle: { fontSize: 10, color: "#8a939b" },
    },
    series: [
      {
        type: "heatmap",
        data: heatmapData,
        label: {
          show: true,
          formatter: (p: any) => `${p.value[2]}%`,
          fontSize: 11,
          fontWeight: 600,
          color: "#3a2c21",
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: "rgba(0,0,0,0.2)",
          },
        },
        itemStyle: { borderWidth: 2, borderColor: "#fff" },
      },
    ],
  };
}

/* ================================================================
   3. Shannon Entropy Chart — structure diversity over periods
   ================================================================ */

export function buildEntropyChartOption(
  data: EntropyItem[],
  eras: string[],
): any {
  const hMax = Math.log(4); // max entropy for 4 categories

  return {
    tooltip: {
      trigger: "axis" as const,
      formatter: (params: any) => {
        const p = params[0];
        return `<strong>${p.name}</strong><br/>Shannon熵: <strong>${p.value.toFixed(4)}</strong><br/>归一化: ${((p.value / hMax) * 100).toFixed(1)}%<br/>均衡度: ${p.value > hMax * 0.9 ? "较高" : p.value > hMax * 0.75 ? "中等" : "较低"}`;
      },
    },
    grid: { left: 55, right: 30, top: 30, bottom: 60 },
    xAxis: {
      type: "category" as const,
      data: eras,
      axisLabel: {
        rotate: 30,
        fontSize: 11,
        color: "#7a5e4e",
      },
      axisLine: { lineStyle: { color: "rgba(94,107,118,0.12)" } },
    },
    yAxis: {
      type: "value" as const,
      name: "Shannon熵 H",
      min: 0,
      max: Math.ceil(hMax * 100) / 100,
      nameTextStyle: { fontSize: 11, color: "#8a939b" },
      axisLabel: { fontSize: 11, color: "#8a939b" },
      splitLine: {
        lineStyle: { color: "rgba(94,107,118,0.12)", type: "dashed" as const },
      },
    },
    series: [
      {
        type: "line",
        data: data.map(d => d.entropy),
        symbol: "circle",
        symbolSize: 8,
        lineStyle: { width: 3, color: "#5e6b76" },
        itemStyle: { color: "#5e6b76" },
        areaStyle: { opacity: 0.1, color: "#5e6b76" },
        markLine: {
          silent: true,
          symbol: "none",
          data: [
            {
              yAxis: hMax,
              name: "最大熵(均匀分布)",
              lineStyle: { type: "dashed", color: "#8a939b", opacity: 0.4 },
              label: {
                formatter: "均匀分布 H=1.386",
                fontSize: 9,
                color: "#8a939b",
              },
            },
          ],
        },
      },
    ],
  };
}

/* ================================================================
   4. JSD Matrix Heatmap — period × period structural similarity
   ================================================================ */

export function buildJSDMatrixOption(
  matrix: number[][],
  eras: string[],
  mostSimilar?: { periodA: string; periodB: string; distance: number },
  mostDifferent?: { periodA: string; periodB: string; distance: number },
): any {
  const data: [number, number, number][] = [];
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i].length; j++) {
      data.push([j, i, matrix[i][j]]);
    }
  }

  const maxVal = Math.max(...data.map(d => d[2]), 0.01);

  return {
    tooltip: {
      trigger: "item" as const,
      formatter: (p: any) => {
        const pi = eras[p.value[0]];
        const pj = eras[p.value[1]];
        const dist = p.value[2];
        let note = "";
        if (
          mostSimilar &&
          ((pi === mostSimilar.periodA && pj === mostSimilar.periodB) ||
            (pi === mostSimilar.periodB && pj === mostSimilar.periodA))
        ) {
          note = " ★ 最相似";
        } else if (
          mostDifferent &&
          ((pi === mostDifferent.periodA && pj === mostDifferent.periodB) ||
            (pi === mostDifferent.periodB && pj === mostDifferent.periodA))
        ) {
          note = " ★ 最差异";
        }
        return `<strong>${pi}</strong> ↔ <strong>${pj}</strong><br/>JSD: <strong>${dist.toFixed(4)}</strong>${note}`;
      },
    },
    grid: { left: 80, right: 30, top: 30, bottom: 80 },
    xAxis: {
      type: "category" as const,
      data: eras,
      axisLabel: { rotate: 30, fontSize: 10, color: "#7a5e4e" },
      axisLine: { lineStyle: { color: "rgba(94,107,118,0.12)" } },
    },
    yAxis: {
      type: "category" as const,
      data: eras,
      axisLabel: { fontSize: 10, color: "#7a5e4e" },
      axisLine: { lineStyle: { color: "rgba(94,107,118,0.12)" } },
    },
    visualMap: {
      min: 0,
      max: maxVal,
      inRange: { color: ["#7f968d", "#FAF8F5", "#96544d"] },
      calculable: true,
      orient: "horizontal",
      bottom: 10,
      left: "center",
      itemWidth: 12,
      itemHeight: 100,
      textStyle: { fontSize: 10, color: "#8a939b" },
    },
    series: [
      {
        type: "heatmap",
        data,
        label: {
          show: true,
          formatter: (p: any) => p.value[2].toFixed(3),
          fontSize: 9,
          color: "#3a2c21",
        },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.2)" },
        },
        itemStyle: { borderWidth: 2, borderColor: "#fff" },
      },
    ],
  };
}

/* ================================================================
   5. Evolution Modal: Full-size with all auxiliary charts
   ================================================================ */

export function buildModalMainOption(
  points: EnrichedPoint[],
  cats: readonly string[],
  colors: ColorMap,
  trends: Record<string, { slope: number; intercept: number; r2: number }>,
  eraYearRange: Record<string, string>,
  mannKendall?: Record<string, { trend: string; p: number; tau: number }>,
): any {
  // Same as main evolution but larger grid + no animation for modal
  const base = buildMainEvolutionOption(
    points, cats, colors, trends, eraYearRange, mannKendall,
  );
  return {
    ...base,
    animation: false,
    grid: { left: 72, right: 60, top: 50, bottom: 70 },
  };
}
