/**
 * PerformanceRadarChart.tsx
 * Polar-coordinate bar chart for 4-dimensional character performance display.
 * Uses ECharts polar system + bar series (replaced true radar chart).
 *
 * Features:
 *   - Main character: filled bars with category color
 *   - Comparison characters (up to 3): distinct palette bars
 *   - Rich tooltip with dimension values, confidence, and category info
 *   - Legend with click-to-toggle visibility
 *   - Dynamic bar width based on visible character count
 */

import React, { useEffect, useRef, useMemo } from "react";
import * as echarts from "echarts";
import type { Dimension } from "./commentaryTemplates";
import type { CharacterPerformance } from "./CharacterPerformanceLoader";
import { getCategoryColor, getCategoryLabel } from "./CharacterPerformanceLoader";

/* ── Constants ── */

const DIM_LABELS: Record<Dimension, string> = {
  sing: "唱\n(歌唱)",
  speak: "念\n(念白)",
  act: "做\n(身段)",
  fight: "打\n(武打)",
};

const DIM_SHORT: Record<Dimension, string> = {
  sing: "唱(歌唱)",
  speak: "念(念白)",
  act: "做(身段)",
  fight: "打(武打)",
};

/* ── Props ── */

interface Props {
  /** Name of the main character (the focused one) */
  mainCharacter: string | null;
  /** Names of comparison characters to overlay */
  comparisonCharacters: string[];
  /** Full character data lookup */
  characterData: Record<string, CharacterPerformance>;
  /** Height override */
  height?: number;
}

/* ── Component ── */

