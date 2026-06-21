import { create } from "zustand";

interface EraState {
  hoveredEra: number | null;
  hoveredRole: string | null;
  setHoveredEra: (era: number | null) => void;
  setHoveredRole: (role: string | null) => void;
}

export const useEraStore = create<EraState>((set) => ({
  hoveredEra: null,
  hoveredRole: null,
  setHoveredEra: (era) => set({ hoveredEra: era }),
  setHoveredRole: (role) => set({ hoveredRole: role }),
}));
