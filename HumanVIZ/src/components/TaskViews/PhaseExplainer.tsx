import React from "react";
import type { RibbonAnalysisResult, StoryFingerprint } from "../../utils/storyRibbonCore";
import type { PhaseExplainerProps } from "../../types/task4Types";

const PhaseExplainer: React.FC<PhaseExplainerProps> = ({
  phase, analysis, fingerprint: _fingerprint, turningPoints,
}) => {
  const conflictArc = analysis.narrativeMetrics.conflictArc;
  const sentimentArc = analysis.narrativeMetrics.sentimentArc;
  const charDensity = analysis.narrativeMetrics.characterDensity;
  const startI = Math.max(0, phase.startScene);
  const endI = Math.min(conflictArc.length - 1, phase.endScene);
  const segLen = endI - startI + 1;

  // 冲突变化率分析
  const segConflict = conflictArc.slice(startI, endI + 1);
  const meanConflict = segLen > 0 ? segConflict.reduce((s, v) => s + v, 0) / segLen : 0;
  const conflictDelta = segLen > 1
    ? (segConflict[segConflict.length - 1] - segConflict[0]) / segLen
    : 0;
  const conflictDeltas = segLen > 1
    ? segConflict.slice(1).map((v, i) => Math.abs(v - segConflict[i]))
    : [];
  const avgDelta = conflictDeltas.length > 0
    ? conflictDeltas.reduce((s, v) => s + v, 0) / conflictDeltas.length
    : 0;

  // 冲突趋势方向
  const conflictDirection = conflictDelta > 0.03 ? "↑ 上升" : conflictDelta < -0.03 ? "↓ 下降" : "→ 平稳";
  const conflictDirectionIcon = conflictDelta > 0.03 ? "📈" : conflictDelta < -0.03 ? "📉" : "➡️";

  // 情感分析
  const segSentiment = sentimentArc.slice(startI, endI + 1);
  const meanSentiment = segLen > 0 ? segSentiment.reduce((s, v) => s + v, 0) / segLen : 0;
  const sentimentPolarity = meanSentiment > 0.15 ? "积极" : meanSentiment < -0.15 ? "消极" : "中性";
  const sentimentEmoji = meanSentiment > 0.15 ? "😊" : meanSentiment < -0.15 ? "😢" : "😐";

  // 主导角色：在该阶段场景中出现频率最高的角色
  const charSceneCounts = new Map<string, number>();
  if (analysis.characterScenes) {
    for (const cs of analysis.characterScenes as any[]) {
      const sceneCount = (cs.scenes || []).filter((si: number) => si >= startI && si <= endI).length;
      if (sceneCount > 0) charSceneCounts.set(cs.character, sceneCount);
    }
  }
  const dominantChars = [...charSceneCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // 关键事件：位于该阶段范围内的事件节点
  const phaseEvents = turningPoints
    ? turningPoints.filter((tp: any) => tp.sceneIndex >= startI && tp.sceneIndex <= endI)
    : [];
  const sceneNames = analysis.scenes.map(s => `第${s.number || 0}场 ${(s.name || "").slice(0, 8)}`);

  // 平均角色密度
  const segDensity = charDensity.slice(startI, endI + 1);
  const meanDensity = segLen > 0 ? (segDensity.reduce((s, v) => s + v, 0) / segLen).toFixed(1) : "—";

  return (
    <div className="t4-phase-explainer">
      <div className="t4-phase-explainer-header">
        <span className="t4-phase-explainer-icon">🔍</span>
        <div>
          <h3>{phase.label} · 阶段解释</h3>
          <span className="t4-phase-explainer-range">
            第{startI + 1}场 – 第{endI + 1}场（{segLen} 场）
          </span>
        </div>
      </div>

      <div className="t4-phase-explainer-body">
        {/* 为什么属于该阶段 */}
        <div className="t4-phase-explain-item">
          <span className="t4-phase-explain-label">📐 阶段判定</span>
          <span className="t4-phase-explain-value">
            冲突变化率均值为 <strong>{(avgDelta * 100).toFixed(1)}%</strong>，
            {avgDelta > 0.08
              ? "波动剧烈，表明剧情在此阶段处于关键转折期"
              : avgDelta > 0.04
                ? "存在中等强度的剧情推进"
                : "节奏相对平稳，处于叙事铺垫/收束期"}
          </span>
        </div>

        {/* 冲突趋势 */}
        <div className="t4-phase-explain-item">
          <span className="t4-phase-explain-label">{conflictDirectionIcon} 冲突趋势</span>
          <span className="t4-phase-explain-value">
            均值 <strong>{(meanConflict * 100).toFixed(0)}%</strong>，
            趋势 <strong>{conflictDirection}</strong>
            {conflictDelta > 0.03 && "，冲突持续升级"}
            {conflictDelta < -0.03 && "，冲突缓和消退"}
          </span>
        </div>

        {/* 情绪基调 */}
        <div className="t4-phase-explain-item">
          <span className="t4-phase-explain-label">{sentimentEmoji} 情绪基调</span>
          <span className="t4-phase-explain-value">
            情感均值 <strong>{(meanSentiment * 100).toFixed(0)}%</strong>（{sentimentPolarity}），
            平均角色密度 <strong>{meanDensity} 人/场</strong>
          </span>
        </div>

        {/* 主导角色 */}
        <div className="t4-phase-explain-item">
          <span className="t4-phase-explain-label">🎭 主导角色</span>
          <span className="t4-phase-explain-value">
            {dominantChars.length > 0
              ? dominantChars.map(([name, count]) => (
                  <span key={name} className="t4-phase-char-tag">
                    {name}（{count}场）
                  </span>
                ))
              : "无角色数据"}
          </span>
        </div>

        {/* 关键事件 */}
        {phaseEvents.length > 0 && (
          <div className="t4-phase-explain-item">
            <span className="t4-phase-explain-label">📍 关键事件</span>
            <span className="t4-phase-explain-value">
              {phaseEvents.map((evt: any, i: number) => (
                <span key={i} className="t4-phase-event-tag">
                  {evt.type === "primary_climax" ? "★ 高潮" :
                   evt.type === "secondary_climax" ? "◆ 次高潮" :
                   evt.type === "conflict_burst" ? "● 冲突爆发" :
                   "◆ 转折"} · {sceneNames[evt.sceneIndex] || `场次${evt.sceneIndex + 1}`}
                </span>
              ))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default PhaseExplainer;
