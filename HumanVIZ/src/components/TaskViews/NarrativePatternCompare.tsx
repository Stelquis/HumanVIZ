/**
 * NarrativePatternCompare.tsx — 叙事模式匹配对比卡片
 *
 * 计算当前剧目与 8 种叙事模式的相似度，以横向条形图展示，
 * 帮助理解该剧目的叙事结构特征与各典型模式的匹配程度。
 *
 * 相似度基于多维特征距离计算：
 *   - 场次数 (sceneCount)
 *   - 角色数 (charCount)
 *   - 角色密度 (avgCharsPerScene)
 *   - 冲突范围 (conflictRange)
 *   - 情感波动 (sentimentVolatility)
 *   - 高潮位置 (peakPosition)
 */
import React, { useMemo, useRef, useEffect, useState } from "react";
import * as echarts from "echarts";
import narrativeBaselinesRaw from "../../data/narrative-baselines.json";
import type { StoryFingerprint } from "../../utils/storyRibbonCore";
import { NARRATIVE_PATTERNS } from "../../types/task4Types";

interface NarrativePatternCompareProps {
  fingerprint: StoryFingerprint | null;
}

interface PatternScore {
  type: string;
  color: string;
  score: number;     // 0-100
  description: string;
  matchDetails: string[];
}

/** Baseline profile shape from narrative-baselines.json */
interface BaselineProfile {
  count: number;
  pct: number;
  color: string;
  description: string;
  avgSceneCount: number;
  avgCharCount: number;
  avgDensity: number;
  avgCentralization: number;
  avgClustering: number;
  avgSingingRatio: number;
  avgRecitingRatio: number;
  avgFightingRatio: number;
}

const BASELINES = (narrativeBaselinesRaw as any).narrTypes?.profiles || {} as Record<string, BaselineProfile>;

/**
 * 计算当前指纹与各叙事模式的匹配得分
 *
 * 使用 6 个维度计算归一化欧氏距离：
 *   1. 场次规模  — sceneCount vs avgSceneCount
 *   2. 角色规模  — charCount vs avgCharCount
 *   3. 角色密度  — avgCharsPerScene vs avgDensity
 *   4. 冲突幅度  — conflictRange (对比模式特征)
 *   5. 情感波动  — sentimentVolatility
 *   6. 高潮位序  — peakPosition (对比模式特征)
 *
 * 每维度归一化到 [0,1] 后计算绝对差，取平均后转为 0-100 得分。
 */
function computePatternScores(fp: StoryFingerprint): PatternScore[] {
  const patternMeta = new Map(NARRATIVE_PATTERNS.map(p => [p.type, p]));

  // --- 归一化参考值 ---
  const MAX_SCENE = 50;       // 场次上限
  const MAX_CHAR = 60;        // 角色数上限
  const MAX_DENSITY = 1.2;    // 密度上限
  const MAX_CONFLICT_RANGE = 1.0;
  const MAX_SENTIMENT_VOL = 1.0;

  const scores: PatternScore[] = [];

  for (const [typeName, profile] of Object.entries(BASELINES) as [string, BaselineProfile][]) {
    const meta = patternMeta.get(typeName);
    const color = meta?.color || profile.color || "#b8926a";

    // Normalize actual and baseline values
    const dims: { actual: number; baseline: number }[] = [
      { actual: fp.sceneCount / MAX_SCENE,        baseline: profile.avgSceneCount / MAX_SCENE },
      { actual: fp.charCount / MAX_CHAR,           baseline: profile.avgCharCount / MAX_CHAR },
      { actual: fp.avgCharsPerScene / MAX_DENSITY, baseline: profile.avgDensity / MAX_DENSITY },
      { actual: fp.conflictRange / MAX_CONFLICT_RANGE, baseline: estimateConflictRangeBaseline(typeName) },
      { actual: fp.sentimentVolatility / MAX_SENTIMENT_VOL, baseline: estimateSentimentVolBaseline(typeName) },
      { actual: fp.peakPosition,                   baseline: estimatePeakBaseline(typeName) },
    ];

    let totalDist = 0;
    for (const d of dims) {
      totalDist += Math.abs(d.actual - d.baseline);
    }
    const avgDist = totalDist / dims.length;
    const score = Math.max(5, Math.round((1 - avgDist) * 100));

    // Generate match detail hints
    const details: string[] = [];
    if (Math.abs(fp.sceneCount - profile.avgSceneCount) <= 3) details.push("场次规模匹配");
    if (Math.abs(fp.avgCharsPerScene - profile.avgDensity) < 0.15) details.push("角色密度接近");
    if (score >= 70) details.push("综合高匹配");

    scores.push({
      type: typeName,
      color,
      score,
      description: meta?.description?.slice(0, 40) || profile.description || "",
      matchDetails: details.length > 0 ? details : ["结构差异较大"],
    });
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);
  return scores;
}

/** 根据模式类型估算冲突幅度的基线值 */
function estimateConflictRangeBaseline(typeName: string): number {
  switch (typeName) {
    case "史诗铺陈式": return 0.55;
    case "悬念突转式": return 0.65;
    case "情感波浪式": return 0.50;
    case "双线交织式": return 0.45;
    default: return 0.40;
  }
}

