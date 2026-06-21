/**
 * 3D 浮层详情卡片 — 点击星体后在 3D 空间中弹出
 *
 * Compact version of RightDetailPanel for in-scene viewing.
 * Shows genre, source, title, narrative, role distribution with
 * qualitative explanation, network metrics, narrative structure,
 * themes, structure fingerprint, and brightness.
 */
import React from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { ScriptStarLayout } from "./UniverseLayout";

const ROLE_COLORS: Record<string, string> = { 生: "#b8926a", 旦: "#96544d", 净: "#5e6b76", 丑: "#7f968d" };
const NARR_COLORS: Record<string, string> = { 线性渐进式: "#b8926a", 悬念突转式: "#c44d4d", 双线交织式: "#5e6b76", 回环照应式: "#7f968d", 情感波浪式: "#c77d8b", 史诗铺陈式: "#6b5b4f", 三叠反复式: "#c4a56e", 多幕群像式: "#8a7a8e" };

function roleExplanation(roleDist: Record<string, number>): string {
  const roles = Object.entries(roleDist).sort((a, b) => (b[1] as number) - (a[1] as number));
  if (roles.length === 0) return "";
  const [dominant, count] = roles[0];
  const total = roles.reduce((s, [, c]) => s + (c as number), 0);
  const ratio = (count as number) / Math.max(total, 1);
  if (ratio >= 0.55) {
    const labels: Record<string, string> = {
      生: "生角主导", 旦: "旦角主导", 净: "净角主导", 丑: "丑角主导",
    };
    return labels[dominant] || `${dominant}主导`;
  }
  return "行当均衡";
}

interface Props {
  planet: ScriptStarLayout;
  position: THREE.Vector3;
  onClose: () => void;
}

