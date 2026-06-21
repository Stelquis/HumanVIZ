/**
 * 左侧底部筛选面板 — HTML overlay
 *
 * Features:
 * - Three filter tabs (genre/theme/narrative) with chip toggles
 * - Relationship complexity dual-range slider
 * - Filter statistics summary (visible count, avg complexity, top themes)
 * - Brightest-in-filter typical script recommendation
 * - Connection mode toggle
 */
import React, { useState } from "react";

type FilterMode = "genre" | "theme" | "narr" | "proto";
type ConnectionMode = "off" | "hover" | "selected";

interface FilterStats {
  visibleCount: number;
  totalCount: number;
  avgComplexity: number;
  avgBrightness: number;
  top3Themes: [string, number][];
  genreCounts: Record<string, number>;
  brightest: { titleShort: string; brightness: number; genre: string };
}

interface Props {
  filterMode: FilterMode | null;
  setFilterMode: (m: FilterMode | null) => void;
  filterOptions: string[];
  filterColors: Record<string, string>;
  activeFilters: Set<string>;
  toggleFilter: (v: string) => void;
  clearFilters: () => void;
  genreGroups?: Record<string, { count: number }>;
  themeStats?: Record<string, { count: number }>;
  narrStats?: Record<string, { count: number }>;
  filterStats: FilterStats | null;
  connectionMode: ConnectionMode;
  cycleConnectionMode: () => void;
  connectionModeLabel: string;
  /** Callback when user clicks the recommended brightest script */
  onSelectRecommendation?: () => void;
  /** Prototype cluster data — enables "结构原型" tab */
  protoOptions?: string[];
  protoColors?: Record<string, string>;
  protoAssignments?: Record<string, string>;
  protoCounts?: Record<string, number>;
}

const TAB_DEFS: { key: FilterMode; icon: string; label: string }[] = [
  { key: "genre", icon: "🎭", label: "剧种" },
  { key: "theme", icon: "📜", label: "主题" },
  { key: "narr", icon: "🎬", label: "叙事" },
  { key: "proto", icon: "🧬", label: "原型" },
];

