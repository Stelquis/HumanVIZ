import React, { useEffect, useRef, useState, Component, type ReactNode, useMemo } from "react";
import * as echarts from "echarts";
import evidenceData from "../../data/task5-evidence.json";
import { PekingOperaUniverse } from "../StarMap";
import "./Task5Layout.scss";

class ErrorBoundary extends Component<{children: ReactNode}, {err: string|null; key: number}> {
  state = { err: null as string|null, key: 0 };
  static getDerivedStateFromError(e: Error) {
    return { err: e.message, key: Math.random() };
  }
  componentDidCatch() {
    // Clear error after a tick so the starmap remounts instead of showing an error banner
    setTimeout(() => this.setState({ err: null }), 0);
  }
  render() {
    if (this.state.err) {
      // Silently remount — key change forces clean Canvas rebuild
      return <React.Fragment key={this.state.key}>{this.props.children}</React.Fragment>;
    }
    return this.props.children;
  }
}

/* ================================================================
   梨园星图 · 多维综合分析
   ────────────────────────────────────────────────────────────────
   布局：顶栏 + 全屏星图 + 两个滑出面板（因果分析 / 分析报告）
   ================================================================ */

type CausalEdge = "rel-theme" | "theme-narr" | "narr-rel";

const EDGE_INFO: Record<CausalEdge, {
  label: string; from: string; to: string; question: string; color: string;
}> = {
  "rel-theme":  { label: "关系 → 主题", from: "角色关系", to: "主题表达", question: "特定角色关系如何承载和推动主题表达？", color: "#b8926a" },
  "theme-narr": { label: "主题 → 叙事", from: "主题结构", to: "叙事策略", question: "主题结构如何影响叙事策略与剧情组织？", color: "#96544d" },
  "narr-rel":   { label: "叙事 → 关系", from: "叙事方式", to: "角色关系", question: "不同叙事方式如何重塑角色关系的呈现与演化？", color: "#7f968d" },
};

const NARR_TYPES = ["线性渐进式", "悬念突转式", "双线交织式", "回环照应式", "情感波浪式", "史诗铺陈式", "三叠反复式", "多幕群像式"];
const NARR_COLORS: Record<string, string> = {
  线性渐进式: "#b8926a", 悬念突转式: "#c44d4d", 双线交织式: "#5e6b76", 回环照应式: "#7f968d",
  情感波浪式: "#c77d8b", 史诗铺陈式: "#6b5b4f", 三叠反复式: "#c4a56e", 多幕群像式: "#8a7a8e",
};
const EVIDENCE = evidenceData as any;

/** Build dynamic causal analysis from evidence data */
function buildCausalAnalysis(edge: CausalEdge) {
  const er = EVIDENCE.relTheme;
  const en = EVIDENCE.themeNarr;
  const ea = EVIDENCE.narrRel;

  if (edge === "rel-theme") {
    const findings = (er?.topFindings || []).map((f: any, i: number) => ({
      title: f.title || `发现 ${i + 1}`,
      detail: f.detail || "",
      evidence: f.evidence || "",
      strength: f.strength || 0.5,
    }));
    // Build chart: top correlations per metric × top themes
    const corrs = (er?.perThemeCorrelations || []) as any[];
    const topThemes = [...new Set(corrs.map((c: any) => c.theme))].slice(0, 8) as string[];
    const metrics = ["网络密度", "中心性偏离", "聚类系数"] as string[];
    const chartData = metrics.map((ml: string) => {
      const row: any = { metric: ml };
      for (const t of topThemes) {
        const c = corrs.find((x: any) => x.metricLabel === ml && x.theme === t);
        row[t] = c ? c.correlation : 0;
      }
      return row;
    });
    return { findings: findings.slice(0, 3), chartData, chartType: "groupedBar" as const, topThemes };
  }

  if (edge === "theme-narr") {
    const findings = (en?.topFindings || []).map((f: any, i: number) => ({
      title: f.title || `发现 ${i + 1}`,
      detail: f.detail || "",
      evidence: f.evidence || "",
      strength: f.strength || 0.5,
    }));
    // Build chart: residuals heatmap data → stacked bar
    const residuals = (en?.residuals || []) as any[];
    const narrTypes = NARR_TYPES;
    const clusters = [...new Set(residuals.map((r: any) => r.themeClusterLabel))].slice(0, 6) as string[];
    const chartData = clusters.map((cl: string) => {
      const row: any = { cluster: cl };
      for (const nt of narrTypes) {
        const r = residuals.find((x: any) => x.themeClusterLabel === cl && x.narrType === nt);
        row[nt] = r ? Math.max(0, r.residual) : 0;
      }
      return row;
    });
    return { findings: findings.slice(0, 3), chartData, chartType: "stackedBar" as const, narrTypes };
  }

  // narr-rel
  const findings = (ea?.topFindings || []).map((f: any, i: number) => ({
    title: f.title || `发现 ${i + 1}`,
    detail: f.detail || "",
    evidence: f.evidence || "",
    strength: f.strength || 0.5,
  }));
  const boxData = (ea?.boxplotData || []) as any[];
  const chartData = boxData.map((b: any) => ({
    narrType: b.narrType,
    avgDensity: b.density?.mean ?? 0,
    avgClustering: b.clustering?.mean ?? 0,
    avgCentralization: b.centralization?.mean ?? 0,
    count: b.n ?? 0,
  }));
  return { findings: findings.slice(0, 3), chartData, chartType: "narrBar" as const };
}

