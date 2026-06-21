import React from "react";
import { NARRATIVE_PATTERNS } from "../../types/task4Types";

/* ================================================================
   Pattern Summary Panel
   ================================================================ */

const PatternSummaryPanel: React.FC = () => (
  <div className="t4-pattern-panel">
    <div className="t4-section-intro">
      <strong>京剧八大叙事模式</strong>
      <p>基于 1,473 部京剧剧本的叙事结构分析，归纳出八种核心叙事模式，覆盖京剧叙事光谱的完整范围。</p>
    </div>
    <div className="t4-pattern-grid">
      {NARRATIVE_PATTERNS.map((p, i) => (
        <div key={i} className="t4-pattern-card" style={{ borderLeftColor: p.color }}>
          <div className="t4-pattern-card-header">
            <span className="t4-pattern-num" style={{ background: p.color }}>{i + 1}</span>
            <span className="t4-pattern-type" style={{ color: p.color }}>{p.type}</span>
          </div>
          <p className="t4-pattern-desc">{p.description}</p>
          <div className="t4-pattern-detail">
            <div className="t4-pattern-item">
              <span className="t4-pattern-label">节奏特征</span>
              <span>{p.rhythm}</span>
            </div>
            <div className="t4-pattern-item">
              <span className="t4-pattern-label">典型结构</span>
              <span>{p.typicalStructure}</span>
            </div>
            <div className="t4-pattern-item">
              <span className="t4-pattern-label">情感曲线</span>
              <span>{p.emotionCurve}</span>
            </div>
            <div className="t4-pattern-item">
              <span className="t4-pattern-label">核心特征</span>
              <span>{p.keyFeature}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default PatternSummaryPanel;
