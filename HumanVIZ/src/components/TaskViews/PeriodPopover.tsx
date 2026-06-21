/* ============================================================
   PeriodPopover — Displays historical context and representative
   plays for a selected compilation period.

   Positioned relative to the PeriodButtons row. Dismissed via
   parent-managed click-outside detection or close button.
   ============================================================ */

import React from "react";
import type { PeriodInfo } from "../../data/periodData";

interface PeriodPopoverProps {
  period: PeriodInfo;
  onClose: () => void;
}

const PeriodPopover: React.FC<PeriodPopoverProps> = ({ period, onClose }) => {
  return (
    <div className="t1-period-popover">
      {/* ── Close button ── */}
      <button
        className="t1-period-popover-close"
        onClick={onClose}
        aria-label="关闭"
        title="关闭"
      >
        ✕
      </button>

      {/* ── Header ── */}
      <div className="t1-period-popover-header">
        <span className="t1-period-popover-era">{period.shortLabel}</span>
        <span className="t1-period-popover-year">{period.yearRange}</span>
      </div>

      {/* ── Subtitle ── */}
      <div className="t1-period-popover-subtitle">{period.subtitle}</div>

      {/* ── Script count badge ── */}
      <div className="t1-period-popover-meta">
        <span className="t1-period-popover-meta-badge">
          📜 {period.scriptCount} 部剧本
        </span>
      </div>

      {/* ── Description ── */}
      <p className="t1-period-popover-desc">{period.description}</p>

      {/* ── Representative plays ── */}
      <div className="t1-period-popover-plays">
        <div className="t1-period-popover-plays-title">代表剧目</div>
        <ul className="t1-period-popover-play-list">
          {period.representativePlays.map((play) => (
            <li key={play.title} className="t1-period-popover-play-item">
              <span className="t1-period-popover-play-name">{play.title}</span>
              <span className="t1-period-popover-play-rolecnt">
                {play.roleCount} 角色
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default PeriodPopover;
