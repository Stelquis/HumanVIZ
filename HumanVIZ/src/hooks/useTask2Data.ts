import { useEffect, useMemo, useState, useCallback } from "react";
import p2data from "../data/network-data.json";
import charRoleMap from "../data/char-role-map.json";
import mainCharsData from "../data/task2-main-characters.json";
import { DEFAULT_PLAYS } from "../stores/task2Store";
import type {
  NetworkDataRoot,
  PlayNetwork,
  NetworkNode,
  NetworkEdge,
  DramaType,
  PlayIndexEntry,
  MainCharacterPlay,
} from "../types/task2";
import { DRAMA_TYPES } from "../types/task2";

/* ================================================================
   useTask2Data — Task2 全局数据访问 Hook

   封装所有 network-data.json 的读取、派生计算、和动态加载逻辑。
   每个 Task2 子页面通过此 hook 获取所需数据，避免重复导入和计算。
   ================================================================ */

const data = p2data as unknown as NetworkDataRoot;
const charRole: Record<string, string> = charRoleMap as Record<string, string>;

/* ── K-Core 分解算法 ── */
export function computeKCore(
  nodes: NetworkNode[] | { name: string; n?: string }[],
  edges: NetworkEdge[] | { source: string; target: string; s?: string; t?: string }[],
): Map<string, number> {
  const adj = new Map<string, Set<string>>();
  const nodeNames = new Set<string>();
  for (const n of nodes) {
    const nm = (n as any).name || (n as any).n || "";
    if (nm) {
      adj.set(nm, new Set());
      nodeNames.add(nm);
    }
  }
  for (const e of edges) {
    const s = (e as any).source || (e as any).s || "";
    const t = (e as any).target || (e as any).t || "";
    if (nodeNames.has(s) && nodeNames.has(t) && s !== t) {
      adj.get(s)!.add(t);
      adj.get(t)!.add(s);
    }
  }
  const deg = new Map<string, number>();
  for (const [nm, nb] of adj) deg.set(nm, nb.size);
  const core = new Map<string, number>();
  let k = 0;
  const rem = new Set(nodeNames);
  while (rem.size > 0) {
    k++;
    let changed = true;
    while (changed) {
      changed = false;
      for (const nm of [...rem]) {
        if ((deg.get(nm) || 0) < k) {
          for (const nb of adj.get(nm) || []) {
            if (rem.has(nb)) deg.set(nb, Math.max(0, (deg.get(nb) || 1) - 1));
          }
          rem.delete(nm);
          core.set(nm, k - 1);
          changed = true;
        }
      }
    }
  }
  for (const nm of rem) core.set(nm, k - 1);
  return core;
}

/* ── 全局动态网络缓存（跨组件共享，避免重复加载）── */
const globalPlayCache = new Map<number, PlayNetwork>();
let globalCacheVersion = 0;
const cacheListeners = new Set<() => void>();

function bumpCache() {
  globalCacheVersion++;
  cacheListeners.forEach((fn) => fn());
}

