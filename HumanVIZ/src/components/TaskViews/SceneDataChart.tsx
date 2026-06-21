import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import * as echarts from "echarts";
import { RibbonAnalysisResult, StoryFingerprint } from "../../utils/storyRibbonCore";

/* ================================================================
   SceneDataChart — 场次数据交互图表
   双轴组合交互图表：冲突强度折线 + 情感评分折线 + 角色数量柱状图
   带图例开关、缩放/框选工具栏、框选取值统计弹窗、多剧叠加支持
   ================================================================ */

/* ── Play entry type for multi-play overlay ── */
export interface PlayEntry {
  key: string;
  title: string;
  sceneCount: number;
}

/* ── Props ── */
interface SceneDataChartProps {
  analysis: RibbonAnalysisResult | null;
  fingerprint: StoryFingerprint | null;
  onSceneHover?: (idx: number | null) => void;
  onSceneClick?: (idx: number | null) => void;
  /** Multi-play overlay data */
  overlayPlays?: PlayEntry[];
  /** Resolve analysis for overlay plays */
  getOverlayAnalysis?: (key: string) => RibbonAnalysisResult | null;
  /** Expose chart instance for export */
  chartRef?: React.RefObject<{ getDataURL: () => string | null } | null>;
}

/* ── Multi-play overlay colors (matches MultiPlayOverlayChart) ── */
const COMPARE_COLORS = [
  "#96544D", "#5E6B76", "#7F968D", "#B89B6D", "#C44D4D",
];
const LINE_DASHES: Array<"solid" | "dashed" | "dotted"> = [
  "solid", "dashed", "dotted", "solid", "dashed",
];

/* ================================================================
   Brush Stats Popup State
   ================================================================ */
interface BrushStats {
  visible: boolean;
  scenes: number[];
  avgConflict: number;
  avgSentiment: number;
  avgChars: number;
}

/* ================================================================
   Component
   ================================================================ */
