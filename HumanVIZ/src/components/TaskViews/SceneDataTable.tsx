import React, { useMemo } from "react";
import { RibbonAnalysisResult, StoryFingerprint, NarrativePhase } from "../../utils/storyRibbonCore";

/* ================================================================
   SceneDataTable — 叙事场景卡片视图
   ================================================================ */

interface SceneDataTableProps {
  analysis: RibbonAnalysisResult | null;
  fingerprint: StoryFingerprint | null;
  /** Currently hovered scene index (from parent) */
  hoveredSceneIndex: number | null;
  /** Currently clicked/pinned scene index */
  clickedSceneIndex: number | null;
  /** ⑦ Phase data for card view */
  phases?: NarrativePhase[];
  /** ⑦ Turning points for card event markers */
  turningPoints?: any[] | null;
}

/** Classify scene narrative role based on conflict delta direction */
function classifyNarrativeRole(
  i: number,
  conflictArc: number[],
): { label: string; color: string } {
  if (i === 0) return { label: "铺垫型", color: "#b8926a" };
  const delta = conflictArc[i] - conflictArc[i - 1];
  if (delta > 0.12) return { label: "爆发型", color: "#c44d4d" };
  if (delta > 0.04) return { label: "推进型", color: "#c4a56e" };
  if (delta < -0.08) return { label: "收束型", color: "#7F968D" };
  return { label: "铺垫型", color: "#b8926a" };
}

/** ⑦ Find which phase a scene belongs to */
function findPhaseForScene(
  sceneIndex: number,
  phases: NarrativePhase[],
): string | null {
  for (const p of phases) {
    if (sceneIndex >= p.startScene && sceneIndex <= p.endScene) {
      return p.label;
    }
  }
  return null;
}

const SceneDataTable: React.FC<SceneDataTableProps> = ({
  analysis, fingerprint, hoveredSceneIndex, clickedSceneIndex,
  phases, turningPoints,
}) => {
  const rows = useMemo(() => {
    if (!analysis) return [];
    const scenes = analysis.scenes;
    const conflictArc = analysis.narrativeMetrics.conflictArc;
    const sentimentArc = analysis.narrativeMetrics.sentimentArc;
    const charDensity = analysis.narrativeMetrics.characterDensity;

    return scenes.map((scene, i) => {
      const phase = phases ? findPhaseForScene(i, phases) : null;
      const role = classifyNarrativeRole(i, conflictArc);
      const conflictDelta = i > 0
        ? ((conflictArc[i] - conflictArc[i - 1]) * 100).toFixed(0)
        : "—";
      const conflictDir = i > 0
        ? (conflictArc[i] > conflictArc[i - 1] ? "↑" : conflictArc[i] < conflictArc[i - 1] ? "↓" : "→")
        : "—";
      // Events in this scene
      const events = turningPoints
        ? turningPoints.filter((tp: any) => tp.sceneIndex === i)
        : [];

      return {
        index: i,
        number: scene.number || i + 1,
        name: scene.name || "",
        conflict: conflictArc[i] != null ? `${(conflictArc[i] * 100).toFixed(0)}%` : "—",
        conflictDelta,
        conflictDir,
        sentiment: sentimentArc[i] != null
          ? `${sentimentArc[i] >= 0 ? "+" : ""}${(sentimentArc[i] * 100).toFixed(0)}%`
          : "—",
        charCount: charDensity[i] != null ? `${charDensity[i]} 人` : "—",
        characters: scene.characters
          ? scene.characters.map((c: any) => (typeof c === "string" ? c : (c.name || c))).join(" · ")
          : "—",
        location: scene.location || "舞台",
        phase,
        narrativeRole: role,
        events,
      };
    });
  }, [analysis, phases, turningPoints]);

  if (!analysis) {
    return (
      <div className="t4-table-prompt">
        <span className="t4-multi-play-prompt-icon">📋</span>
        <p>请选择一个剧本以查看场次数据</p>
      </div>
    );
  }

  const effectiveIdx = hoveredSceneIndex ?? clickedSceneIndex;

  return (
    <div className="t4-scene-table-block">
      <div className="t4-combined-chart-header">
        <div className="t4-section-title-row">
          <span className="t4-section-icon">🃏</span>
          <h3>场次数据 · 叙事场景卡片</h3>
          <span className="t4-chart-hint" style={{ marginLeft: 8 }}>
            {fingerprint ? `${fingerprint.sceneCount} 场` : ""}
          </span>
        </div>
      </div>

      {/* 卡片视图 */}
      <div className="t4-scene-cards-grid">
        {rows.map((row) => {
          const isHighlighted = effectiveIdx === row.index;
          return (
            <div
              key={row.index}
              className={`t4-scene-card ${isHighlighted ? "t4-scene-card--highlighted" : ""}`}
            >
              <div className="t4-scene-card-header">
                <span className="t4-scene-card-num">第{row.number}场</span>
                <span className="t4-scene-card-name">{row.name}</span>
                {row.phase && (
                  <span className="t4-scene-card-phase">{row.phase}</span>
                )}
              </div>
              <div className="t4-scene-card-body">
                <div className="t4-scene-card-metrics">
                  <span className="t4-scene-card-metric">
                    ⚔️ 冲突 {row.conflict} {row.conflictDir}
                  </span>
                  <span className="t4-scene-card-metric">
                    💭 情感 {row.sentiment}
                  </span>
                  <span className="t4-scene-card-metric">
                    👥 {row.charCount}
                  </span>
                </div>
                {row.events.length > 0 && (
                  <div className="t4-scene-card-events">
                    <span className="t4-scene-card-events-label">关键事件：</span>
                    {row.events.map((evt: any, j: number) => (
                      <span key={j} className="t4-scene-card-event-tag">
                        {evt.type === "primary_climax" ? "★ 高潮" :
                         evt.type === "secondary_climax" ? "◆ 次高潮" :
                         evt.type === "conflict_burst" ? "● 冲突爆发" :
                         "◆ 转折"}
                      </span>
                    ))}
                  </div>
                )}
                <div className="t4-scene-card-footer">
                  <span className="t4-scene-card-role" style={{ color: row.narrativeRole.color }}>
                    {row.narrativeRole.label}
                  </span>
                  <span className="t4-scene-card-chars">{row.characters}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SceneDataTable;
