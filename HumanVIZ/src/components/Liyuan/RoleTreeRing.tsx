/**
 * RoleTreeRing.tsx — 基于同心圆环的行当层级可视化方案
 *
 * 用同心圆环展示京剧四大行当（生旦净丑）的层次结构：
 * - 每个圆环 = 一个行当大类，带开口（同心圆环）
 * - 中心粗体显示行当名（生/旦/净/丑）
 * - 两侧用 TextPath 重复排列角色名，密度编码角色数量
 * - 悬停高亮（仅更新 opacity，不重绘）
 * - 与 TimeRiverChart 联动：选中朝代时调整环的粗细
 */

import React, { useRef, useEffect, useState, useMemo } from "react";
import * as d3 from "d3";
import treeringData from "../../data/role-treering.json";
import { useEraStore } from "../../stores/eraStore";
import { ROLE_EVOLUTION_DATA, ROLE_KEYS, ERA_CHARACTERS } from "../../utils/liyuanData";

const INK_DARK = "#4a3424";
const INK_SOFT = "#8b7355";
const GOLD = "#b89b6d";

// 行当文字配色：中心名最深（醒目），角色名中等（清晰不抢眼）
const ROLE_TEXT_COLORS: Record<string, string> = {
  "生": "#8a6a3e",   // 深驼色（中心名，最醒目）
  "旦": "#7a3838",   // 深酒红
  "净": "#3e4a54",   // 深青灰
  "丑": "#4e6858",   // 深青绿
};
const ROLE_TEXT_SOFT: Record<string, string> = {
  "生": "#a08558",   // 中驼色（角色名，hover 仍清晰）
  "旦": "#88504a",   // 中酒红
  "净": "#566270",   // 中青灰
  "丑": "#6a8474",   // 中青绿
};

interface SubType {
  name: string;
  color: string;
  count: number;
  topChars: string[];
}

interface Category {
  name: string;
  color: string;
  totalCount: number;
  subTypes: SubType[];
}

