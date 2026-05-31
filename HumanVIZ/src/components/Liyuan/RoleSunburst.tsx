import React, { useRef, useEffect, useCallback } from "react";
import * as d3 from "d3";
import { ROLE_CATEGORIES, ROLE_HIERARCHY } from "../../utils/liyuanData";

const RoleSunburst: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const sizeRef = useRef({ w: 300, h: 300 });

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
    svg.attr("viewBox", `0 0 ${w} ${h}`).attr("preserveAspectRatio", "xMidYMid meet");

    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) / 2 - 8;

    /* 构建层级数据 */
    const hierarchyData = {
      name: "行当",
      children: ROLE_CATEGORIES.map((cat) => ({
        name: cat.name,
        color: cat.color,
        children: ROLE_HIERARCHY.filter((h) => h.parent === cat.name).map(
          (h) => ({
            name: h.name,
            value: h.value,
            color: h.color,
            description: h.description,
          })
        ),
      })),
    };

    const root = d3
      .hierarchy(hierarchyData as any)
      .sum((d: any) => d.value || 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    d3.partition<typeof hierarchyData>().size([2 * Math.PI, radius])(root);

    type RectNode = d3.HierarchyRectangularNode<any>;
    const rroot = root as unknown as RectNode;

    const g = svg
      .append("g")
      .attr("transform", `translate(${cx},${cy})`);

    const arcGen = d3
      .arc<RectNode>()
      .startAngle((d) => d.x0)
      .endAngle((d) => d.x1)
      .innerRadius((d) => d.y0)
      .outerRadius((d) => d.y1);

    // 内圈分隔线半径
    const innerSplitR = radius * 0.42;

    g.selectAll("path")
      .data(rroot.descendants().filter((d) => d.depth > 0))
      .join("path")
      .attr("d", arcGen)
      .attr("fill", (d) => d.data.color || "#d4c5a0")
      .attr("stroke", "rgba(255,255,255,0.6)")
      .attr("stroke-width", 0.8)
      .attr("opacity", 0.9)
      .append("title")
      .text(
        (d) =>
          `${d.data.name}${d.data.description ? ` — ${d.data.description}` : ""}${d.value ? ` (${d.value})` : ""}`
      );

    /* 内环四行当标签 */
    const cats: RectNode[] = rroot.children || [];
    cats.forEach((cat) => {
      const midA = (cat.x0 + cat.x1) / 2;
      const r = innerSplitR * 0.65;
      const x = r * Math.sin(midA - Math.PI / 2);
      const y = -r * Math.cos(midA - Math.PI / 2);
      g.append("text")
        .attr("x", x)
        .attr("y", y)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("fill", "#fff")
        .attr("font-size", "13px")
        .attr("font-weight", 700)
        .attr("font-family", '"PT Serif", "Noto Serif SC", serif')
        .attr("pointer-events", "none")
        .text(cat.data.name);
    });

    /* 外环子类标签 */
    rroot.descendants()
      .filter((d) => d.depth === 2)
      .forEach((d) => {
        const midA = (d.x0 + d.x1) / 2;
        const midR = (d.y0 + d.y1) / 2;
        // 只标注弧宽足够的
        if (d.x1 - d.x0 < 0.15) return;
        const x = midR * Math.sin(midA - Math.PI / 2);
        const y = -midR * Math.cos(midA - Math.PI / 2);
        g.append("text")
          .attr("x", x)
          .attr("y", y)
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "middle")
          .attr("fill", "rgba(255,255,255,0.85)")
          .attr("font-size", `${Math.min(8.5, (d.x1 - d.x0) * 28)}px`)
          .attr("font-weight", 600)
          .attr("pointer-events", "none")
          .text(d.data.name);
      });
  }, []);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div ref={containerRef} className="sunburst-container">
      <svg ref={svgRef} className="sunburst-svg" />
    </div>
  );
};

export default RoleSunburst;