/* ================================================================
   Sub-components
   ================================================================ */

/** 三角因果图 SVG */
const CausalTriangle: React.FC<{
  selectedEdge: CausalEdge | null;
  onSelectEdge: (edge: CausalEdge) => void;
}> = ({ selectedEdge, onSelectEdge }) => {
  const cx = 160, cy = 140, r = 110;
  const vertices = [
    { x: cx, y: cy - r, label: "角色关系", icon: "🕸️", color: "#b8926a" },
    { x: cx - r * 0.87, y: cy + r * 0.5, label: "主题结构", icon: "📜", color: "#96544d" },
    { x: cx + r * 0.87, y: cy + r * 0.5, label: "叙事结构", icon: "🎬", color: "#7f968d" },
  ];
  const edges: { from: number; to: number; id: CausalEdge; dx: number; dy: number }[] = [
    { from: 0, to: 1, id: "rel-theme", dx: -12, dy: 0 },
    { from: 1, to: 2, id: "theme-narr", dx: 0, dy: 14 },
    { from: 2, to: 0, id: "narr-rel", dx: 12, dy: 0 },
  ];

  return (
    <svg viewBox="0 0 320 300" className="t5-triangle-svg">
      <defs>
        <radialGradient id="t5-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(184,155,109,0.12)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r + 16} fill="rgba(184,149,109,0.08)" />
      {edges.map((e) => {
        const v1 = vertices[e.from], v2 = vertices[e.to];
        const mx = (v1.x + v2.x) / 2 + e.dx, my = (v1.y + v2.y) / 2 + e.dy;
        const active = selectedEdge === e.id;
        return (
          <g key={e.id} onClick={() => onSelectEdge(e.id)} style={{ cursor: "pointer" }}>
            <path d={`M${v1.x},${v1.y} Q${mx},${my} ${v2.x},${v2.y}`}
              fill="none" stroke={EDGE_INFO[e.id].color}
              strokeWidth={active ? 3.5 : 2} strokeOpacity={active ? 0.9 : 0.35} strokeLinecap="round" />
            <text x={mx} y={my - 6} textAnchor="middle"
              fill={active ? EDGE_INFO[e.id].color : "#8a8a90"}
              fontSize={active ? 12 : 10} fontWeight={active ? 700 : 400}
              fontFamily="'PT Serif', serif">
              {EDGE_INFO[e.id].label}
            </text>
          </g>
        );
      })}
      {vertices.map((v, i) => (
        <g key={i}>
          <circle cx={v.x} cy={v.y} r={24} fill="#f6f1e7" stroke={v.color} strokeWidth={2}
            style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.1))" }} />
          <text x={v.x} y={v.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize="16">{v.icon}</text>
          <text x={v.x} y={v.y + 38} textAnchor="middle" fill={v.color} fontSize="12" fontWeight="700"
            fontFamily="'PT Serif', serif">{v.label}</text>
        </g>
      ))}
    </svg>
  );
};

