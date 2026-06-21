import React from "react";
import { CHAR_NARRATIVE_ROLES } from "../../types/task4Types";
import type { RibbonAnalysisResult } from "../../utils/storyRibbonCore";

/* ================================================================
   Character Narrative Panel
   ================================================================ */

const CharacterNarrativePanel: React.FC<{ analysis: RibbonAnalysisResult | null }> = ({ analysis }) => (
  <div className="t4-char-narrative-panel">
    <div className="t4-section-intro">
      <strong>角色叙事功能分析</strong>
      <p>在京剧叙事体系中，每个角色不仅承担行当表演功能，还承担特定的叙事结构功能。以下基于叙事学理论，归纳京剧角色的五种核心叙事功能类型。</p>
    </div>
    <div className="t4-char-role-grid">
      {CHAR_NARRATIVE_ROLES.map((cr, i) => (
        <div key={i} className="t4-char-role-card">
          <div className="t4-char-role-header">
            <span className="t4-char-role-num">{i + 1}</span>
            <div>
              <div className="t4-char-role-title">{cr.role}</div>
              <div className="t4-char-role-function">{cr.function}</div>
            </div>
          </div>
          <p className="t4-char-role-desc">{cr.description}</p>
          <div className="t4-char-role-examples">
            <span className="t4-char-role-examples-label">典型角色：</span>
            {cr.examples.map((ex, j) => (
              <span key={j} className="t4-char-role-tag">{ex}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
    {analysis && (
      <div className="t4-current-char-analysis">
        <h4>当前剧本角色叙事功能分布</h4>
        <p>基于故事丝带中各角色的场景分布与交互模式，可进一步推断每个角色的叙事功能类型。角色在场景中的出现频率、与其他角色的共现关系、以及所处场景的情感强度共同决定了其叙事功能定位。</p>
        <div className="t4-char-list-mini">
          {analysis.sortedCharacters.slice(0, 8).map((char, i) => (
            <div key={i} className="t4-char-mini-item">
              <span className="t4-char-mini-dot" style={{ background: char.color || "var(--theme-gold)" }} />
              <span className="t4-char-mini-name">{char.character}</span>
              <span className="t4-char-mini-group">{char.group || "未知行当"}</span>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

export default CharacterNarrativePanel;