const SceneDataChart: React.FC<SceneDataChartProps> = ({
  analysis, fingerprint,
  onSceneHover, onSceneClick,
  overlayPlays, getOverlayAnalysis,
  chartRef,
}) => {
  const domRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const pinnedSceneRef = useRef<number | null>(null);
  const lastHoverRef = useRef<number | null>(null);
  /** Flag to avoid re-applying the same pinned tooltip in a cycle */
  const pinningRef = useRef(false);

  /* ── Brush stats popup ── */
  const [brushStats, setBrushStats] = useState<BrushStats | null>(null);
  const [brushActive, setBrushActive] = useState(false);

  /* ── Prepare data from analysis ── */
  const n = analysis?.scenes?.length ?? 0;
  const scenes = analysis?.scenes ?? [];
  const conflictArc = analysis?.narrativeMetrics?.conflictArc ?? [];
  const sentimentArc = analysis?.narrativeMetrics?.sentimentArc ?? [];
  const charDensity = analysis?.narrativeMetrics?.characterDensity ?? [];

  const sceneLabels = scenes.map((s, i) =>
    `第${s.number || i + 1}场\n${(s.name || "").slice(0, 5)}`);

  /* ── Load overlay analyses ── */
  const overlayAnalyses = useMemo(() => {
    if (!overlayPlays || overlayPlays.length < 2 || !getOverlayAnalysis) return [];
    return overlayPlays.map(p => ({
      play: p,
      analysis: getOverlayAnalysis(p.key),
    })).filter(a => a.analysis);
  }, [overlayPlays, getOverlayAnalysis]);

  /* ── Normalize overlay conflict arc to current scene count ── */
  const getNormalized = useCallback((src: number[], targetLen: number): number[] => {
    if (src.length === targetLen) return [...src];
    return new Array(targetLen).fill(0).map((_, i) => {
      const srcIdx = (i / Math.max(targetLen - 1, 1)) * (src.length - 1);
      const lo = Math.floor(srcIdx);
      const hi = Math.min(src.length - 1, Math.ceil(srcIdx));
      const frac = srcIdx - lo;
      return +(src[lo] + (src[hi] - src[lo]) * frac).toFixed(3);
    });
  }, []);

  /* ================================================================
     ECharts init
     ================================================================ */
  useEffect(() => {
    if (!domRef.current || !analysis || !fingerprint) return;
    let chart: echarts.ECharts | null = null;
    try {
      const existing = echarts.getInstanceByDom(domRef.current);
      if (existing) existing.dispose();
      chart = echarts.init(domRef.current);
      chartInstance.current = chart;

      /* ── Expose chartRef for export ── */
      if (chartRef) {
        (chartRef as any).current = {
          getDataURL: () => chart?.getDataURL({
            type: "png", pixelRatio: 2, backgroundColor: "#FFFDF9",
          }),
        };
      }

      /* ── Overlay series (multi-play) ── */
      const overlaySeries: any[] = [];
      if (overlayAnalyses.length >= 2 && n > 0) {
        overlayAnalyses.forEach(({ play, analysis: oa }, idx) => {
          const color = COMPARE_COLORS[idx % COMPARE_COLORS.length];
          const dash = LINE_DASHES[idx % LINE_DASHES.length];
          const src = oa!.narrativeMetrics.conflictArc;
          const normalized = getNormalized(src, n);
          overlaySeries.push({
            name: `${play.title} (冲突)`,
            type: "line", yAxisIndex: 0,
            data: normalized,
            symbol: "none",
            smooth: true,
            lineStyle: { color, type: dash, width: 2, opacity: 0.35 },
            itemStyle: { color },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: color + "18" },
                { offset: 1, color: color + "02" },
              ]),
            },
            emphasis: {
              focus: "series",
              lineStyle: { opacity: 1, width: 3.5 },
            },
            z: 1,
          });
        });
      }

      /* ── Build option ── */
      const baseSeries: any[] = [
        {
          name: "冲突强度",
          type: "line", yAxisIndex: 0,
          data: conflictArc.map(v => +v.toFixed(3)),
          smooth: true,
          symbol: "circle", symbolSize: 5,
          lineStyle: { color: "#96544D", width: 2.5 },
          itemStyle: { color: "#96544D" },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(150,84,77,0.22)" },
              { offset: 1, color: "rgba(150,84,77,0.01)" },
            ]),
          },
          emphasis: {
            focus: "series",
            symbolSize: 10,
            itemStyle: { shadowBlur: 10, shadowColor: "#96544D" },
          },
          z: 3,
        },
        {
          name: "情感评分",
          type: "line", yAxisIndex: 0,
          data: sentimentArc.map(v => +v.toFixed(3)),
          smooth: true,
          symbol: "diamond", symbolSize: 4,
          lineStyle: { color: "#B89B6D", width: 2, type: "dashed" as const },
          itemStyle: { color: "#B89B6D" },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(184,149,111,0.15)" },
              { offset: 1, color: "rgba(184,149,111,0.01)" },
            ]),
          },
          emphasis: {
            focus: "series",
            symbolSize: 8,
            itemStyle: { shadowBlur: 8, shadowColor: "#B89B6D" },
          },
          z: 2,
        },
        {
          name: "出场角色",
          type: "bar", yAxisIndex: 1,
          data: charDensity,
          barMaxWidth: 14, barGap: "30%",
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(127,150,141,0.55)" },
              { offset: 1, color: "rgba(127,150,141,0.1)" },
            ]),
            borderRadius: [3, 3, 0, 0],
          },
          emphasis: {
            focus: "series",
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: "rgba(127,150,141,0.8)" },
                { offset: 1, color: "rgba(127,150,141,0.25)" },
              ]),
            },
          },
          z: 2,
        },
      ];

      /* ── Legend data (includes overlay play titles) ── */
      const legendData = ["冲突强度", "情感评分", "出场角色"];
      if (overlaySeries.length > 0) {
        overlaySeries.forEach(s => legendData.push(s.name));
      }

      chart.setOption({
        tooltip: {
          trigger: "axis",
          appendToBody: true,
          backgroundColor: "rgba(255,253,249,0.96)",
          borderColor: "rgba(184,155,109,0.35)",
          borderWidth: 1,
          borderRadius: 10,
          padding: [10, 14],
          textStyle: {
            fontSize: 12,
            color: "#5E4B3A",
            fontFamily: "Noto Sans SC, sans-serif",
          },
          formatter: (params: any) => {
            if (!Array.isArray(params) || params.length === 0) return "";
            const idx = params[0]?.dataIndex;
            if (idx === undefined || idx >= scenes.length) return "";
            const scene = scenes[idx];
            const isPinned = pinnedSceneRef.current === idx;
            let html = `<b>第${scene.number || idx + 1}场 · ${scene.name || ""}</b><br/>`;
            for (const p of params) {
              const sn = p.seriesName;
              if (sn === "冲突强度") {
                html += `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#96544D;margin-right:4px"></span>`;
                html += `⚔️ 冲突强度：${(p.value * 100).toFixed(0)}%<br/>`;
              } else if (sn === "情感评分") {
                html += `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#B89B6D;margin-right:4px"></span>`;
                html += `💭 情感评分：${(p.value >= 0 ? "+" : "")}${(p.value * 100).toFixed(0)}%<br/>`;
              } else if (sn === "出场角色") {
                html += `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#7F968D;margin-right:4px"></span>`;
                html += `👥 出场角色：${p.value} 人<br/>`;
              }
            }
            html += `📍 ${scene.location || "舞台"}<br/>`;
            if (scene.characters && scene.characters.length > 0) {
              const chars = scene.characters
                .map((c: any) => (typeof c === "string" ? c : (c.name || c)))
                .join(" · ");
              html += `<div style="font-size:10px;color:#8E8A84;margin-top:2px;max-width:240px;line-height:1.4">👤 ${chars}</div>`;
            }
            html += `<div class="t4-echart-tooltip-actions">`;
            html += `<span class="t4-echart-pin-btn" data-pin-idx="${idx}">📌 ${isPinned ? "已固定" : "固定"}</span>`;
            html += `<span class="t4-echart-copy-btn" data-copy-idx="${idx}">📋 复制</span>`;
            html += `</div>`;
            return html;
          },
        },
        legend: {
          top: 0,
          left: 48,
          data: legendData,
          textStyle: { fontSize: 11, color: "#5E4B3A" },
          icon: "roundRect",
          itemWidth: 12,
          itemHeight: 8,
          selectedMode: true,
          inactiveColor: "#B8A898",
        },
        grid: {
          left: 56,
          right: 52,
          top: 40,
          bottom: 52,
        },
        xAxis: {
          type: "category",
          data: sceneLabels,
          axisLabel: {
            fontSize: 10,
            color: "#5E4B3A",
            interval: 0,
            rotate: n > 8 ? 30 : 0,
          },
          axisTick: { alignWithLabel: true },
          axisLine: { lineStyle: { color: "rgba(94,107,118,0.12)" } },
        },
        yAxis: [
          {
            type: "value",
            name: "强度/评分",
            min: -0.2,
            max: 1.1,
            nameTextStyle: { fontSize: 10, fontWeight: 600, color: "#96544D" },
            axisLabel: {
              fontSize: 10,
              color: "#96544D",
              formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
            },
            splitLine: {
              lineStyle: { color: "rgba(94,107,118,0.12)", type: "dashed" as const },
            },
          },
          {
            type: "value",
            name: "角色数",
            nameTextStyle: { fontSize: 10, fontWeight: 600, color: "#7F968D" },
            axisLabel: { fontSize: 10, color: "#7F968D" },
            splitLine: { show: false },
          },
        ],
        dataZoom: [
          {
            type: "inside",
            xAxisIndex: 0,
            minSpan: 2,
            maxSpan: n,
            zoomOnMouseWheel: true,
          },
          {
            type: "slider",
            xAxisIndex: 0,
            height: 20,
            bottom: 8,
            borderColor: "rgba(184,155,109,0.25)",
            backgroundColor: "rgba(255,253,249,0.5)",
            fillerColor: "rgba(150,84,77,0.08)",
            handleStyle: { color: "#96544D" },
            textStyle: { fontSize: 9, color: "#5E4B3A" },
            labelFormatter: (v: string) => {
              const idx = parseInt(v);
              return `第${idx + 1}场`;
            },
          },
        ],
        brush: {
          toolbox: ["rect", "clear"],
          brushLink: "all",
          xAxisIndex: 0,
          brushType: "rect",
          brushMode: "single",
          transformable: true,
          brushStyle: {
            borderWidth: 1.5,
            borderColor: "rgba(150,84,77,0.6)",
            color: "rgba(184,155,109,0.15)",
          },
          outOfBrush: { colorAlpha: 0.3 },
        },
        series: [...baseSeries, ...overlaySeries],
      });

      /* ── Events ── */

      // Hover: scene mousemove
      chart.getZr().on("mousemove", (event: any) => {
        const point = chart!.convertFromPixel("grid", [event.offsetX, event.offsetY]);
        if (point && Array.isArray(point) && Number.isFinite(point[0])) {
          const idx = Math.round(Math.max(0, Math.min(n - 1, point[0])));
          if (idx !== lastHoverRef.current) {
            lastHoverRef.current = idx;
            onSceneHover?.(idx);
          }
        }
      });
      chart.getZr().on("mouseout", () => {
        lastHoverRef.current = null;
        onSceneHover?.(null);
      });

      // Click: scene point
      chart.on("click", (params: any) => {
        if (params.componentType === "series" && params.dataIndex !== undefined) {
          onSceneClick?.(params.dataIndex);
        }
      });

      // Brush end: aggregate stats popup
      chart.on("brushEnd", (params: any) => {
        const areas = params.areas;
        if (!areas || areas.length === 0 || !areas[0].coordRange) {
          setBrushStats(null);
          setBrushActive(false);
          return;
        }
        const coordRange = areas[0].coordRange;
        if (!coordRange || coordRange.length < 2) {
          setBrushStats(null);
          setBrushActive(false);
          return;
        }
        const startIdx = Math.max(0, Math.round(coordRange[0]));
        const endIdx = Math.min(n - 1, Math.round(coordRange[1]));
        if (endIdx - startIdx < 1) {
          setBrushStats(null);
          setBrushActive(false);
          return;
        }
        const selected = [];
        for (let i = startIdx; i <= endIdx; i++) selected.push(i);

        const avgConflict = selected.reduce((s, i) => s + (conflictArc[i] ?? 0), 0) / selected.length;
        const avgSentiment = selected.reduce((s, i) => s + (sentimentArc[i] ?? 0), 0) / selected.length;
        const avgChars = selected.reduce((s, i) => s + (charDensity[i] ?? 0), 0) / selected.length;

        setBrushStats({
          visible: true,
          scenes: selected,
          avgConflict,
          avgSentiment,
          avgChars,
        });
      });

      // Click on empty area clears brush popup
      chart.on("click", (params: any) => {
        if (params.componentType !== "series" && params.componentType !== "markArea") {
          setBrushStats(null);
          setBrushActive(false);
        }
      });
    } catch (err) {
      console.error("SceneDataChart init failed:", err);
      return;
    }

    /* ── Tooltip pin/copy delegated click handler ── */
    const handleTooltipClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("t4-echart-pin-btn") && target.dataset.pinIdx !== undefined) {
        const idx = parseInt(target.dataset.pinIdx);
        pinnedSceneRef.current = pinnedSceneRef.current === idx ? null : idx;
        if (pinnedSceneRef.current !== null) {
          pinningRef.current = true;
          chart?.dispatchAction({ type: "showTip", seriesIndex: 0, dataIndex: idx });
          setTimeout(() => { pinningRef.current = false; }, 100);
        }
      }
      if (target.classList.contains("t4-echart-copy-btn") && target.dataset.copyIdx !== undefined) {
        const idx = parseInt(target.dataset.copyIdx);
        const scene = scenes[idx];
        if (!scene) return;
        const text = [
          `第${scene.number || idx + 1}场 · ${scene.name || ""}`,
          `冲突强度：${(conflictArc[idx] * 100).toFixed(0)}%`,
          `情感评分：${(sentimentArc[idx] >= 0 ? "+" : "")}${(sentimentArc[idx] * 100).toFixed(0)}%`,
          `出场角色：${charDensity[idx]} 人`,
          `位置：${scene.location || "舞台"}`,
          scene.characters && scene.characters.length > 0
            ? `角色：${scene.characters.map((c: any) => (typeof c === "string" ? c : (c.name || c))).join("、")}`
            : "",
        ].filter(Boolean).join("\n");
        navigator.clipboard.writeText(text).then(() => {
          target.textContent = "✅ 已复制";
          setTimeout(() => { target.textContent = "📋 复制"; }, 1500);
        }).catch(() => {});
      }
    };
    document.addEventListener("click", handleTooltipClick);

    /* ── Keep pinned tooltip visible on globalout ── */
    const handleGlobalOut = () => {
      if (pinnedSceneRef.current !== null && !pinningRef.current) {
        setTimeout(() => {
          chart?.dispatchAction({ type: "showTip", seriesIndex: 0, dataIndex: pinnedSceneRef.current! });
        }, 30);
      }
    };
    chart.on("globalout", handleGlobalOut);

    /* ── Resize ── */
    const h = () => chart?.resize();
    window.addEventListener("resize", h);

    return () => {
      window.removeEventListener("resize", h);
      document.removeEventListener("click", handleTooltipClick);
      chart?.off("globalout", handleGlobalOut);
      chart?.dispose();
      chartInstance.current = null;
    };
  }, [analysis, fingerprint, overlayAnalyses, sceneLabels, conflictArc, sentimentArc, charDensity, n, scenes, onSceneHover, onSceneClick, getNormalized, chartRef]);

  /* ── Toolbar handlers ── */
  const handleZoomIn = useCallback(() => {
    const chart = chartInstance.current;
    if (!chart) return;
    chart.dispatchAction({ type: "takeGlobalCursor", key: "dataZoomSelect", dataZoomSelectActive: true });
  }, []);

  const handleBrushToggle = useCallback(() => {
    const chart = chartInstance.current;
    if (!chart) return;
    const next = !brushActive;
    setBrushActive(next);
    if (next) {
      chart.dispatchAction({ type: "takeGlobalCursor", key: "brush", brushType: "rect" });
    } else {
      chart.dispatchAction({ type: "brush", command: "clear", areas: [] });
      setBrushStats(null);
    }
  }, [brushActive]);

  const handleReset = useCallback(() => {
    const chart = chartInstance.current;
    if (!chart) return;
    chart.dispatchAction({ type: "restore" });
    chart.dispatchAction({ type: "brush", command: "clear", areas: [] });
    setBrushStats(null);
    setBrushActive(false);
  }, []);

  /* ── Empty state ── */
  if (!analysis) {
    return (
      <div className="t4-table-prompt">
        <span className="t4-multi-play-prompt-icon">📊</span>
        <p>请选择一个剧本以查看场次数据</p>
      </div>
    );
  }

  return (
    <div className="t4-scene-chart-block">
      {/* Header */}
      <div className="t4-combined-chart-header">
        <div className="t4-section-title-row">
          <span className="t4-section-icon">📊</span>
          <h3>场次数据交互图表</h3>
        </div>
        <span className="t4-chart-hint">
          {fingerprint ? `${fingerprint.sceneCount} 场 · 双击重置 · 框选查看统计` : ""}
        </span>
      </div>

      {/* Toolbar */}
      <div className="t4-chart-toolbar">
        <button
          className={`t4-chart-toolbar-btn`}
          onClick={handleZoomIn}
          title="框选缩放"
        >
          <span role="img" aria-label="zoom">🔍</span> 框选缩放
        </button>
        <button
          className={`t4-chart-toolbar-btn ${brushActive ? "active" : ""}`}
          onClick={handleBrushToggle}
          title="范围选取查看统计"
        >
          <span role="img" aria-label="brush">🖌️</span> 范围选取
        </button>
        <button
          className="t4-chart-toolbar-btn"
          onClick={handleReset}
          title="重置视图"
        >
          <span role="img" aria-label="reset">↩️</span> 重置
        </button>
      </div>

      {/* Chart canvas */}
      <div className="t4-scene-chart-relative">
        <div ref={domRef} className="t4-scene-chart-canvas" />

        {/* Brush stats popup */}
        {brushStats?.visible && (
          <div className="t4-brush-stats-popup">
            <div className="t4-brush-stats-header">
              <span>📊 选中范围统计</span>
              <button
                className="t4-brush-stats-close"
                onClick={() => { setBrushStats(null); setBrushActive(false); }}
              >
                ✕
              </button>
            </div>
            <div className="t4-brush-stats-body">
              <div className="t4-brush-stat-row">
                <span className="t4-brush-stat-label">场次范围</span>
                <span className="t4-brush-stat-value">
                  第{brushStats.scenes[0] + 1}-{brushStats.scenes[brushStats.scenes.length - 1] + 1}场
                  <span className="t4-brush-stat-sub">（{brushStats.scenes.length}场）</span>
                </span>
              </div>
              <div className="t4-brush-stat-row">
                <span className="t4-brush-stat-label">平均冲突强度</span>
                <span className="t4-brush-stat-value t4-brush-stat-conflict">
                  {(brushStats.avgConflict * 100).toFixed(0)}%
                </span>
              </div>
              <div className="t4-brush-stat-row">
                <span className="t4-brush-stat-label">平均情感评分</span>
                <span className="t4-brush-stat-value t4-brush-stat-sentiment">
                  {brushStats.avgSentiment >= 0 ? "+" : ""}{(brushStats.avgSentiment * 100).toFixed(0)}%
                </span>
              </div>
              <div className="t4-brush-stat-row">
                <span className="t4-brush-stat-label">平均角色数</span>
                <span className="t4-brush-stat-value t4-brush-stat-chars">
                  {brushStats.avgChars.toFixed(1)} 人
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SceneDataChart;
