import React, { useRef, useEffect, useCallback } from "react";
import * as d3 from "d3";
import { ROLE_CATEGORIES, ROLE_HIERARCHY } from "../../utils/liyuanData";

interface SubItem {
  name: string;
  value: number;
  color: string;
  description: string;
}

interface RoleGroup {
  name: string;
  color: string;
  total: number;
  subs: SubItem[];
}

const RoleBars: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const sizeRef = useRef({ w: 240, h: 260 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        if (width > 0 && height > 0) {
          sizeRef.current = { w: width, h: height };
          draw();
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const draw = useCallback(() => {
    const { w, h } = sizeRef.current;
    if (!svgRef.current || w <= 0 || h <= 0) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg
      .attr("viewBox", `0 0 ${w} ${h}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    /* 构建分组数据 */
    const groups: RoleGroup[] = ROLE_CATEGORIES.map((cat) => ({
      name: cat.name,
      color: cat.color,
      total: cat.value,
      subs: ROLE_HIERARCHY.filter((h) => h.parent === cat.name)
        .sort((a, b) => b.value - a.value)
        .map((h) => ({
          name: h.name,
          value: h.value,
          color: h.color,
          description: h.description,
        })),
    }));

    const margin = { top: 6, right: 12, bottom: 6, left: 22 };
    const innerW = w - margin.left - margin.right;
    const innerH = h - margin.top - margin.bottom;
    const barH = Math.min(22, (innerH - (groups.length - 1) * 10) / groups.length);
    const gap = (innerH - barH * groups.length) / (groups.length - 1);

    const maxTotal = d3.max(groups, (g) => g.total)!;
    const x = d3.scaleLinear().domain([0, maxTotal]).range([0, innerW]);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    /* 背景网格线 */
    g.append("g")
      .attr("class", "grid")
      .call((gg) =>
        gg
          .selectAll("line")
          .data(x.ticks(4))
          .join("line")
          .attr("x1", (d) => x(d))
          .attr("x2", (d) => x(d))
          .attr("y1", 0)
          .attr("y2", innerH)
          .attr("stroke", "var(--theme-border-soft)")
          .attr("stroke-width", 0.3)
          .attr("stroke-dasharray", "2,3")
      );

    /* 绘制每组 */
    groups.forEach((group, gi) => {
      const y = gi * (barH + gap);

      /* 行当标签 */
      g.append("text")
        .attr("x", -4)
        .attr("y", y + barH / 2)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .attr("fill", group.color)
        .attr("font-size", "12px")
        .attr("font-weight", 700)
        .attr("font-family", '"PT Serif", "Noto Serif SC", serif')
        .text(group.name);

      /* 堆叠子类条 */
      let x0 = 0;
      group.subs.forEach((sub) => {
        const w_ = Math.max(2, x(sub.value) - x(0));
        g.append("rect")
          .attr("x", x(x0))
          .attr("y", y)
          .attr("width", w_)
          .attr("height", barH)
          .attr("rx", 3)
          .attr("fill", sub.color)
          .attr("opacity", 0.88)
          .attr("stroke", "rgba(255,255,255,0.5)")
          .attr("stroke-width", 0.6)
          .append("title")
          .text(`${sub.name}: ${sub.value} — ${sub.description}`);

        /* 子类标签（足够宽时显示） */
        if (w_ > 28) {
          g.append("text")
            .attr("x", x(x0) + w_ / 2)
            .attr("y", y + barH / 2)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .attr("fill", "rgba(255,255,255,0.9)")
            .attr("font-size", `${Math.min(9, w_ / 6)}px`)
            .attr("font-weight", 600)
            .attr("pointer-events", "none")
            .text(sub.name);
        }

        x0 += sub.value;
      });

      /* 总数标注 */
      g.append("text")
        .attr("x", x(group.total) + 4)
        .attr("y", y + barH / 2)
        .attr("text-anchor", "start")
        .attr("dominant-baseline", "middle")
        .attr("fill", "var(--theme-text-soft)")
        .attr("font-size", "8px")
        .text(group.total);
    });
  }, []);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div ref={containerRef} className="rolebars-container">
      <svg ref={svgRef} className="rolebars-svg" />
    </div>
  );
};

export default RoleBars;
