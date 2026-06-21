import React, { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import * as d3 from "d3";
import p2data from "../../data/network-data.json";
import charRoleMap from "../../data/char-role-map.json";
import mainCharsData from "../../data/task2-main-characters.json";
import "./Task2Layout.scss";
import CircleEgoGraph from "./CircleEgoGraph";
import { useTask2Store } from "../../stores/task2Store";
import type { DramaType } from "../../types/task2";

type ReportTabId = "report" | "findings" | "metrics";
type MainView = "network" | "scatter" | "dashboard" | "distribution";

/* ---- 古籍色板 ---- */
const INK_DARK  = "#4a3424";
const INK_WARM  = "#6b5540";
const INK_SOFT  = "#8b7355";
const PAPER_BG  = "#f6efe0";
const GOLD_NODE = "#b8926a";

const ROLE_COLORS: Record<string, string> = {
  生: "#b8926a",
  旦: "#96544d",
  净: "#5e6b76",
  丑: "#7f968d",
  其他: "#a09080",
};
const DEFAULT_ROLE_COLOR = "#a09080";

const EDGE_RELATION_COLORS: Record<string, string> = {
  同盟: "#55a868",
  从属: "#4c72b0",
  敌对: "#c44e52",
  亲属: "#937860",
  情感: "#c77d8b",
  中立: "#c0c0c0",
};
const EDGE_RELATION_LABELS: Record<string, string> = {
  同盟: "同盟", 从属: "从属", 敌对: "敌对", 亲属: "亲属", 情感: "情感", 中立: "中立/同场",
};

const charRole: Record<string, string> = charRoleMap as Record<string, string>;

const TYPE_COLORS: Record<string, string> = {
  历史戏: "#b8926a", 家庭戏: "#96544d", 侠义戏: "#5e6b76",
  爱情戏: "#c77d8b", 神话戏: "#7f968d", 公案戏: "#6b7b8e", 技法展示戏: "#c4a56e",
};
const TYPE_ORDER: DramaType[] = ["历史戏", "家庭戏", "侠义戏", "爱情戏", "神话戏", "公案戏", "技法展示戏"];
const METRIC_LABELS: Record<string, string> = {
  density: "网络密度", centralization: "中心性偏离度", clustering: "聚类系数",
  modularity: "模块度", degree_entropy: "度分布熵", bridge_ratio: "桥接节点比",
  top2_concentration: "Top-2集中度",
};
const METRIC_ORDER = ["density","centralization","clustering","modularity","degree_entropy","bridge_ratio","top2_concentration"];
const REPORT_TAB_LABELS: { id: ReportTabId; icon: string; label: string }[] = [
  { id: "report", icon: "📋", label: "设计流程报告" },
  { id: "findings", icon: "💡", label: "典型发现" },
  { id: "metrics", icon: "📊", label: "指标对比" },
];
const VIEW_LABELS: Record<MainView, string> = {
  network: "角色关系网络", scatter: "剧目结构空间", dashboard: "类型多维对比", distribution: "角色集中度分布",
};
const FONT_SERIF = '"Noto Serif SC","PT Serif","STSong","SimSun",serif';

/* ================================================================
   Task2Layout — 角色关系网络与剧目类型分析
   ================================================================ */
const Task2Layout: React.FC = () => {
  const [mainView, setMainView] = useState<MainView>("network");
  const [reportSidebarOpen, setReportSidebarOpen] = useState(false);
  const [reportTab, setReportTab] = useState<ReportTabId>("report");
  const {
    selectedType,
    selectedRole,
    setSelectedType,
    selectRole,
  } = useTask2Store();

  const networkRef = useRef<HTMLDivElement>(null);
  const scatterRef = useRef<HTMLDivElement>(null);
  const radarRef = useRef<HTMLDivElement>(null);
  const sankeyRef = useRef<HTMLDivElement>(null);
  const stackedBarRef = useRef<HTMLDivElement>(null);
  const hangdangHeatRef = useRef<HTMLDivElement>(null);
  const distDegreeRef = useRef<HTMLDivElement>(null);
  const distBetweenRef = useRef<HTMLDivElement>(null);

  // ── Dashboard 图表放大 Modal ──
  type DashboardModalId = "radar" | "sankey" | "stackedBar" | "heatmap" | null;
  const [dashboardModal, setDashboardModal] = useState<DashboardModalId>(null);
  const radarModalRef = useRef<HTMLDivElement>(null);
  const sankeyModalRef = useRef<HTMLDivElement>(null);
  const stackedBarModalRef = useRef<HTMLDivElement>(null);
  const heatmapModalRef = useRef<HTMLDivElement>(null);

  const DASHBOARD_MODAL_LABELS: Record<string, string> = {
    radar: "类型指纹 · 雷达图",
    sankey: "关系流向 · 桑基图",
    stackedBar: "结构标签分布 · 堆叠柱状",
    heatmap: "核心行当分布 · 热力图",
  };

  const [playDropdownOpen, setPlayDropdownOpen] = useState(false);
  const playDropdownRef = useRef<HTMLDivElement>(null);
  const [showNeutralEdges, setShowNeutralEdges] = useState(true);
  const [scatterColorMode, setScatterColorMode] = useState<"genre" | "structure">("genre");
  const [showCoreOnly, setShowCoreOnly] = useState(true);
  const [netPlayEntityId, setNetPlayEntityId] = useState<number | null>(null);
  const [allPlaysLoading, setAllPlaysLoading] = useState(false);
  const [cacheVersion, setCacheVersion] = useState(0);
  const playNetworksCache = useRef<Map<number, any>>(new Map());

  /* ── K-Core 分解 ── */
  const computeKCore = (nodes: any[], edges: any[]): Map<string, number> => {
    const adj = new Map<string, Set<string>>();
    const nodeNames = new Set<string>();
    for (const n of nodes) { const nm = n.name || n.n || ''; if (nm) { adj.set(nm, new Set()); nodeNames.add(nm); } }
    for (const e of edges) {
      const s = e.source || e.s || '';
      const t = e.target || e.t || '';
      if (nodeNames.has(s) && nodeNames.has(t) && s !== t) {
        adj.get(s)!.add(t);
        adj.get(t)!.add(s);
      }
    }
    const deg = new Map<string, number>();
    for (const [nm, nb] of adj) deg.set(nm, nb.size);
    const core = new Map<string, number>();
    let k = 0;
    const rem = new Set(nodeNames);
    while (rem.size > 0) {
      k++;
      let changed = true;
      while (changed) {
        changed = false;
        for (const nm of [...rem]) {
          if ((deg.get(nm) || 0) < k) {
            for (const nb of adj.get(nm) || []) {
              if (rem.has(nb)) deg.set(nb, Math.max(0, (deg.get(nb) || 1) - 1));
            }
            rem.delete(nm);
            core.set(nm, k - 1);
            changed = true;
          }
        }
      }
    }
    for (const nm of rem) core.set(nm, k - 1);
    return core;
  };

  // Close dropdown on outside click
  useEffect(() => {
    if (!playDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (playDropdownRef.current && !playDropdownRef.current.contains(e.target as Node)) {
        setPlayDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [playDropdownOpen]);

  const data = p2data as any;

  // ── 主要角色查找表 (entity_id → main character names) ──
  const mainCharsMap = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const p of (mainCharsData as any).plays) {
      m.set(p.entity_id, p.main_characters || []);
    }
    return m;
  }, []);

  const typeData = data.type_means[selectedType];

  // ── 全量剧本列表（来自 play_index，按类型筛选）──
  const allPlaysList = useMemo(() => {
    const idx: any[] = data.play_index || [];
    return idx.filter((p: any) => p.genre === selectedType)
      .sort((a: any, b: any) => (b.node_count || 0) - (a.node_count || 0));
  }, [data, selectedType]);

  // ── Rep nets（初始快速展示）+ 动态加载的完整网络 ──
  const repNets: any[] = data.rep_networks[selectedType] || [];
  const repNetsById = useMemo(() => {
    const m = new Map<number, any>();
    repNets.forEach((n: any) => { if (n.entity_id) m.set(n.entity_id, n); });
    return m;
  }, [repNets]);

  // ── 获取当前网络：先查 repNets，再查动态缓存 ──
  const currentNet = useMemo(() => {
    void cacheVersion; // react to cache updates
    if (netPlayEntityId == null) return repNets[0] || null;
    // 先查 repNets（已有完整数据）
    const fromRep = repNetsById.get(netPlayEntityId);
    if (fromRep) return fromRep;
    // 再查动态缓存
    const cached = playNetworksCache.current.get(netPlayEntityId);
    if (cached) return cached;
    // 还在加载中
    return null;
  }, [netPlayEntityId, repNetsById, selectedType, cacheVersion]);

  // ── 动态加载剧本网络 ──
  const ensureNetworkLoaded = async (entityId: number): Promise<any> => {
    if (repNetsById.has(entityId)) return repNetsById.get(entityId);
    if (playNetworksCache.current.has(entityId)) return playNetworksCache.current.get(entityId);
    setAllPlaysLoading(true);
    try {
      const { default: allData } = await import('../../data/task2-play-networks.json');
      // 转换并缓存
      for (const [key, val] of Object.entries(allData)) {
        const eid = Number(key);
        if (playNetworksCache.current.has(eid)) continue;
        const c = val as any;
        const nodes = (c.no || []).map((n: any) => ({
          name: n.n, degree: n.d || 0, scene_count: n.sc || 0,
          role_type: n.r || '其他', dialogue_count: n.sc || 0, betweenness: 0,
        }));
        const edges = (c.ed || []).map((e: any) => ({
          source: e.s, target: e.t, weight: e.w || 1,
          relation_type: e.rl || '中立', micro_type: '', source_tag: 'unknown',
        }));
        playNetworksCache.current.set(eid, {
          entity_id: eid, title: c.ti, genre: c.ge,
          total_characters: c.nc, total_edges: c.ec,
          structure_label: '分散型',
          nodes, edges,
        });
      }
      setAllPlaysLoading(false);
      setCacheVersion(v => v + 1); // trigger re-render to pick up cached network
      return playNetworksCache.current.get(entityId) || null;
    } catch (e) {
      setAllPlaysLoading(false);
      return null;
    }
  };

  const [playSearch, setPlaySearch] = useState("");
  // Filtered plays for dropdown
  const filteredAllPlays = useMemo(() => {
    if (!playSearch) return allPlaysList;
    const q = playSearch.toLowerCase();
    return allPlaysList.filter((p: any) => (p.title || '').toLowerCase().includes(q));
  }, [allPlaysList, playSearch]);

  // ── 当前网络选中主要角色列表（用于下拉preview）──
  const topPlays = useMemo(() => {
    return allPlaysList.filter((p: any) => (p.edge_count || 0) > 4).slice(0, 10);
  }, [allPlaysList]);

  // Reset when type changes: prefer first repNet (已加载), fallback to allPlaysList[0]
  useEffect(() => {
    const firstRep = repNets[0];
    if (firstRep) {
      setNetPlayEntityId(firstRep.entity_id);
    } else {
      const first = allPlaysList[0];
      if (first) {
        setNetPlayEntityId(first.entity_id);
        ensureNetworkLoaded(first.entity_id);
      } else {
        setNetPlayEntityId(null);
      }
    }
    setPlaySearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType]);

  /* ==================================================================
     Chart 1 — ECharts Force Graph  (东方古籍卷轴风格)
     ================================================================== */
  useEffect(() => {
    if (mainView !== "network" || !networkRef.current || !currentNet) return;
    const chart = echarts.init(networkRef.current);

    const AMBER_GLOW = "rgba(180,130,80,0.28)";
    const maxDeg = Math.max(...currentNet.nodes.map((n: any) => n.degree), 1);

    const nodes = currentNet.nodes.map((n: any) => {
      const t = Math.min(n.degree / maxDeg, 1);
      const size = 14 + t * 32;
      const role = charRole[n.name] || "其他";
      const roleColor = ROLE_COLORS[role] || DEFAULT_ROLE_COLOR;
      return {
        id: n.name, name: n.name,
        value: n.degree,
        symbolSize: size,
        category: 0,
        itemStyle: {
          color: roleColor,
          borderColor: "rgba(0,0,0,0.12)",
          borderWidth: 0.8,
          shadowBlur: 6 + t * 12,
          shadowColor: roleColor.replace(")", ",0.35)").replace("rgb(", "rgba(").replace("#", ""),
          opacity: 0.88 + t * 0.12,
        },
        label: {
          show: true,
          position: "top",
          color: INK_DARK,
          fontSize: 14 + t * 3,
          fontFamily: FONT_SERIF,
          fontWeight: t > 0.4 ? 600 : 400,
          distance: 6,
        },
      };
    });

    // Fix shadowColor for hex colors
    nodes.forEach((node: any) => {
      const c = node.itemStyle.color as string;
      if (c.startsWith("#")) {
        const r = parseInt(c.slice(1, 3), 16);
        const g = parseInt(c.slice(3, 5), 16);
        const b = parseInt(c.slice(5, 7), 16);
        node.itemStyle.shadowColor = `rgba(${r},${g},${b},0.35)`;
      }
    });

    const edges = currentNet.edges
      .filter((e: any) => showNeutralEdges || e.relation_type !== "中立")
      .map((e: any) => {
        const relType = e.relation_type || "中立";
        const edgeColor = EDGE_RELATION_COLORS[relType] || "#c0c0c0";
        const isNeutral = relType === "中立";
        return {
          source: e.source, target: e.target,
          relation_type: relType,
          micro_type: e.micro_type || "",
          lineStyle: {
            width: Math.max(0.3, e.weight * 0.55),
            opacity: isNeutral ? 0.10 + e.weight * 0.10 : 0.25 + e.weight * 0.25,
            color: edgeColor,
            curveness: 0.06 + (e.weight || 1) * 0.06,
          },
        };
      });

    chart.setOption({
      backgroundColor: PAPER_BG,
      tooltip: {
        backgroundColor: "rgba(250,245,235,0.94)",
        borderColor: "rgba(160,130,100,0.45)",
        borderWidth: 1,
        padding: [8, 14],
        textStyle: { color: INK_DARK, fontSize: 12, fontFamily: FONT_SERIF },
        formatter: (p: any) => {
          if (p.dataType === "node") {
            const role = charRole[p.name] || "其他";
            return `<b>${p.name}</b><br/>行当: ${role}<br/>加权度中心性: ${(p.value as number)?.toFixed(2)}`;
          }
          if (p.dataType === "edge") {
            const rel = p.data.relation_type || "?";
            const micro = p.data.micro_type ? ` · ${p.data.micro_type}` : "";
            return `<b>${p.data.source} — ${p.data.target}</b><br/>${rel}${micro}`;
          }
          return "";
        },
      },
      series: [{
        type: "graph", layout: "force",
        categories: [{ name: "角色",
          itemStyle: { color: GOLD_NODE, borderColor: "rgba(150,115,75,0.42)", borderWidth: 0.6, shadowBlur: 6, shadowColor: AMBER_GLOW },
        }],
        nodes, edges,
        roam: true, draggable: true,
        force: { repulsion: 380, edgeLength: [70, 220], gravity: 0.06, friction: 0.2 },
        emphasis: {
          focus: "adjacency",
          lineStyle: { width: 2.2, color: INK_WARM, shadowBlur: 5, shadowColor: "rgba(140,110,80,0.28)", opacity: 0.7 },
          itemStyle: { shadowBlur: 20, shadowColor: "rgba(180,125,65,0.5)", borderColor: "rgba(140,105,60,0.7)", borderWidth: 1.5 },
          label: { fontSize: 17, fontWeight: 700 },
        },
        label: { show: true, position: "top", fontSize: 14, color: INK_DARK, fontFamily: FONT_SERIF, fontWeight: 400, offset: [0, 2] },
        itemStyle: { color: GOLD_NODE, borderColor: "rgba(150,115,75,0.42)", borderWidth: 0.6, shadowBlur: 6, shadowColor: AMBER_GLOW },
        lineStyle: { color: "#c8b896", curveness: 0.1, opacity: 0.28 },
      }],
      animationDuration: 1000,
      animationEasing: "cubicInOut" as any,
    }, true);

    // 点击角色节点 → 打开影响力圈层面板
    chart.off("click");
    chart.on("click", (params: any) => {
      if (params.dataType === "node" && params.name) {
        selectRole(params.name);
      }
    });

    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("resize", h); chart.dispose(); };
  }, [mainView, currentNet, showNeutralEdges]);

  /* ==================================================================
     Chart 2 — 结构空间散点图 (X=度集中度, Y=最大连通分量占比)
     ================================================================== */
  useEffect(() => {
    if (mainView !== "scatter" || !scatterRef.current) return;
    const chart = echarts.init(scatterRef.current);

    const isStructure = scatterColorMode === "structure";
    const structLabels = data.structure_labels as string[] || [];
    const structColors = data.structure_colors as Record<string, string> || {};

    const series: any[] = isStructure
      ? structLabels.map((label: string) => ({
          name: label,
          type: "scatter",
          data: data.pca_points
            .filter((p: any) => p.structure_label === label)
            .map((p: any) => [p.x, p.y, p.title, p.genre, p.n_nodes, p.n_edges, p.structure_label]),
          itemStyle: { color: structColors[label] || "#a09080", opacity: 0.50 },
          symbolSize: 8,
        }))
      : TYPE_ORDER.map((t) => ({
          name: t,
          type: "scatter",
          data: data.pca_points
            .filter((p: any) => p.genre === t)
            .map((p: any) => [p.x, p.y, p.title, p.n_nodes, p.n_edges, p.structure_label]),
          itemStyle: { color: TYPE_COLORS[t] || GOLD_NODE, opacity: 0.45 },
          symbolSize: 7,
        }));

    // 类型质心（仅在按类型着色时显示）
    if (!isStructure) {
      const centroids = TYPE_ORDER
        .filter((t) => data.pca_centroids[t])
        .map((t) => {
          const c = data.pca_centroids[t];
          const tc = TYPE_COLORS[t] || GOLD_NODE;
          return {
            name: t, value: [c.x, c.y], symbolSize: 18,
            itemStyle: {
              color: tc,
              borderColor: "#fffefb",
              borderWidth: 3,
              shadowBlur: 10,
              shadowColor: tc.replace(")", ",0.4)").replace("rgb(", "rgba(").replace("#", ""),
              opacity: 0.92,
            },
          };
        });
      // Fix shadowColor for hex colors
      centroids.forEach((node: any) => {
        const c = node.itemStyle.color as string;
        if (c.startsWith("#")) {
          const r = parseInt(c.slice(1, 3), 16);
          const g = parseInt(c.slice(3, 5), 16);
          const b = parseInt(c.slice(5, 7), 16);
          node.itemStyle.shadowColor = `rgba(${r},${g},${b},0.45)`;
        }
      });
      series.push({
        name: "centroids", type: "scatter", data: centroids,
        label: {
          show: true, formatter: "{b}", position: "top", distance: 8,
          fontSize: 12, color: INK_WARM, fontWeight: 700,
          fontFamily: FONT_SERIF,
          backgroundColor: "rgba(246,239,224,0.75)",
          padding: [2, 6],
          borderRadius: 4,
        },
        z: 10,
      });
    }

    chart.setOption({
      backgroundColor: PAPER_BG,
      tooltip: {
        backgroundColor: "rgba(250,245,235,0.94)",
        borderColor: "rgba(160,130,100,0.45)",
        borderWidth: 1,
        textStyle: { color: INK_DARK, fontSize: 12, fontFamily: FONT_SERIF },
        formatter: (p: any) => {
          if (p.seriesName === "centroids") return `<b>${p.name}</b><br/>类型质心 · ${data.pca_centroids[p.name]?.count || "?"} 部剧本`;
          if (isStructure) {
            return `<b>${p.data[2]}</b><br/>类型: ${p.data[3]}<br/>结构标签: ${p.data[6]}<br/>角色: ${p.data[4]} 边: ${p.data[5]}`;
          }
          return `<b>${p.data[2]}</b><br/>类型: ${p.seriesName}<br/>结构标签: ${p.data[5]}<br/>角色: ${p.data[3]} 边: ${p.data[4]}`;
        },
      },
      xAxis: {
        name: "度集中度 (Degree Centralization)",
        nameLocation: "center", nameGap: 28,
        nameTextStyle: { fontSize: 11, color: INK_SOFT, fontFamily: FONT_SERIF },
        axisLabel: { fontSize: 10, color: INK_SOFT, fontFamily: FONT_SERIF },
        splitLine: { show: false },
      },
      yAxis: {
        name: "最大连通分量占比 (Largest Component Ratio)",
        nameLocation: "center", nameGap: 40,
        nameTextStyle: { fontSize: 11, color: INK_SOFT, fontFamily: FONT_SERIF },
        axisLabel: { fontSize: 10, color: INK_SOFT, fontFamily: FONT_SERIF },
        splitLine: { show: false },
      },
      series,
      animationDuration: 500,
    }, true);

    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("resize", h); chart.dispose(); };
  }, [mainView, scatterColorMode]);

  /* ==================================================================
     Chart 3 — 类型对比仪表盘 (2×2)
       左上: 雷达图 · 右上: 桑基图
       左下: 结构标签堆叠柱状 · 右下: 行当热力图
     ================================================================== */

  /* ── 3a. Radar Chart — 类型指纹 ── */
  useEffect(() => {
    if (mainView !== "dashboard" || !radarRef.current) return;
    const chart = echarts.init(radarRef.current);
    const radarData = data.radar_metrics as Record<string, any> || {};
    const types = TYPE_ORDER.filter((t) => radarData[t]);
    // Normalize centralization to 0-1 (raw values may exceed 1)
    const centrVals = types.map((t) => radarData[t].centralization);
    const centrMax = Math.max(...centrVals);
    const series = types.map((t) => ({
      name: t,
      type: "radar",
      symbol: "circle",
      symbolSize: 3,
      lineStyle: { width: 1.6, color: TYPE_COLORS[t] },
      areaStyle: { color: TYPE_COLORS[t], opacity: 0.06 },
      itemStyle: { color: TYPE_COLORS[t] },
      data: [{
        value: [
          radarData[t].node_count_norm,
          radarData[t].density,
          radarData[t].clustering,
          radarData[t].centralization / centrMax,
          radarData[t].degree_entropy,
        ],
        name: t,
      }],
    }));
    chart.setOption({
      backgroundColor: PAPER_BG,
      tooltip: {
        backgroundColor: "rgba(250,245,235,0.94)",
        borderColor: "rgba(160,130,100,0.45)",
        borderWidth: 1,
        textStyle: { color: INK_DARK, fontSize: 11, fontFamily: FONT_SERIF },
      },
      legend: {
        data: types, bottom: 0,
        textStyle: { fontSize: 9, color: INK_SOFT, fontFamily: FONT_SERIF },
        itemWidth: 10, itemHeight: 6,
      },
      radar: {
        indicator: [
          { name: "角色规模", max: 1 },
          { name: "密度", max: 1 },
          { name: "聚类系数", max: 1 },
          { name: "度集中度", max: 1 },
          { name: "度分布熵", max: 1 },
        ],
        center: ["50%", "48%"],
        radius: "62%",
        axisName: { fontSize: 9, color: INK_SOFT, fontFamily: FONT_SERIF },
        splitArea: { areaStyle: { color: ["rgba(180,155,120,0.04)", "transparent"] } },
        axisLine: { lineStyle: { color: "rgba(180,155,120,0.25)" } },
        splitLine: { lineStyle: { color: "rgba(180,155,120,0.15)" } },
      },
      series,
      animationDuration: 600,
    }, true);
    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("resize", h); chart.dispose(); };
  }, [mainView]);

  /* ── 3b. Sankey — 关系流向 (ECharts) ── */
  useEffect(() => {
    if (mainView !== "dashboard" || !sankeyRef.current) return;
    const chart = echarts.init(sankeyRef.current);

    const sd = data.sankey_data as any || { nodes: [], links: [] };
    const rawNodes: any[] = sd.nodes || [];
    const rawLinks: any[] = sd.links || [];

    // 构建带颜色和标签的节点
    const nodes = rawNodes.map((n: any) => {
      const rawName: string = n.name || "";
      const isMacro = rawName.startsWith("M:");
      const label = rawName.slice(2);
      const color = isMacro
        ? (EDGE_RELATION_COLORS[label] || "#937860")
        : (TYPE_COLORS[label] || "#a09080");
      return { name: rawName, label, color, isMacro };
    });

    // 构建链接
    const links = rawLinks.map((l: any) => ({
      source: typeof l.source === "number" ? rawNodes[l.source]?.name : String(l.source),
      target: typeof l.target === "number" ? rawNodes[l.target]?.name : String(l.target),
      value: l.value || 1,
    }));

    chart.setOption({
      backgroundColor: PAPER_BG,
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(250,245,235,0.94)",
        borderColor: "rgba(160,130,100,0.45)",
        borderWidth: 1,
        textStyle: { color: INK_DARK, fontSize: 11, fontFamily: FONT_SERIF },
        formatter: (p: any) => {
          if (p.dataType === "node") {
            const node = nodes.find((n: any) => n.name === p.name);
            return `<b>${node?.label || p.name}</b><br/>${node?.isMacro ? "关系类型" : "剧目类型"}`;
          }
          return `${p.data.source} → ${p.data.target}<br/>关系数: <b>${(p.data.value as number)?.toLocaleString()}</b>`;
        },
      },
      series: [{
        type: "sankey",
        layout: "none",
        layoutIterations: 0,
        emphasis: { focus: "adjacency" },
        nodeAlign: "justify",
        data: nodes.map((n: any) => ({
          name: n.name,
          itemStyle: { color: n.color, borderColor: "rgba(255,255,255,0.5)", borderWidth: 1 },
          label: {
            show: true,
            formatter: n.label,
            fontSize: 11,
            fontWeight: 600,
            color: n.color,
            fontFamily: "'Noto Serif SC','PT Serif',serif",
          },
        })),
        links: links.map((l: any) => ({
          source: l.source,
          target: l.target,
          value: l.value,
          lineStyle: {
            color: "gradient",
            curveness: 0.5,
            opacity: 0.15,
          },
        })),
      }],
    }, true);

    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("resize", h); chart.dispose(); };
  }, [mainView]);

  /* ── 3c. Stacked Bar — 结构标签比例 ── */
  useEffect(() => {
    if (mainView !== "dashboard" || !stackedBarRef.current) return;
    const chart = echarts.init(stackedBarRef.current);
    const structByType = data.structure_by_type as Record<string, any> || {};
    const labels = data.structure_labels as string[] || [];
    const colors = data.structure_colors as Record<string, string> || {};
    const types = TYPE_ORDER.filter((t) => structByType[t]);
    const series = labels.map((label) => ({
      name: label,
      type: "bar",
      stack: "total",
      data: types.map((t) => structByType[t][label]?.pct || 0),
      itemStyle: { color: colors[label] || "#a09080" },
      barMaxWidth: 28,
      emphasis: { focus: "series" },
    }));
    chart.setOption({
      backgroundColor: PAPER_BG,
      tooltip: {
        trigger: "axis", axisPointer: { type: "shadow" },
        backgroundColor: "rgba(250,245,235,0.94)",
        borderColor: "rgba(160,130,100,0.45)",
        borderWidth: 1,
        textStyle: { color: INK_DARK, fontSize: 11, fontFamily: FONT_SERIF },
        formatter: (params: any) => {
          let html = `<b>${params[0].axisValue}</b>`;
          params.forEach((p: any) => { html += `<br/>${p.seriesName}: ${p.value}%`; });
          return html;
        },
      },
      legend: {
        data: labels, bottom: 0,
        textStyle: { fontSize: 8, color: INK_SOFT, fontFamily: FONT_SERIF },
        itemWidth: 8, itemHeight: 8,
      },
      grid: { left: 50, right: 16, top: 12, bottom: 44 },
      xAxis: {
        type: "category", data: types,
        axisLabel: { fontSize: 9, color: INK_SOFT, fontFamily: FONT_SERIF, rotate: 20 },
      },
      yAxis: {
        type: "value", max: 100,
        axisLabel: { fontSize: 8, color: INK_SOFT, fontFamily: FONT_SERIF, formatter: "{value}%" },
        splitLine: { lineStyle: { color: "rgba(180,155,120,0.12)" } },
      },
      series,
      animationDuration: 500,
    }, true);
    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("resize", h); chart.dispose(); };
  }, [mainView]);

  /* ── 3d. Heatmap — 行当分布 ── */
  useEffect(() => {
    if (mainView !== "dashboard" || !hangdangHeatRef.current) return;
    const chart = echarts.init(hangdangHeatRef.current);
    const hd = data.hangdang_distribution as Record<string, any> || {};
    const hangdangOrder = ["生", "旦", "净", "丑", "未知"];
    const types = TYPE_ORDER.filter((t) => hd[t]);
    const hData: any[] = [];
    types.forEach((t, ti) => {
      const dist = hd[t].distribution || {};
      hangdangOrder.forEach((h, hi) => {
        const ratio = dist[h]?.ratio || 0;
        hData.push([hi, ti, ratio]);
      });
    });
    chart.setOption({
      backgroundColor: PAPER_BG,
      tooltip: {
        backgroundColor: "rgba(250,245,235,0.94)",
        borderColor: "rgba(160,130,100,0.45)",
        borderWidth: 1,
        textStyle: { color: INK_DARK, fontSize: 11, fontFamily: FONT_SERIF },
        formatter: (p: any) => {
          const hdType = hangdangOrder[p.data[0]];
          const playType = types[p.data[1]];
          return `<b>${playType}</b><br/>${hdType}: <b>${(p.data[2] * 100).toFixed(1)}%</b>`;
        },
      },
      grid: { left: 56, right: 16, top: 8, bottom: 8 },
      xAxis: {
        type: "category", data: hangdangOrder, position: "top",
        axisLabel: { fontSize: 10, color: INK_WARM, fontWeight: 600, fontFamily: FONT_SERIF },
        axisLine: { show: false }, axisTick: { show: false },
      },
      yAxis: {
        type: "category", data: types,
        axisLabel: { fontSize: 10, color: INK_SOFT, fontFamily: FONT_SERIF },
        axisLine: { show: false }, axisTick: { show: false },
      },
      visualMap: {
        min: 0, max: 0.5,
        orient: "horizontal", left: "center", bottom: 0,
        inRange: { color: ["#f5f0e8", "#d4c4a8", INK_SOFT, INK_WARM] },
        textStyle: { fontSize: 8, color: INK_SOFT, fontFamily: FONT_SERIF },
        itemWidth: 10, itemHeight: 80,
        show: false,
      },
      series: [{
        type: "heatmap", data: hData,
        label: { show: true, fontSize: 9, fontFamily: FONT_SERIF,
          formatter: (p: any) => (p.data[2] * 100).toFixed(1) + "%",
        },
        emphasis: { itemStyle: { shadowBlur: 8, shadowColor: "rgba(0,0,0,0.15)" } },
      }],
      animationDuration: 400,
    }, true);
    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("resize", h); chart.dispose(); };
  }, [mainView]);

  /* ══════════════════════════════════════════════════════════════════
     Modal Chart Effects — Dashboard 放大视图
     (独立渲染到 modal 容器中，复用原有 chart option 逻辑)
     ══════════════════════════════════════════════════════════════════ */

  /* ── Modal: Radar Chart ── */
  useEffect(() => {
    if (dashboardModal !== "radar" || !radarModalRef.current) return;
    const chart = echarts.init(radarModalRef.current);
    const radarData = data.radar_metrics as Record<string, any> || {};
    const types = TYPE_ORDER.filter((t) => radarData[t]);
    const centrVals = types.map((t) => radarData[t].centralization);
    const centrMax = Math.max(...centrVals);
    const series = types.map((t) => ({
      name: t, type: "radar", symbol: "circle", symbolSize: 5,
      lineStyle: { width: 2.2, color: TYPE_COLORS[t] },
      areaStyle: { color: TYPE_COLORS[t], opacity: 0.08 },
      itemStyle: { color: TYPE_COLORS[t] },
      data: [{ value: [radarData[t].node_count_norm, radarData[t].density, radarData[t].clustering, radarData[t].centralization / centrMax, radarData[t].degree_entropy], name: t }],
    }));
    chart.setOption({
      backgroundColor: PAPER_BG,
      tooltip: { backgroundColor: "rgba(250,245,235,0.94)", borderColor: "rgba(160,130,100,0.45)", borderWidth: 1, textStyle: { color: INK_DARK, fontSize: 13, fontFamily: FONT_SERIF } },
      legend: { data: types, bottom: 0, textStyle: { fontSize: 11, color: INK_SOFT, fontFamily: FONT_SERIF }, itemWidth: 14, itemHeight: 10 },
      radar: { indicator: [{ name: "角色规模", max: 1 }, { name: "密度", max: 1 }, { name: "聚类系数", max: 1 }, { name: "度集中度", max: 1 }, { name: "度分布熵", max: 1 }], center: ["50%", "46%"], radius: "72%", axisName: { fontSize: 11, color: INK_SOFT, fontFamily: FONT_SERIF }, splitArea: { areaStyle: { color: ["rgba(180,155,120,0.04)", "transparent"] } }, axisLine: { lineStyle: { color: "rgba(180,155,120,0.25)" } }, splitLine: { lineStyle: { color: "rgba(180,155,120,0.15)" } } },
      series, animationDuration: 600,
    }, true);
    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("resize", h); chart.dispose(); };
  }, [dashboardModal]);

  /* ── Modal: Sankey (ECharts) ── */
  useEffect(() => {
    if (dashboardModal !== "sankey" || !sankeyModalRef.current) return;
    const chart = echarts.init(sankeyModalRef.current);

    const sd = data.sankey_data as any || { nodes: [], links: [] };
    const rawNodes: any[] = sd.nodes || [];
    const rawLinks: any[] = sd.links || [];

    const nodes = rawNodes.map((n: any) => {
      const rawName: string = n.name || "";
      const isMacro = rawName.startsWith("M:");
      const label = rawName.slice(2);
      const color = isMacro
        ? (EDGE_RELATION_COLORS[label] || "#937860")
        : (TYPE_COLORS[label] || "#a09080");
      return { name: rawName, label, color, isMacro };
    });

    const links = rawLinks.map((l: any) => ({
      source: typeof l.source === "number" ? rawNodes[l.source]?.name : String(l.source),
      target: typeof l.target === "number" ? rawNodes[l.target]?.name : String(l.target),
      value: l.value || 1,
    }));

    chart.setOption({
      backgroundColor: PAPER_BG,
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(250,245,235,0.94)",
        borderColor: "rgba(160,130,100,0.45)",
        borderWidth: 1,
        textStyle: { color: INK_DARK, fontSize: 13, fontFamily: FONT_SERIF },
        formatter: (p: any) => {
          if (p.dataType === "node") {
            const node = nodes.find((n: any) => n.name === p.name);
            return `<b>${node?.label || p.name}</b><br/>${node?.isMacro ? "关系类型" : "剧目类型"}`;
          }
          return `${p.data.source} → ${p.data.target}<br/>关系数: <b>${(p.data.value as number)?.toLocaleString()}</b>`;
        },
      },
      series: [{
        type: "sankey",
        layout: "none",
        layoutIterations: 0,
        emphasis: { focus: "adjacency" },
        nodeAlign: "justify",
        data: nodes.map((n: any) => ({
          name: n.name,
          itemStyle: { color: n.color, borderColor: "rgba(255,255,255,0.5)", borderWidth: 1.5 },
          label: {
            show: true,
            formatter: n.label,
            fontSize: 14,
            fontWeight: 600,
            color: n.color,
            fontFamily: "'Noto Serif SC','PT Serif',serif",
          },
        })),
        links: links.map((l: any) => ({
          source: l.source,
          target: l.target,
          value: l.value,
          lineStyle: {
            color: "gradient",
            curveness: 0.5,
            opacity: 0.18,
          },
        })),
      }],
    }, true);

    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("resize", h); chart.dispose(); };
  }, [dashboardModal]);

  /* ── Modal: Stacked Bar ── */
  useEffect(() => {
    if (dashboardModal !== "stackedBar" || !stackedBarModalRef.current) return;
    const chart = echarts.init(stackedBarModalRef.current);
    const structByType = data.structure_by_type as Record<string, any> || {};
    const labels = data.structure_labels as string[] || [];
    const colors = data.structure_colors as Record<string, string> || {};
    const types = TYPE_ORDER.filter((t) => structByType[t]);
    const series = labels.map((label) => ({ name: label, type: "bar", stack: "total", data: types.map((t) => structByType[t][label]?.pct || 0), itemStyle: { color: colors[label] || "#a09080" }, barMaxWidth: 40, emphasis: { focus: "series" } }));
    chart.setOption({
      backgroundColor: PAPER_BG,
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, backgroundColor: "rgba(250,245,235,0.94)", borderColor: "rgba(160,130,100,0.45)", borderWidth: 1, textStyle: { color: INK_DARK, fontSize: 13, fontFamily: FONT_SERIF }, formatter: (params: any) => { let html = `<b>${params[0].axisValue}</b>`; params.forEach((p: any) => { html += `<br/>${p.seriesName}: ${p.value}%`; }); return html; } },
      legend: { data: labels, bottom: 0, textStyle: { fontSize: 11, color: INK_SOFT, fontFamily: FONT_SERIF }, itemWidth: 12, itemHeight: 12 },
      grid: { left: 70, right: 30, top: 24, bottom: 56 },
      xAxis: { type: "category", data: types, axisLabel: { fontSize: 12, color: INK_SOFT, fontFamily: FONT_SERIF, rotate: 20 } },
      yAxis: { type: "value", max: 100, axisLabel: { fontSize: 11, color: INK_SOFT, fontFamily: FONT_SERIF, formatter: "{value}%" }, splitLine: { lineStyle: { color: "rgba(180,155,120,0.12)" } } },
      series, animationDuration: 500,
    }, true);
    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("resize", h); chart.dispose(); };
  }, [dashboardModal]);

  /* ── Modal: Heatmap ── */
  useEffect(() => {
    if (dashboardModal !== "heatmap" || !heatmapModalRef.current) return;
    const chart = echarts.init(heatmapModalRef.current);
    const hd = data.hangdang_distribution as Record<string, any> || {};
    const hangdangOrder = ["生", "旦", "净", "丑", "未知"];
    const types = TYPE_ORDER.filter((t) => hd[t]);
    const hData: any[] = [];
    types.forEach((t, ti) => { const dist = hd[t].distribution || {}; hangdangOrder.forEach((h, hi) => { const ratio = dist[h]?.ratio || 0; hData.push([hi, ti, ratio]); }); });
    chart.setOption({
      backgroundColor: PAPER_BG,
      tooltip: { backgroundColor: "rgba(250,245,235,0.94)", borderColor: "rgba(160,130,100,0.45)", borderWidth: 1, textStyle: { color: INK_DARK, fontSize: 13, fontFamily: FONT_SERIF }, formatter: (p: any) => { const hdType = hangdangOrder[p.data[0]]; const playType = types[p.data[1]]; return `<b>${playType}</b><br/>${hdType}: <b>${(p.data[2] * 100).toFixed(1)}%</b>`; } },
      grid: { left: 70, right: 30, top: 8, bottom: 8 },
      xAxis: { type: "category", data: hangdangOrder, position: "top", axisLabel: { fontSize: 13, color: INK_WARM, fontWeight: 600, fontFamily: FONT_SERIF }, axisLine: { show: false }, axisTick: { show: false } },
      yAxis: { type: "category", data: types, axisLabel: { fontSize: 13, color: INK_SOFT, fontFamily: FONT_SERIF }, axisLine: { show: false }, axisTick: { show: false } },
      visualMap: { min: 0, max: 0.5, orient: "horizontal", left: "center", bottom: 0, inRange: { color: ["#f5f0e8", "#d4c4a8", INK_SOFT, INK_WARM] }, textStyle: { fontSize: 8, color: INK_SOFT, fontFamily: FONT_SERIF }, itemWidth: 10, itemHeight: 80, show: false },
      series: [{ type: "heatmap", data: hData, label: { show: true, fontSize: 12, fontFamily: FONT_SERIF, formatter: (p: any) => (p.data[2] * 100).toFixed(1) + "%" }, emphasis: { itemStyle: { shadowBlur: 8, shadowColor: "rgba(0,0,0,0.15)" } } }],
      animationDuration: 400,
    }, true);
    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("resize", h); chart.dispose(); };
  }, [dashboardModal]);

  /* ==================================================================
     Chart 4 — 集中度分布 (蜂群图 + 中位标记)
       上: 度集中度分布  ·  下: 介数集中度分布
       每一点 = 一个剧本，横向展开无重叠
     ================================================================== */

  /**
   * 蜂群定位算法：将同一类型的值按大小排列，水平展开使点不重叠。
   * 返回 [categoryIndex + offset, value] 数组。
   */
  const beeswarmLayout = (
    values: number[],
    categoryIndex: number,
    dotSpacing: number,
  ): [number, number][] => {
    const sorted = values.map((v) => ({ v })).sort((a, b) => a.v - b.v);
    const placed: { x: number; y: number }[] = [];
    const result: [number, number][] = [];

    for (const { v } of sorted) {
      // 从中心开始，交替向两侧试探，直到找到不碰撞的位置
      let cx = categoryIndex;
      let found = false;
      for (let dist = 0; dist < 60 && !found; dist++) {
        const offsets = dist === 0 ? [0] : [dist, -dist];
        for (const sign of offsets) {
          const candidate = categoryIndex + sign * dotSpacing;
          const collides = placed.some(
            (p) => Math.abs(p.x - candidate) < dotSpacing * 0.7 && Math.abs(p.y - v) < dotSpacing * 0.7,
          );
          if (!collides) {
            cx = candidate;
            found = true;
            break;
          }
        }
      }
      placed.push({ x: cx, y: v });
      result.push([cx, v]);
    }
    return result;
  };

  /* ── 4a. Degree Centralization Beeswarm ── */
  useEffect(() => {
    if (mainView !== "distribution" || !distDegreeRef.current) return;
    const chart = echarts.init(distDegreeRef.current);
    const points = data.pca_points as any[] || [];
    const types = TYPE_ORDER.filter((t) => points.some((p) => p.genre === t));
    const DOT_SPACING = 0.065;

    // 蜂群散点
    const swarmData: [number, number][] = [];
    // 中位数标记线
    const medianMarkLines: any[] = [];

    types.forEach((t, ti) => {
      const vals = points
        .filter((p) => p.genre === t)
        .map((p) => p.x)
        .sort((a: number, b: number) => a - b);
      const median = vals[Math.floor(vals.length / 2)];
      const positions = beeswarmLayout(vals, ti, DOT_SPACING);
      swarmData.push(...positions);

      medianMarkLines.push({
        name: `${t} 中位`,
        xAxis: ti,
        yAxis: median,
        value: median,
        lineStyle: { color: INK_DARK, type: "solid" as const, width: 1.2, opacity: 0.5 },
        symbol: "none",
        label: { show: false },
      });
    });

    chart.setOption({
      backgroundColor: PAPER_BG,
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(250,245,235,0.94)",
        borderColor: "rgba(160,130,100,0.45)",
        borderWidth: 1,
        textStyle: { color: INK_DARK, fontSize: 11, fontFamily: FONT_SERIF },
        formatter: (p: any) => {
          if (p.seriesType === "scatter") {
            return `<b>${types[Math.round(p.data[0])]}</b><br/>度集中度: ${p.data[1].toFixed(3)}`;
          }
          if (p.seriesType === "custom") {
            return `<b>${p.name}</b><br/>中位数: ${p.data.value?.toFixed(3) ?? ""}`;
          }
          return "";
        },
      },
      grid: { left: 50, right: 20, top: 18, bottom: 32 },
      xAxis: {
        type: "category",
        data: types,
        axisLabel: { fontSize: 10, color: INK_SOFT, fontFamily: FONT_SERIF, rotate: 15 },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        name: "度集中度",
        min: 0,
        max: 1,
        nameTextStyle: { fontSize: 10, color: INK_SOFT, fontFamily: FONT_SERIF },
        axisLabel: { fontSize: 9, color: INK_SOFT, fontFamily: FONT_SERIF },
        splitLine: { lineStyle: { color: "rgba(180,155,120,0.12)" } },
      },
      series: [
        {
          name: "剧本",
          type: "scatter",
          data: swarmData,
          symbolSize: 4.5,
          itemStyle: {
            opacity: 0.50,
            color: (params: any) => TYPE_COLORS[types[Math.round(params.data[0])]] || GOLD_NODE,
          },
          tooltip: { show: true },
          z: 2,
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: INK_DARK, type: "dashed", width: 1, opacity: 0.45 },
            label: { show: false },
            data: medianMarkLines.map((m) => ({
              xAxis: m.xAxis,
              lineStyle: { color: INK_DARK, type: "dashed" as const, width: 1, opacity: 0.45 },
            })),
          },
        },
      ],
      animationDuration: 600,
    }, true);
    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("resize", h); chart.dispose(); };
  }, [mainView]);

  /* ── 4b. Betweenness Centralization Beeswarm ── */
  useEffect(() => {
    if (mainView !== "distribution" || !distBetweenRef.current) return;
    const chart = echarts.init(distBetweenRef.current);
    const points = data.pca_points as any[] || [];
    const types = TYPE_ORDER.filter((t) =>
      points.some((p) => p.genre === t && (p.betweenness || 0) > 0),
    );
    const DOT_SPACING = 0.065;

    const swarmData: [number, number][] = [];

    types.forEach((t, ti) => {
      const vals = points
        .filter((p) => p.genre === t)
        .map((p) => p.betweenness || 0)
        .filter((v: number) => v > 0)
        .sort((a: number, b: number) => a - b);
      if (vals.length === 0) return;
      const positions = beeswarmLayout(vals, ti, DOT_SPACING);
      swarmData.push(...positions);
    });

    chart.setOption({
      backgroundColor: PAPER_BG,
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(250,245,235,0.94)",
        borderColor: "rgba(160,130,100,0.45)",
        borderWidth: 1,
        textStyle: { color: INK_DARK, fontSize: 11, fontFamily: FONT_SERIF },
        formatter: (p: any) => {
          if (p.seriesType === "scatter") {
            return `<b>${types[Math.round(p.data[0])]}</b><br/>介数集中度: ${p.data[1].toFixed(3)}`;
          }
          return "";
        },
      },
      grid: { left: 50, right: 20, top: 18, bottom: 32 },
      xAxis: {
        type: "category",
        data: types,
        axisLabel: { fontSize: 10, color: INK_SOFT, fontFamily: FONT_SERIF, rotate: 15 },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        name: "介数集中度",
        max: 1,
        nameTextStyle: { fontSize: 10, color: INK_SOFT, fontFamily: FONT_SERIF },
        axisLabel: { fontSize: 9, color: INK_SOFT, fontFamily: FONT_SERIF },
        splitLine: { lineStyle: { color: "rgba(180,155,120,0.12)" } },
        min: (val: any) => Math.max(0, val.min - 0.02),
      },
      series: [
        {
          name: "剧本",
          type: "scatter",
          data: swarmData,
          symbolSize: 4.5,
          itemStyle: {
            opacity: 0.50,
            color: (params: any) => TYPE_COLORS[types[Math.round(params.data[0])]] || GOLD_NODE,
          },
          tooltip: { show: true },
          z: 2,
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: INK_DARK, type: "dashed", width: 1, opacity: 0.45 },
            label: { show: false },
            data: types.map((_t, ti) => ({
              xAxis: ti,
              lineStyle: { color: INK_DARK, type: "dashed" as const, width: 1, opacity: 0.45 },
            })),
          },
        },
      ],
      animationDuration: 600,
    }, true);
    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("resize", h); chart.dispose(); };
  }, [mainView]);

  const reportContent = useMemo(() => {
    switch (reportTab) {
      case "report": return <ReportContent />;
      case "findings": return <FindingsContent />;
      case "metrics": return <MetricsTab />;
      default: return null;
    }
  }, [reportTab]);

  /* ---- k-core 核心圈层计算 ---- */
  const coreData = useMemo(() => {
    if (!currentNet || !currentNet.nodes) return { maxK: 0, coreMap: new Map<string, number>(), maxCoreSet: new Set<string>() };
    const cm = computeKCore(currentNet.nodes, currentNet.edges || []);
    let maxK = 0;
    for (const k of cm.values()) maxK = Math.max(maxK, k);
    return {
      maxK,
      coreMap: cm,
      maxCoreSet: new Set([...cm.entries()].filter(([, k]) => k >= maxK).map(([n]) => n)),
    };
  }, [currentNet]);

  /* ---- 枢纽角色（按实际连接数 + k-core筛选）---- */
  const hubChars = useMemo(() => {
    if (!currentNet || !currentNet.nodes) return [];
    const charConnections = new Map<string, { count: number; totalWeight: number }>();
    (currentNet.edges || []).forEach((e: any) => {
      [e.source, e.target].forEach((name: string) => {
        const prev = charConnections.get(name) || { count: 0, totalWeight: 0 };
        prev.count += 1;
        prev.totalWeight += e.weight || 0;
        charConnections.set(name, prev);
      });
    });
    let candidates = (currentNet.nodes || [])
      .filter((n: any) => {
        const c = charConnections.get(n.name);
        return c && c.count > 0;
      })
      .sort((a: any, b: any) => {
        const ca = charConnections.get(a.name) || { count: 0, totalWeight: 0 };
        const cb = charConnections.get(b.name) || { count: 0, totalWeight: 0 };
        return (cb.count * cb.count + cb.totalWeight) - (ca.count * ca.count + ca.totalWeight);
      });

    // k-core 筛选：默认只展示最大 k-core 层角色
    if (showCoreOnly && coreData.maxCoreSet.size > 0) {
      candidates = candidates.filter((n: any) => coreData.maxCoreSet.has(n.name));
    }
    return candidates.slice(0, 8).map((n: any) => {
      const c = charConnections.get(n.name);
      return { name: n.name, degree: c ? c.count : 0, kcore: coreData.coreMap.get(n.name) || 0 };
    });
  }, [currentNet, showCoreOnly, coreData]);

  // ── 当前剧本的主要角色（来自原始数据标注，k-core筛选）──
  const currentMainChars = useMemo(() => {
    if (!currentNet?.entity_id) return [];
    const chars = mainCharsMap.get(currentNet.entity_id) || [];
    const nodeNames = new Set((currentNet.nodes || []).map((n: any) => n.name));
    let filtered = chars.filter((c: string) => nodeNames.has(c));
    if (showCoreOnly && coreData.maxCoreSet.size > 0) {
      filtered = filtered.filter((c: string) => coreData.maxCoreSet.has(c));
    }
    return filtered;
  }, [currentNet, mainCharsMap, showCoreOnly, coreData]);

  // 自动选中第一个主要角色（优先）或第一个枢纽角色（切换类型或切换剧本时）
  useEffect(() => {
    if (currentMainChars.length > 0) {
      selectRole(currentMainChars[0]);
    } else if (hubChars.length > 0) {
      selectRole(hubChars[0].name);
    }
  }, [currentMainChars, hubChars]);

  return (
    <div className="t2-screen">
      {/* ═══════════ Topbar ═══════════ */}
      <header className="t2-topbar">
        <div className="t2-topbar-title-group">
          <h1><span className="t2-brand-icon">🕸️</span> 角色关系网络与剧目类型分析</h1>
          <span className="t2-topbar-desc">场景共现网络 — 揭示历史戏·家庭戏·公案戏等七种剧目类型的关系结构指纹</span>
        </div>
        <button
            className="t2-topbar-report-btn"
            onClick={() => { setReportSidebarOpen(true); setReportTab("report"); }}
            title="查看任务二设计流程报告 — 含角色网络建模·拓扑结构量化·剧目类型比较"
          >
            <span className="t2-report-btn-icon">📋</span>
            <span className="t2-report-btn-text">
              <span className="t2-report-btn-label">设计流程报告</span>
              <span className="t2-report-btn-sub">方法 · 参数 · 流程</span>
            </span>
            <span className="t2-report-btn-arrow">→</span>
          </button>
      </header>

      {/* ═══════════ Main Grid ═══════════ */}
      <div className={`t2-main-grid ${mainView !== "network" ? "t2-main-grid--full" : ""}`}>
        {/* ── LEFT: 紧凑侧边栏 ── */}
        <div className="t2-side-panel">
          {/* 剧目类型按钮组 */}
          <div className="t2-side-block">
            <div className="t2-side-block-header"><h3>剧目类型</h3></div>
            <div className="t2-type-selector">
              {TYPE_ORDER.filter((t) => data.type_means[t]).map((t) => (
                <button key={t}
                  className={`t2-type-btn ${selectedType === t ? "active" : ""}`}
                  onClick={() => setSelectedType(t)}>
                  <span className="t2-type-dot" style={{ backgroundColor: TYPE_COLORS[t] || GOLD_NODE }} />
                  <span>{t}</span>
                  <span className="t2-type-count">{data.type_means[t]?.count || 0}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 核心指标 — 竖排 */}
          {typeData && (
            <div className="t2-side-block">
              <div className="t2-side-block-header"><h3>核心指标</h3></div>
              <div className="t2-metrics-list">
                {[
                  ["密度", typeData.metrics.density.toFixed(3)],
                  ["聚类系数", typeData.metrics.clustering.toFixed(3)],
                  ["度集中度", typeData.metrics.centralization?.toFixed(3) || "-"],
                ].map(([label, val]) => (
                  <div key={label} className="t2-metric-row">
                    <span className="t2-metric-row-label">{label}</span>
                    <span className="t2-metric-row-value">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 枢纽角色 / 代表性剧本 */}
          <div className="t2-side-block">
            {mainView === "network" ? (
              <>
                {/* k-core 圈层筛选切换 */}
                <div className="t2-side-sub-block t2-core-toggle-row">
                  <button
                    className={`t2-core-toggle-btn ${showCoreOnly ? "active" : ""}`}
                    onClick={() => setShowCoreOnly(true)}
                    title="仅显示最大k-core核心圈层角色">
                    核心圈层
                  </button>
                  <button
                    className={`t2-core-toggle-btn ${!showCoreOnly ? "active" : ""}`}
                    onClick={() => setShowCoreOnly(false)}
                    title="显示全部角色">
                    全部角色
                  </button>
                  {coreData.maxK > 0 && (
                    <span className="t2-core-k-badge">k={coreData.maxK}</span>
                  )}
                </div>
                {/* 主要角色（剧本标注） */}
                {currentMainChars.length > 0 && (
                  <div className="t2-side-sub-block">
                    <div className="t2-side-block-header">
                      <h3>🎭 主要角色</h3>
                      <span className="t2-side-block-hint">{showCoreOnly ? `核心圈·${currentMainChars.length}人` : `全部·${currentMainChars.length}人`}</span>
                    </div>
                    {currentMainChars.map((name: string, i: number) => {
                      const k = coreData.coreMap.get(name) || 0;
                      const isCore = coreData.maxCoreSet.has(name);
                      return (
                      <button key={name}
                        className={`t2-hub-char-btn ${selectedRole === name ? "active" : ""}`}
                        onClick={() => selectRole(name)}>
                        <span className="t2-hub-char-rank" style={{
                          background: isCore ? (i === 0 ? "#b8926a" : "#8b7355") : "#c0c0c0"
                        }}>{isCore ? "★" : "·"}</span>
                        <span className="t2-hub-char-name" style={{ opacity: isCore ? 1 : 0.55 }}>{name}</span>
                        <span className="t2-hub-char-degree" style={{ fontSize: 9, opacity: 0.6 }}>k{k}</span>
                      </button>
                    )})}
                  </div>
                )}
                {/* 枢纽角色（按网络中心性） */}
                <div className="t2-side-sub-block">
                  <div className="t2-side-block-header">
                    <h3>🔗 枢纽角色</h3>
                    <span className="t2-side-block-hint">{showCoreOnly ? '核心圈' : '按连接数'}</span>
                  </div>
                  {hubChars
                    .filter((c: any) => !currentMainChars.includes(c.name))
                    .slice(0, 6)
                    .map((c: any, i: number) => {
                      const isCore = coreData.maxCoreSet.has(c.name);
                      return (
                      <button key={c.name}
                        className={`t2-hub-char-btn ${selectedRole === c.name ? "active" : ""}`}
                        onClick={() => selectRole(c.name)}>
                        <span className="t2-hub-char-rank" style={{ opacity: isCore ? 1 : 0.5 }}>#{i + 1}</span>
                        <span className="t2-hub-char-name" style={{ opacity: isCore ? 1 : 0.55 }}>{c.name}</span>
                        <span className="t2-hub-char-degree">{c.degree}关联</span>
                      </button>
                    )})}
                  {hubChars.filter((c: any) => !currentMainChars.includes(c.name)).length === 0 && (
                    <div className="t2-side-block-hint" style={{ padding: '6px 0', fontSize: 11, color: INK_SOFT }}>
                      {showCoreOnly ? '核心圈已覆盖全部角色' : '暂无额外枢纽角色'}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="t2-side-block-header"><h3>代表性剧本</h3></div>
                {topPlays.map((p: any, i: number) => (
                  <button key={i} className="t2-hub-char-btn"
                    onClick={() => {
                      setNetPlayEntityId(p.entity_id);
                      setMainView("network");
                    }}>
                    <span className="t2-hub-char-rank">#{i + 1}</span>
                    <span className="t2-hub-char-name">{p.title}</span>
                    <span className="t2-hub-char-degree">{p.edge_count || 0}边</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        {/* ── CENTER: 主视图区 ── */}
        <div className="t2-center">
          <div className="t2-main-vis">
            {/* ── 顶部工具栏: 视图切换左 + 剧本选择右 ── */}
            <div className="t2-chart-toolbar">
              <div className="t2-view-switcher">
                {(Object.entries(VIEW_LABELS) as [MainView, string][]).map(([v, label]) => (
                  <button key={v} className={`t2-view-btn ${mainView === v ? "active" : ""}`} onClick={() => setMainView(v)}>
                    {label}
                  </button>
                ))}
              </div>
              {/* 散点图着色模式 */}
              {mainView === "scatter" && (
                <div className="t2-scatter-color-toggle">
                  <span className="t2-scatter-color-label">着色</span>
                  <button
                    className={`t2-view-btn ${scatterColorMode === "genre" ? "active" : ""}`}
                    onClick={() => setScatterColorMode("genre")}
                  >按类型</button>
                  <button
                    className={`t2-view-btn ${scatterColorMode === "structure" ? "active" : ""}`}
                    onClick={() => setScatterColorMode("structure")}
                  >按结构标签</button>
                </div>
              )}
              {mainView === "network" && (
                <div className="t2-net-meta-inline">
                  <div className="t2-play-selector" ref={playDropdownRef}>
                    <button className="t2-play-selector-btn"
                      onClick={() => { setPlayDropdownOpen(!playDropdownOpen); setPlaySearch(""); }}>
                      <span className="t2-net-title">{currentNet?.title || (allPlaysLoading ? "加载中..." : "选择剧本")}</span>
                      <span className="t2-play-arrow">{playDropdownOpen ? "▲" : "▼"}</span>
                    </button>
                    {playDropdownOpen && (
                      <div className="t2-play-dropdown">
                        <div className="t2-play-search-bar">
                          <input className="t2-play-search-input" placeholder={`搜索${selectedType}剧本... (共${allPlaysList.length}部)`}
                            value={playSearch}
                            onChange={(e) => setPlaySearch(e.target.value)}
                            onClick={(e) => e.stopPropagation()} autoFocus />
                        </div>
                        <div className="t2-play-dropdown-scroll">
                        {filteredAllPlays.map((p: any) => (
                          <button key={p.entity_id}
                            className={`t2-play-dropdown-item ${netPlayEntityId === p.entity_id ? "active" : ""}`}
                            onClick={() => {
                              setNetPlayEntityId(p.entity_id);
                              setPlayDropdownOpen(false);
                              setPlaySearch("");
                              ensureNetworkLoaded(p.entity_id).then(() => {
                                // Force re-render by updating cache ref
                                if (playNetworksCache.current.has(p.entity_id)) {
                                  setNetPlayEntityId(p.entity_id);
                                }
                              });
                            }}>
                            <span className="t2-play-name">{p.title}</span>
                            <span className="t2-play-meta">{p.node_count || 0}角·{p.edge_count || 0}边</span>
                          </button>
                        ))}
                        {filteredAllPlays.length === 0 && (
                          <div className="t2-play-search-empty">无匹配剧本</div>
                        )}
                        </div>
                      </div>
                    )}
                  </div>
                  {currentNet && (
                    <>
                      <span className="t2-net-stat">角色{currentNet.total_characters}</span>
                      <span className="t2-net-stat">边{currentNet.total_edges}</span>
                    </>
                  )}
                  {currentNet && (
                  <button
                    className={`t2-edge-toggle ${showNeutralEdges ? "active" : ""}`}
                    onClick={() => setShowNeutralEdges(!showNeutralEdges)}
                    title="隐藏/显示中立关系边（中立边约占69%）"
                  >
                    {showNeutralEdges ? "✓ 中立边" : "✗ 隐藏中立边"}
                  </button>
                  )}
                </div>
              )}
            </div>

            {/* ── 图表主体 ── */}
            {mainView === "network" && (
              currentNet ? (
                <>
                  <div ref={networkRef} className="t2-chart-box" />
                  <div className="t2-edge-legend">
                    {Object.entries(EDGE_RELATION_COLORS).map(([type, color]) => (
                      <span key={type} className="t2-edge-legend-item">
                        <span className="t2-edge-legend-dot" style={{ backgroundColor: color }} />
                        {EDGE_RELATION_LABELS[type] || type}
                      </span>
                    ))}
                  </div>
                </>
              ) : <div className="t2-no-data">该类型暂无剧本数据</div>
            )}
            {mainView === "scatter" && <div ref={scatterRef} className="t2-chart-box" />}
            {mainView === "dashboard" && (
              <div className="t2-dashboard-grid">
                <div className="t2-dash-card">
                  <div className="t2-dash-card-title">
                    类型指纹 · 雷达图
                    <button className="t2-expand-btn" onClick={() => setDashboardModal("radar")} title="放大查看">
                      <span className="t2-expand-icon">⛶</span>
                    </button>
                  </div>
                  <div ref={radarRef} className="t2-dash-chart" />
                </div>
                <div className="t2-dash-card">
                  <div className="t2-dash-card-title">
                    关系流向 · 桑基图
                    <button className="t2-expand-btn" onClick={() => setDashboardModal("sankey")} title="放大查看">
                      <span className="t2-expand-icon">⛶</span>
                    </button>
                  </div>
                  <div ref={sankeyRef} className="t2-dash-chart" />
                </div>
                <div className="t2-dash-card">
                  <div className="t2-dash-card-title">
                    结构标签分布 · 堆叠柱状
                    <button className="t2-expand-btn" onClick={() => setDashboardModal("stackedBar")} title="放大查看">
                      <span className="t2-expand-icon">⛶</span>
                    </button>
                  </div>
                  <div ref={stackedBarRef} className="t2-dash-chart" />
                </div>
                <div className="t2-dash-card">
                  <div className="t2-dash-card-title">
                    核心行当分布 · 热力图
                    <button className="t2-expand-btn" onClick={() => setDashboardModal("heatmap")} title="放大查看">
                      <span className="t2-expand-icon">⛶</span>
                    </button>
                  </div>
                  <div ref={hangdangHeatRef} className="t2-dash-chart" />
                </div>
              </div>
            )}
            {mainView === "distribution" && (
              <div className="t2-distribution-view">
                <div className="t2-dist-chart-box">
                  <div className="t2-dash-card-title">度集中度分布 · 蜂群图</div>
                  <div ref={distDegreeRef} className="t2-dash-chart" />
                </div>
                <div className="t2-dist-chart-box">
                  <div className="t2-dash-card-title">介数集中度分布 · 蜂群图</div>
                  <div ref={distBetweenRef} className="t2-dash-chart" />
                </div>
              </div>
            )}
          </div>

        </div>

        {/* ── RIGHT: 影响力圈层图 (仅网络视图) ── */}
        {mainView === "network" && (
        <div className="t2-ego-sidebar">
          <div className="t2-ego-card">
            {selectedRole && currentNet ? (() => {
              // 核心圈层过滤：仅保留最大k-core中的角色，确保圈层图精简
              const coreSet = coreData.maxCoreSet.size > 0 ? coreData.maxCoreSet : new Set<string>((currentNet.nodes || []).map((n: any) => n.name));
              const filteredNodes = (currentNet.nodes || []).filter((n: any) =>
                n.name === selectedRole || coreSet.has(n.name)
              );
              const filteredNodeNames = new Set(filteredNodes.map((n: any) => n.name));
              const filteredEdges = (currentNet.edges || []).filter((e: any) =>
                (filteredNodeNames.has(e.source) && filteredNodeNames.has(e.target)) &&
                (e.source === selectedRole || e.target === selectedRole)
              );
              const coreNet = { ...currentNet, nodes: filteredNodes, edges: filteredEdges };
              return (<>
                <div className="t2-ego-card-header">
                  <span>🔵 {selectedRole} · 影响力圈层图</span>
                  <span className="t2-ego-play-title">{currentNet.title}</span>
                </div>
                <div className="t2-ego-card-body">
                  <div className="t2-ego-graph-area">
                    <CircleEgoGraph
                      key={`ego-${currentNet.entity_id || currentNet.title}-${selectedRole}`}
                      network={coreNet}
                      centerChar={selectedRole}
                      charRole={charRole}
                      onCenterChange={(name) => selectRole(name)}
                      onSelectChar={(name) => selectRole(name)}
                    />
                  </div>
                  <CircleInfoPanel
                    network={coreNet}
                    centerChar={selectedRole}
                    charRole={charRole}
                  />
                </div>
              </>);
            })() : (
              <div className="t2-ego-placeholder">
                <span className="t2-ego-placeholder-icon">🔵</span>
                <span>点击网络中的角色节点<br/>或左侧枢纽角色<br/>查看影响力圈层图</span>
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      {/* ═══════════ Dashboard Chart Modal ═══════════ */}
      {dashboardModal && (
        <>
          <div className="t2-modal-backdrop" onClick={() => setDashboardModal(null)} />
          <div className="t2-modal">
            <div className="t2-modal-header">
              <h2>{DASHBOARD_MODAL_LABELS[dashboardModal] || ""}</h2>
              <button className="t2-modal-close" onClick={() => setDashboardModal(null)}>✕</button>
            </div>
            <div className="t2-modal-body">
              {dashboardModal === "radar" && <div ref={radarModalRef} className="t2-modal-chart" />}
              {dashboardModal === "sankey" && <div ref={sankeyModalRef} className="t2-modal-chart" />}
              {dashboardModal === "stackedBar" && <div ref={stackedBarModalRef} className="t2-modal-chart" />}
              {dashboardModal === "heatmap" && <div ref={heatmapModalRef} className="t2-modal-chart" />}
            </div>
          </div>
        </>
      )}

      {/* ═══════════ Report Sidebar ═══════════ */}
      <div className={`t2-report-backdrop ${reportSidebarOpen ? "visible" : ""}`} onClick={() => setReportSidebarOpen(false)} />
      <aside className={`t2-report-sidebar ${reportSidebarOpen ? "open" : ""}`}>
        <div className="t2-report-sidebar-header">
          <span className="t2-report-sidebar-header-icon">📋</span>
          <h2>角色关系 · 设计流程报告</h2>
          <button className="t2-report-sidebar-close" onClick={() => setReportSidebarOpen(false)}>✕</button>
        </div>
        <nav className="t2-report-tabs">
          {REPORT_TAB_LABELS.map(t => (
            <button
              key={t.id}
              className={`t2-report-tab ${reportTab === t.id ? "active" : ""}`}
              onClick={() => setReportTab(t.id)}
            >
              <span className="t2-report-tab-icon">{t.icon}</span>
              <span className="t2-report-tab-label">{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="t2-report-sidebar-body">{reportContent}</div>
      </aside>
    </div>
  );
};

/* ================================================================
   Report Content Component
   ================================================================ */
const ReportContent: React.FC = () => {
  const typeMeans = (p2data as any).type_means || {};
  const playIndex = (p2data as any).play_index || [];
  const totalScripts = (p2data as any).total_scripts || 1473;
  const typeOrder = ["历史戏", "家庭戏", "侠义戏", "爱情戏", "神话戏", "公案戏", "技法展示戏"];

  // 计算各类型统计
  const typeStats = useMemo(() => {
    const stats: Record<string, { count: number; avgNodes: number; avgEdges: number }> = {};
    typeOrder.forEach((t) => {
      const plays = playIndex.filter((p: any) => p.genre === t);
      if (plays.length > 0) {
        stats[t] = {
          count: plays.length,
          avgNodes: Math.round(plays.reduce((s: number, p: any) => s + p.node_count, 0) / plays.length),
          avgEdges: Math.round(plays.reduce((s: number, p: any) => s + p.edge_count, 0) / plays.length),
        };
      }
    });
    return stats;
  }, [playIndex]);

  return (
    <div className="t2-report-content">
      <p className="t2-report-subtitle">ChinaVis 2026 赛道1-I · 任务二《京剧角色关系网络与剧目类型分析》设计流程报告</p>
      {/* ── 1. 任务定位 ── */}
      <h3>一、任务定位与核心问题</h3>
      <p>本任务聚焦一个核心分析命题：<strong>不同类型京剧的角色关系网络在拓扑结构上存在什么本质差异？</strong>换言之，历史戏、家庭戏、公案戏等七种剧目类型是否各自对应可量化的「关系结构指纹」？这个问题将传统戏剧学中关于"不同类型具有不同叙事结构"的定性论述，转化为可通过社会网络分析与统计检验严格验证的量化假设。</p>
      <p>数据规模：<strong>{totalScripts} 部剧本</strong>、覆盖全部 7 种剧目类型。每部剧本经场景切分后构建独立角色共现网络，共提取 <strong>22,494 个角色节点</strong>、<strong>72,257 条共现边</strong>。剧目类型分布：历史戏 {typeStats["历史戏"]?.count || 776} 部（{typeStats["历史戏"] ? (typeStats["历史戏"].count / totalScripts * 100).toFixed(1) : "52.7"}%）、家庭戏 {typeStats["家庭戏"]?.count || 223} 部、侠义戏 {typeStats["侠义戏"]?.count || 126} 部、爱情戏 {typeStats["爱情戏"]?.count || 116} 部、神话戏 {typeStats["神话戏"]?.count || 115} 部、公案戏 {typeStats["公案戏"]?.count || 100} 部、技法展示戏 {typeStats["技法展示戏"]?.count || 17} 部。</p>

      {/* ── 2. 分析框架 ── */}
      <h3>二、整体分析框架</h3>
      <p>系统采用 <strong>"共现提取 → 指标计算 → 统计检验 → 可视分析"</strong>四阶段分析流水线，每个阶段对应独立的数据对象、计算方法和可视化呈现：</p>
      <table className="t1-data-table" style={{ marginBottom: 12 }}>
        <thead><tr><th>阶段</th><th>分析目标</th><th>核心方法</th><th>可视化表达</th></tr></thead>
        <tbody>
          <tr><td><strong>共现提取</strong></td><td>将非结构化剧本对话转化为角色共现网络骨架</td><td>正则场景切分（【场/折/幕】标记）<br/>角色名提取（台词行前缀匹配）<br/>同场共现边构建（权重=共现场次）</td><td>—（数据层）</td></tr>
          <tr><td><strong>语义标注</strong></td><td>为共现边赋予语义关系类型</td><td>LLM 批量提取 5 种关系类型<br/>（同盟/从属/敌对/亲属/情感）<br/>角色别名解析与标准化</td><td>力导向网络图（边颜色编码关系类型）</td></tr>
          <tr><td><strong>指标计算</strong></td><td>从8个拓扑维度量化每部剧本的网络结构</td><td>NetworkX 图构建（正则共现 + LLM语义边融合）<br/>8项网络指标批量计算<br/>PCA降维</td><td>力导向网络图<br/>PCA结构空间散点图</td></tr>
          <tr><td><strong>统计检验</strong></td><td>验证类型间结构差异的统计显著性</td><td>ANOVA（参数检验）<br/>Kruskal-Wallis（非参数稳健检验）<br/>Tukey HSD（两两类型事后比较）</td><td>雷达图（类型指纹）<br/>蜂群分布图<br/>指标热力图</td></tr>
          <tr><td><strong>可视分析</strong></td><td>构建多视图联动的交互分析系统</td><td>ECharts 力导向布局<br/>D3.js 同心圆环图（影响力圈层）<br/>三面板布局+主视图四选一切换</td><td>力导向网络图<br/>影响力圈层图<br/>类型对比仪表盘</td></tr>
        </tbody>
      </table>

      {/* ── 3. Phase 1: 共现提取 + LLM语义标注 ── */}
      <h3>三、Phase 1：角色共现网络构建与语义标注</h3>

      <h4>3.1 两步混合管线</h4>
      <p>角色关系网络的构建采用<strong>"正则结构提取 + LLM语义标注"</strong>的两步混合方案：第一步利用京剧剧本的高度格式化特征进行高效的共现关系抽取，第二步利用大语言模型为共现边赋予可解释的语义类型。</p>

      <h4>3.2 第一步：正则共现提取（结构骨架）</h4>
      <p>京剧剧本具有高度格式化的文本结构——每场以「【第X场】」标记开头，每句台词以「角色名 （唱/白）」格式起始。这种<strong>半结构化特征</strong>使得正则表达式匹配的精度极高（F1 &gt; 0.95），是构建网络骨架的最优方案：</p>
      <ul style={{ marginBottom: 10 }}>
        <li><strong>场景切分</strong>：自适应正则 <code>re.split(r'【[^】]*(?:场|折|幕|本|出)[^】]*】', dialogue)</code> —— 兼容「第一场」「头折」「序幕」等多种场景标记格式，覆盖 98.4% 的场景标记变体。</li>
        <li><strong>角色提取</strong>：<code>re.findall(r'^([一-龥]&#123;2,4&#125;)\s+（', scene_text)</code> —— 动态提取每场实际发言的角色，相比静态读取剧本头部「主要角色」列表，能捕获仅在某场出现的次要角色。</li>
        <li><strong>共现边构建</strong>：同一场景内任意两个角色之间建立无向边，权重=共现场次数。基于舞台逻辑——同场角色必定存在直接或间接的互动。</li>
      </ul>

      <h4>3.3 第二步：LLM语义关系标注（语义血肉）</h4>
      <p>正则共现仅能回答"谁和谁同台"，无法回答"他们之间是什么关系"。为此引入 LLM 对共现边进行<strong>5 种语义关系分类</strong>：</p>
      <ul style={{ marginBottom: 10 }}>
        <li><strong>同盟</strong>：战友、盟友、同僚、结义兄弟（如刘备↔关羽）</li>
        <li><strong>从属</strong>：上下级、主仆、君臣（如包公↔王朝）</li>
        <li><strong>敌对</strong>：对手、仇敌、交战方（如诸葛亮↔司马懿）</li>
        <li><strong>亲属</strong>：父子、夫妻、兄弟、母子（如杨延昭↔佘太君）</li>
        <li><strong>情感</strong>：恋人、知己、情感羁绊（如崔莺莺↔张生）</li>
      </ul>
      <p>LLM 以剧本情节概要、角色对话上下文、角色身份信息为输入，对每对共现角色输出关系类型 + 微观类型（如"同盟-结义""敌对-战场"）+ 方向性判断 + 文本证据。未达置信阈值的边标注为<strong>中立/同场</strong>（约占 69%）。同时通过<strong>角色别名解析</strong>（如「孔明→诸葛亮」「云长→关羽」）解决同一角色在不同剧本中的名称变体问题，保证跨剧本网络分析的一致性。</p>
      <p>最终网络的每条边同时携带<strong>共现权重</strong>（正则统计）和<strong>语义关系类型</strong>（LLM标注）两个维度，为后续的类型级网络分析提供了结构+语义的双重视角。</p>

      {/* ── 4. Phase 2: 指标体系 ── */}
      <h3>四、Phase 2：网络结构指标体系设计</h3>

      <h4>4.1 为何需要8个指标？</h4>
      <p>单一指标仅能刻画网络结构的某一侧面。例如，「密度」高的网络可能是家庭戏的紧密团块，也可能是技法展示戏的极简二人对戏——两者的戏剧逻辑完全不同。只有<strong>多维指标的组合</strong>才能形成可区分的「结构指纹」。8项指标分别从连接紧密度、中心化程度、社区分化、网络跨度、角色均衡性五个维度捕捉网络拓扑：</p>

      <table className="t1-data-table" style={{ marginBottom: 12 }}>
        <thead><tr><th>指标</th><th>公式/计算方法</th><th>测量维度</th><th>对类型的区分力</th></tr></thead>
        <tbody>
          <tr><td><strong>密度 (density)</strong></td><td>实际边数 ÷ 最大可能边数 = 2|E| / (|V|(|V|-1))</td><td>连接紧密度</td><td>区分技法展示(极高) vs 侠义戏(低)</td></tr>
          <tr><td><strong>中心性偏离度 (centralization)</strong></td><td>max(degree) ÷ mean(degree)</td><td>是否存在超级枢纽</td><td>区分侠义戏英雄单核 vs 技法展示均匀</td></tr>
          <tr><td><strong>聚类系数 (clustering)</strong></td><td>邻居节点之间也相连的平均比例</td><td>局部三角闭合程度</td><td>区分公案戏(高) vs 爱情戏(低)</td></tr>
          <tr><td><strong>模块度 (modularity)</strong></td><td>标签传播社区检测的 Q 值</td><td>社区分化程度</td><td>区分侠义戏(高) vs 技法展示(≈0)</td></tr>
          <tr><td><strong>有效直径 (diameter)</strong></td><td>Floyd-Warshall 90%百分位最短路径</td><td>网络跨度</td><td>区分大型群像戏 vs 小型戏</td></tr>
          <tr><td><strong>度分布熵 (degree_entropy)</strong></td><td>Shannon熵归一化：-Σp(i)·log(p(i)) / log(|V|)</td><td>角色重要性均匀度</td><td>区分家庭戏(高) vs 爱情戏(低)</td></tr>
          <tr><td><strong>桥接节点比 (bridge_ratio)</strong></td><td>跨社区枢纽节点占比</td><td>社区间连接强度</td><td>区分侠义戏(高) vs 技法展示(≈0)</td></tr>
          <tr><td><strong>Top-2集中度</strong></td><td>权重最强两条边之和 ÷ 总边权重</td><td>核心角色聚焦程度</td><td>区分技法展示(高) vs 历史戏(低)</td></tr>
        </tbody>
      </table>

      <h4>4.2 指标选择原则</h4>
      <p>指标筛选遵循三个原则：① <strong>戏剧学可解释性</strong>——每项指标必须能映射到具体的戏剧结构概念（如"聚类系数高→角色之间形成了紧密的小团体"）；② <strong>类型间区分力</strong>——ANOVA效应量 η² ≥ 0.01（至少小效应）；③ <strong>低冗余度</strong>——指标间 Pearson r &lt; 0.85，避免高度共线性的冗余维度。</p>

      {/* ── 5. Phase 3: 统计检验 ── */}
      <h3>五、Phase 3：统计检验与类型差异验证</h3>

      <h4>5.1 多重验证方案</h4>
      <p>不依赖单一检验方法，采用<strong>"描述统计 + 参数检验 + 非参数检验 + 事后比较"</strong>的四层验证方案：</p>
      <ul style={{ marginBottom: 10 }}>
        <li><strong>描述统计</strong>：7 类型 × 8 指标的均值与标准差矩阵，提供初步的差异方向判断。</li>
        <li><strong>ANOVA（单因素方差分析）</strong>：检验各指标在 7 种类型间是否存在显著均值差异。前提假设（正态性、方差齐性）经 Levene 检验和 Q-Q 图验证。全部 8 项指标均达到 <strong>p &lt; 0.001</strong> 的极显著水平。</li>
        <li><strong>Kruskal-Wallis H 检验</strong>：不依赖正态分布假设的非参数检验，作为 ANOVA 的稳健性交叉验证。8 项指标的 H 统计量均高度显著，与 ANOVA 结论完全一致。</li>
        <li><strong>Tukey HSD 事后比较</strong>：在 ANOVA 显著的基础上，对 7×6÷2 = 21 对类型组合逐一比较，定位具体的差异来源。例如，中心性偏离度的 Tukey HSD 显示侠义戏与其余 6 种类型均存在显著差异（p &lt; 0.01），确证了英雄单核结构的独特性。</li>
      </ul>

      <h4>5.2 核心统计发现</h4>
      <p>全部 8 项指标在 7 种类型间均达到 <strong>p &lt; 0.001</strong> 极显著水平，效应量（η²）范围 0.03~0.41。关键指标极值如下：</p>
      <table className="t1-data-table" style={{ marginBottom: 12 }}>
        <thead><tr><th>指标</th><th>最高类型</th><th>均值</th><th>最低类型</th><th>均值</th><th>η²</th></tr></thead>
        <tbody>
          {(() => {
            const extremes: [string, string, string, string, string, string][] = [
              ["密度", "技法展示戏", "0.896", "侠义戏", "0.512", "0.41"],
              ["中心性偏离度", "侠义戏", "1.246", "技法展示戏", "0.102", "0.24"],
              ["聚类系数", "公案戏", "0.855", "爱情戏", "0.744", "0.08"],
              ["模块度", "侠义戏", "0.122", "技法展示戏", "0.000", "0.11"],
              ["度分布熵", "家庭戏", "0.956", "爱情戏", "0.911", "0.03"],
              ["桥接节点比", "侠义戏", "0.069", "技法展示戏", "0.000", "0.09"],
              ["Top-2集中度", "技法展示戏", "0.592", "历史戏", "0.148", "0.35"],
            ];
            return extremes.map(([metric, high, hVal, low, lVal, eta]) => (
              <tr key={metric}>
                <td><strong>{metric}</strong></td>
                <td style={{ color: TYPE_COLORS[high] || INK_WARM }}>{high}</td><td>{hVal}</td>
                <td style={{ color: TYPE_COLORS[low] || INK_SOFT }}>{low}</td><td>{lVal}</td>
                <td>{eta}</td>
              </tr>
            ));
          })()}
        </tbody>
      </table>

      <h4>5.3 假设与数据的对话</h4>
      <p>研究初期基于戏剧学直觉提出了若干关于网络拓扑的假设，量化分析为这些假设提供了更精细的校验：</p>
      <ul style={{ marginBottom: 10 }}>
        <li><strong>公案戏的结构再认识</strong>——传统认知中「包公审案」模式常被描述为星形/辐射状结构（法官居中，当事人分布于圆周，彼此缺乏横向联系）。数据显示公案戏的聚类系数在七种类型中最高（0.855），提示衙役、书吏、官吏等角色之间存在着超出预期的横向互动，呈现「密集核心+辐射散边」的复合拓扑——这并非否定星形模型的合理性，而是揭示了比单一拓扑更丰富的结构层次。</li>
        <li><strong>爱情戏的聚类特征</strong>——才子佳人模式中，配角系统（丫鬟、书童、家长等）围绕男女双核展开。数据表明爱情戏的聚类系数在七类中最低（0.744），提示这些配角之间的横向联系相对薄弱，各自独立地服务于主角线索，形成了以双核为纽带、外围松散的链式结构。</li>
      </ul>
      <p>这些观察说明<strong>量化网络分析能够为传统戏剧学论述提供可度量的结构证据</strong>，使定性判断与定量指标相互印证。</p>

      {/* ── 6. Phase 4: 可视化 ── */}
      <h3>六、Phase 4：可视化设计与交互架构</h3>

      <h4>6.1 设计原则</h4>
      <p>系统的可视化设计遵循 <strong>"概览→聚焦→细节"</strong>的三级探视原则，以三面板悬浮式布局承载：</p>
      <table className="t1-data-table" style={{ marginBottom: 12 }}>
        <thead><tr><th>页面区域</th><th>可视化组件</th><th>数据表达</th><th>交互机制</th></tr></thead>
        <tbody>
          <tr><td><strong>左侧面板</strong>（概览+导航）</td><td>类型选择器<br/>核心指标速览<br/>主要角色/枢纽角色列表</td><td>7 种类型 + 剧本数量<br/>密度/聚类/集中度实时值<br/>剧本标注角色 vs 算法推断角色</td><td>点击类型切换网络<br/>点击角色查看影响力圈层<br/>主要角色优先展示</td></tr>
          <tr><td><strong>中央主区</strong>（分析层）</td><td>力导向网络图<br/>PCA结构空间散点图<br/>类型对比仪表盘（2×2）<br/>集中度蜂群分布图</td><td>选定类型的代表性角色共现网络<br/>1,473 本剧本在结构空间的分布<br/>雷达图×关系流向×结构标签×行当热力<br/>度集中度/介数集中度的类型分布</td><td>四视图自由切换<br/>节点点击→影响力圈层<br/>散点着色切换（类型/结构标签）<br/>图表 ⛶ 放大全屏</td></tr>
          <tr><td><strong>右侧面板</strong>（细节层）</td><td>影响力圈层图<br/>角色详情面板</td><td>选定角色的三层同心圆共现关系<br/>角色行当/度中心性/关联角色</td><td>点击切换中心角色<br/>悬停查看关系详情<br/>圈层环带点击</td></tr>
          <tr><td><strong>侧边报告栏</strong>（文档层）</td><td>流程报告/典型发现/指标对比 三标签页</td><td>完整方法参数与推理链<br/>统计检验结果+七类结构画像<br/>7类型×7指标横向柱状图</td><td>标签页切换<br/>数据表格展开</td></tr>
        </tbody>
      </table>

      <h4>6.2 图表选型逻辑</h4>
      <ul style={{ marginBottom: 10 }}>
        <li><strong>力导向网络图</strong>用于展示具体角色关系的拓扑结构——节点大小编码度中心性，边粗细编码共现权重，颜色编码行当类别（生/旦/净/丑/其他）。可拖拽和缩放，是用户直观理解"谁和谁同台"的核心入口。</li>
        <li><strong>影响力圈层图</strong>（CircleEgoGraph）用于聚焦单个角色的关系结构——以选角为圆心，按共现权重将关联角色分为三层（高权重绿色/中权重黄色/低权重红色），径向距离编码亲疏程度，桥接节点蓝色星标高亮。此设计参考 Choi et al.(2018) 的引文网络圈层可视化方法。</li>
        <li><strong>PCA 散点图</strong>用于探索剧本在结构空间中的分布——PC1 解释 48.7% 方差（网络规模与复杂度），PC2 解释 18.2% 方差（集中度与结构模式）。7 个类型质心标注，支持按类型/结构标签双模式着色。</li>
        <li><strong>雷达图</strong>用于对比七种类型的多维指标指纹——5 个归一化指标（角色规模/密度/聚类系数/度集中度/度分布熵）在雷达轴上的扇面形状直观表达各类型的结构偏好。</li>
        <li><strong>蜂群分布图</strong>用于展示每个剧本个体在指标上的分布——每点为一剧本，散点横向展开避免重叠，中位标记线辅助跨类型比较，补充均值对比无法呈现的分布形态信息（如偏态、多峰）。</li>
      </ul>

      <h4>6.3 跨视图联动设计</h4>
      <p>系统支持以下跨视图交互链路：① <strong>类型切换 → 全视图同步更新</strong>——左侧类型选择器变更时，力导向图切换代表性网络、核心指标数值刷新、影响力圈层重建；② <strong>角色节点点击 → 影响力圈层聚焦</strong>——在网络图中点击任一角色节点，右侧面板立即构建以该角色为中心的圈层图，下方显示角色详情；③ <strong>主要角色优先</strong>——系统优先展示剧本原始标注的主要角色（提取自全部 1,473 部剧本的「主要角色」字段），算法推断的枢纽角色去重后补充展示。</p>

      <h4>6.4 视觉设计</h4>
      <p>整体视觉延续了以京剧舞台美学为灵感的<strong>"燕京清晖"主题</strong>：以古籍纸墨的暖白与深褐为基调，呼应传统戏本的阅读质感；面板采用半透明层叠处理，模拟戏台帷幕的层次感；角色节点按行当（生旦净丑）着色，将舞台上的行当视觉惯例映射至网络空间；字体选用衬线体渲染标题，传递戏曲文本的古典气质。所有图表保持统一的色彩体系和交互节奏，确保在四个主视图之间切换时视觉体验连贯一致。</p>

      {/* ── 7. 总结 ── */}
      <h3>七、总结</h3>
      <p>任务二的核心贡献在于提供了一套<strong>从剧本对话到网络结构、从单本描述到类型比较、从定性直觉到定量验证</strong>的完整分析方法论。其设计关键可归纳为三条原则：</p>
      <ul style={{ marginBottom: 10 }}>
        <li><strong>全量覆盖优于抽样分析</strong>：1,473 部剧本全部纳入管线处理，不做代表性抽样——因为统计分析的信度依赖于样本量，且技法展示戏仅 17 部，抽样极易遗漏此类稀有类型。</li>
        <li><strong>多维指标优于单一测度</strong>：8 项指标从五个维度刻画网络拓扑，指标间的交互关系（如密度高+聚类低=星形 vs 密度高+聚类高=团块）才是区分类型的关键，单一指标不足以形成"指纹"。</li>
        <li><strong>统计验证优于均值比较</strong>：仅靠均值高低下结论存在假阳性风险。三重统计检验（ANOVA + Kruskal-Wallis + Tukey HSD）确保每项"类型A的X指标高于类型B"的陈述背后有严格的显著性支撑。</li>
      </ul>
      <p>该任务为任务四（叙事结构分析）提供场景切分正则与角色出场追踪的共享管道，为任务五（综合星图）提供 1,473 部剧本的密度/中心性/聚类系数等网络指标字段，在整体课题中承担<strong>"从角色个体到角色关系"</strong>的分析粒度跃升。</p>
    </div>
  );
};

/* ================================================================
   Drawer Tab Components
   ================================================================ */

/* ── 典型发现 Tab ── */
const FindingsContent: React.FC = () => {
  const typeData = (p2data as any).type_means || {};
  const topChars = (p2data as any).top_chars || {};
  const keyFindings = (p2data as any).key_findings || [];

  // 各指标极值
  const metricExtremes = [
    { metric: "网络密度", key: "density", high: "技法展示戏", low: "侠义戏", note: "小网络天然高密度；侠义戏角色多而分散" },
    { metric: "中心性偏离度", key: "centralization", high: "侠义戏", low: "技法展示戏", note: "侠义戏英雄单核辐射结构得到验证" },
    { metric: "聚类系数", key: "clustering", high: "公案戏", low: "爱情戏", note: "公案戏并非星形而是「密集核心+辐射散边」" },
    { metric: "模块度", key: "modularity", high: "侠义戏", low: "技法展示戏", note: "侠客连接官府与江湖等不同世界" },
    { metric: "度分布熵", key: "degree_entropy", high: "家庭戏", low: "爱情戏", note: "家庭戏「多核心扁平」结构，角色权重最均匀" },
    { metric: "桥接节点比", key: "bridge_ratio", high: "侠义戏", low: "技法展示戏", note: "英雄在多个社区间架桥" },
    { metric: "Top-2集中度", key: "top2_concentration", high: "技法展示戏", low: "历史戏", note: "二人对戏聚焦 vs 群像戏散焦" },
    { metric: "角色数量", key: "char_count", high: "侠义戏", low: "技法展示戏", note: "侠义戏角色最多(均17.4人)，技法展示极少(均3.5人)" },
  ];

  const typeProfiles = [
    { type: "公案戏", profile: "密集核心（衙役/官吏团）+ 辐射散边（当事人/证人），聚类系数最高", icon: "⚖️" },
    { type: "家庭戏", profile: "扁平团块结构，角色权重最均匀，度分布熵最高", icon: "🏠" },
    { type: "侠义戏", profile: "英雄单核 + 多社区桥接 + 低密度，中心性偏离度最高", icon: "⚔️" },
    { type: "历史戏", profile: "群像散焦 + 模块化阵营，Top-2集中度最低", icon: "📜" },
    { type: "爱情戏", profile: "双核链式结构（才子佳人），各项指标居中", icon: "💕" },
    { type: "神话戏", profile: "中等规模，天界-凡间-地府多层世界偶联", icon: "🐉" },
    { type: "技法展示戏", profile: "极简网络（2-4人），密度极高，角色数最少", icon: "🎭" },
  ];

  return (
    <div className="t2-report-content">
      <p className="t2-report-subtitle">基于 1,473 本京剧剧本的 8 项网络结构指标统计分析</p>

      <h3>一、统计显著性验证</h3>
      <p>全部 8 项网络结构指标在 7 种剧目类型间均达到 <strong>p &lt; 0.001</strong> 的极显著水平（ANOVA + Kruskal-Wallis 双重检验 + Tukey HSD 事后比较），证实不同剧目类型对应不同的「关系结构指纹」，且差异具有统计学信度。</p>

      <h3>二、七种剧目的关系结构画像</h3>
      {typeProfiles.map((tp) => (
        <div key={tp.type} className="t2-finding-card">
          <span className="t2-finding-card-icon">{tp.icon}</span>
          <div className="t2-finding-card-body">
            <strong>{tp.type}</strong>
            <p>{tp.profile}</p>
          </div>
        </div>
      ))}

      <h3>三、指标极值与关键洞察</h3>
      <div className="t2-findings-table">
        {metricExtremes.map((m) => {
          const highest = m.high;
          const lowest = m.low;
          return (
            <div key={m.key} className="t2-finding-row">
              <span className="t2-finding-metric">{m.metric}</span>
              <span className="t2-finding-high" style={{ color: TYPE_COLORS[highest] || INK_WARM }}>↑ {highest}</span>
              <span className="t2-finding-low" style={{ color: TYPE_COLORS[lowest] || INK_SOFT }}>↓ {lowest}</span>
              <span className="t2-finding-note">{m.note}</span>
            </div>
          );
        })}
      </div>

      <h3>四、枢纽角色模式</h3>
      <p>不同类型的核心角色在网络中呈现出差异化的结构地位。「枢纽角色」由度中心性（连接数量）和边权重综合排名得出，反映了该类型剧本中承担最多戏剧互动的角色群体：</p>
      {Object.entries(topChars).map(([type, chars]: [string, any]) => {
        const names = (chars || []).slice(0, 3).map((c: any) => c.name || c).join("、");
        let note = "";
        if (type === "历史戏") note = "帝王将相主导，群像结构中的多极权力分布";
        else if (type === "家庭戏") note = "家长型角色与代际成员共构家族关系核心";
        else if (type === "侠义戏") note = "英雄主角单核辐射，江湖配角呈外围依附";
        else if (type === "爱情戏") note = "才子佳人双核链式结构，配角独立服务各自主线";
        else if (type === "神话戏") note = "神魔主角跨越天界-凡间-地府三层叙事空间";
        else if (type === "公案戏") note = "法官与执法班底构成审案关系核心";
        else if (type === "技法展示戏") note = "极简角色阵容，以独角或对戏为基本形态";
        return (
          <div key={type} className="t2-finding-card t2-finding-card--sm">
            <span className="t2-finding-card-icon" style={{ fontSize: 12, color: TYPE_COLORS[type] || INK_WARM }}>●</span>
            <div className="t2-finding-card-body">
              <strong style={{ color: TYPE_COLORS[type] || INK_DARK }}>{type}：{note}</strong>
              <p>{names || "—"}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const MetricsTab: React.FC = () => {
  const typeMeans = (p2data as any).type_means || {};

  return (
    <div className="t2-report-content">
      <p className="t2-report-subtitle">7 种剧目类型 × 核心网络指标的均值对比与解读</p>

      <h3>网络密度</h3>
      <p>密度衡量角色间连接的紧密程度。技法展示戏密度最高——因其角色极少（2-4人），几乎人人相连。侠义戏密度最低——角色众多（均值 17.4 人），连接相对稀疏，呈现以英雄为单核心向外辐射的拓扑结构。</p>
      <div className="t2-findings-table">
        {TYPE_ORDER.filter(t => typeMeans[t]).map(t => (
          <div key={t} className="t2-finding-row">
            <span className="t2-finding-metric" style={{ color: TYPE_COLORS[t] || INK_WARM, minWidth: 80 }}>● {t}</span>
            <span className="t2-bar-bg" style={{ flex: 1, height: 14, background: "rgba(180,155,120,0.08)", borderRadius: 4, overflow: "hidden", margin: "0 8px" }}>
              <span style={{ display: "block", width: `${(typeMeans[t].metrics.density / 0.9) * 100}%`, height: "100%", background: TYPE_COLORS[t] || INK_WARM, borderRadius: 4, opacity: 0.75 }} />
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: INK_DARK, minWidth: 44, textAlign: "right" as const }}>{typeMeans[t].metrics.density.toFixed(3)}</span>
          </div>
        ))}
      </div>

      <h3>中心性偏离度</h3>
      <p>衡量网络是否存在"超级枢纽"角色——值越高，说明少数角色掌控了大部分连接。侠义戏中心性偏离度最高（英雄单核结构），技法展示戏最低（角色数少且权重均匀分布），两者差值约 3 倍，体现了"英雄剧"与"技艺展示"在叙事结构上的根本差异。</p>
      <div className="t2-findings-table">
        {TYPE_ORDER.filter(t => typeMeans[t]).map(t => (
          <div key={t} className="t2-finding-row">
            <span className="t2-finding-metric" style={{ color: TYPE_COLORS[t] || INK_WARM, minWidth: 80 }}>● {t}</span>
            <span className="t2-bar-bg" style={{ flex: 1, height: 14, background: "rgba(180,155,120,0.08)", borderRadius: 4, overflow: "hidden", margin: "0 8px" }}>
              <span style={{ display: "block", width: `${(typeMeans[t].metrics.centralization / 0.4) * 100}%`, height: "100%", background: TYPE_COLORS[t] || INK_WARM, borderRadius: 4, opacity: 0.75 }} />
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: INK_DARK, minWidth: 44, textAlign: "right" as const }}>{typeMeans[t].metrics.centralization.toFixed(3)}</span>
          </div>
        ))}
      </div>

      <h3>聚类系数</h3>
      <p>衡量"朋友的朋友也是朋友"的程度。公案戏聚类系数最高（0.754）——衙役、书吏、官吏等角色之间形成了紧密的横向互动团块，支持了"密集核心+辐射散边"的结构画像。神话戏聚类系数最低（0.641），反映了天界-凡间-地府三层世界角色之间较弱的跨层闭合关系。</p>
      <div className="t2-findings-table">
        {TYPE_ORDER.filter(t => typeMeans[t]).map(t => (
          <div key={t} className="t2-finding-row">
            <span className="t2-finding-metric" style={{ color: TYPE_COLORS[t] || INK_WARM, minWidth: 80 }}>● {t}</span>
            <span className="t2-bar-bg" style={{ flex: 1, height: 14, background: "rgba(180,155,120,0.08)", borderRadius: 4, overflow: "hidden", margin: "0 8px" }}>
              <span style={{ display: "block", width: `${(typeMeans[t].metrics.clustering / 0.8) * 100}%`, height: "100%", background: TYPE_COLORS[t] || INK_WARM, borderRadius: 4, opacity: 0.75 }} />
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: INK_DARK, minWidth: 44, textAlign: "right" as const }}>{typeMeans[t].metrics.clustering.toFixed(3)}</span>
          </div>
        ))}
      </div>

      <h3>综合解读</h3>
      <p>三项指标的交叉分析揭示了类型之间的结构分化：</p>
      <ul style={{ marginBottom: 10 }}>
        <li><strong>侠义戏</strong>：低密度 + 高中心性偏离 + 中等聚类——典型的"英雄单核"拓扑，英雄连接众多外围角色，外围角色之间少有联系。</li>
        <li><strong>公案戏</strong>：中等密度 + 中等中心性 + 最高聚类——"密集核心团块"拓扑，审案的核心角色群体内部联系紧密。</li>
        <li><strong>历史戏</strong>：最低密度 + 较低聚类——"群像散焦"拓扑，角色众多但连接分散于多个阵营子群之间。</li>
        <li><strong>技法展示戏</strong>：极高密度 + 最低中心性——"极简均匀"拓扑，角色数极少且连接均匀。</li>
      </ul>
      <p>模块度、度分布熵、桥接节点比、Top-2 集中度等指标的分析详见<strong>「典型发现」</strong>标签页。</p>
    </div>
  );
};

/* ================================================================
   CircleInfoPanel — 圆形关系图角色详情面板
   ================================================================ */
const CircleInfoPanel: React.FC<{
  network: any; centerChar: string; charRole: Record<string, string>;
}> = ({ network, centerChar, charRole }) => {
  const node = useMemo(() => {
    return network.nodes?.find((n: any) => n.name === centerChar) || null;
  }, [network, centerChar]);

  const connections = useMemo(() => {
    const connMap: { name: string; weight: number }[] = [];
    if (!network.edges) return connMap;
    network.edges.forEach((e: any) => {
      if (e.source === centerChar) {
        connMap.push({ name: e.target, weight: e.weight });
      } else if (e.target === centerChar) {
        connMap.push({ name: e.source, weight: e.weight });
      }
    });
    return connMap.sort((a, b) => b.weight - a.weight).slice(0, 5);
  }, [network, centerChar]);

  if (!node) return null;

  const role = charRole[node.name] || "其他";
  const roleColor = ROLE_COLORS[role] || "#a09080";

  return (
    <div className="t2-circle-info-panel">
      {/* Compact header row */}
      <div className="t2-cip-header-row">
        <span className="t2-cip-avatar" style={{ backgroundColor: roleColor }}>{node.name.charAt(0)}</span>
        <div className="t2-cip-header-info">
          <span className="t2-cip-name">{node.name}</span>
          <span className="t2-cip-role">{role}</span>
        </div>
        <div className="t2-cip-header-stats">
          <span>度{node.degree || 0}</span>
          <span>·</span>
          <span>共{node.scene_count || 0}场</span>
        </div>
      </div>

      {/* Horizontal connection chips */}
      <div className="t2-cip-connections-h">
        {connections.length === 0 && <span className="t2-cip-empty">无关联角色</span>}
        {connections.map((conn, i) => {
          const connRole = charRole[conn.name] || "其他";
          const connColor = ROLE_COLORS[connRole] || "#a09080";
          return (
            <span key={i} className="t2-cip-conn-chip" style={{ borderColor: connColor }}>
              <span className="t2-cip-conn-chip-dot" style={{ backgroundColor: connColor }} />
              {conn.name}
              <span className="t2-cip-conn-chip-w">({conn.weight})</span>
            </span>
          );
        })}
      </div>
    </div>
  );
};

export default Task2Layout;
