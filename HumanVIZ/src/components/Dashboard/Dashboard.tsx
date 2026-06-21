import React, { useState } from "react";
import ChinaVISOverviewModal from "../Modals/ChinaVISOverviewModal";
import LeftSidebar from "./LeftSidebar";
import LiyuanOverview from "../Liyuan/LiyuanOverview";
import Task1Layout from "../TaskViews/Task1Layout";
import Task2Network from "../TaskViews/Task2Network";
import Task2Fingerprint from "../TaskViews/Task2Fingerprint";
import Task2SpaceMap from "../TaskViews/Task2SpaceMap";
import Task2Profile from "../TaskViews/Task2Profile";
import Task4Layout from "../TaskViews/Task4Layout";
import Task3Layout from "../TaskViews/Task3Layout";
import Task5Layout from "../TaskViews/Task5Layout";
import { ReportContent, FindingsContent, MetricsTab } from "../TaskViews/Task2ReportContent";
import { dashStore } from "../../stores/dashStore";
import { TASK2_SUB_VIEW_LABELS } from "../../types/task2";
import type { Task2SubView } from "../../types/task2";
import "./Dashboard.scss";
import "../TaskViews/Task2Layout.scss";

const TASK_PLACEHOLDER: Record<string, { title: string; question: string }> = {};