/** 因果分析图表 — dynamically built from evidence data */
const CausalChart: React.FC<{ edge: CausalEdge }> = ({ edge }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Dispose any leaked instance safely via the DOM API
    try { echarts.dispose(el); } catch { /* el already detached */ }

    let chart: echarts.ECharts | null = null;
    try {
      chart = echarts.init(el);
    } catch {
      return;
    }

    const info = EDGE_INFO[edge];
    const analysis = buildCausalAnalysis(edge);

    try {
      if (edge === "rel-theme" && (analysis as any).topThemes?.length) {
        const d = analysis.chartData as any[];
        const themes = (analysis as any).topThemes as string[];
        chart.setOption({
          tooltip: { trigger: "axis", backgroundColor: "rgba(255,253,249,0.96)", borderColor: "rgba(184,149,109,0.5)", textStyle: { color: "#3a3335", fontSize: 11 } },
          legend: { data: themes, orient: "vertical", right: 8, top: 4, textStyle: { fontSize: 8, color: "#5E4B3A" } },
          grid: { left: 56, right: 100, top: 10, bottom: 36 },
          xAxis: { type: "category", data: d.map((x: any) => x.metric), axisLabel: { fontSize: 10, color: "#5E4B3A", fontWeight: 600 }, axisLine: { lineStyle: { color: "rgba(184,149,109,0.4)" } } },
          yAxis: { type: "value", name: "相关系数 r", axisLabel: { fontSize: 9, color: "#8E8A84" }, splitLine: { lineStyle: { color: "rgba(0,0,0,0.06)" } } },
          series: themes.map((t: string, i: number) => ({
            name: t, type: "bar", data: d.map((x: any) => x[t] || 0),
            itemStyle: { color: ["#b8926a","#96544d","#5e6b76","#7f968d","#c77d8b","#c4a56e","#6b7b8e","#8a7a8e"][i], borderRadius: [3,3,0,0] },
            barMaxWidth: 18,
          })),
          animationDuration: 400,
        });
      } else if (edge === "theme-narr" && analysis.chartData?.length) {
        const d = analysis.chartData as any[];
        const narrTypes = ((analysis as any).narrTypes as string[])?.slice(0, 6) || [];
        chart.setOption({
          tooltip: { trigger: "axis", backgroundColor: "rgba(255,253,249,0.96)", borderColor: "rgba(184,149,109,0.5)", textStyle: { color: "#3a3335", fontSize: 11 } },
          legend: { data: narrTypes, orient: "vertical", right: 8, top: 4, textStyle: { fontSize: 7, color: "#5E4B3A" } },
          grid: { left: 130, right: 90, top: 10, bottom: 36 },
          xAxis: { type: "value", name: "正残差和", axisLabel: { fontSize: 9, color: "#8E8A84" }, splitLine: { lineStyle: { color: "rgba(0,0,0,0.06)" } } },
          yAxis: { type: "category", data: d.map((x: any) => x.cluster), axisLabel: { fontSize: 9, color: "#5E4B3A" }, axisLine: { lineStyle: { color: "rgba(184,149,109,0.4)" } } },
          series: narrTypes.map((nt: string) => ({
            name: nt, type: "bar", stack: "total",
            data: d.map((x: any) => x[nt] || 0),
            itemStyle: { color: NARR_COLORS[nt] || "#999" }, barMaxWidth: 14,
          })),
          animationDuration: 400,
        });
      } else if (analysis.chartData?.length) {
        const d = analysis.chartData as any[];
        chart.setOption({
          tooltip: { trigger: "axis", backgroundColor: "rgba(255,253,249,0.96)", borderColor: "rgba(184,149,109,0.5)", textStyle: { color: "#3a3335", fontSize: 11 } },
          legend: { data: ["网络密度", "聚类系数"], orient: "vertical", right: 8, top: 4, textStyle: { fontSize: 9, color: "#5E4B3A" } },
          grid: { left: 56, right: 85, top: 10, bottom: 36 },
          xAxis: { type: "category", data: d.map((x: any) => x.narrType), axisLabel: { fontSize: 9, color: "#5E4B3A", fontWeight: 600, rotate: 30 }, axisLine: { lineStyle: { color: "rgba(184,149,109,0.4)" } } },
          yAxis: { type: "value", max: 1, axisLabel: { fontSize: 9, color: "#8E8A84" }, splitLine: { lineStyle: { color: "rgba(0,0,0,0.06)" } } },
          series: [
            { name: "网络密度", type: "bar", data: d.map((x: any) => x.avgDensity), itemStyle: { color: info.color, borderRadius: [3,3,0,0] }, barMaxWidth: 22 },
            { name: "聚类系数", type: "bar", data: d.map((x: any) => x.avgClustering), itemStyle: { color: "#5e6b76", borderRadius: [3,3,0,0] }, barMaxWidth: 22 },
          ],
          animationDuration: 400,
        });
      }
    } catch {
      // ECharts setOption failed — ignore, chart stays blank
    }

    const h = () => chart?.resize();
    window.addEventListener("resize", h);
    const ro = new ResizeObserver(() => chart?.resize());
    ro.observe(el);
    return () => {
      window.removeEventListener("resize", h);
      ro.disconnect();
      try { echarts.dispose(el); } catch { /* DOM already detached */ }
    };
  }, [edge]);

  return <div ref={ref} className="t5-chart-box" />;
};

