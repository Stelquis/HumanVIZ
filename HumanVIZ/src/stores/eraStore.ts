import { create } from "zustand";

interface EraState {
  selectedEra: number | null;
  hoveredEra: number | null;
  setSelectedEra: (era: number | null) => void;
  setHoveredEra: (era: number | null) => void;
}

export const useEraStore = create<EraState>((set) => ({
  selectedEra: null,
  hoveredEra: null,
  setSelectedEra: (era) => set({ selectedEra: era }),
  setHoveredEra: (era) => set({ hoveredEra: era }),
}));