const PerformanceRadarChart: React.FC<Props> = ({
  mainCharacter,
  comparisonCharacters,
  characterData,
  height = 340,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  // Build series data
  const seriesData = useMemo(() => {
    const result: Array<{
      name: string;
      displayName: string;
      values: number[];
      color: string;
      confidence: string;
      category: string;
      scriptCount: number;
      isMain: boolean;
    }> = [];

    if (mainCharacter && characterData[mainCharacter]) {
      const c = characterData[mainCharacter];
      result.push({
        name: mainCharacter,
        displayName: c.displayName || mainCharacter,
        values: [
          Math.round(c.scores.sing * 100),
          Math.round(c.scores.speak * 100),
          Math.round(c.scores.act * 100),
          Math.round(c.scores.fight * 100),
        ],
        color: getCategoryColor(c.category),
        confidence: c.confidence,
        category: c.category,
        scriptCount: c.scriptCount,
        isMain: true,
      });
    }

    for (const name of comparisonCharacters) {
      if (name === mainCharacter) continue;
      const c = characterData[name];
      if (!c) continue;
      result.push({
        name,
        displayName: c.displayName || name,
        values: [
          Math.round(c.scores.sing * 100),
          Math.round(c.scores.speak * 100),
          Math.round(c.scores.act * 100),
          Math.round(c.scores.fight * 100),
        ],
        color: getCategoryColor(c.category),
        confidence: c.confidence,
        category: c.category,
        scriptCount: c.scriptCount,
        isMain: false,
      });
    }

    return result;
  }, [mainCharacter, comparisonCharacters, characterData]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (!chartRef.current) {
      chartRef.current = echarts.init(el);
    }
    const chart = chartRef.current;

    const dims: Dimension[] = ["sing", "speak", "act", "fight"];
    const dimLabels = dims.map(d => DIM_LABELS[d]);

    // Color palette for comparison series (cycle through distinct colors)
    const COMPARE_COLORS = ["#96544d", "#5e6b76", "#7f968d"];

    const visibleCount = seriesData.length > 0 ? seriesData.length : 1;
    const showLabel = seriesData.length > 0 && seriesData.length <= 4;

    // Build bar series for each character (polar bar chart)
    const series: any[] = seriesData.map((item, idx) => ({
      type: "bar",
      coordinateSystem: "polar",
      name: item.displayName,
      data: item.values,
      barWidth: `${Math.max(70 / visibleCount, 12).toFixed(1)}%`,
      barGap: "12%",
      barCategoryGap: "8%",
      itemStyle: {
        color: item.isMain
          ? item.color
          : COMPARE_COLORS[(idx - 1) % COMPARE_COLORS.length],
        opacity: 0.78,
        borderColor: "#ffffff",
        borderWidth: 0.6,
        borderRadius: [4, 4, 0, 0],
      },
      emphasis: {
        itemStyle: {
          opacity: 1,
          borderWidth: 1.5,
          shadowBlur: 8,
          shadowColor: "rgba(0,0,0,0.20)",
        },
      },
      z: item.isMain ? 10 : 5,
    }));

    // Empty state placeholder (grey bars at value 30 when no character selected)
    const emptySeries: any[] = [{
      type: "bar",
      coordinateSystem: "polar",
      name: "",
      data: [30, 30, 30, 30],
      barWidth: "70%",
      barGap: "12%",
      barCategoryGap: "8%",
      itemStyle: {
        color: "rgba(94,107,118,0.10)",
        opacity: 0.5,
        borderColor: "rgba(94,107,118,0.25)",
        borderWidth: 1,
        borderType: "dashed",
        borderRadius: [4, 4, 0, 0],
      },
      emphasis: { disabled: true },
      silent: true,
      z: 1,
    }];

    const useSeries = seriesData.length > 0 ? series : emptySeries;

    const option: echarts.EChartsOption = {
      // ── 背景透明以使容器背景图透出 ──
      backgroundColor: "transparent",
      // ── Polar coordinate system ──
      polar: {
        center: ["50%", "52%"],
        radius: ["6%", "76%"],
      },

      // ── Angle axis: 唱念做打 four categories ──
      angleAxis: {
        type: "category",
        data: dimLabels,
        boundaryGap: true,
        axisLabel: {
          fontSize: 14,
          color: "#3a2c21",
          fontWeight: 700,
          margin: 16,
          fontFamily: "Noto Sans SC, Noto Serif SC, sans-serif",
        },
        axisLine: {
          lineStyle: { color: "rgba(94,107,118,0.25)", width: 1.2 },
        },
        splitLine: { show: false },
      },

      // ── Radius axis: 0-100 scale ──
      radiusAxis: {
        max: 100,
        splitNumber: 4,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          fontSize: 11,
          color: "#8a939b",
          fontFamily: "Noto Sans SC, sans-serif",
        },
        splitLine: {
          lineStyle: {
            color: "rgba(127,150,141,0.15)",
            width: 1,
          },
        },
        splitArea: {
          show: true,
          areaStyle: {
            color: ["rgba(127,150,141,0.02)", "rgba(127,150,141,0.05)"],
          },
        },
      },

      // ── Tooltip ──
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(255,253,249,0.98)",
        borderColor: "rgba(184,149,111,0.5)",
        borderWidth: 1,
        padding: [12, 16],
        textStyle: {
          fontSize: 13,
          color: "#3a2c21",
          fontFamily: "Noto Sans SC, sans-serif",
        },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return "";

          const dimLabel = params[0]?.axisValue || "";
          const dimIdx = dimLabels.indexOf(dimLabel);
          const dimKey: Dimension | undefined = dimIdx >= 0 ? dims[dimIdx] : undefined;
          if (!dimKey) return "";

          let html = `<strong style="font-size:14px;color:#3a2c21">${DIM_SHORT[dimKey]}</strong>`;
          html += `<hr style="border:0;border-top:1px solid rgba(94,107,118,0.15);margin:8px 0">`;

          params.forEach((p: any) => {
            const sd = seriesData.find(s => s.displayName === p.seriesName);
            if (!sd) return;

            const confLabel = sd.confidence === "expert"
              ? "领域知识参考值"
              : `剧本聚合统计 (${sd.scriptCount} 部)`;
            const catLabel = getCategoryLabel(sd.category);

            html += `<div style="line-height:1.7;margin-bottom:6px">`;
            html += `<span style="display:inline-block;margin-right:4px">${p.marker}</span>`;
            html += `<strong>${sd.displayName}: ${p.value}</strong>`;
            html += `<br/><span style="font-size:11px;color:#8a939b;padding-left:20px">${confLabel} · ${catLabel}</span>`;

            // All-dimension summary row
            const allDimsHtml = dims.map((d, i) => {
              const dLabel = DIM_SHORT[d].replace(/\(.*\)/, "");
              return `<span style="margin:0 2px">${dLabel}:${sd.values[i]}</span>`;
            }).join(" · ");
            html += `<br/><span style="font-size:11px;color:#7a5e4e;padding-left:20px">${allDimsHtml}</span>`;
            html += `</div>`;
          });

          return html;
        },
      },

      // ── Legend ──
      legend: {
        show: seriesData.length > 1,
        bottom: 0,
        data: seriesData.map(s => s.displayName),
        textStyle: { fontSize: 12, color: "#7a5e4e", fontFamily: "Noto Sans SC, sans-serif" },
        itemWidth: 12, itemHeight: 3, itemGap: 16,
      },

      // ── Series: bar labels only when 4 or fewer characters ──
      series: showLabel
        ? useSeries.map(s => ({
            ...s,
            label: {
              show: true,
              position: "outside",
              fontSize: 11,
              color: "#3a2c21",
              fontFamily: "Noto Sans SC, sans-serif",
              formatter: (p: any) => {
                if (p.value > 30) {
                  const sd = seriesData.find(item => item.displayName === p.seriesName);
                  return sd ? sd.displayName : "";
                }
                return "";
              },
            },
          }))
        : useSeries,
    };

    chart.setOption(option, true);

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(el);

    return () => {
      window.removeEventListener("resize", handleResize);
      observer.disconnect();
    };
  }, [seriesData]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: `${height}px`,
        minHeight: "240px",
        position: "relative",
        zIndex: 1,
        backgroundImage: "url('/背景图.png')",
        backgroundSize: "contain",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    />
  );
};

export default PerformanceRadarChart;
