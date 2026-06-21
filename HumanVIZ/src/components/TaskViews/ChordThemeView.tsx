/**
 * ChordThemeView — 主题共现和弦图
 *
 * 12 主题圆形排列，弧宽=共现频次，展示主题间关联网络。
 * 支持点击节点筛选/选中，hover 弦查看 PMI 详情。
 */
import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { useTask3Store } from "../../stores/task3Store";

interface ChordEdge { source: string; target: string; value: number; }
interface PmiScore { pair: [string, string]; count: number; npmi: number; examples: string[]; }
interface ChordGroup extends d3.ChordGroup { index: number; }

interface Props {
  chordEdges: ChordEdge[];
  themeColors: Record<string, string>;
  themeOrder: string[];
  pmiScores: PmiScore[];
}

const RADIUS_INNER = 82;
const RADIUS_OUTER = 108;
const PAD = 0.05;
const W = 500;
const H = 500;

function buildPmiMap(scores: PmiScore[]): Map<string, { count: number; npmi: number }> {
  const m = new Map<string, { count: number; npmi: number }>();
  scores.forEach((p) => m.set([p.pair[0], p.pair[1]].sort().join("||"), { count: p.count, npmi: p.npmi }));
  return m;
}

const ChordThemeView: React.FC<Props> = ({ chordEdges, themeColors, themeOrder, pmiScores }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; a: string; b: string; n: number; npmi: number } | null>(null);
  const { selectedTheme, setSelectedTheme, clearSelection } = useTask3Store();

  useEffect(() => {
    if (!svgRef.current || chordEdges.length === 0) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${W} ${H}`);

    const cx = W / 2, cy = H / 2;
    const idx = new Map(themeOrder.map((t, i) => [t, i]));
    const matrix: number[][] = Array.from({ length: themeOrder.length }, () => new Array(themeOrder.length).fill(0));
    chordEdges.forEach(e => {
      const i = idx.get(e.source), j = idx.get(e.target);
      if (i != null && j != null) { matrix[i][j] = e.value; matrix[j][i] = e.value; }
    });

    const chord = d3.chord().padAngle(PAD).sortSubgroups(d3.descending).sortChords(d3.descending);
    const chords = chord(matrix);
    const pmiMap = buildPmiMap(pmiScores);

    const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);

    // Outer decorative ring
    g.append("circle").attr("r", RADIUS_OUTER + 32).attr("fill", "none")
      .attr("stroke", "#d4c4a8").attr("stroke-width", 0.8).attr("stroke-dasharray", "3 8").attr("opacity", 0.4);

    // Ribbons
    const ribbon = d3.ribbonArrow().radius(RADIUS_INNER - 2).padAngle(PAD);
    g.append("g").attr("class", "ribbons").selectAll("path").data(chords).join("path")
      .attr("d", ribbon as any)
      .attr("fill", (d: d3.Chord) => d3.color(themeColors[themeOrder[d.source.index]] || "#8b7355")!.copy({ opacity: 0.45 })!.toString())
      .attr("stroke", (d: d3.Chord) => themeColors[themeOrder[d.source.index]] || "#8b7355")
      .attr("stroke-width", 0.5).attr("opacity", 0.7)
      .on("mouseenter", function (evt: MouseEvent, d: d3.Chord) {
        const pair: [string, string] = [themeOrder[d.source.index], themeOrder[d.target.index]].sort() as [string, string];
        const info = pmiMap.get(pair.join("||"));
        setTooltip({ x: evt.offsetX, y: evt.offsetY, a: pair[0], b: pair[1], n: info?.count ?? 0, npmi: info?.npmi ?? 0 });
      })
      .on("mouseleave", () => setTooltip(null));

    // Arcs
    const arc = d3.arc<d3.ChordGroup>().innerRadius(RADIUS_INNER).outerRadius(RADIUS_OUTER);
    const groups = g.append("g").attr("class", "groups").selectAll("g").data(chords.groups).join("g")
      .attr("class", "group").attr("cursor", "pointer")
      .on("click", (_evt: MouseEvent, d: ChordGroup) => {
        const t = themeOrder[d.index];
        selectedTheme === t ? clearSelection() : setSelectedTheme(t);
      });

    groups.append("path").attr("d", arc as any)
      .attr("fill", (d: ChordGroup) => themeColors[themeOrder[d.index]] || "#8b7355")
      .attr("stroke", "#fffefb").attr("stroke-width", 1.5).attr("opacity", 0.88);

    // Labels — positioned well outside arcs
    groups.append("text").each(function (d: ChordGroup) {
      const mid = (d.startAngle + d.endAngle) / 2;
      const R = RADIUS_OUTER + 30;
      const x = R * Math.sin(mid), y = -R * Math.cos(mid);
      const rot = (mid * 180) / Math.PI - 90;
      const el = d3.select(this);
      el.attr("x", x).attr("y", y).attr("dy", "0.35em")
        .attr("text-anchor", mid > Math.PI ? "end" : "start")
        .attr("transform", `rotate(${rot},${x},${y})`)
        .attr("fill", "#4a3020").attr("font-size", "11px").attr("font-weight", 600)
        .attr("font-family", '"Noto Serif SC","PT Serif",serif')
        .attr("pointer-events", "none")
        .text(themeOrder[d.index]);

      // Add a small white background strip behind text for readability
      const bbox = (el.node() as SVGTextElement)?.getBBox();
      if (bbox) {
        const pad = 3;
        g.insert("rect", "text")
          .attr("x", bbox.x - pad).attr("y", bbox.y - pad)
          .attr("width", bbox.width + pad * 2).attr("height", bbox.height + pad * 2)
          .attr("fill", "rgba(250,248,245,0.75)").attr("rx", 3)
          .attr("transform", `rotate(${rot},${x},${y})`);
      }
    });

    // Highlight selected
    if (selectedTheme) {
      const si = idx.get(selectedTheme);
      if (si != null) {
        groups.filter((d: ChordGroup) => d.index === si)
          .select("path").attr("opacity", 1).attr("stroke", "#3a1a0a").attr("stroke-width", 3);
      }
    }
  }, [chordEdges, themeColors, themeOrder, pmiScores, selectedTheme, setSelectedTheme, clearSelection]);

  return (
    <div className="t3-chord-wrap">
      <svg ref={svgRef} className="t3-chord-svg" />
      {tooltip && (
        <div className="t3-chord-tooltip" style={{ left: tooltip.x + 10, top: tooltip.y - 40 }}>
          <div className="t3-chord-tooltip-pair">
            <span className="t3-chord-tooltip-name">{tooltip.a}</span>
            <span className="t3-chord-tooltip-conn">↔</span>
            <span className="t3-chord-tooltip-name">{tooltip.b}</span>
          </div>
          <div className="t3-chord-tooltip-stats">
            共现 <b>{tooltip.n}</b> 本 · NPMI <b>{tooltip.npmi > 0 ? "+" : ""}{tooltip.npmi.toFixed(2)}</b>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChordThemeView;
