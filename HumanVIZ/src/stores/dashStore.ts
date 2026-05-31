import { create } from "zustand";
import { DIMENSIONS } from "../data/dynasties";

interface IDashStore {
  // 朝代选择
  selectedDynasty: string | null;
  setSelectedDynasty: (val: string | null) => void;
  hoveredDynasty: string | null;
  setHoveredDynasty: (val: string | null) => void;

  // 数据维度筛选
  activeDimensions: string[];
  toggleDimension: (id: string) => void;
  setActiveDimensions: (ids: string[]) => void;

  // 时间轴
  currentYear: number;
  setCurrentYear: (val: number) => void;
  isPlaying: boolean;
  setIsPlaying: (val: boolean) => void;
  playSpeed: number;
  setPlaySpeed: (val: number) => void;

  // 事件/人物选择
  selectedEvent: string | null;
  setSelectedEvent: (val: string | null) => void;
  hoveredEvent: string | null;
  setHoveredEvent: (val: string | null) => void;
  selectedFigure: string | null;
  setSelectedFigure: (val: string | null) => void;

  // ChinaVIS概览弹窗
  overviewModalOpened: boolean;
  setOverviewModalOpened: (val: boolean) => void;

  // 数据概览弹窗
  dataOverviewOpened: boolean;
  setDataOverviewOpened: (val: boolean) => void;

  // 当前视图: overview（主界面）| task1~5（五个研究板块）
  currentView: "overview" | "task1" | "task2" | "task3" | "task4" | "task5";
  setCurrentView: (val: "overview" | "task1" | "task2" | "task3" | "task4" | "task5") => void;

  // 重置
  resetDashboard: () => void;
}

// 默认激活的维度（自然环境 + 军事事件类别）
const defaultActiveDimensions = DIMENSIONS.filter(
  (d) => d.category === "nature" || d.category === "military"
).map((d) => d.id);

const initialState = {
  selectedDynasty: null as string | null,
  hoveredDynasty: null as string | null,
  activeDimensions: defaultActiveDimensions,
  currentYear: -6000,
  isPlaying: false,
  playSpeed: 50, // 每秒 50 年
  selectedEvent: null as string | null,
  hoveredEvent: null as string | null,
  selectedFigure: null as string | null,
  overviewModalOpened: false,
  dataOverviewOpened: false,
  currentView: "overview" as "overview",
};

export const dashStore = create<IDashStore>()((set) => ({
  ...initialState,

  setSelectedDynasty: (val) => set({ selectedDynasty: val }),
  setHoveredDynasty: (val) => set({ hoveredDynasty: val }),

  toggleDimension: (id) =>
    set((state) => ({
      activeDimensions: state.activeDimensions.includes(id)
        ? state.activeDimensions.filter((d) => d !== id)
        : [...state.activeDimensions, id],
    })),
  setActiveDimensions: (ids) => set({ activeDimensions: ids }),

  setCurrentYear: (val) => set({ currentYear: val }),
  setIsPlaying: (val) => set({ isPlaying: val }),
  setPlaySpeed: (val) => set({ playSpeed: val }),

  setSelectedEvent: (val) => set({ selectedEvent: val }),
  setHoveredEvent: (val) => set({ hoveredEvent: val }),
  setSelectedFigure: (val) => set({ selectedFigure: val }),

  setOverviewModalOpened: (val) => set({ overviewModalOpened: val }),
  setDataOverviewOpened: (val) => set({ dataOverviewOpened: val }),

  setCurrentView: (val) => set({ currentView: val }),

  resetDashboard: () => set(initialState),
}));
