import React, { useRef, useEffect, useCallback } from "react";
import * as d3 from "d3";
import { TIME_RIVER_DATA } from "../../utils/liyuanData";

const SOURCE_KEYS = ["综合剧目集", "名家剧本选", "昆曲剧本选", "现代剧作家", "其他剧本"];
const SOURCE_COLORS: Record<string, string> = {
  "综合剧目集": "#b8926a",
  "名家剧本选": "#96544d",
  "昆曲剧本选": "#7f968d",
  "现代剧作家": "#5e6b76",
  "其他剧本": "#c4a57b",
};

const ScriptProductionChart: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const sizeRef = useRef({ w: 300, h: 280 });

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

    const data = TIME_RIVER_DATA;
    const margin = { top: 6, right: 8, bottom: 18, left: 50 };
    const innerW = w - margin.left - margin.right;
    const innerH = h - margin.top - margin.bottom;

    const x = d3
      .scaleBand()
      .domain(data.map((d) => d.decade))
      .range([0, innerW])
      .padding(0.25);

    const maxTotal = d3.max(data, (d) =>
      SOURCE_KEYS.reduce((s, k) => s + (d[k] as number), 0)
    )!;

    const y = d3.scaleLinear().domain([0, maxTotal]).range([innerH, 0]).nice();

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    /* 堆叠柱 */
    const stackGen = d3.stack<any>().keys(SOURCE_KEYS);
    const layers = stackGen(data);

    layers.forEach((layer, li) => {
      g.selectAll(`.bar-${li}`)
        .data(layer)
        .join("rect")
        .attr("x", (d) => x(d.data.decade)!)
        .attr("y", (d) => y(d[1]))
        .attr("width", x.bandwidth())
        .attr("height", (d) => Math.max(0, y(d[0]) - y(d[1])))
        .attr("fill", SOURCE_COLORS[SOURCE_KEYS[li]])
        .attr("opacity", 0.88)
        .attr("rx", 1.5);
    });

    /* Y 轴 */
    const yAxis = d3.axisLeft(y).ticks(4).tickFormat((v) => `${v}`);
    g.append("g")
      .call(yAxis)
      .call((g) => g.select(".domain").remove())
      .call((g) =>
        g
          .selectAll(".tick line")
          .attr("stroke", "var(--theme-border-soft)")
          .attr("stroke-dasharray", "2,3")
      )
      .call((g) =>
        g
          .selectAll(".tick text")
          .attr("fill", "var(--theme-text-soft)")
          .attr("font-size", "8px")
      );

    /* X 轴标签 */
    g.append("g")
      .selectAll("text")
      .data(data)
      .join("text")
      .attr("x", (d) => x(d.decade)! + x.bandwidth() / 2)
      .attr("y", innerH + 13)
      .attr("text-anchor", "middle")
      .attr("fill", "var(--theme-text-soft)")
      .attr("font-size", "7px")
      .text((d) => d.decade.replace("1990s+", "90s+"));
  }, []);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div ref={containerRef} className="prod-chart-container">
      <svg ref={svgRef} className="prod-chart-svg" />
    </div>
  );
};

export default ScriptProductionChart;
