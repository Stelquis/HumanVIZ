import { create } from "zustand";

interface Task3State {
  /** Bubble Matrix 点选的主题 */
  selectedTheme: string | null;
  /** Bubble Matrix 点选的类型 */
  selectedGenre: string | null;
  /** Chord 图 hover 的共现主题对 */
  highlightedPair: [string, string] | null;
  /** 左侧 Archetype 卡片选中的原型 id */
  archetypeFilter: string | null;
  /** Era Stream 选中的来源时代 */
  eraFilter: string | null;
  /** Bubble Matrix 点选的覆盖率值 */
  selectedCoverage: number | null;
  /** 视图切换 */
  mainView: "heatmap" | "chord" | "combo" | "stream";
  /** 气泡矩阵阈值 (0-100) */
  bubbleThreshold: number;
}

interface Task3Actions {
  setSelectedTheme: (theme: string | null) => void;
  setSelectedGenre: (genre: string | null) => void;
  selectCell: (theme: string, genre: string, coverage: number) => void;
  setHighlightedPair: (pair: [string, string] | null) => void;
  setArchetypeFilter: (id: string | null) => void;
  setEraFilter: (era: string | null) => void;
  setMainView: (view: Task3State["mainView"]) => void;
  setBubbleThreshold: (t: number) => void;
  clearSelection: () => void;
}

export const useTask3Store = create<Task3State & Task3Actions>((set) => ({
  selectedTheme: null,
  selectedGenre: null,
  highlightedPair: null,
  archetypeFilter: null,
  eraFilter: null,
  selectedCoverage: null,
  mainView: "heatmap",
  bubbleThreshold: 0,

  setSelectedTheme: (theme) => set({ selectedTheme: theme }),
  setSelectedGenre: (genre) => set({ selectedGenre: genre }),
  selectCell: (theme, genre, coverage) =>
    set({ selectedTheme: theme, selectedGenre: genre, selectedCoverage: coverage }),
  setHighlightedPair: (pair) => set({ highlightedPair: pair }),
  setArchetypeFilter: (id) => set({ archetypeFilter: id }),
  setEraFilter: (era) => set({ eraFilter: era }),
  setMainView: (view) => set({ mainView: view }),
  setBubbleThreshold: (t) => set({ bubbleThreshold: t }),
  clearSelection: () =>
    set({
      selectedTheme: null,
      selectedGenre: null,
      selectedCoverage: null,
      highlightedPair: null,
    }),
}));
