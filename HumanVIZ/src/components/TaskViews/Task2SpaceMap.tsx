import React, { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts";
import "./Task2Layout.scss";
import "./Task2SpaceMap.scss";
import { useTask2Store } from "../../stores/task2Store";
import { useTask2Data } from "../../hooks/useTask2Data";
import type { PCAPoint } from "../../types/task2";
import {
  DRAMA_TYPES,
  TYPE_COLORS,
  INK_DARK,
  INK_WARM,
  INK_SOFT,
  PAPER_BG,
  GOLD_NODE,
  FONT_SERIF,
} from "../../types/task2";
/* ================================================================
   Task2SpaceMap — Page 3: 结构空间地图
   增强 PCA 散点图：1473 部剧在结构空间中的分布
   ================================================================ */

/* ================================================================
   Main Component
   ================================================================ */
const Task2SpaceMap: React.FC = () => {
  const { selectedType } = useTask2Store();
  const { data } = useTask2Data(selectedType);

  const scatterRef = useRef<HTMLDivElement>(null);

  /* ── 数据 ── */
  const pcaPoints = useMemo(() => (data as any).pca_points as PCAPoint[], [data]);
  const centroids = useMemo(
    () => (data as any).pca_centroids as Record<string, { x: number; y: number; count: number }>,
    [data],
  );
  /* ── 离群点检测：最近质心非自身类型 ── */
  const outliers = useMemo(() => {
    const result = new Set<number>();
    pcaPoints.forEach((p) => {
      const ownCentroid = centroids[p.genre];
      if (!ownCentroid) return;
      const ownDist = Math.hypot(p.x - ownCentroid.x, p.y - ownCentroid.y);
      let minOtherDist = Infinity;
      DRAMA_TYPES.forEach((t) => {
        if (t === p.genre || !centroids[t]) return;
        const d = Math.hypot(p.x - centroids[t].x, p.y - centroids[t].y);
        if (d < minOtherDist) minOtherDist = d;
      });
      // 仅当离其他类型质心显著更近时才标记为离群
      if (ownDist > 0.04 && minOtherDist < ownDist * 0.5) result.add(p.entity_id);
    });
    return result;
  }, [pcaPoints, centroids]);

  /* ==================================================================
     Chart 1 — 增强 PCA 散点图
     ================================================================== */
  useEffect(() => {
    if (!scatterRef.current) return;
    const chart = echarts.init(scatterRef.current);

    // 主散点 series（按类型分组）
    const series: any[] = DRAMA_TYPES.map((t) => ({
      name: t,
      type: "scatter",
      data: pcaPoints
        .filter((p) => p.genre === t)
        .map((p) => ({
          value: [p.x, p.y],
          title: p.title,
          entityId: p.entity_id,
          genre: p.genre,
          nNodes: p.n_nodes,
          nEdges: p.n_edges,
          structureLabel: p.structure_label,
          isOutlier: outliers.has(p.entity_id),
        })),
      itemStyle: {
        color: TYPE_COLORS[t] || GOLD_NODE,
        opacity: 0.3,
      },
      symbolSize: (val: any) => (val.isOutlier ? 7 : 4),
      emphasis: {
        itemStyle: { opacity: 0.85, borderColor: "#fff", borderWidth: 1 },
        scale: 2,
      },
    }));

    // 离群点单独一层（加白色边框突出）
    const outlierSeries = DRAMA_TYPES.map((t) => ({
      name: `${t}-outlier`,
      type: "scatter",
      data: pcaPoints
        .filter((p) => p.genre === t && outliers.has(p.entity_id))
        .map((p) => [p.x, p.y]),
      itemStyle: {
        color: TYPE_COLORS[t] || GOLD_NODE,
        opacity: 0.55,
        borderColor: "#fff",
        borderWidth: 1,
        borderType: "solid" as const,
      },
      symbolSize: 8,
      silent: true,
      z: 5,
    }));

    // 质心标记
    const centroidData = DRAMA_TYPES.filter((t) => centroids[t]).map((t) => {
      const c = centroids[t];
      const color = TYPE_COLORS[t] || GOLD_NODE;
      return {
        name: t,
        value: [c.x, c.y],
        symbolSize: 18,
        itemStyle: {
          color,
          borderColor: "#fffefb",
          borderWidth: 2.5,
          shadowBlur: 8,
          shadowColor: color + "66",
          opacity: 0.9,
        },
        label: {
          show: true,
          formatter: t,
          position: "top",
          distance: 6,
          fontSize: 11,
          color: INK_WARM,
          fontWeight: 700,
          fontFamily: FONT_SERIF,
        },
      };
    });

    const centroidSeries = {
      name: "类型质心",
      type: "scatter",
      data: centroidData,
      z: 10,
      emphasis: { scale: 1.3 },
    };

    chart.setOption(
      {
        backgroundColor: PAPER_BG,
        tooltip: {
          trigger: "item",
          backgroundColor: "rgba(250,245,235,0.94)",
          borderColor: "rgba(160,130,100,0.45)",
          borderWidth: 1,
          textStyle: { color: INK_DARK, fontSize: 12, fontFamily: FONT_SERIF },
          formatter: (p: any) => {
            if (p.seriesName === "类型质心") {
              return `<b>${p.name}</b><br/>${centroids[p.name]?.count || "?"} 部剧本`;
            }
            const d = p.data;
            if (!d || !d.title) return "";
            return `<b>${d.title}</b><br/>类型: ${d.genre || p.seriesName}<br/>结构: ${d.structureLabel || "?"}<br/>角色: ${d.nNodes || "?"} · 边: ${d.nEdges || "?"}`;
          },
        },
        legend: {
          data: DRAMA_TYPES.filter((t) => pcaPoints.some((p) => p.genre === t)).map((t) => ({
            name: t,
            itemStyle: { color: TYPE_COLORS[t], opacity: 1 },
          })),
          bottom: 0,
          textStyle: { fontSize: 10, color: INK_SOFT, fontFamily: FONT_SERIF },
          itemWidth: 10,
          itemHeight: 6,
        },
        grid: { left: 56, right: 56, top: 24, bottom: 44 },
        graphic: [
          // PC1 轴名（手动定位，避免与图例重叠）
          {
            type: "text",
            left: "center",
            bottom: 18,
            style: {
              text: "PC1 · 度集中度",
              fill: INK_SOFT,
              font: `10px ${FONT_SERIF}`,
              textAlign: "center",
            },
          },
          // PC1 轴标注：左=去中心化，右=高度集中
          {
            type: "text",
            left: 70,
            bottom: 34,
            style: {
              text: "← 去中心化",
              fill: INK_SOFT,
              font: `9px ${FONT_SERIF}`,
            },
          },
          {
            type: "text",
            right: 70,
            bottom: 34,
            style: {
              text: "高度集中 →",
              fill: INK_SOFT,
              font: `9px ${FONT_SERIF}`,
            },
          },
          // PC2 轴标注：下=碎片化，上=高度连通
          {
            type: "text",
            left: 4,
            bottom: 56,
            style: {
              text: "↓ 碎片化",
              fill: INK_SOFT,
              font: `9px ${FONT_SERIF}`,
            },
          },
          {
            type: "text",
            left: 4,
            top: 32,
            style: {
              text: "↑ 高度连通",
              fill: INK_SOFT,
              font: `9px ${FONT_SERIF}`,
            },
          },
        ],
        xAxis: {
          axisLabel: { fontSize: 9, color: INK_SOFT, fontFamily: FONT_SERIF },
          splitLine: { show: false },
        },
        yAxis: {
          name: "PC2 · 连通分量比",
          nameLocation: "center",
          nameGap: 42,
          nameTextStyle: { fontSize: 10, color: INK_SOFT, fontFamily: FONT_SERIF },
          axisLabel: { fontSize: 9, color: INK_SOFT, fontFamily: FONT_SERIF },
          splitLine: { show: false },
        },
        series: [...series, ...outlierSeries, centroidSeries],
        animationDuration: 500,
      },
      true,
    );

    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("resize", h);
      chart.dispose();
    };
  }, [data, pcaPoints, centroids, outliers]);

  /* ==================================================================
     JSX
     ================================================================== */
  return (
    <div className="t2-screen">
      {/* ═══════════ 图表网格 ═══════════ */}
      <div className="t2-spacemap-grid">
        {/* ── Row 1: PCA 散点图 (全宽) ── */}
        <div className="t2-sm-card t2-sm-scatter">
          <div className="t2-sm-card-header">
            <h3>结构空间分布 · 增强 PCA 散点图</h3>
          </div>
          <div ref={scatterRef} className="t2-sm-chart" />
        </div>

      </div>
    </div>
  );
};

export default Task2SpaceMap;