const UniverseFilterPanel: React.FC<Props> = ({
  filterMode, setFilterMode, filterOptions, filterColors,
  activeFilters, toggleFilter, clearFilters,
  genreGroups, themeStats, narrStats,
  protoOptions, protoColors, protoCounts,
  filterStats,
  connectionMode, cycleConnectionMode, connectionModeLabel,
  onSelectRecommendation,
}) => {
  const [minimized, setMinimized] = useState(false);

  const handleTabClick = (m: FilterMode) => {
    setFilterMode(filterMode === m ? null : m);
  };

  // Use proto-specific data when proto tab active
  const effectiveOptions = filterMode === "proto" && protoOptions ? protoOptions : filterOptions;
  const effectiveColors = filterMode === "proto" && protoColors ? protoColors : filterColors;

  const showChips = filterMode !== null;
  const hasActiveFilter = activeFilters.size > 0;

  // ── Minimized state: show only a small floating toggle button ──
  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        style={{
          position: "absolute",
          bottom: 16, left: 16,
          width: 30, height: 30,
          borderRadius: "50%",
          border: "1px solid rgba(184, 149, 109, 0.20)",
          background: "rgba(255, 253, 249, 0.18)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          color: "rgba(184, 149, 109, 0.85)",
          fontSize: 15,
          fontWeight: 700,
          fontFamily: '"PT Serif", "Noto Sans SC", sans-serif',
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 14px rgba(0, 0, 0, 0.06)",
          zIndex: 50,
          padding: 0,
          lineHeight: 1,
          transition: "all 0.2s ease",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background = "rgba(184, 155, 109, 0.15)";
          (e.currentTarget as HTMLElement).style.borderColor = "rgba(184, 149, 109, 0.35)";
          (e.currentTarget as HTMLElement).style.color = "rgba(184, 149, 109, 1)";
          (e.currentTarget as HTMLElement).style.transform = "scale(1.06)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = "rgba(255, 253, 249, 0.18)";
          (e.currentTarget as HTMLElement).style.borderColor = "rgba(184, 149, 109, 0.20)";
          (e.currentTarget as HTMLElement).style.color = "rgba(184, 149, 109, 0.85)";
          (e.currentTarget as HTMLElement).style.transform = "scale(1)";
        }}
        title="展开筛选面板"
        aria-label="展开筛选面板"
      >
        ☰
      </button>
    );
  }

  return (
    <div style={{
      position: "absolute",
      bottom: 16, left: 16,
      background: "linear-gradient(0deg, rgba(255,253,249,0.85), rgba(246,241,231,0.78))",
      border: "1px solid rgba(184,149,109,0.25)",
      borderRadius: 14,
      padding: "10px 12px",
      color: "#4a3a30",
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: 11,
      minWidth: 184,
      maxWidth: 210,
      maxHeight: "calc(100% - 32px)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
      backdropFilter: "blur(14px)",
      zIndex: 50,
      boxSizing: "border-box",
      transition: "max-height 0.3s ease",
    }}>
      {/* ── Minimize button (top-right corner) ── */}
      <button
        onClick={() => setMinimized(true)}
        style={{
          position: "absolute",
          top: 6, right: 6,
          width: 22, height: 22,
          borderRadius: "50%",
          border: "1px solid rgba(184, 149, 109, 0.18)",
          background: "rgba(255, 253, 249, 0.14)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          color: "rgba(184, 149, 109, 0.75)",
          fontSize: 12,
          fontWeight: 700,
          fontFamily: "inherit",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          lineHeight: 1,
          zIndex: 5,
          transition: "all 0.2s ease",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background = "rgba(184, 155, 109, 0.15)";
          (e.currentTarget as HTMLElement).style.borderColor = "rgba(184, 149, 109, 0.35)";
          (e.currentTarget as HTMLElement).style.color = "rgba(184, 149, 109, 1)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = "rgba(255, 253, 249, 0.14)";
          (e.currentTarget as HTMLElement).style.borderColor = "rgba(184, 149, 109, 0.18)";
          (e.currentTarget as HTMLElement).style.color = "rgba(184, 149, 109, 0.75)";
        }}
        title="最小化筛选面板"
        aria-label="最小化筛选面板"
      >
        −
      </button>

      {/* ── Filter chips (only visible when a tab is selected) ── */}
      {showChips && (
        <>
          <div style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            paddingBottom: 4,
            minHeight: 0,
            maxHeight: 220,
          }}>
            {effectiveOptions.map(opt => {
              const color = effectiveColors[opt] || "#999";
              const active = activeFilters.has(opt);
              const count = filterMode === "genre"
                ? genreGroups?.[opt]?.count ?? 0
                : filterMode === "theme"
                ? themeStats?.[opt]?.count ?? 0
                : filterMode === "narr"
                ? narrStats?.[opt]?.count ?? 0
                : filterMode === "proto"
                ? protoCounts?.[opt] ?? 0
                : 0;
              return (
                <button key={opt} onClick={() => toggleFilter(opt)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "4px 11px",
                    border: `1.5px solid ${color}`,
                    borderRadius: 12,
                    background: active ? color : "transparent",
                    color: active ? "#fff" : color,
                    fontWeight: active ? 600 : 500,
                    cursor: "pointer",
                    fontSize: 10,
                    fontFamily: "inherit",
                    flexShrink: 0,
                  }}>
                  <span>{opt}</span>
                  <span style={{ opacity: 0.7, fontSize: 9, marginLeft: 6 }}>{count}</span>
                </button>
              );
            })}
            {activeFilters.size > 0 && (
              <button onClick={clearFilters}
                style={{
                  padding: "3px 10px",
                  border: "1px solid rgba(199,125,139,0.4)",
                  borderRadius: 12,
                  background: "transparent",
                  color: "#c77d8b",
                  fontSize: 10,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  flexShrink: 0,
                }}>
                ✕ 清除分类筛选
              </button>
            )}
          </div>

          {/* Divider */}
          <div style={{
            borderTop: "1px solid rgba(184,149,109,0.15)",
            margin: "6px 0 4px",
            flexShrink: 0,
          }} />
        </>
      )}

      {/* ── Filter stats summary ── */}
      {filterStats && (
        <div style={{
          flexShrink: 0,
          marginTop: 6, paddingTop: 6,
          borderTop: "1px solid rgba(184,149,109,0.15)",
          fontSize: 9,
          lineHeight: 1.5,
        }}>
          <div style={{ color: "rgba(94,75,58,0.85)", fontWeight: 600, marginBottom: 3 }}>
            📊 筛选统计
          </div>
          <div style={{ color: "rgba(58,51,53,0.6)" }}>
            可见 {filterStats.visibleCount}/{filterStats.totalCount} 部剧本
          </div>
          <div style={{ color: "rgba(58,51,53,0.52)" }}>
            平均复杂度 {filterStats.avgComplexity.toFixed(2)} · 平均强度 {filterStats.avgBrightness.toFixed(2)}
          </div>
          {filterStats.top3Themes.length > 0 && (
            <div style={{ color: "rgba(58,51,53,0.48)", marginTop: 2 }}>
              主要主题: {filterStats.top3Themes.map(([t, n]) =>
                `${t}(${n})`).join(" · ")}
            </div>
          )}
          {filterStats.brightest && (
            <button onClick={onSelectRecommendation} style={{
              marginTop: 4, padding: "4px 8px", width: "100%", textAlign: "left",
              background: "rgba(184,149,109,0.08)", borderRadius: 8,
              border: "1px solid rgba(184,149,109,0.2)",
              cursor: "pointer", fontFamily: "inherit",
              transition: "background .15s, border-color .15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(184,149,109,0.18)";
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(184,149,109,0.35)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(184,149,109,0.08)";
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(184,149,109,0.2)";
            }}
            >
              <span style={{ color: "rgba(94,75,58,0.7)" }}>★ 最典型剧本: </span>
              <span style={{ color: "#5E4B3A", fontWeight: 600 }}>
                《{filterStats.brightest.titleShort}》
              </span>
              <span style={{ color: "rgba(58,51,53,0.5)", marginLeft: 4 }}>
                (强度 {filterStats.brightest.brightness.toFixed(2)})
              </span>
            </button>
          )}
        </div>
      )}

      {/* ── Connection mode toggle ── */}
      <div style={{
        flexShrink: 0,
        marginTop: 6, paddingTop: 6,
        borderTop: "1px solid rgba(184,149,109,0.15)",
      }}>
        <button onClick={cycleConnectionMode}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "5px 12px",
            border: connectionMode !== "off"
              ? "1px solid rgba(184,149,109,0.5)"
              : "1px solid rgba(184,149,109,0.2)",
            borderRadius: 10,
            background: connectionMode !== "off"
              ? "rgba(184,149,109,0.2)"
              : "rgba(255,253,249,0.10)",
            color: connectionMode !== "off" ? "#5E4B3A" : "#8a8a90",
            fontWeight: connectionMode !== "off" ? 700 : 500,
            cursor: "pointer",
            fontSize: 11,
            fontFamily: "inherit",
            textAlign: "left" as const,
          }}>
          <span>🔗 {connectionModeLabel}</span>
          <span style={{ fontSize: 9, opacity: 0.5 }}>
            {connectionMode === "off" ? "↻" : connectionMode === "hover" ? "悬停" : "选中"}
          </span>
        </button>
      </div>

      {/* ── Tab switcher ── */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 3,
        flexShrink: 0,
        marginTop: 6,
      }}>
        {TAB_DEFS.map(({ key, icon, label }) => {
          const active = filterMode === key;
          const stats = key === "genre" ? genreGroups
            : key === "theme" ? themeStats
            : key === "narr" ? narrStats
            : protoOptions ? { __protoLen: protoOptions.length } : null;
          const count = key === "proto" ? (protoOptions?.length || 0)
            : stats ? Object.keys(stats).length : 0;
          return (
            <button key={key} onClick={() => handleTabClick(key)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "5px 12px",
                border: active
                  ? "1px solid rgba(184,149,109,0.5)"
                  : "1px solid rgba(184,149,109,0.2)",
                borderRadius: 10,
                background: active ? "rgba(184,149,109,0.32)" : "rgba(255,253,249,0.30)",
                color: active ? "#3a2e28" : "#5a4e42",
                fontWeight: active ? 700 : 500,
                cursor: "pointer",
                fontSize: 11,
                textAlign: "left" as const,
                fontFamily: "inherit",
              }}>
              <span>{icon} {label}</span>
              <span style={{
                fontSize: 9, opacity: 0.7, marginLeft: 6,
                color: active ? "#3a2e28" : "#5a4e42",
              }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Clear all button ── */}
      {hasActiveFilter && (
        <button onClick={() => { clearFilters(); setComplexityRange([0, 1]); }}
          style={{
            marginTop: 4,
            padding: "4px 0",
            border: "1px solid rgba(199,125,139,0.35)",
            borderRadius: 10,
            background: "transparent",
            color: "#c77d8b",
            fontSize: 10,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            flexShrink: 0,
          }}>
          ✕ 清除全部筛选
        </button>
      )}
    </div>
  );
};

export default UniverseFilterPanel;
