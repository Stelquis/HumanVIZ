import React, { useRef, useEffect, useState } from "react";
import * as d3 from "d3";
import { RIVER_COLORS } from "../../utils/liyuanData";
import TimeRiverChart from "./TimeRiverChart";
import RoleTreeRing from "../TaskViews/RoleTreeRing";

const R = 450;
const PAD = 40;
const LX = R + PAD;
const RX = R * 4 + PAD - R;
const W = R * 4 + PAD * 2;
const H = R * 2 + PAD * 2;
const PR = 4;
const HOVER_R = 12;
const SPREAD = 20;
const SPEED = 0.00012;
const HIT_R2 = 18 * 18; // 悬浮检测半径²（viewBox 坐标）

interface Script {
  id: string;
  title: string;
  source: string;
  roleType: string;
  roles: string;
}

const InfinityRiver: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ s: Script; x: number; y: number } | null>(null);

  useEffect(() => {
    let raf = 0;

    const run = async () => {
      const resp = await fetch("/scriptsSummary.json");
      const scripts: Script[] = await resp.json();
      const n = scripts.length;

      const rand = (i: number) => {
        let v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
        return v - Math.floor(v);
      };
      const off = Float64Array.from({ length: n }, (_, i) => i / n);
      const spd = Float64Array.from({ length: n }, (_, i) => 0.9 + rand(i) * 0.2);
      const perp = Float64Array.from({ length: n }, (_, i) => (rand(i + 500) - 0.5) * 2 * SPREAD);
      const ph = Float64Array.from({ length: n }, (_, i) => rand(i + 999) * Math.PI * 2);

      // 粒子当前位置（viewBox 坐标，用于悬浮检测）
      const posX = new Float64Array(n);
      const posY = new Float64Array(n);

      const svg = d3.select(svgRef.current!);
      svg.selectAll("*").remove();

      const lx = LX;
      const rx = RX;
      const centerY = R + PAD;

      const circles = svg.append("g")
        .selectAll("circle").data(scripts).join("circle")
        .attr("r", PR)
        .attr("fill", (s: Script) => RIVER_COLORS[s.source] || "#b8926a")
        .attr("opacity", 0.7)
        .attr("pointer-events", "none");

      const startTime = performance.now();
      const ENTRANCE_DUR = 2000; // 渐入时长 ms

      const tick = (ts: number) => {
        const t = ts * 0.001;
        const elapsed = performance.now() - startTime;
        const entrance = Math.min(1, elapsed / ENTRANCE_DUR); // 0→1

        for (let i = 0; i < n; i++)
          off[i] = (off[i] + SPEED * spd[i] * (1 + 0.3 * Math.sin(t * 0.4 + ph[i]))) % 1;

        circles.each(function (_d, i) {
          const o = off[i];
          const sw = 1.5 * Math.sin(t * 0.6 + ph[i] * 1.3);
          const r = R + Math.max(-SPREAD, Math.min(SPREAD, perp[i] + sw));

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
          const shimmer = 0.62 + 0.1 * Math.sin(t * 0.8 + ph[i] * 2);
          el.setAttribute("opacity", (shimmer * entrance).toFixed(2));
        });
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      /* 悬浮检测 */
      const inner = innerRef.current!;
      let hoverIdx = -1;

      const onMove = (e: MouseEvent) => {
        const rect = inner.getBoundingClientRect();
        // 鼠标 → viewBox 坐标
        const svgW = rect.width;
        const svgH = rect.height;
        const scale = Math.min(svgW / W, svgH / H);
        const ox = (svgW - W * scale) / 2;
        const oy = (svgH - H * scale) / 2;
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
            .attr("r", (_d, i) => (i === best ? HOVER_R : PR))
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
        circles.attr("r", PR).attr("filter", null);
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

      {/* 右圆扇形展开：圆心固定，半径从小到大 */}
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
        <svg
          ref={svgRef}
          className="ir-svg-back"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
        />
        <div className="ir-children">
          <div className="ir-lobe" style={{
            position: "absolute",
            left: `${(LX / W * 100).toFixed(1)}%`,
            top: "50%",
            width: `${((R * 2) / W * 100).toFixed(1)}%`,
            aspectRatio: "1",
            transform: "translate(-50%, -50%)",
          }}>
            <TimeRiverChart />
          </div>
          <div className="ir-lobe" style={{
            position: "absolute",
            left: `${(RX / W * 100).toFixed(1)}%`,
            top: "50%",
            width: `${((R * 2) / W * 100).toFixed(1)}%`,
            aspectRatio: "1",
            transform: "translate(-50%, -50%)",
            clipPath: "url(#fan-clip)",
          }}>
            <RoleTreeRing />
          </div>
        </div>

        {/* 悬浮卡片 */}
        {tip && (
          <div className="ir-tooltip" style={{ left: tip.x + 14, top: tip.y + 12 }}>
            <div className="ir-tooltip-title">📜 {tip.s.title}</div>
            <div className="ir-tooltip-source">📚 {tip.s.source}</div>
            <div className="ir-tooltip-roles">
              🎭{" "}
              {tip.s.roles.split("\n").slice(0, 3).map(r => r.trim()).filter(Boolean).join("、")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InfinityRiver;
