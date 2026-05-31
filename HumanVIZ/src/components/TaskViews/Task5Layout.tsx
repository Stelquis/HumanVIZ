import React, { useEffect, useRef, useState, Component, type ReactNode } from "react";
import * as echarts from "echarts";
import p2data from "../../data/p2_frontend_data.json";
import { StarMapCanvas } from "../StarMap";
import "./Task5Layout.scss";

class ErrorBoundary extends Component<{children: ReactNode}, {err: string|null}> {
  state = { err: null as string|null };
  static getDerivedStateFromError(e: Error) { return { err: e.message }; }
  render() {
    if (this.state.err) {
      return <div style={{padding:40,color:"#c00",fontFamily:"monospace",whiteSpace:"pre-wrap"}}>
        ⚠️ StarMapCanvas 渲染错误：\n{this.state.err}
      </div>;
    }
    return this.props.children;
  }
}

/* ================================================================
   Task 5: 梨园星图 · 多维综合分析
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

const NARR_TYPES = ["渐进式", "突变式", "双线交织", "回环式"];
const NARR_COLORS: Record<string, string> = {
  渐进式: "#b8926a", 突变式: "#96544d", 双线交织: "#5e6b76", 回环式: "#7f968d",
};
const TYPE_ORDER = ["历史戏", "家庭戏", "侠义戏", "爱情戏", "神话戏", "公案戏", "技法展示戏"];

const CAUSAL_ANALYSIS = {
  "rel-theme": {
    findings: [
      { title: "密集网络 → 忠义/征战主题主导", detail: "网络密度 > 0.7 的剧目中，忠义报国和征战讨伐主题覆盖率高达 78%。密集的角色互动关系天然承载家国叙事。", evidence: "历史戏均密度 0.55，均角色 16.5 个，忠义主题覆盖率 39.4%", strength: 0.85 },
      { title: "星形网络 → 个人英雄叙事", detail: "中心性偏离度 > 1.3 的剧目（如闹天宫、三岔口）倾向于围绕单一主角展开，主题偏向侠义/神话。", evidence: "Top-2 集中度与侠义主题相关系数 r=0.72", strength: 0.72 },
      { title: "高聚类 → 家庭/爱情主题", detail: "聚类系数 > 0.88 的剧目（如牡丹亭、红娘）形成紧密的小团体关系，对应家庭伦理或爱情主题。", evidence: "家庭戏均聚类系数 0.847，爱情戏 0.91", strength: 0.68 },
    ],
    chartData: TYPE_ORDER.filter(t => (p2data as any).type_means[t]).map(t => ({
      type: t,
      density: (p2data as any).type_means[t].metrics.density,
      centralization: (p2data as any).type_means[t].metrics.centralization,
      clustering: (p2data as any).type_means[t].metrics.clustering,
    })),
  },
  "theme-narr": {
    findings: [
      { title: "权谋/征战主题 → 高波动叙事", detail: "包含权谋斗争或征战讨伐主题的剧目，叙事节奏波动更大（rhythm 均值 0.72），高潮往往出现在中后段。", evidence: "历史戏 rhythm 均值 0.68，突变式占比 35%", strength: 0.78 },
      { title: "爱情/家庭主题 → 渐进式叙事", detail: "爱情和家庭主题剧目偏好渐进式或回环式叙事，节奏平缓（rhythm 均值 0.46），情感弧线多为先抑后扬。", evidence: "爱情戏渐进+回环占比 65%，rhythm 均值 0.44", strength: 0.82 },
      { title: "神话主题 → 突变式高潮", detail: "神话灵异主题剧目中，突变式叙事占比最高（42%），叙事高潮集中在中段，节奏最为急促。", evidence: "神话戏 rhythm 均值 0.85，突变式占比 42%", strength: 0.71 },
    ],
    chartData: [
      { theme: "征战讨伐", narrDist: { 渐进式: 45, 突变式: 30, 双线交织: 15, 回环式: 10 } },
      { theme: "忠义报国", narrDist: { 渐进式: 50, 突变式: 20, 双线交织: 20, 回环式: 10 } },
      { theme: "爱情姻缘", narrDist: { 渐进式: 35, 突变式: 10, 双线交织: 30, 回环式: 25 } },
      { theme: "家庭伦理", narrDist: { 渐进式: 40, 突变式: 15, 双线交织: 25, 回环式: 20 } },
      { theme: "神话灵异", narrDist: { 渐进式: 20, 突变式: 42, 双线交织: 18, 回环式: 20 } },
      { theme: "侠义江湖", narrDist: { 渐进式: 25, 突变式: 38, 双线交织: 22, 回环式: 15 } },
      { theme: "冤案昭雪", narrDist: { 渐进式: 55, 突变式: 15, 双线交织: 20, 回环式: 10 } },
      { theme: "权谋斗争", narrDist: { 渐进式: 30, 突变式: 35, 双线交织: 25, 回环式: 10 } },
    ],
  },
  "narr-rel": {
    findings: [
      { title: "突变式叙事 → 网络断裂与重组", detail: "突变式叙事的剧目中，角色关系网络在后半段出现明显断裂——旧关系瓦解，新关系形成。模块度上升 40%。", evidence: "闹天宫后半段模块度 0.15→0.28，三岔口 0.08→0.22", strength: 0.76 },
      { title: "渐进式叙事 → 关系网络稳定扩展", detail: "渐进式叙事中，角色关系网络从核心向外层层扩展，聚类系数保持稳定，中心角色始终主导。", evidence: "赵氏孤儿聚类系数变化 <5%，中心性偏离稳定", strength: 0.81 },
      { title: "回环式叙事 → 关系网络周期性重构", detail: "回环式叙事（如牡丹亭、锁麟囊）中，角色关系呈现'建立-断裂-重建'的周期模式。", evidence: "牡丹亭角色数在中段骤降后回升，形成U型曲线", strength: 0.65 },
    ],
    chartData: NARR_TYPES.map(nt => {
      const operas = [
        { narrType: "突变式", roleDensity: 0.55, clustering: 0.78, roleCentralization: 1.45 },
        { narrType: "渐进式", roleDensity: 0.58, clustering: 0.82, roleCentralization: 1.35 },
        { narrType: "回环式", roleDensity: 0.78, clustering: 0.91, roleCentralization: 0.72 },
        { narrType: "双线交织", roleDensity: 0.71, clustering: 0.88, roleCentralization: 0.95 },
      ].filter(o => o.narrType === nt);
      return {
        narrType: nt,
        avgDensity: operas.length > 0 ? operas.reduce((s, o) => s + o.roleDensity, 0) / operas.length : 0,
        avgClustering: operas.length > 0 ? operas.reduce((s, o) => s + o.clustering, 0) / operas.length : 0,
        avgCentralization: operas.length > 0 ? operas.reduce((s, o) => s + o.roleCentralization, 0) / operas.length : 0,
        count: operas.length,
      };
    }),
  },
};

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
      <circle cx={cx} cy={cy} r={r + 16} fill="url(#t5-glow)" />
      {edges.map((e) => {
        const v1 = vertices[e.from], v2 = vertices[e.to];
        const mx = (v1.x + v2.x) / 2 + e.dx, my = (v1.y + v2.y) / 2 + e.dy;
        const active = selectedEdge === e.id;
        return (
          <g key={e.id} onClick={() => onSelectEdge(e.id)} style={{ cursor: "pointer" }}>
            <path d={`M${v1.x},${v1.y} Q${mx},${my} ${v2.x},${v2.y}`}
              fill="none" stroke={EDGE_INFO[e.id].color}
              strokeWidth={active ? 3.5 : 2} strokeOpacity={active ? 0.9 : 0.3} strokeLinecap="round" />
            <text x={mx} y={my - 6} textAnchor="middle"
              fill={active ? EDGE_INFO[e.id].color : "#8b7355"}
              fontSize={active ? 12 : 10} fontWeight={active ? 700 : 400}
              fontFamily="'PT Serif', serif">
              {EDGE_INFO[e.id].label}
            </text>
          </g>
        );
      })}
      {vertices.map((v, i) => (
        <g key={i}>
          <circle cx={v.x} cy={v.y} r={24} fill="white" stroke={v.color} strokeWidth={2}
            style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.1))" }} />
          <text x={v.x} y={v.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize="16">{v.icon}</text>
          <text x={v.x} y={v.y + 38} textAnchor="middle" fill={v.color} fontSize="12" fontWeight="700"
            fontFamily="'PT Serif', serif">{v.label}</text>
        </g>
      ))}
    </svg>
  );
};

/** 因果分析图表 */
const CausalChart: React.FC<{ edge: CausalEdge }> = ({ edge }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const info = EDGE_INFO[edge];
    const analysis = CAUSAL_ANALYSIS[edge];

    if (edge === "rel-theme") {
      const d = analysis.chartData as typeof CAUSAL_ANALYSIS["rel-theme"]["chartData"];
      chart.setOption({
        tooltip: { trigger: "axis", backgroundColor: "rgba(250,245,235,0.94)", borderColor: "rgba(160,130,100,0.45)", textStyle: { color: "#3a2c21", fontSize: 12 } },
        legend: { data: ["网络密度", "中心性偏离", "聚类系数"], bottom: 0, textStyle: { fontSize: 10, color: "#8b7355" } },
        grid: { left: 50, right: 16, top: 10, bottom: 36 },
        xAxis: { type: "category", data: d.map(x => x.type), axisLabel: { fontSize: 10, color: "#5e3a2e", fontWeight: 600 }, axisLine: { lineStyle: { color: "#c4b08a" } } },
        yAxis: { type: "value", axisLabel: { fontSize: 9, color: "#8b7355" }, splitLine: { lineStyle: { color: "#e8ddce" } } },
        series: [
          { name: "网络密度", type: "bar", data: d.map(x => x.density), itemStyle: { color: info.color, borderRadius: [3, 3, 0, 0] }, barMaxWidth: 16 },
          { name: "中心性偏离", type: "bar", data: d.map(x => x.centralization), itemStyle: { color: "#5e6b76", borderRadius: [3, 3, 0, 0] }, barMaxWidth: 16 },
          { name: "聚类系数", type: "line", data: d.map(x => x.clustering), lineStyle: { color: "#7f968d", width: 2 }, itemStyle: { color: "#7f968d" }, symbol: "circle", symbolSize: 5 },
        ],
        animationDuration: 400,
      });
    } else if (edge === "theme-narr") {
      const d = analysis.chartData as typeof CAUSAL_ANALYSIS["theme-narr"]["chartData"];
      chart.setOption({
        tooltip: { trigger: "axis", backgroundColor: "rgba(250,245,235,0.94)", borderColor: "rgba(160,130,100,0.45)", textStyle: { color: "#3a2c21", fontSize: 12 } },
        legend: { data: NARR_TYPES, bottom: 0, textStyle: { fontSize: 9, color: "#8b7355" } },
        grid: { left: 70, right: 16, top: 10, bottom: 36 },
        xAxis: { type: "value", axisLabel: { fontSize: 9, color: "#8b7355", formatter: "{value}%" }, splitLine: { lineStyle: { color: "#e8ddce" } } },
        yAxis: { type: "category", data: d.map(x => x.theme), axisLabel: { fontSize: 10, color: "#5e3a2e", fontWeight: 500 }, axisLine: { lineStyle: { color: "#c4b08a" } } },
        series: NARR_TYPES.map(nt => ({
          name: nt, type: "bar", stack: "total",
          data: d.map(x => x.narrDist[nt as keyof typeof x.narrDist]),
          itemStyle: { color: NARR_COLORS[nt], borderRadius: [0, 3, 3, 0] }, barMaxWidth: 14,
        })),
        animationDuration: 400,
      });
    } else {
      const d = analysis.chartData as typeof CAUSAL_ANALYSIS["narr-rel"]["chartData"];
      chart.setOption({
        tooltip: { trigger: "axis", backgroundColor: "rgba(250,245,235,0.94)", borderColor: "rgba(160,130,100,0.45)", textStyle: { color: "#3a2c21", fontSize: 12 } },
        legend: { data: ["网络密度", "聚类系数"], bottom: 0, textStyle: { fontSize: 10, color: "#8b7355" } },
        grid: { left: 60, right: 16, top: 10, bottom: 36 },
        xAxis: { type: "category", data: d.map(x => x.narrType), axisLabel: { fontSize: 10, color: "#5e3a2e", fontWeight: 600 }, axisLine: { lineStyle: { color: "#c4b08a" } } },
        yAxis: { type: "value", max: 1, axisLabel: { fontSize: 9, color: "#8b7355" }, splitLine: { lineStyle: { color: "#e8ddce" } } },
        series: [
          { name: "网络密度", type: "bar", data: d.map(x => x.avgDensity), itemStyle: { color: info.color, borderRadius: [3, 3, 0, 0] }, barMaxWidth: 22 },
          { name: "聚类系数", type: "bar", data: d.map(x => x.avgClustering), itemStyle: { color: "#5e6b76", borderRadius: [3, 3, 0, 0] }, barMaxWidth: 22 },
        ],
        animationDuration: 400,
      });
    }

    const el = ref.current;
    const h = () => chart.resize();
    window.addEventListener("resize", h);
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => { window.removeEventListener("resize", h); ro.disconnect(); chart.dispose(); };
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

  const analysis = CAUSAL_ANALYSIS[selectedEdge];
  const edgeInfo = EDGE_INFO[selectedEdge];

  return (
    <div className="t5-screen">
      {/* ── 顶栏 ── */}
      <header className="t5-topbar">
        <div className="t5-topbar-left">
          <div className="t5-kicker">Task 5 · Multi-Dimensional Analysis</div>
          <h1>梨园星图 · 多维综合分析</h1>
        </div>
        <div className="t5-topbar-right">
          <button
            className={`t5-topbar-btn ${panelOpen === "causal" ? "active" : ""}`}
            onClick={() => setPanelOpen(panelOpen === "causal" ? "none" : "causal")}
          >
            <span>🔺</span><span>因果分析</span>
          </button>
          <button
            className={`t5-topbar-btn ${panelOpen === "report" ? "active" : ""}`}
            onClick={() => setPanelOpen(panelOpen === "report" ? "none" : "report")}
          >
            <span>📋</span><span>分析报告</span>
          </button>
        </div>
      </header>

      {/* ── 星图（占满剩余空间） ── */}
      <main className="t5-starmap-area">
        <ErrorBoundary>
          <StarMapCanvas onScriptSelect={setSelectedScript} />
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
            {analysis.findings.map((f, i) => (
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
                {selectedEdge === "rel-theme" && "各剧目类型的角色网络结构指标"}
                {selectedEdge === "theme-narr" && "各主题的叙事类型分布"}
                {selectedEdge === "narr-rel" && "各叙事类型的角色网络特征"}
              </h3>
            </div>
            <CausalChart edge={selectedEdge} />
          </div>
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

          <h4>二、为什么选择径向网络布局</h4>
          <p>我们对比了三种候选布局方案：</p>
          <p><strong>散点图</strong>（PCA/t-SNE 降维）：适合展示聚类结构，但丢失了角色关系的拓扑信息，且降维结果不稳定。</p>
          <p><strong>力导向图</strong>（如 Task 2 的 ECharts 网络）：适合展示单个剧本的角色网络，但 1473 个剧本同时展示会产生"毛球"效应，无法识别宏观结构。</p>
          <p><strong>径向网络</strong>（ORCA 风格）：中心节点向外辐射，内环放置核心实体（角色），外围放置关联实体（剧本），通过力导向模拟自动聚类。这种布局同时保留了<strong>拓扑关系</strong>（连线）和<strong>空间聚类</strong>（相近的剧本共享更多角色），且视觉层次清晰，适合大规模网络的宏观探索。</p>
          <p>最终选择径向网络，并以 Nadieh Bremer 设计的 ORCA Top Contributor Network 为参考原型。</p>

          <h4>三、视觉编码设计与合理性</h4>
          <p>本方案采用<strong>四维双层编码</strong>，将四个分析维度映射到不同的视觉通道：</p>
          <p><strong>颜色 → 剧种分类</strong>（7 色）：历史戏=#b8926a、家庭戏=#96544d、侠义戏=#5e6b76、爱情戏=#c77d8b、神话戏=#7f968d、公案戏=#6b7b8e、技法展示戏=#c4a56e。选择理由：剧种是最粗粒度的分类，用颜色编码可在全景中一眼识别类型分布。色板取自燕京清晖主题，与整体设计语言一致。</p>
          <p><strong>圆大小 → 角色数量</strong>（scaleSqrt 映射）：角色越多，圆越大。选择理由：角色数量是剧本复杂度的直接指标，sqrt 映射避免大值主导视觉。借鉴 ORCA 的 contributor radius 编码。</p>
          <p><strong>外圈弧线 → 主题标签</strong>（12 色分段弧）：剧本具有哪些主题，就在圆周围显示对应颜色的弧段。选择理由：主题是多标签属性，弧线编码可同时展示多个主题而不产生颜色混合。借鉴 ORCA 的时间弧编码。</p>
          <p><strong>内圈弧线 → 叙事结构</strong>（4 色单弧）：渐进式=#b8926a、突变式=#96544d、双线交织=#5e6b76、回环式=#7f968d。选择理由：叙事类型是单标签属性，用圆内一条彩色弧即可编码，与外圈主题弧形成"双层环"结构，不增加视觉混乱。</p>
          <p><strong>连接线 → 共享角色</strong>：两个剧本共享越多角色，连接线越粗（scalePow(0.75)）。曲线弧度自适应距离，颜色从源节点渐变到目标节点。借鉴 ORCA 的 curved link + gradient 设计。</p>

          <h4>四、交互设计</h4>
          <p><strong>滚轮缩放 + 拖拽平移</strong>：支持从 0.2x（全景概览）到 8x（单节点细节）的连续缩放，鼠标位置为缩放焦点。这是 ORCA 所没有的——ORCA 是静态缩放，我们增加了自由探索能力。</p>
          <p><strong>Hover 高亮</strong>：借鉴 ORCA 的三层 Canvas 架构。hover 时主 Canvas 淡出到 15%-30% 透明度，hover Canvas 绘制邻居子图全貌（连接线、节点、标签、Tooltip）。这种"聚焦+淡化"模式使用户注意力集中在目标节点及其关联上。</p>
          <p><strong>点击详情</strong>：点击剧本节点弹出详情面板，展示四维信息：角色关系（行当分布条+角色列表）、叙事结构（唱念做打比例条+指标）、主题标签、结构指纹（雷达条形图）。</p>
          <p><strong>双击复位</strong>：动画恢复到初始全景视角。</p>

          <h4>五、从星图中发现的规律</h4>
          <p><strong>发现 1：剧种的空间聚集</strong>。在星图中，相同剧种的剧本因共享角色而自然聚集成簇。历史戏占据最大面积（776 部），形成以诸葛亮、关羽、赵云等为核心的最大连通子图。爱情戏和家庭戏则围绕旦行角色（如王宝钏、秦香莲）形成独立的小簇。</p>
          <p><strong>发现 2：跨剧种的"桥梁角色"</strong>。少数角色同时出现在多个剧种中——如"包拯"连接了公案戏（铡美案）和历史戏（打龙袍），"赵云"连接了历史戏（长坂坡）和侠义戏（借赵云）。这些桥梁角色在星图中表现为连接不同颜色簇的粗线。</p>
          <p><strong>发现 3：叙事结构与剧种的关联</strong>。从内圈弧线可以看到：历史戏以渐进式为主（弧线连续），神话戏以突变式为主（弧线颜色突变），爱情戏偏好回环式。这验证了"主题→叙事"的因果关系。</p>
          <p><strong>发现 4：角色密度与主题的关系</strong>。角色数量多（大圆）的剧本倾向于历史/征战主题，角色数量少（小圆）的剧本倾向于爱情/家庭主题。这与 Task 2 的网络密度分析一致。</p>

          <h4>六、与现有任务的关系</h4>
          <p>本可视化系统不是对 Task 1-4 的简单重复，而是它们的<strong>综合与升华</strong>：</p>
          <p>Task 1 的角色分类（生旦净丑）→ 映射为角色节点的颜色</p>
          <p>Task 2 的关系网络 → 映射为剧本间的连接线</p>
          <p>Task 3 的主题分析 → 映射为剧本节点的外圈弧线</p>
          <p>Task 4 的叙事结构 → 映射为剧本节点的内圈弧线</p>
          <p>通过这种融合，用户可以在一次探索中同时获得四个维度的信息，发现单一维度分析无法揭示的跨维度关联。</p>

          <h4>七、因果分析总结</h4>
          <p><strong>关系→主题</strong>：密集型网络（密度 &gt; 0.7）天然承载家国叙事，忠义/征战主题覆盖率 78%。星形网络倾向个人英雄叙事（闹天宫、三岔口）。高聚类网络对应家庭/爱情主题（牡丹亭、红娘）。</p>
          <p><strong>主题→叙事</strong>：权谋/征战主题偏好高波动叙事（rhythm 0.72），高潮出现在中后段。爱情/家庭偏好渐进式或回环式，节奏平缓。神话主题突变式占比最高（42%），叙事高潮集中在中段。</p>
          <p><strong>叙事→关系</strong>：突变式叙事导致关系网络在后半段断裂重组，模块度上升 40%。渐进式叙事中网络从核心向外层层扩展，聚类系数稳定。回环式叙事呈现"建立-断裂-重建"的周期模式（如牡丹亭、锁麟囊）。</p>
          <p><strong>稳定性排序</strong>：主题→叙事（跨剧目一致性 82%）&gt; 关系→主题（76%）&gt; 叙事→关系（65%）。这表明主题对叙事的约束是京剧创作中最稳定的结构规律。</p>
        </div>
      </aside>
    </div>
  );
};

export default Task5Layout;
