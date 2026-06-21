import React, { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts";
import "./Task2Layout.scss";
import "./Task2Fingerprint.scss";
import { useTask2Store } from "../../stores/task2Store";
import { useTask2Data } from "../../hooks/useTask2Data";
import type { StructureLabel } from "../../types/task2";
import {
  DRAMA_TYPES,
  TYPE_COLORS,
  METRIC_LABELS,
  INK_DARK,
  INK_WARM,
  INK_SOFT,
  PAPER_BG,
  GOLD_NODE,
  FONT_SERIF,
  DEFAULT_STRUCTURE_COLORS,
} from "../../types/task2";

/* ================================================================
   Task2Fingerprint — Page 2: 类型拓扑指纹

   双联视图：
   - 冲积图：类型 → 结构标签 流向（精简，去代表剧目层）
   - Z-score 热力矩阵：各类型在各指标上的标准化偏差
   ================================================================ */

/** 指标名列表（过滤掉全为 0 的指标） */
function activeMetrics(data: any): string[] {
  const metrics = data.metric_order as string[];
  return metrics.filter((key) => {
    const allZero = DRAMA_TYPES.every(
      (t) => !data.type_means[t] || (data.type_means[t].metrics[key] ?? 0) === 0,
    );
    return !allZero;
  });
}

const Task2Fingerprint: React.FC = () => {
  const { selectedType } = useTask2Store();
  const { data } = useTask2Data(selectedType);

  const sankeyRef = useRef<HTMLDivElement>(null);
  const heatmapRef = useRef<HTMLDivElement>(null);

  const metrics = useMemo(() => activeMetrics(data as any), [data]);

  /* ==================================================================
     Chart 1 — 结构标签流向 Sankey (精简: 类型 → 结构标签)
     ================================================================== */
  useEffect(() => {
    if (!sankeyRef.current) return;
    const chart = echarts.init(sankeyRef.current);

    const structByType =
      ((data as any).structure_by_type as Record<string, Record<string, { pct: number }>>) || {};
    const structLabels = (data as any).structure_labels as StructureLabel[];
    const structColors =
      ((data as any).structure_colors as Record<string, string>) || DEFAULT_STRUCTURE_COLORS;
    const types = DRAMA_TYPES.filter((t) => structByType[t]);

    // 两层节点: Type (T:) → Structure Label (S:)
    const nodes: any[] = [];

    types.forEach((t) => {
      nodes.push({
        name: `T:${t}`,
        itemStyle: { color: TYPE_COLORS[t] || GOLD_NODE, borderColor: "rgba(255,255,255,0.5)", borderWidth: 1 },
        label: { show: true, formatter: t, fontSize: 12, fontWeight: 700, color: TYPE_COLORS[t] || GOLD_NODE, fontFamily: FONT_SERIF },
      });
    });

    structLabels.forEach((sl) => {
      nodes.push({
        name: `S:${sl}`,
        itemStyle: { color: structColors[sl] || "#a09080", borderColor: "rgba(255,255,255,0.5)", borderWidth: 1 },
        label: { show: true, formatter: sl, fontSize: 10, fontWeight: 600, color: structColors[sl] || INK_WARM, fontFamily: FONT_SERIF },
      });
    });

    // 仅 Type → Structure Label 的链接
    const links: { source: string; target: string; value: number }[] = [];
    types.forEach((t) => {
      const dist = structByType[t] || {};
      structLabels.forEach((sl) => {
        const pct = dist[sl]?.pct || 0;
        if (pct >= 1) {
          links.push({ source: `T:${t}`, target: `S:${sl}`, value: pct });
        }
      });
    });

    chart.setOption(
      {
        backgroundColor: PAPER_BG,
        tooltip: {
          trigger: "item",
          backgroundColor: "rgba(250,245,235,0.94)",
          borderColor: "rgba(160,130,100,0.45)",
          borderWidth: 1,
          textStyle: { color: INK_DARK, fontSize: 11, fontFamily: FONT_SERIF },
          formatter: (p: any) => {
            if (p.dataType === "edge") {
              const src = String(p.data.source).replace(/^[TS]:/, "");
              const tgt = String(p.data.target).replace(/^[TS]:/, "");
              return `${src} → ${tgt}<br/>占比: <b>${(p.data.value as number)}%</b>`;
            }
            const label = String(p.name).replace(/^[TS]:/, "");
            return `<b>${label}</b>`;
          },
        },
        series: [
          {
            type: "sankey",
            layout: "none",
            layoutIterations: 0,
            emphasis: { focus: "adjacency" },
            nodeAlign: "justify",
            nodeWidth: 16,
            nodeGap: 12,
            data: nodes,
            links: links.map((l) => ({
              source: l.source,
              target: l.target,
              value: l.value,
              lineStyle: { color: "gradient", curveness: 0.5, opacity: 0.15 },
            })),
          },
        ],
        animationDuration: 600,
      },
      true,
    );

    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("resize", h);
      chart.dispose();
    };
  }, [data]);

  /* ==================================================================
     Chart 2 — 指标偏差热力矩阵 (Z-score Heatmap)
     ================================================================== */
  useEffect(() => {
    if (!heatmapRef.current) return;
    const chart = echarts.init(heatmapRef.current);

    const types = DRAMA_TYPES.filter((t) => (data as any).type_means[t]);
    const hData: [number, number, number][] = [];

    const stats: Record<string, { mean: number; std: number }> = {};
    metrics.forEach((key) => {
      const vals = types.map((t) => (data as any).type_means[t]?.metrics[key] ?? 0);
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
      stats[key] = { mean, std: Math.sqrt(variance) || 1 };
    });

    types.forEach((t, ti) => {
      metrics.forEach((key, mi) => {
        const raw = (data as any).type_means[t]?.metrics[key] ?? 0;
        const z = (raw - stats[key].mean) / stats[key].std;
        hData.push([mi, ti, parseFloat(z.toFixed(2))]);
      });
    });

    const maxAbsZ = Math.max(...hData.map((d) => Math.abs(d[2])), 1);

    chart.setOption(
      {
        backgroundColor: PAPER_BG,
        tooltip: {
          backgroundColor: "rgba(250,245,235,0.94)",
          borderColor: "rgba(160,130,100,0.45)",
          borderWidth: 1,
          textStyle: { color: INK_DARK, fontSize: 11, fontFamily: FONT_SERIF },
          formatter: (p: any) => {
            const mKey = metrics[p.data[0]];
            const tName = types[p.data[1]];
            const z = p.data[2];
            const raw = (data as any).type_means[tName]?.metrics[mKey] ?? 0;
            return `<b>${tName}</b><br/>${METRIC_LABELS[mKey as keyof typeof METRIC_LABELS] || mKey}<br/>原始值: ${raw.toFixed(4)}<br/>Z-score: <b>${z > 0 ? "+" : ""}${z.toFixed(2)}</b>`;
          },
        },
        grid: { left: 70, right: 30, top: 8, bottom: 32 },
        xAxis: {
          type: "category",
          data: metrics.map((k) => METRIC_LABELS[k as keyof typeof METRIC_LABELS] || k),
          position: "top",
          axisLabel: { fontSize: 10, color: INK_WARM, fontWeight: 600, fontFamily: FONT_SERIF, rotate: 20 },
          axisLine: { show: false },
          axisTick: { show: false },
        },
        yAxis: {
          type: "category",
          data: types,
          axisLabel: { fontSize: 11, color: INK_SOFT, fontFamily: FONT_SERIF },
          axisLine: { show: false },
          axisTick: { show: false },
        },
        visualMap: {
          min: -maxAbsZ,
          max: maxAbsZ,
          orient: "horizontal",
          left: "center",
          bottom: 0,
          inRange: { color: ["#5e6b76", "#d4cfc4", PAPER_BG, "#e8ccb0", "#96544d"] },
          textStyle: { fontSize: 8, color: INK_SOFT, fontFamily: FONT_SERIF },
          itemWidth: 10,
          itemHeight: 80,
        },
        series: [
          {
            type: "heatmap",
            data: hData,
            label: {
              show: true,
              fontSize: 10,
              fontFamily: FONT_SERIF,
              formatter: (p: any) => {
                const z = p.data[2] as number;
                return z > 0 ? `+${z.toFixed(1)}` : z.toFixed(1);
              },
            },
            emphasis: { itemStyle: { shadowBlur: 8, shadowColor: "rgba(0,0,0,0.15)" } },
          },
        ],
        animationDuration: 400,
      },
      true,
    );

    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("resize", h);
      chart.dispose();
    };
  }, [data, metrics]);

  /* ==================================================================
     JSX
     ================================================================== */
  return (
    <div className="t2-screen">
      <div className="t2-fingerprint-grid">
        {/* 左: Sankey 冲积图 */}
        <div className="t2-fp-card t2-fp-sankey">
          <div className="t2-fp-card-header">
            <h3>结构标签流向 · 冲积图</h3>
            <span className="t2-fp-hint">类型 → 结构标签</span>
          </div>
          <div ref={sankeyRef} className="t2-fp-chart" />
        </div>

        {/* 右: Z-score 热力矩阵 */}
        <div className="t2-fp-card t2-fp-heatmap">
          <div className="t2-fp-card-header">
            <h3>指标偏差 · Z-score 热力矩阵</h3>
            <span className="t2-fp-hint">蓝=低于均值 · 棕=高于均值 | {metrics.length} 项指标</span>
          </div>
          <div ref={heatmapRef} className="t2-fp-chart" />
        </div>
      </div>
    </div>
  );
};

export default Task2Fingerprint;
