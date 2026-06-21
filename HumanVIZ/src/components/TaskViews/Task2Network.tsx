import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as echarts from "echarts";
import "./Task2Layout.scss";
import CircleEgoGraph from "./CircleEgoGraph";
import CircleInfoPanel from "./CircleInfoPanel";
import { useTask2Store, DEFAULT_PLAYS } from "../../stores/task2Store";
import { useTask2Data, computeKCore } from "../../hooks/useTask2Data";
import type { DramaType, PlayNetwork } from "../../types/task2";
import {
  DRAMA_TYPES,
  TYPE_COLORS,
  ROLE_COLORS,
  EDGE_RELATION_COLORS,
  EDGE_RELATION_LABELS,
  INK_DARK,
  INK_WARM,
  INK_SOFT,
  PAPER_BG,
  GOLD_NODE,
  DEFAULT_ROLE_COLOR,
  FONT_SERIF,
} from "../../types/task2";

/* ================================================================
   Task2Network — Page 1: 角色关系网络

   单剧深潜的"显微镜"视图：
   - ECharts 力导向图（古籍卷轴风格，行当着色）
   - 左侧：类型选择 + 核心指标 + 主要角色 + 枢纽角色
   - 右侧：CircleEgoGraph 自我中心网络 + CircleInfoPanel
   - 剧本选择器 + 中立边切换 + K-Core 圈层筛选
   ================================================================ */

const AMBER_GLOW = "rgba(180,130,80,0.28)";

