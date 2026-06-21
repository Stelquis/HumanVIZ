import { create } from "zustand";
import type { Task2SubView } from "../types/task2";

interface IDashStore {
  // ChinaVIS概览弹窗
  overviewModalOpened: boolean;
  setOverviewModalOpened: (val: boolean) => void;

  // 当前视图: overview（主界面）| task1~5（五个研究板块）
  currentView: "overview" | "task1" | "task2" | "task3" | "task4" | "task5";
  setCurrentView: (val: "overview" | "task1" | "task2" | "task3" | "task4" | "task5") => void;

  // Task2 子视图路由（4 页体系：network | fingerprint | spacemap | profile）
  task2SubView: Task2SubView;
  setTask2SubView: (val: Task2SubView) => void;
}

const initialState = {
  overviewModalOpened: false,
  currentView: "overview" as "overview",
  task2SubView: "network" as Task2SubView,
};

export const dashStore = create<IDashStore>()((set) => ({
  ...initialState,

  setOverviewModalOpened: (val) => set({ overviewModalOpened: val }),

  setCurrentView: (val) => set({ currentView: val }),

  setTask2SubView: (val) => set({ task2SubView: val }),
}));
