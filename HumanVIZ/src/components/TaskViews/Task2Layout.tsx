import React, { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import p2data from "../../data/p2_frontend_data.json";
import charRoleMap from "../../data/char_role_map.json";
import "./Task2Layout.scss";

type ReportTabId = "report" | "gallery" | "metrics" | "pca" | "ranking";
type MainView = "network" | "scatter" | "heatmap";

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

const charRole: Record<string, string> = charRoleMap as Record<string, string>;

const TYPE_COLORS: Record<string, string> = {
  历史戏: "#b8926a", 家庭戏: "#96544d", 侠义戏: "#5e6b76",
  爱情戏: "#c77d8b", 神话戏: "#7f968d", 公案戏: "#6b7b8e", 技法展示戏: "#c4a56e",
};
const TYPE_ORDER = ["历史戏", "家庭戏", "侠义戏", "爱情戏", "神话戏", "公案戏", "技法展示戏"];
const METRIC_LABELS: Record<string, string> = {
  density: "网络密度", centralization: "中心性偏离度", clustering: "聚类系数",
  modularity: "模块度", degree_entropy: "度分布熵", bridge_ratio: "桥接节点比",
  top2_concentration: "Top-2集中度",
};
const METRIC_ORDER = ["density","centralization","clustering","modularity","degree_entropy","bridge_ratio","top2_concentration"];
const REPORT_TAB_LABELS: { id: ReportTabId; icon: string; label: string }[] = [
  { id: "report", icon: "📋", label: "设计流程报告" },
  { id: "gallery", icon: "🖼️", label: "关系网络画廊" },
  { id: "metrics", icon: "📊", label: "结构指标对比" },
  { id: "pca", icon: "🔬", label: "PCA结构空间" },
  { id: "ranking", icon: "🏆", label: "枢纽角色排名" },
];
const VIEW_LABELS: Record<MainView, string> = {
  network: "力导向图", scatter: "PCA散点图", heatmap: "指标热力图",
};
const FONT_SERIF = '"Noto Serif SC","PT Serif","STSong","SimSun",serif';

/* ================================================================
   Task2Layout — 角色关系网络与剧目类型分析
   ================================================================ */
const Task2Layout: React.FC = () => {
  const [mainView, setMainView] = useState<MainView>("network");
  const [selectedType, setSelectedType] = useState<string>("历史戏");
  const [selectedNetIdx, setSelectedNetIdx] = useState(0);
  const [reportSidebarOpen, setReportSidebarOpen] = useState(false);
  const [reportTab, setReportTab] = useState<ReportTabId>("report");
  const [hoveredMetric, setHoveredMetric] = useState<string | null>(null);

  const networkRef = useRef<HTMLDivElement>(null);
  const scatterRef = useRef<HTMLDivElement>(null);
  const heatmapRef = useRef<HTMLDivElement>(null);

  const data = p2data as any;
  const typeData = data.type_means[selectedType];
  const repNets: any[] = data.rep_networks[selectedType] || [];
  const currentNet = repNets[selectedNetIdx] || null;
  const findings: any[] = data.key_findings || [];

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

    const edges = currentNet.edges.map((e: any) => ({
      source: e.source, target: e.target,
      lineStyle: {
        width: Math.max(0.25, e.weight * 0.45),
        opacity: 0.18 + e.weight * 0.18,
        color: "#c8b896",
        curveness: 0.06 + (e.weight || 1) * 0.06,
        shadowBlur: 1,
        shadowColor: "rgba(180,155,120,0.12)",
      },
    }));

    chart.setOption({
      backgroundColor: PAPER_BG,
      tooltip: {
        backgroundColor: "rgba(250,245,235,0.94)",
        borderColor: "rgba(160,130,100,0.45)",
        borderWidth: 1,
        padding: [8, 14],
        textStyle: { color: INK_DARK, fontSize: 12, fontFamily: FONT_SERIF },
        formatter: (p: any) => p.dataType === "node"
          ? `<b>${p.name}</b><br/>行当: ${charRole[p.name] || "其他"}<br/>加权度中心性: ${(p.value as number)?.toFixed(2)}`
          : `${p.data.source} — ${p.data.target}`,
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

    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("resize", h); chart.dispose(); };
  }, [mainView, currentNet]);

  /* ==================================================================
     Chart 2 — PCA Scatter
     ================================================================== */
  useEffect(() => {
    if (mainView !== "scatter" || !scatterRef.current) return;
    const chart = echarts.init(scatterRef.current);
    const series = TYPE_ORDER.map((t) => ({
      name: t, type: "scatter",
      data: data.pca_points.filter((p: any) => p.genre === t).map((p: any) => [p.x, p.y, p.title, p.n_nodes, p.n_edges]),
      itemStyle: { color: TYPE_COLORS[t] || GOLD_NODE, opacity: 0.45 },
      symbolSize: 7,
    }));
    const centroids = TYPE_ORDER
      .filter((t) => data.pca_centroids[t])
      .map((t) => {
        const c = data.pca_centroids[t];
        return { name: t, value: [c.x, c.y], symbolSize: 16,
          itemStyle: { color: TYPE_COLORS[t], borderColor: PAPER_BG, borderWidth: 2.5 } };
      });
    (series as any).push({
      name: "centroids", type: "scatter", data: centroids,
      label: { show: true, formatter: "{b}", position: "top", fontSize: 12, color: INK_WARM, fontWeight: 600, fontFamily: FONT_SERIF },
      z: 10,
    });
    chart.setOption({
      backgroundColor: PAPER_BG,
      tooltip: {
        backgroundColor: "rgba(250,245,235,0.94)",
        borderColor: "rgba(160,130,100,0.45)",
        borderWidth: 1,
        textStyle: { color: INK_DARK, fontSize: 12, fontFamily: FONT_SERIF },
        formatter: (p: any) => {
          if (p.seriesName === "centroids") return `<b>${p.name}</b><br/>类型质心`;
          return `<b>${p.data[2]}</b><br/>类型: ${p.seriesName}<br/>角色: ${p.data[3]} 边: ${p.data[4]}`;
        },
      },
      xAxis: { name: "PC1 · 网络规模与复杂度", nameLocation: "center", nameGap: 28, nameTextStyle: { fontSize: 11, color: INK_SOFT, fontFamily: FONT_SERIF }, axisLabel: { fontSize: 10, color: INK_SOFT, fontFamily: FONT_SERIF }, splitLine: { show: false } },
      yAxis: { name: "PC2 · 结构集中度", nameLocation: "center", nameGap: 35, nameTextStyle: { fontSize: 11, color: INK_SOFT, fontFamily: FONT_SERIF }, axisLabel: { fontSize: 10, color: INK_SOFT, fontFamily: FONT_SERIF }, splitLine: { show: false } },
      series,
      animationDuration: 500,
    }, true);
    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("resize", h); chart.dispose(); };
  }, [mainView]);

  /* ==================================================================
     Chart 3 — Metrics Heatmap
     ================================================================== */
  useEffect(() => {
    if (mainView !== "heatmap" || !heatmapRef.current) return;
    const chart = echarts.init(heatmapRef.current);
    const keys = METRIC_ORDER;
    const hData: any[] = [];
    const validTypes = TYPE_ORDER.filter((t) => data.type_means[t]);
    keys.forEach((k, ki) => {
      const allVals = validTypes.map((t) => data.type_means[t].metrics[k]);
      const minV = Math.min(...allVals); const maxV = Math.max(...allVals);
      validTypes.forEach((t, ti) => {
        const normVal = maxV > minV ? (data.type_means[t].metrics[k] - minV) / (maxV - minV) : 0.5;
        hData.push([ki, ti, Math.round(normVal * 100) / 100]);
      });
    });
    chart.setOption({
      backgroundColor: PAPER_BG,
      tooltip: {
        backgroundColor: "rgba(250,245,235,0.94)",
        borderColor: "rgba(160,130,100,0.45)",
        borderWidth: 1,
        textStyle: { color: INK_DARK, fontSize: 12, fontFamily: FONT_SERIF },
        formatter: (p: any) => {
          const metric = keys[p.data[0]]; const type = validTypes[p.data[1]];
          return `<b>${type}</b><br/>${METRIC_LABELS[metric]}: <b>${data.type_means[type].metrics[metric]}</b>`;
        },
      },
      xAxis: { type: "category", data: keys.map((k) => METRIC_LABELS[k]), position: "top", axisLabel: { rotate: 30, fontSize: 10, color: INK_SOFT, fontFamily: FONT_SERIF } },
      yAxis: { type: "category", data: validTypes, axisLabel: { fontSize: 11, color: INK_WARM, fontWeight: 500, fontFamily: FONT_SERIF } },
      visualMap: { min: 0, max: 1, orient: "horizontal", left: "center", bottom: 6,
        inRange: { color: ["#f5f0e8", "#d4c4a8", INK_SOFT, INK_WARM] }, show: false },
      series: [{ type: "heatmap", data: hData, label: { show: false },
        emphasis: { itemStyle: { shadowBlur: 12, shadowColor: "rgba(0,0,0,0.18)" } } }],
      animationDuration: 400,
    }, true);
    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("resize", h); chart.dispose(); };
  }, [mainView]);

  /* ==================================================================
     Report Sidebar Content
     ================================================================== */
  const reportContent = useMemo(() => {
    switch (reportTab) {
      case "report": return <ReportContent />;
      case "gallery": return <GalleryTab />;
      case "metrics": return <MetricsTab />;
      case "pca": return <PCATab />;
      case "ranking": return <RankingTab />;
      default: return null;
    }
  }, [reportTab]);

  /* ---- 枢纽角色 Top3 ---- */
  const hubChars = useMemo(() => {
    const chars: any[] = data.top_chars || [];
    const byType: Record<string, any[]> = {};
    chars.forEach((c: any) => { if (!byType[c.type]) byType[c.type] = []; byType[c.type].push(c); });
    return byType;
  }, [data]);

  /* ---- 关键发现元数据 ---- */
  const findingsMeta = useMemo(() => {
    const map: Record<string, { highest: string; lowest: string; highestVal: number; lowestVal: number }> = {};
    findings.forEach((f: any) => {
      map[f.metric] = { highest: f.highest.type, lowest: f.lowest.type, highestVal: f.highest.value, lowestVal: f.lowest.value };
    });
    return map;
  }, [findings]);

  return (
    <div className="t2-screen">
      {/* ═══════════ Topbar ═══════════ */}
      <div className="t2-topbar">
        <div className="t2-topbar-title-group">
          <div className="t2-kicker">Task 2 · Role Relationship Network</div>
          <h1>角色关系网络与剧目类型分析</h1>
          <p>基于 {data.type_size_stats?.reduce((a: number, s: any) => a + s.count, 0) || 1473} 本剧本的场景级角色共现，构建关系网络并比较 7 种剧目类型的结构差异</p>
        </div>
        <div className="t2-topbar-report-trigger">
          <button
            className="t2-topbar-report-btn"
            onClick={() => { setReportSidebarOpen(true); setReportTab("report"); }}
            title="查看角色关系设计流程报告"
          >
            <span className="t2-report-btn-icon">📋</span>
            <span>设计流程报告</span>
          </button>
        </div>
      </div>

      {/* ═══════════ Main Grid — 左窄右宽双栏 ═══════════ */}
      <div className="t2-main-grid">
        {/* ── LEFT: 侧边栏 ── */}
        <div className="t2-side-panel">
          {/* 剧目类型选择 */}
          <div className="t2-side-block">
            <div className="t2-side-block-header"><h3>剧目类型</h3></div>
            <div className="t2-type-selector">
              {TYPE_ORDER.filter((t) => data.type_means[t]).map((t) => (
                <button key={t}
                  className={`t2-type-btn ${selectedType === t ? "active" : ""}`}
                  onClick={() => { setSelectedType(t); setSelectedNetIdx(0); }}>
                  <span className="t2-type-dot" style={{ backgroundColor: TYPE_COLORS[t] }} />
                  {t}
                  <span className="t2-type-count">{data.type_means[t]?.count || 0}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 当前类型网络指标 */}
          <div className="t2-side-block">
            <div className="t2-side-block-header"><h3>{selectedType} · 网络指标</h3></div>
            {typeData && (
              <div className="t2-stat-grid">
                <div className="t2-stat-card">
                  <span className="t2-stat-value">{typeData.count}</span>
                  <span className="t2-stat-label">剧本数</span>
                </div>
                <div className="t2-stat-card">
                  <span className="t2-stat-value">{Math.round(typeData.metrics.n_nodes)}</span>
                  <span className="t2-stat-label">均角色数</span>
                </div>
                <div className="t2-stat-card">
                  <span className="t2-stat-value">{Math.round(typeData.metrics.n_edges)}</span>
                  <span className="t2-stat-label">均边数</span>
                </div>
                <div className="t2-stat-card">
                  <span className="t2-stat-value">{typeData.metrics.density.toFixed(3)}</span>
                  <span className="t2-stat-label">网络密度</span>
                </div>
                <div className="t2-stat-card">
                  <span className="t2-stat-value">{typeData.metrics.clustering.toFixed(3)}</span>
                  <span className="t2-stat-label">聚类系数</span>
                </div>
                <div className="t2-stat-card">
                  <span className="t2-stat-value">{typeData.metrics.modularity.toFixed(3)}</span>
                  <span className="t2-stat-label">模块度</span>
                </div>
              </div>
            )}
          </div>

          {/* 结构特征排名 — 当前类型各指标相对位置 */}
          <div className="t2-side-block">
            <div className="t2-side-block-header"><h3>结构特征排名</h3></div>
            {typeData && METRIC_ORDER.map((k) => {
              const allVals = TYPE_ORDER.filter((t) => data.type_means[t]).map((t) => data.type_means[t].metrics[k]);
              const sorted = [...allVals].sort((a, b) => b - a);
              const cur = typeData.metrics[k];
              const rank = sorted.findIndex(v => v === cur) + 1;
              const maxV = Math.max(...allVals);
              const pct = maxV > 0 ? cur / maxV : 0;
              return (
                <div key={k} className="t2-metric-rank-row"
                  onMouseEnter={() => setHoveredMetric(k)}
                  onMouseLeave={() => setHoveredMetric(null)}>
                  <span className="t2-metric-rank-label">{METRIC_LABELS[k]}</span>
                  <span className="t2-metric-rank-bar-wrap">
                    <span className="t2-metric-rank-bar" style={{ width: `${pct * 100}%`, backgroundColor: TYPE_COLORS[selectedType] }} />
                  </span>
                  <span className="t2-metric-rank-val">#{rank} · {cur.toFixed(3)}</span>
                </div>
              );
            })}
            {hoveredMetric && findingsMeta[hoveredMetric] && (
              <div className="t2-metric-rank-tip">
                {METRIC_LABELS[hoveredMetric]}: 最高 <b style={{color:TYPE_COLORS[findingsMeta[hoveredMetric].highest]}}>{findingsMeta[hoveredMetric].highest}</b> ({findingsMeta[hoveredMetric].highestVal.toFixed(3)}) · 最低 <b style={{color:TYPE_COLORS[findingsMeta[hoveredMetric].lowest]}}>{findingsMeta[hoveredMetric].lowest}</b> ({findingsMeta[hoveredMetric].lowestVal.toFixed(3)})
              </div>
            )}
          </div>

          {/* 枢纽角色 Top3 */}
          <div className="t2-side-block">
            <div className="t2-side-block-header"><h3>{selectedType} · 枢纽角色</h3></div>
            {(hubChars[selectedType] || []).slice(0, 3).map((c: any, i: number) => (
              <div key={i} className="t2-hub-char-row">
                <span className="t2-hub-char-rank">#{i + 1}</span>
                <span className="t2-hub-char-name">{c.name}</span>
                <span className="t2-hub-char-degree">中心性 {c.degree}</span>
              </div>
            ))}
            {(!hubChars[selectedType] || hubChars[selectedType].length === 0) && (
              <div className="t2-no-data-sm">暂无数据</div>
            )}
          </div>
        </div>

        {/* ── RIGHT: 主视图区 ── */}
        <div className="t2-center">
          <div className="t2-view-switcher">
            {(Object.entries(VIEW_LABELS) as [MainView, string][]).map(([v, label]) => (
              <button key={v} className={`t2-view-btn ${mainView === v ? "active" : ""}`} onClick={() => setMainView(v)}>
                {label}
              </button>
            ))}
          </div>

          <div className="t2-main-vis">
            {mainView === "network" && (
              currentNet ? (
                <>
                  <div className="t2-net-meta">
                    <span className="t2-net-title">{currentNet.title}</span>
                    <span className="t2-net-stat">场景 {currentNet.total_scenes}</span>
                    <span className="t2-net-stat">角色 {currentNet.total_characters}</span>
                    <span className="t2-net-stat">边 {currentNet.total_edges}</span>
                    {repNets.length > 1 && (
                      <button className="t2-net-switch-btn" onClick={() => setSelectedNetIdx(1 - selectedNetIdx)}>
                        切换网络
                      </button>
                    )}
                  </div>
                  <div ref={networkRef} className="t2-chart-box" />
                </>
              ) : <div className="t2-no-data">该类型暂无代表性网络数据</div>
            )}
            {mainView === "scatter" && <div ref={scatterRef} className="t2-chart-box" />}
            {mainView === "heatmap" && <div ref={heatmapRef} className="t2-chart-box" />}
          </div>
        </div>
      </div>

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
const ReportContent: React.FC = () => (
  <div className="t2-report-content">
    <p className="t2-report-subtitle">ChinaVis 2026 赛道1-I · 任务二《角色关系网络与剧目类型分析》设计流程指导报告</p>

    <h3>一、任务目标解析</h3>
    <p>任务二的核心目标是：基于全量京剧剧本的场景级角色共现数据，构建角色关系网络，量化网络拓扑结构指标，并比较不同剧目类型之间是否存在可区分的"关系结构指纹"。该任务本质上融合了社会网络分析（SNA）、计量戏剧学、统计检验与假设验证、高维数据降维与可视分析。</p>

    <h3>二、整体研究框架</h3>
    <p>整体流程为：剧本文本（1473本）→ 场景切分与角色共现提取 → 构建角色共现网络 → 计算 8 项网络结构指标 → 统计检验（ANOVA + Kruskal-Wallis + Tukey HSD）→ 剧目类型×网络结构差异分析 → 降维与代表性网络提取 → 可视分析与交互展示。</p>

    <h3>三、数据预处理阶段</h3>
    <p>采用纯正则方案对全量 1473 本剧本进行场景级角色共现关系的批量提取。场景切分使用正则表达式匹配"【场/折/幕/本/出】"标记，角色提取匹配"角色名 （"格式的台词行，同场任意两角色间建立无向边，权重为共现场次数。每本剧本生成一个包含节点（角色名称、度中心性、出场场景数）和边（源角色、目标角色、共现权重）的共现网络。</p>

    <h3>四、网络结构指标设计</h3>
    <p>建立 8 项结构指标体系：密度（连接紧密程度）、中心性偏离度（是否存在超级枢纽）、聚类系数（邻居间互连程度）、模块度（社区分化程度）、有效直径（网络跨度）、度分布熵（角色重要性均匀度）、桥接节点比（跨社区枢纽占比）、Top-2集中度（核心角色聚焦程度）。采用描述统计 + 参数检验 + 非参数检验 + 事后比较的多重验证方案。</p>

    <h3>五、关键发现与类型画像</h3>
    <p>全部 8 项指标在 7 种类型间均达到 p &lt; 0.001 显著水平。部分假设被修正：公案戏并非星形网络而是"密集核心+辐射散边"（聚类系数最高 0.855）；爱情戏聚类系数最低（0.744）。七类网络画像：公案戏为密集核心辐射结构，家庭戏为扁平团块（度分布熵最高），侠义戏为英雄单核+多社区桥接（中心性偏离度最高），历史戏为群像散焦+模块化阵营（Top-2集中度最低），爱情戏为双核链式，神话戏为中等规模多层世界偶联，技法展示戏为极简网络。</p>

    <h3>六、PCA 结构空间分析</h3>
    <p>采用主成分分析（PCA）将 8 维网络指标降维至二维空间。PC1 方差解释率 48.7%，代表网络规模与复杂度；PC2 方差解释率 18.2%，代表网络集中度与结构模式。对 500 本采样剧本进行 PCA 投影，观察到历史戏与侠义戏在 PC1 轴上分离，家庭戏与爱情戏在 PC2 轴上分离，技法展示戏独立于主群之外。</p>

    <h3>七、可视化设计方案</h3>
    <p>核心图表包括：力导向网络图（展示每种类型的代表性角色共现网络）、PCA 散点图（500 点采样投影）、指标热力图（7类型×7指标归一化矩阵）、分组柱状图（4 项核心指标的跨类型并排对比）、关系网络画廊（7类型×2本代表性网络卡片）、枢纽角色排名（每类型 Top-3 枢纽角色）。</p>

    <h3>八、交互系统设计建议</h3>
    <p>采用三面板布局：左侧为剧目类型列表与网络概览统计，中间为主视图切换区（力导向图/PCA散点图/指标热力图），右侧为结构洞察面板。交互逻辑支持点击类型切换网络、多视图自由切换、抽屉面板四选一。采用与任务一统一的"燕京清晖"主题设计语言。</p>

    <h3>九、创新点</h3>
    <p>创新点1：提出基于场景级角色共现的京剧关系网络构建方法，覆盖全量 1473 本剧本。创新点2：构建 8 维网络拓扑指标体系，通过多重统计检验验证剧目类型的结构差异显著性。创新点3：发现并量化七种京剧剧目类型的"关系结构指纹"。创新点4：设计面向戏曲数字人文研究的角色关系网络可视分析系统。</p>

    <h3>十、推荐技术栈</h3>
    <p>数据处理：Python、NumPy、pandas。网络分析：NetworkX、SciPy。降维分析：scikit-learn（PCA）。可视化：ECharts（力导向图、散点图、热力图、柱状图）、D3.js。前端框架：React + TypeScript + SCSS。</p>

    <h3>十一、与任务一的协同设计</h3>
    <p>任务一聚焦单个角色的属性与行当分析（角色级），任务二聚焦角色间的共现关系分析（网络级）。两者共享场景切分正则管道，共同构成从"角色个体分析"到"角色关系分析"的完整戏曲数字人文研究链路。</p>
  </div>
);

/* ================================================================
   Drawer Tab Components
   ================================================================ */

const GalleryTab: React.FC = () => {
  const allNets = (p2data as any).rep_networks;
  return (
    <div className="t2-gallery-grid">
      {TYPE_ORDER.filter((t) => allNets[t]).map((t) => (
        <div key={t} className="t2-gallery-type-row">
          <h4 style={{ color: TYPE_COLORS[t], fontFamily: FONT_SERIF }}>{t}</h4>
          <div className="t2-gallery-nets">
            {allNets[t].map((net: any, i: number) => (
              <div key={i} className="t2-gallery-net-card">
                <div className="t2-gallery-net-title">{net.title}</div>
                <div className="t2-gallery-net-stats">{net.total_characters}角色 · {net.total_edges}边 · {net.total_scenes}场</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {TYPE_ORDER.filter((t) => allNets[t]).length === 0 && (
        <div className="t2-no-data">暂无画廊数据</div>
      )}
    </div>
  );
};

const MetricsTab: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const keys = METRIC_ORDER;
    const validTypes = TYPE_ORDER.filter((t) => (p2data as any).type_means[t]);
    chart.setOption({
      backgroundColor: PAPER_BG,
      tooltip: { trigger: "axis", textStyle: { color: INK_DARK, fontFamily: FONT_SERIF } },
      legend: { data: validTypes, bottom: 0, textStyle: { fontSize: 10, color: INK_SOFT, fontFamily: FONT_SERIF } },
      grid: { left: 85, right: 30, top: 12, bottom: 40 },
      xAxis: { type: "value", axisLabel: { fontSize: 9, color: INK_SOFT, fontFamily: FONT_SERIF }, splitLine: { lineStyle: { color: "rgba(180,155,120,0.2)" } } },
      yAxis: { type: "category", data: keys.map((k) => METRIC_LABELS[k]), axisLabel: { fontSize: 10, color: INK_WARM, fontWeight: 500, fontFamily: FONT_SERIF } },
      series: validTypes.map((t) => ({
        name: t, type: "bar",
        data: keys.map((k) => (p2data as any).type_means[t].metrics[k]),
        itemStyle: { color: TYPE_COLORS[t], opacity: 0.88, borderRadius: [0, 3, 3, 0] },
        barMaxWidth: 13,
      })),
      animationDuration: 400,
    }, true);
    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("resize", h); chart.dispose(); };
  }, []);
  return <div ref={ref} className="t2-drawer-chart-full" />;
};

const PCATab: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const series = TYPE_ORDER.filter((t) => (p2data as any).type_means[t]).map((t) => ({
      name: t, type: "scatter",
      data: (p2data as any).pca_points.filter((p: any) => p.genre === t).map((p: any) => [p.x, p.y]),
      itemStyle: { color: TYPE_COLORS[t], opacity: 0.45 }, symbolSize: 6,
    }));
    chart.setOption({
      backgroundColor: PAPER_BG,
      tooltip: {
        backgroundColor: "rgba(250,245,235,0.94)",
        borderColor: "rgba(160,130,100,0.45)",
        borderWidth: 1,
        textStyle: { color: INK_DARK, fontFamily: FONT_SERIF },
        formatter: (p: any) => `<b>${p.seriesName}</b><br/>${p.data[0]?.toFixed(3)}, ${p.data[1]?.toFixed(3)}`,
      },
      xAxis: { name: "PC1 (48.7%)", nameLocation: "center", nameGap: 25, nameTextStyle: { fontSize: 11, color: INK_SOFT, fontFamily: FONT_SERIF }, axisLabel: { fontSize: 10, color: INK_SOFT, fontFamily: FONT_SERIF }, splitLine: { show: false } },
      yAxis: { name: "PC2 (18.2%)", nameLocation: "center", nameGap: 35, nameTextStyle: { fontSize: 11, color: INK_SOFT, fontFamily: FONT_SERIF }, axisLabel: { fontSize: 10, color: INK_SOFT, fontFamily: FONT_SERIF }, splitLine: { show: false } },
      series,
      animationDuration: 500,
    }, true);
    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("resize", h); chart.dispose(); };
  }, []);
  return <div ref={ref} className="t2-drawer-chart-full" />;
};

const RankingTab: React.FC = () => {
  const chars: any[] = (p2data as any).top_chars || [];
  const byType: Record<string, any[]> = {};
  chars.forEach((c: any) => { if (!byType[c.type]) byType[c.type] = []; byType[c.type].push(c); });
  return (
    <div className="t2-ranking-tab">
      {TYPE_ORDER.filter((t) => byType[t]).map((t) => (
        <div key={t} className="t2-ranking-type-group">
          <h4 style={{ color: TYPE_COLORS[t], fontFamily: FONT_SERIF }}>{t}</h4>
          {byType[t].map((c: any, i: number) => (
            <div key={i} className="t2-ranking-char">
              <span className="t2-ranking-name">{c.name}</span>
              <span className="t2-ranking-degree">中心性: {c.degree}</span>
            </div>
          ))}
        </div>
      ))}
      {Object.keys(byType).length === 0 && <div className="t2-no-data">暂无排名数据</div>}
    </div>
  );
};

export default Task2Layout;