/** Simple error boundary to prevent white screen on component crash */
class TaskErrorBoundary extends React.Component<
  { children: React.ReactNode; taskName: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; taskName: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[${this.props.taskName}] crashed:`, error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: "40px", textAlign: "center", color: "var(--theme-wood, #5E4B3A)",
          background: "var(--theme-paper, #f6f1e7)", borderRadius: 16, margin: 16,
        }}>
          <h2 style={{ fontFamily: '"PT Serif", "Noto Serif SC", serif', fontSize: 20, marginBottom: 12 }}>
            {this.props.taskName} 加载失败
          </h2>
          <p style={{ fontSize: 14, color: "var(--theme-text-soft, #8E8A84)", marginBottom: 8 }}>
            渲染组件时发生错误，请刷新页面重试。
          </p>
          <details style={{ fontSize: 12, color: "#96544d", maxWidth: 600, margin: "0 auto", textAlign: "left" }}>
            <summary>错误详情</summary>
            <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>
              {this.state.error?.message}
              {"\n\n"}
              {this.state.error?.stack}
            </pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Task2 子视图占位组件（Phase 2-4 将替换为真实页面） */
const Task2SubViewPlaceholder: React.FC<{ view: Task2SubView }> = ({ view }) => (
  <div style={{
    display: "flex", alignItems: "center", justifyContent: "center",
    height: "100%", minHeight: 400,
    background: "var(--theme-paper, #f6f1e7)", borderRadius: 16, margin: 16,
    flexDirection: "column", gap: 12,
  }}>
    <span style={{ fontSize: 48 }}>🚧</span>
    <h2 style={{
      fontFamily: '"PT Serif", "Noto Serif SC", serif',
      fontSize: 20, color: "var(--theme-wood, #5E4B3A)", margin: 0,
    }}>
      {TASK2_SUB_VIEW_LABELS[view]}
    </h2>
    <p style={{ fontSize: 14, color: "var(--theme-text-soft, #8E8A84)", margin: 0 }}>
      此模块将在后续 Phase 中构建
    </p>
  </div>
);

/** Task2 子导航配置 */
const TASK2_NAV_ITEMS: { view: Task2SubView; icon: string; label: string }[] = [
  { view: "network",     icon: "🕸️", label: "角色关系网络" },
  { view: "fingerprint", icon: "🧬", label: "类型拓扑指纹" },
  { view: "spacemap",    icon: "🗺️", label: "结构空间地图" },
  { view: "profile",     icon: "🔬", label: "互动剖面解码" },
];

/** Task2 子页面路由：根据 task2SubView 渲染对应页面 */
const REPORT_TAB_LABELS: { id: string; icon: string; label: string }[] = [
  { id: "report", icon: "📋", label: "流程报告" },
  { id: "findings", icon: "💡", label: "典型发现" },
  { id: "metrics", icon: "📊", label: "指标对比" },
];

const Task2Router: React.FC = () => {
  const { task2SubView, setTask2SubView } = dashStore();
  const [reportSidebarOpen, setReportSidebarOpen] = useState(false);
  const [reportTab, setReportTab] = useState<string>("report");

  const reportContent = (() => {
    switch (reportTab) {
      case "report": return <ReportContent />;
      case "findings": return <FindingsContent />;
      case "metrics": return <MetricsTab />;
      default: return <ReportContent />;
    }
  })();

  const content = (() => {
    switch (task2SubView) {
      case "network":
        return <Task2Network />;
      case "fingerprint":
        return <Task2Fingerprint />;
      case "spacemap":
        return <Task2SpaceMap />;
      case "profile":
        return <Task2Profile />;
      default:
        return <Task2Network />;
    }
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", padding: 12, gap: 8 }}>
      {/* Task2 顶栏 — 与 Task1Layout 格式一致（左右与下方面内容对齐） */}
      <header className="t2-topbar" style={{ flexShrink: 0 }}>
        <div className="t2-topbar-title-group">
          <h1>
            <span className="t2-brand-icon">🕸️</span> 角色关系网络与结构分析
          </h1>
          <span className="t2-topbar-desc">
            识别主要角色互动关系，构建关系网络 — 分析不同剧目类型中的关系结构特征与演化规律
          </span>
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

      {/* Sub-navigation bar */}
      <nav style={{
        display: "flex", gap: 4, padding: "4px 0 0",
        flexShrink: 0, flexWrap: "wrap",
      }}>
        {TASK2_NAV_ITEMS.map((item) => (
          <button
            key={item.view}
            onClick={() => setTask2SubView(item.view)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "7px 14px",
              border: task2SubView === item.view
                ? "1px solid rgba(180,155,120,0.35)"
                : "1px solid transparent",
              borderRadius: 8,
              background: task2SubView === item.view
                ? "rgba(246,239,224,0.85)"
                : "transparent",
              cursor: "pointer",
              fontSize: 12,
              fontFamily: '"Noto Serif SC","PT Serif",serif',
              color: task2SubView === item.view
                ? "var(--theme-wood, #4a3424)"
                : "var(--theme-text-soft, #8b7355)",
              fontWeight: task2SubView === item.view ? 600 : 400,
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
            title={item.label}
          >
            <span style={{ fontSize: 14 }}>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Page content */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {content}
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

const Dashboard: React.FC = () => {
  const { currentView } = dashStore();

  return (
    <div className="dashboard-layout">
      <LeftSidebar />

      <div className="dashboard-main">
        {currentView === "overview" ? (
          <LiyuanOverview />
        ) : currentView === "task1" ? (
          <Task1Layout />
        ) : currentView === "task2" ? (
          <TaskErrorBoundary taskName="角色关系">
            <Task2Router />
          </TaskErrorBoundary>
        ) : currentView === "task3" ? (
          <Task3Layout />
        ) : currentView === "task4" ? (
          <TaskErrorBoundary taskName="叙事分析">
            <Task4Layout />
          </TaskErrorBoundary>
        ) : currentView === "task5" ? (
          <Task5Layout />
        ) : (
          <div className="data-overview-inline">
            <div className="data-overview-inline-header">
              <h2>{TASK_PLACEHOLDER[currentView]?.title}</h2>
            </div>
            <div className="task-placeholder" style={{ padding: "40px", textAlign: "center", color: "#888" }}>
              <p style={{ fontSize: "18px", marginBottom: "16px" }}>此板块内容正在建设中，敬请期待。</p>
              <p style={{ fontSize: "14px" }}>{TASK_PLACEHOLDER[currentView]?.question}</p>
            </div>
          </div>
        )}
      </div>

      <ChinaVISOverviewModal />
    </div>
  );
};

export default Dashboard;
