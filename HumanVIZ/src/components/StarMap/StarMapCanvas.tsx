/**
 * 梨园星图 — ORCA-style radial network with filters, character click, animations
 */

import React, { useEffect, useRef, useCallback, useState } from "react";
import * as d3 from "d3";
import type { StarMapData, ScriptNode } from "./types";
import starmapData from "../../data/starmap_data.json";
import "./StarMapCanvas.scss";

const data = starmapData as unknown as StarMapData;
const PI = Math.PI;
const TAU = PI * 2;
const PR = Math.max(window.devicePixelRatio || 1, 2);

const COLOR_BG = "#f7f7f7";
const COLOR_CENTER = "#a682e8";
const COLOR_CHAR = "#ea9df5";
const COLOR_LINK = "#e8e8e8";
const COLOR_TEXT = "#4d4950";
const COLOR_TEXT_SOFT = "#8b7355";

const THEME_COLORS: Record<string, string> = {
  忠义报国: "#b8926a", 征战讨伐: "#8b5e3c", 冤案昭雪: "#6b7b8e",
  权谋斗争: "#5e6b76", 爱情姻缘: "#c77d8b", 家庭伦理: "#96544d",
  神话灵异: "#7f968d", 侠义江湖: "#5a8a6e", 智谋韬略: "#c4a56e",
  科举功名: "#a08860", 宫廷朝堂: "#8b7b6e", 生死离别: "#7a6b8e",
};

const NARR_COLORS: Record<string, string> = {
  渐进式: "#b8926a", 突变式: "#96544d", 双线交织: "#5e6b76", 回环式: "#7f968d",
};

const scaleLinkWidth = d3.scalePow().exponent(0.75).domain([1, 50]).range([0.5, 4]).clamp(true);

// ── Filter types ──
type FilterMode = "genre" | "theme" | "narr";

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  type: "center" | "character" | "script";
  r: number;
  name?: string;
  role?: string;
  roleColor?: string;
  scripts?: number;
  totalDegree?: number;
  script?: ScriptNode;
  neighbors?: SimNode[];
  neighborLinks?: SimLink[];
}
interface SimLink extends d3.SimulationLinkDatum<SimNode> { weight: number; }

// ─────────────────────────────────────────────────────────────
// Build data
// ─────────────────────────────────────────────────────────────

function buildData(w: number, h: number) {
  const cx = w / 2, cy = h / 2;
  const scripts = data.scripts;
  const maxChars = Math.max(...scripts.map(s => s.charCount), 1);

  const center: SimNode = { id: "__center__", type: "center", r: 40, fx: cx, fy: cy };

  const charMap = new Map<string, { deg: number; cnt: number; role: string; color: string }>();
  for (const genre of data.config.genreOrder) {
    for (const ch of (data.genreCharacters[genre] || [])) {
      const e = charMap.get(ch.name);
      if (e) { e.deg += ch.totalDegree; e.cnt += ch.scripts; }
      else charMap.set(ch.name, { deg: ch.totalDegree, cnt: ch.scripts, role: ch.role, color: ch.roleColor });
    }
  }
  const topChars = [...charMap.entries()].sort((a, b) => b[1].deg - a[1].deg).slice(0, 30);

  const PAD = 14;
  const charNodes: SimNode[] = topChars.map(([name, info]) => ({
    id: `c:${name}`, type: "character" as const,
    r: 6 + Math.sqrt(info.cnt) * 3, name, role: info.role, roleColor: info.color,
    scripts: info.cnt, totalDegree: info.deg,
  }));

  const sumR = charNodes.reduce((a, d) => a + d.r * 2 + PAD, 0);
  const R = sumR / TAU;
  let ang = 0;
  for (const d of charNodes) {
    const arc = d.r * 2 + PAD;
    const ca = (arc / R) / 2;
    d.x = cx + R * Math.cos(ang + ca - PI / 2);
    d.y = cy + R * Math.sin(ang + ca - PI / 2);
    d.fx = d.x; d.fy = d.y;
    ang += ca * 2;
  }

  const scriptNodes: SimNode[] = scripts.map(s => ({
    id: s.id, type: "script" as const,
    r: 4 + Math.sqrt(s.charCount / maxChars) * 14, script: s,
  }));

  const charSet = new Set(topChars.map(([n]) => n));
  const links: SimLink[] = [];
  for (const sn of scriptNodes) {
    for (const cn of sn.script!.topChars) {
      if (charSet.has(cn)) links.push({ source: sn.id, target: `c:${cn}`, weight: 1 });
    }
  }

  // Per-character mini-simulation
  for (const charNode of charNodes) {
    const connected = scriptNodes.filter(s => s.script!.topChars.includes(charNode.name!));
    if (connected.length === 0) continue;
    const localSim = d3.forceSimulation(connected)
      .force("col", d3.forceCollide().radius((d: any) => d.r + 2).strength(0.8))
      .force("x", d3.forceX(0).strength(0.1))
      .force("y", d3.forceY(0).strength(0.1))
      .alphaDecay(0.05).stop();
    for (let i = 0; i < 100; i++) localSim.tick();
    let maxR = charNode.r;
    for (const s of connected) {
      const dist = Math.sqrt((s.x ?? 0) ** 2 + (s.y ?? 0) ** 2) + s.r;
      maxR = Math.max(maxR, dist);
    }
    (charNode as any).max_radius = maxR;
  }

  return { nodes: [center, ...charNodes, ...scriptNodes], links, R };
}

