/**
 * TurningPointsPanel.tsx — 关键转折点识别面板 (维度4)
 *
 * 以时间线布局展示最多 5 个转折点，含场次、冲突值、强度(1~5星)、类型标签。
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

interface TurningPointsPanelProps {
  /** 转折点列表 */
  turningPoints?: TurningPoint[] | null;
  /** 总场景数 (用于显示比例) */
  sceneCount?: number;
  /** 场景名称列表 (可选，用于显示对应场次名) */
  sceneNames?: string[];
}

const TYPE_STYLES: Record<string, { icon: string; color: string }> = {
  primary_climax: { icon: "★", color: "#c44d4d" },
  secondary_climax: { icon: "◆", color: "#b89b6d" },
};

const TurningPointsPanel: React.FC<TurningPointsPanelProps> = ({
  turningPoints,
  sceneCount = 0,
  sceneNames,
}) => {
  if (!turningPoints || turningPoints.length === 0) {
    return (
      <div className="t4-turning-panel">
        <div className="t4-section-intro">
          <strong>关键转折点识别</strong>
          <p>当前剧本暂无转折点数据</p>
        </div>
      </div>
    );
  }

  const renderStars = (intensity: number) => {
    const full = Math.round(intensity);
    return "★".repeat(Math.max(1, Math.min(5, full))) + "☆".repeat(Math.max(0, 5 - Math.max(1, Math.min(5, full))));
  };

  // 计算时间线位置百分比
  const positions = turningPoints.map((tp) => ({
    ...tp,
    pct: sceneCount > 1 ? (tp.sceneIndex / (sceneCount - 1)) * 100 : 50,
  }));

  return (
    <div className="t4-turning-panel">
      <div className="t4-section-intro">
        <strong>关键转折点识别</strong>
        <p>基于冲突弧局部极值检测的关键转折点（最多 5 个），含冲突值和强度评分。</p>
      </div>

      {/* 时间线 */}
      <div className="t4-turning-timeline">
        {/* 时间线轨道 */}
        <div className="t4-turning-track">
          <div className="t4-turning-track-line" />
          {positions.map((tp, i) => (
            <div
              key={i}
              className="t4-turning-node"
              style={{ left: `${tp.pct}%` }}
            >
              <div
                className="t4-turning-node-dot"
                style={{
                  backgroundColor: TYPE_STYLES[tp.type]?.color || "#8E8A84",
                  width: tp.type === "primary_climax" ? 14 : 10,
                  height: tp.type === "primary_climax" ? 14 : 10,
                }}
              />
              <div
                className="t4-turning-node-label"
                style={{ color: TYPE_STYLES[tp.type]?.color || "#8E8A84" }}
              >
                {tp.label}
              </div>
            </div>
          ))}
        </div>

        {/* 转折点卡片列表 */}
        <div className="t4-turning-card-list">
          {positions.map((tp, i) => {
            const style = TYPE_STYLES[tp.type] || { icon: "●", color: "#8E8A84" };
            const sceneName =
              sceneNames && tp.sceneIndex < sceneNames.length
                ? sceneNames[tp.sceneIndex]
                : "";
            return (
              <div key={i} className="t4-turning-card" style={{ borderLeftColor: style.color }}>
                <div className="t4-turning-card-header">
                  <span className="t4-turning-card-icon" style={{ color: style.color }}>
                    {style.icon}
                  </span>
                  <span className="t4-turning-card-label" style={{ color: style.color }}>
                    {tp.label}
                  </span>
                  <span className="t4-turning-card-intensity">
                    强度: {renderStars(tp.intensity)}
                  </span>
                </div>
                <div className="t4-turning-card-body">
                  <span className="t4-turning-card-scene">
                    第{tp.sceneIndex + 1}场
                    {sceneName ? ` · ${sceneName}` : ""}
                  </span>
                  <span className="t4-turning-card-value">
                    冲突值: {(tp.conflictValue * 100).toFixed(0)}%
                  </span>
                  {tp.prominence !== undefined && (
                    <span className="t4-turning-card-prom">
                      显著度: {(tp.prominence * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TurningPointsPanel;
