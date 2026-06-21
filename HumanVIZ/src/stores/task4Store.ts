import { create } from "zustand";

export type Task4MainView = "single" | "multi";

/** ⑩ 分析视角：控制右侧辅助面板的内容组合 */
export type Task4AnalysisMode = "structure" | "character" | "rhythm" | "compare";

interface Task4State {
  /** Single-selected narrative type ID (user-facing type ID from NARRATIVE_TYPE_CONFIG). null = all types */
  selectedNarrType: string | null;
  /** Current view mode */
  mainView: Task4MainView;
  /** ⑩ Current analysis perspective */
  analysisMode: Task4AnalysisMode;
  /** Keys of plays selected for multi-play comparison overlay */
  multiCompareKeys: string[];
  /** Cross-linking: highlighted scene index (from chart hover/click) */
  highlightedSceneIndex: number | null;
  /** Cross-linking: highlighted character name (from network hover/click) */
  highlightedCharacter: string | null;
}

interface Task4Actions {
  setSelectedNarrType: (typeId: string | null) => void;
  setMainView: (view: Task4MainView) => void;
  /** ⑩ Set analysis mode; 'compare' auto-switches mainView to multi */
  setAnalysisMode: (mode: Task4AnalysisMode) => void;
  toggleCompareKey: (key: string) => void;
  clearCompareKeys: () => void;
  /** Cross-linking actions */
  setHighlightedSceneIndex: (idx: number | null) => void;
  setHighlightedCharacter: (name: string | null) => void;
}

export const useTask4Store = create<Task4State & Task4Actions>((set) => ({
  selectedNarrType: null,
  mainView: "single",
  analysisMode: "structure",
  multiCompareKeys: [],
  highlightedSceneIndex: null,
  highlightedCharacter: null,

  setSelectedNarrType: (typeId) => set({ selectedNarrType: typeId }),
  setMainView: (view) => set({ mainView: view }),
  setAnalysisMode: (mode) =>
    set((s) => ({
      analysisMode: mode,
      mainView: mode === "compare" ? "multi" : s.mainView,
    })),
  toggleCompareKey: (key) =>
    set((s) => {
      const exists = s.multiCompareKeys.includes(key);
      const next = exists
        ? s.multiCompareKeys.filter((k) => k !== key)
        : s.multiCompareKeys.length < 3
          ? [...s.multiCompareKeys, key]
          : s.multiCompareKeys;
      return { multiCompareKeys: next, mainView: next.length >= 2 ? "multi" : s.mainView };
    }),
  clearCompareKeys: () => set({ multiCompareKeys: [], mainView: "single" }),
  setHighlightedSceneIndex: (idx) => set({ highlightedSceneIndex: idx }),
  setHighlightedCharacter: (name) => set({ highlightedCharacter: name }),
}));
