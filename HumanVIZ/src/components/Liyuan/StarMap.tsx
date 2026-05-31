import React, { useEffect, useRef, useState, useCallback } from "react";
import { Drawer } from "@mantine/core";
import * as d3 from "d3";
import starLight from "../../data/starLight.json";

interface Star {
  i: number; c: number[]; p: number; n: number; d: string;
}

const STARS = starLight as Star[];

const ANCHORS = [
  { label: "生", color: [184, 146, 106] },
  { label: "旦", color: [150, 84, 77] },
  { label: "净", color: [94, 107, 118] },
  { label: "丑", color: [127, 150, 141] },
];

interface SimNode extends d3.SimulationNodeDatum {
  id: string; isAnchor: boolean; anchorIdx?: number;
  color: number[]; charCount: number; purity: number; starIdx: number;
}
interface SimLink extends d3.SimulationLinkDatum<SimNode> { value: number; }

interface DetailData {
  t: string; s: string; ch: { name: string; role: string; parent: string }[];
  pl: string; an: string; sn: string;
}

const StarMap: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const zoomRef = useRef(1);
  const dragging = useRef(false);
  const lastXY = useRef({ x: 0, y: 0 });
  const hoveredRef = useRef<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<DetailData | null>(null);

  const loadDetail = useCallback(async (idx: number) => {
    const m = await import("../../data/starDetail.json");
    const d = (m.default as Record<string, DetailData>)[String(idx)];
    if (d) { setDetailData(d); setDetailOpen(true); }
  }, []);

  useEffect(() => {
    const container = containerRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const nodes: SimNode[] = [];
    const links: SimLink[] = [];
    const w = canvas.width / Math.min(devicePixelRatio, 2);
    const h = canvas.height / Math.min(devicePixelRatio, 2);

    const cx0 = w / 2, cy0 = h / 2;
    const r0 = Math.min(w, h) * 0.3;
    const apos = [
      { x: cx0 + r0, y: cy0 },
      { x: cx0, y: cy0 - r0 * 0.7 },
      { x: cx0 - r0, y: cy0 },
      { x: cx0, y: cy0 + r0 * 0.7 },
    ];
    ANCHORS.forEach((a, i) => {
      nodes.push({
        id: `a-${a.label}`, isAnchor: true, anchorIdx: i,
        color: a.color, charCount: 0, purity: 1, starIdx: -1,
        x: apos[i].x, y: apos[i].y, fx: apos[i].x, fy: apos[i].y,
      });
    });

    STARS.forEach(s => {
      const ai = ANCHORS.findIndex(a => a.label === s.d);
      if (ai < 0) return;
      const ang = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 180;
      nodes.push({
        id: `s-${s.i}`, isAnchor: false, anchorIdx: ai,
        color: s.c, charCount: s.n, purity: s.p, starIdx: s.i,
        x: apos[ai].x + Math.cos(ang) * dist,
        y: apos[ai].y + Math.sin(ang) * dist,
      });
      links.push({ source: `s-${s.i}`, target: `a-${ANCHORS[ai].label}`, value: 0.5 + s.p * 2 });
    });

    // 锚点互联 — 四大行当本身互通
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        links.push({ source: `a-${ANCHORS[i].label}`, target: `a-${ANCHORS[j].label}`, value: 0.6 });
      }
    }

    nodesRef.current = nodes;
    linksRef.current = links;

    const sim = d3.forceSimulation<SimNode>(nodes)
      .force("link", d3.forceLink<SimNode, SimLink>(links).id(d => d.id).distance(l => 100 / l.value).strength(l => l.value * 0.2))
      .force("charge", d3.forceManyBody().strength(d => (d as SimNode).isAnchor ? -1500 : -40))
      .force("charge", d3.forceManyBody().strength(d => (d as SimNode).isAnchor ? -800 : -60))
      .force("center", d3.forceCenter(cx0, cy0).strength(0.01))
      .force("collide", d3.forceCollide().radius(d => (d as SimNode).isAnchor ? 50 : 3 + (d as SimNode).charCount * 0.15))
      .alphaDecay(0.003);

    // 渲染
    const pickBuf = document.createElement("canvas");
    const pickCtx = pickBuf.getContext("2d")!;

    let animId = 0;
    const render = () => {
      const rw = canvas.width / Math.min(devicePixelRatio, 2);
      const rh = canvas.height / Math.min(devicePixelRatio, 2);
      const tx = txRef.current, ty = tyRef.current, zoom = zoomRef.current;

      ctx.clearRect(0, 0, rw, rh);
      pickBuf.width = rw; pickBuf.height = rh;
      pickCtx.clearRect(0, 0, rw, rh);

      // 2D 投影：平移 + 缩放
      const toScreen = (nx: number, ny: number) => ({
        sx: tx + nx * zoom,
        sy: ty + ny * zoom,
      });

      // 连线
      ctx.globalAlpha = 0.12;
      for (const l of links) {
        const s = l.source as SimNode;
        const t = l.target as SimNode;
        const a = toScreen(s.x!, s.y!);
        const b = toScreen(t.x!, t.y!);
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
        ctx.strokeStyle = `rgb(${t.color[0]},${t.color[1]},${t.color[2]})`;
        ctx.lineWidth = l.value * zoom;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // 锚点
      for (const n of nodes) {
        if (!n.isAnchor) continue;
        const p = toScreen(n.x!, n.y!);
        const [cr, cg, cb] = n.color;
        const rr = 55 * zoom;

        const grad = ctx.createRadialGradient(p.sx, p.sy, rr * 0.2, p.sx, p.sy, rr);
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.3)`);
        grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        ctx.beginPath(); ctx.arc(p.sx, p.sy, rr, 0, Math.PI * 2);
        ctx.fillStyle = grad; ctx.fill();

        ctx.beginPath(); ctx.arc(p.sx, p.sy, 30 * zoom, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#fff";
        ctx.font = `bold ${Math.round(18 * zoom)}px "PT Serif", serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(ANCHORS[n.anchorIdx!].label, p.sx, p.sy);
      }

      // 剧本节点
      const hovered = hoveredRef.current;
      for (const n of nodes) {
        if (n.isAnchor) continue;
        const p = toScreen(n.x!, n.y!);
        const [cr, cg, cb] = n.color;
        const r = Math.max(2, 3 + n.charCount * 0.25 * zoom);
        const alpha = 0.35 + n.purity * 0.65;

        if (n.charCount > 5 || n.starIdx === hovered) {
          const gr = ctx.createRadialGradient(p.sx, p.sy, r * 0.2, p.sx, p.sy, r * 2.5);
          gr.addColorStop(0, `rgba(${cr},${cg},${cb},${alpha * 0.5})`);
          gr.addColorStop(1, "rgba(0,0,0,0)");
          ctx.beginPath(); ctx.arc(p.sx, p.sy, r * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = gr; ctx.fill();
        }

        ctx.beginPath(); ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`;
        ctx.fill();

        if (n.starIdx === hovered) {
          ctx.beginPath(); ctx.arc(p.sx, p.sy, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
        }

        const pc = `rgb(${(n.starIdx >> 16) & 255},${(n.starIdx >> 8) & 255},${n.starIdx & 255})`;
        pickCtx.beginPath(); pickCtx.arc(p.sx, p.sy, Math.max(r, 6), 0, Math.PI * 2);
        pickCtx.fillStyle = pc; pickCtx.fill();
      }

      animId = requestAnimationFrame(render);
    };
    animId = requestAnimationFrame(render);

    const ro = new ResizeObserver(() => { resize(); });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      sim.stop();
      ro.disconnect();
    };
  }, []);

  const pick = (ex: number, ey: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = ex - rect.left, y = ey - rect.top;
    const tx = txRef.current, ty = tyRef.current, zoom = zoomRef.current;
    let best: number | null = null, bestD = Infinity;
    for (const n of nodesRef.current) {
      if (n.isAnchor) continue;
      const sx = tx + n.x! * zoom;
      const sy = ty + n.y! * zoom;
      const d = Math.hypot(sx - x, sy - y);
      if (d < 15 && d < bestD) { bestD = d; best = n.starIdx; }
    }
    return best;
  };

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0, overflow: "hidden", background: "radial-gradient(ellipse at center, rgba(246,241,231,.4) 0%, rgba(233,223,201,.2) 100%)" }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", cursor: "grab" }}
        onMouseDown={e => { dragging.current = true; lastXY.current = { x: e.clientX, y: e.clientY }; }}
        onMouseMove={e => {
          if (dragging.current) {
            const dx = e.clientX - lastXY.current.x;
            const dy = e.clientY - lastXY.current.y;
            txRef.current += dx;
            tyRef.current += dy;
            lastXY.current = { x: e.clientX, y: e.clientY };
          } else {
            hoveredRef.current = pick(e.clientX, e.clientY);
          }
        }}
        onMouseUp={() => { dragging.current = false; }}
        onMouseLeave={() => { dragging.current = false; hoveredRef.current = null; }}
        onClick={e => {
          if (dragging.current) return;
          const idx = pick(e.clientX, e.clientY);
          if (idx !== null) loadDetail(idx);
        }}
        onWheel={e => {
          e.preventDefault();
          zoomRef.current *= e.deltaY > 0 ? 0.92 : 1.08;
          zoomRef.current = Math.max(0.3, Math.min(4, zoomRef.current));
        }}
      />
      <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, textAlign: "center", pointerEvents: "none" }}>
        <span style={{ fontSize: 10, color: "var(--theme-text-soft)", opacity: 0.5 }}>
          拖拽平移 · 滚轮缩放 · 点击节点查看剧本详情
        </span>
      </div>

      <Drawer
        opened={detailOpen}
        onClose={() => setDetailOpen(false)}
        position="right" size="420px"
        title={detailData?.t || "剧本详情"}
        styles={{ title: { fontFamily: '"PT Serif", serif', fontSize: 18, fontWeight: 700 } }}
      >
        {detailData && (
          <div style={{ fontSize: 13, lineHeight: 1.8 }}>
            <p style={{ color: "var(--theme-text-soft)", fontSize: 12, marginTop: 0 }}>📚 {detailData.s}</p>
            <h4 style={{ margin: "12px 0 4px", fontSize: 14 }}>🎭 主要角色</h4>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {detailData.ch.map((c, i) => (
                <span key={i} style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, background: "var(--gold-lightest)", color: "var(--theme-wood)" }}>
                  {c.name}：{c.role}
                </span>
              ))}
            </div>
            <h4 style={{ margin: "12px 0 4px", fontSize: 14 }}>📖 情节</h4>
            <p style={{ fontSize: 12, color: "var(--theme-text-soft)", margin: 0 }}>{detailData.pl || "暂无"}</p>
            {detailData.an && (
              <>
                <h4 style={{ margin: "12px 0 4px", fontSize: 14 }}>📝 注释</h4>
                <p style={{ fontSize: 12, color: "var(--theme-text-soft)", margin: 0 }}>{detailData.an}</p>
              </>
            )}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--theme-border-soft)", fontSize: 11, color: "var(--theme-text-soft)" }}>
              来源：{detailData.sn || detailData.s}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default StarMap;