export function useTask2Data(selectedType: DramaType) {
  /* ── 订阅全局缓存版本 ── */
  const [cacheVersion, setCacheVersion] = useState(globalCacheVersion);
  const [allPlaysLoading, setAllPlaysLoading] = useState(false);

  useEffect(() => {
    const listener = () => setCacheVersion(globalCacheVersion);
    cacheListeners.add(listener);
    return () => { cacheListeners.delete(listener); };
  }, []);

  /* ── 主要角色查找表 (entity_id → main character names) ── */
  const mainCharsMap = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const p of (mainCharsData as { plays: MainCharacterPlay[] }).plays) {
      m.set(p.entity_id, p.main_characters || []);
    }
    return m;
  }, []);

  /* ── 全量剧本列表（按类型筛选，按节点数降序）── */
  const allPlaysList = useMemo(() => {
    const idx: PlayIndexEntry[] = data.play_index || [];
    return idx
      .filter((p) => p.genre === selectedType)
      .sort((a, b) => (b.node_count || 0) - (a.node_count || 0));
  }, [selectedType]);

  /* ── 代表性网络（快速展示）── */
  const repNets: PlayNetwork[] = (data.rep_networks[selectedType] || []) as PlayNetwork[];
  const repNetsById = useMemo(() => {
    const m = new Map<number, PlayNetwork>();
    repNets.forEach((n) => {
      if (n.entity_id) m.set(n.entity_id, n);
    });
    return m;
  }, [repNets]);

  /* ── 动态加载剧本网络 ── */
  const loadPlayNetwork = useCallback(
    async (entityId: number): Promise<PlayNetwork | null> => {
      if (repNetsById.has(entityId)) return repNetsById.get(entityId)!;
      if (globalPlayCache.has(entityId))
        return globalPlayCache.get(entityId)!;
      setAllPlaysLoading(true);
      try {
        const { default: allData } = await import(
          "../data/task2-play-networks.json"
        );
        for (const [key, val] of Object.entries(allData)) {
          const eid = Number(key);
          if (globalPlayCache.has(eid)) continue;
          const c = val as any;
          const nodes: NetworkNode[] = (c.no || []).map((n: any) => ({
            name: n.n,
            degree: n.d || 0,
            scene_count: n.sc || 0,
            role_type: n.r || "其他",
            dialogue_count: n.sc || 0,
            betweenness: 0,
          }));
          const edges: NetworkEdge[] = (c.ed || []).map((e: any) => ({
            source: e.s,
            target: e.t,
            weight: e.w || 1,
            relation_type: e.rl || "中立",
            micro_type: "",
            source_tag: "unknown",
          }));
          globalPlayCache.set(eid, {
            entity_id: eid,
            title: c.ti,
            genre: c.ge,
            total_characters: c.nc,
            total_edges: c.ec,
            structure_label: "分散型",
            nodes,
            edges,
          });
        }
        setAllPlaysLoading(false);
        bumpCache();
        return globalPlayCache.get(entityId) || null;
      } catch (e) {
        setAllPlaysLoading(false);
        return null;
      }
    },
    [repNetsById],
  );

  /* ── 获取当前网络：默认剧目优先 → repNets → 动态缓存 ── */
  const getCurrentNetwork = useCallback(
    (entityId: number | null): PlayNetwork | null => {
      void cacheVersion;
      try {
        // entityId 为 null 时：先尝试当前类型的默认剧目
        if (entityId == null) {
          const defaultId = DEFAULT_PLAYS[selectedType];
          const defaultNet = repNetsById.get(defaultId);
          if (defaultNet) return defaultNet;
          // 默认不在 repNets → 取第一个 repNet 兜底
          const nets = repNets;
          return (nets && nets.length > 0) ? (nets[0] ?? null) : null;
        }
        const fromRep = repNetsById.get(entityId);
        if (fromRep) return fromRep;
        const cached = globalPlayCache.get(entityId);
        if (cached) return cached;
        return null;
      } catch {
        return null;
      }
    },
    [repNets, repNetsById, cacheVersion, selectedType],
  );

  /* ── Top plays（用于侧边栏展示）── */
  const topPlays = useMemo(() => {
    return allPlaysList.filter((p) => (p.edge_count || 0) > 4).slice(0, 10);
  }, [allPlaysList]);

  /* ── 类型数据 ── */
  const typeData = data.type_means[selectedType] || null;

  return {
    /* 原始数据 */
    data,
    charRole,

    /* 类型信息 */
    typeData,
    typeOrder: DRAMA_TYPES as unknown as DramaType[],

    /* 剧本列表 */
    allPlaysList,
    topPlays,
    repNets,
    repNetsById,
    allPlaysLoading,

    /* 网络加载 */
    loadPlayNetwork,
    getCurrentNetwork,
    cacheVersion,

    /* 角色映射 */
    mainCharsMap,
  };
}
