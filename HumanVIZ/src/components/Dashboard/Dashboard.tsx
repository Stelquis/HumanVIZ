import React from "react";
import ChinaVISOverviewModal from "../Modals/ChinaVISOverviewModal";
import LeftSidebar from "./LeftSidebar";
import LiyuanOverview from "../Liyuan/LiyuanOverview";
import Task1Layout from "../TaskViews/Task1Layout";
import Task4Layout from "../TaskViews/Task4Layout";
import Task2Layout from "../TaskViews/Task2Layout";
import Task3Layout from "../TaskViews/Task3Layout";
import Task5Layout from "../TaskViews/Task5Layout";
import { dashStore } from "../../stores/dashStore";
import "./Dashboard.scss";

const TASK_PLACEHOLDER: Record<string, { title: string; question: string }> = {};

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
          <Task2Layout />
        ) : currentView === "task3" ? (
          <Task3Layout />
        ) : currentView === "task4" ? (
          <Task4Layout />
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
