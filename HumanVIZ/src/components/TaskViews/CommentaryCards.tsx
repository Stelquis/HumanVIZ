/**
 * CommentaryCards.tsx
 * 4-dimension commentary card grid for character performance analysis.
 * Renders one card per dimension (唱/念/做/打) with level badge,
 * deviation stats, and domain-knowledge body text.
 */

import React from "react";
import type { CommentaryCard } from "./commentaryTemplates";
import { DIM_META } from "./commentaryTemplates";

/* ── Props ── */

interface Props {
  /** All 4 commentary cards, one per dimension */
  commentaries: CommentaryCard[] | null;
  /** Character metadata for the header */
  charName: string | null;
  charDisplayName?: string;
  category?: string;
  confidence?: string;
  scriptCount?: number;
}

/* ── Sub-components ── */

const SingleCommentaryCard: React.FC<{ card: CommentaryCard }> = ({ card }) => {
  const meta = DIM_META[card.dim];
  const devSign = card.deviationFromCategory >= 0 ? "+" : "";
  const devClass = card.deviationFromCategory >= 0
    ? "t1-commentary-dev--pos"
    : "t1-commentary-dev--neg";

  return (
    <div
      className="t1-commentary-card"
      style={{ "--card-accent": meta.color } as React.CSSProperties}
    >
      {/* Header */}
      <div className="t1-commentary-header">
        <span className="t1-commentary-icon">{card.icon}</span>
        <span className="t1-commentary-label" style={{ color: meta.color }}>
          {card.label}（{card.fullLabel}）
        </span>
        <span
          className="t1-commentary-level"
          style={{ background: card.levelColor }}
        >
          {card.level}
        </span>
      </div>

      {/* Stats row */}
      <div className="t1-commentary-stats">
        <div className="t1-commentary-score">
          <span className="t1-commentary-score-val">{card.score}</span>
          <span className="t1-commentary-score-unit">/100</span>
        </div>
        <div className="t1-commentary-devs">
          <span className={`t1-commentary-dev ${devClass}`}>
            vs {card.categoryName} {devSign}{card.deviationFromCategory}pp
          </span>
          <span className="t1-commentary-pctl">
            前 {card.globalPercentile}%
          </span>
        </div>
      </div>

      {/* Deviation bar */}
      <div className="t1-commentary-bar">
        <div className="t1-commentary-bar-track">
          {/* Category mean marker */}
          <div
            className="t1-commentary-bar-mean"
            style={{ left: `${card.categoryMean}%` }}
            title={`${card.categoryName}均值: ${card.categoryMean}`}
          />
          {/* Character's position */}
          <div
            className="t1-commentary-bar-marker"
            style={{
              left: `${Math.max(0, Math.min(100, card.score))}%`,
              background: meta.color,
            }}
          />
        </div>
        <div className="t1-commentary-bar-labels">
          <span>0</span>
          <span className="t1-commentary-bar-mean-label">
            {card.categoryName}均 {card.categoryMean}
          </span>
          <span>100</span>
        </div>
      </div>

      {/* Body text */}
      <p className="t1-commentary-body">{card.body}</p>
    </div>
  );
};

/* ── Empty state ── */

const EmptyState: React.FC = () => (
  <div className="t1-commentary-empty">
    <span className="t1-commentary-empty-icon">🔍</span>
    <p>搜索角色以查看四维表演模式评述</p>
    <p className="t1-commentary-empty-hint">
      输入角色名称（如"诸葛亮"、"赵云"、"包公"），查看其在唱·念·做·打四个维度的详细评述
    </p>
  </div>
);

/* ── Main component ── */

const CommentaryCards: React.FC<Props> = ({
  commentaries,
  charName,
  charDisplayName,
  category,
  confidence,
  scriptCount,
}) => {
  if (!charName || !commentaries) {
    return <EmptyState />;
  }

  const displayName = charDisplayName || charName;
  const confLabel = confidence === "expert"
    ? "领域知识参考值"
    : `剧本聚合统计 · ${scriptCount || 0} 部剧本`;

  return (
    <div className="t1-commentary-section">
      {/* Character info header */}
      <div className="t1-commentary-char-info">
        <span className="t1-commentary-char-name">{displayName}</span>
        {category && (
          <span className="t1-commentary-char-cat">{category === "其他" ? "未归类" : category + "行"}</span>
        )}
        <span className={`t1-confidence-badge ${confidence === "expert" ? "t1-confidence-badge--expert" : "t1-confidence-badge--inferred"}`}>
          {confidence === "expert" ? "★ 专家标注" : "剧本推断"}
        </span>
        <span className="t1-commentary-char-source">{confLabel}</span>
      </div>

      {/* 4 commentary cards grid */}
      <div className="t1-commentary-grid">
        {commentaries.map(card => (
          <SingleCommentaryCard key={card.dim} card={card} />
        ))}
      </div>
    </div>
  );
};

export default CommentaryCards;
