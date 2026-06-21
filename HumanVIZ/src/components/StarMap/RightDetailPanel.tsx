/**
 * 右侧固定详情面板 — HTML overlay，不跟随 3D 节点
 *
 * Shows comprehensive Task1-4 aggregated data for a selected script star:
 * genre, source, narrative type, star-map positioning, role distribution
 * with qualitative explanation, network metrics, narrative structure,
 * themes, structural fingerprint, brightness, and shared-character neighbors.
 */
import React, { useState } from "react";
import type { ScriptStarLayout } from "./UniverseLayout";

const ROLE_COLORS: Record<string, string> = { 生: "#b8926a", 旦: "#96544d", 净: "#5e6b76", 丑: "#7f968d" };
const NARR_COLORS: Record<string, string> = { 线性渐进式: "#b8926a", 悬念突转式: "#c44d4d", 双线交织式: "#5e6b76", 回环照应式: "#7f968d", 情感波浪式: "#c77d8b", 史诗铺陈式: "#6b5b4f", 三叠反复式: "#c4a56e", 多幕群像式: "#8a7a8e" };

interface NeighborInfo {
  titleShort: string;
  genre: string;
  sharedCount: number;
}

interface Props {
  star: ScriptStarLayout;
  onClose: () => void;
  neighborMap?: Map<string, Set<string>>;
  allStars?: ScriptStarLayout[];
}

/** Qualitative zone description from roleComplexity */
function zoneLabel(complexity: number): string {
  if (complexity < 0.33) return "靠近中心 · 角色关系简单";
  if (complexity < 0.6) return "中层区域 · 中等复杂度";
  return "外围区域 · 角色关系复杂";
}

/** Qualitative role distribution interpretation */
function roleExplanation(roleDist: Record<string, number>): string {
  const roles = Object.entries(roleDist).sort((a, b) => (b[1] as number) - (a[1] as number));
  if (roles.length === 0) return "";
  const [dominant, count] = roles[0];
  const total = roles.reduce((s, [, c]) => s + (c as number), 0);
  const ratio = (count as number) / Math.max(total, 1);

  if (ratio >= 0.55) {
    const labels: Record<string, string> = {
      生: "生角主导: 以男性角色为中心的叙事结构",
      旦: "旦角主导: 围绕女性角色展开的情感叙事",
      净: "净角主导: 以性格鲜明的花脸角色为冲突核心",
      丑: "丑角主导: 以喜剧或讽刺角色统领戏剧节奏",
    };
    return labels[dominant] || `${dominant}行当主导`;
  }
  if (ratio < 0.3) return "行当均衡: 多行当协同推进剧情";
  return "行当分布中等: 存在核心行当但整体较均衡";
}

/** Narrative layer qualitative description */
function narrLayerDesc(layer: number): string {
  if (layer >= 4) return "高层 · 悬念突转/史诗铺陈 · 冲突与转折显著";
  if (layer >= 1.5) return "中上层 · 多幕群像/双线交织 · 多线并行";
  if (layer >= -1.5) return "低层 · 线性渐进/情感波浪 · 叙事平稳展开";
  return "底层 · 回环照应/三叠反复 · 叙事韵律或重构";
}

