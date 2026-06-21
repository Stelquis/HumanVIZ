/**
 * CircleEgoGraph.tsx — 圆形角色关系图 (Circular Ego-Network)
 *
 * 以选定角色为圆心，按共现权重将关联角色分三层排列：
 * - 内圈绿色：高权重共现 → 双向联系 (Friendship)
 * - 中圈黄色：中权重共现 → 圆心单向关注 (Following)
 * - 外圈红色：低权重共现 → 单向关注圆心 (Admirers)，按亲疏在 62%–80% 半径区间径向分布
 *
 * 设计参考：Choi et al. "Citation Network Visualization of Reference Papers
 * Based on Influence Groups" (LDAV 2018) — 同心圆环 + 桥接节点 + 节点/边编码
 */
import React, { useRef, useEffect, useState, useMemo } from "react";
import * as d3 from "d3";

/* ================================================================
   古籍风格常量和色板
   ================================================================ */
const INK_DARK  = "#4a3424";
const INK_WARM  = "#6b5540";
const INK_SOFT  = "#8b7355";
const PAPER_BG  = "#f6efe0";
const FONT_SERIF = '"Noto Serif SC","PT Serif","STSong","SimSun",serif';
const FONT_UI    = '"system-ui",-apple-system,"Segoe UI",Roboto,sans-serif';

const ROLE_COLORS: Record<string, string> = {
  生: "#b8926a",
  旦: "#96544d",
  净: "#5e6b76",
  丑: "#7f968d",
  其他: "#a09080",
};
const DEFAULT_ROLE_COLOR = "#a09080";

// 圈层配色
const GREEN  = "#6e8b7c";
const YELLOW = "#bfa06b";
const RED    = "#96544d";
const BRIDGE = "#3b6e8f";

// 径向渐变 ID
const GRAD_GREEN  = "grad-green";
const GRAD_YELLOW = "grad-yellow";
const GRAD_RED    = "grad-red";

/* ================================================================
   类型定义
   ================================================================ */
interface CircleEgoGraphProps {
  network: { nodes: any[]; edges: any[]; total_scenes?: number; title?: string };
  centerChar: string;
  charRole: Record<string, string>;
  onCenterChange?: (name: string) => void;
  onSelectChar?: (name: string) => void;
  onLogInteraction?: (charName: string, action: string) => void;
}

interface RingNodeData {
  name: string;
  weight: number;
  degree: number;
  sceneCount: number;
  role: string;
  roleColor: string;
  isBridge: boolean;
  // 绘制用
  angle: number;
  radius: number;
  x: number;
  y: number;
}

/* ================================================================
   工具：Brandes 算法计算中介中心性
   ================================================================ */
function calcBetweenness(
  nodes: { name: string }[],
  edges: { source: string; target: string }[],
): Map<string, number> {
  const adj = new Map<string, string[]>();
  nodes.forEach((n) => adj.set(n.name, []));
  edges.forEach((e) => {
    adj.get(e.source)?.push(e.target);
    adj.get(e.target)?.push(e.source);
  });

  const bc = new Map<string, number>();
  nodes.forEach((n) => bc.set(n.name, 0));

  for (const s of nodes.map((n) => n.name)) {
    const stack: string[] = [];
    const pred = new Map<string, string[]>();
    const sigma = new Map<string, number>();
    const dist = new Map<string, number>();
    const delta = new Map<string, number>();

    nodes.forEach((n) => {
      pred.set(n.name, []);
      sigma.set(n.name, 0);
      dist.set(n.name, -1);
      delta.set(n.name, 0);
    });

    sigma.set(s, 1);
    dist.set(s, 0);
    const queue = [s];

    while (queue.length > 0) {
      const v = queue.shift()!;
      stack.push(v);
      for (const w of adj.get(v) || []) {
        if (dist.get(w) === -1) {
          dist.set(w, dist.get(v)! + 1);
          queue.push(w);
        }
        if (dist.get(w) === dist.get(v)! + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!);
          pred.get(w)!.push(v);
        }
      }
    }

    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of pred.get(w) || []) {
        delta.set(
          v,
          delta.get(v)! +
            (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!),
        );
      }
      if (w !== s) {
        bc.set(w, bc.get(w)! + delta.get(w)!);
      }
    }
  }

  return bc;
}

