import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as echarts from "echarts";
import { Autocomplete } from "@mantine/core";
import p3data from "../../data/theme-data.json";
import ThemeComparisonChart from "./ThemeComparisonChart";
import "./Task3Layout.scss";

type ReportTabId = "report" | "method" | "combos" | "stats";
type MainView = "bubbleMatrix" | "chord" | "stackedBar" | "matrixHeatmap";

const TYPE_COLORS: Record<string, string> = p3data.type_colors as any;
const TYPE_ORDER = p3data.type_order as string[];
const THEME_ORDER = p3data.theme_order as string[];
const CLUSTERED_ORDER = p3data.clustered_theme_order as string[];

const REPORT_TAB_LABELS: { id: ReportTabId; icon: string; label: string }[] = [
  { id: "report", icon: "📋", label: "设计流程报告" },
  { id: "method", icon: "🔍", label: "主题提取方法" },
  { id: "combos", icon: "🧩", label: "组合模式详情" },
  { id: "stats", icon: "📐", label: "统计检验" },
];
const VIEW_LABELS: Record<MainView, string> = {
  bubbleMatrix: "类型×主题交叉",
  chord: "类型→主题流向",
  stackedBar: "剧目类型分布",
  matrixHeatmap: "主题共现关系",
};
const VIEW_ICONS: Record<MainView, string> = {
  bubbleMatrix: "🫧",
  chord: "🔀",
  stackedBar: "📊",
  matrixHeatmap: "🔥",
};

/* ================================================================
   Task3Layout — 剧本主题提取与跨剧本比较 (Enriched Redesign)
   ================================================================ */
