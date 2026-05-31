import React from "react";
import { dashStore } from "../../stores/dashStore";
import "./LeftSidebar.scss";

const NAV_ITEMS = [
  { view: "overview" as const, icon: "🎭", label: "梨园万象", title: "主界面 — 梨园万象" },
  { view: "task1" as const, icon: "🎪", label: "行当推断", title: "Task 1 — 行当推断" },
  { view: "task2" as const, icon: "🕸️", label: "角色关系", title: "Task 2 — 角色关系" },
  { view: "task3" as const, icon: "📜", label: "主题结构", title: "Task 3 — 主题结构" },
  { view: "task4" as const, icon: "🎬", label: "叙事分析", title: "Task 4 — 叙事分析" },
  { view: "task5" as const, icon: "🔗", label: "综合关联", title: "Task 5 — 综合关联" },
];

const LeftSidebar: React.FC = () => {
  const { currentView, setCurrentView } = dashStore();

  return (
    <nav className="main-left-sidebar">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.view}
          className={`sidebar-nav-btn ${currentView === item.view ? "active" : ""}`}
          onClick={() => setCurrentView(item.view)}
          title={item.title}
        >
          <span className="sidebar-nav-icon">{item.icon}</span>
          <span className="sidebar-nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
};

export default LeftSidebar;
