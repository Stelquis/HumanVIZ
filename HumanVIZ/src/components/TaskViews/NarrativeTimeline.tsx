import React from "react";
import type { NarrativeTimelineProps } from "../../types/task4Types";

/* ================================================================
   Narrative Timeline — time-axis navigation bar
   ================================================================ */

const NarrativeTimeline: React.FC<NarrativeTimelineProps> = ({
  phases, selectedPhase, onPhaseClick,
}) => {
  if (!phases || phases.length === 0) return null;

  return (
    <div className="t4-narrative-timeline">
      {phases.map((phase, i) => (
        <React.Fragment key={i}>
          <button
            className={`t4-timeline-node ${selectedPhase === i ? "active" : ""}`}
            onClick={() => onPhaseClick(selectedPhase === i ? null : i)}
            title={`${phase.label}：第${phase.startScene + 1}场 – 第${phase.endScene + 1}场`}
          >
            <span className="t4-timeline-dot" />
            <span className="t4-timeline-label">{phase.label}</span>
            <span className="t4-timeline-range">
              第{phase.startScene + 1}–{phase.endScene + 1}场
            </span>
          </button>
          {i < phases.length - 1 && (
            <span className="t4-timeline-arrow">→</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default NarrativeTimeline;
