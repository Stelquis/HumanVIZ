/**
 * TurningPointsTimeline.tsx — 关键转折点时间线（紧凑版）
 *
 * 垂直时间线展示最多 5 个叙事转折点，
 * 每个节点标注场次位置、冲突强度与类型标签。
 * 紧凑设计，适合嵌入 aux-grid 单元格。
 */
import React from "react";

interface TurningPoint {
  sceneIndex: number;
  conflictValue: number;
  type: "primary_climax" | "secondary_climax";
  intensity: number; // 1~5
  label: string;
  prominence?: number;
}

interface TurningPointsTimelineProps {
  turningPoints: TurningPoint[] | null;
  sceneCount: number;
  sceneNames?: string[];
}

const TYPE_STYLES: Record<string, { icon: string; color: string; bg: string }> = {
  primary_climax:   { icon: "★", color: "#c44d4d", bg: "rgba(196,77,77,0.10)" },
  secondary_climax: { icon: "◆", color: "#b89b6d", bg: "rgba(184,155,109,0.08)" },
};

const TurningPointsTimeline: React.FC<TurningPointsTimelineProps> = ({
  turningPoints,
  sceneCount,
  sceneNames,
}) => {
  if (!turningPoints || turningPoints.length === 0) {
    return (
      <div className="t4-tp-timeline-panel">
        <div className="t4-section-title-row">
          <span className="t4-section-icon">📍</span>
          <h3>关键转折点</h3>
        </div>
        <p className="t4-empty-hint">暂无转折点数据</p>
      </div>
    );
  }

  const maxIntensity = Math.max(...turningPoints.map(t => t.intensity), 1);

  return (
    <div className="t4-tp-timeline-panel">
      <div className="t4-section-title-row">
        <span className="t4-section-icon">📍</span>
        <h3>关键转折点</h3>
        <span className="t4-tp-count-badge">{turningPoints.length} 处</span>
      </div>

      <div className="t4-tp-timeline-list">
        {turningPoints.map((tp, idx) => {
          const style = TYPE_STYLES[tp.type] || TYPE_STYLES.secondary_climax;
          const intensityPct = Math.round((tp.intensity / maxIntensity) * 100);
          const sceneLabel = sceneNames?.[tp.sceneIndex] || `第${tp.sceneIndex + 1}场`;
          const positionPct = sceneCount > 1
            ? Math.round((tp.sceneIndex / (sceneCount - 1)) * 100)
            : 50;

          return (
            <div
              key={idx}
              className={`t4-tp-timeline-item ${tp.type === "primary_climax" ? "t4-tp--primary" : ""}`}
              style={{ borderLeftColor: style.color, background: style.bg }}
            >
              {/* Header row */}
              <div className="t4-tp-item-header">
                <span className="t4-tp-item-icon">{style.icon}</span>
                <span className="t4-tp-item-label" style={{ color: style.color }}>
                  {tp.label}
                </span>
                <span className="t4-tp-item-scene">
                  {sceneLabel}
                </span>
              </div>

              {/* Intensity bar */}
              <div className="t4-tp-intensity-row">
                <div className="t4-tp-intensity-track">
                  <div
                    className="t4-tp-intensity-fill"
                    style={{
                      width: `${intensityPct}%`,
                      background: style.color,
                    }}
                  />
                </div>
                <span className="t4-tp-intensity-val" style={{ color: style.color }}>
                  {tp.intensity.toFixed(1)}
                </span>
              </div>

              {/* Position marker */}
              <div className="t4-tp-position-row">
                <span className="t4-tp-position-label">叙事位置</span>
                <div className="t4-tp-position-track">
                  <div
                    className="t4-tp-position-dot"
                    style={{
                      left: `${positionPct}%`,
                      background: style.color,
                    }}
                  />
                </div>
                <span className="t4-tp-position-pct">{positionPct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TurningPointsTimeline;