/** 根据模式类型估算情感波动的基线值 */
function estimateSentimentVolBaseline(typeName: string): number {
  switch (typeName) {
    case "情感波浪式": return 0.55;
    case "悬念突转式": return 0.45;
    case "史诗铺陈式": return 0.40;
    default: return 0.30;
  }
}

/** 根据模式类型估算高潮位置的基线值 */
function estimatePeakBaseline(typeName: string): number {
  switch (typeName) {
    case "悬念突转式": return 0.75;   // 高潮靠后，突然反转
    case "史诗铺陈式": return 0.55;   // 中间偏后
    case "三叠反复式": return 0.85;   // 多次重复后终局高潮
    case "回环照应式": return 0.50;   // 环形对称
    case "线性渐进式": return 0.70;   // 稳步爬升到终局
    default: return 0.60;
  }
}

const NarrativePatternCompare: React.FC<NarrativePatternCompareProps> = ({ fingerprint }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const [hoveredPattern, setHoveredPattern] = useState<string | null>(null);

  const patternScores = useMemo(() => {
    if (!fingerprint) return [];
    return computePatternScores(fingerprint);
  }, [fingerprint]);

  useEffect(() => {
    if (!chartRef.current || patternScores.length === 0) return;
    let chart: echarts.ECharts | null = null;
    try {
      const existing = echarts.getInstanceByDom(chartRef.current);
      if (existing) existing.dispose();
      chart = echarts.init(chartRef.current);

      // Reverse for horizontal bar (bottom = highest score)
      const data = [...patternScores].reverse();

      chart.setOption({
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          backgroundColor: "rgba(255,255,255,0.94)",
          borderColor: "rgba(150,84,77,0.2)",
          borderWidth: 1,
          borderRadius: 10,
          padding: [10, 14],
          textStyle: { fontSize: 12, color: "#5E4B3A" },
          formatter: (params: any) => {
            const item = Array.isArray(params) ? params[0] : params;
            if (!item) return "";
            const d = patternScores.find(s => s.type === item.name);
            const details = d?.matchDetails?.join(" · ") || "";
            return `<b>${item.name}</b><br/>
              匹配度：<b style="color:${d?.color || '#b8926a'}">${item.value}%</b><br/>
              <span style="font-size:10px;color:#8E8A84">${d?.description || ""}</span><br/>
              <span style="font-size:10px;color:#96544D">${details}</span>`;
          },
        },
        grid: { left: 90, right: 40, top: 8, bottom: 4 },
        xAxis: {
          type: "value",
          max: 100,
          min: 0,
          axisLabel: { fontSize: 9, color: "#8E8A84", formatter: "{value}%" },
          axisLine: { lineStyle: { color: "rgba(94,107,118,0.12)" } },
          splitLine: { lineStyle: { color: "rgba(94,107,118,0.05)" } },
        },
        yAxis: {
          type: "category",
          data: data.map(d => d.type),
          axisLabel: { fontSize: 10, fontWeight: 600, color: "#5E4B3A" },
          axisLine: { show: false },
          axisTick: { show: false },
          inverse: false,
        },
        series: [{
          type: "bar",
          data: data.map(d => ({
            name: d.type,
            value: d.score,
            itemStyle: {
              color: d.color,
              borderRadius: [0, 4, 4, 0],
              opacity: hoveredPattern && hoveredPattern !== d.type ? 0.3 : 0.85,
            },
          })),
          barWidth: 14,
          emphasis: {
            itemStyle: { opacity: 1, shadowBlur: 8, shadowColor: "rgba(0,0,0,0.15)" },
          },
          label: {
            show: true,
            position: "right",
            fontSize: 9,
            fontWeight: 700,
            color: "#5E4B3A",
            formatter: "{c}%",
          },
        }],
      });
    } catch (err) {
      console.error("NarrativePatternCompare chart init failed:", err);
    }
    const h = () => chart?.resize();
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("resize", h); chart?.dispose(); };
  }, [patternScores, hoveredPattern]);

  if (!fingerprint || patternScores.length === 0) {
    return (
      <div className="t4-pattern-compare-panel">
        <div className="t4-section-title-row">
          <span className="t4-section-icon">📊</span>
          <h3>叙事模式匹配</h3>
        </div>
        <p className="t4-empty-hint">请选择一个剧本以查看模式匹配</p>
      </div>
    );
  }

  const bestMatch = patternScores[0];

  return (
    <div className="t4-pattern-compare-panel">
      <div className="t4-section-title-row">
        <span className="t4-section-icon">📊</span>
        <h3>叙事模式匹配</h3>
        {bestMatch && (
          <span className="t4-pattern-best-badge" style={{ background: bestMatch.color }}>
            最佳: {bestMatch.type} {bestMatch.score}%
          </span>
        )}
      </div>
      <div
        ref={chartRef}
        className="t4-pattern-compare-chart"
        onMouseLeave={() => setHoveredPattern(null)}
      />
    </div>
  );
};

export { computePatternScores };
export default NarrativePatternCompare;
