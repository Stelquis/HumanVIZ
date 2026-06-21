import React, { useMemo } from "react";
import type { StoryFingerprint, RibbonAnalysisResult } from "../../utils/storyRibbonCore";
import { NARRATIVE_PATTERNS } from "../../types/task4Types";
import type { NarrativeInsightBarProps } from "../../types/task4Types";

/* ================================================================
   Narrative Insight Overview — "1+2" layout
   Left: Main insight card (55%) — key conclusion
   Right: 2 stacked secondary cards — climax concentration + role-driven %
   ================================================================ */

interface InsightData {
  patternType: string;
  patternMeta: ReturnType<typeof NARRATIVE_PATTERNS.find>;
  climaxConcentration: string;
  climaxConcentrationRaw: number;
  roleDrivenPct: string;
  dominantChar: string;
  antagonistChar: string;
  tpCount: number;
  peakPosition: string;
  narrFeature: string;
}

function computeInsightData(
  fingerprint: StoryFingerprint | null,
  analysis: RibbonAnalysisResult | null,
  patternType: string,
  turningPoints: any[] | null,
  roleMapping: Record<string, string> | null,
): InsightData | null {
  if (!fingerprint || !analysis) return null;

  const conflictArc = analysis.narrativeMetrics.conflictArc;
  const peakPosition = fingerprint.peakPosition
    ? `${(fingerprint.peakPosition * 100).toFixed(0)}%`
    : `${conflictArc.length > 0 ? ((conflictArc.indexOf(Math.max(...conflictArc)) / Math.max(conflictArc.length - 1, 1)) * 100).toFixed(0) : "—"}%`;

  const avgConflict = conflictArc.length > 0
    ? conflictArc.reduce((s, v) => s + v, 0) / conflictArc.length : 0;
  const maxConflict = conflictArc.length > 0 ? Math.max(...conflictArc) : 0.5;
  const climaxConcentrationRaw = avgConflict > 0
    ? Math.min(100, (maxConflict / Math.max(avgConflict, 0.01) / 5) * 100)
    : 0;
  const climaxConcentration = climaxConcentrationRaw.toFixed(0);

  const dominantChar = roleMapping?.["主角/核心驱动者"] || "—";
  const antagonistChar = roleMapping?.["对抗者/阻碍者"] || "";

  const totalAppearances = analysis.sortedCharacters?.reduce((s, c) => {
    const cs = (analysis.characterScenes as any[]).find((cs: any) => cs.character === c.character);
    return s + (cs?.scenes?.length || 0);
  }, 0) || 1;
  const dominantScenes = analysis.sortedCharacters?.[0]
    ? (analysis.characterScenes as any[]).find((cs: any) => cs.character === analysis.sortedCharacters[0].character)?.scenes?.length || 0
    : 0;
  const roleDrivenPct = totalAppearances > 0
    ? `${((dominantScenes / totalAppearances) * 100).toFixed(0)}%`
    : "—";

  const tpCount = turningPoints?.length || 0;
  const patternMeta = NARRATIVE_PATTERNS.find(p => p.type === patternType);
  const narrFeature = patternMeta?.rhythm?.slice(0, 20) || "线性渐进";

  return {
    patternType,
    patternMeta,
    climaxConcentration,
    climaxConcentrationRaw,
    roleDrivenPct,
    dominantChar,
    antagonistChar,
    tpCount,
    peakPosition,
    narrFeature,
  };
}

const NarrativeInsightBar: React.FC<NarrativeInsightBarProps> = ({
  fingerprint, analysis, patternType, turningPoints, roleMapping,
}) => {
  const data = useMemo(
    () => computeInsightData(fingerprint, analysis, patternType, turningPoints, roleMapping),
    [fingerprint, analysis, patternType, turningPoints, roleMapping],
  );

  if (!data) return null;

  const patternColor = data.patternMeta?.color || "var(--theme-gold)";

  return (
    <div className="t4-insight-overview">
      {/* Main insight card — 55% width */}
      <div className="t4-insight-main-card" style={{ borderLeftColor: patternColor }}>
        <div className="t4-insight-main-label">核心叙事模式</div>
        <div className="t4-insight-main-value" style={{ color: patternColor }}>
          {data.patternType}
        </div>
        <div className="t4-insight-main-explain">
          {data.patternMeta?.keyFeature || data.patternMeta?.description?.slice(0, 60) || "—"}
        </div>
        <div className="t4-insight-main-meta">
          <span>冲突峰值位置 <strong>{data.peakPosition}</strong></span>
          <span className="t4-insight-main-sep">|</span>
          <span>关键转折 <strong>{data.tpCount} 处</strong></span>
          <span className="t4-insight-main-sep">|</span>
          <span>节奏特征 <strong>{data.narrFeature}</strong></span>
        </div>
      </div>

      {/* Secondary cards — stacked vertically */}
      <div className="t4-insight-side-stack">
        <div className="t4-insight-secondary-card">
          <span className="t4-insight-stat-value">
            {data.climaxConcentration}
            <span className="t4-insight-stat-unit">%</span>
          </span>
          <span className="t4-insight-stat-label">高潮集中度</span>
          <span className="t4-insight-stat-hint">
            冲突峰值与均值的比值，{data.climaxConcentrationRaw > 50 ? "剧情张力高度集中" : "冲突分布较为均匀"}
          </span>
        </div>
        <div className="t4-insight-secondary-card">
          <span className="t4-insight-stat-value">
            {data.roleDrivenPct}
          </span>
          <span className="t4-insight-stat-label">角色驱动占比</span>
          <span className="t4-insight-stat-hint">
            主导角色「{data.dominantChar}」
            {data.antagonistChar ? ` · 对抗「${data.antagonistChar}」` : ""}
            {" "}出场比例
          </span>
        </div>
      </div>
    </div>
  );
};

export default NarrativeInsightBar;