/** hex → rgba 转换辅助函数 */
function hexToRgba(hex: string, alpha: number): string {
  if (!hex.startsWith("#")) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const Task2Network: React.FC = () => {
  /* ── Store ── */
  const {
    selectedType,
    selectedRole,
    selectedPlayEntityId,
    showCoreOnly,
    showNeutralEdges,
    selectRole,
    setSelectedType,
    setSelectedPlayEntityId,
    setShowCoreOnly,
    setShowNeutralEdges,
  } = useTask2Store();

  /* ── Data ── */
  const {
    data,
    charRole,
    typeData,
    allPlaysList,
    repNets,
    repNetsById,
    allPlaysLoading,
    loadPlayNetwork,
    getCurrentNetwork,
    cacheVersion,
    mainCharsMap,
  } = useTask2Data(selectedType);

  /* ── Local UI state ── */
  const [playDropdownOpen, setPlayDropdownOpen] = useState(false);
  const [playSearch, setPlaySearch] = useState("");
  const playDropdownRef = useRef<HTMLDivElement>(null);

  /* ── Refs ── */
  const networkRef = useRef<HTMLDivElement>(null);

  /* ── 获取当前网络 ── */
  const currentNet: PlayNetwork | null = useMemo(
    () => getCurrentNetwork(selectedPlayEntityId),
    [getCurrentNetwork, selectedPlayEntityId, cacheVersion],
  );

  /* ── 类型切换 → 加载默认剧目 ── */
  const switchToDefaultPlay = useCallback(
    async (type: DramaType) => {
      const defaultId = DEFAULT_PLAYS[type];
      // 先查缓存/repNets
      if (getCurrentNetwork(defaultId)) {
        setSelectedPlayEntityId(defaultId);
        return;
      }
      // 动态加载
      const net = await loadPlayNetwork(defaultId);
      if (net) {
        setSelectedPlayEntityId(defaultId);
      } else {
        // 加载失败 → fallback 到 repNets 或列表首个
        const firstRep = repNets[0];
        if (firstRep) {
          setSelectedPlayEntityId(firstRep.entity_id);
        } else {
          const first = allPlaysList[0];
          if (first) {
            setSelectedPlayEntityId(first.entity_id);
            loadPlayNetwork(first.entity_id);
          }
        }
      }
    },
    [getCurrentNetwork, loadPlayNetwork, repNets, allPlaysList, setSelectedPlayEntityId],
  );

  /* ── 类型变化时自动切换到默认剧目 ── */
  useEffect(() => {
    switchToDefaultPlay(selectedType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType]);

  /* ── Play dropdown 外部点击关闭 ── */
  useEffect(() => {
    if (!playDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (playDropdownRef.current && !playDropdownRef.current.contains(e.target as Node)) {
        setPlayDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [playDropdownOpen]);

  /* ── 筛选剧本列表（搜索）── */
  const filteredAllPlays = useMemo(() => {
    if (!playSearch) return allPlaysList;
    const q = playSearch.toLowerCase();
    return allPlaysList.filter((p) => (p.title || "").toLowerCase().includes(q));
  }, [allPlaysList, playSearch]);

  /* ── 侧边栏可展示的剧本 ── */
  const handleSelectPlay = useCallback(
    async (entityId: number) => {
      setSelectedPlayEntityId(entityId);
      setPlayDropdownOpen(false);
      setPlaySearch("");
      // 确保网络已加载
      if (!repNetsById.has(entityId)) {
        await loadPlayNetwork(entityId);
      }
    },
    [setSelectedPlayEntityId, repNetsById, loadPlayNetwork],
  );

  /* ── K-Core 核心圈层 ── */
  const coreData = useMemo(() => {
    if (!currentNet || !currentNet.nodes) {
      return { maxK: 0, coreMap: new Map<string, number>(), maxCoreSet: new Set<string>() };
    }
    const cm = computeKCore(currentNet.nodes, currentNet.edges || []);
    let maxK = 0;
    for (const k of cm.values()) maxK = Math.max(maxK, k);
    return {
      maxK,
      coreMap: cm,
      maxCoreSet: new Set(
        [...cm.entries()].filter(([, k]) => k >= maxK).map(([n]) => n),
      ),
    };
  }, [currentNet]);

  /* ── 枢纽角色 ── */
  const hubChars = useMemo(() => {
    if (!currentNet || !currentNet.nodes) return [];
    const charConnections = new Map<string, { count: number; totalWeight: number }>();
    (currentNet.edges || []).forEach((e) => {
      [e.source, e.target].forEach((name) => {
        const prev = charConnections.get(name) || { count: 0, totalWeight: 0 };
        prev.count += 1;
        prev.totalWeight += e.weight || 0;
        charConnections.set(name, prev);
      });
    });
    let candidates = (currentNet.nodes || [])
      .filter((n) => {
        const c = charConnections.get(n.name);
        return c && c.count > 0;
      })
      .sort((a, b) => {
        const ca = charConnections.get(a.name) || { count: 0, totalWeight: 0 };
        const cb = charConnections.get(b.name) || { count: 0, totalWeight: 0 };
        return cb.count * cb.count + cb.totalWeight - (ca.count * ca.count + ca.totalWeight);
      });

    if (showCoreOnly && coreData.maxCoreSet.size > 0) {
      candidates = candidates.filter((n) => coreData.maxCoreSet.has(n.name));
    }
    return candidates.slice(0, 8).map((n) => {
      const c = charConnections.get(n.name);
      return {
        name: n.name,
        degree: c ? c.count : 0,
        kcore: coreData.coreMap.get(n.name) || 0,
      };
    });
  }, [currentNet, showCoreOnly, coreData]);

  /* ── 当前剧本的主要角色 ── */
  const currentMainChars = useMemo(() => {
    if (!currentNet?.entity_id) return [];
    const chars = mainCharsMap.get(currentNet.entity_id) || [];
    const nodeNames = new Set((currentNet.nodes || []).map((n) => n.name));
    let filtered = chars.filter((c) => nodeNames.has(c));
    if (showCoreOnly && coreData.maxCoreSet.size > 0) {
      filtered = filtered.filter((c) => coreData.maxCoreSet.has(c));
    }
    return filtered;
  }, [currentNet, mainCharsMap, showCoreOnly, coreData]);

  /* ── 自动选中第一个主要角色或枢纽角色 ── */
  useEffect(() => {
    if (currentMainChars.length > 0) {
      selectRole(currentMainChars[0]);
    } else if (hubChars.length > 0) {
      selectRole(hubChars[0].name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMainChars.map(c => c).join(','), hubChars.map(c => c.name).join(',')]);

  /* ==================================================================
     ECharts Force Graph — 古籍卷轴风格力导向图
     ================================================================== */
  useEffect(() => {
    if (!networkRef.current || !currentNet) return;
    const chart = echarts.init(networkRef.current);

    const maxDeg = Math.max(...currentNet.nodes.map((n) => n.degree), 1);

    const nodes = currentNet.nodes.map((n) => {
      const t = Math.min(n.degree / maxDeg, 1);
      const size = 14 + t * 32;
      const role = charRole[n.name] || "其他";
      const roleColor = ROLE_COLORS[role as keyof typeof ROLE_COLORS] || DEFAULT_ROLE_COLOR;
      return {
        id: n.name,
        name: n.name,
        value: n.degree,
        symbolSize: size,
        category: 0,
        itemStyle: {
          color: roleColor,
          borderColor: "rgba(0,0,0,0.12)",
          borderWidth: 0.8,
          shadowBlur: 6 + t * 12,
          shadowColor: hexToRgba(roleColor, 0.35),
          opacity: 0.88 + t * 0.12,
        },
        label: {
          show: true,
          position: "top" as const,
          color: INK_DARK,
          fontSize: 14 + t * 3,
          fontFamily: FONT_SERIF,
          fontWeight: t > 0.4 ? 600 : 400,
          distance: 6,
        },
      };
    });

    const edges = currentNet.edges
      .filter((e) => showNeutralEdges || e.relation_type !== "中立")
      .map((e) => {
        const relType = e.relation_type || "中立";
        const edgeColor = EDGE_RELATION_COLORS[relType as keyof typeof EDGE_RELATION_COLORS] || "#c0c0c0";
        const isNeutral = relType === "中立";
        return {
          source: e.source,
          target: e.target,
          relation_type: relType,
          micro_type: e.micro_type || "",
          lineStyle: {
            width: Math.max(0.3, e.weight * 0.55),
            opacity: isNeutral ? 0.10 + e.weight * 0.10 : 0.25 + e.weight * 0.25,
            color: edgeColor,
            curveness: 0.06 + (e.weight || 1) * 0.06,
          },
        };
      });

    chart.setOption(
      {
        backgroundColor: PAPER_BG,
        tooltip: {
          backgroundColor: "rgba(250,245,235,0.94)",
          borderColor: "rgba(160,130,100,0.45)",
          borderWidth: 1,
          padding: [8, 14],
          textStyle: { color: INK_DARK, fontSize: 12, fontFamily: FONT_SERIF },
          formatter: (p: any) => {
            if (p.dataType === "node") {
              const role = charRole[p.name] || "其他";
              return `<b>${p.name}</b><br/>行当: ${role}<br/>加权度中心性: ${(p.value as number)?.toFixed(2)}`;
            }
            if (p.dataType === "edge") {
              const rel = p.data.relation_type || "?";
              const micro = p.data.micro_type ? ` · ${p.data.micro_type}` : "";
              return `<b>${p.data.source} — ${p.data.target}</b><br/>${rel}${micro}`;
            }
            return "";
          },
        },
        series: [
          {
            type: "graph",
            layout: "force",
            categories: [
              {
                name: "角色",
                itemStyle: {
                  color: GOLD_NODE,
                  borderColor: "rgba(150,115,75,0.42)",
                  borderWidth: 0.6,
                  shadowBlur: 6,
                  shadowColor: AMBER_GLOW,
                },
              },
            ],
            nodes,
            edges,
            roam: true,
            draggable: true,
            force: {
              repulsion: 380,
              edgeLength: [70, 220],
              gravity: 0.06,
              friction: 0.2,
            },
            emphasis: {
              focus: "adjacency",
              lineStyle: {
                width: 2.2,
                color: INK_WARM,
                shadowBlur: 5,
                shadowColor: "rgba(140,110,80,0.28)",
                opacity: 0.7,
              },
              itemStyle: {
                shadowBlur: 20,
                shadowColor: "rgba(180,125,65,0.5)",
                borderColor: "rgba(140,105,60,0.7)",
                borderWidth: 1.5,
              },
              label: { fontSize: 17, fontWeight: 700 },
            },
            label: {
              show: true,
              position: "top",
              fontSize: 14,
              color: INK_DARK,
              fontFamily: FONT_SERIF,
              fontWeight: 400,
              offset: [0, 2],
            },
            itemStyle: {
              color: GOLD_NODE,
              borderColor: "rgba(150,115,75,0.42)",
              borderWidth: 0.6,
              shadowBlur: 6,
              shadowColor: AMBER_GLOW,
            },
            lineStyle: {
              color: "#c8b896",
              curveness: 0.1,
              opacity: 0.28,
            },
          },
        ],
        animationDuration: 1000,
        animationEasing: "cubicInOut" as any,
      },
      true,
    );

    // 点击角色节点 → 打开影响力圈层面板
    chart.off("click");
    chart.on("click", (params: any) => {
      if (params.dataType === "node" && params.name) {
        selectRole(params.name);
      }
    });

    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("resize", h);
      chart.dispose();
    };
  }, [currentNet, showNeutralEdges, charRole, selectRole]);

  /* ── Ego-network filtered data ── */
  const egoNetwork = useMemo(() => {
    if (!selectedRole || !currentNet) return null;
    const coreSet =
      coreData.maxCoreSet.size > 0
        ? coreData.maxCoreSet
        : new Set<string>((currentNet.nodes || []).map((n) => n.name));
    const filteredNodes = (currentNet.nodes || []).filter(
      (n) => n.name === selectedRole || coreSet.has(n.name),
    );
    const filteredNodeNames = new Set(filteredNodes.map((n) => n.name));
    const filteredEdges = (currentNet.edges || []).filter(
      (e) =>
        filteredNodeNames.has(e.source) &&
        filteredNodeNames.has(e.target) &&
        (e.source === selectedRole || e.target === selectedRole),
    );
    return { ...currentNet, nodes: filteredNodes, edges: filteredEdges };
  }, [currentNet, selectedRole, coreData.maxCoreSet]);

  /* ==================================================================
     JSX
     ================================================================== */
  return (
    <div className="t2-screen">
      {/* ═══════════ Main Grid ═══════════ */}
      <div className="t2-main-grid">
        {/* ── LEFT: 紧凑侧边栏 ── */}
        <div className="t2-side-panel">
          {/* 剧目类型按钮组 */}
          <div className="t2-side-block">
            <div className="t2-side-block-header">
              <h3>剧目类型</h3>
            </div>
            <div className="t2-type-selector">
              {DRAMA_TYPES.filter((t) => data.type_means[t]).map((t) => (
                <button
                  key={t}
                  className={`t2-type-btn ${selectedType === t ? "active" : ""}`}
                  onClick={() => setSelectedType(t as DramaType)}
                >
                  <span
                    className="t2-type-dot"
                    style={{ backgroundColor: TYPE_COLORS[t] || GOLD_NODE }}
                  />
                  <span>{t}</span>
                  <span className="t2-type-count">
                    {data.type_means[t]?.count || 0}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 核心指标 — 竖排 */}
          {typeData && (
            <div className="t2-side-block">
              <div className="t2-side-block-header">
                <h3>核心指标</h3>
              </div>
              <div className="t2-metrics-list">
                {(
                  [
                    ["密度", typeData.metrics.density.toFixed(3)],
                    ["聚类系数", typeData.metrics.clustering.toFixed(3)],
                    [
                      "度集中度",
                      (typeData.metrics as any).centralization?.toFixed(3) || "-",
                    ],
                  ] as [string, string][]
                ).map(([label, val]) => (
                  <div key={label} className="t2-metric-row">
                    <span className="t2-metric-row-label">{label}</span>
                    <span className="t2-metric-row-value">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 角色列表 */}
          <div className="t2-side-block">
            {/* k-core 圈层筛选切换 */}
            <div className="t2-side-sub-block t2-core-toggle-row">
              <button
                className={`t2-core-toggle-btn ${showCoreOnly ? "active" : ""}`}
                onClick={() => setShowCoreOnly(true)}
                title="仅显示最大k-core核心圈层角色"
              >
                核心圈层
              </button>
              <button
                className={`t2-core-toggle-btn ${!showCoreOnly ? "active" : ""}`}
                onClick={() => setShowCoreOnly(false)}
                title="显示全部角色"
              >
                全部角色
              </button>
              {coreData.maxK > 0 && (
                <span className="t2-core-k-badge">k={coreData.maxK}</span>
              )}
            </div>

            {/* 主要角色（剧本标注） */}
            {currentMainChars.length > 0 && (
              <div className="t2-side-sub-block">
                <div className="t2-side-block-header">
                  <h3>🎭 主要角色</h3>
                  <span className="t2-side-block-hint">
                    {showCoreOnly
                      ? `核心圈·${currentMainChars.length}人`
                      : `全部·${currentMainChars.length}人`}
                  </span>
                </div>
                {currentMainChars.map((name, i) => {
                  const k = coreData.coreMap.get(name) || 0;
                  const isCore = coreData.maxCoreSet.has(name);
                  return (
                    <button
                      key={name}
                      className={`t2-hub-char-btn ${selectedRole === name ? "active" : ""}`}
                      onClick={() => selectRole(name)}
                    >
                      <span
                        className="t2-hub-char-rank"
                        style={{
                          background: isCore
                            ? i === 0
                              ? "#b8926a"
                              : "#8b7355"
                            : "#c0c0c0",
                        }}
                      >
                        {isCore ? "★" : "·"}
                      </span>
                      <span
                        className="t2-hub-char-name"
                        style={{ opacity: isCore ? 1 : 0.55 }}
                      >
                        {name}
                      </span>
                      <span
                        className="t2-hub-char-degree"
                        style={{ fontSize: 9, opacity: 0.6 }}
                      >
                        k{k}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* 枢纽角色（按网络中心性） */}
            <div className="t2-side-sub-block">
              <div className="t2-side-block-header">
                <h3>🔗 枢纽角色</h3>
                <span className="t2-side-block-hint">
                  {showCoreOnly ? "核心圈" : "按连接数"}
                </span>
              </div>
              {hubChars
                .filter((c) => !currentMainChars.includes(c.name))
                .slice(0, 6)
                .map((c, i) => {
                  const isCore = coreData.maxCoreSet.has(c.name);
                  return (
                    <button
                      key={c.name}
                      className={`t2-hub-char-btn ${selectedRole === c.name ? "active" : ""}`}
                      onClick={() => selectRole(c.name)}
                    >
                      <span
                        className="t2-hub-char-rank"
                        style={{ opacity: isCore ? 1 : 0.5 }}
                      >
                        #{i + 1}
                      </span>
                      <span
                        className="t2-hub-char-name"
                        style={{ opacity: isCore ? 1 : 0.55 }}
                      >
                        {c.name}
                      </span>
                      <span className="t2-hub-char-degree">
                        {c.degree}关联
                      </span>
                    </button>
                  );
                })}
              {hubChars.filter((c) => !currentMainChars.includes(c.name)).length === 0 && (
                <div
                  className="t2-side-block-hint"
                  style={{ padding: "6px 0", fontSize: 11, color: INK_SOFT }}
                >
                  {showCoreOnly ? "核心圈已覆盖全部角色" : "暂无额外枢纽角色"}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── CENTER: 网络图主体 ── */}
        <div className="t2-center">
          <div className="t2-main-vis">
            {/* 工具栏: 剧本选择 + 边图例 */}
            <div className="t2-chart-toolbar">
              <div className="t2-net-meta-inline">
                <div className="t2-play-selector" ref={playDropdownRef}>
                  <button className="t2-play-selector-btn"
                    onClick={() => { setPlayDropdownOpen(!playDropdownOpen); setPlaySearch(""); }}>
                    <span className="t2-net-title">{currentNet?.title || (allPlaysLoading ? "加载中..." : "选择剧本")}</span>
                    <span className="t2-play-arrow">{playDropdownOpen ? "▲" : "▼"}</span>
                  </button>
                  {playDropdownOpen && (
                    <div className="t2-play-dropdown">
                      <div className="t2-play-search-bar">
                        <input className="t2-play-search-input"
                          placeholder={`搜索${selectedType}剧本... (共${allPlaysList.length}部)`}
                          value={playSearch} onChange={(e) => setPlaySearch(e.target.value)}
                          onClick={(e) => e.stopPropagation()} autoFocus />
                      </div>
                      <div className="t2-play-dropdown-scroll">
                        {filteredAllPlays.map((p) => (
                          <button key={p.entity_id}
                            className={`t2-play-dropdown-item ${selectedPlayEntityId === p.entity_id ? "active" : ""}`}
                            onClick={() => handleSelectPlay(p.entity_id)}>
                            <span className="t2-play-name">{p.title}</span>
                            <span className="t2-play-meta">{p.node_count || 0}角·{p.edge_count || 0}边</span>
                          </button>
                        ))}
                        {filteredAllPlays.length === 0 && <div className="t2-play-search-empty">无匹配剧本</div>}
                      </div>
                    </div>
                  )}
                </div>
                {currentNet && (<><span className="t2-net-stat">角色{currentNet.total_characters}</span><span className="t2-net-stat">边{currentNet.total_edges}</span></>)}
                {currentNet && (
                  <button className={`t2-edge-toggle ${showNeutralEdges ? "active" : ""}`}
                    onClick={() => setShowNeutralEdges(!showNeutralEdges)} title="隐藏/显示中立关系边">
                    {showNeutralEdges ? "✓ 中立边" : "✗ 隐藏中立边"}
                  </button>
                )}
              </div>
            </div>

            {/* 力导向图 */}
            {currentNet ? (
              <>
                <div ref={networkRef} className="t2-chart-box" />
                <div className="t2-edge-legend">
                  {(Object.entries(EDGE_RELATION_COLORS) as [string, string][]).map(([type, color]) => (
                    <span key={type} className="t2-edge-legend-item">
                      <span className="t2-edge-legend-dot" style={{ backgroundColor: color }} />
                      {EDGE_RELATION_LABELS[type as keyof typeof EDGE_RELATION_LABELS] || type}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div className="t2-no-data">该类型暂无剧本数据</div>
            )}
          </div>
        </div>

        {/* ── RIGHT: 影响力圈层图 ── */}
        <div className="t2-ego-sidebar">
          <div className="t2-ego-card">
            {selectedRole && egoNetwork ? (
              <>
                <div className="t2-ego-card-header">
                  <span>🔵 {selectedRole} · 影响力圈层图</span>
                  <span className="t2-ego-play-title">
                    {currentNet?.title || ""}
                  </span>
                </div>
                <div className="t2-ego-card-body">
                  <div className="t2-ego-graph-area">
                    <CircleEgoGraph
                      key={`ego-${currentNet?.entity_id || currentNet?.title || "net"}-${selectedRole}`}
                      network={egoNetwork}
                      centerChar={selectedRole}
                      charRole={charRole}
                      onCenterChange={(name: string) => selectRole(name)}
                      onSelectChar={(name: string) => selectRole(name)}
                    />
                  </div>
                  <CircleInfoPanel
                    network={egoNetwork}
                    centerChar={selectedRole}
                    charRole={charRole}
                  />
                </div>
              </>
            ) : (
              <div className="t2-ego-placeholder">
                <span className="t2-ego-placeholder-icon">🔵</span>
                <span>
                  点击网络中的角色节点
                  <br />
                  或左侧枢纽角色
                  <br />
                  查看影响力圈层图
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Task2Network;
