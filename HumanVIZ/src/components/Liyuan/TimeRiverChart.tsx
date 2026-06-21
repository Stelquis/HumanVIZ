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
  const { hoveredRole, hoveredEra, setHoveredEra } = useEraStore();

  /* ── ResizeObserver → 重绘 ── */
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
    const outerR = Math.min(w, h) / 2 * 0.92;
    const innerR = outerR * 0.32;
    const maxBandW = outerR - innerR;

    /* 扇区角度 ∝ 剧本数量 */
    const totalScripts = data.reduce((sum, d) => sum + d.count, 0);
    const eraStartAngles: number[] = [];
    let cumA = 0;
    for (let i = 0; i < n; i++) {
      eraStartAngles.push(cumA);
      cumA += (data[i].count / totalScripts) * 2 * Math.PI;
    }
    const eraEndAngles = [...eraStartAngles.slice(1), 2 * Math.PI];

    const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);

    /* ── 行当层半径（统一 outerR，层厚由行当占比驱动） ── */
    const roleRadii = (era: EraEvolutionPoint) => {
      const band = outerR - innerR;
      const r: number[] = [];
      let acc = 0;
      for (const k of ROLE_KEYS) {
        acc += (era as any)[k] / 100;
        r.push(innerR + acc * band);
      }
      return r;
    };

    const bgArc = (sa: number, ea: number) =>
      d3.arc()({ innerRadius: innerR, outerRadius: outerR, startAngle: sa, endAngle: ea })!;

    /* 连续背景圆环 */
    g.append("path")
      .attr("d", bgArc(0, 2 * Math.PI))
      .attr("fill", "rgba(200,190,170,0.10)")
      .attr("stroke", "none")
      .attr("class", "tr-bg-continuous");

    /* ── 逐扇区弧形块（gap=0，层间描边弱化） ── */
    for (let i = 0; i < n; i++) {
      const era = data[i];
      const cum = roleRadii(era);
      const sa = eraStartAngles[i];
      const ea = eraEndAngles[i];

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
          .attr("stroke", "rgba(255,255,255,0.25)")
          .attr("stroke-width", 0.3);
      });
    }

    /* ── 内圆边框 ── */
    g.append("circle")
      .attr("r", innerR)
      .attr("fill", "none")
      .attr("stroke", "var(--theme-border-soft)")
      .attr("stroke-width", 1.6);

    /* ── 关公脸谱（clipPath 裁剪填满内圆） ── */
    const defs = svg.append("defs");
    defs
      .append("clipPath")
      .attr("id", "guan-clip")
      .append("circle")
      .attr("r", innerR);
    g.append("image")
      .attr("href", "/guan-mask.png")
      .attr("x", -innerR)
      .attr("y", -innerR)
      .attr("width", innerR * 2)
      .attr("height", innerR * 2)
      .attr("clip-path", "url(#guan-clip)")
      .attr("preserveAspectRatio", "xMidYMid slice")
      .attr("class", "tr-guan-mask");

    /* ── 外圈连续边框 ── */
    g.append("circle")
      .attr("r", outerR)
      .attr("fill", "none")
      .attr("stroke", "var(--theme-border-soft)")
      .attr("stroke-width", 0.6);

    /* ── 外圈流动关键词 ── */
    const flowPathId = "time-river-flow-path";
    defs.append("circle").attr("id", flowPathId).attr("r", outerR + 15);

    const allThemes = data.flatMap((d) =>
      d.themes.split(",").map((t) => t.trim())
    ).filter(Boolean);
    const themeString = allThemes.join("  ·  ");

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

    let flowOffset = 0;
    const animateFlow = () => {
      flowOffset = (flowOffset + 0.015) % 50;
      flowText.attr("startOffset", `${flowOffset}%`);
      requestAnimationFrame(animateFlow);
    };
    requestAnimationFrame(animateFlow);

    /* ── 时期分隔装饰圆点 ── */
    eraStartAngles.forEach((angle) => {
      const x = toX(outerR + 3, angle);
      const y = toY(outerR + 3, angle);
      g.append("circle")
        .attr("cx", x).attr("cy", y)
        .attr("r", 3)
        .attr("fill", "var(--theme-gold)")
        .attr("opacity", 0.8)
        .attr("stroke", "rgba(255,255,255,0.9)")
        .attr("stroke-width", 1.2);
    });

    /* ── 时期分隔径向虚线 ── */
    eraStartAngles.forEach((angle) => {
      const ix = toX(innerR, angle);
      const iy = toY(innerR, angle);
      const ox = toX(outerR, angle);
      const oy = toY(outerR, angle);
      g.append("line")
        .attr("x1", ix).attr("y1", iy)
        .attr("x2", ox).attr("y2", oy)
        .attr("stroke", "rgba(255,253,249,0.6)")
        .attr("stroke-width", 1.2)
        .attr("stroke-dasharray", "3,3")
        .attr("opacity", 0.7);
    });

    /* ── 时期标签（扇区中位角） ── */
    const labelR = innerR + maxBandW * 0.82;
    data.forEach((d, i) => {
      const midA = (eraStartAngles[i] + eraEndAngles[i]) / 2;
      const x = toX(labelR, midA);
      const y = toY(labelR, midA);
      const bottom = midA > Math.PI * 0.45 && midA < Math.PI * 1.55;
      const rot = (midA * 180) / Math.PI + (bottom ? 180 : 0);

      g.append("rect")
        .attr("x", x - 22).attr("y", y - 8)
        .attr("width", 44).attr("height", 16)
        .attr("rx", 6)
        .attr("fill", "rgba(255,253,249,0.72)")
        .attr("stroke", "var(--theme-border-soft)")
        .attr("stroke-width", 0.5)
        .attr("transform", `rotate(${rot},${x},${y})`);

      g.append("text")
        .attr("x", x).attr("y", y)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("fill", "var(--theme-wood)")
        .attr("font-size", "10px")
        .attr("font-weight", 600)
        .attr("font-family", '"PT Serif", "Noto Serif SC", serif')
        .attr("transform", `rotate(${rot},${x},${y})`)
        .text(d.era);
    });

    /* ── 悬浮热区 + 高亮 ── */
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
      const startA = eraStartAngles[i];
      const endA = eraEndAngles[i];

      g.append("path")
        .attr("d", makeArc(innerR, outerR, startA, endA))
        .attr("fill", "transparent")
        .attr("cursor", "pointer")
        .on("mouseenter", function (event) {
          highlight
            .attr("d", makeArc(innerR, outerR, startA, endA))
            .style("display", null);
          g.selectAll(".tr-seg").attr("opacity", 0.20);
          g.selectAll(`.tr-era-${i}`).attr("opacity", 1);
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
          setTooltip(null);
          setHoveredEra(null);
        });
    });
  }, [setTooltip, setHoveredEra]);

  /* ── 绘制入口 ── */
  useEffect(() => { draw(); }, [draw]);

  /* ── 联动：右侧 RoleTreeRing hover 行当 → 左侧对应色块高亮 ── */
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    if (!svg || hoveredRole === null) {
      svg.selectAll(".tr-seg").attr("opacity", 0.88);
      return;
    }
    const roleIdx = ROLE_KEYS.indexOf(hoveredRole);
    if (roleIdx < 0) return;
    svg.selectAll(".tr-seg").attr("opacity", 0.18);
    svg.selectAll(`.tr-role-${roleIdx}`).attr("opacity", 1);
  }, [hoveredRole]);

  /* ── 当前 hover 的年代数据 ── */
  const activeEra = hoveredEra !== null ? ROLE_EVOLUTION_DATA[hoveredEra] : null;

  return (
    <div ref={containerRef} className="time-river-container" data-era-active={activeEra ? "true" : "false"}>
      <svg ref={svgRef} className="time-river-svg" />

      {/* ── 中心动态面板 ── */}
      <div className="tr-center-panel">
        {activeEra ? (
          <>
            <div className="tr-center-era">{activeEra.era}</div>
            <div className="tr-center-count">{activeEra.count} 部剧本</div>
            <div className="tr-center-years">{activeEra.yearStart} – {activeEra.yearEnd}</div>
            <div className="tr-center-bars">
              {ROLE_KEYS.map((k) => {
                const pct = (activeEra as any)[k] as number;
                return (
                  <div key={k} className="tr-center-bar-row">
                    <span className="tr-center-bar-label">{k}</span>
                    <span className="tr-center-bar-track">
                      <span
                        className="tr-center-bar-fill"
                        style={{
                          width: `${pct}%`,
                          background: ROLE_COLORS[k],
                        }}
                      />
                    </span>
                    <span className="tr-center-bar-val">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <span className="tr-center-hint">悬停扇区查看详情</span>
        )}
      </div>

      {/* ── 悬浮 tooltip ── */}
      {tooltip && (
        <div
          className="tr-tooltip"
          style={{ left: tooltip.x + 12, top: tooltip.y + 10 }}
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
