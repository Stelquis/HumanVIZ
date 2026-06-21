/**
 * ConflictTypePanel.tsx — 冲突分析面板 (维度8)
 *
 * 展示冲突类型分类、占比分布及冲突强度变化趋势。
 */
import React, { useRef, useEffect } from "react";
import * as echarts from "echarts";
import { getConflictTypeLabel, CONFLICT_TYPES } from "../../utils/narrativeAnalysisEnhancer";

interface ConflictTypePanelProps {
  /** 剧本的冲突类型 (如 "character_conflict", "information_conflict") */
  conflictType?: string | null;
  /** 冲突弧数据 (用于显示变化趋势) */
  conflictArc?: number[] | null;
  /** 场景数 */
  sceneCount?: number;
}

const CONFLICT_TREND_LABELS: Record<string, string> = {
  character_conflict: "以人物之间的直接对抗为核心冲突来源，角色间存在明确的对立关系。",
  inner_conflict: "核心冲突来自角色内心的情感挣扎与心理矛盾，外部事件仅作为触发因素。",
  social_conflict: "冲突来源于社会制度、道德规范或阶级对立，个人与体制的对抗是叙事主线。",
  environmental_conflict: "冲突来源于自然环境、超自然力量或命运的安排，人物与环境力量对抗。",
  information_conflict: "以信息不对称为核心，观众知晓而剧中人不知，悬念驱动剧情发展。",
  goal_conflict: "冲突来源于有限资源的争夺或多方目标的不可调和，权力/利益角逐是主线。",
  mixed: "多种冲突类型交织并存，构成了复杂的多维度冲突网络。",
};

const ConflictTypePanel: React.FC<ConflictTypePanelProps> = ({
  conflictType,
  conflictArc,
  sceneCount = 0,
}) => {
  const trendRef = useRef<HTMLDivElement>(null);

  // 冲突强度变化趋势图
  useEffect(() => {
    if (!trendRef.current || !conflictArc || conflictArc.length === 0) return;
    let chart: echarts.ECharts | null = null;
    try {
      const existing = echarts.getInstanceByDom(trendRef.current);
      if (existing) existing.dispose();
      chart = echarts.init(trendRef.current);

      const labels = conflictArc.map((_, i) =>
        sceneCount > 0 ? `第${i + 1}场` : `${i + 1}`
      );

      // 冲突变化区: 上升/下降检测
      const changes = conflictArc.map((v, i) => {
        if (i === 0) return 0;
        return v - conflictArc[i - 1];
      });

      chart.setOption({
        tooltip: {
          trigger: "axis",
          backgroundColor: "rgba(255,255,255,0.94)",
          borderColor: "rgba(150,84,77,0.2)",
          borderWidth: 1,
          borderRadius: 10,
          padding: [8, 12],
          textStyle: { fontSize: 12, color: "#5E4B3A" },
          formatter: (params: any) => {
            const idx = params[0]?.dataIndex;
            if (idx === undefined) return "";
            return `<b>第${idx + 1}场</b><br/>冲突强度: ${(conflictArc[idx] * 100).toFixed(0)}%<br/>${
              changes[idx] > 0.05
                ? "▲ 冲突升级"
                : changes[idx] < -0.05
                ? "▼ 冲突缓解"
                : "→ 冲突平稳"
            }`;
          },
        },
        grid: { left: 44, right: 14, top: 8, bottom: 28 },
        xAxis: {
          type: "category",
          data: labels,
          axisLabel: {
            fontSize: 9,
            color: "#5E4B3A",
            rotate: labels.length > 6 ? 30 : 0,
          },
        },
        yAxis: {
          type: "value",
          min: 0,
          max: 1,
          axisLabel: {
            fontSize: 9,
            color: "#96544D",
            formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
          },
          splitLine: { lineStyle: { color: "rgba(94,107,118,0.08)" } },
        },
        series: [
          {
            type: "line",
            data: conflictArc,
            smooth: true,
            symbol: "circle",
            symbolSize: 4,
            lineStyle: { color: "#c44d4d", width: 2 },
            itemStyle: { color: "#c44d4d" },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: "rgba(196,77,77,0.2)" },
                { offset: 1, color: "rgba(196,77,77,0.01)" },
              ]),
            },
            markLine: {
              silent: true,
              symbol: "none",
              label: { show: false },
              lineStyle: { color: "#c4a56e", type: "dashed", width: 1, opacity: 0.5 },
              data: [{ yAxis: 0.5 }],
            },
          },
        ],
      });
    } catch (err) {
      console.error("ConflictType trend chart init failed:", err);
    }
    const h = () => chart?.resize();
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("resize", h);
      chart?.dispose();
    };
  }, [conflictArc, sceneCount]);

  if (!conflictType) {
    return (
      <div className="t4-conflict-panel">
        <div className="t4-section-intro">
          <strong>冲突类型分析</strong>
          <p>当前剧本暂无冲突类型数据</p>
        </div>
      </div>
    );
  }

  const typeInfo = CONFLICT_TYPES.find((t) => t.key === conflictType);
  const typeColor = typeInfo?.color || "#8E8A84";
  const typeLabel = getConflictTypeLabel(conflictType);
  const typeDesc = CONFLICT_TREND_LABELS[conflictType] || "多种冲突类型交织的复合型冲突结构";

  return (
    <div className="t4-conflict-panel">
      <div className="t4-section-intro">
        <strong>冲突类型分析</strong>
        <p>基于剧本结构特征分析的冲突类型分类，揭示核心冲突来源与组织方式。</p>
      </div>

      {/* 冲突类型主卡片 */}
      <div className="t4-conflict-main-card" style={{ borderLeftColor: typeColor }}>
        <div className="t4-conflict-type-badge" style={{ backgroundColor: typeColor }}>
          {typeLabel}
        </div>
        <p className="t4-conflict-desc">{typeDesc}</p>
      </div>

      {/* 冲突强度趋势 */}
      {conflictArc && conflictArc.length > 0 && (
        <div className="t4-conflict-trend-block">
          <div className="t4-mini-title">冲突强度变化趋势</div>
          <div ref={trendRef} className="t4-conflict-trend-canvas" />
          <div className="t4-conflict-summary">
            <span>
              峰值: <strong>{(Math.max(...conflictArc) * 100).toFixed(0)}%</strong>
            </span>
            <span>
              均值:{" "}
              <strong>
                {(
                  (conflictArc.reduce((s, v) => s + v, 0) / conflictArc.length) *
                  100
                ).toFixed(0)}
                %
              </strong>
            </span>
            <span>
              波动:{" "}
              <strong>
                {(
                  (Math.max(...conflictArc) - Math.min(...conflictArc)) *
                  100
                ).toFixed(0)}
                %
              </strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConflictTypePanel;
