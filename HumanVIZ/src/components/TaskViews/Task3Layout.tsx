import React, { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import p3data from "../../data/p3_frontend_data.json";
import "./Task3Layout.scss";

type ReportTabId = "report" | "method" | "combos" | "stats";
type MainView = "heatmap" | "radar" | "combo";

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
  heatmap: "主题共现热力图",
  radar: "类型主题雷达",
  combo: "主题组合分布",
};
const VIEW_ICONS: Record<MainView, string> = {
  heatmap: "🔥",
  radar: "🎯",
  combo: "📊",
};

/* ================================================================
   Task3Layout — 剧本主题提取与跨剧本比较 (Enriched Redesign)
   ================================================================ */
const Task3Layout: React.FC = () => {
  const [mainView, setMainView] = useState<MainView>("heatmap");
  const [reportSidebarOpen, setReportSidebarOpen] = useState(false);
  const [reportTab, setReportTab] = useState<ReportTabId>("report");
  const [selectedArchetype, setSelectedArchetype] = useState<string | null>(null);

  const heatmapRef = useRef<HTMLDivElement>(null);
  const radarRef = useRef<HTMLDivElement>(null);
  const comboRef = useRef<HTMLDivElement>(null);

  const data = p3data as any;
  const archetypes = data.archetypes || [];

  /* ==================================================================
     Chart 1 — Clustered Heatmap (genre × theme)
     ================================================================== */
  useEffect(() => {
    if (mainView !== "heatmap" || !heatmapRef.current) return;
    const chart = echarts.init(heatmapRef.current);

    const order = CLUSTERED_ORDER;
    const types = [...TYPE_ORDER];

    const heatData: [number, number, number][] = [];
    types.forEach((genre, gi) => {
      order.forEach((theme, ti) => {
        heatData.push([ti, gi, (data.type_theme_matrix[genre]?.[theme] || 0) * 100]);
      });
    });

    const maxVal = Math.max(...heatData.map((d) => d[2]));

    chart.setOption({
      tooltip: {
        formatter: (p: any) =>
          `<b>${order[p.data[0]]}</b> 在 <b>${types[p.data[1]]}</b> 中<br/>覆盖率: ${p.data[2].toFixed(1)}%`,
      },
      grid: { left: 120, right: 40, top: 10, bottom: 40 },
      xAxis: {
        type: "category",
        data: order,
        position: "bottom" as const,
        axisLabel: { fontSize: 10, color: "#5e3a2e", rotate: 30, fontWeight: 600 },
        axisLine: { lineStyle: { color: "#c4b08a" } },
        splitArea: { show: true, areaStyle: { color: ["rgba(0,0,0,0)"] } },
      },
      yAxis: {
        type: "category",
        data: types,
        axisLabel: { fontSize: 12, color: "#5e3a2e", fontWeight: 700 },
        axisLine: { lineStyle: { color: "#c4b08a" } },
      },
      visualMap: {
        min: 0,
        max: maxVal,
        calculable: true,
        orient: "vertical",
        right: 0,
        top: "center",
        textStyle: { color: "#8b7355", fontSize: 10 },
        inRange: {
          color: ["#faf5ed", "#e8d5c0", "#c4a56e", "#8b5e3c", "#5e3a2e"],
        },
      },
      series: [
        {
          type: "heatmap",
          data: heatData,
          label: {
            show: true,
            fontSize: 9,
            color: "#5e3a2e",
            formatter: (p: any) => (p.data[2] > 15 ? p.data[2].toFixed(0) : ""),
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: "rgba(0,0,0,0.3)",
              borderColor: "#5e3a2e",
              borderWidth: 2,
            },
          },
          itemStyle: { borderColor: "#d4c4a8", borderWidth: 1, borderRadius: 2 },
        },
      ],
      animationDuration: 500,
    }, true);

    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("resize", h);
      chart.dispose();
    };
  }, [mainView]);

  /* ==================================================================
     Chart 2 — Genre Theme Radar
     ================================================================== */
  useEffect(() => {
    if (mainView !== "radar" || !radarRef.current) return;
    const chart = echarts.init(radarRef.current);

    const indicator = THEME_ORDER.map((t) => ({
      name: t,
      max: 100,
    }));

    const series = TYPE_ORDER.map((genre) => ({
      type: "radar",
      data: [
        {
          value: THEME_ORDER.map(
            (t) => (data.type_theme_matrix[genre]?.[t] || 0) * 100
          ),
          name: genre,
        },
      ],
      symbol: "circle",
      symbolSize: 4,
      lineStyle: {
        width: 2,
        opacity: 0.8,
        color: TYPE_COLORS[genre],
      },
      itemStyle: { color: TYPE_COLORS[genre] },
      areaStyle: {
        opacity: 0.08,
        color: TYPE_COLORS[genre],
      },
      emphasis: {
        lineStyle: { width: 3, opacity: 1 },
        itemStyle: { opacity: 1 },
        areaStyle: { opacity: 0.25 },
      },
    }));

    chart.setOption({
      tooltip: {
        formatter: (p: any) => {
          if (!p.name) return "";
          let html = `<b style="color:${TYPE_COLORS[p.name] || '#5e3a2e'}">${p.name}</b><br/>`;
          THEME_ORDER.forEach((t, i) => {
            html += `${t}: ${(p.value?.[i] || 0).toFixed(1)}%<br/>`;
          });
          return html;
        },
      },
      legend: {
        data: TYPE_ORDER,
        bottom: 5,
        textStyle: { fontSize: 10, color: "#8b7355" },
      },
      radar: {
        indicator,
        shape: "polygon",
        center: ["50%", "50%"],
        radius: "65%",
        axisName: { fontSize: 9, color: "#5e3a2e", fontWeight: 500 },
        splitNumber: 4,
        axisLine: { lineStyle: { color: "#d4c4a8" } },
        splitLine: { lineStyle: { color: "#e8ddce" } },
        splitArea: {
          areaStyle: {
            color: ["rgba(250,245,237,0.3)", "rgba(255,255,255,0.3)"],
          },
        },
      },
      series: series as any,
      animationDuration: 600,
    }, true);

    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("resize", h);
      chart.dispose();
    };
  }, [mainView]);

  /* ==================================================================
     Chart 3 — Theme Combo Bar Chart (top combinations)
     ================================================================== */
  useEffect(() => {
    if (mainView !== "combo" || !comboRef.current) return;
    const chart = echarts.init(comboRef.current);

    const combos = (data.top_combos || []).slice(0, 15);
    const labels = combos.map((c: any) => {
      const themes = c.themes as string[];
      return themes.length > 4 ? themes.slice(0, 4).join("+") + "…" : c.combo;
    });
    const counts = combos.map((c: any) => c.count);
    const colors = combos.map(
      (c: any) => TYPE_COLORS[c.primary_genre] || "#c4a56e"
    );

    chart.setOption({
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (p: any) => {
          const c = combos[p[0]?.dataIndex];
          if (!c) return "";
          let html = `<b>${c.combo}</b><br/>${c.count} 本 (${c.pct}%)<br/>`;
          html += `主要类型: ${c.primary_genre}<br/>`;
          html += `示例: ${(c.examples || []).map((e: any) => e.title).join(", ")}`;
          return html;
        },
      },
      grid: { left: 10, right: 30, top: 10, bottom: 100 },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: {
          rotate: 40,
          fontSize: 9,
          color: "#5e3a2e",
          interval: 0,
          overflow: "truncate",
          width: 60,
        },
        axisTick: { alignWithLabel: true },
      },
      yAxis: {
        type: "value",
        name: "剧本数",
        axisLabel: { fontSize: 10, color: "#8b7355" },
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
              borderRadius: [4, 4, 0, 0],
            },
          })),
          barMaxWidth: 28,
          label: {
            show: true,
            position: "top",
            fontSize: 9,
            color: "#8b7355",
          },
          emphasis: {
            itemStyle: { shadowBlur: 6, shadowColor: "rgba(0,0,0,0.2)" },
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
      <div className="t3-topbar">
        <div className="t3-topbar-title-group">
          <div className="t3-kicker">Task 3 · Theme Extraction & Cross-Play Comparison</div>
          <h1>剧本主题提取与跨剧本比较</h1>
          <p>
            基于 {data.theme_overall?.length || 12} 维主题关键词体系，从 {(data as any).active_scripts_for_combo || 1423} 本剧本情节中提取主题向量
            （另有 {(data as any).zero_theme_scripts || 50} 本情节摘要未匹配关键词），
            共计发现 {(data as any).total_unique_combos || 622} 种独特主题组合模式。
          </p>
        </div>
        <div className="t3-topbar-report-trigger">
          <button
            className="t3-topbar-report-btn"
            onClick={() => { setReportSidebarOpen(true); setReportTab("report"); }}
            title="查看主题结构设计流程报告"
          >
            <span className="t3-report-btn-icon">📋</span>
            <span>设计流程报告</span>
          </button>
        </div>
      </div>

      {/* ═══════════ Main Grid ═══════════ */}
      <div className="t3-main-grid">
        {/* ── LEFT ── */}
        <div className="t3-side-panel">
          {/* Archetype cards */}
          <div className="t3-side-block">
            <div className="t3-side-block-header">
              <span className="t3-side-block-icon">🏛️</span>
              <h3>主题组合原型</h3>
            </div>
            <div className="t3-archetype-list">
              {archetypes.map((a: any) => (
                <button
                  key={a.id}
                  className={`t3-archetype-card ${selectedArchetype === a.id ? "expanded" : ""}`}
                  onClick={() =>
                    setSelectedArchetype(selectedArchetype === a.id ? null : a.id)
                  }
                  style={{ borderLeftColor: a.color }}
                >
                  <div className="t3-arch-header">
                    <span className="t3-arch-name">{a.name}</span>
                    <span className="t3-arch-count">{a.count}本</span>
                  </div>
                  <div className="t3-arch-subtitle">{a.subtitle}</div>
                  {selectedArchetype === a.id && (
                    <div className="t3-arch-detail">
                      <div className="t3-arch-themes">
                        <span className="t3-arch-label">核心主题:</span>
                        {a.core_themes.map((t: string) => (
                          <span
                            key={t}
                            className="t3-arch-tag core"
                            style={{
                              backgroundColor: (data.theme_colors as any)[t] + "30",
                              borderColor: (data.theme_colors as any)[t],
                            }}
                          >
                            {t}
                          </span>
                        ))}
                        {a.satellite_themes.map((t: string) => (
                          <span
                            key={t}
                            className="t3-arch-tag"
                            style={{
                              backgroundColor: (data.theme_colors as any)[t] + "12",
                              borderColor: (data.theme_colors as any)[t] + "60",
                            }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                      <p className="t3-arch-desc">{a.description}</p>
                      <div className="t3-arch-meta">
                        <span>主类型: {a.primary_genres.join(", ")}</span>
                        <span>示例: {a.examples.join(", ")}</span>
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
            <div className="t3-side-block-note">
              基于主题共现强度和类型亲和力聚类发现的 6 种代表性主题组合模式
            </div>
          </div>

          {/* Theme richness */}
          <div className="t3-side-block">
            <div className="t3-side-block-header">
              <span className="t3-side-block-icon">📋</span>
              <h3>主题丰度</h3>
            </div>
            {data.type_diversity &&
              TYPE_ORDER.map((t) => {
                const d = data.type_diversity[t];
                if (!d) return null;
                const maxCount = Math.max(
                  ...TYPE_ORDER.map(
                    (g) => data.type_diversity[g]?.avg_theme_count || 0
                  )
                );
                return (
                  <div
                    key={t}
                    className="t3-diversity-row"
                    style={{
                      borderLeftColor: TYPE_COLORS[t],
                    }}
                  >
                    <span className="t3-div-type">{t}</span>
                    <span className="t3-div-bar-wrap">
                      <span
                        className="t3-div-bar"
                        style={{
                          width: `${((d.avg_theme_count / maxCount) * 100).toFixed(0)}%`,
                          backgroundColor: TYPE_COLORS[t] + "88",
                        }}
                      />
                    </span>
                    <span className="t3-div-stat">
                      {d.avg_theme_count}主题 · H={d.avg_entropy}
                    </span>
                  </div>
                );
              })}
            <div className="t3-side-block-note">
              公案戏主题最丰富 ({(data.type_diversity as any)?.公案戏?.avg_theme_count}/本)，技法展示最单一
            </div>
          </div>
        </div>

        {/* ── CENTER ── */}
        <div className="t3-center">
          <div className="t3-view-switcher">
            {(Object.entries(VIEW_LABELS) as [MainView, string][]).map(([v, label]) => (
              <button
                key={v}
                className={`t3-view-btn ${mainView === v ? "active" : ""}`}
                onClick={() => setMainView(v)}
              >
                <span className="t3-view-icon">{VIEW_ICONS[v]}</span>
                {label}
              </button>
            ))}
          </div>

          <div className="t3-main-vis">
            {mainView === "heatmap" && <div ref={heatmapRef} className="t3-chart-box" />}
            {mainView === "radar" && <div ref={radarRef} className="t3-chart-box" />}
            {mainView === "combo" && <div ref={comboRef} className="t3-chart-box" />}
          </div>
        </div>

        {/* ── RIGHT ── */}
        <div className="t3-side-panel">
          {/* PMI - strongest co-occurrence pairs */}
          <div className="t3-side-block">
            <div className="t3-side-block-header">
              <span className="t3-side-block-icon">🔗</span>
              <h3>最强主题关联 (NPMI)</h3>
            </div>
            {(data.pmi_scores || [])
              .sort((a: any, b: any) => b.npmi - a.npmi)
              .slice(0, 8)
              .map((p: any, i: number) => (
                <div key={i} className="t3-pmi-row">
                  <span style={{ color: (data.theme_colors as any)[p.pair[0]] }}>
                    {p.pair[0]}
                  </span>
                  <span className="t3-pmi-connector">↔</span>
                  <span style={{ color: (data.theme_colors as any)[p.pair[1]] }}>
                    {p.pair[1]}
                  </span>
                  <span className="t3-pmi-val">
                    {p.count}本
                    <span className="t3-pmi-npmi">
                      NPMI={p.npmi > 0 ? "+" : ""}
                      {p.npmi.toFixed(2)}
                    </span>
                  </span>
                </div>
              ))}
            <div className="t3-side-block-note">
              NPMI (归一化逐点互信息) 衡量主题对的出现关联强度，&gt;0.1 即存在显著正相关
            </div>
          </div>

          {/* Genre similarity */}
          <div className="t3-side-block">
            <div className="t3-side-block-header">
              <span className="t3-side-block-icon">📐</span>
              <h3>类型主题相似度</h3>
            </div>
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
                    <span
                      className="t3-genre-sim-dot"
                      style={{ backgroundColor: TYPE_COLORS[g1] }}
                    />
                    <span className="t3-genre-sim-label">{g1}</span>
                    <span className="t3-genre-sim-arrow">→</span>
                    <span className="t3-genre-sim-target">
                      最近似: <b>{closest.genre}</b> ({closest.similarity})
                    </span>
                  </div>
                );
              })}
            <div className="t3-side-block-note">
              基于主题向量的余弦距离，值越接近 1 表示类型间主题构成越相似
            </div>
          </div>
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
    <p className="t3-report-subtitle">ChinaVis 2026 赛道1-I · 任务三《剧本主题提取与跨剧本比较》设计流程指导报告</p>

    <h3>一、任务目标解析</h3>
    <p>任务三的核心目标是：基于全量京剧剧本的情节摘要文本，构建主题分类体系，提取每本剧本的主题向量，并比较不同剧目类型之间在主题内容上的系统差异，揭示各类型的"主题指纹"与跨剧本的主题共现模式。该任务本质上融合了文本挖掘、关键词匹配与加权计分、统计检验、主题共现网络分析与可视分析。</p>

    <h3>二、整体研究框架</h3>
    <p>整体流程为：情节摘要文本（1473本）→ 12 维主题关键词体系构建 → 关键词匹配与加权计分 → 主题向量提取（归一化 + 二值呈现）→ 统计检验（卡方独立性检验）→ 剧目类型×主题差异分析 → 主题共现模式挖掘 → 可视分析与交互展示。</p>

    <h3>三、数据预处理阶段</h3>
    <p>基于对 1467 条情节摘要的预分析和京剧文化主题理解，构建 12 维主题分类体系，涵盖家庭伦理（58.9%）、宫廷朝堂（57.4%）、生死离别（47.0%）、征战讨伐（39.4%）、智谋韬略（35.8%）、冤案昭雪（35.6%）、侠义江湖（32.0%）、爱情姻缘（21.1%）、神话灵异（18.8%）、科举功名（16.3%）、权谋斗争（12.8%）、忠义报国（12.4%）。采用纯关键词匹配方案，加权计分公式为 score = Σ(count(kw) × len(kw))，长关键词自适应加权。</p>

    <h3>四、主题分析模型设计</h3>
    <p>采用"卡方独立性检验 + 差异分析 + 主题丰度 + 共现分析"多重验证方案。每本剧本的主题向量包含三个层次：原始得分（各主题的加权匹配得分）、归一化得分（[0,1] 区间）、二值呈现（该主题是否存在于该剧本）。卡方检验判断每个主题在 7 种类型间的分布是否独立，差异分析量化类型的强势/弱势主题。</p>

    <h3>五、关键发现与类型画像</h3>
    <p>全部 12 个主题在 7 种类型间均达到 p &lt; 0.01 显著水平。神话灵异的卡方值最高（χ²=370.4），是区分剧目类型最显著的主题。七类主题指纹：历史戏以征战讨伐、智谋韬略、宫廷朝堂为主；家庭戏以家庭伦理、爱情姻缘为核心；侠义戏以侠义江湖、生死离别为特征；爱情戏以爱情姻缘、科举功名为焦点；神话戏以神话灵异为主导（+64%）；公案戏以冤案昭雪、智谋韬略为特色。主题丰度方面，公案戏最丰富（5.2主题/本），技法展示戏最单一（1.0主题/本）。</p>

    <h3>六、主题共现模式</h3>
    <p>Top-5 主题共现对揭示了京剧最核心的叙事空间：宫廷朝堂×家庭伦理（615本，41.9%）为最核心的叙事空间；家庭伦理×生死离别（538本，36.7%）体现家族悲剧主题；家庭伦理×爱情姻缘（509本，34.7%）反映才子佳人的家庭归属；冤案昭雪×家庭伦理（506本，34.5%）揭示冤案拆散家庭、昭雪重聚的叙事模式；侠义江湖×家庭伦理（487本，33.2%）表明英雄行侠的护家动机。</p>

    <h3>七、可视化设计方案</h3>
    <p>核心图表包括：主题共现热力图（7类型×12主题覆盖率矩阵，聚类排列）、类型主题雷达图（12 轴雷达图展示各类型的多维主题画像）、主题组合分布图（独特主题组合的频次分布）、主题关联环图（12 节点圆形排列，边=共现关系）、主题树图（按覆盖率分配面积）、类型主题画像散点图（X=全局覆盖率，Y=类型覆盖率）。</p>

    <h3>八、交互系统设计建议</h3>
    <p>采用三面板布局：左侧为主题组合原型选择与主题丰度统计，中间为主视图切换区（主题共现热力图/类型主题雷达/主题组合分布），右侧为最强主题关联（NPMI）与类型主题相似度。采用与任务一、二统一的"燕京清晖"主题设计语言。</p>

    <h3>九、创新点</h3>
    <p>创新点1：构建面向京剧剧本的 12 维主题分类体系，融合戏曲学领域知识与文本挖掘方法。创新点2：提出基于加权关键词匹配的主题向量提取方法，长关键词自适应加权提升匹配精度。创新点3：通过卡方检验量化七种剧目类型的"主题指纹"，揭示主题与类型的系统关联。创新点4：发现京剧"宫廷+家族"双核叙事空间等主题共现规律。</p>

    <h3>十、推荐技术栈</h3>
    <p>数据处理：Python、NumPy、pandas。统计检验：SciPy（卡方检验）、statsmodels。可视化：ECharts（热力图、雷达图、环图、树图、散点图）、D3.js。前端框架：React + TypeScript + SCSS。</p>

    <h3>十一、与任务一、二的协同设计</h3>
    <p>任务一聚焦角色级分析（行当推断），任务二聚焦网络级分析（角色关系），任务三聚焦剧本级分析（主题内容）。三者共享剧目类型标签体系，共同构成从"角色个体"到"角色关系"再到"剧本主题"的完整戏曲数字人文研究链路。</p>
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
        formatter: (p: any) =>
          `<b>${p.name}</b><br/>χ² = ${p.value.toFixed(1)}<br/>dof = ${5}<br/>` +
          (p.value > 11.07 ? "p < 0.05 (显著)" : "p ≥ 0.05 (不显著)"),
      },
      grid: { left: 100, right: 30, top: 10, bottom: 20 },
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
              formatter: "p=0.05 临界值\nχ²=11.07",
              fontSize: 9,
              color: "#96544d",
            },
            data: [{ xAxis: 11.07 }],
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
          对每个主题进行 χ² 独立性检验 (dof = 5)，判断该主题在不同剧目类型间的分布是否存在
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

export default Task3Layout;
