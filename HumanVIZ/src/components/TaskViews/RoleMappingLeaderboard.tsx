import React, { useState, useMemo, useRef, useEffect } from "react";
import * as echarts from "echarts";
import narrativeBaselinesRaw from "../../data/narrative-baselines.json";
import starmapData from "../../data/starmap-data.json";
import type { RibbonAnalysisResult, StoryFingerprint } from "../../utils/storyRibbonCore";
import { CHAR_NARRATIVE_ROLES, ROLE_COLORS_MAP } from "../../types/task4Types";
import type { RoleMappingLeaderboardProps } from "../../types/task4Types";
import NarrativeDNARadar from "./NarrativeDNARadar";


/* ================================================================
   Shared helper: compute role → character mapping
   ================================================================ */

export function computeRoleMapping(analysis: RibbonAnalysisResult | null): Record<string, string> | null {
  if (!analysis || !analysis.sortedCharacters || !analysis.characterScenes) return null;

  const chars = analysis.sortedCharacters;
  const charScenesMap = new Map<string, number[]>(
    (analysis.characterScenes as any[]).map((cs: any) => [cs.character, cs.scenes || []])
  );
  const n = analysis.scenes.length;
  const conflictArc = analysis.narrativeMetrics.conflictArc;

  const metrics = chars.map(char => {
    const sceneIndices = charScenesMap.get(char.character) || [];
    const sc = sceneIndices.length;
    const avgConflict = sc > 0
      ? sceneIndices.reduce((s, i) => s + (conflictArc[i] || 0), 0) / sc
      : 0;
    const firstPos = sc > 0 ? Math.min(...sceneIndices) / Math.max(n - 1, 1) : 1;
    const lastPos = sc > 0 ? Math.max(...sceneIndices) / Math.max(n - 1, 1) : 0;
    return { character: char.character, sceneCount: sc, avgConflict, firstPos, lastPos, span: lastPos - firstPos };
  });

  // Single sort: sceneCount desc (primary), avgConflict desc (secondary)
  const sorted = [...metrics].sort((a, b) =>
    b.sceneCount !== a.sceneCount ? b.sceneCount - a.sceneCount : b.avgConflict - a.avgConflict
  );

  const result: Record<string, string> = {};
  const used = new Set<string>();

  // Protagonist: highest scene count
  const protagonist = sorted.find(m => !used.has(m.character));
  if (protagonist) { result["主角/核心驱动者"] = protagonist.character; used.add(protagonist.character); }

  // Antagonist: highest avgConflict among remaining (linear scan)
  let bestAntag: typeof sorted[0] | null = null;
  for (const m of sorted) {
    if (used.has(m.character)) continue;
    if (!bestAntag || m.avgConflict > bestAntag.avgConflict) bestAntag = m;
  }
  if (bestAntag) { result["对抗者/阻碍者"] = bestAntag.character; used.add(bestAntag.character); }

  // Helper: next highest scene count (already in sorted order)
  const helper = sorted.find(m => !used.has(m.character));
  if (helper) { result["辅助者/帮手"] = helper.character; used.add(helper.character); }

  // Messenger: fewest scenes among remaining
  let bestMsg: typeof sorted[0] | null = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (used.has(sorted[i].character)) continue;
    if (!bestMsg || sorted[i].sceneCount < bestMsg.sceneCount) bestMsg = sorted[i];
  }
  if (bestMsg) { result["信息传递者"] = bestMsg.character; used.add(bestMsg.character); }

  // Observer: remaining character
  const observer = sorted.find(m => !used.has(m.character));
  if (observer) { result["旁观者/评论者"] = observer.character; }

  return result;
}