/* ================================================================
   Main Layout
   ================================================================ */
const Task5Layout: React.FC = () => {
  const [selectedEdge, setSelectedEdge] = useState<CausalEdge>("rel-theme");
  const [_selectedScript, setSelectedScript] = useState<any>(null);
  const [panelOpen, setPanelOpen] = useState<"none" | "causal" | "report">("none");

  const analysis = useMemo(() => buildCausalAnalysis(selectedEdge), [selectedEdge]);
  const edgeInfo = EDGE_INFO[selectedEdge];

  return (
    <div className="t5-screen">
      {/* ── 星图全屏卡片（顶栏内容融入浮动叠加层） ── */}
      <main className="t5-starmap-area">
        {/* Floating header overlay — compact, Overview-style */}
        <div className="t5-card-header">
          <div className="t5-header-left">
            <h1>🔗 梨园星图 · 多维综合分析</h1>
            <div className="t5-header-subtitle">
              融合角色关系、主题结构与叙事方式，探索京剧创作中的三角因果规律
            </div>
          </div>
          <div className="t5-header-right">
            <button
              className={`t5-header-btn ${panelOpen === "causal" ? "active" : ""}`}
              onClick={() => setPanelOpen(panelOpen === "causal" ? "none" : "causal")}
            >
              <span>🔺</span><span>因果分析</span>
            </button>
            <button
              className={`t5-header-btn ${panelOpen === "report" ? "active" : ""}`}
              onClick={() => setPanelOpen(panelOpen === "report" ? "none" : "report")}
            >
              <span>📋</span><span>分析报告</span>
            </button>
          </div>
        </div>

        <ErrorBoundary>
          <PekingOperaUniverse onScriptSelect={setSelectedScript} />
        </ErrorBoundary>
      </main>

      {/* ── 因果分析面板（右侧滑出） ── */}
      <div className={`t5-panel-backdrop ${panelOpen !== "none" ? "visible" : ""}`}
        onClick={() => setPanelOpen("none")} />
      <aside className={`t5-panel t5-panel-causal ${panelOpen === "causal" ? "open" : ""}`}>
        <div className="t5-panel-header">
          <span>🔺</span><h2>三角因果分析</h2>
          <button className="t5-panel-close" onClick={() => setPanelOpen("none")}>✕</button>
        </div>
        <div className="t5-panel-body">
          <p className="t5-panel-intro">
            综合角色关系、主题结构与叙事结构，分析三者之间的因果机制。
          </p>
          <ErrorBoundary>
          <CausalTriangle selectedEdge={selectedEdge} onSelectEdge={setSelectedEdge} />

          <div className="t5-edge-selector">
            {(Object.entries(EDGE_INFO) as [CausalEdge, typeof EDGE_INFO[CausalEdge]][]).map(([id, info]) => (
              <button key={id}
                className={`t5-edge-btn ${selectedEdge === id ? "active" : ""}`}
                onClick={() => setSelectedEdge(id)}
                style={{ borderLeftColor: info.color }}>
                <span className="t5-edge-btn-label">{info.label}</span>
                <span className="t5-edge-btn-q">{info.question}</span>
              </button>
            ))}
          </div>

          <div className="t5-findings-col">
            {analysis.findings.map((f: any, i: number) => (
              <div key={i} className="t5-finding-card" style={{ borderTopColor: edgeInfo.color }}>
                <div className="t5-finding-hdr">
                  <span className="t5-finding-num" style={{ background: edgeInfo.color }}>{i + 1}</span>
                  <span className="t5-finding-title">{f.title}</span>
                </div>
                <p className="t5-finding-detail">{f.detail}</p>
                <div className="t5-finding-evidence"><span>📊</span><span>{f.evidence}</span></div>
                <div className="t5-finding-strength">
                  <span className="t5-str-label">强度</span>
                  <span className="t5-str-track">
                    <span className="t5-str-fill" style={{ width: `${f.strength * 100}%`, background: edgeInfo.color }} />
                  </span>
                  <span className="t5-str-val">{(f.strength * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>

          <div className="t5-chart-card">
            <div className="t5-chart-card-hdr">
              <span>📈</span>
              <h3>
                {selectedEdge === "rel-theme" && "角色网络指标 × 主题 相关系数"}
                {selectedEdge === "theme-narr" && "主题簇 × 叙事类型 正残差"}
                {selectedEdge === "narr-rel" && "各叙事类型的角色网络特征"}
              </h3>
            </div>
            <CausalChart edge={selectedEdge} />
          </div>
          </ErrorBoundary>
        </div>
      </aside>

      {/* ── 分析报告面板（右侧滑出） ── */}
      <aside className={`t5-panel t5-panel-report ${panelOpen === "report" ? "open" : ""}`}>
        <div className="t5-panel-header">
          <span>📋</span><h2>综合关联分析报告</h2>
          <button className="t5-panel-close" onClick={() => setPanelOpen("none")}>✕</button>
        </div>
        <div className="t5-panel-body">
          <p className="t5-panel-subtitle">ChinaVis 2026 赛道1-I · 任务五《多维综合分析与交互系统构建》</p>

          <h4>一、研究目标与必要性</h4>
          <p>前述四个任务分别从角色分类、关系网络、主题结构、叙事模式四个维度对 1473 部京剧剧本进行了独立分析。然而，京剧剧本的丰富性恰恰在于这些维度的<strong>交织</strong>——同一部戏中，角色关系承载主题，主题驱动叙事节奏，叙事方式又反过来重塑角色关系的呈现。单一维度的分析无法揭示这种"三角因果"机制。</p>
          <p>因此，本任务的核心目标是：设计一个<strong>综合可视化系统</strong>，将四个维度的信息融合在同一个交互界面中，使研究者能够从宏观全景出发，逐层深入到个体剧本，同时在探索过程中发现跨维度的关联规律。</p>

          <h4>二、为什么选择漩涡星系布局</h4>
          <p>大规模高维数据（1473 个数据点 × 20+ 特征维）的宏观呈现面临三大挑战：维度诅咒、视觉过载、交互响应。我们对比了三种候选方案：</p>
          <p><strong>降维散点图</strong>（PCA/UMAP）：适合展示聚类，但降维不可逆且丢失原始维度的可解释性。</p>
          <p><strong>力导向图</strong>：1473 节点全连产生"毛球"效应，无法识别宏观结构。</p>
          <p><strong>漩涡星系</strong>（M51 双螺旋参考）：以星系隐喻组织大规模点云——双螺旋臂提供自然排列秩序，中心空洞（"黑洞"）避免团簇，臂间稀疏区形成视觉呼吸感。通过确定性哈希将剧本沿螺旋臂分布，辅以主题方向微漂移、复杂度径向偏置和叙事高度偏移，形成可读的三维结构空间。</p>
          <p>该布局的优势：空间利用率高（1473 点不重叠），层次清晰（中心→臂→外缘），且支持连续缩放探索。</p>

          <h4>三、视觉编码设计与合理性</h4>
          <p>本方案在 3D 空间中采用多通道视觉编码，将四个分析维度映射到不同视觉通道：</p>
          <p><strong>颜色 → 剧种分类</strong>（7 色）：历史戏=暖琥珀、家庭戏=正红、侠义戏=蓝、爱情戏=玫红、神话戏=青绿、公案戏=灰蓝、技法展示戏=暖金。剧种不决定空间位置，作为后验对照变量用于解释分布差异。</p>
          <p><strong>大小 → 角色数量</strong>：角色越多星体越大，直观感知剧本复杂度和群像规模。</p>
          <p><strong>亮度 → 综合结构强度</strong>：由密度、中心性、聚类系数、边数、主题数综合加权，亮星代表结构显著、适合作为案例分析入口。</p>
          <p><strong>高度（Y轴）→ 叙事类型</strong>：悬念突转式=最高层（戏剧张力），史诗铺陈式=高层（宏大视野），回环照应式=低层（闭环回归）。叙事类型作为第三空间维度避免与平面位置冲突。</p>
          <p><strong>连线 → 共享角色</strong>：hover 或选中剧本时显示与其共享角色的邻居剧本连线，线宽编码共享角色数量。</p>
          <p><strong>Bloom 后处理</strong>：星体使用径向渐变 + 发光后处理，增强"星"的视觉感。选中/hover 状态下光晕扩大。</p>

          <h4>四、交互设计</h4>
          <p><strong>滚轮缩放 + 拖拽旋转</strong>：支持从全景概览到单节点细节的连续缩放（16 - 700 单位），鼠标位置为缩放焦点。OrbitControls 提供阻尼旋转和平滑过渡。</p>
          <p><strong>Hover 高亮</strong>：悬停星体时显示共享角色邻居连线，主场景 dim 非邻居星体，聚焦目标剧本的关系上下文。</p>
          <p><strong>点击详情</strong>：点击星体弹出右侧详情面板，展示四维信息：角色关系（行当分布 + 网络指标 + Top角色）、叙事结构（类型 + 唱念做打比例 + 场次）、主题标签、结构特征。</p>
          <p><strong>双击复位</strong>：动画恢复到初始全景视角。</p>

          <h4>五、三条因果链的证据发现</h4>
          {(() => {
            const relF = (EVIDENCE.relTheme?.topFindings || []) as any[];
            const tnF = (EVIDENCE.themeNarr?.topFindings || []) as any[];
            const nrF = (EVIDENCE.narrRel?.topFindings || []) as any[];
            const tnChi2 = EVIDENCE.themeNarr?.chiSquared ?? 0;
            const tnP = EVIDENCE.themeNarr?.pValue ?? 1;
            const tnV = EVIDENCE.themeNarr?.cramersV ?? 0;
            return (
              <>
                <p><strong>关系→主题</strong>（{relF.length} 项显著发现）：</p>
                {relF.map((f: any, i: number) => (
                  <p key={i}>· {f.title} — {f.evidence}</p>
                ))}
                <p style={{marginTop:8}}><strong>主题→叙事</strong>（χ²={tnChi2}, p={tnP < 0.001 ? "<0.001" : String(tnP)}, Cramér's V={tnV}）：</p>
                {tnF.map((f: any, i: number) => (
                  <p key={i}>· {f.title}（{f.evidence}）</p>
                ))}
                <p style={{marginTop:8}}><strong>叙事→关系</strong>（Kruskal-Wallis检验，{nrF.length}项指标显著）：</p>
                {nrF.map((f: any, i: number) => (
                  <p key={i}>· {f.title}（{f.evidence}）</p>
                ))}
              </>
            );
          })()}

          <h4>六、结构原型：典型关联模式</h4>
          {(() => {
            const pcs = (EVIDENCE.prototypes?.clusters || []) as any[];
            return (
              <>
                <p>综合角色网络、主题向量和叙事特征做 KMeans 聚类，1473 部剧本收敛为 <strong>{pcs.length} 种结构原型</strong>：</p>
                {pcs.map((cp: any, i: number) => (
                  <p key={i} style={{marginBottom:4}}>
                    <strong>{i+1}. {cp.label}</strong>（{cp.count}部）：{cp.topGenre}为主，偏好{cp.topNarrType}叙事，
                    均密度={cp.avgDensity}，均中心性偏离={cp.avgCentralization}，均聚类={cp.avgClustering}。
                    代表：{cp.representatives?.slice(0,3).map((r: any) => `《${r.titleShort}》`).join("、")}
                  </p>
                ))}
                <p>这 {pcs.length} 种原型证明角色关系、主题表达与叙事结构三者不是孤立变量，而是共同组成了稳定的剧本结构类型。</p>
                <p style={{marginTop:8, color:"var(--theme-wood)", fontWeight:600}}>协同演化：民国汇编本 → 新中国整理本，"强中心宫廷朝堂型" 从 14% 翻倍至 28%，剧本结构随时代变迁发生系统性偏移。</p>
              </>
            );
          })()}

          <h4>七、与现有任务的关系</h4>
          <p>本可视化系统是对 Task 1-4 的<strong>综合与升华</strong>：</p>
          <p>Task 1 行当分类 → 星体详情中展示角色行当分布；Task 2 关系网络 → 剧本间共享角色连线 + 网络指标（密度/中心性/聚类）作为因果证据；Task 3 主题分析 → 12维主题向量 + χ² 检验支撑"主题→叙事"因果链；Task 4 叙事结构 → 8种叙事类型驱动星体高度 + Kruskal-Wallis 检验支撑"叙事→关系"因果链。</p>
          <p>通过此融合，用户在一次探索中可同时获得四个维度信息，发现单一维度分析无法揭示的跨维度关联规律。</p>
        </div>
      </aside>
    </div>
  );
};

export default Task5Layout;
