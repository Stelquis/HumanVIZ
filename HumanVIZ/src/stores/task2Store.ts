import { create } from "zustand";
import type { DramaType } from "../types/task2";

/* ================================================================
   各类型默认剧目 — 关羽优先，无则名著
   ================================================================ */
export const DEFAULT_PLAYS: Record<DramaType, number> = {
  历史戏: 6875,   // 走麦城 — 关羽，56角色，类型内最大关羽剧
  家庭戏: 6749,   // 大观园 — 44角色
  侠义戏: 6240,   // 关羽
  爱情戏: 6756,   // 黛玉焚稿 — 17角色67边
  神话戏: 6025,   // 关羽, 关平
  公案戏: 6299,   // 狸猫换太子
  技法展示戏: 6888, // 挑滑车
};

/* ================================================================
   Task2Store — 角色关系网络全局共享状态

   跨 4 页共享的状态：
   - Page 1 (网络): selectedType, selectedPlayEntityId, selectedRole, showCoreOnly, showNeutralEdges
   - Page 2 (指纹): selectedType
   - Page 3 (地图): selectedType, selectedPlayEntityId (跨页跳转)
   - Page 4 (剖面): selectedType, selectedPlayEntityId
   ================================================================ */

interface Task2State {
  /** 当前选中的剧目类型（跨所有页面同步） */
  selectedType: DramaType;

  /** 当前选中的角色名（网络页 ego-network 中心 / 剖面页高亮） */
  selectedRole: string | null;

  /** 自我中心网络面板是否展开 */
  egoPanelOpen: boolean;

  /** 当前网络视图中的活跃剧本 entity_id */
  selectedPlayEntityId: number | null;

  /** k-core 核心圈层筛选开关 */
  showCoreOnly: boolean;

  /** 中立边显示开关 */
  showNeutralEdges: boolean;
}

interface Task2Actions {
  setSelectedType: (t: DramaType) => void;
  selectRole: (role: string) => void;
  toggleEgoPanel: () => void;
  closeEgoPanel: () => void;
  setSelectedPlayEntityId: (id: number | null) => void;
  setShowCoreOnly: (val: boolean) => void;
  setShowNeutralEdges: (val: boolean) => void;

  /** 重置类型：清除角色选择、关闭面板 */
  resetForTypeChange: (t: DramaType) => void;
}

export const useTask2Store = create<Task2State & Task2Actions>((set) => ({
  // ── State ──
  selectedType: "历史戏",
  selectedRole: null,
  egoPanelOpen: false,
  selectedPlayEntityId: null,
  showCoreOnly: true,
  showNeutralEdges: true,

  // ── Actions ──
  setSelectedType: (t) =>
    set({
      selectedType: t,
      // 切换类型时不清除 selectedPlayEntityId — 让各页面自行响应
    }),

  selectRole: (role) => set({ selectedRole: role, egoPanelOpen: true }),

  toggleEgoPanel: () => set((s) => ({ egoPanelOpen: !s.egoPanelOpen })),

  closeEgoPanel: () => set({ egoPanelOpen: false }),

  setSelectedPlayEntityId: (id) => set({ selectedPlayEntityId: id }),

  setShowCoreOnly: (val) => set({ showCoreOnly: val }),

  setShowNeutralEdges: (val) => set({ showNeutralEdges: val }),

  resetForTypeChange: (t) =>
    set({
      selectedType: t,
      selectedRole: null,
      egoPanelOpen: false,
      selectedPlayEntityId: null,
    }),
}));