const RoleMappingLeaderboard: React.FC<RoleMappingLeaderboardProps> = ({ analysis, fingerprint }) => {
  const roleMapping = useMemo(() => computeRoleMapping(analysis), [analysis]);
  const donutRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Build role data with character scene counts
  const roleData = useMemo(() => {
    if (!analysis || !roleMapping) return [];
    const charScenesMap = new Map<string, number>(
      (analysis.characterScenes as any[]).map((cs: any) =>
        [cs.character, (cs.scenes || []).length])
    );
    const totalAppearances = Array.from(charScenesMap.values()).reduce((s, v) => s + v, 0) || 1;

    return CHAR_NARRATIVE_ROLES.map(cr => {
      const mappedChar = roleMapping[cr.role];
      const sceneCount = mappedChar ? (charScenesMap.get(mappedChar) || 0) : 0;
      const pct = totalAppearances > 0 ? (sceneCount / totalAppearances * 100) : 0;
      const charData = mappedChar
        ? analysis.sortedCharacters.find((c: any) => c.character === mappedChar)
        : null;
      return {
        role: cr.role,
        function: cr.function,
        character: mappedChar || "—",
        shortName: (charData as any)?.short || mappedChar || "—",
        color: (charData as any)?.color || ROLE_COLORS_MAP[cr.role] || "#8E8A84",
        sceneCount,
        pct: +pct.toFixed(1),
      };
    });
  }, [analysis, roleMapping]);

  // Donut chart for role proportions
  useEffect(() => {
    if (!donutRef.current || roleData.length === 0) return;
    let chart: echarts.ECharts | null = null;
    try {
      const existing = echarts.getInstanceByDom(donutRef.current);
      if (existing) existing.dispose();
      chart = echarts.init(donutRef.current);

      const donutData = roleData
        .filter(d => d.sceneCount > 0)
        .map(d => ({
          name: d.role.replace(/\/.*$/, ""),
          value: d.sceneCount,
          itemStyle: { color: d.color },
        }));

      chart.setOption({
        tooltip: {
          trigger: "item",
          backgroundColor: "rgba(255,255,255,0.94)",
          borderColor: "rgba(150,84,77,0.2)",
          borderWidth: 1, borderRadius: 8, padding: [6, 10],
          textStyle: { fontSize: 11, color: "#5E4B3A" },
          formatter: (p: any) =>
            `<b>${p.name}</b><br/>出场场景：${p.value} 场 (${p.percent}%)`,
        },
        series: [{
          type: "pie",
          radius: ["52%", "78%"],
          center: ["50%", "52%"],
          itemStyle: { borderColor: "#fff", borderWidth: 2, borderRadius: 3 },
          label: {
            show: true, position: "outside",
            fontSize: 9, fontWeight: 600, color: "#5E4B3A",
            formatter: "{b}\n{d}%",
          },
          emphasis: {
            scaleSize: 6,
            label: { fontSize: 11, fontWeight: 700 },
          },
          data: donutData,
        }],
      });
    } catch (err) {
      console.error("RoleDonut init failed:", err);
    }
    const h = () => chart?.resize();
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("resize", h); chart?.dispose(); };
  }, [roleData]);

  // Resize donut/radar charts when collapsed section expands
  useEffect(() => {
    if (!collapsed.donut && donutRef.current) {
      const c = echarts.getInstanceByDom(donutRef.current);
      c?.resize();
    }
  }, [collapsed.donut]);

  if (!analysis) {
    return (
      <div className="t4-role-panel">
        <div className="t4-section-title-row">
          <span className="t4-section-icon">🎭</span>
          <h3>角色功能映射</h3>
        </div>
        <p className="t4-empty-hint">请选择一个剧本以查看角色功能映射</p>
      </div>
    );
  }

  return (
    <div className="t4-role-panel">
      <div className="t4-section-title-row">
        <span className="t4-section-icon">🎭</span>
        <h3>角色功能映射</h3>
      </div>

      {/* Section 1: Donut chart (collapsible) */}
      <div className="t4-collapsible-section">
        <div className="t4-role-donut-wrap">
          <div className="t4-collapsible-header" onClick={() => setCollapsed(prev => ({ ...prev, donut: !prev.donut }))}>
            <span className="t4-mini-title">功能占比分布</span>
            <button className="t4-collapse-btn" tabIndex={-1}>
              <span className={`t4-collapse-arrow ${collapsed.donut ? 't4-collapse-closed' : ''}`}>▼</span>
            </button>
          </div>
          {!collapsed.donut && (
            <div className="t4-collapsible-body">
              <div ref={donutRef} className="t4-role-donut-canvas" />
            </div>
          )}
        </div>
      </div>

      {/* Section 2: Radar chart (collapsible) */}
      <div className="t4-collapsible-section t4-collapsible-section-fill">
        <div className="t4-role-radar-wrap">
          <div className="t4-collapsible-header" onClick={() => setCollapsed(prev => ({ ...prev, radar: !prev.radar }))}>
            <span className="t4-mini-title">叙事DNA · 六维雷达</span>
            <button className="t4-collapse-btn" tabIndex={-1}>
              <span className={`t4-collapse-arrow ${collapsed.radar ? 't4-collapse-closed' : ''}`}>▼</span>
            </button>
          </div>
          {!collapsed.radar && (
            <div className="t4-collapsible-body">
              <NarrativeDNARadar fingerprint={fingerprint} analysis={analysis} compact />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoleMappingLeaderboard;
