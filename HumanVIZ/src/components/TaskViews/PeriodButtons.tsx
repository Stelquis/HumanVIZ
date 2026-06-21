/* ============================================================
   PeriodButtons — Interactive period selector buttons rendered
   below the Task1 evolution line chart.

   Each button shows period name + year range. The active button
   is highlighted with a gold accent. Clicking toggles the
   associated popover in the parent component.
   ============================================================ */

import React from "react";
import type { PeriodInfo } from "../../data/periodData";

interface PeriodButtonsProps {
  periods: PeriodInfo[];
  activePeriod: string | null;
  onSelect: (shortLabel: string) => void;
}

const PeriodButtons: React.FC<PeriodButtonsProps> = ({
  periods,
  activePeriod,
  onSelect,
}) => {
  return (
    <div className="t1-period-buttons">
      {periods.map((p) => (
        <button
          key={p.shortLabel}
          className={`t1-period-btn ${
            activePeriod === p.shortLabel ? "active" : ""
          }`}
          onClick={() => onSelect(p.shortLabel)}
          data-period={p.shortLabel}
          title={`${p.shortLabel}（${p.yearRange}）— 点击查看详情`}
          aria-pressed={activePeriod === p.shortLabel}
        >
          <span className="t1-period-btn-label">{p.shortLabel}</span>
          <span className="t1-period-btn-year">{p.yearRange}</span>
        </button>
      ))}
    </div>
  );
};

export default PeriodButtons;
