/**
 * LayoutLegend — bottom-right ? button, click to show encoding legend popover.
 */
import React, { useState, useRef, useEffect } from "react";

interface Props {
  starCount: number;
  galaxyCount: number;
  narrativeLayerCount: number;
}

const ENCODINGS: { label: string; value: string }[] = [
  { label: "颜色", value: "剧种分类" },
  { label: "大小", value: "角色数量" },
  { label: "亮度", value: "综合结构强度" },
  { label: "螺旋臂", value: "剧本按序排列" },
  { label: "高度", value: "叙事类型" },
  { label: "连线", value: "共享角色" },
];

const LayoutLegend: React.FC<Props> = ({ starCount, galaxyCount, narrativeLayerCount }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="sl-legend" ref={ref}>
      {open && (
        <div className="sl-legend-popover">
          <p className="sl-legend-desc">
            梨园星图以漩涡星系隐喻 1473 部京剧剧本的综合结构空间。
            星体沿螺旋臂分布，颜色编码剧种，大小反映角色规模，亮度表示结构强度。
            叙事类型映射为垂直高度层，共享角色连线揭示剧本间的人物关联。
          </p>
          <div className="sl-legend-grid">
            {ENCODINGS.map(({ label, value }) => (
              <div key={label} className="sl-legend-item">
                <span className="sl-legend-label">{label}</span>
                <span className="sl-legend-value">{value}</span>
              </div>
            ))}
          </div>
          <div className="sl-legend-stats">
            {starCount} 部剧本 · {galaxyCount} 个主题引力场 · {narrativeLayerCount} 个叙事层
          </div>
        </div>
      )}
      <button
        className="sl-legend-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="图例"
        title="图例说明"
      >
        ?
      </button>
    </div>
  );
};

export default LayoutLegend;
