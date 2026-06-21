import React, { useRef, useEffect, useState } from "react";
import * as d3 from "d3";
import { RIVER_COLORS } from "../../utils/liyuanData";
import TimeRiverChart from "./TimeRiverChart";
import RoleTreeRing from "./RoleTreeRing";
import scriptsSummary from "../../data/scripts-summary.json";

const R = 380;
const PAD = 40;
const SPREAD = 30;          // 粒子向外散布范围
const RING_OVERLAP = 20;    // 两侧粒子环在中间的重叠量
// 圆心距 = 2R + 2*SPREAD - RING_OVERLAP，粒子环在中心重叠形成 ∞ 腰
const LX = R + PAD;                              // 420
const RX = LX + R * 2 + SPREAD * 2 - RING_OVERLAP; // 1200
const W = R * 4 + PAD * 2 + SPREAD * 2 - RING_OVERLAP; // 1620
const H = R * 2 + PAD * 2;                       // 840
const HOVER_R = 12;
const SPEED = 0.00004;
const HIT_R2 = 18 * 18;

const MIN_R = 2.2;
const MAX_R = 7.5;

interface Script {
  id: string;
  title: string;
  source: string;
  roleType: string;
  roles: string;
  charCount: number;
}

/** 根据容器尺寸计算 SVG 在 meet 模式下的实际渲染区域 */
function svgRenderArea(cw: number, ch: number) {
  const scale = Math.min(cw / W, ch / H);
  return {
    left: (cw - W * scale) / 2,
    top: (ch - H * scale) / 2,
    width: W * scale,
    height: H * scale,
  };
}