const Task3Layout: React.FC = () => {
  const [mainView, setMainView] = useState<MainView>("bubbleMatrix");
  const [reportSidebarOpen, setReportSidebarOpen] = useState(false);
  const [reportTab, setReportTab] = useState<ReportTabId>("report");
  const [selectedArchetype, setSelectedArchetype] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{
    theme: string;
    genre: string;
    coverage: number;
  } | null>(null);

  // 颜色亮度判断 (模块级复用)
  const isDark = (hex: string): boolean => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.52;
  };

  const heatmapRef = useRef<HTMLDivElement>(null);
  const radarRef = useRef<HTMLDivElement>(null);
  const sankeyRef = useRef<HTMLDivElement>(null);
  const stackedBarRef = useRef<HTMLDivElement>(null);
  const matrixHeatmapRef = useRef<HTMLDivElement>(null);
  const chordRef = useRef<HTMLDivElement>(null);
  const rightComboRef = useRef<HTMLDivElement>(null);

  const data = p3data as any;
  const archetypes = data.archetypes || [];

  /* ==================================================================
     Chart 1 — Interactive Bubble Matrix (genre × theme)
     学术论文风格 · 按主题分系列 · 支持图例筛选/框选/点选/十字准星
     ================================================================== */
  useEffect(() => {
    if (mainView !== "bubbleMatrix" || !heatmapRef.current) return;
    const chart = echarts.init(heatmapRef.current);

    const order = CLUSTERED_ORDER;
    const types = [...TYPE_ORDER];
    const themeColorMap = data.theme_colors as Record<string, string>;

    const fontFamily =
      "'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif";

    /* ================================================================
       构建 per-theme 系列 — 每个主题一个独立 scatter series，
       实现: 图例点击过滤 | 独立颜色 | 选中态 | brush 联动
       ================================================================ */
    // Global max for consistent cross-column sizing
    let globalMax = 1;
    types.forEach((genre) => {
      order.forEach((theme) => {
        const v = (data.type_theme_matrix[genre]?.[theme] || 0) * 100;
        if (v > globalMax) globalMax = v;
      });
    });

    const scatterSeries = order.map((theme, ti) => ({
      type: "scatter" as const,
      name: theme,
      data: types.map((genre, gi) => {
        const val = (data.type_theme_matrix[genre]?.[theme] || 0) * 100;
        return [ti, gi, val];
      }),
      // Global-relative: same value = same size across all columns
      symbolSize: (raw: number[]) => {
        const val = raw[2];
        if (val <= 0.5) return 0;
        const pct = val / Math.max(globalMax, 1); // 0..1 globally
        const size = 7 + pct * 73; // 7px min, 80px max — 最大气泡直径≈列宽
        return Math.round(size);
      },
      itemStyle: {
        color: themeColorMap[theme] || "#8b7355",
        borderColor: "rgba(255,255,255,0.55)",
        borderWidth: 1,
        opacity: 0.9,
      },
      label: {
        show: true,
        fontSize: 11,
        fontWeight: 700 as const,
        fontFamily,
        formatter: (p: any) => (p.data[2] > 3 ? p.data[2].toFixed(0) : ""),
        color: isDark(themeColorMap[theme] || "#8b7355")
          ? "#fffefb"
          : "#3d2010",
      },
      emphasis: {
        scale: 1.28,
        focus: "series" as const,
        itemStyle: {
          shadowBlur: 16,
          shadowColor: "rgba(0,0,0,0.28)",
          borderColor: "#5e3a2e",
          borderWidth: 2,
        },
      },
      // 单击选中 — 带深色边框高亮环
      selectedMode: "single" as const,
      select: {
        itemStyle: {
          borderColor: "#3a1a0a",
          borderWidth: 3,
          shadowBlur: 20,
          shadowColor: "rgba(60,30,10,0.45)",
          opacity: 1,
        },
      },
    }));

    // 横轴标签富文本配置 — 每个主题文字后跟对应颜色的 ●
    const axisLabelRich: Record<string, any> = {
      label: {
        fontSize: 12,
        fontWeight: 700,
        fontFamily,
        color: "#4a3525",
        padding: [0, 0, 0, 2],
      },
    };
    for (const theme of order) {
      axisLabelRich[`dot_${theme}`] = {
        fontSize: 10,
        fontFamily,
        color: themeColorMap[theme] || "#8b7355",
        padding: [0, 2, 0, 0],
        verticalAlign: "bottom",
      };
    }

    /* ================================================================
       交互事件
       ================================================================ */
    // 点击气泡 → 记录选中单元格
    chart.off("click");
    chart.on("click", (params: any) => {
      if (params.componentType === "series" && params.data) {
        const ti = params.data[0];
        const gi = params.data[1];
        const val = params.data[2];
        setSelectedCell({
          theme: order[ti],
          genre: types[gi],
          coverage: val,
        });
      } else {
        setSelectedCell(null);
      }
    });

    chart.setOption(
      {
        tooltip: {
          backgroundColor: "#fffefb",
          borderColor: "#c4b08a",
          borderWidth: 1,
          padding: [10, 14],
          textStyle: { color: "#4a3020", fontSize: 12, fontFamily },
          // 十字准星 — hover 时显示横纵参考线
          axisPointer: {
            type: "cross" as const,
            crossStyle: { color: "#b0a090", width: 0.8, type: "dashed" as const },
            label: {
              backgroundColor: "#6a5140",
              color: "#fff",
              fontSize: 10,
              fontFamily,
            },
          },
          formatter: (p: any) => {
            const theme = order[p.data[0]];
            const tc = themeColorMap[theme] || "#8b7355";
            return (
              `<div style="font-family:${fontFamily}">` +
              `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${tc};margin-right:6px;"></span>` +
              `<b style="color:${tc}">${theme}</b> 在 ` +
              `<b style="color:#5e3a2e">${types[p.data[1]]}</b> 中<br/>` +
              `覆盖率: <b>${p.data[2].toFixed(1)}%</b><br/>` +
              `<span style="color:#8b7355;font-size:10px">🖱 点击气泡选中</span></div>`
            );
          },
        },
        grid: {
          left: 105,
          right: 20,
          top: 16,
          bottom: 52,
          show: true,
          borderColor: "#e0dbd0",
          borderWidth: 0.5,
          backgroundColor: "#faf8f5",
        },
        backgroundColor: "transparent",
        xAxis: {
          type: "category",
          data: order,
          position: "bottom",
          boundaryGap: true,
          axisLabel: {
            fontSize: 12,
            fontWeight: 700 as const,
            fontFamily,
            rotate: 20,
            margin: 14,
            interval: 0,
            color: (value: string) => themeColorMap[value] || "#4a3525",
          },
          axisLine: { lineStyle: { color: "#c4b08a" } },
          axisTick: { alignWithLabel: true, show: true, length: 5, lineStyle: { color: "#d4c4a8" } },
          splitLine: {
            show: true,
            lineStyle: { color: "#e8e4dd", width: 0.5, type: "dashed" as const },
          },
        },
        yAxis: {
          type: "category",
          data: types,
          boundaryGap: true,
          axisLabel: {
            fontSize: 12,
            color: "#4a3525",
            fontWeight: 700 as const,
            fontFamily,
          },
          axisLine: { lineStyle: { color: "#c4b08a" } },
          axisTick: { show: false },
          splitLine: {
            show: true,
            lineStyle: { color: "#e8e4dd", width: 0.5, type: "dashed" as const },
          },
        },
        series: scatterSeries,
        animationDuration: 600,
        animationEasing: "cubicOut" as const,
      },
      true,
    );

    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("resize", h);
      chart.dispose();
    };
  }, [mainView, isDark]);

  /* ==================================================================
     Chart 2 — Multi-type Radar (right panel auxiliary)
     初始展示全部 7 种剧目类型的"主题指纹"对比，
     点击气泡矩阵中的类型行后高亮选中类型
     ================================================================== */
  useEffect(() => {
    if (!radarRef.current) return;
    const existing = echarts.getInstanceByDom(radarRef.current);
    if (existing) existing.dispose();
    const chart = echarts.init(radarRef.current);

    const indicator = THEME_ORDER.map((t) => ({
      name: t, max: 100,
    }));

    const matrix = data.type_theme_matrix as any;
    const selectedGenre = selectedCell?.genre || null;
    const availableTypes = TYPE_ORDER.filter((t) => matrix[t]);

    const seriesList: any[] = [];

    // Layer 1: 全部 7 种类型 — 半透明细线，构成"类型指纹对比图"
    availableTypes.forEach((genre) => {
      const color = TYPE_COLORS[genre] || "#b8926a";
      const isSelected = genre === selectedGenre;
      seriesList.push({
        type: "radar",
        name: genre,
        data: [{
          value: THEME_ORDER.map((t) => (matrix[genre]?.[t] || 0) * 100),
          name: genre,
        }],
        symbol: isSelected ? "circle" : "none",
        symbolSize: isSelected ? 5 : 0,
        lineStyle: {
          width: isSelected ? 3 : 1.3,
          color,
          opacity: isSelected ? 0.95 : 0.32,
        },
        areaStyle: isSelected
          ? { opacity: 0.18, color }
          : undefined,
        itemStyle: { color },
        z: isSelected ? 10 : 1,
      });
    });

    // Layer 2: 全局平均 — 虚线参考基线
    const globalAvg = THEME_ORDER.map((t) =>
      data.theme_overall?.find((x: any) => x.name === t)?.pct || 0
    );
    seriesList.push({
      type: "radar", name: "全局平均",
      data: [{ value: globalAvg, name: "全局" }],
      symbol: "none",
      lineStyle: { width: 1, color: "#b0a090", type: "dashed" as const, opacity: 0.45 },
      areaStyle: { opacity: 0.03, color: "#b0a090" },
      itemStyle: { opacity: 0 },
      z: 0,
    });

    chart.setOption({
      tooltip: {
        trigger: "item" as const,
        backgroundColor: "rgba(255,254,251,0.97)",
        borderColor: "rgba(196,176,138,0.5)",
        borderWidth: 1,
        padding: [12, 16],
        textStyle: { fontSize: 12, color: "#4a3020" },
        formatter: (p: any) => {
          const isGlobal = !p.name || p.name === "全局";
          const genreColor = isGlobal ? "#b0a090" : (TYPE_COLORS[p.name] || "#5e3a2e");
          const title = isGlobal ? "全局平均" : p.name;
          let html = `<div style="font-size:13px;font-weight:700;color:${genreColor};margin-bottom:4px">`;
          html += `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${genreColor};margin-right:6px;vertical-align:middle"></span>`;
          html += `${title}</div>`;
          html += `<div style="height:1px;background:rgba(196,176,138,0.15);margin:4px 0 6px"></div>`;
          THEME_ORDER.forEach((t, i) => {
            const val = (p.value?.[i] || 0).toFixed(1);
            html += `<div style="display:flex;justify-content:space-between;gap:16px;line-height:1.7">`;
            html += `<span style="color:#5e3a2e">${t}</span>`;
            html += `<span style="font-weight:600;color:${genreColor}">${val}%</span>`;
            html += `</div>`;
          });
          return html;
        },
      },
      legend: {
        data: [...availableTypes, "全局平均"],
        bottom: 0,
        itemWidth: 10,
        itemHeight: 2,
        itemGap: 10,
        textStyle: { fontSize: 11, color: "#8b7355", fontFamily: "'Noto Serif SC','PT Serif',serif" },
      },
      radar: {
        indicator, shape: "polygon",
        center: ["50%", "48%"], radius: "62%",
        axisName: { fontSize: 11, color: "#5e3a2e", fontWeight: 600, fontFamily: "'Noto Serif SC','PT Serif',serif" },
        splitNumber: 3,
        axisLine: { lineStyle: { color: "#d4c4a8", width: 0.5 } },
        splitLine: { lineStyle: { color: "#e8ddce", width: 0.5 } },
        splitArea: { areaStyle: { color: ["rgba(250,245,237,0.12)", "rgba(255,255,255,0.06)"] } },
      },
      series: seriesList,
      animationDuration: 500,
    }, true);

    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("resize", h);
      chart.dispose();
    };
  }, [selectedCell, mainView]);

  /* ==================================================================
     Chart 3 — 双环流图：内圈类型 → 外圈主题（Dual-ring Flow）
     ================================================================== */
  useEffect(() => {
    if (mainView !== "chord" || !sankeyRef.current) return;
    const chart = echarts.init(sankeyRef.current);

    const themeColors = data.theme_colors as Record<string, string>;
    const matrix = data.type_theme_matrix as any;

    // ── Compute circular positions (dual-ring: types inner, themes outer) ──
    const containerW = sankeyRef.current.clientWidth || 680;
    const containerH = sankeyRef.current.clientHeight || 640;
    const cx = containerW / 2;
    const cy = containerH / 2;
    const outerRadius = Math.min(cx, cy) * 0.72;  // 主题外圈
    const innerRadius = Math.min(cx, cy) * 0.42;  // 类型内圈

    const nodes: any[] = [];

    // Outer ring: 12 themes, evenly spaced starting from top
    THEME_ORDER.forEach((t, i) => {
      const angle = (i / THEME_ORDER.length) * 2 * Math.PI - Math.PI / 2;
      nodes.push({
        name: t,
        symbolSize: 16,
        x: cx + outerRadius * Math.cos(angle),
        y: cy + outerRadius * Math.sin(angle),
        itemStyle: {
          color: themeColors[t] || "#8b7355",
          borderColor: "#fffefb",
          borderWidth: 2,
          shadowBlur: 4,
          shadowColor: "rgba(0,0,0,0.06)",
        },
        label: {
          show: true,
          fontSize: 10,
          fontWeight: 600,
          color: "#4a3020",
          fontFamily: "'Noto Serif SC','PT Serif',serif",
          position: angle > Math.PI * 0.5 && angle < Math.PI * 1.5 ? "left" : "right",
          distance: 12,
        },
        category: "theme",
      });
    });

    // Inner ring: 7 types, evenly spaced starting from top
    TYPE_ORDER.forEach((g, i) => {
      const angle = (i / TYPE_ORDER.length) * 2 * Math.PI - Math.PI / 2;
      nodes.push({
        name: g,
        symbolSize: 21,
        symbol: "roundRect",
        x: cx + innerRadius * Math.cos(angle),
        y: cy + innerRadius * Math.sin(angle),
        itemStyle: {
          color: TYPE_COLORS[g] || "#c4a56e",
          borderColor: "#fffefb",
          borderWidth: 2.5,
          shadowBlur: 6,
          shadowColor: "rgba(0,0,0,0.1)",
        },
        label: {
          show: true,
          fontSize: 11,
          fontWeight: 700,
          color: "#3a1a0a",
          fontFamily: "'Noto Serif SC','PT Serif',serif",
          position: angle > Math.PI * 0.5 && angle < Math.PI * 1.5 ? "left" : "right",
          distance: 12,
        },
        category: "type",
      });
    });

    // ── Build links: ratio ≥ 12% ──
    const MIN_FLOW = 0.12;
    const allRatios: number[] = [];
    TYPE_ORDER.forEach((genre) => {
      THEME_ORDER.forEach((theme) => {
        const ratio = matrix[genre]?.[theme] || 0;
        if (ratio >= MIN_FLOW) allRatios.push(ratio);
      });
    });
    const maxRatio = Math.max(...allRatios, 0.01);

    const links: any[] = [];
    TYPE_ORDER.forEach((genre) => {
      THEME_ORDER.forEach((theme) => {
        const ratio = matrix[genre]?.[theme] || 0;
        if (ratio >= MIN_FLOW) {
          links.push({
            source: theme,
            target: genre,
            value: parseFloat((ratio * 100).toFixed(1)),
            lineStyle: {
              width: Math.max(0.6, (ratio / maxRatio) * 5.5),
              color: themeColors[theme] || "#8b7355",
              curveness: 0.32,
              opacity: 0.38,
            },
          });
        }
      });
    });

    chart.setOption(
      {
        tooltip: {
          trigger: "item",
          triggerOn: "mousemove",
          backgroundColor: "#fffefb",
          borderColor: "#c4b08a",
          borderWidth: 1,
          padding: [10, 14],
          textStyle: { color: "#4a3020", fontSize: 12 },
          formatter: (p: any) => {
            if (p.dataType === "edge") {
              return `<b>${p.data.source}</b> → <b>${p.data.target}</b><br/>关联强度: ${p.data.value}%`;
            }
            if (!p.name) return "";
            return `<b>${p.name}</b>`;
          },
        },
        series: [
          {
            type: "graph",
            layout: "none",
            roam: false,
            draggable: false,
            emphasis: {
              focus: "adjacency" as const,
              lineStyle: { width: 8, opacity: 0.85 },
              itemStyle: { borderWidth: 3, borderColor: "#3a1a0a", shadowBlur: 14, shadowColor: "rgba(0,0,0,.15)" },
            },
            data: nodes,
            links: links,
            lineStyle: {
              color: "source",
              curveness: 0.32,
              opacity: 0.35,
            },
            edgeSymbol: ["none", "none"],
          } as any,
        ],
        animationDuration: 800,
        animationEasing: "cubicOut",
      },
      true,
    );

    // ── Click interaction: type node → navigate to bubble matrix ──
    chart.off("click");
    chart.on("click", (params: any) => {
      if (params.dataType === "node" && params.name && params.data?.category === "type") {
        setSelectedCell({ theme: "", genre: params.name, coverage: 0 });
        setMainView("bubbleMatrix");
      }
    });

    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("resize", h);
      chart.dispose();
    };
  }, [mainView]);

  /* ==================================================================
     Chart 4 — 堆叠柱状图：主题 × 剧目类型比例分布
     ================================================================== */
  useEffect(() => {
    if (mainView !== "stackedBar" || !stackedBarRef.current) return;
    const chart = echarts.init(stackedBarRef.current);

    const matrix = data.type_theme_matrix as any;

    // 每个剧目类型一个 bar series，stack 在一起
    const series = TYPE_ORDER.map((genre) => ({
      name: genre,
      type: "bar",
      stack: "total",
      emphasis: {
        focus: "series",
        itemStyle: { shadowBlur: 8, shadowColor: "rgba(0,0,0,0.2)" },
      },
      itemStyle: {
        color: TYPE_COLORS[genre] || "#c4a56e",
        borderColor: "rgba(255,255,255,0.5)",
        borderWidth: 1,
      },
      data: THEME_ORDER.map((theme) =>
        parseFloat(((matrix[genre]?.[theme] || 0) * 100).toFixed(1))
      ),
    }));

    chart.setOption({
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: "#fffefb",
        borderColor: "#c4b08a",
        borderWidth: 1,
        padding: [12, 16],
        textStyle: { color: "#4a3020", fontSize: 12 },
        formatter: (params: any) => {
          const sorted = [...params].sort((a: any, b: any) => b.value - a.value);
          const themeName = sorted[0]?.axisValue || "";
          let html = `<b style="font-size:14px">${themeName}</b><br/>`;
          sorted.forEach((p: any) => {
            if (p.value > 0) {
              html += `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${p.color};margin-right:6px;"></span>${p.seriesName}: <b>${p.value}%</b><br/>`;
            }
          });
          return html;
        },
      },
      legend: {
        top: 8,
        itemGap: 12,
        textStyle: { fontSize: 11, color: "#5e3a2e", fontWeight: 500 },
        selected: Object.fromEntries(TYPE_ORDER.map((g) => [g, true])),
      },
      grid: { left: 48, right: 24, top: 56, bottom: 36 },
      xAxis: {
        type: "category",
        data: THEME_ORDER,
        axisLabel: {
          rotate: 30,
          fontSize: 11,
          fontWeight: 600,
          color: "#4a3020",
          fontFamily: "'Noto Serif SC','PT Serif',serif",
        },
        axisTick: { alignWithLabel: true },
        axisLine: { lineStyle: { color: "#c4b08a" } },
      },
      yAxis: {
        type: "value",
        name: "出现比例 (%)",
        nameLocation: "middle",
        nameGap: 42,
        nameTextStyle: { fontSize: 10, color: "#8b7355", fontWeight: 500 },
        axisLabel: { fontSize: 10, color: "#8b7355", formatter: "{value}%" },
        splitLine: { lineStyle: { color: "#e8ddce", type: "dashed" } },
      },
      series: series as any,
      animationDuration: 600,
      animationEasing: "cubicOut",
    }, true);

    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("resize", h);
      chart.dispose();
    };
  }, [mainView]);

  /* ==================================================================
     Chart 5 — 矩阵热力图：主题 × 剧目类型共现强度
     ================================================================== */
  useEffect(() => {
    if (mainView !== "matrixHeatmap" || !matrixHeatmapRef.current) return;
    const chart = echarts.init(matrixHeatmapRef.current);

    const matrix = data.type_theme_matrix as any;
    const themeYOrder = CLUSTERED_ORDER;

    // 构建热力图数据 [[xIdx, yIdx, value], ...]
    let globalMax = 0;
    const heatData: number[][] = [];
    TYPE_ORDER.forEach((genre, xi) => {
      themeYOrder.forEach((theme, yi) => {
        const val = parseFloat(((matrix[genre]?.[theme] || 0) * 100).toFixed(1));
        heatData.push([xi, yi, val]);
        if (val > globalMax) globalMax = val;
      });
    });

    chart.setOption({
      tooltip: {
        backgroundColor: "#fffefb",
        borderColor: "#c4b08a",
        borderWidth: 1,
        padding: [10, 14],
        textStyle: { color: "#4a3020", fontSize: 12 },
        formatter: (params: any) => {
          const theme = themeYOrder[params.data[1]];
          const genre = TYPE_ORDER[params.data[0]];
          const val = params.data[2];
          return `<b>${theme}</b> 出现在 <b>${genre}</b><br/>比例: <b style="font-size:16px">${val}%</b>`;
        },
      },
      grid: { left: 100, right: 60, top: 36, bottom: 36 },
      xAxis: {
        type: "category",
        data: TYPE_ORDER,
        position: "top",
        axisLabel: {
          fontSize: 12,
          fontWeight: 700,
          color: "#4a3020",
          fontFamily: "'Noto Serif SC','PT Serif',serif",
        },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#c4b08a" } },
        splitArea: { show: true, areaStyle: { color: ["rgba(0,0,0,0)"] } },
      },
      yAxis: {
        type: "category",
        data: themeYOrder,
        inverse: true,
        axisLabel: {
          fontSize: 11,
          fontWeight: 600,
          color: "#4a3020",
          fontFamily: "'Noto Serif SC','PT Serif',serif",
        },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#c4b08a" } },
        splitArea: { show: true, areaStyle: { color: ["rgba(0,0,0,0)"] } },
      },
      visualMap: {
        min: 0,
        max: Math.ceil(globalMax / 10) * 10,
        calculable: true,
        orient: "vertical",
        right: 4,
        top: "center",
        itemWidth: 16,
        itemHeight: 200,
        textStyle: { color: "#5e3a2e", fontSize: 10 },
        inRange: {
          color: [
            "#faf7f2",
            "#f0e6d8",
            "#e6c8a8",
            "#d4a878",
            "#c48a5c",
            "#a8653e",
            "#7a3a22",
          ],
        },
        outOfRange: { color: ["#5e2a12"] },
      },
      series: [{
        type: "heatmap",
        data: heatData,
        label: {
          show: true,
          fontSize: 10,
          fontWeight: 600,
          fontFamily: "'Helvetica Neue', Arial, 'PingFang SC', sans-serif",
          formatter: (params: any) => {
            const val = params.data[2];
            return val > 0 ? val.toFixed(0) : "";
          },
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 12,
            shadowColor: "rgba(0,0,0,0.35)",
            borderColor: "#3a1a0a",
            borderWidth: 2,
          },
          label: { fontSize: 13, fontWeight: 700 },
        },
        itemStyle: {
          borderColor: "rgba(255,255,255,0.6)",
          borderWidth: 2,
          borderRadius: 2,
        },
      } as any],
      animationDuration: 500,
      animationEasing: "cubicOut",
    }, true);

    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("resize", h);
      chart.dispose();
    };
  }, [mainView]);

  /* ==================================================================
     Chart 6b — Theme Combo Bar+Line (right panel, bubble matrix mode)
     替换右下角"主题关联与相似度"文字板块
     ================================================================== */
  useEffect(() => {
    if (mainView !== "bubbleMatrix" || !rightComboRef.current) return;
    const chart = echarts.init(rightComboRef.current);

    const combos = (data.top_combos || []).slice(0, 15);
    const labels = combos.map((c: any) => {
      const themes = c.themes as string[];
      return themes.length > 4 ? themes.slice(0, 4).join("+") + "…" : c.combo;
    });
    const counts = combos.map((c: any) => c.count);
    const themeCounts = combos.map((c: any) => c.themes.length);

    const colors = combos.map((_: any, i: number) => {
      if (themeCounts[i] === 1) return "#B89B6D"; // 琉璃金
      return "#96544D"; // 朱砂红
    });

    chart.setOption({
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        confine: true,
        appendToBody: true,
        z: 9999,
        formatter: (p: any) => {
          const c = combos[p[0]?.dataIndex];
          if (!c) return "";
          let html = `<b>${c.combo}</b><br/>${c.count} 本 (${c.pct}%)<br/>`;
          html += `主要类型: ${c.primary_genre}<br/>`;
          html += `示例: ${(c.examples || []).map((e: any) => e.title).join(", ")}`;
          return html;
        },
      },
      grid: { left: 36, right: 12, top: 8, bottom: 56 },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: {
          rotate: 28,
          fontSize: 8,
          color: "#5e3a2e",
          interval: 0,
          overflow: "truncate",
          width: 56,
        },
        axisTick: { alignWithLabel: true },
      },
      yAxis: {
        type: "value",
        name: "剧本数",
        nameGap: 30,
        nameLocation: "middle" as const,
        nameTextStyle: { fontSize: 9, color: "#8b7355", fontWeight: 500 },
        axisLabel: { fontSize: 9, color: "#8b7355" },
        splitLine: { lineStyle: { color: "#e8ddce" } },
      },
      series: [
        {
          type: "bar",
          data: counts.map((v: number, i: number) => ({
            value: v,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: colors[i] },
                { offset: 1, color: colors[i] + "88" },
              ]),
              borderRadius: [3, 3, 0, 0],
            },
          })),
          barMaxWidth: 20,
          label: {
            show: true,
            position: "top",
            fontSize: 8,
            color: "#8b7355",
          },
          emphasis: {
            itemStyle: { shadowBlur: 6, shadowColor: "rgba(0,0,0,0.2)" },
          },
        },
        {
          type: "line",
          data: counts,
          smooth: true,
          symbol: "circle",
          symbolSize: 4,
          lineStyle: {
            width: 1.5,
            color: "#5E6B76",
          },
          itemStyle: {
            color: "#5E6B76",
          },
        } as any,
      ],
      animationDuration: 400,
    }, true);

    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("resize", h);
      chart.dispose();
    };
  }, [mainView]);

  /* ==================================================================
     Chart 7 — Theme Chord (ECharts circular graph)
     ================================================================== */
  useEffect(() => {
    if (mainView !== "chord" || !chordRef.current) return;
    const chart = echarts.init(chordRef.current);
    const chordEdges = (data.chord_edges || []) as Array<{ source: string; target: string; value: number }>;
    const themeColors = data.theme_colors as Record<string, string>;
    const themeNames = THEME_ORDER;

    // Nodes: 12 themes around a circle
    const nodes = themeNames.map((t) => ({
      id: t,
      name: t,
      symbolSize: 22,
      itemStyle: { color: themeColors[t] || "#8b7355", borderColor: "#fffefb", borderWidth: 2 },
      label: {
        show: true,
        position: "outside" as const,
        distance: 14,
        fontSize: 11,
        fontWeight: 600 as const,
        color: "#4a3020",
        fontFamily: "'Noto Serif SC','PT Serif',serif",
      },
    }));

    // Edges filtered to top 40
    const topEdges = [...chordEdges].sort((a, b) => b.value - a.value).slice(0, 40);
    const maxVal = Math.max(...topEdges.map((e) => e.value), 1);
    const links = topEdges.map((e) => ({
      source: e.source,
      target: e.target,
      value: e.value,
      lineStyle: {
        width: Math.max(0.6, (e.value / maxVal) * 6),
        color: themeColors[e.source] || "#8b7355",
        opacity: 0.5,
        curveness: 0.2,
      },
    }));

    chart.setOption({
      tooltip: {
        backgroundColor: "#fffefb",
        borderColor: "#c4b08a",
        borderWidth: 1,
        padding: [10, 14],
        textStyle: { color: "#4a3020", fontSize: 12 },
        formatter: (p: any) => {
          if (p.dataType === "edge") {
            return `<b>${p.data.source}</b> ↔ <b>${p.data.target}</b><br/>共现: ${p.data.value} 本`;
          }
          return `<b>${p.name}</b>`;
        },
      },
      series: [
        {
          type: "graph",
          layout: "circular",
          circular: { rotateLabel: true },
          roam: false,
          draggable: false,
          data: nodes,
          links: links,
          emphasis: {
            focus: "adjacency" as const,
            lineStyle: { width: 8, opacity: 0.9 },
            itemStyle: { borderWidth: 3, borderColor: "#3a1a0a", shadowBlur: 12, shadowColor: "rgba(0,0,0,.2)" },
          },
          lineStyle: { color: "source", curveness: 0.25, opacity: 0.35 },
          label: { show: true, fontSize: 10 },
        } as any,
      ],
      animationDuration: 800,
      animationEasing: "cubicOut",
    }, true);

    // Click node → switch to heatmap and highlight theme for cross-chart linking
    chart.off("click");
    chart.on("click", (params: any) => {
      if (params.dataType === "node" && params.name) {
        if (selectedCell && selectedCell.theme === params.name && (mainView as string) === "bubbleMatrix") {
          setSelectedCell(null);
        } else {
          setSelectedCell({ theme: params.name, genre: "", coverage: 0 });
          if ((mainView as string) === "chord") setMainView("bubbleMatrix");
        }
      }
    });

    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("resize", h);
      chart.dispose();
    };
  }, [mainView, selectedCell, setMainView]);

  /* ==================================================================
     Report Sidebar Content
     ================================================================== */
  const reportContent = useMemo(() => {
    switch (reportTab) {
      case "report": return <ReportContent />;
      case "method": return <MethodTab />;
      case "combos": return <CombosTab />;
      case "stats": return <StatsTab />;
      default: return null;
    }
  }, [reportTab]);

  return (
    <div className="t3-screen">
      {/* ═══════════ Topbar ═══════════ */}
      <header className="t3-topbar">
        <div className="t3-topbar-title-group">
          <h1><span className="t3-brand-icon">📜</span> 剧本主题提取与跨剧本比较</h1>
          <span className="t3-topbar-desc">关键词主题建模+统计检验 — 提取12维语义主题向量，量化七种剧目类型的主题指纹与跨类型关联模式</span>
        </div>
        <button
          className="t3-topbar-report-btn"
          onClick={() => { setReportSidebarOpen(true); setReportTab("report"); }}
          title="查看任务三设计流程报告 — 含主题向量建模·跨剧本关联分析·六视图全景设计"
        >
          <span className="t3-report-btn-icon">📋</span>
          <span className="t3-report-btn-text">
            <span className="t3-report-btn-label">设计流程报告</span>
            <span className="t3-report-btn-sub">方法 · 参数 · 流程</span>
          </span>
          <span className="t3-report-btn-arrow">→</span>
        </button>
      </header>

      {/* ═══════════ Main Grid ═══════════ */}
      <div className={`t3-main-grid no-left${mainView === "chord" ? " chord-full" : ""}${mainView === "matrixHeatmap" ? " heatmap-split" : ""}`}>

        {/* ── CENTER ── */}
        <div className="t3-center" style={mainView === "chord" ? { width: "100%" } : undefined}>
          <div className={`t3-main-vis ${mainView === "bubbleMatrix" ? "t3-bubble-academic" : ""}`}>
            <nav className="t3-view-tabs">
              {(Object.entries(VIEW_LABELS) as [MainView, string][]).map(([v, label]) => (
                <button
                  key={v}
                  className={`t3-view-tab ${mainView === v ? "active" : ""}`}
                  onClick={() => setMainView(v)}
                >
                  <span className="t3-view-icon">{VIEW_ICONS[v]}</span>
                  {label}
                </button>
              ))}
            </nav>
            <div className="t3-chart-wrap">
              {mainView === "bubbleMatrix" && <div ref={heatmapRef} className="t3-chart-box" />}
              {mainView === "chord" && (
                <div className="t3-chord-merged">
                  <div className="t3-chord-half">
                    <div className="t3-chord-subtitle">主题-剧目类型二部图 🔗</div>
                    <div ref={sankeyRef} className="t3-chart-box" />
                  </div>
                  <div className="t3-chord-half">
                    <div className="t3-chord-subtitle">主题间关系和弦 🎶</div>
                    <div ref={chordRef} className="t3-chart-box" />
                  </div>
                </div>
              )}
              {mainView === "stackedBar" && <div ref={stackedBarRef} className="t3-chart-box" />}
              {mainView === "matrixHeatmap" && <div ref={matrixHeatmapRef} className="t3-chart-box" />}
            </div>
          </div>
        </div>

        {/* ── RIGHT ── */}
        <div className={`t3-side-panel${mainView === "matrixHeatmap" ? " t3-side-panel-heatmap" : ""}`}
          style={mainView === "chord" ? { display: "none" } : undefined}>
          {/* 类型主题画像 (multi-type radar) — 仅气泡矩阵模式显示 */}
          {mainView === "bubbleMatrix" && (
            <div className="t3-side-block t3-side-chart-block">
              <div className="t3-side-block-header">
                <span className="t3-side-block-icon">🎯</span>
                <h3>类型主题画像</h3>
                {selectedCell?.genre ? (
                  <span className="t3-mini-radar-genre" style={{ color: TYPE_COLORS[selectedCell.genre] || "#b8926a" }}>
                    {selectedCell.genre}
                  </span>
                ) : (
                  <span className="t3-mini-radar-genre" style={{ color: "#8b7355" }}>全部对比</span>
                )}
              </div>
              <div ref={radarRef} className="t3-mini-radar-box" />
              <div className="t3-side-block-note">
                🖱 点击气泡矩阵中的类型行 → 高亮选中类型<br />半透明细线 = 各类型主题指纹，虚线 = 全局平均
              </div>
            </div>
          )}

          {/* 主题原形 + 丰度 (环形流图/堆叠柱状图显示于右下角) */}
          {mainView === "stackedBar" && (
            <div className="t3-side-block t3-bottom-block">
              <div className="t3-hpair">
                <div className="t3-hpair-col">
                  <div className="t3-hpair-subtitle">🏛️ 主题组合原型</div>
                  <div className="t3-archetype-list">
                    {archetypes.slice(0, 6).map((a: any) => (
                      <button key={a.id}
                        className={`t3-archetype-card ${selectedArchetype === a.id ? "expanded" : ""}`}
                        onClick={() => setSelectedArchetype(selectedArchetype === a.id ? null : a.id)}
                        style={{ borderLeftColor: a.color }}>
                        <div className="t3-arch-header">
                          <span className="t3-arch-name">{a.name}</span>
                          <span className="t3-arch-count">{a.count}本</span>
                        </div>
                        <div className="t3-arch-subtitle">{a.subtitle}</div>
                        {selectedArchetype === a.id && (
                          <div className="t3-arch-detail">
                            <div className="t3-arch-themes">
                              <span className="t3-arch-label">核心:</span>
                              {a.core_themes.map((t: string) => (
                                <span key={t} className="t3-arch-tag core" style={{ backgroundColor: (data.theme_colors as any)[t] + "30", borderColor: (data.theme_colors as any)[t] }}>{t}</span>
                              ))}
                              {a.satellite_themes.map((t: string) => (
                                <span key={t} className="t3-arch-tag" style={{ backgroundColor: (data.theme_colors as any)[t] + "12", borderColor: (data.theme_colors as any)[t] + "60" }}>{t}</span>
                              ))}
                            </div>
                            <p className="t3-arch-desc">{a.description}</p>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="t3-hpair-note">基于共现强度和类型亲和力发现的6种代表性主题组合模式</div>
                </div>
                <div className="t3-hpair-col">
                  <div className="t3-hpair-subtitle">📋 主题丰度</div>
                  {data.type_diversity && TYPE_ORDER.map((t) => {
                    const d = data.type_diversity[t];
                    if (!d) return null;
                    const maxCount = Math.max(...TYPE_ORDER.map((g) => data.type_diversity[g]?.avg_theme_count || 0));
                    return (
                      <div key={t} className="t3-diversity-row" style={{ borderLeftColor: TYPE_COLORS[t] || "#b8926a" }}>
                        <span className="t3-div-type">{t}</span>
                        <span className="t3-div-bar-wrap">
                          <span className="t3-div-bar" style={{ width: `${((d.avg_theme_count / maxCount) * 100).toFixed(0)}%`, backgroundColor: TYPE_COLORS[t] + "88" }} />
                        </span>
                        <span className="t3-div-stat">{d.avg_theme_count}主题 · H={d.avg_entropy}</span>
                      </div>
                    );
                  })}
                  <div className="t3-hpair-note">公案戏主题最丰富({(data.type_diversity as any)?.公案戏?.avg_theme_count}/本)，技法展示戏主题最单一({(data.type_diversity as any)?.['技法展示戏']?.avg_theme_count}/本)</div>
                </div>
              </div>
            </div>
          )}

          {/* 主题关联与相似度 — 环形流图/堆叠柱状视图显示 */}
          {mainView === "stackedBar" && (
            <div className="t3-side-block">
              <div className="t3-side-block-header">
                <span className="t3-side-block-icon">🔗</span>
                <h3>主题关联与相似度</h3>
              </div>
              <div className="t3-hpair">
                <div className="t3-hpair-col">
                  <div className="t3-hpair-subtitle">最强主题关联 (NPMI)</div>
                  {(data.pmi_scores || [])
                    .sort((a: any, b: any) => b.npmi - a.npmi)
                    .slice(0, 8)
                    .map((p: any, i: number) => (
                      <div key={i} className="t3-pmi-row">
                        <span style={{ color: (data.theme_colors as any)[p.pair[0]], fontSize: 11 }}>
                          {p.pair[0]}
                        </span>
                        <span className="t3-pmi-connector">↔</span>
                        <span style={{ color: (data.theme_colors as any)[p.pair[1]], fontSize: 11 }}>
                          {p.pair[1]}
                        </span>
                        <span className="t3-pmi-val">
                          {p.count}本 NPMI{p.npmi > 0 ? "+" : ""}{p.npmi.toFixed(2)}
                        </span>
                      </div>
                    ))}
                </div>
                <div className="t3-hpair-col">
                  <div className="t3-hpair-subtitle">类型主题相似度</div>
                  {data.genre_distance &&
                    TYPE_ORDER.map((g1) => {
                      const others = TYPE_ORDER.filter((g2) => g1 !== g2).map((g2) => ({
                        genre: g2,
                        distance: data.genre_distance[g1]?.[g2] || 0,
                        similarity: (
                          1 - (data.genre_distance[g1]?.[g2] || 0)
                        ).toFixed(2),
                      }));
                      others.sort((a, b) => a.distance - b.distance);
                      const closest = others[0];
                      return (
                        <div key={g1} className="t3-genre-sim-row">
                          <span className="t3-genre-sim-dot" style={{ backgroundColor: TYPE_COLORS[g1] }} />
                          <span className="t3-genre-sim-label">{g1}</span>
                          <span className="t3-genre-sim-arrow">→</span>
                          <span className="t3-genre-sim-target">≈{closest.genre}({closest.similarity})</span>
                        </div>
                      );
                    })}
                </div>
              </div>
              <div className="t3-hpair-note">
                NPMI=PMI/−log₂P(AB)，值域[−1,1]，正值表示正相关，&gt;0.1为显著；
                相似度=1−余弦距离，基于12维主题覆盖率向量
              </div>
            </div>
          )}

          {/* 主题组合分布（右侧迷你版）— 气泡矩阵模式下显示，与雷达图等分高度 */}
          {/* 共现热力图右侧：剧本检索+雷达对比面板 */}
          {mainView === "matrixHeatmap" && (
            <HeatmapComparePanel />
          )}

          {/* 主题组合分布（右侧迷你版）— 气泡矩阵模式下显示，与雷达图等分高度 */}
          {mainView === "bubbleMatrix" && (
            <div className="t3-side-block t3-side-chart-block">
              <div className="t3-side-block-header">
                <span className="t3-side-block-icon">🧩</span>
                <h3>主题组合分布</h3>
              </div>
              <div ref={rightComboRef} className="t3-right-combo-box" />
              <div className="t3-side-block-note">
                前15个主题组合的频次分布。金色=单主题组合，朱砂色=多主题组合，灰色折线=趋势线
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════ Report Sidebar ═══════════ */}
      <div className={`t3-report-backdrop ${reportSidebarOpen ? "visible" : ""}`} onClick={() => setReportSidebarOpen(false)} />
      <aside className={`t3-report-sidebar ${reportSidebarOpen ? "open" : ""}`}>
        <div className="t3-report-sidebar-header">
          <span className="t3-report-sidebar-header-icon">📋</span>
          <h2>主题结构 · 设计流程报告</h2>
          <button className="t3-report-sidebar-close" onClick={() => setReportSidebarOpen(false)}>✕</button>
        </div>
        <nav className="t3-report-tabs">
          {REPORT_TAB_LABELS.map(t => (
            <button
              key={t.id}
              className={`t3-report-tab ${reportTab === t.id ? "active" : ""}`}
              onClick={() => setReportTab(t.id)}
            >
              <span className="t3-report-tab-icon">{t.icon}</span>
              <span className="t3-report-tab-label">{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="t3-report-sidebar-body">{reportContent}</div>
      </aside>
    </div>
  );
};

/* ================================================================
   Report Content Component
   ================================================================ */
const ReportContent: React.FC = () => (
  <div className="t3-report-content">
    <p className="t3-report-subtitle">戏脉寻踪 · 剧本主题提取与跨剧本比较</p>

    <h3>研究框架与方法</h3>
    <p>从 1,473 本京剧剧本的情节摘要出发，构建 12 维主题关键词体系（覆盖家庭伦理、宫廷朝堂、生死离别、征战讨伐、智谋韬略、冤案昭雪、侠义江湖、爱情姻缘、神话灵异、科举功名、权谋斗争、忠义报国），采用加权计分 score=Σ(count×len) 提取主题向量，通过卡方独立性检验（全部 12 主题 p&lt;0.01）验证主题-类型关联显著性，结合 PMI/NPMI 共现分析和 UPGMA 层次聚类，揭示七种剧目类型的"主题指纹"。</p>

    <h3>关键发现</h3>
    <ul>
      <li><b>神话灵异</b>区分度最高 (χ²≈370)，神话戏中覆盖率达 83%（全局仅 19%）</li>
      <li><b>公案戏</b>主题最丰富（平均 5.2 主题/本），技法展示戏最单一（~1.5，样本仅 17 本）</li>
      <li><b>"宫廷+家族"</b>双核叙事空间：41.9% 剧本同时涉及宫廷朝堂与家庭伦理</li>
      <li>智谋韬略↔权谋斗争 NPMI=+0.26，为最强主题共现对</li>
      <li><b>6 种主题组合原型</b>：宫廷权谋型 / 家庭伦理型 / 征战智略型 / 侠义公案型 / 神话灵异型 / 才子佳人型</li>
    </ul>

    <h3>数据与方法验证</h3>
    <p>每条结论均有统计依据：卡方独立性检验（scipy.stats.chi2_contingency, dof=6, p&lt;0.01）、类型-全局覆盖率差异分析、主题丰度均值+Shannon熵、PMI/NPMI 共现评分、余弦相似度矩阵。具体数据详见"统计检验"抽屉页。</p>

    <h3>跨任务协同</h3>
    <p>与 Task1（角色级行当分析）和 Task2（网络级角色关系分析）构成从"个体→关系→主题"的三层京剧数字人文研究框架，共享剧目类型标签体系。主题向量数据同时供 Task5 星图可视化消费。</p>
  </div>
);

/* ================================================================
   Drawer Tab 1 — 主题提取方法 (Method)
   ================================================================ */
const MethodTab: React.FC = () => {
  const data = p3data as any;
  const examples = data.extraction_examples || [];
  const themeOrder = data.theme_order as string[];
  const themeColors = data.theme_colors as Record<string, string>;

  return (
    <div className="t3-method-tab">
      <section className="t3-method-section">
        <h4>关键词匹配提取方法</h4>
        <p>
          本系统采用基于关键词词典的多标签主题分类方法，从每本剧本的情节摘要中提取主题向量。12
          个主题维度各有一组经过戏曲领域专家验证的关键词，通过匹配情节文本中出现的关键词频次，
          计算归一化的主题得分向量。当某主题得分超过自适应阈值时，该主题标记为"激活"状态。
        </p>
      </section>

      <section className="t3-method-section">
        <h4>12维主题关键词体系</h4>
        <div className="t3-method-theme-grid">
          {themeOrder.map((t: string) => (
            <div
              key={t}
              className="t3-method-theme-card"
              style={{ borderLeftColor: themeColors[t] }}
            >
              <div className="t3-method-theme-name" style={{ color: themeColors[t] }}>
                <span
                  className="t3-method-theme-dot"
                  style={{ backgroundColor: themeColors[t] }}
                />
                {t}
              </div>
              <div className="t3-method-theme-stats">
                覆盖 {(data.theme_overall as any[])?.find((x: any) => x.name === t)?.pct}% 剧本
                ({data.theme_overall?.find((x: any) => x.name === t)?.count}本)
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="t3-method-section">
        <h4>提取实例</h4>
        <p className="t3-method-note">
          下表展示从真实剧本情节中提取主题的过程，包含情节摘要和匹配到的主题关键词。
        </p>
        {examples.map((ex: any, i: number) => (
          <div key={i} className="t3-extract-card">
            <div className="t3-extract-title">
              {ex.title} <span className="t3-extract-genre">{ex.genre}</span>
              <span className="t3-extract-count">{ex.theme_count} 个主题</span>
            </div>
            <div className="t3-extract-plot">{ex.plot}...</div>
            <div className="t3-extract-themes">
              {ex.themes.map((t: string) => (
                <span
                  key={t}
                  className="t3-extract-theme-tag"
                  style={{
                    backgroundColor: themeColors[t] + "22",
                    borderColor: themeColors[t],
                  }}
                >
                  {t}
                  {ex.keywords?.[t]?.length > 0 && (
                    <span className="t3-extract-kw">
                      : {ex.keywords[t].slice(0, 3).join(", ")}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};

/* ================================================================
   Drawer Tab 2 — 组合模式详情 (Combos)
   ================================================================ */
const CombosTab: React.FC = () => {
  const [filterGenre, setFilterGenre] = useState<string>("全部");
  const data = p3data as any;
  const themeColors = data.theme_colors as Record<string, string>;

  const allCombos = data.top_combos || [];
  const filtered =
    filterGenre === "全部"
      ? allCombos
      : allCombos.filter(
        (c: any) => (c.genre_dist?.[filterGenre] || 0) > 0
      );

  return (
    <div className="t3-combos-tab">
      <div className="t3-combos-filter">
        <span className="t3-combos-filter-label">筛选类型:</span>
        {["全部", ...TYPE_ORDER].map((g) => (
          <button
            key={g}
            className={`t3-combos-filter-btn ${filterGenre === g ? "active" : ""}`}
            onClick={() => setFilterGenre(g)}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="t3-combos-list">
        {filtered.map((c: any, i: number) => (
          <div key={i} className="t3-combo-detail-card">
            <div className="t3-combo-detail-header">
              <span className="t3-combo-detail-rank">#{i + 1}</span>
              <span className="t3-combo-detail-count">
                {c.count} 本 ({c.pct}%)
              </span>
              <span className="t3-combo-detail-primary">
                主类型: {c.primary_genre}
              </span>
            </div>
            <div className="t3-combo-detail-themes">
              {c.themes.length === 0 ? (
                <span className="t3-combo-detail-none">(无激活主题)</span>
              ) : (
                c.themes.map((t: string) => (
                  <span
                    key={t}
                    className="t3-combo-detail-tag"
                    style={{
                      backgroundColor: themeColors[t] + "28",
                      borderColor: themeColors[t],
                    }}
                  >
                    {t}
                  </span>
                ))
              )}
            </div>
            {c.examples?.length > 0 && (
              <div className="t3-combo-detail-examples">
                示例: {c.examples.map((e: any) => e.title).join(" · ")}
              </div>
            )}
            <div className="t3-combo-detail-genre-dist">
              {TYPE_ORDER.map((g: string) => {
                const n = c.genre_dist?.[g] || 0;
                if (n === 0) return null;
                return (
                  <span
                    key={g}
                    className="t3-combo-detail-gbar"
                    style={{
                      backgroundColor: TYPE_COLORS[g],
                      flex: n,
                      minWidth: n > 10 ? 30 : 12,
                    }}
                    title={`${g}: ${n}本`}
                  >
                    {n > 5 ? g : ""}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ================================================================
   Drawer Tab 3 — 统计检验 (Stats)
   ================================================================ */
const StatsTab: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const data = p3data as any;
  const themeColors = data.theme_colors as Record<string, string>;

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);

    const themeOrder = data.theme_order as string[];
    const chiData = themeOrder.map((t: string) => {
      const chi = data.chi_square?.[t];
      return {
        name: t,
        value: chi?.chi2 || 0,
        itemStyle: { color: themeColors[t] },
      };
    });

    chart.setOption({
      tooltip: {
        formatter: (p: any) => {
          const dof = data.chi_square?.[p.name]?.dof ?? 6;
          const critVal = dof === 6 ? 12.59 : 11.07;
          return `<b>${p.name}</b><br/>χ² = ${p.value.toFixed(1)}<br/>dof = ${dof}<br/>` +
            (p.value > critVal ? "p < 0.05 (显著)" : "p ≥ 0.05 (不显著)");
        },
      },
      grid: { left: 100, right: 30, top: 20, bottom: 45 },
      xAxis: {
        type: "value",
        name: "χ² 值",
        nameTextStyle: { fontSize: 10, color: "#8b7355" },
        axisLabel: { fontSize: 9, color: "#8b7355" },
        splitLine: { lineStyle: { color: "#e8ddce" } },
      },
      yAxis: {
        type: "category",
        data: chiData
          .sort((a: any, b: any) => b.value - a.value)
          .map((d: any) => d.name),
        axisLabel: { fontSize: 11, color: "#5e3a2e", fontWeight: 500 },
      },
      series: [
        {
          type: "bar",
          data: chiData
            .sort((a: any, b: any) => b.value - a.value)
            .map((d: any) => ({
              value: d.value,
              itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                  { offset: 0, color: themeColors[d.name] + "88" },
                  { offset: 1, color: themeColors[d.name] },
                ]),
                borderRadius: [0, 4, 4, 0],
              },
            })),
          barMaxWidth: 22,
          label: {
            show: true,
            position: "right",
            fontSize: 10,
            color: "#8b7355",
            formatter: (p: any) => p.value.toFixed(1),
          },
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { type: "dashed", color: "#96544d", width: 1.5 },
            label: {
              formatter: "p=0.05 临界值  χ²=12.59 (dof=6)",
              fontSize: 9,
              color: "#96544d",
              position: "start",
              distance: [5, 25],
            },
            data: [{ xAxis: 12.59 }],
          },
        } as any,
      ],
      animationDuration: 500,
    }, true);

    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("resize", h);
      chart.dispose();
    };
  }, []);

  return (
    <div className="t3-stats-tab">
      <section className="t3-method-section">
        <h4>卡方独立性检验</h4>
        <p>
          对每个主题进行 χ² 独立性检验 (dof = 6)，判断该主题在不同剧目类型间的分布是否存在
          统计显著差异。χ² 值越大，该主题受剧目类型的影响越强。
        </p>
        <div ref={ref} className="t3-drawer-chart-half" />
      </section>

      <section className="t3-method-section">
        <h4>类型间主题距离矩阵</h4>
        <div className="t3-distance-matrix">
          <table>
            <thead>
              <tr>
                <th></th>
                {TYPE_ORDER.map((g) => (
                  <th key={g} style={{ color: TYPE_COLORS[g] }}>
                    {g}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TYPE_ORDER.map((g1) => (
                <tr key={g1}>
                  <td style={{ color: TYPE_COLORS[g1], fontWeight: 700 }}>{g1}</td>
                  {TYPE_ORDER.map((g2) => {
                    const dist = data.genre_distance?.[g1]?.[g2];
                    const sim = dist != null ? 1 - dist : 0;
                    const bg =
                      g1 === g2
                        ? "transparent"
                        : `rgba(180, 140, 100, ${(sim * 0.5).toFixed(2)})`;
                    return (
                      <td
                        key={g2}
                        style={{
                          background: bg,
                          textAlign: "center",
                          fontWeight: g1 === g2 ? 700 : 400,
                          fontSize: 12,
                          color:
                            g1 === g2
                              ? TYPE_COLORS[g1]
                              : sim > 0.85
                                ? "#5e3a2e"
                                : "#8b7355",
                        }}
                      >
                        {g1 === g2 ? "-" : sim.toFixed(2)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="t3-method-note">
          基于 12 维主题覆盖率向量的余弦相似度。值越接近 1 表示两类型主题构成越相似。
        </p>
      </section>

      <section className="t3-method-section">
        <h4>关键发现</h4>
        <ul className="t3-findings-list">
          <li>
            <b>神话灵异</b>的卡方值最高 (χ²=
            {data.chi_square?.["神话灵异"]?.chi2?.toFixed(0)})
            ，表明它是区分剧目类型最显著的主题。
          </li>
          <li>
            <b>征战讨伐</b>和<b>爱情姻缘</b>同样具有极高的类型区分度，在不同类型间分布差异巨大。
          </li>
          <li>
            类型主题相似度分析显示，<b>爱情戏与家庭戏</b>主题构成最为接近，而<b>神话戏与公案戏</b>差异最大。
          </li>
          <li>
            <b>忠义报国</b>的卡方值最低
            (χ²={data.chi_square?.["忠义报国"]?.chi2?.toFixed(1)}
            )，表明它在各类型间的分布较为均匀，是一个跨类型的普遍主题。
          </li>
        </ul>
      </section>
    </div>
  );
};

/* ================================================================
   HeatmapComparePanel — 热力图右侧：剧本检索+雷达对比
   ================================================================ */
const THEME_6 = ["历史", "家庭", "公案", "侠义", "爱情", "神话"];

interface PlayRadarData {
  title: string;
  genre: string;
  radar: number[]; // 6 维, 0-100
  roles: { 生: number; 旦: number; 净: number; 丑: number };
  highlight: string;
  conflict: number; // 冲突烈度 0-100
  emotion: number;  // 情感饱和度 0-100
}

// 六维雷达指标 → 原12维主题字段映射
const RADAR_THEME_MAP: Record<string, string[]> = {
  "历史": ["宫廷朝堂", "征战讨伐", "忠义报国", "生死离别"],
  "家庭": ["家庭伦理", "科举功名", "爱情姻缘"],
  "公案": ["冤案昭雪", "权谋斗争", "智谋韬略"],
  "侠义": ["侠义江湖"],
  "爱情": ["爱情姻缘"],
  "神话": ["神话灵异"],
};

// 从 theme-data.json 的 theme_richness 构建全量剧本主题雷达数据
// theme_richness 为归一化的 12 维主题分布（各项之和 ≈ 1），
// 每个剧本的 each value = 该主题在剧本中的比例权重。
// 优于 starmap-data.json 的 themeVector（该数据稀疏且不全）。
// 六维雷达值 = 每个高层维度下子主题的平均值 × 100
const buildPlayDataFromRichness = (richness: any[]) => {
  const result: Record<string, PlayRadarData> = {};

  richness.forEach((item: any) => {
    const title: string = item.title || "";
    if (!title) return;
    const genre: string = item.genre || "历史戏";
    // theme_richness 中用 "themes" 字段存储 12 维分布（0-1，归一化）
    const themeVector: Record<string, number> = item.themes || {};

    // 计算六维雷达值 (0-100)
    // 每个维度 = 该维度下所有子主题 themeVector 值的平均 × 100
    const radar = THEME_6.map(dim => {
      const keys = RADAR_THEME_MAP[dim] || [dim];
      let sum = 0;
      keys.forEach(k => { sum += themeVector[k] || 0; });
      const avg = sum / Math.max(keys.length, 1);
      const val = Math.min(100, Math.round(avg * 100));
      // 若取整后为 0 但子主题总量 > 0.005，显示为 1% 避免消失
      if (val === 0 && sum > 0.005) return 1;
      return val;
    });

    // 估算 conflict（冲突烈度）和 emotion（情感饱和度）
    const conflictRaw = (themeVector["征战讨伐"] || 0) + (themeVector["权谋斗争"] || 0) + (themeVector["生死离别"] || 0);
    const emotionRaw = (themeVector["爱情姻缘"] || 0) + (themeVector["家庭伦理"] || 0);
    const conflict = Math.min(100, Math.round(conflictRaw * 100 / 1.5));
    const emotion = Math.min(100, Math.round(emotionRaw * 100 / 1.2));

    // 按类型估算行当分布
    let roles: { 生: number; 旦: number; 净: number; 丑: number };
    switch (genre) {
      case "爱情戏": roles = { 生: 20, 旦: 55, 净: 5, 丑: 20 }; break;
      case "历史戏": roles = { 生: 45, 旦: 15, 净: 25, 丑: 15 }; break;
      case "神话戏": roles = { 生: 25, 旦: 40, 净: 15, 丑: 20 }; break;
      case "公案戏": roles = { 生: 30, 旦: 25, 净: 20, 丑: 25 }; break;
      case "家庭戏": roles = { 生: 30, 旦: 45, 净: 10, 丑: 15 }; break;
      case "侠义戏": roles = { 生: 45, 旦: 15, 净: 25, 丑: 15 }; break;
      default: roles = { 生: 35, 旦: 30, 净: 20, 丑: 15 }; break;
    }

    // 生成高亮文本
    const meaningfulDims = radar.filter(v => v >= 3).length;
    const maxRadar = Math.max(...radar);
    const maxIdx = radar.indexOf(maxRadar);
    const dominant = THEME_6[maxIdx] || "";
    let highlight: string;
    if (meaningfulDims <= 1 && maxRadar > 20) {
      highlight = `《${title}》的主题高度集中于「${dominant}」维度（${maxRadar}%），`;
      highlight += `其他维度覆盖极低——这可能是该剧本叙事焦点单一的表现，`;
      highlight += `但也需注意六维映射将 12 个原始主题归并为平均值，单个子主题的贡献可能被稀释。`;
    } else if (dominant) {
      highlight = `《${title}》的「${dominant}」主题最为突出（${maxRadar}%），融合了多种叙事元素。`;
    } else {
      highlight = `《${title}》无明显主导主题，各维度分布均衡。`;
    }

    result[title] = { title, genre, radar, roles, highlight, conflict, emotion };
  });

  return result;
};

const HOT_TOPICS = [
  { theme: "历史", score: 63 },
  { theme: "爱情", score: 55 },
  { theme: "家庭", score: 48 },
  { theme: "侠义", score: 42 },
  { theme: "神话", score: 35 },
];

/* ── PlayAutocomplete: Mantine-powered play name search ── */
const PlayAutocomplete: React.FC<{
  allNames: string[];
  excludeNames: string[];
  placeholder: string;
  onSelect: (name: string) => void;
  inputHeight?: number;
  playData?: Record<string, PlayRadarData>;
}> = ({ allNames, excludeNames, placeholder, onSelect, inputHeight = 36, playData }) => {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return allNames.filter(n => !excludeNames.includes(n));
    return allNames.filter(n => n.includes(query) && !excludeNames.includes(n));
  }, [query, allNames, excludeNames]);

  const data = useMemo(() => filtered.map(n => ({ value: n, label: n })), [filtered]);

  const handleSubmit = useCallback((value: string) => {
    const match = filtered.find(n => n === value || n.includes(value));
    if (match) { onSelect(match); setQuery(""); }
  }, [filtered, onSelect]);

  const renderOption = useCallback((item: any) => {
    const name = item.option?.value || "";
    const meta = playData?.[name];
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 0", gap: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: "#3a2c21" }}>{name}</span>
        {meta && (
          <span style={{
            fontSize: 10, padding: "1px 6px", borderRadius: 3,
            background: "rgba(184,155,109,.12)", color: "#7a5e4e", fontWeight: 600, flexShrink: 0,
          }}>
            {meta.genre}
          </span>
        )}
      </div>
    );
  }, [playData]);

  return (
    <Autocomplete
      value={query}
      onChange={setQuery}
      onOptionSubmit={handleSubmit}
      placeholder={placeholder}
      data={data}
      limit={999}
      renderOption={renderOption}
      comboboxProps={{ shadow: "md", dropdownPadding: 6, width: 300 }}
      styles={{
        input: {
          fontFamily: "Noto Sans SC, sans-serif",
          fontSize: 13,
          height: inputHeight,
          borderColor: "rgba(184,155,109,.25)",
          color: "#3a2c21",
          backgroundColor: "#fdfaf5",
        },
        dropdown: { borderColor: "rgba(184,155,109,.15)", backgroundColor: "#fdfaf5" },
      }}
    />
  );
};

const HeatmapComparePanel: React.FC = () => {
  const [mode, setMode] = useState<"single" | "compare">("single");
  const [selected1, setSelected1] = useState<string | null>(null);
  const [selected2, setSelected2] = useState<string | null>(null);
  const radarRef = useRef<HTMLDivElement>(null);
  const [playData, setPlayData] = useState<Record<string, PlayRadarData>>({});
  const [showDimHelp, setShowDimHelp] = useState(false);
  // 跟踪雷达图中被点击激活的系列（虚线→实线+区域）
  const activeRadarRef = useRef<Set<string>>(new Set());

  // 新配色方案 (需求8)
  const NEW_COLORS = {
    white: "#F6F1E7",
    beige: "#E9DFC9",
    gold: "#B89B6D",
    cyan: "#7F968D",
    grey: "#5E6B76",
    red: "#96544D",
  };

  // 从 theme-data.json 的 theme_richness 构建全量剧本主题雷达数据
  //（theme_richness 为归一化 12 维分布，数据完整且准确）
  useEffect(() => {
    try {
      const richness = (p3data as any).theme_richness || [];
      setPlayData(buildPlayDataFromRichness(richness));
    } catch (e) {
      console.error("Failed to load theme_richness from theme-data.json", e);
    }
  }, []);

  const ALL_PLAY_NAMES = useMemo(() => Object.keys(playData), [playData]);

  // 获取原始 theme_richness 数据用于 ThemeComparisonChart（旭日图/环形放射图）
  const rawRichness = useMemo(() => (p3data as any).theme_richness || [], []);
  const rawItem1 = useMemo(() =>
    selected1 ? rawRichness.find((r: any) => r.title === selected1) : null,
    [selected1, rawRichness]
  );
  const rawItem2 = useMemo(() =>
    selected2 ? rawRichness.find((r: any) => r.title === selected2) : null,
    [selected2, rawRichness]
  );

  // 将 radarMax 提取到组件层级，供 useEffect 和 JSX 共用
  const radarMax = useMemo(() => {
    if (!selected1 && !selected2) return 30;
    const allValues: number[] = [];
    if (selected1 && playData[selected1]) allValues.push(...playData[selected1].radar);
    if (selected2 && playData[selected2]) allValues.push(...playData[selected2].radar);
    const maxData = allValues.length > 0 ? Math.max(...allValues) : 30;
    return Math.ceil((maxData * 1.1) / 5) * 5;
  }, [selected1, selected2, playData]);

  // 动态计算对比卡片的条形长度最大值
  const maxBarValue = useMemo(() => {
    if (!selected1 || !selected2) return 100;
    const d1 = playData[selected1];
    const d2 = playData[selected2];
    if (!d1 || !d2) return 100;
    const allVals = [...d1.radar, ...d2.radar];
    return Math.max(...allVals, 20);
  }, [selected1, selected2, playData]);

  // Radar chart — 虚线默认，无数字标注，点击激活变为实线+区域
  useEffect(() => {
    if (!radarRef.current) return;
    const existing = echarts.getInstanceByDom(radarRef.current);
    if (existing) existing.dispose();
    const chart = echarts.init(radarRef.current);

    const indicator = THEME_6.map(t => ({
      name: t,
      max: radarMax,
    }));

    const commonRadar = {
      indicator,
      shape: "polygon" as const,
      center: ["50%", "50%"] as [string, string],
      radius: "78%" as string,
      axisName: { fontSize: 14, color: "#5e3a2e", fontWeight: 600, fontFamily: "'Noto Serif SC','PT Serif',serif" },
      splitNumber: 3,
      axisLine: { lineStyle: { color: "#d4c4a8", width: 0.5 } },
      splitLine: { lineStyle: { color: "#e8ddce", width: 0.5 } },
      splitArea: { areaStyle: { color: ["rgba(250,245,237,0.12)", "rgba(255,255,255,0.06)"] } },
    };

    // 根据 activeRadarRef 构建 series 配置
    const buildSeriesConfig = (name: string, color: string, data: number[]) => {
      const isActive = activeRadarRef.current.has(name);
      return {
        type: "radar" as const,
        name,
        data: [{ value: data, name }],
        symbol: "circle",
        symbolSize: isActive ? 6 : 3,
        lineStyle: {
          width: isActive ? 2.5 : 1.5,
          color,
          type: isActive ? ("solid" as const) : ("dashed" as const),
          opacity: isActive ? 0.95 : 0.55,
        },
        areaStyle: isActive
          ? { color: `${color}${Math.round(0.25 * 255).toString(16).padStart(2, '0')}` }
          : undefined,
        itemStyle: { color, opacity: isActive ? 1 : 0.6 },
        // 不显示标签数字
        label: { show: false },
        z: isActive ? 10 : 1,
      };
    };

    if (selected1 && mode === "single") {
      const d1 = playData[selected1];
      if (!d1) { chart.clear(); return; }
      const seriesConfig = buildSeriesConfig(selected1, "#B89B6D", d1.radar);

      chart.setOption({
        tooltip: {
          trigger: "item" as const,
          backgroundColor: "rgba(255,254,251,0.97)",
          borderColor: "rgba(196,176,138,0.5)",
          borderWidth: 1,
          padding: [12, 16],
          textStyle: { fontSize: 12, color: "#4a3020" },
          formatter: (p: any) => {
            const isActive = activeRadarRef.current.has(selected1);
            let html = `<div style="font-size:13px;font-weight:700;color:#B89B6D;margin-bottom:4px">`;
            html += `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#B89B6D;margin-right:6px;vertical-align:middle"></span>`;
            html += `${selected1}`;
            html += isActive ? '' : ' <span style="font-size:10px;color:#8b7355;">(点击激活)</span>';
            html += `</div>`;
            html += `<div style="height:1px;background:rgba(196,176,138,0.15);margin:4px 0 6px"></div>`;
            THEME_6.forEach((t, i) => {
              const val = p.value?.[i] ?? 0;
              html += `<div style="display:flex;justify-content:space-between;gap:16px;line-height:1.7">`;
              html += `<span style="color:#5e3a2e">${t}</span>`;
              html += `<span style="font-weight:600;color:#B89B6D">${val.toFixed(1)}%</span>`;
              html += `</div>`;
            });
            return html;
          },
        },
        radar: commonRadar,
        series: [seriesConfig],
        animationDuration: 300,
      }, true);
    } else if (selected1 && selected2 && mode === "compare") {
      const d1 = playData[selected1];
      const d2 = playData[selected2];
      if (!d1 || !d2) { chart.clear(); return; }

      const series1 = buildSeriesConfig(selected1, "#B89B6D", d1.radar);
      const series2 = buildSeriesConfig(selected2, "#5E6B76", d2.radar);

      chart.setOption({
        tooltip: {
          trigger: "item" as const,
          backgroundColor: "rgba(255,254,251,0.97)",
          borderColor: "rgba(196,176,138,0.5)",
          borderWidth: 1,
          padding: [12, 16],
          textStyle: { fontSize: 12, color: "#4a3020" },
          formatter: (p: any) => {
            const isD1 = p.seriesIndex === 0;
            const name = isD1 ? selected1 : selected2;
            const color = isD1 ? "#B89B6D" : "#5E6B76";
            const isActive = activeRadarRef.current.has(name);
            let html = `<div style="font-size:13px;font-weight:700;color:${color};margin-bottom:4px">`;
            html += `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:6px;vertical-align:middle"></span>`;
            html += `${name}`;
            html += isActive ? '' : ' <span style="font-size:10px;color:#8b7355;">(点击激活)</span>';
            html += `</div>`;
            html += `<div style="height:1px;background:rgba(196,176,138,0.15);margin:4px 0 6px"></div>`;
            THEME_6.forEach((t, i) => {
              const val = p.value?.[i] ?? 0;
              html += `<div style="display:flex;justify-content:space-between;gap:16px;line-height:1.7">`;
              html += `<span style="color:#5e3a2e">${t}</span>`;
              html += `<span style="font-weight:600;color:${color}">${val.toFixed(1)}%</span>`;
              html += `</div>`;
            });
            return html;
          },
        },
        legend: { show: false },
        radar: commonRadar,
        series: [series1, series2],
        animationDuration: 300,
      }, true);
    } else {
      chart.clear();
      activeRadarRef.current.clear();
    }

    // 点击交互：虚线 ↔ 实线+区域 切换
    chart.off("click");
    chart.on("click", (params: any) => {
      if (params.componentSubType === "radar" && params.seriesName) {
        const name = params.seriesName;
        if (activeRadarRef.current.has(name)) {
          activeRadarRef.current.delete(name);
        } else {
          activeRadarRef.current.add(name);
        }
        // 重新渲染图表
        if (mode === "single" && selected1) {
          const d1 = playData[selected1];
          if (!d1) return;
          chart.setOption({
            series: [buildSeriesConfig(selected1, "#B89B6D", d1.radar)],
          });
        } else if (mode === "compare" && selected1 && selected2) {
          const d1 = playData[selected1];
          const d2 = playData[selected2];
          if (!d1 || !d2) return;
          chart.setOption({
            series: [
              buildSeriesConfig(selected1, "#B89B6D", d1.radar),
              buildSeriesConfig(selected2, "#5E6B76", d2.radar),
            ],
          });
        }
      }
    });

    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("resize", h);
      chart.dispose();
    };
  }, [selected1, selected2, mode, radarMax, playData]);


  // Generate structured comparison items (enhanced)
  const comparisonItems = useMemo(() => {
    if (!selected1 || !selected2) return [] as any[];
    const d1 = playData[selected1];
    const d2 = playData[selected2];
    if (!d1 || !d2) return [];

    // 计算所有主题维度的差异，取差异最大的前3个
    const diffThemes = THEME_6.map((t, i) => ({
      theme: t,
      diff: d1.radar[i] - d2.radar[i],
      v1: d1.radar[i],
      v2: d2.radar[i],
    })).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    const items: any[] = [];
    // 取全部 6 个维度的差异
    diffThemes.slice(0, 6).forEach(({ theme, v1, v2, diff }) => {
      const higher = v1 > v2 ? selected1 : selected2;
      const lower = v1 > v2 ? selected2 : selected1;
      items.push({
        type: 'theme',
        theme,
        v1,
        v2,
        diff: Math.abs(diff).toFixed(0),
        higher,
        lower,
        icon: v1 > v2 ? '⬆' : '⬇',
        label: `「${theme}」主题倾向`,
      });
    });

    // 冲突烈度差异（若差异>10%则加入）
    if (Math.abs(d1.conflict - d2.conflict) > 10) {
      items.push({
        type: 'conflict',
        label: '冲突烈度',
        v1: d1.conflict,
        v2: d2.conflict,
        diff: Math.abs(d1.conflict - d2.conflict).toFixed(0),
        higher: d1.conflict > d2.conflict ? selected1 : selected2,
        lower: d1.conflict > d2.conflict ? selected2 : selected1,
        icon: '⚔️',
      });
    } else if (Math.abs(d1.emotion - d2.emotion) > 10) {
      items.push({
        type: 'emotion',
        label: '情感饱和度',
        v1: d1.emotion,
        v2: d2.emotion,
        diff: Math.abs(d1.emotion - d2.emotion).toFixed(0),
        higher: d1.emotion > d2.emotion ? selected1 : selected2,
        lower: d1.emotion > d2.emotion ? selected2 : selected1,
        icon: '💭',
      });
    }
    return items.slice(0, 3);
  }, [selected1, selected2]);

  const handleClear = () => {
    setSelected1(null);
    setSelected2(null);
    setMode("single");
  };

  const handleSelect1 = (name: string) => {
    setSelected1(name);
  };
  const handleSelect2 = (name: string) => {
    setSelected2(name);
  };

  return (
    <div className="heatmap-compare-panel">
      {/* TOP: Search + Mode Toggle */}
      <div className="hcp-top">
        {/* Search cards */}
        <div className="hcp-search-card">
          <div className="hcp-search-row">
            <span className="hcp-search-icon">🎬</span>
            {selected1 ? (
              <div className="hcp-selected-chip">
                <span className="hcp-selected-name">{selected1}</span>
                {playData[selected1] && (
                  <span className="hcp-selected-meta">
                    {playData[selected1].genre}
                  </span>
                )}
                <button className="hcp-selected-clear" onClick={() => setSelected1(null)} title="清除">✕</button>
              </div>
            ) : (
              <PlayAutocomplete
                allNames={ALL_PLAY_NAMES}
                excludeNames={selected2 ? [selected2] : []}
                placeholder="搜索剧本名称..."
                onSelect={handleSelect1}
                playData={playData}
              />
            )}
          </div>

          {mode === "compare" && (
            <div className="hcp-search-row">
              <span className="hcp-search-icon">↔</span>
              {selected2 ? (
                <div className="hcp-selected-chip">
                  <span className="hcp-selected-name">{selected2}</span>
                  {playData[selected2] && (
                    <span className="hcp-selected-meta">
                      {playData[selected2].genre}
                    </span>
                  )}
                  <button className="hcp-selected-clear" onClick={() => setSelected2(null)} title="清除">✕</button>
                </div>
              ) : (
                <PlayAutocomplete
                  allNames={ALL_PLAY_NAMES}
                  excludeNames={selected1 ? [selected1] : []}
                  placeholder="选择对比剧本..."
                  onSelect={handleSelect2}
                  playData={playData}
                />
              )}
            </div>
          )}
        </div>

        <div className="hcp-mode-tabs">
          <button
            className={`hcp-mode-btn ${mode === "single" ? "active" : ""}`}
            onClick={() => setMode("single")}
          >单剧本</button>
          <button
            className={`hcp-mode-btn ${mode === "compare" ? "active" : ""}`}
            onClick={() => setMode("compare")}
          >对比模式</button>
          {(selected1 || selected2) && (
            <button className="hcp-clear-btn" onClick={handleClear}>✕ 清除选择</button>
          )}
        </div>
      </div>

      {/* MIDDLE: Radar Chart */}
      <div className="hcp-middle">
        <div className="hcp-card hcp-card--bordered hcp-radar-card" style={{ position: 'relative' }}>

          {/* 左右并排布局核心容器 */}
          {(mode === 'single' && selected1 && rawItem1) || (mode === 'compare' && selected1 && selected2 && rawItem1 && rawItem2) ? (
          <div style={{ display: 'flex', gap: '12px', height: '100%', width: '100%' }}>

            {/* 🟢 左侧：旭日图 / 环形放射图 */}
            <div style={{ flex: 1, minWidth: 0, height: '100%', padding: 8 }}>
              <ThemeComparisonChart
                playData1={rawItem1}
                playData2={rawItem2}
                mode={mode}
                height="100%"
              />
            </div>

            {/* 🔴 右侧：雷达图 (固定宽度，确保问号按钮只在这个区域内) */}
            <div style={{ flex: '0 0 280px', height: '100%', position: 'relative' }}>
              <div ref={radarRef} className="hcp-radar-chart" style={{ height: '100%', width: '100%' }} />

              {/* ★★★ 重点修复：问号按钮及其弹窗现在放在雷达图容器内部 ★★★ */}
              <div
                style={{
                  position: 'absolute', right: 6, top: 6, zIndex: 10,
                  cursor: 'pointer',
                  background: showDimHelp ? '#96544d' : 'rgba(255,255,255,0.85)',
                  borderRadius: '50%',
                  width: 24, height: 24,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700,
                  color: showDimHelp ? '#fff' : '#5e3a2e',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                  transition: 'all 0.2s',
                }}
                onClick={() => setShowDimHelp(h => !h)}
                title="六维主题构成说明"
              >?</div>

              {/* 维度说明弹窗 - 定位在按钮下方，防止遮挡 */}
              {showDimHelp && (
                <div style={{
                  position: 'absolute', right: 34, top: 6,
                  background: '#fffefb', border: '1px solid #d4c4a8', borderRadius: 8,
                  padding: '10px 14px', width: 240, zIndex: 20,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                  fontSize: 11, color: '#4a3020', lineHeight: 1.6,
                }}>
                  <b style={{ color: '#96544d' }}>六维主题如何得来？</b><br/>
                  从 12 个原始主题聚类为 6 个高层叙事维度，<br/>
                  每个维度由其子主题覆盖率的平均值构成（0–100%）。<br/>
                  <div style={{ marginTop: 4 }}>
                    • <b>历史</b> = 宫廷朝堂 + 征战讨伐 + 忠义报国 + 生死离别<br/>
                    • <b>家庭</b> = 家庭伦理 + 科举功名 + 爱情姻缘<br/>
                    • <b>公案</b> = 冤案昭雪 + 权谋斗争 + 智谋韬略<br/>
                    • <b>侠义</b> = 侠义江湖<br/>
                    • <b>爱情</b> = 爱情姻缘（独立维度）<br/>
                    • <b>神话</b> = 神话灵异<br/>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 10, color: '#8b7355' }}>
                    ⚠️ 若某维度显示为 0%，表示该剧本在该维度下所有子主题的原始覆盖率均低于 0.5%。
                  </div>
                  <button
                    style={{ marginTop: 4, fontSize: 10, color: '#96544d', border: 'none', background: 'transparent', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                    onClick={() => setShowDimHelp(false)}
                  >关闭</button>
                </div>
              )}
            </div>

          </div>
          ) : (
            <div className="hcp-radar-placeholder" style={{ position: 'relative', width: '100%', height: '100%' }}>
              {mode === 'compare' && (selected1 || selected2)
                ? '请选择两个剧本进行对比'
                : '请选择剧本以查看主题结构'
              }
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM: Cards */}
      <div className="hcp-bottom">
        {/* Default: Hot Topics */}
        {!selected1 && !selected2 && (
          <div className="hcp-cards">
            <div className="hcp-card hcp-card--bordered">
              <div className="hcp-card-title">🏆 全局热门主题 Top5</div>
              {HOT_TOPICS.map((t, i) => (
                <div key={t.theme} className="hcp-hot-item">
                  <span className="hcp-hot-rank">#{i + 1}</span>
                  <span className="hcp-hot-name">{t.theme}</span>
                  <div className="hcp-hot-bar-wrap">
                    <div className="hcp-hot-bar" style={{ width: `${t.score}%` }} />
                  </div>
                  <span className="hcp-hot-score">{t.score}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Single mode: 3 info cards */}
        {selected1 && mode === "single" && playData[selected1] && (
          <div className="hcp-cards">
            <div className="hcp-card hcp-card--bordered">
              <div className="hcp-card-title">✨ 主题关键发现</div>
              <p>{playData[selected1].highlight}</p>
            </div>
            <div className="hcp-card hcp-card--bordered">
              <div className="hcp-card-title">🎭 行当偏好</div>
              <div className="hcp-role-bars">
                {(["生", "旦", "净", "丑"] as const).map(role => {
                  const pct = playData[selected1].roles[role];
                  const colors: Record<string, string> = { 生: NEW_COLORS.cyan, 旦: NEW_COLORS.red, 净: NEW_COLORS.grey, 丑: NEW_COLORS.gold };
                  return (
                    <div key={role} className="hcp-role-row">
                      <span className="hcp-role-name">{role}</span>
                      <div className="hcp-role-bar-wrap">
                        <div className="hcp-role-bar" style={{ width: `${pct}%`, backgroundColor: colors[role] }} />
                      </div>
                      <span className="hcp-role-count" style={{ color: colors[role] }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="hcp-card hcp-card--bordered">
              <div className="hcp-card-title">📊 叙事结构</div>
              <div className="hcp-narrative-bars">
                <div className="hcp-narrative-row">
                  <span className="hcp-narr-label">冲突烈度</span>
                  <div className="hcp-narr-bar-wrap">
                    <div className="hcp-narr-bar" style={{ width: `${playData[selected1].conflict}%`, background: `linear-gradient(90deg, ${NEW_COLORS.gold}, ${NEW_COLORS.red})` }} />
                  </div>
                  <span className="hcp-narr-val" style={{ color: "#96544D" }}>{playData[selected1].conflict}%</span>
                </div>
                <div className="hcp-narrative-row">
                  <span className="hcp-narr-label">情感饱和度</span>
                  <div className="hcp-narr-bar-wrap">
                    <div className="hcp-narr-bar" style={{ width: `${playData[selected1].emotion}%`, background: `linear-gradient(90deg, ${NEW_COLORS.cyan}, ${NEW_COLORS.grey})` }} />
                  </div>
                  <span className="hcp-narr-val" style={{ color: "#5E6B76" }}>{playData[selected1].emotion}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Compare mode: structured comparison cards (enhanced) */}
        {mode === "compare" && selected1 && selected2 && comparisonItems.length > 0 && (
          <div className="hcp-cards">
            <div className="hcp-bottom-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>
                🔍 对比分析 · {selected1} <span style={{ color: '#b89b6d', fontWeight: 400 }}>vs</span> {selected2}
              </span>

              {/* 自定义图例：放到标题右侧，不与雷达图重叠 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, fontWeight: 500 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#B89B6D' }} />
                  <span style={{ color: '#4a3a2a' }}>{selected1}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#5E6B76' }} />
                  <span style={{ color: '#4a3a2a' }}>{selected2}</span>
                </div>
              </div>
            </div>
            {/* Summary stat */}
            {(selected1 && selected2 && mode === "compare") && comparisonItems.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <div style={{ background: '#f0ece4', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#4a3a2a' }}>
                  最显著差异：{comparisonItems[0].label} ({comparisonItems[0].higher} 领先 {comparisonItems[0].diff}%)
                </div>
              </div>
            )}

            {/* 六维主题精细对比表格 */}
            {(() => {
              const d1 = playData[selected1];
              const d2 = playData[selected2];
              if (!d1 || !d2) return null;
              const themes6 = THEME_6.map((t, i) => ({
                theme: t,
                v1: d1.radar[i],
                v2: d2.radar[i],
                diff: d1.radar[i] - d2.radar[i],
              }));
              return (
                <div className="hcp-card hcp-card--bordered" style={{ padding: '12px 14px' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#5e3a2e' }}>
                    📊 六维主题精细对比
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px', fontSize: 13 }}>
                    {themes6.map((item, idx) => (
                      <div key={item.theme} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '6px 8px',
                        background: idx % 2 === 0 ? 'rgba(0,0,0,0.02)' : 'transparent',
                        borderRadius: 6,
                        gap: 8
                      }}>
                        {/* 左侧标签：固定宽度，强制不挤压 */}
                        <span style={{
                          color: '#4a3020',
                          fontWeight: 600,
                          fontSize: 13,
                          minWidth: 52,
                          flexShrink: 0,
                          textAlign: 'left',
                          marginRight: 4
                        }}>
                          {item.theme}
                        </span>

                        {/* 中间：两个对比条，动态刻度 maxBarValue */}
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <div style={{ flex: 1, height: 8, background: 'rgba(0,0,0,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%',
                              width: `${(Math.max(2, item.v1) / maxBarValue) * 100}%`,
                              background: item.v1 >= item.v2 ? '#B89B6D' : '#c0b5a8',
                              borderRadius: 4,
                              transition: 'width 0.4s ease'
                            }} />
                          </div>
                          <div style={{ flex: 1, height: 8, background: 'rgba(0,0,0,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%',
                              width: `${(Math.max(2, item.v2) / maxBarValue) * 100}%`,
                              background: item.v2 >= item.v1 ? '#5E6B76' : '#c0b5a8',
                              borderRadius: 4,
                              transition: 'width 0.4s ease'
                            }} />
                          </div>
                        </div>

                        {/* 右侧数值：加大字体 */}
                        <span style={{
                          whiteSpace: 'nowrap',
                          fontSize: 13,
                          fontWeight: 600,
                          minWidth: 76,
                          textAlign: 'right',
                          paddingLeft: 4
                        }}>
                          <span style={{ color: item.v1 >= item.v2 ? '#B89B6D' : '#8a939b' }}>{item.v1.toFixed(0)}%</span>
                          <span style={{ margin: '0 4px', color: '#8b7355', fontWeight: 400 }}>vs</span>
                          <span style={{ color: item.v2 >= item.v1 ? '#5E6B76' : '#8a939b' }}>{item.v2.toFixed(0)}%</span>
                          <span style={{ marginLeft: 6, fontSize: 12, color: '#b89b6d', fontWeight: 500 }}>
                            ({item.diff > 0 ? '+' : ''}{item.diff.toFixed(0)}%)
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

export default Task3Layout;