const RoleTreeRing: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const drawnRef = useRef(false);
  const { hoveredEra, setHoveredRole } = useEraStore();
  const activeEra = hoveredEra;
  const activeName = hoveredCat;

  const data = useMemo(() => (treeringData as any).categories as Category[], []);

  // 首次绘制 + ResizeObserver ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const draw = () => {
      const svg = d3.select(svgRef.current);
      if (!svg) return;
      const { width: w, height: h } = el.getBoundingClientRect();
      if (w <= 0 || h <= 0) return;

      svg.selectAll("*").remove();
      svg.attr("viewBox", `0 0 ${w} ${h}`).attr("preserveAspectRatio", "xMidYMid meet");

      const g = svg.append("g").attr("transform", `translate(${w / 2},${h / 2})`);

      const n = data.length;
      const maxR = Math.min(w, h) / 2 * 0.92;
      const innerR = maxR * 0.15;
      const ringW = (maxR - innerR) / n;
      const radii = data.map((_, i) => innerR + ringW * (i + 0.5));
      // 开口角度：内圈小、外圈大（同心圆环）
      const openDegs = data.map((_, i) => 10 + i * 6);

      // 根据选中的朝代调整环的粗细
      const activeEraIndex = activeEra;
      const eraData = activeEraIndex !== null ? ROLE_EVOLUTION_DATA[activeEraIndex] : null;
      const eraRoleValues = eraData
        ? ROLE_KEYS.map((k) => (eraData as any)[k] as number)
        : null;
      const maxRoleValue = eraRoleValues ? Math.max(...eraRoleValues) : 1;

      // defs：定义路径（静态，不随交互变化） ──
      const defs = g.append("defs");
      data.forEach((_, i) => {
        const path = arcPath(radii[i], openDegs[i]);
        defs.append("path").attr("id", `rp-${i}`).attr("d", path);
      });

      // 背景图（圆形裁剪） ──
      defs.append("clipPath")
        .attr("id", "bg-clip")
        .append("circle")
        .attr("r", maxR);

      g.append("image")
        .attr("href", "/背景图.png")
        .attr("x", -maxR)
        .attr("y", -maxR)
        .attr("width", maxR * 2)
        .attr("height", maxR * 2)
        .attr("clip-path", "url(#bg-clip)")
        .attr("preserveAspectRatio", "xMidYMid slice");

      // 背景圆边框 ──
      g.append("circle")
        .attr("r", maxR)
        .attr("fill", "none")
        .attr("stroke", "rgba(200,190,170,0.35)")
        .attr("stroke-width", 0.6);

      // 底色弧 ──
      data.forEach((cat, i) => {
        // 根据朝代数据调整环的粗细
        const strokeWidth = eraRoleValues
          ? ringW * 0.4 + (ringW * 0.6 * eraRoleValues[i]) / maxRoleValue
          : ringW * 0.8;

        g.append("use")
          .attr("href", `#rp-${i}`)
          .attr("fill", "none")
          .attr("stroke", cat.color)
          .attr("stroke-width", strokeWidth)
          .attr("stroke-opacity", 0.3)
          .attr("class", "rtr-bg");
      });

      // 高亮弧（初始透明，通过 CSS class 控制） ──
      data.forEach((cat, i) => {
        g.append("use")
          .attr("href", `#rp-${i}`)
          .attr("fill", "none")
          .attr("stroke", cat.color)
          .attr("stroke-width", ringW * 0.8)
          .attr("stroke-opacity", 0)
          .attr("class", `rtr-hl rtr-hl-${i}`)
          .style("transition", "stroke-opacity 0.2s ease");
      });

      // 中心行当名（粗体，50% 偏移，颜色跟随行当） ──
      data.forEach((cat, i) => {
        g.append("text")
          .attr("class", "rtr-label")
          .style("fill", ROLE_TEXT_COLORS[cat.name] || INK_DARK)
          .style("font-size", `${Math.max(11, ringW * 0.42)}px`)
          .style("font-weight", "700")
          .style("font-family", "'PT Serif', 'Noto Serif SC', serif")
          .style("text-anchor", "middle")
          .append("textPath")
          .attr("href", `#rp-${i}`)
          .attr("startOffset", "50%")
          .text(cat.name);
      });

      // 两侧角色名填充（开口朝下，文字从顶部开始） ──
      // 按总字数（含分隔符" · "）限制，从内到外递增
      // 每个名字必须完整，允许上下浮动
      const defaultMaxTextLen = [12, 28, 48, 58];
      const eraMaxTextLen = [14, 32, 55, 68];
      const maxTextLen = activeEra !== null ? eraMaxTextLen : defaultMaxTextLen;

      data.forEach((cat, i) => {
        // 根据是否有活跃朝代选择不同的角色
        let charNames: string[];
        if (activeEra !== null) {
          // 使用朝代特定角色
          const eraName = ROLE_EVOLUTION_DATA[activeEra].era;
          const eraChars = ERA_CHARACTERS[eraName];
          charNames = eraChars?.[cat.name] || [];
        } else {
          // 使用默认角色
          charNames = cat.subTypes.flatMap((s) => s.topChars || []);
        }
        // 去重后，按总字数截取（保证名字完整）
        const uniqueChars = [...new Set(charNames)];
        let keyword = "";
        const limit = maxTextLen[i] || 20;
        for (const name of uniqueChars) {
          const separator = keyword ? " · " : "";
          const newLen = keyword.length + separator.length + name.length;
          if (newLen > limit + 2) break; // 允许浮动2个字
          keyword = keyword ? `${keyword} · ${name}` : name;
        }
        const fontSize = Math.max(7, ringW * 0.22);

        // 不重复，只显示一次
        const fillText = `  ${keyword}  `;
        // 角色名用该行当的柔化色
        const softColor = ROLE_TEXT_SOFT[cat.name] || INK_SOFT;

        // 从顶部（开口对面）开始填充
        g.append("text")
          .style("fill", softColor)
          .style("font-size", `${fontSize}px`)
          .style("font-family", "'Noto Sans SC', sans-serif")
          .style("text-anchor", "middle")
          .append("textPath")
          .attr("href", `#rp-${i}`)
          .attr("startOffset", "25%")
          .text(fillText);

        // 下半部分：从另一侧填充
        g.append("text")
          .style("fill", softColor)
          .style("font-size", `${fontSize}px`)
          .style("font-family", "'Noto Sans SC', sans-serif")
          .style("text-anchor", "middle")
          .append("textPath")
          .attr("href", `#rp-${i}`)
          .attr("startOffset", "75%")
          .text(fillText);
      });

      // 交互层（透明弧形捕获区域） ──
      data.forEach((cat, i) => {
        g.append("use")
          .attr("href", `#rp-${i}`)
          .attr("fill", "none")
          .attr("stroke", "transparent")
          .attr("stroke-width", ringW)
          .attr("cursor", "pointer")
          .on("mouseenter", function (event) {
            setHoveredCat(cat.name);
            setHoveredRole(cat.name);
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
              setTooltipPos({
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
              });
            }
          })
          .on("mousemove", function (event) {
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
              setTooltipPos({
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
              });
            }
          })
          .on("mouseleave", () => {
            setHoveredCat(null);
            setHoveredRole(null);
            setTooltipPos(null);
          });
      });

      // 中心边框 ──
      const clipR = innerR * 0.78;
      defs.append("clipPath").attr("id", "ctr-clip").append("circle").attr("r", clipR);

      g.append("circle")
        .attr("r", clipR)
        .attr("fill", "none")
        .attr("stroke", GOLD)
        .attr("stroke-width", 0.6)
        .attr("stroke-opacity", 0.2);

      // 中心文字（默认显示"京剧"，悬停朝代时显示朝代名）
      if (activeEra !== null) {
        const eraData = ROLE_EVOLUTION_DATA[activeEra];
        g.append("text")
          .attr("x", 0)
          .attr("y", -10)
          .attr("dy", "0.35em")
          .style("fill", INK_DARK)
          .style("font-size", "14px")
          .style("font-weight", "700")
          .style("font-family", "'PT Serif', 'Noto Serif SC', serif")
          .style("text-anchor", "middle")
          .style("pointer-events", "none")
          .text(eraData.era);

        g.append("text")
          .attr("x", 0)
          .attr("y", 8)
          .attr("dy", "0.35em")
          .style("fill", INK_SOFT)
          .style("font-size", "10px")
          .style("font-weight", "400")
          .style("font-family", "'Noto Sans SC', sans-serif")
          .style("text-anchor", "middle")
          .style("pointer-events", "none")
          .text(`${eraData.yearStart}-${eraData.yearEnd}`);
      } else {
        // 默认状态显示"京剧"
        g.append("text")
          .attr("x", 0)
          .attr("y", 0)
          .attr("dy", "0.35em")
          .style("fill", INK_DARK)
          .style("font-size", "16px")
          .style("font-weight", "700")
          .style("font-family", "'PT Serif', 'Noto Serif SC', serif")
          .style("text-anchor", "middle")
          .style("pointer-events", "none")
          .text("京剧");
      }

      drawnRef.current = true;
    };

    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, activeEra]);

  // 悬停/选中变化：仅更新高亮 opacity（不重绘） ──
  useEffect(() => {
    if (!drawnRef.current) return;
    const svg = d3.select(svgRef.current);
    data.forEach((cat, i) => {
      svg
        .select(`.rtr-hl-${i}`)
        .attr("stroke-opacity", cat.name === activeName ? 0.66 : 0);
    });
  }, [activeName, activeEra, data]);

  // 详情面板 ──
  const activeCat = data.find((c) => c.name === activeName);

  return (
    <div className="role-tree-ring-container">
      <div ref={containerRef} className="role-tree-ring-svg-wrap">
        <svg ref={svgRef} />
      </div>
      {activeCat && tooltipPos && (
        <div
          className="rtr-tooltip"
          style={{
            left: tooltipPos.x + 15,
            top: tooltipPos.y - 10,
          }}
        >
          <div className="rtr-tooltip-hd">
            <span className="rtr-tooltip-dot" style={{ background: activeCat.color }} />
            <span className="rtr-tooltip-name" style={{ color: ROLE_TEXT_COLORS[activeCat.name] || INK_DARK }}>
              {activeCat.name}行
            </span>
            <span className="rtr-tooltip-total">
              {activeCat.totalCount} 角色人次
            </span>
          </div>
          <div className="rtr-tooltip-body">
            {activeCat.subTypes.map((sub) => {
              const pct = ((sub.count / activeCat.totalCount) * 100).toFixed(1);
              return (
                <div key={sub.name} className="rtr-sub-row">
                  <span className="rtr-sub-dot" style={{ background: sub.color }} />
                  <span className="rtr-sub-name">{sub.name}</span>
                  <span className="rtr-sub-bar">
                    <span className="rtr-sub-bar-fill" style={{
                      width: `${(sub.count / activeCat.subTypes[0].count) * 100}%`,
                      background: sub.color,
                    }} />
                  </span>
                  <span className="rtr-sub-count">{sub.count}</span>
                  <span className="rtr-sub-pct">{pct}%</span>
                </div>
              );
            })}
          </div>
          {(() => {
            let allChars: string[];
            if (activeEra !== null) {
              const eraName = ROLE_EVOLUTION_DATA[activeEra].era;
              const eraChars = ERA_CHARACTERS[eraName];
              allChars = eraChars?.[activeCat.name] || [];
            } else {
              allChars = activeCat.subTypes
                .flatMap((s) => s.topChars?.slice(0, 3) ?? [])
                .filter((v, i, a) => a.indexOf(v) === i)
                .slice(0, 8);
            }
            return allChars.length > 0 ? (
              <div className="rtr-tooltip-chars">
                <span className="rtr-chars-label">代表角色：</span>
                {allChars.map((c) => (
                  <span key={c} className="rtr-char-chip" style={{
                    background: `${ROLE_TEXT_SOFT[activeCat.name] || "#b89b6d"}18`,
                    borderColor: `${ROLE_TEXT_SOFT[activeCat.name] || "#b89b6d"}33`,
                    color: ROLE_TEXT_COLORS[activeCat.name] || INK_DARK,
                  }}>{c}</span>
                ))}
              </div>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
};

/**
 * 创建带开口的圆弧 SVG 路径
 * 开口在底部（6 点钟方向），使用顺时针方向绘制使文字正向可读
 */
function arcPath(radius: number, openDeg: number): string {
  const openRad = (openDeg * Math.PI) / 180;
  // 起点：从 6 点钟方向顺时针旋转 openDeg/2
  const startAngle = Math.PI / 2 + openRad / 2;
  // 终点：从 6 点钟方向逆时针旋转 openDeg/2
  const endAngle = Math.PI / 2 - openRad / 2 + 2 * Math.PI;

  const sx = radius * Math.cos(startAngle);
  const sy = radius * Math.sin(startAngle);
  const ex = radius * Math.cos(endAngle);
  const ey = radius * Math.sin(endAngle);

  // 使用顺时针方向（sweep-flag=1）使文字正向可读
  return `M ${sx} ${sy} A ${radius} ${radius} 0 1 1 ${ex} ${ey}`;
}

export default RoleTreeRing;