const InfinityRiver: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ s: Script; x: number; y: number } | null>(null);
  // HTML 叠加层位置：初始为 null，等 ResizeObserver 测量实际容器后再渲染
  const [area, setArea] = useState<ReturnType<typeof svgRenderArea> | null>(null);

  // ── ResizeObserver：容器大小变化 → 重算 SVG 渲染区，对齐 HTML 叠加层 ──
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width <= 0 || height <= 0) return;
      setArea(svgRenderArea(width, height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── D3 粒子河流 ──
  useEffect(() => {
    let raf = 0;

    const run = async () => {
      const raw: Script[] = scriptsSummary as Script[];
      const enriched: Script[] = raw.map((s) => ({
        ...s,
        charCount: s.roles ? s.roles.split("\n").filter((l) => l.trim()).length : 1,
      }));
      const scripts = enriched;
      const n = scripts.length;

      const charCounts = scripts.map((s) => s.charCount);
      const charMin = Math.min(...charCounts);
      const charMax = Math.max(...charCounts);
      const rScale = d3.scaleSqrt()
        .domain([charMin, charMax])
        .range([MIN_R, MAX_R]);

      const rand = (i: number) => {
        let v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
        return v - Math.floor(v);
      };
      const off = Float64Array.from({ length: n }, (_, i) => i / n);
      const spd = Float64Array.from({ length: n }, (_, i) => 0.9 + rand(i) * 0.2);
      // perp 均为正值：粒子始终在大圆外侧
      const perp = Float64Array.from({ length: n }, (_, i) => rand(i + 500) * SPREAD);
      const ph = Float64Array.from({ length: n }, (_, i) => rand(i + 999) * Math.PI * 2);
      const posX = new Float64Array(n);
      const posY = new Float64Array(n);

      const svg = d3.select(svgRef.current!);
      svg.selectAll("*").remove();
      svg.attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");

      const lx = LX;
      const rx = RX;
      const centerY = R + PAD;
      const baseR = Float64Array.from({ length: n }, (_, i) => rScale(scripts[i].charCount));

      const circles = svg.append("g")
        .selectAll("circle").data(scripts).join("circle")
        .attr("r", (_d, i) => baseR[i])
        .attr("fill", (s: Script) => RIVER_COLORS[s.source] || "#b8926a")
        .attr("opacity", 0.55)
        .attr("pointer-events", "none");

      const startTime = performance.now();
      const ENTRANCE_DUR = 2400;
      const ENTRANCE_STAGGER = 1600;

      const tick = (ts: number) => {
        const t = ts * 0.001;
        const elapsed = performance.now() - startTime;

        for (let i = 0; i < n; i++)
          off[i] = (off[i] + SPEED * spd[i] * (1 + 0.3 * Math.sin(t * 0.4 + ph[i]))) % 1;

        circles.each(function (_d, i) {
          const o = off[i];
          const sw = 1.5 * Math.sin(t * 0.6 + ph[i] * 1.3);
          // 粒子始终在大圆外侧：r = R + [0, SPREAD]
          const r = R + Math.max(0, Math.min(SPREAD, perp[i] + sw));

          // 8 字轨道：4 段圆弧，粒子依次经过左圆右半 → 右圆右半 → 右圆左半 → 左圆左半
          let cx: number, cy: number;
          if (o < 0.25) {
            const a = o * 4 * Math.PI;
            cx = lx + r * Math.sin(a);
            cy = centerY - r * Math.cos(a);
          } else if (o < 0.5) {
            const a = (o - 0.25) * 4 * Math.PI;
            cx = rx + r * Math.sin(a);
            cy = centerY + r * Math.cos(a);
          } else if (o < 0.75) {
            const a = (o - 0.5) * 4 * Math.PI;
            cx = rx - r * Math.sin(a);
            cy = centerY - r * Math.cos(a);
          } else {
            const a = (o - 0.75) * 4 * Math.PI;
            cx = lx - r * Math.sin(a);
            cy = centerY + r * Math.cos(a);
          }

          posX[i] = cx;
          posY[i] = cy;

          const el = this as SVGCircleElement;
          el.setAttribute("cx", cx.toFixed(1));
          el.setAttribute("cy", cy.toFixed(1));

          const stagger = (ph[i] / (Math.PI * 2)) * ENTRANCE_STAGGER;
          const particleElapsed = Math.max(0, elapsed - stagger);
          const entrance = Math.min(1, particleElapsed / (ENTRANCE_DUR - stagger));

          const shimmer = 0.55 + 0.10 * Math.sin(t * 0.8 + ph[i] * 2);
          const glow = entrance < 1 ? 1 - entrance : 0;
          const alpha = Math.min(1, shimmer + glow * 0.3);
          el.setAttribute("opacity", (alpha * entrance).toFixed(2));

          const br = baseR[i];
          const size = br + (entrance < 1 ? (1 - entrance) * 2.5 : 0);
          el.setAttribute("r", size.toFixed(1));
        });
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      /* ── 悬浮检测 ── */
      const inner = innerRef.current!;
      let hoverIdx = -1;

      const onMove = (e: MouseEvent) => {
        const rect = inner.getBoundingClientRect();
        // 鼠标 CSS px → viewBox 坐标
        const scale = Math.min(rect.width / W, rect.height / H);
        const ox = (rect.width - W * scale) / 2;
        const oy = (rect.height - H * scale) / 2;
        const mx = (e.clientX - rect.left - ox) / scale;
        const my = (e.clientY - rect.top - oy) / scale;

        let best = -1;
        let bestD = HIT_R2;
        for (let i = 0; i < n; i++) {
          const dx = mx - posX[i];
          const dy = my - posY[i];
          const dd = dx * dx + dy * dy;
          if (dd < bestD) {
            bestD = dd;
            best = i;
          }
        }

        if (best !== hoverIdx) {
          hoverIdx = best;
          circles
            .attr("r", (_d, i) => (i === best ? HOVER_R : baseR[i]))
            .attr("filter", (_d, i) => (i === best ? "url(#ir-glow)" : null));
        }

        if (best >= 0) {
          setTip({
            s: scripts[best],
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          });
        } else {
          setTip(null);
        }
      };

      const onLeave = () => {
        hoverIdx = -1;
        circles.attr("r", (_d, i) => baseR[i]).attr("filter", null);
        setTip(null);
      };

      inner.addEventListener("mousemove", onMove);
      inner.addEventListener("mouseleave", onLeave);

      return () => {
        cancelAnimationFrame(raf);
        inner.removeEventListener("mousemove", onMove);
        inner.removeEventListener("mouseleave", onLeave);
      };
    };

    let cleanup: (() => void) | undefined;
    run().then((fn) => (cleanup = fn));
    return () => {
      cancelAnimationFrame(raf);
      cleanup?.();
    };
  }, []);

  // 两个内圆定位（viewBox 百分比，因 ir-children 已对齐 SVG 渲染区，比例不变）
  const leftPct = (LX / W * 100).toFixed(1);
  const rightPct = (RX / W * 100).toFixed(1);
  const lobeW = ((R * 2) / W * 100).toFixed(1);

  return (
    <div className="infinity-river-container">
      {/* glow 滤镜 */}
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <filter id="ir-glow">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      {/* 右圆扇形展开 clip-path */}
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <clipPath id="fan-clip" clipPathUnits="objectBoundingBox">
            <circle cx="0.5" cy="0.5" r="0">
              <animate
                attributeName="r"
                from="0"
                to="0.7"
                dur="2s"
                begin="0s"
                fill="freeze"
                calcMode="spline"
                keySplines="0.16 1 0.3 1"
                keyTimes="0;1"
              />
            </circle>
          </clipPath>
        </defs>
      </svg>

      <div ref={innerRef} className="infinity-river-inner">
        <svg ref={svgRef} className="ir-svg-back" />

        {/* HTML 叠加层 — 对齐包裹层，匹配 SVG meet 后的实际渲染区。
             area 初始为 null，待 ResizeObserver 测量实际容器后再渲染，避免初始错位跳变。 */}
        {area && (
        <div className="ir-align" style={{
          position: "absolute",
          left: area.left,
          top: area.top,
          width: area.width,
          height: area.height,
        }}>
          <div className="ir-children">
          <div className="ir-lobe" style={{
            position: "absolute",
            left: `${leftPct}%`,
            top: "50%",
            width: `${lobeW}%`,
            aspectRatio: "1",
            transform: "translate(-50%, -50%)",
          }}>
            <TimeRiverChart />
          </div>
          <div className="ir-lobe" style={{
            position: "absolute",
            left: `${rightPct}%`,
            top: "50%",
            width: `${lobeW}%`,
            aspectRatio: "1",
            transform: "translate(-50%, -50%)",
            clipPath: "url(#fan-clip)",
          }}>
            <RoleTreeRing />
          </div>
          </div>
        </div>
        )}

        {/* 悬浮卡片 */}
        {tip && (
          <div className="ir-tooltip" style={{ left: tip.x + 14, top: tip.y + 12 }}>
            <div className="ir-tooltip-title">📜 {tip.s.title}</div>
            <div className="ir-tooltip-source">
              📚 {tip.s.source}
              <span style={{ marginLeft: 8, opacity: 0.7 }}>👤 {tip.s.charCount}角色</span>
            </div>
            <div className="ir-tooltip-roles">
              🎭{" "}
              {tip.s.roles.split("\n").slice(0, 3).map(r => r.trim()).filter(Boolean).join("、")}
            </div>
          </div>
        )}

        {/* 粒子图例 */}
        <div className="ir-legend">
          <span className="ir-legend-label">粒子尺寸 ∝ 角色数</span>
          <span className="ir-legend-dots">
            <svg width="60" height="16" viewBox="0 0 60 16">
              <circle cx="8" cy="8" r={MIN_R} fill="#b8926a" opacity="0.55" />
              <circle cx="30" cy="8" r={(MIN_R + MAX_R) / 2} fill="#b8926a" opacity="0.55" />
              <circle cx="52" cy="8" r={MAX_R} fill="#b8926a" opacity="0.55" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
};

export default InfinityRiver;