const RightDetailPanel: React.FC<Props> = ({ star, onClose, neighborMap, allStars }) => {
  const [closing, setClosing] = useState(false);

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => onClose(), 260); // match CSS animation duration
  };

  // ── Compute neighbor info ──
  const neighbors: NeighborInfo[] = React.useMemo(() => {
    if (!neighborMap || !allStars) return [];
    const neighborIds = neighborMap.get(star.id);
    if (!neighborIds) return [];

    const starMap = new Map(allStars.map(s => [s.id, s]));
    return Array.from(neighborIds)
      .map(id => {
        const ns = starMap.get(id);
        if (!ns) return null;
        // Count shared neighbors as a proxy for shared characters
        const count = Array.from(neighborMap.get(id) || [])
          .filter(nid => neighborIds.has(nid)).length + 1;
        return { titleShort: ns.titleShort, genre: ns.genre, sharedCount: count };
      })
      .filter((n): n is NeighborInfo => n !== null)
      .sort((a, b) => b.sharedCount - a.sharedCount)
      .slice(0, 5);
  }, [star.id, neighborMap, allStars]);

  return (
    <div style={{
      position: "absolute",
      top: 0, right: 0,
      width: 350, height: "100%",
      overflowY: "auto",
      background: "linear-gradient(180deg, rgba(255,253,249,0.16), rgba(246,241,231,0.12))",
      borderLeft: "1px solid rgba(184,149,109,0.10)",
      color: "#5E4B3A",
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: 11,
      padding: "20px 16px",
      boxSizing: "border-box",
      zIndex: 100,
      animation: closing ? "slideOutRight 0.26s ease forwards" : "slideInRight 0.25s ease",
      backdropFilter: "blur(10px)",
    }}>
      <style>{`
        @keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}
        @keyframes slideOutRight{from{transform:translateX(0)}to{transform:translateX(100%)}}
      `}</style>

      <button onClick={handleClose} style={{
        position: "absolute", top: 14, right: 14,
        width: 26, height: 26, borderRadius: 6,
        border: "1px solid rgba(184,149,109,0.3)",
        background: "rgba(0,0,0,0.06)", color: "#8b7355",
        cursor: "pointer", fontSize: 13,
      }}>✕</button>

      {/* ── Header with genre + source + title + narrative ── */}
      <div style={{ marginBottom: 14, marginRight: 30 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{
            color: star.genreColor, fontWeight: 600, fontSize: 10,
            padding: "2px 8px", borderRadius: 4,
            background: "rgba(184,147,106,0.12)", border: `1px solid ${star.genreColor}33`,
          }}>
            {star.genre}
          </span>
          {(star.raw?.sourceCategory) && (
            <span style={{
              color: "rgba(0,0,0,0.45)", fontWeight: 500, fontSize: 9,
              padding: "2px 6px", borderRadius: 4,
              background: "rgba(184,149,109,0.08)",
              border: "1px dashed rgba(184,149,109,0.25)",
            }}>
              {star.raw.sourceCategory}
            </span>
          )}
        </div>
        <h2 style={{ margin: "4px 0 5px", fontSize: 18, fontWeight: 700, color: "#5E4B3A",
          fontFamily: '"PT Serif", "Noto Serif SC", serif' }}>
          《{star.titleShort}》
        </h2>
        <span style={{
          color: NARR_COLORS[star.narrType] || "#999", fontSize: 10, fontWeight: 600,
          background: "rgba(0,0,0,0.04)", padding: "2px 8px", borderRadius: 4,
        }}>
          {star.narrType}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* ── 结构强度 ── */}
        <Panel title="结构强度">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, color: "#8b7355", minWidth: 36 }}>亮度</span>
            <span style={{ flex: 1, height: 8, background: "rgba(184,155,109,0.1)", borderRadius: 4, overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%",
                width: `${Math.min(star.brightness * 100, 100)}%`,
                background: `linear-gradient(90deg, ${star.genreColor}, #d4b87a)`, borderRadius: 4 }} />
            </span>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#5E4B3A", minWidth: 28, textAlign: "right" }}>
              {star.brightness.toFixed(2)}
            </span>
          </div>
          <div style={{
            marginTop: 6, fontSize: 9, color: "rgba(0,0,0,0.4)", lineHeight: 1.5,
          }}>
            {star.brightness > 0.45 ? "⭐ 高结构强度 · 推荐作为典型案例分析" :
             star.brightness > 0.3 ? "中等结构强度 · 角色关系与主题表达较显著" :
             "较低结构强度 · 剧本结构相对简约"}
          </div>
        </Panel>

        {/* ── 星图定位 ── */}
        <Panel title="星图定位">
          <Stats items={[
            ["主题方位", star.topThemes?.[0] || "综合结构"],
            ["离中心距离", pct(star.roleComplexity)],
            ["主题主导度", pct(star.themeDominance)],
            ["主题丰富度", pct(star.themeRichness)],
          ]} />
          <div style={{
            marginTop: 6,
            paddingTop: 6,
            borderTop: "1px solid rgba(184,149,109,0.15)",
            color: "rgba(0,0,0,0.45)",
            fontSize: 9,
            lineHeight: 1.55,
          }}>
            <div>{zoneLabel(star.roleComplexity)}</div>
            <div>{narrLayerDesc(star.narrativeLayer)}</div>
          </div>
        </Panel>

        {/* ── 角色关系 ── */}
        <Panel title="角色关系">
          <div style={{ display: "flex", height: 18, borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
            {Object.entries(star.roleDist).map(([role, count]) => (
              <span key={role} style={{ background: ROLE_COLORS[role] || "#a0a0a0",
                flex: count as number, display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 9, fontWeight: 600 }}>{role} {count as number}</span>
            ))}
          </div>
          <div style={{
            fontSize: 9, color: "rgba(0,0,0,0.4)", marginBottom: 6,
            lineHeight: 1.4, fontStyle: "italic",
          }}>
            {roleExplanation(star.roleDist)}
          </div>
          <Chips items={star.topChars.slice(0, 8)} />
          <Stats items={[
            ["角色数", String(star.charCount)],
            ["关系边", String(star.totalEdges)],
            ["密度", star.density.toFixed(2)],
            ["聚类", star.clustering.toFixed(2)],
          ]} />
        </Panel>

        {/* ── 叙事结构 ── */}
        <Panel title="叙事结构">
          <div style={{ display: "flex", height: 24, borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
            <Bar label="唱" ratio={star.singingRatio} color="#E74C3C" />
            <Bar label="念" ratio={star.recitingRatio} color="#3498DB" />
            <Bar label="白" ratio={star.speakingRatio} color="#95A5A6" />
            <Bar label="打" ratio={star.fightingRatio} color="#F39C12" />
          </div>
          <Stats items={[
            ["叙事层", star.narrativeLayer.toFixed(1)],
            ["节奏偏移", star.rhythmOffset.toFixed(1)],
            ["集中度", star.centralization.toFixed(2)],
            ["场次", String(star.sceneCount)],
          ]} />
        </Panel>

        {/* ── 主题标签 ── */}
        <Panel title="主题标签">
          <Chips items={star.topThemes} />
        </Panel>

        {/* ── 结构指纹 ── */}
        <Panel title="结构指纹">
          <Fingerprint items={[
            { label: "关系复杂", value: star.roleComplexity },
            { label: "主题主导", value: star.themeDominance },
            { label: "主题丰富", value: star.themeRichness },
            { label: "网络密度", value: star.density },
            { label: "唱比", value: star.singingRatio },
            { label: "亮度", value: star.brightness },
          ]} color={star.genreColor} />
        </Panel>

        {/* ── 关联剧本 ── */}
        {neighbors.length > 0 && (
          <Panel title="关联剧本 · 共享角色邻居">
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {neighbors.map((n, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "4px 8px", borderRadius: 6,
                  background: "rgba(255,253,249,0.10)", fontSize: 10,
                }}>
                  <span style={{ color: "#5E4B3A", fontWeight: 500 }}>
                    《{n.titleShort}》
                  </span>
                  <span style={{ color: "rgba(0,0,0,0.4)", fontSize: 9 }}>
                    {n.genre} · ~{n.sharedCount}关联
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
};

/* ── Tiny sub-components ── */

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ background: "rgba(255,253,249,0.10)", border: "1px solid rgba(184,149,109,0.05)",
    borderRadius: 10, padding: "10px 12px" }}>
    <h3 style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#5E4B3A" }}>{title}</h3>
    {children}
  </div>
);

const pct = (value: number) => `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;

const Chips: React.FC<{ items: string[] }> = ({ items }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
    {items.map((t, i) => <span key={i} style={{ padding: "2px 7px", borderRadius: 4, fontSize: 10,
      background: "rgba(184,147,106,0.1)", color: "#5E4B3A" }}>{t}</span>)}
  </div>
);

const Bar: React.FC<{ label: string; ratio: number; color: string }> = ({ label, ratio, color }) => (
  <span style={{ flex: ratio || 0.01, background: color, display: "flex", alignItems: "center",
    justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 600 }}>{label}</span>
);

const Stats: React.FC<{ items: [string, string][] }> = ({ items }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", fontSize: 10, color: "#8b7355" }}>
    {items.map(([l, v]) => <span key={l}>{l} <b style={{ color: "#5E4B3A", marginLeft: 2 }}>{v}</b></span>)}
  </div>
);

const Fingerprint: React.FC<{ items: { label: string; value: number }[]; color: string }> = ({ items, color }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
    {items.map(d => (
      <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, color: "#8b7355", minWidth: 30 }}>{d.label}</span>
        <span style={{ flex: 1, height: 6, background: "rgba(184,155,109,0.1)", borderRadius: 3, overflow: "hidden" }}>
          <span style={{ display: "block", height: "100%", width: `${Math.min(d.value * 100, 100)}%`,
            background: color, borderRadius: 3 }} />
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#5E4B3A", minWidth: 28, textAlign: "right" }}>
          {d.value.toFixed(2)}
        </span>
      </div>
    ))}
  </div>
);

export default RightDetailPanel;
