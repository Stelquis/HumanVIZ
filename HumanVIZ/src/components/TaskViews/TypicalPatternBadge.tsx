/**
 * TypicalPatternBadge.tsx — 典型叙事模式总结徽章 (维度10)
 *
 * 为当前剧本生成 150 字以内的叙事模式总结，展示在摘要卡片行或顶栏。
 */
import React from "react";

interface TypicalPatternBadgeProps {
  /** 叙事结构类型 (如 "渐进高潮型") */
  structureType?: string;
  /** 结构框架 (如 "起承转合式") */
  framework?: string;
  /** 冲突类型 label (如 "人物冲突") */
  conflictTypeLabel?: string;
  /** 节奏类型 (如 "渐进推进型") */
  rhythmType?: string;
  /** 高潮位置描述 (如 "中后段") */
  climaxPosition?: string;
  /** 情绪趋势描述 (如 "趋于正面") */
  sentimentTrend?: string;
  /** 表演形式复杂度 (如 "中" / "高" / "低") */
  formComplexity?: string;
  /** 手工覆盖的总结 (如果有预计算值) */
  summary?: string | null;
  /** 关键词列表 */
  keywords?: string[];
  /** 主题色 */
  color?: string;
}

/**
 * 根据各项指标自动生成 150 字以内叙事模式总结。
 * 当 summary 属性提供时优先使用该值。
 */
export function generatePatternSummary(props: TypicalPatternBadgeProps): string {
  if (props.summary) return props.summary;

  const parts: string[] = [];
  const {
    structureType,
    framework,
    conflictTypeLabel,
    rhythmType,
    climaxPosition,
    sentimentTrend,
    formComplexity,
  } = props;

  // 结构描述
  if (framework) {
    parts.push(`${framework}结构`);
  } else if (structureType) {
    parts.push(`${structureType}结构`);
  } else {
    parts.push("线性渐进式结构");
  }

  // 冲突类型
  if (conflictTypeLabel) {
    parts.push(`以${conflictTypeLabel}为核心驱动`);
  }

  // 节奏与高潮
  if (climaxPosition) {
    parts.push(`${climaxPosition}高潮集中`);
  } else {
    parts.push("高潮分布适中");
  }

  // 情绪
  if (sentimentTrend) {
    parts.push(sentimentTrend);
  }

  // 节奏类型
  if (rhythmType) {
    parts.push(`节奏${rhythmType}`);
  }

  // 形式复杂度
  if (formComplexity) {
    parts.push(`表演形式${formComplexity}度多样`);
  }

  return parts.join("，") + "。";
}

const TypicalPatternBadge: React.FC<TypicalPatternBadgeProps> = (props) => {
  const {
    keywords,
    color = "#96544D",
  } = props;

  const summary = generatePatternSummary(props);

  return (
    <div className="t4-pattern-badge" style={{ borderLeftColor: color }}>
      <div className="t4-pattern-badge-body">
        <span className="t4-pattern-badge-summary">{summary}</span>
        {keywords && keywords.length > 0 && (
          <div className="t4-pattern-badge-keywords">
            {keywords.map((kw, i) => (
              <span
                key={i}
                className="t4-pattern-badge-tag"
                style={{ backgroundColor: `${color}22`, color }}
              >
                {kw}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TypicalPatternBadge;