/* ================================================================
   组件
   ================================================================ */
const CircleEgoGraph: React.FC<CircleEgoGraphProps> = ({
  network, centerChar, charRole, onCenterChange, onSelectChar, onLogInteraction,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{
    show: boolean; x: number; y: number; data: RingNodeData | null; relationLabel?: string;
  }>({ show: false, x: 0, y: 0, data: null });

  /* ---- 全网络中介中心性 (缓存) ---- */
  const bcMap = useMemo(() => calcBetweenness(network.nodes, network.edges), [network]);

  /* ---- 桥接角色：Top-2 (非中心) ---- */
  const bridgeSet = useMemo(() => {
    const sorted = Array.from(bcMap.entries())
      .filter(([name]) => name !== centerChar)
      .sort((a, b) => b[1] - a[1]);
    return new Set(sorted.slice(0, 2).map(([n]) => n));
  }, [bcMap, centerChar]);


  /* ---- 计算圈层数据 ---- */
  const { innerRing, middleRing, outerRing, maxWeight, maxDegree } = useMemo(() => {
    const connMap = new Map<string, number>();
    network.edges.forEach((e: any) => {
      if (e.source === centerChar) {
        const cur = connMap.get(e.target) || 0;
        connMap.set(e.target, Math.max(cur, e.weight));
      } else if (e.target === centerChar) {
        const cur = connMap.get(e.source) || 0;
        connMap.set(e.source, Math.max(cur, e.weight));
      }
    });

    const sorted = Array.from(connMap.entries())
      .map(([name, weight]) => ({ name, weight }))
      .sort((a, b) => b.weight - a.weight);

    const maxW = sorted.length > 0 ? sorted[0].weight : 1;

    // 三分组 (tertiles)
    const n = sorted.length;
    const ch = Math.max(1, Math.ceil(n / 3));
    const inner = sorted.slice(0, ch);
    const middle = sorted.slice(ch, ch * 2);
    const outerArr = sorted.slice(ch * 2);

    // 建索引
    const nodeDegMap = new Map<string, number>();
    const nodeSceneMap = new Map<string, number>();
    network.nodes.forEach((nd: any) => {
      nodeDegMap.set(nd.name, nd.degree);
      nodeSceneMap.set(nd.name, nd.scene_count);
    });

    let maxDeg = 0;
    nodeDegMap.forEach((d) => { if (d > maxDeg) maxDeg = d; });

    const toRing = (arr: typeof sorted): RingNodeData[] =>
      arr.map((c) => {
        const role = charRole[c.name] || "其他";
        const deg = nodeDegMap.get(c.name) || 0;
        if (deg > maxDeg) maxDeg = deg;
        return {
          name: c.name,
          weight: c.weight,
          degree: deg,
          sceneCount: nodeSceneMap.get(c.name) || 0,
          role,
          roleColor: ROLE_COLORS[role] || DEFAULT_ROLE_COLOR,
          isBridge: bridgeSet.has(c.name),
          angle: 0, radius: 0, x: 0, y: 0,
        };
      });

    return {
      innerRing: toRing(inner),
      middleRing: toRing(middle),
      outerRing: toRing(outerArr),
      maxWeight: maxW,
      maxDegree: maxDeg || 1,
    };
  }, [network, centerChar, charRole, bridgeSet]);

  /* ---- 中心角色 degree ---- */
  const centerDeg = useMemo(() => {
    const n = network.nodes.find((n: any) => n.name === centerChar);
    return n ? n.degree : 0;
  }, [network, centerChar]);

  /* ---- D3 绘制 ---- */
  useEffect(() => {
    const svgEl = d3.select(svgRef.current);
    const container = containerRef.current;
    if (!svgEl || !container) return;

    const draw = () => {
      const { width: w, height: h } = container.getBoundingClientRect();
      if (w <= 0 || h <= 0) return;

      svgEl.selectAll("*").remove();
      svgEl.attr("viewBox", `0 0 ${w} ${h}`)
            .attr("preserveAspectRatio", "xMidYMid meet");

      const cx = w / 2;
      const cy = h * 0.46;
      const maxR = Math.min(cx, cy) - 18;
      if (maxR < 40) return;

      /* ---- SVG defs: 径向渐变 ---- */
      const defs = svgEl.append("defs");
      defs.append("radialGradient").attr("id", GRAD_GREEN)
        .append("stop").attr("offset", "0%").attr("stop-color", "#8db89c");
      defs.select(`#${GRAD_GREEN}`)
        .append("stop").attr("offset", "100%").attr("stop-color", GREEN);

      defs.append("radialGradient").attr("id", GRAD_YELLOW)
        .append("stop").attr("offset", "0%").attr("stop-color", "#d4ba8a");
      defs.select(`#${GRAD_YELLOW}`)
        .append("stop").attr("offset", "100%").attr("stop-color", YELLOW);

      defs.append("radialGradient").attr("id", GRAD_RED)
        .append("stop").attr("offset", "0%").attr("stop-color", "#b06b66");
      defs.select(`#${GRAD_RED}`)
        .append("stop").attr("offset", "100%").attr("stop-color", RED);

      const g = svgEl.append("g").attr("transform", `translate(${cx},${cy})`);

      /* ---- R1: 半径定义 (增大圈间距) ---- */
      const rInner    = maxR * 0.40;
      const rMiddle   = maxR * 0.60;
      const redStartR = maxR * 0.72;
      const redEndR   = maxR * 0.92;

      /* ---- R1: 彩色环带背景 (代替文字标注避免遮挡) ---- */
      // 绿色友谊环带 (内圈 → 中圈)
      const greenBand = g.append("circle")
        .attr("r", (rInner + rMiddle) / 2)
        .attr("fill", "none")
        .attr("stroke", GREEN)
        .attr("stroke-width", rMiddle - rInner)
        .attr("opacity", 0.08)
        .attr("cursor", "pointer");
      addBandClick(greenBand, "友谊环带");

      // 黄色关注环带 (中圈 → 红色起始)
      const yellowBand = g.append("circle")
        .attr("r", (rMiddle + redStartR) / 2)
        .attr("fill", "none")
        .attr("stroke", YELLOW)
        .attr("stroke-width", redStartR - rMiddle)
        .attr("opacity", 0.08)
        .attr("cursor", "pointer");
      addBandClick(yellowBand, "关注环带");

      // 红色仰慕环带 (红色起始 → 红色最外)
      const redBand = g.append("circle")
        .attr("r", (redStartR + redEndR) / 2)
        .attr("fill", "none")
        .attr("stroke", RED)
        .attr("stroke-width", redEndR - redStartR)
        .attr("opacity", 0.08)
        .attr("cursor", "pointer");
      addBandClick(redBand, "仰慕环带");

      // 引导虚线 (保留在环带边界)
      const guideRs = [rInner, rMiddle, redStartR, redEndR];
      guideRs.forEach((r) => {
        g.append("circle")
          .attr("r", r)
          .attr("fill", "none")
          .attr("stroke", INK_WARM)
          .attr("stroke-width", 1.4)
          .attr("stroke-dasharray", "6 8")
          .attr("opacity", 0.22);
      });

      /* ---- 装饰性背景圆 ---- */
      g.append("circle")
        .attr("r", maxR + 14)
        .attr("fill", "rgba(246,239,224,0.30)")
        .attr("stroke", "rgba(180,155,120,0.10)")
        .attr("stroke-width", 0.5);

      /* ---- 环带点击辅助 ---- */
      function addBandClick(
        band: d3.Selection<SVGCircleElement, unknown, null, undefined>,
        label: string,
      ) {
        band.on("mouseenter", function () {
          band.attr("opacity", 0.18);
        })
        .on("mouseleave", function () {
          band.attr("opacity", 0.08);
        })
        .on("click", function (event: any) {
          const pt = d3.pointer(event, container);
          const d = {
            name: label, weight: 0, degree: 0, sceneCount: 0,
            role: "", roleColor: "", isBridge: false,
            angle: 0, radius: 0, x: 0, y: 0,
          };
          setTooltip({ show: true, x: pt[0] + 14, y: pt[1] - 10, data: d, relationLabel: label });
          // auto-dismiss after 2s
          setTimeout(() => setTooltip({ show: false, x: 0, y: 0, data: null }), 2000);
        });
      }

      /* ---- 计算节点位置 (各环不同起始角 + 径向抖动) ---- */
      // Shared angle tracker across ALL rings to prevent radial alignment
      const allUsedAngles: number[] = [];
      const MIN_ANGLE_GAP = 0.25; // ~14° minimum gap between any two nodes

      const distribute = (
        nodes: RingNodeData[],
        baseR: number,
        jitterRange: number,
        startAngle: number,
      ): void => {
        const m = nodes.length;
        if (m === 0) return;
        nodes.forEach((node, i) => {
          let angle = startAngle + (2 * Math.PI * i) / m;
          // Check against ALL previously placed angles (across rings)
          for (let attempt = 0; attempt < 20; attempt++) {
            let conflict = false;
            for (const used of allUsedAngles) {
              let diff = Math.abs(angle - used);
              if (diff > Math.PI) diff = 2 * Math.PI - diff;
              if (diff < MIN_ANGLE_GAP) {
                // Nudge away from conflict
                angle += (angle > used ? 1 : -1) * MIN_ANGLE_GAP * 1.2;
                conflict = true;
                break;
              }
            }
            if (!conflict) break;
          }
          allUsedAngles.push(angle);
          node.angle = angle;
          const normWeight = maxWeight > 0 ? node.weight / maxWeight : 0.5;
          const jitter = (1 - normWeight) * jitterRange * 2 - jitterRange;
          node.radius = baseR + jitter;
          node.x = node.radius * Math.cos(node.angle);
          node.y = node.radius * Math.sin(node.angle);
        });
      };

      const distributeRed = (nodes: RingNodeData[], startAngle: number): void => {
        const m = nodes.length;
        if (m === 0) return;
        nodes.forEach((node, i) => {
          let angle = startAngle + (2 * Math.PI * i) / m;
          for (let attempt = 0; attempt < 20; attempt++) {
            let conflict = false;
            for (const used of allUsedAngles) {
              let diff = Math.abs(angle - used);
              if (diff > Math.PI) diff = 2 * Math.PI - diff;
              if (diff < MIN_ANGLE_GAP) {
                angle += (angle > used ? 1 : -1) * MIN_ANGLE_GAP * 1.2;
                conflict = true;
                break;
              }
            }
            if (!conflict) break;
          }
          allUsedAngles.push(angle);
          const t = m > 1 ? i / (m - 1) : 0;
          node.angle = angle;
          node.radius = redStartR + t * (redEndR - redStartR);
          node.x = node.radius * Math.cos(node.angle);
          node.y = node.radius * Math.sin(node.angle);
        });
      };

      // 各环起始角错开, 避免节点在垂直方向对齐
      const angInner  = -Math.PI * 0.30;
      const angMiddle = -Math.PI * 0.06;
      const angRed    = Math.PI * 0.20;

      const jitterInner  = maxR * 0.055;
      const jitterMiddle = maxR * 0.065;
      distribute(innerRing, rInner, jitterInner, angInner);
      distribute(middleRing, rMiddle, jitterMiddle, angMiddle);
      distributeRed(outerRing, angRed);

      /* ---- R2: 节点尺寸映射 (degree → [7, 16]) ---- */
      const sizeScale = d3.scaleSqrt()
        .domain([0, Math.max(maxDegree, 1)])
        .range([7, 16]);

      /* ---- R4: 线宽映射 (加粗) ---- */
      const redLineScale = d3.scaleLinear()
        .domain([0, Math.max(maxWeight, 1)])
        .range([1.2, 5]);
      const yellowLineScale = d3.scaleLinear()
        .domain([0, Math.max(maxWeight, 1)])
        .range([0.8, 2.5]);
      const greenLineScale = d3.scaleLinear()
        .domain([0, Math.max(maxWeight, 1)])
        .range([0.8, 3]);

      /* ---- R4: 绘制连接线 + 交互 (可见线条 + 点击显示角色交流) ---- */
      const addLineInteraction = (
        lineG: d3.Selection<SVGLineElement, unknown, null, undefined>,
        node: RingNodeData,
        relationLabel: string,
        baseOpacity: number,
        baseStrokeWidth: number,
      ) => {
        // Invisible wide hit zone
        g.append("line")
          .attr("x1", 0).attr("y1", 0)
          .attr("x2", node.x).attr("y2", node.y)
          .attr("stroke", "transparent")
          .attr("stroke-width", 22)
          .attr("cursor", "pointer")
          .on("mouseenter", function (this: any, event: any) {
            this._active = true;
            lineG.attr("stroke-width", Math.max(3, baseStrokeWidth * 2)).attr("opacity", 0.8);
            const pt = d3.pointer(event, container);
            setTooltip({
              show: true, x: pt[0] + 14, y: pt[1] - 10,
              data: node, relationLabel,
            });
          })
          .on("mousemove", function (this: any, event: any) {
            if (!this._active) return;
            const pt = d3.pointer(event, container);
            setTooltip((prev) => ({ ...prev, x: pt[0] + 14, y: pt[1] - 10 }));
          })
          .on("mouseleave", function (this: any) {
            this._active = false;
            lineG.attr("stroke-width", baseStrokeWidth).attr("opacity", baseOpacity);
            setTooltip({ show: false, x: 0, y: 0, data: null });
          })
          .on("click", function (event: any) {
            event.stopPropagation();
            const pt = d3.pointer(event, container);
            setTooltip({
              show: true, x: pt[0] + 14, y: pt[1] - 10,
              data: node, relationLabel,
            });
          });
      };

      // Total scenes for estimating co-occurrence counts
      const totalScenes = network.total_scenes || 1;

      // 红色线 (关注圆心) — 线宽按权重
      outerRing.forEach((node) => {
        const sw = redLineScale(node.weight);
        const op = 0.5;
        const line = g.append("line")
          .attr("class", "conn-line conn-red")
          .attr("x1", 0).attr("y1", 0)
          .attr("x2", node.x).attr("y2", node.y)
          .attr("stroke", RED)
          .attr("stroke-width", sw)
          .attr("opacity", op);
        const estScenes = Math.max(1, Math.round(node.weight * totalScenes));
        addLineInteraction(line as any, { ...node, sceneCount: estScenes }, "关注圆心 — 该角色关注圆心角色，但同台较少", op, sw);
      });

      // 黄色线 (圆心关注) — 线宽按权重
      middleRing.forEach((node) => {
        const sw = yellowLineScale(node.weight);
        const op = 0.5;
        const line = g.append("line")
          .attr("class", "conn-line conn-yellow")
          .attr("x1", 0).attr("y1", 0)
          .attr("x2", node.x).attr("y2", node.y)
          .attr("stroke", YELLOW)
          .attr("stroke-width", sw)
          .attr("opacity", op);
        const estScenes = Math.max(1, Math.round(node.weight * totalScenes));
        addLineInteraction(line as any, { ...node, sceneCount: estScenes }, "圆心关注 — 圆心角色关注该角色，但同台较少", op, sw);
      });

      // 绿色线 (双向联系) — 实线，线宽按权重
      innerRing.forEach((node) => {
        const sw = greenLineScale(node.weight);
        const op = 0.45;
        const line = g.append("line")
          .attr("class", "conn-line conn-green")
          .attr("x1", 0).attr("y1", 0)
          .attr("x2", node.x).attr("y2", node.y)
          .attr("stroke", GREEN)
          .attr("stroke-width", sw)
          .attr("opacity", op);
        const estScenes = Math.max(1, Math.round(node.weight * totalScenes));
        addLineInteraction(line as any, { ...node, sceneCount: estScenes }, "双向联系 — 同台共演，有直接互动", op, sw);
      });

      /* ---- R3+R7: 绘制所有圈层节点 ---- */
      const allRingNodes = [...innerRing, ...middleRing, ...outerRing];

      const nodeGroup = g.selectAll("g.node").data(allRingNodes).enter()
        .append("g")
        .attr("class", "node")
        .attr("transform", (d: any) => `translate(${d.x},${d.y})`);

      // 主圆 (按 ring 渐变填充, 桥接节点蓝色高亮)
      nodeGroup.append("circle")
        .attr("r", (d: any) => sizeScale(d.degree))
        .attr("fill", (d: any) => {
          if (d.isBridge) return BRIDGE;
          if (innerRing.includes(d)) return `url(#${GRAD_GREEN})`;
          if (middleRing.includes(d)) return `url(#${GRAD_YELLOW})`;
          return `url(#${GRAD_RED})`;
        })
        .attr("stroke", (d: any) => d.isBridge ? "#4a90b8" : "rgba(60,40,20,0.12)")
        .attr("stroke-width", (d: any) => d.isBridge ? 1.5 : 0.5)
        .attr("opacity", 0.94);

      // 桥接节点白色星标
      nodeGroup.filter((d: any) => d.isBridge)
        .append("polygon")
        .attr("points", starPoints(0, 0, 5, 7, 3))
        .attr("fill", "#fff")
        .attr("opacity", 0.8);

      // 标签 — 径向向外，大幅增加偏移避免遮盖节点
      const LABEL_GAP = 26; // px from node edge to label

      nodeGroup.each(function (d: any) {
        const el = d3.select(this);
        const nodeR = sizeScale(d.degree);
        const labelDist = nodeR + LABEL_GAP;
        const dirX = Math.cos(d.angle);
        const dirY = Math.sin(d.angle);
        const lx = labelDist * dirX;
        const ly = labelDist * dirY;
        const anchor = dirX > 0.2 ? "start" : dirX < -0.2 ? "end" : "middle";
        const adjustedY = anchor === "middle"
          ? (dirY < 0 ? ly - 4 : ly + 6)
          : ly + 3;

        const fs = innerRing.includes(d) ? "13px"
          : middleRing.includes(d) ? "12px"
          : "11px";

        el.append("text")
          .attr("text-anchor", anchor)
          .attr("x", lx)
          .attr("y", adjustedY)
          .attr("font-size", fs)
          .attr("font-weight", 500)
          .attr("font-family", FONT_SERIF)
          .attr("fill", "#3a2818")
          .attr("paint-order", "stroke")
          .attr("stroke", PAPER_BG)
          .attr("stroke-width", 3)
          .attr("stroke-linecap", "round")
          .attr("stroke-linejoin", "round")
          .text(d.name.length > 4 ? d.name.slice(0, 3) + "…" : d.name);
      });

      /* ---- 绘制中心节点 ---- */
      const centerNodeG = g.append("g");
      const centerR = Math.max(28, 26 + (centerDeg / 40) * 16);
      const centerRole = charRole[centerChar] || "其他";
      const centerColor = ROLE_COLORS[centerRole] || DEFAULT_ROLE_COLOR;

      // 外发光
      centerNodeG.append("circle")
        .attr("r", centerR + 8)
        .attr("fill", "none")
        .attr("stroke", centerColor)
        .attr("stroke-width", 1.5)
        .attr("opacity", 0.25);

      // 主圆
      centerNodeG.append("circle")
        .attr("r", centerR)
        .attr("fill", centerColor)
        .attr("stroke", PAPER_BG)
        .attr("stroke-width", 2.5)
        .attr("filter", "drop-shadow(0 2px 6px rgba(0,0,0,0.15))");

      // 角色名 (居中)
      centerNodeG.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "-0.15em")
        .attr("font-size", Math.min(17, centerR * 0.68))
        .attr("font-weight", 700)
        .attr("font-family", FONT_SERIF)
        .attr("fill", "#fff")
        .text(centerChar.length > 4 ? centerChar.slice(0, 3) + "…" : centerChar);

      // 行当小色点 + 标签 (放在节点右上方，远离所有环上节点)
      const dotR = 5;
      const dotAngle = -Math.PI / 4; // 右上 45°
      const dotDist = centerR + 10;
      centerNodeG.append("circle")
        .attr("cx", dotDist * Math.cos(dotAngle))
        .attr("cy", dotDist * Math.sin(dotAngle))
        .attr("r", dotR)
        .attr("fill", centerColor)
        .attr("stroke", PAPER_BG)
        .attr("stroke-width", 1.5);
      centerNodeG.append("text")
        .attr("x", dotDist * Math.cos(dotAngle) + 9)
        .attr("y", dotDist * Math.sin(dotAngle) + 4)
        .attr("text-anchor", "start")
        .attr("font-size", "13px")
        .attr("font-weight", 600)
        .attr("font-family", FONT_UI)
        .attr("fill", INK_WARM)
        .text(centerRole);

      /* ---- 交互: 悬停探测 ---- */
      nodeGroup.append("circle")
        .attr("r", (d: any) => Math.max(sizeScale(d.degree), 26))
        .attr("fill", "transparent")
        .attr("cursor", "pointer")
        .on("mouseenter", function (this: any, event: any, d: any) {
          if (onLogInteraction) onLogInteraction(d.name, "hover");
          const pt = d3.pointer(event, container);
          setTooltip({ show: true, x: pt[0] + 14, y: pt[1] - 10, data: d });
        })
        .on("mousemove", function (this: any, event: any) {
          const pt = d3.pointer(event, container);
          setTooltip((prev) => ({ ...prev, x: pt[0] + 14, y: pt[1] - 10 }));
        })
        .on("mouseleave", () => {
          setTooltip({ show: false, x: 0, y: 0, data: null });
        })
        .on("click", function (_event: any, d: any) {
          if (onLogInteraction) onLogInteraction(d.name, "click");
          if (onSelectChar) onSelectChar(d.name);
          if (onCenterChange) onCenterChange(d.name);
        });

      /* ---- 中心节点也可点击日志 ---- */
      centerNodeG.style("cursor", "pointer")
        .on("click", function () {
          if (onLogInteraction) onLogInteraction(centerChar, "recenter");
          if (onSelectChar) onSelectChar(centerChar);
        });

      /* ---- R8: 图例 ---- */
      const legendG = svgEl.append("g")
        .attr("transform", `translate(16, ${h - 115})`);

      const legendItems: { color: string; label: string; isBridge?: boolean }[] = [
        { color: GREEN, label: "高权重共现 (双向联系)" },
        { color: YELLOW, label: "中权重共现 (圆心关注)" },
        { color: RED, label: "低权重共现 (关注圆心)" },
        { color: BRIDGE, label: "桥接角色 (跨群组连接)" },
      ];

      legendItems.forEach((item, i) => {
        const lg = legendG.append("g")
          .attr("transform", `translate(0, ${i * 22})`);
        lg.append("circle")
          .attr("r", 5)
          .attr("fill", item.color)
          .attr("opacity", 0.85)
          .attr("stroke", item.isBridge ? "#6a9ec4" : "none")
          .attr("stroke-width", item.isBridge ? 1 : 0);
        if (item.isBridge) {
          lg.append("polygon")
            .attr("points", starPoints(0, 0, 5, 6, 2.5))
            .attr("fill", "#fff")
            .attr("opacity", 0.85);
        }
        lg.append("text")
          .attr("x", 14)
          .attr("y", 5)
          .attr("font-size", "12px")
          .attr("font-family", FONT_UI)
          .attr("fill", INK_DARK)
          .text(item.label);
      });

      legendG.append("text")
        .attr("x", 0)
        .attr("y", 91)
        .attr("font-size", "11px")
        .attr("font-family", FONT_UI)
        .attr("fill", INK_SOFT)
        .attr("opacity", 0.7)
        .text("* 关系类型基于角色共现场景强度近似");
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(container);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [innerRing, middleRing, outerRing, maxWeight, maxDegree,
      centerChar, centerDeg, charRole, onCenterChange, onSelectChar, onLogInteraction]);

  /* ---- 无连接提示 ---- */
  const noConnections =
    innerRing.length === 0 && middleRing.length === 0 && outerRing.length === 0;

  return (
    <div ref={containerRef} className="t2-circle-ego-container">
      {noConnections && (
        <div className="t2-circle-no-data">该角色在此网络中没有共现关系</div>
      )}
      <svg ref={svgRef} />

      {/* 悬停/点击提示 — 含剧本上下文 */}
      {tooltip.show && tooltip.data && (
        <div
          className="t2-circle-tooltip"
          style={{
            position: "absolute",
            left: Math.min(tooltip.x, (containerRef.current?.clientWidth || 500) - 220),
            top: Math.max(10, tooltip.y - 80),
            pointerEvents: "none",
            zIndex: 100,
          }}
        >
          {tooltip.data.role === "" ? (
            <div className="t2-circle-tt-name" style={{fontSize:"13px"}}>
              {tooltip.relationLabel}
            </div>
          ) : (
            <>
              <div className="t2-circle-tt-name">
                {tooltip.relationLabel
                  ? `${tooltip.data.name} ↔ ${centerChar}`
                  : tooltip.data.name}
              </div>
              {tooltip.relationLabel && (
                <>
                  <div className="t2-circle-tt-row t2-circle-tt-relation">
                    <span>{tooltip.relationLabel.split(" — ")[0]}</span>
                    <span>{(tooltip.data.weight * 100).toFixed(0)}%</span>
                  </div>
                  <div className="t2-circle-tt-row">
                    <span>度中心性</span><span>{tooltip.data.degree}</span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 10, color: "#6b5540", lineHeight: 1.4, maxWidth: 200 }}>
                    在《{network.title || "当前剧本"}》中，{tooltip.data.name}与{centerChar}
                    {tooltip.data.weight >= 0.6
                      ? `在多个关键场景中共同出现${tooltip.data.sceneCount > 0 ? `（约${tooltip.data.sceneCount}场）` : ""}，关系较为紧密，对剧情推进有重要作用。`
                      : `同场出现约${tooltip.data.sceneCount || 1}次，交集较少，多为背景出现。`}
                    {tooltip.data.isBridge ? " 该角色同时连接不同关系群组，为桥接枢纽。" : ""}
                  </div>
                </>
              )}
              {!tooltip.relationLabel && (
                <>
                  <div className="t2-circle-tt-row">
                    <span>行当</span><span>{tooltip.data.role}</span>
                  </div>
                  <div className="t2-circle-tt-row">
                    <span>度中心性</span><span>{tooltip.data.degree}</span>
                  </div>
                  <div className="t2-circle-tt-row">
                    <span>是否桥接</span><span>{tooltip.data.isBridge ? "是 ⭐" : "否"}</span>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

/* ---- 工具：生成星形多边形点串 ---- */
function starPoints(
  cx: number, cy: number, points: number,
  outerR: number, innerR: number,
): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI * i) / points - Math.PI / 2;
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return pts.join(" ");
}

export { starPoints };
export default CircleEgoGraph;
