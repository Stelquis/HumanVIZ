import React, { useMemo } from "react";
import type { RibbonAnalysisResult } from "../../utils/storyRibbonCore";
import type { CharacterPhaseHeatmapProps } from "../../types/task4Types";

const CharacterPhaseHeatmap: React.FC<CharacterPhaseHeatmapProps> = ({ analysis, phases }) => {
  if (!analysis || !phases.length) {
    return (
      <div className="t4-heatmap-empty">
        <span>🎭</span>
        <p>请选择剧本以查看角色阶段贡献</p>
      </div>
    );
  }

  // Compute character appearances per phase
  const charPhaseData = useMemo(() => {
    if (!analysis.characterScenes || !analysis.sortedCharacters) return [];
    const topChars = analysis.sortedCharacters.slice(0, 8);

    return topChars.map(char => {
      const cs = (analysis.characterScenes as any[]).find((c: any) => c.character === char.character);
      const scenes: number[] = cs?.scenes || [];
      const phaseCounts = phases.map(phase => {
        const count = scenes.filter(si => si >= phase.startScene && si <= phase.endScene).length;
        const total = phase.endScene - phase.startScene + 1;
        return { count, pct: total > 0 ? count / total : 0 };
      });
      return {
        name: char.character,
        color: char.color || "#b89b6d",
        phaseCounts,
      };
    });
  }, [analysis, phases]);

  // Max count for color scaling
  const maxCount = Math.max(1, ...charPhaseData.flatMap(c => c.phaseCounts.map(p => p.count)));

  return (
    <div className="t4-heatmap-panel">
      <div className="t4-heatmap-header">
        <span className="t4-section-icon">🎭</span>
        <h3>角色阶段贡献</h3>
      </div>
      <div className="t4-heatmap-grid">
        {/* Header row */}
        <div className="t4-heatmap-row t4-heatmap-header-row">
          <span className="t4-heatmap-cell t4-heatmap-label-col" />
          {phases.map((p, i) => (
            <span key={i} className="t4-heatmap-cell t4-heatmap-col-header">
              {p.label}
            </span>
          ))}
        </div>
        {/* Data rows */}
        {charPhaseData.map((char, ri) => (
          <div key={ri} className="t4-heatmap-row">
            <span className="t4-heatmap-cell t4-heatmap-label-col" style={{ color: char.color }}>
              {char.name}
            </span>
            {char.phaseCounts.map((pc, ci) => {
              const intensity = pc.count / maxCount;
              const alpha = intensity > 0 ? 0.08 + intensity * 0.72 : 0.02;
              return (
                <span
                  key={ci}
                  className="t4-heatmap-cell t4-heatmap-data-cell"
                  style={{
                    background: `rgba(150,84,77,${alpha})`,
                    color: intensity > 0.5 ? "#fff" : "#5E4B3A",
                  }}
                  title={`${char.name} · ${phases[ci].label}：${pc.count} 场（${(pc.pct * 100).toFixed(0)}%）`}
                >
                  {pc.count > 0 ? pc.count : "—"}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CharacterPhaseHeatmap;