const FloatingDetail: React.FC<Props> = ({ planet, position, onClose }) => {
  return (
    <Html position={[position.x + 2, position.y, position.z]} transform occlude={false}
      style={{ pointerEvents: "auto" }}>
      <div style={{
        width: 320,
        maxHeight: 460,
        overflowY: "auto",
        background: "linear-gradient(180deg, rgba(255,253,249,0.20), rgba(246,241,231,0.14))",
        border: "1px solid rgba(184,149,109,0.14)",
        borderRadius: 14,
        padding: 16,
        color: "#5E4B3A",
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: 11,
        boxShadow: "0 12px 40px rgba(0,0,0,0.04)",
        backdropFilter: "blur(10px)",
      }}>
        {/* Close button */}
        <button onClick={onClose} style={{
          position: "absolute", top: 10, right: 10,
          width: 24, height: 24, borderRadius: 6,
          border: "1px solid rgba(184,149,109,0.3)",
          background: "rgba(0,0,0,0.06)", color: "#8b7355",
          cursor: "pointer", fontSize: 12,
        }}>✕</button>

        {/* Header */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: planet.genreColor, fontWeight: 600, fontSize: 10 }}>
              {planet.genre}
            </span>
            {(planet.raw?.sourceCategory) && (
              <span style={{
                color: "rgba(0,0,0,0.45)", fontSize: 9,
                padding: "1px 6px", borderRadius: 3,
                background: "rgba(184,149,109,0.08)",
                border: "1px dashed rgba(184,149,109,0.25)",
              }}>
                {planet.raw.sourceCategory}
              </span>
            )}
          </div>
          <h2 style={{ margin: "2px 0 4px", fontSize: 16, fontWeight: 700, color: "#5E4B3A",
            fontFamily: '"PT Serif", serif' }}>
            《{planet.titleShort}》
          </h2>
          <span style={{ color: NARR_COLORS[planet.narrType] || "#999", fontSize: 10, fontWeight: 600 }}>
            {planet.narrType}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Brightness */}
          <Section title="⭐ 结构强度">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ flex: 1, height: 6, background: "rgba(184,155,109,0.1)", borderRadius: 3, overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%",
                  width: `${Math.min(planet.brightness * 100, 100)}%`,
                  background: planet.genreColor, borderRadius: 3 }} />
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#5E4B3A" }}>
                {planet.brightness.toFixed(2)}
              </span>
            </div>
          </Section>

          {/* Role distribution */}
          <Section title="🕸️ 角色关系">
            <div style={{ display: "flex", height: 16, borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
              {Object.entries(planet.roleDist).map(([role, count]) => (
                <span key={role} style={{
                  background: ROLE_COLORS[role] || "#a0a0a0",
                  flex: count as number,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 9, fontWeight: 600,
                }}>{role} {count as number}</span>
              ))}
            </div>
            <div style={{ fontSize: 9, color: "rgba(0,0,0,0.4)", marginBottom: 4, fontStyle: "italic" }}>
              {roleExplanation(planet.roleDist)}
            </div>
            <Tags items={planet.topChars.slice(0, 8)} color={planet.genreColor} />
          </Section>

          {/* Narrative structure */}
          <Section title="🎬 叙事结构">
            <div style={{ display: "flex", height: 22, borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
              <RibbonSeg label="唱" ratio={planet.singingRatio} color="#E74C3C" />
              <RibbonSeg label="念" ratio={planet.recitingRatio} color="#3498DB" />
              <RibbonSeg label="白" ratio={planet.speakingRatio} color="#95A5A6" />
              <RibbonSeg label="打" ratio={planet.fightingRatio} color="#F39C12" />
            </div>
            <Metrics items={[
              ["密度", planet.density.toFixed(2)],
              ["聚类", planet.clustering.toFixed(2)],
              ["集中度", planet.centralization.toFixed(2)],
              ["场次", String(planet.sceneCount)],
            ]} />
          </Section>

          {/* Theme tags */}
          <Section title="📜 主题标签">
            <Tags items={planet.topThemes} color={planet.genreColor} />
          </Section>

          {/* Structure fingerprint */}
          <Section title="📊 结构指纹">
            <RadarBars items={[
              { label: "密度", value: planet.density },
              { label: "聚类", value: planet.clustering },
              { label: "集中度", value: planet.centralization / 2 },
              { label: "唱比", value: planet.singingRatio },
              { label: "规模", value: Math.min(planet.charCount / 20, 1) },
              { label: "亮度", value: planet.brightness },
            ]} color={planet.genreColor} />
          </Section>
        </div>
      </div>
    </Html>
  );
};

/* ── Sub-components ── */

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{
    background: "rgba(255,253,249,0.10)", border: "1px solid rgba(184,149,109,0.05)",
    borderRadius: 10, padding: "10px 12px",
  }}>
    <h3 style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#5E4B3A" }}>{title}</h3>
    {children}
  </div>
);

const Tags: React.FC<{ items: string[]; color: string }> = ({ items }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
    {items.map((t, i) => (
      <span key={i} style={{
        padding: "2px 7px", borderRadius: 4, fontSize: 10,
        background: "rgba(184,147,106,0.1)", color: "#5E4B3A",
      }}>{t}</span>
    ))}
  </div>
);

const RibbonSeg: React.FC<{ label: string; ratio: number; color: string }> = ({ label, ratio, color }) => {
  const r = ratio || 0.01;
  return (
    <span style={{
      flex: r, background: color,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontSize: 9, fontWeight: 600,
    }}>{label}</span>
  );
};

const Metrics: React.FC<{ items: [string, string][] }> = ({ items }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px", fontSize: 10, color: "#8b7355" }}>
    {items.map(([label, val]) => (
      <span key={label}>{label} <b style={{ color: "#5E4B3A", marginLeft: 2 }}>{val}</b></span>
    ))}
  </div>
);

const RadarBars: React.FC<{ items: { label: string; value: number }[]; color: string }> = ({ items, color }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
    {items.map(d => (
      <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, color: "#8b7355", minWidth: 30 }}>{d.label}</span>
        <span style={{ flex: 1, height: 6, background: "rgba(184,155,109,0.1)", borderRadius: 3, overflow: "hidden" }}>
          <span style={{ display: "block", height: "100%", width: `${Math.min(d.value * 100, 100)}%`, background: color, borderRadius: 3 }} />
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#5E4B3A", minWidth: 28, textAlign: "right" as const }}>
          {d.value.toFixed(2)}
        </span>
      </div>
    ))}
  </div>
);

export default FloatingDetail;
