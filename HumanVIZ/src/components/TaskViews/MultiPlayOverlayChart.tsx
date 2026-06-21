import React, { useRef, useEffect, useMemo } from "react";
import * as echarts from "echarts";
import { RibbonAnalysisResult } from "../../utils/storyRibbonCore";

/* ================================================================
   MultiPlayOverlayChart — 多剧目综合叙事节奏曲线叠加对比
   将多个剧本的叙事节奏曲线叠加在同一坐标图中：
   - 横轴 (X)：归一化剧情进度 0%–100%
   - 纵轴 (Y)：归一化叙事强度 0%–100%
   - 每个剧本一条独立平滑曲线，最多 3 条
   - 图例点击切换、Hover 高亮/弱化、节点 Tooltip、高潮标记
   - 阶段背景：开端 | 发展 | 高潮 | 结局
   ================================================================ */
interface PlayEntry {
  key: string;
  title: string;
  sceneCount: number;
}
interface MultiPlayOverlayChartProps {
  plays: PlayEntry[];
  getAnalysis: (key: string) => RibbonAnalysisResult | null;
}
/* ── 归一化数据点 ── */
interface NormalizedPoint {
  x: number;       // 0–100 剧情进度
  y: number;       // 0–100 叙事强度
  sceneIdx: number; // 原始场次索引
}
interface SeriesMeta {
  playKey: string;
  playTitle: string;
  sceneCount: number;
  points: NormalizedPoint[];
  scenes: { number: number; name: string }[];
  climaxIdx: number;  // index into points[]
}
/* ── 低饱和度 5 色色板（沿袭 Task3 气泡矩阵 theme_colors 体系）── */
const COMPARE_COLORS = [
  "#96544D", // 1. 红棕 — 家庭伦理 / 家庭戏
  "#5E6B76", // 2. 雾蓝 — 侠义江湖 / 侠义戏
  "#7F968D", // 3. 青灰 — 神话灵异 / 神话戏
  "#C4A56E", // 4. 沙金 — 智谋韬略 / 技法展示戏
  "#C77D8B", // 5. 淡玫 — 爱情姻缘 / 爱情戏
];
/* ── 阶段背景色（半透明）── */
const PHASE_COLORS = [
  "rgba(184,155,109,0.07)",  // 开端 — 暖金
  "rgba(79,131,204,0.06)",   // 发展 — 淡蓝
  "rgba(217,92,92,0.08)",    // 高潮 — 浅红
  "rgba(127,150,141,0.06)",  // 结局 — 灰绿
];
const PHASE_BANDS = [
  { start: 0, end: 25, label: "开端" },
  { start: 25, end: 50, label: "发展" },
  { start: 50, end: 75, label: "高潮" },
  { start: 75, end: 100, label: "结局" },
];
/* ── 辅助：由归一化进度 (0-100) 推断所属阶段 ── */
function getPhaseLabel(x: number): string {
  if (x < 25) return "开端";
  if (x < 50) return "发展";
  if (x < 75) return "高潮";
  return "结局";
}
/* ── 辅助：归一化冲突强度到 0-100 ── */
function normalizeConflictArc(conflictArc: number[]): {
  points: NormalizedPoint[];
  minVal: number;
  maxVal: number;
  range: number;
} {
  const n = conflictArc.length;
  if (n === 0) return { points: [], minVal: 0, maxVal: 0, range: 0 };
  const minVal = Math.min(...conflictArc);
  const maxVal = Math.max(...conflictArc);
  const range = maxVal - minVal || 1; // avoid div-by-zero
  const points: NormalizedPoint[] = conflictArc.map((val, i) => ({
    x: n === 1 ? 50 : (i / (n - 1)) * 100,
    y: ((val - minVal) / range) * 100,
    sceneIdx: i,
  }));
  return { points, minVal, maxVal, range };
}
/* ═══════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════ */
const MultiPlayOverlayChart: React.FC<MultiPlayOverlayChartProps> = ({
  plays, getAnalysis,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const seriesMetaRef = useRef<SeriesMeta[]>([]);
  /* ── 预计算所有剧目的分析数据与归一化 ── */
  const seriesMetaList = useMemo(() => {
    const metaList: SeriesMeta[] = [];
    for (const play of plays) {
      const analysis = getAnalysis(play.key);
      if (!analysis) continue;
      const conflictArc = analysis.narrativeMetrics.conflictArc;
      if (!conflictArc || conflictArc.length === 0) continue;
      const { points } = normalizeConflictArc(conflictArc);
      // 找到高潮点索引 (归一化后 Y 最大值)
      let climaxIdx = 0;
      let maxY = -1;
      points.forEach((p, i) => {
        if (p.y > maxY) { maxY = p.y; climaxIdx = i; }
      });
      metaList.push({
        playKey: play.key,
        playTitle: play.title,
        sceneCount: analysis.scenes.length,
        points,
        scenes: analysis.scenes.map((s) => ({
          number: s.number || 0,
          name: s.name || "",
        })),
        climaxIdx,
      });
    }
    return metaList;
  }, [plays, getAnalysis]);
  /* ── 构建 ECharts ── */
  useEffect(() => {
    if (!ref.current || seriesMetaList.length < 1) return;
    // 存储 seriesMeta 以供 tooltip 等回调使用
    seriesMetaRef.current = seriesMetaList;
    let chart = chartRef.current;
    if (!chart || chart.isDisposed()) {
      chart = echarts.init(ref.current);
      chartRef.current = chart;
    }
    /* ── 为每个剧目构建 series ── */
    const series = seriesMetaList.map((meta, idx) => {
      const color = COMPARE_COLORS[idx % COMPARE_COLORS.length];
      const data = meta.points.map((p) => [p.x, p.y]);
      // 高潮标记
      const climaxPoint = meta.points[meta.climaxIdx];
      const markPointData: any[] = [];
      if (climaxPoint) {
        markPointData.push({
          name: "高潮",
          coord: [climaxPoint.x, climaxPoint.y],
          symbol: "pin",
          symbolSize: 22,
          symbolOffset: [0, -6],
          itemStyle: {
            color: color,
            borderColor: "#FFD700",
            borderWidth: 2,
            shadowBlur: 10,
            shadowColor: color + "66",
          },
          label: {
            show: true,
            formatter: "★",
            fontSize: 14,
            fontWeight: 700,
            color: "#FFD700",
            position: "top",
            distance: 10,
          },
        });
      }
      return {
        name: meta.playTitle,
        type: "line" as const,
        data,
        smooth: 0.4,              // 平滑插值，经过每个节点
        symbol: "circle" as const,
        symbolSize: 5,
        showSymbol: false,        // 默认不显示节点，hover 时显示
        lineStyle: {
          color,
          width: 2.5,
          opacity: 0.85,
        },
        itemStyle: {
          color,
          borderColor: "#fff",
          borderWidth: 1.5,
        },
        // 不显示面积阴影
        areaStyle: undefined,
        emphasis: {
          focus: "series" as const,
          lineStyle: { width: 4.5, opacity: 1 },
          itemStyle: { borderWidth: 3 },
          showSymbol: true,
          symbolSize: 8,
        },
        blur: {
          lineStyle: { opacity: 0.2, width: 2 },
          itemStyle: { opacity: 0.2 },
        },
        // 曲线末端标注剧本名
        endLabel: {
          show: true,
          formatter: meta.playTitle,
          color,
          fontSize: 11,
          fontWeight: 600,
          offset: [8, 0],
        },
        markPoint: markPointData.length > 0
          ? { silent: true, data: markPointData, animation: false }
          : undefined,
      };
    });
    /* ── 全图配置 ── */
    const option: echarts.EChartsOption = {
      animationDuration: 1500,
      animationDurationUpdate: 800,
      animationEasing: "cubicOut",
      /* ── Tooltip ── */
      tooltip: {
        trigger: "axis",
        appendToBody: true,
        backgroundColor: "rgba(255,255,255,0.96)",
        borderColor: "rgba(150,84,77,0.2)",
        borderWidth: 1,
        borderRadius: 10,
        padding: [12, 16],
        textStyle: { fontSize: 12, color: "#5E4B3A" },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return "";
          const xVal = params[0].data?.[0] ?? params[0].axisValue ?? 0;
          const phase = getPhaseLabel(xVal);
          const progressPct = Math.round(xVal);
          let html = `<b style="font-size:13px">📊 剧情进度 ${progressPct}% · ${phase}</b>`;
          html += `<div style="margin-top:4px;margin-bottom:2px;height:1px;background:rgba(150,84,77,0.1)"></div>`;
          for (const p of params) {
            if (!p.data || p.data[1] === undefined) continue;
            const yVal = Math.round(p.data[1]);
            const sIdx = p.seriesIndex;
            const meta = seriesMetaRef.current[sIdx];
            if (!meta) continue;
            // 通过 dataIndex 获取原始场次信息
            const dataIdx = p.dataIndex;
            const point = meta.points[dataIdx];
            const scene = point ? meta.scenes[point.sceneIdx] : null;
            const sceneNum = scene?.number || (point ? point.sceneIdx + 1 : "?");
            html +=
              `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${p.color};margin-right:5px;vertical-align:middle"></span>` +
              `<b>${p.seriesName}</b>` +
              `<span style="margin-left:6px;color:${p.color};font-weight:600">强度 ${yVal}%</span>` +
              `<span style="margin-left:6px;color:#8E8A84;font-size:11px">第${sceneNum}场</span>` +
              `<br/>`;
          }
          return html;
        },
      },
      /* ── Legend ── */
      legend: {
        top: 0,
        left: 32,
        right: 16,
        type: "scroll" as const,
        data: seriesMetaList.map((m) => m.playTitle),
        textStyle: { fontSize: 11, color: "#5E4B3A" },
        icon: "roundRect" as const,
        itemWidth: 14,
        itemHeight: 8,
        selectedMode: true,
        inactiveColor: "#ccc",
        pageTextStyle: { color: "#8E8A84" },
      },
      /* ── Grid ── */
      grid: { left: 52, right: 80, top: 42, bottom: 44 },
      /* ── X 轴：归一化剧情进度 0%–100% ── */
      xAxis: {
        type: "value",
        min: 0,
        max: 100,
        name: "剧情进度",
        nameTextStyle: { fontSize: 10, fontWeight: 600, color: "#5E4B3A" },
        nameLocation: "middle" as const,
        nameGap: 28,
        axisLabel: {
          fontSize: 10,
          color: "#5E4B3A",
          formatter: (v: number) => `${v}%`,
        },
        splitLine: { show: false },
        axisTick: { show: true },
        minorTick: { show: false },
      },
      /* ── Y 轴：归一化叙事强度 0%–100% ── */
      yAxis: {
        type: "value",
        name: "叙事强度",
        min: 0,
        max: 105,  // 留少量顶部空间给高潮标记
        nameTextStyle: { fontSize: 10, fontWeight: 600, color: "#96544D" },
        nameLocation: "middle" as const,
        nameGap: 36,
        axisLabel: {
          fontSize: 10,
          color: "#96544D",
          formatter: (v: number) => `${v}%`,
        },
        splitLine: { lineStyle: { color: "#e8ddce", type: "dashed" as const } },
      },
      /* ── Series ── */
      series: [
        // ══ 第一个 series：承载阶段背景 markArea ══
        {
          ...series[0],
          markArea: {
            silent: true,
            animation: false,
            data: PHASE_BANDS.map((band, bi) => [
              {
                name: band.label,
                xAxis: band.start,
                yAxis: 0,
                itemStyle: { color: PHASE_COLORS[bi] },
                label: {
                  show: true,
                  position: "insideTop" as const,
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#8E8A84",
                  distance: 4,
                  formatter: band.label,
                },
              },
              { xAxis: band.end, yAxis: 105 },
            ]),
          },
        } as any,
        // ══ 其余 series（不含 markArea）══
        ...series.slice(1),
      ],
    };
    chart.setOption(option, { notMerge: true });
    /* ── 自动避让 endLabel 重叠 ── */
    chart.setOption({
      series: seriesMetaList.map(() => ({
        labelLayout: {
          moveOverlap: "shiftY" as const,
          hideOverlap: false,
        },
      })),
    });
    /* ── Resize ── */
    const handleResize = () => chart?.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [seriesMetaList]);
  /* ── 清理 ── */
  useEffect(() => {
    return () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);
  /* ── 不足 2 个剧目时的提示 ── */
  if (plays.length < 1) {
    return (
      <div className="t4-multi-play-prompt">
        <span className="t4-multi-play-prompt-icon">📊</span>
        <p>请在左侧剧本列表中选取剧目以查看叙事节奏曲线</p>
        <p className="t4-multi-play-prompt-hint">
          冲突强度曲线将叠加在同一张图表中，支持最多 3 部剧目同时对比
        </p>
      </div>
    );
  }
  return (
    <div className="t4-combined-chart-block">
      <div className="t4-combined-chart-header">
        <div className="t4-section-title-row">
          <span className="t4-section-icon">📊</span>
          <h3>多剧目综合叙事节奏曲线叠加对比</h3>
        </div>
        <span className="t4-chart-hint">
          {seriesMetaList.length} 部剧目 · 归一化剧情进度 · ★ 标示高潮 · Hover 图例高亮
        </span>
      </div>
      <div ref={ref} className="t4-combined-chart-canvas" />
    </div>
  );
};
export default MultiPlayOverlayChart;