function curvedLinkPath(x1: number, y1: number, x2: number, y2: number, curvature = 0.2): string {
  const dx = x2 - x1, dy = y2 - y1;
  return `M${x1},${y1}Q${(x1 + x2) / 2 - dy * curvature},${(y1 + y2) / 2 + dx * curvature},${x2},${y2}`;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

interface Props { onScriptSelect?: (s: ScriptNode) => void; }

const StarMapCanvas: React.FC<Props> = ({ onScriptSelect }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLCanvasElement>(null);
  const hovRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const viewRef = useRef({ zoom: 1, px: 0, py: 0 });
  const dragRef = useRef({ on: false, lx: 0, ly: 0 });
  const drawRef = useRef<(() => void) | null>(null);
  const filterRef = useRef<Set<string>>(new Set());
  const charRef = useRef<string | null>(null);

  const [zoom, setZoom] = useState(1);
  const [selectedDetail, setSelectedDetail] = useState<ScriptNode | null>(null);
  const [selectedChar, setSelectedChar] = useState<string | null>(null);

  // ── Filter state ──
  const [filterMode, setFilterMode] = useState<FilterMode>("genre");
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  // Get filter options based on mode
  const filterOptions = filterMode === "genre"
    ? data.config.genreOrder
    : filterMode === "theme"
    ? data.config.themeOrder
    : data.config.narrTypes;

  const filterColors = filterMode === "genre"
    ? data.config.genreColors
    : filterMode === "theme"
    ? THEME_COLORS
    : NARR_COLORS;

  // Toggle a filter value
  const toggleFilter = (val: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      return next;
    });
  };

  const clearFilters = () => setActiveFilters(new Set());

  // Combined dimming check — reads from refs for use inside draw()
  const isScriptDimmed = useCallback((s: ScriptNode): boolean => {
    const af = filterRef.current;
    const sc = charRef.current;
    const filterPass = af.size === 0 || (
      filterMode === "genre" ? af.has(s.genre) :
      filterMode === "theme" ? s.topThemes.some(t => af.has(t)) :
      af.has(s.narrType)
    );
    const charPass = !sc || s.topChars.includes(sc);
    if (af.size > 0 && sc) return filterPass && charPass;
    if (af.size > 0) return !filterPass;
    if (sc) return !charPass;
    return false;
  }, [filterMode]);

  // ── Init ──
  useEffect(() => {
    const box = boxRef.current, mc = mainRef.current, hc = hovRef.current;
    if (!box || !mc || !hc) return;

    try {
      const { width: w, height: h } = box.getBoundingClientRect();
      const cw = w || 800, ch = h || 600;
      mc.width = cw * PR; mc.height = ch * PR;
      hc.width = cw * PR; hc.height = ch * PR;
      mc.style.width = hc.style.width = `${cw}px`;
      mc.style.height = hc.style.height = `${ch}px`;

      const fz = Math.min(cw, ch) / 1500 * 0.85;
      viewRef.current.zoom = fz;
      setZoom(fz);

      const { nodes, links, R } = buildData(cw, ch);
      nodesRef.current = nodes;
      linksRef.current = links;

      const sim = d3.forceSimulation<SimNode>(nodes)
        .force("link", d3.forceLink<SimNode, SimLink>(links).id(d => d.id).strength(0.05).distance(30))
        .force("charge", d3.forceManyBody().strength(-20))
        .force("col", d3.forceCollide().radius((d: any) => d.r + 2).strength(0.8))
        .force("rad", d3.forceRadial((d: any) => d.type === "script" ? R * 1.1 : 0, cw / 2, ch / 2).strength((d: any) => d.type === "script" ? 0.08 : 0))
        .force("x", d3.forceX(cw / 2).strength((d: any) => d.type === "script" ? 0.01 : 0))
        .force("y", d3.forceY(ch / 2).strength((d: any) => d.type === "script" ? 0.01 : 0))
        .alphaDecay(0.02).velocityDecay(0.3)
        .on("tick", () => { try { draw(); } catch (_) {} });

      simRef.current = sim;

      function draw() {
        const ctx = mc!.getContext("2d");
        if (!ctx) return;
        const W = mc!.width, H = mc!.height;
        const { zoom: z, px, py } = viewRef.current;
        const ns = nodesRef.current;
        const lks = linksRef.current;

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = COLOR_BG;
        ctx.fillRect(0, 0, W, H);

        const cn = ns.find(n => n.type === "center");
        const scx = cn?.x ?? cw / 2, scy = cn?.y ?? ch / 2;

        ctx.save();
        ctx.translate(W / 2 + px * PR, H / 2 + py * PR);
        ctx.scale(z * PR, z * PR);
        ctx.translate(-scx, -scy);

        // ── Character ring ──
        if (cn && cn.x != null && cn.y != null) {
          let maxR = 0;
          for (const n of ns) {
            if (n.type === "character" && n.x != null && n.y != null)
              maxR = Math.max(maxR, Math.hypot(n.x - cn.x, n.y - cn.y));
          }
          ctx.strokeStyle = "rgba(184,147,106,0.12)"; ctx.lineWidth = 1;
          ctx.setLineDash([6, 4]);
          ctx.beginPath(); ctx.arc(cn.x, cn.y, maxR, 0, TAU); ctx.stroke();
          ctx.setLineDash([]);
        }

        // ── Curved links ──
        for (const l of lks) {
          const s = l.source as SimNode, t = l.target as SimNode;
          if (s.x == null || t.x == null) continue;

          // Check if link is between a dimmed script and a character
          const scriptNode = s.type === "script" ? s : t.type === "script" ? t : null;
          const isDimmed = scriptNode?.script ? isScriptDimmed(scriptNode.script) : false;

          const dist = Math.hypot(t.x - s.x, t.y! - s.y!);
          const curvature = 0.15 + Math.min(dist / 1000, 0.15);
          const sc = s.type === "character" ? (s.roleColor || COLOR_CHAR) : (s.script?.genreColor || COLOR_LINK);
          const tc = t.type === "character" ? (t.roleColor || COLOR_CHAR) : (t.script?.genreColor || COLOR_LINK);
          const grad = ctx.createLinearGradient(s.x, s.y!, t.x, t.y!);
          const so = s.r / dist;
          grad.addColorStop(Math.min(so, 0.5), sc);
          grad.addColorStop(1, tc);
          ctx.strokeStyle = grad;
          ctx.lineWidth = scaleLinkWidth(l.weight);
          ctx.globalAlpha = isDimmed ? 0.04 : 0.15;
          ctx.beginPath();
          ctx.stroke(new Path2D(curvedLinkPath(s.x, s.y!, t.x, t.y!, curvature)));
        }
        ctx.globalAlpha = 1;

        // ── Script nodes ──
        for (const n of ns) {
          if (n.type !== "script" || !n.script || n.x == null || n.y == null) continue;
          const x = n.x, y = n.y, r = n.r;
          const s = n.script;
          const dimmed = isScriptDimmed(s);
          const alpha = dimmed ? 0.1 : 0.85;

          ctx.shadowColor = dimmed ? "transparent" : "rgba(0,0,0,0.08)";
          ctx.shadowBlur = dimmed ? 0 : Math.max(2, r * 0.3);
          ctx.shadowOffsetY = 1;

          ctx.globalAlpha = alpha;
          ctx.fillStyle = s.genreColor;
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();

          ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;

          if (!dimmed) {
            ctx.strokeStyle = COLOR_BG;
            ctx.lineWidth = Math.max(1, r * 0.07);
            ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();

            // Theme arcs (outer)
            if (r > 5 && s.themePresent.length > 0) {
              const themes = data.config.themeOrder;
              const as = new Set(s.themePresent);
              const aa = TAU / themes.length;
              ctx.lineWidth = Math.max(1.5, r * 0.12);
              for (let i = 0; i < themes.length; i++) {
                if (!as.has(themes[i])) continue;
                ctx.strokeStyle = THEME_COLORS[themes[i]] || "#999";
                ctx.globalAlpha = 0.6;
                ctx.beginPath(); ctx.arc(x, y, r + 2, i * aa - PI / 2 + 0.03, (i + 1) * aa - PI / 2 - 0.03); ctx.stroke();
              }
            }

            // Narrative arc (inner)
            if (r > 5 && s.narrType) {
              ctx.strokeStyle = NARR_COLORS[s.narrType] || "#999";
              ctx.lineWidth = Math.max(2, r * 0.15);
              ctx.globalAlpha = 0.7;
              ctx.beginPath();
              ctx.arc(x, y, r - 2, -PI / 2, -PI / 2 + TAU * 0.75);
              ctx.stroke();
            }
          }
          ctx.globalAlpha = 1;
        }

        // ── Character nodes ──
        for (const n of ns) {
          if (n.type !== "character" || n.x == null || n.y == null) continue;
          const x = n.x, y = n.y, r = n.r;
          const isCharSelected = selectedChar === n.name;

          ctx.shadowColor = "rgba(0,0,0,0.06)";
          ctx.shadowBlur = Math.max(2, r * 0.3);
          ctx.shadowOffsetY = 1;

          ctx.globalAlpha = isCharSelected ? 1 : 0.75;
          ctx.fillStyle = n.roleColor || COLOR_CHAR;
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();

          ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;

          ctx.strokeStyle = isCharSelected ? "#fff" : COLOR_BG;
          ctx.lineWidth = isCharSelected ? 2.5 : Math.max(1, r * 0.07);
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();

          if (isCharSelected) {
            ctx.strokeStyle = n.roleColor || COLOR_CHAR;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(x, y, r + 4, 0, TAU); ctx.stroke();
          }

          ctx.globalAlpha = 1;

          if (z > 0.5) {
            const a = Math.atan2(y - (cn?.y ?? 0), x - (cn?.x ?? 0));
            const lx = x + Math.cos(a) * (r + 6);
            const ly = y + Math.sin(a) * (r + 6);
            ctx.strokeStyle = COLOR_BG; ctx.lineWidth = 3; ctx.lineJoin = "round";
            ctx.font = `${isCharSelected ? "bold" : "400"} ${isCharSelected ? 12 : 10}px "Noto Sans SC",sans-serif`;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.strokeText(n.name || "", lx, ly);
            ctx.fillStyle = isCharSelected ? COLOR_TEXT : COLOR_TEXT;
            ctx.globalAlpha = isCharSelected ? 1 : 0.8;
            ctx.fillText(n.name || "", lx, ly);
            ctx.globalAlpha = 1;
          }
        }

        // ── Center node ──
        if (cn && cn.x != null && cn.y != null) {
          const { x, y, r } = cn;
          ctx.globalAlpha = 0.06; ctx.fillStyle = COLOR_CENTER;
          ctx.beginPath(); ctx.arc(x, y, r + 20, 0, TAU); ctx.fill();
          ctx.globalAlpha = 1;

          ctx.shadowColor = "rgba(0,0,0,0.1)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
          ctx.fillStyle = COLOR_CENTER + "20"; ctx.strokeStyle = COLOR_CENTER; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;

          ctx.save();
          ctx.beginPath(); ctx.arc(x, y, r - 2, 0, TAU); ctx.clip();
          ctx.fillStyle = COLOR_CENTER;
          ctx.font = `bold 15px "PT Serif","Noto Serif SC",serif`;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText("京剧", x, y - 7);
          ctx.font = `400 11px "Noto Sans SC",sans-serif`;
          ctx.fillStyle = COLOR_TEXT_SOFT;
          ctx.fillText(`${data.meta.totalScripts}部`, x, y + 10);
          ctx.restore();
        }

        ctx.restore();
      }

      drawRef.current = draw;

      const onResize = () => {
        const r = box!.getBoundingClientRect();
        const nw = r.width || 800, nh = r.height || 600;
        mc!.width = nw * PR; mc!.height = nh * PR;
        hc!.width = nw * PR; hc!.height = nh * PR;
        mc!.style.width = hc!.style.width = `${nw}px`;
        mc!.style.height = hc!.style.height = `${nh}px`;
        try { draw(); } catch (_) {}
      };
      window.addEventListener("resize", onResize);
      return () => { sim.stop(); window.removeEventListener("resize", onResize); };
    } catch (err) {
      console.error("StarMap init error:", err);
    }
  }, []);

  // ── Sync state to refs and redraw when filters/char change ──
  useEffect(() => {
    filterRef.current = activeFilters;
    charRef.current = selectedChar;
    try { drawRef.current?.(); } catch (_) {}
  }, [activeFilters, selectedChar, filterMode]);

  // ── Hover ──
  const drawHover = useCallback((node: SimNode | null) => {
    const mc = mainRef.current, hc = hovRef.current;
    if (!mc || !hc) return;

    if (node) {
      mc.style.opacity = node.type === "character" ? "0.15" : "0.3";
      mc.style.transition = "opacity 200ms ease-in";
    } else {
      mc.style.opacity = "1";
      mc.style.transition = "opacity 200ms ease-in";
    }

    const ctx = hc.getContext("2d");
    if (!ctx) return;
    const W = hc.width, H = hc.height;
    const { zoom: z, px, py } = viewRef.current;
    ctx.clearRect(0, 0, W, H);
    if (!node || node.x == null) return;

    const cn = nodesRef.current.find(n => n.type === "center");
    const scx = cn?.x ?? 0, scy = cn?.y ?? 0;

    ctx.save();
    ctx.translate(W / 2 + px * PR, H / 2 + py * PR);
    ctx.scale(z * PR, z * PR);
    ctx.translate(-scx, -scy);

    if (!node.neighbors) {
      const lks = linksRef.current;
      const neighborSet = new Set<string>();
      const neighborLinks: SimLink[] = [];
      for (const l of lks) {
        const s = l.source as SimNode, t = l.target as SimNode;
        if (s.id === node.id) { neighborSet.add(t.id); neighborLinks.push(l); }
        if (t.id === node.id) { neighborSet.add(s.id); neighborLinks.push(l); }
      }
      node.neighbors = nodesRef.current.filter(n => neighborSet.has(n.id));
      node.neighborLinks = neighborLinks;
    }

    // Neighbor links
    for (const l of node.neighborLinks!) {
      const s = l.source as SimNode, t = l.target as SimNode;
      if (s.x == null || t.x == null) continue;
      const dist = Math.hypot(t.x - s.x, t.y! - s.y!);
      const curvature = 0.15 + Math.min(dist / 1000, 0.15);
      const sc = s.type === "character" ? (s.roleColor || COLOR_CHAR) : (s.script?.genreColor || COLOR_LINK);
      const tc = t.type === "character" ? (t.roleColor || COLOR_CHAR) : (t.script?.genreColor || COLOR_LINK);
      const grad = ctx.createLinearGradient(s.x, s.y!, t.x, t.y!);
      grad.addColorStop(0, sc); grad.addColorStop(1, tc);
      ctx.strokeStyle = grad;
      ctx.lineWidth = scaleLinkWidth(l.weight) * 1.5;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.stroke(new Path2D(curvedLinkPath(s.x, s.y!, t.x, t.y!, curvature)));
    }
    ctx.globalAlpha = 1;

    // Neighbor nodes
    for (const n of node.neighbors!) {
      if (n.x == null) continue;
      const color = n.type === "character" ? (n.roleColor || COLOR_CHAR) : (n.script?.genreColor || COLOR_CENTER);
      ctx.shadowColor = "rgba(0,0,0,0.08)"; ctx.shadowBlur = Math.max(2, n.r * 0.3);
      ctx.globalAlpha = 0.8; ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(n.x, n.y!, n.r, 0, TAU); ctx.fill();
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
      ctx.strokeStyle = COLOR_BG; ctx.lineWidth = Math.max(1, n.r * 0.07);
      ctx.beginPath(); ctx.arc(n.x, n.y!, n.r, 0, TAU); ctx.stroke();

      if (n.type === "script" && n.script && n.r > 5) {
        const themes = data.config.themeOrder;
        const as = new Set(n.script.themePresent);
        const aa = TAU / themes.length;
        ctx.lineWidth = Math.max(1.5, n.r * 0.12);
        for (let i = 0; i < themes.length; i++) {
          if (!as.has(themes[i])) continue;
          ctx.strokeStyle = THEME_COLORS[themes[i]] || "#999";
          ctx.globalAlpha = 0.6;
          ctx.beginPath(); ctx.arc(n.x, n.y!, n.r + 2, i * aa - PI / 2 + 0.03, (i + 1) * aa - PI / 2 - 0.03); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      if (n.type === "character") {
        const a = Math.atan2(n.y! - scy, n.x - scx);
        ctx.strokeStyle = COLOR_BG; ctx.lineWidth = 3; ctx.lineJoin = "round";
        ctx.font = `bold 11px "Noto Sans SC",sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.strokeText(n.name || "", n.x + Math.cos(a) * (n.r + 6), n.y! + Math.sin(a) * (n.r + 6));
        ctx.fillStyle = COLOR_TEXT;
        ctx.fillText(n.name || "", n.x + Math.cos(a) * (n.r + 6), n.y! + Math.sin(a) * (n.r + 6));
      }
    }

    // Hovered node
    const hx = node.x, hy = node.y!, hr = node.r;
    const nodeColor = node.type === "character" ? (node.roleColor || COLOR_CHAR) : (node.script?.genreColor || COLOR_CENTER);
    ctx.shadowColor = "rgba(0,0,0,0.12)"; ctx.shadowBlur = 6;
    ctx.fillStyle = nodeColor;
    ctx.beginPath(); ctx.arc(hx, hy, hr, 0, TAU); ctx.fill();
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
    const ringOffset = node.type === "character" ? 9 : 7;
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(hx, hy, hr + ringOffset - 2, 0, TAU); ctx.stroke();
    ctx.strokeStyle = nodeColor; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(hx, hy, hr + ringOffset, 0, TAU); ctx.stroke();

    ctx.restore();

    // Tooltip
    drawTooltip(ctx, node, z, px, py, W, H, scx, scy);
  }, []);

  function drawTooltip(
    ctx: CanvasRenderingContext2D, node: SimNode,
    z: number, px: number, py: number, cw: number, ch: number,
    scx: number, scy: number,
  ) {
    const sx = (node.x! - scx) * z + cw / (2 * PR) + px;
    const sy = (node.y! - scy) * z + ch / (2 * PR) + py;
    const pad = 24, lh = 44;

    let lines: { t: string; b: boolean; c: string; s: number }[] = [];
    if (node.type === "script" && node.script) {
      const s = node.script;
      lines = [
        { t: "剧本", b: false, c: s.genreColor, s: 22 },
        { t: `《${s.titleShort}》`, b: true, c: COLOR_TEXT, s: 32 },
        { t: `${s.genre} · ${s.narrType}`, b: false, c: COLOR_TEXT_SOFT, s: 26 },
        { t: `角色 ${s.charCount} · 场次 ${s.sceneCount} · 密度 ${s.density.toFixed(2)}`, b: false, c: COLOR_TEXT, s: 22 },
      ];
      if (s.topThemes.length) lines.push({ t: `主题: ${s.topThemes.join("、")}`, b: false, c: COLOR_TEXT_SOFT, s: 20 });
      if (s.topChars.length) lines.push({ t: `角色: ${s.topChars.slice(0, 5).join("、")}`, b: false, c: COLOR_TEXT_SOFT, s: 20 });
    } else if (node.type === "character") {
      lines = [
        { t: "角色", b: false, c: node.roleColor || COLOR_CHAR, s: 22 },
        { t: node.name || "", b: true, c: COLOR_TEXT, s: 32 },
        { t: `行当: ${node.role}`, b: false, c: COLOR_TEXT_SOFT, s: 26 },
        { t: `出现剧目: ${node.scripts}部`, b: false, c: COLOR_TEXT, s: 26 },
      ];
    }
    if (lines.length === 0) return;

    let mw = 0;
    for (const l of lines) { ctx.font = `${l.b ? "bold" : "400"} ${l.s}px "Noto Sans SC",sans-serif`; mw = Math.max(mw, ctx.measureText(l.t).width); }
    const bw = Math.max(mw + pad * 2, 420), bh = lines.length * lh + pad * 2 + 14;
    const bx = Math.min(sx + 30, cw / PR - bw - 12), by = Math.max(sy - bh / 2, 12);

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.15)"; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4;
    ctx.fillStyle = "rgba(250,248,242,0.98)";
    rr(ctx, bx, by, bw, bh, 16); ctx.fill();
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;

    const stripeColor = node.type === "character" ? (node.roleColor || COLOR_CHAR) : (node.script?.genreColor || COLOR_CENTER);
    ctx.fillStyle = stripeColor;
    rr(ctx, bx, by, bw, 14, 16); ctx.fill();

    let ty = by + pad + 30;
    ctx.textAlign = "left";
    for (const l of lines) {
      ctx.font = `${l.b ? "bold" : "400"} ${l.s}px "Noto Sans SC",sans-serif`;
      ctx.fillStyle = l.c;
      ctx.fillText(l.t, bx + pad, ty, bw - pad * 2);
      ty += lh;
    }
    ctx.restore();
  }

  // ── Mouse ──
  const toSim = (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    const { zoom: z, px, py } = viewRef.current;
    const cn = nodesRef.current.find(n => n.type === "center");
    return {
      x: (e.clientX - r.left - r.width / 2 - px) / z + (cn?.x ?? 0),
      y: (e.clientY - r.top - r.height / 2 - py) / z + (cn?.y ?? 0),
    };
  };

  const findNode = (mx: number, my: number) => {
    let best: SimNode | null = null, bd = Infinity;
    for (const n of nodesRef.current) {
      if (n.x == null || n.y == null) continue;
      const d = Math.hypot(mx - n.x, my - n.y);
      if (d < n.r + 20 && d < bd) { bd = d; best = n; }
    }
    return best;
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const v = viewRef.current;
    const f = e.deltaY > 0 ? 0.92 : 1.08;
    const nz = Math.max(0.2, Math.min(8, v.zoom * f));
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left - r.width / 2;
    const my = e.clientY - r.top - r.height / 2;
    v.px = mx - (mx - v.px) * (nz / v.zoom);
    v.py = my - (my - v.py) * (nz / v.zoom);
    v.zoom = nz;
    setZoom(nz);
    try { simRef.current?.alpha(0.1).restart(); } catch (_) {}
  };

  const onDown = (e: React.MouseEvent) => { if (e.button === 0) { dragRef.current = { on: true, lx: e.clientX, ly: e.clientY }; (e.target as HTMLElement).style.cursor = "grabbing"; } };
  const onMove = (e: React.MouseEvent) => {
    const d = dragRef.current;
    if (d.on) {
      viewRef.current.px += e.clientX - d.lx;
      viewRef.current.py += e.clientY - d.ly;
      d.lx = e.clientX; d.ly = e.clientY;
      try { simRef.current?.alpha(0.05).restart(); } catch (_) {}
      return;
    }
    const p = toSim(e);
    const n = findNode(p.x, p.y);
    (e.target as HTMLElement).style.cursor = n ? "pointer" : "grab";
    drawHover(n);
  };
  const onUp = (e: React.MouseEvent) => { dragRef.current.on = false; (e.target as HTMLElement).style.cursor = "grab"; };
  const onLeave = () => { dragRef.current.on = false; drawHover(null); };

  const onClick = (e: React.MouseEvent) => {
    const p = toSim(e); const n = findNode(p.x, p.y);
    if (n?.type === "character" && n.name) {
      // Toggle character selection
      setSelectedChar(prev => prev === n.name ? null : n.name!);
      drawHover(null);
    } else if (n?.script) {
      setSelectedDetail(n.script);
      onScriptSelect?.(n.script);
    }
  };

  const onDblClick = () => {
    setSelectedChar(null);
    setActiveFilters(new Set());
    const box = boxRef.current; if (!box) return;
    const { width: w, height: h } = box.getBoundingClientRect();
    const fz = Math.min(w, h) / 1500 * 0.85;
    const s = { ...viewRef.current }, t0 = performance.now();
    const anim = (now: number) => {
      const t = Math.min(1, (now - t0) / 400);
      const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      viewRef.current.zoom = s.zoom + (fz - s.zoom) * e;
      viewRef.current.px = s.px * (1 - e); viewRef.current.py = s.py * (1 - e);
      setZoom(viewRef.current.zoom);
      try { simRef.current?.alpha(0.1).restart(); } catch (_) {}
      if (t < 1) requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
    drawHover(null);
  };

  return (
    <div className="starmap-container" ref={boxRef}>
      {/* ── Top card: tabs + chips + zoom ── */}
      <div className="starmap-top-card">
        {/* Top row: tabs + zoom */}
        <div className="starmap-top-row">
          <div className="starmap-tabs">
            {(["genre", "theme", "narr"] as FilterMode[]).map(m => (
              <button key={m}
                className={`starmap-tab ${filterMode === m ? "active" : ""}`}
                onClick={() => { setFilterMode(m); setActiveFilters(new Set()); }}>
                {m === "genre" ? "🎭 剧种" : m === "theme" ? "📜 主题" : "🎬 叙事"}
              </button>
            ))}
          </div>
          <span className="starmap-zoom-badge">{Math.round(zoom * 100)}%</span>
        </div>
        {/* Dashed divider */}
        <div className="starmap-divider" />
        {/* Bottom row: filter chips */}
        <div className="starmap-chips-row">
          {filterOptions.map(opt => {
            const color = filterColors[opt] || "#999";
            const active = activeFilters.has(opt);
            return (
              <button key={opt}
                className={`starmap-chip ${active ? "active" : ""}`}
                style={{ borderColor: color, color: active ? "#fff" : color, background: active ? color : "transparent" }}
                onClick={() => toggleFilter(opt)}>
                {opt}
                {filterMode === "genre" && (
                  <span className="starmap-chip-cnt">{data.genreGroups[opt]?.count || 0}</span>
                )}
              </button>
            );
          })}
          {activeFilters.size > 0 && (
            <button className="starmap-chip-clear" onClick={clearFilters}>✕ 清除</button>
          )}
        </div>
      </div>

      {/* ── Selected character indicator ── */}
      {selectedChar && (
        <div className="starmap-char-indicator">
          <span>聚焦角色：</span>
          <span className="starmap-char-name">{selectedChar}</span>
          <button className="starmap-char-clear" onClick={() => setSelectedChar(null)}>✕</button>
        </div>
      )}

      <canvas ref={mainRef} className="starmap-canvas starmap-canvas-main" />
      <canvas ref={hovRef} className="starmap-canvas starmap-canvas-hover"
        onWheel={onWheel} onMouseDown={onDown} onMouseMove={onMove}
        onMouseUp={onUp} onMouseLeave={onLeave} onClick={onClick} onDoubleClick={onDblClick} />

      {/* ── Detail overlay ── */}
      {selectedDetail && (
        <div className="starmap-detail-overlay" onClick={() => setSelectedDetail(null)}>
          <div className="starmap-detail-card" onClick={e => e.stopPropagation()}>
            <button className="starmap-detail-close" onClick={() => setSelectedDetail(null)}>✕</button>
            <div className="starmap-detail-header">
              <span className="starmap-detail-genre" style={{ color: selectedDetail.genreColor }}>{selectedDetail.genre}</span>
              <h2>《{selectedDetail.titleShort}》</h2>
              <span className="starmap-detail-narr" style={{ color: NARR_COLORS[selectedDetail.narrType] || "#999" }}>{selectedDetail.narrType}</span>
            </div>
            <div className="starmap-detail-grid">
              <div className="starmap-detail-panel">
                <h3>🕸️ 角色关系</h3>
                <div className="starmap-detail-role-bar">
                  {Object.entries(selectedDetail.roleDist).map(([role, count]) => (
                    <span key={role} className="starmap-detail-role-seg"
                      style={{ background: ({ 生:"#b8926a",旦:"#96544d",净:"#5e6b76",丑:"#7f968d" } as any)[role] || "#a0a0a0", flex: count as number }}>
                      {role} {count as number}
                    </span>
                  ))}
                </div>
                <div className="starmap-detail-chars">
                  {selectedDetail.topChars.slice(0, 8).map(c => <span key={c} className="starmap-detail-char-tag">{c}</span>)}
                </div>
              </div>
              <div className="starmap-detail-panel">
                <h3>🎬 叙事结构</h3>
                <div className="starmap-detail-ribbon">
                  <span className="starmap-detail-ribbon-seg" style={{ background: "#E74C3C", flex: selectedDetail.singingRatio || 0.01 }}>唱</span>
                  <span className="starmap-detail-ribbon-seg" style={{ background: "#3498DB", flex: selectedDetail.recitingRatio || 0.01 }}>念</span>
                  <span className="starmap-detail-ribbon-seg" style={{ background: "#95A5A6", flex: selectedDetail.speakingRatio || 0.01 }}>白</span>
                  <span className="starmap-detail-ribbon-seg" style={{ background: "#F39C12", flex: selectedDetail.fightingRatio || 0.01 }}>打</span>
                </div>
                <div className="starmap-detail-metrics">
                  <span>密度 <b>{selectedDetail.density.toFixed(2)}</b></span>
                  <span>聚类 <b>{selectedDetail.clustering.toFixed(2)}</b></span>
                  <span>集中度 <b>{selectedDetail.centralization.toFixed(2)}</b></span>
                  <span>场次 <b>{selectedDetail.sceneCount}</b></span>
                </div>
              </div>
              <div className="starmap-detail-panel">
                <h3>📜 主题标签</h3>
                <div className="starmap-detail-themes">
                  {selectedDetail.topThemes.map(t => {
                    const tc: Record<string,string> = { 忠义报国:"#b8926a",征战讨伐:"#8b5e3c",冤案昭雪:"#6b7b8e",权谋斗争:"#5e6b76",爱情姻缘:"#c77d8b",家庭伦理:"#96544d",神话灵异:"#7f968d",侠义江湖:"#5a8a6e",智谋韬略:"#c4a56e",科举功名:"#a08860",宫廷朝堂:"#8b7b6e",生死离别:"#7a6b8e" };
                    return <span key={t} className="starmap-detail-theme-tag" style={{ borderColor: tc[t] || "#999", color: tc[t] || "#999" }}>{t}</span>;
                  })}
                </div>
              </div>
              <div className="starmap-detail-panel">
                <h3>📊 结构指纹</h3>
                <div className="starmap-detail-radar">
                  {[
                    { label: "密度", value: selectedDetail.density },
                    { label: "聚类", value: selectedDetail.clustering },
                    { label: "集中度", value: selectedDetail.centralization / 2 },
                    { label: "唱比", value: selectedDetail.singingRatio },
                    { label: "规模", value: Math.min(selectedDetail.charCount / 20, 1) },
                  ].map(d => (
                    <div key={d.label} className="starmap-detail-radar-row">
                      <span className="starmap-detail-radar-label">{d.label}</span>
                      <span className="starmap-detail-radar-track">
                        <span className="starmap-detail-radar-fill" style={{ width: `${Math.min(d.value * 100, 100)}%`, background: selectedDetail.genreColor }} />
                      </span>
                      <span className="starmap-detail-radar-val">{d.value.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StarMapCanvas;
