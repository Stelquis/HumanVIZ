import React, { useRef, useEffect, useCallback, useState } from "react";
import * as d3 from "d3";
import {
  ROLE_EVOLUTION_DATA,
  ROLE_COLORS,
  ROLE_KEYS,
  EraEvolutionPoint,
} from "../../utils/liyuanData";
import { useEraStore } from "../../stores/eraStore";

/* D3 radial: angle 0 = 12 o'clock, positive clockwise */
const toX = (r: number, a: number) => r * Math.sin(a);
const toY = (r: number, a: number) => -r * Math.cos(a);

interface TooltipData {
  era: EraEvolutionPoint;
  x: number;
  y: number;
}

const TimeRiverChart: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const sizeRef = useRef({ w: 600, h: 480 });
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const { setHoveredEra } = useEraStore();

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

    const data = ROLE_EVOLUTION_DATA;
    const n = data.length;
    const cx = w / 2;
    const cy = h / 2;
    const outerR = Math.min(w, h) / 2 - 30;
    const innerR = outerR * 0.32;
    const maxBandW = outerR - innerR;
    const eraAngle = (2 * Math.PI) / n;

    const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);

    /* ───── 每时期外圈厚度 = 行当集中度驱动 ───── */
    const stdDevs = data.map((era) => {
      const v = ROLE_KEYS.map((k) => (era as any)[k] as number);
      const mean = v.reduce((a, b) => a + b, 0) / v.length;
      const variance =
        v.reduce((sum, p) => sum + (p - mean) ** 2, 0) / v.length;
      return Math.sqrt(variance);
    });
    const minStd = Math.min(...stdDevs);
    const maxStd = Math.max(...stdDevs);

    const eraOuter = data.map(
      (_, i) =>
        innerR +
        (0.58 + ((stdDevs[i] - minStd) / (maxStd - minStd)) * 0.42) * maxBandW
    );

    const roleRadii = (era: EraEvolutionPoint, eraR: number) => {
      const band = eraR - innerR;
      const r: number[] = [];
      let acc = 0;
      for (const k of ROLE_KEYS) {
        acc += (era as any)[k] / 100;
        r.push(innerR + acc * band);
      }
      return r;
    };

    /* ───── 底层淡色标准圆环（无起伏参考基线） ───── */
    const bgArc = (sa: number, ea: number) =>
      d3.arc()({ innerRadius: innerR, outerRadius: outerR, startAngle: sa, endAngle: ea })!;

    data.forEach((_d, i) => {
      const sa = i * eraAngle + 0.003;
      const ea = (i + 1) * eraAngle - 0.003;
      g.append("path")
        .attr("d", bgArc(sa, ea))
        .attr("fill", "rgba(200,190,170,0.12)")
        .attr("stroke", "rgba(200,190,170,0.2)")
        .attr("stroke-width", 0.4)
        .attr("class", `tr-bg tr-bg-era-${i}`);
    });

    /* ───── 逐时期弧形块 ───── */
    const gap = 0.015;
    for (let i = 0; i < n; i++) {
      const era = data[i];
      const cum = roleRadii(era, eraOuter[i]);
      const sa = i * eraAngle + gap;
      const ea = (i + 1) * eraAngle - gap;

      ROLE_KEYS.forEach((key, roleIdx) => {
        const ir = roleIdx === 0 ? innerR : cum[roleIdx - 1];
        const or_ = cum[roleIdx];
        const d =
          d3.arc()({ innerRadius: ir, outerRadius: or_, startAngle: sa, endAngle: ea })!;

        g.append("path")
          .attr("d", d)
          .attr("class", `tr-seg tr-era-${i} tr-role-${roleIdx}`)
          .attr("fill", ROLE_COLORS[key])
          .attr("opacity", 0.88)
          .attr("stroke", "rgba(255,255,255,0.55)")
          .attr("stroke-width", 0.8);
      });
    }

    /* ───── 关公脸谱（内圆裁剪） ───── */
    const defs = svg.append("defs");
    defs
      .append("clipPath")
      .attr("id", "guan-clip")
      .append("circle")
      .attr("r", innerR);

    g.append("image")
      .attr("href", "/Guan.png")
      .attr("x", -innerR)
      .attr("y", -innerR)
      .attr("width", innerR * 2)
      .attr("height", innerR * 2)
      .attr("clip-path", "url(#guan-clip)")
      .attr("preserveAspectRatio", "xMidYMid slice");

    g.append("circle")
      .attr("r", innerR)
      .attr("fill", "none")
      .attr("stroke", "var(--theme-border-soft)")
      .attr("stroke-width", 1.6);

    /* ───── 外圈装饰边框 ───── */
    g.append("circle")
      .attr("r", outerR)
      .attr("fill", "none")
      .attr("stroke", "var(--theme-border-soft)")
      .attr("stroke-width", 0.6)
      .attr("stroke-dasharray", "2,6");

    /* ───── 外圈流动关键词路径 ───── */
    const flowPathId = "time-river-flow-path";
    defs.append("circle")
      .attr("id", flowPathId)
      .attr("r", outerR + 15);

    // 收集所有年代的主题关键词
    const allThemes = data.flatMap((d) =>
      d.themes.split(",").map((t) => t.trim())
    ).filter(Boolean);
    const themeString = allThemes.join("  ·  ");

    // 流动文字
    const flowText = g
      .append("text")
      .style("fill", "var(--theme-text-soft)")
      .style("font-size", "9px")
      .style("font-weight", "400")
      .style("font-family", "'Noto Sans SC', sans-serif")
      .style("opacity", 0.4)
      .append("textPath")
      .attr("href", `#${flowPathId}`)
      .attr("startOffset", "0%")
      .text(themeString + "   " + themeString);

    // 流动动画
    let flowOffset = 0;
    const animateFlow = () => {
      flowOffset = (flowOffset + 0.015) % 50;
      flowText.attr("startOffset", `${flowOffset}%`);
      requestAnimationFrame(animateFlow);
    };
    requestAnimationFrame(animateFlow);

    /* ───── 时期分隔装饰圆点 ───── */
    data.forEach((_, i) => {
      const angle = i * eraAngle;
      const x = toX(outerR + 3, angle);
      const y = toY(outerR + 3, angle);

      g.append("circle")
        .attr("cx", x)
        .attr("cy", y)
        .attr("r", 3)
        .attr("fill", "var(--theme-gold)")
        .attr("opacity", 0.5)
        .attr("stroke", "rgba(255,255,255,0.8)")
        .attr("stroke-width", 1);
    });

    /* ───── 时期标签（环内） ───── */
    const labelR = innerR + maxBandW * 0.82;
    data.forEach((d, i) => {
      const midA = (i + 0.5) * eraAngle;
      const x = toX(labelR, midA);
      const y = toY(labelR, midA);
      // 在下半圈翻转文字
      const bottom = midA > Math.PI * 0.45 && midA < Math.PI * 1.55;
      const rot = (midA * 180) / Math.PI + (bottom ? 180 : 0);

      // 半透明背景标签
      g.append("rect")
        .attr("x", x - 22)
        .attr("y", y - 8)
        .attr("width", 44)
        .attr("height", 16)
        .attr("rx", 6)
        .attr("fill", "rgba(255,253,249,0.72)")
        .attr("stroke", "var(--theme-border-soft)")
        .attr("stroke-width", 0.5)
        .attr("transform", `rotate(${rot},${x},${y})`);

      g.append("text")
        .attr("x", x)
        .attr("y", y)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("fill", "var(--theme-wood)")
        .attr("font-size", "10px")
        .attr("font-weight", 600)
        .attr("font-family", '"PT Serif", "Noto Serif SC", serif')
        .attr("transform", `rotate(${rot},${x},${y})`)
        .text(d.era);
    });

    /* ───── 悬浮热区 + 高亮 ───── */
    const makeArc = (ir: number, or_: number, sa: number, ea: number) =>
      d3.arc()({ innerRadius: ir, outerRadius: or_, startAngle: sa, endAngle: ea })!;

    const highlight = g
      .append("path")
      .attr("fill", "var(--theme-gold)")
      .attr("fill-opacity", 0.12)
      .attr("stroke", "var(--theme-gold)")
      .attr("stroke-width", 2.5)
      .attr("pointer-events", "none")
      .style("display", "none");

    data.forEach((d, i) => {
      const startA = i * eraAngle;
      const endA = (i + 1) * eraAngle;

      g.append("path")
        .attr("d", makeArc(innerR, outerR, startA, endA))
        .attr("fill", "transparent")
        .attr("cursor", "pointer")
        .on("mouseenter", function (event) {
          highlight
            .attr("d", makeArc(innerR, outerR, startA, endA))
            .style("display", null);
          g.selectAll(".tr-seg").attr("opacity", 0.28);
          g.selectAll(`.tr-era-${i}`).attr("opacity", 1);
          g.selectAll(".tr-bg-era-0,.tr-bg-era-1,.tr-bg-era-2,.tr-bg-era-3,.tr-bg-era-4,.tr-bg-era-5,.tr-bg-era-6,.tr-bg-era-7,.tr-bg-era-8")
            .attr("opacity", 0.4);
          g.selectAll(`.tr-bg-era-${i}`).attr("opacity", 1);
          const rect = containerRef.current!.getBoundingClientRect();
          setTooltip({
            era: d,
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          });
          setHoveredEra(i);
        })
        .on("mousemove", function (event) {
          const rect = containerRef.current!.getBoundingClientRect();
          setTooltip((prev) =>
            prev
              ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top }
              : null
          );
        })
        .on("mouseleave", () => {
          highlight.style("display", "none");
          g.selectAll(".tr-seg").attr("opacity", 0.88);
          g.selectAll(".tr-bg").attr("opacity", null);
          setTooltip(null);
          setHoveredEra(null);
        });
    });

  }, [setTooltip, setHoveredEra]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div ref={containerRef} className="time-river-container">
      <svg ref={svgRef} className="time-river-svg" />

      {tooltip && (
        <div
          className="tr-tooltip"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y + 10,
          }}
        >
          <div className="tr-tooltip-era">{tooltip.era.era}</div>
          <div className="tr-tooltip-year">
            {tooltip.era.yearStart} - {tooltip.era.yearEnd}
          </div>
          <div className="tr-tooltip-themes">
            {tooltip.era.themes.split(",").slice(0, 3).join(" · ")}
          </div>
          {tooltip.era.note && (
            <div className="tr-tooltip-note">▲ {tooltip.era.note}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default TimeRiverChart;
