import React, { useRef, useEffect, useState, useCallback } from "react";
import * as echarts from "echarts";
import { detectNarrativePhases } from "../../utils/storyRibbonCore";
import { FALLBACK_PHASES } from "../../types/task4Types";
import type { CombinedRhythmChartProps } from "../../types/task4Types";

/** 角色专属色板（最多 12 色，与叙事模式色系协调） */
const CHAR_COLORS = [
  "#96544D", "#B89B6D", "#7F968D", "#C4A56E", "#5E6B76",
  "#c44d4d", "#8a7a8e", "#6b5b4f", "#c77d8b", "#4a7c8c",
  "#b8926a", "#5e8a7a",
];

const CombinedRhythmChart: React.FC<CombinedRhythmChartProps> = ({
  analysis, fingerprint, turningPoints,
  selectedPhase, onSceneHover, onSceneClick, onPhaseClick,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const pinnedSceneRef = useRef<number | null>(null);
  const [activeChars, setActiveChars] = useState<Set<string>>(new Set());

  const toggleChar = useCallback((name: string) => {
    setActiveChars((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const clearChars = useCallback(() => setActiveChars(new Set()), []);

  useEffect(() => {
    if (!ref.current || !analysis || !fingerprint) return;
    let chart: echarts.ECharts | null = null;

    const scenes = analysis.scenes;
    const n = scenes.length;
    const conflictArc = analysis.narrativeMetrics.conflictArc;
    const sentimentArc = analysis.narrativeMetrics.sentimentArc;
    const charDensity = analysis.narrativeMetrics.characterDensity;

    const phases = (() => {
      if (analysis.narrativeMetrics.narrativePhases?.length) {
        return analysis.narrativeMetrics.narrativePhases;
      }
      const detected = detectNarrativePhases(scenes, conflictArc, sentimentArc, charDensity);
      if (detected?.length) return detected;
      return FALLBACK_PHASES.map(fp => ({
        label: fp.label,
        startScene: Math.floor(n * fp.pct[0]),
        endScene: Math.min(n - 1, Math.floor(n * fp.pct[1])),
      }));
    })();

    const climaxIdx = conflictArc.indexOf(Math.max(...conflictArc));

    try {
      const existing = echarts.getInstanceByDom(ref.current);
      if (existing) existing.dispose();
      chart = echarts.init(ref.current);
      chartRef.current = chart;

      let conflictBurstPts: number[] = [];
      let turningPts: number[] = [];
      let primaryClimaxPts: number[] = [];
      let secondaryClimaxPts: number[] = [];

      if (turningPoints && turningPoints.length > 0) {
        primaryClimaxPts = turningPoints
          .filter((tp: any) => tp.type === "primary_climax")
          .map((tp: any) => tp.sceneIndex);
        secondaryClimaxPts = turningPoints
          .filter((tp: any) => tp.type === "secondary_climax")
          .map((tp: any) => tp.sceneIndex);
        turningPts = turningPoints
          .filter((tp: any) => tp.type !== "primary_climax" && tp.type !== "secondary_climax")
          .map((tp: any) => tp.sceneIndex);
        conflictBurstPts = turningPoints
          .filter((tp: any) => tp.type === "conflict_burst" || tp.type === "turning_point")
          .map((tp: any) => tp.sceneIndex);
      } else {
        for (let i = 1; i < n - 1; i++) {
          if (i === climaxIdx) continue;
          if (conflictArc[i] > conflictArc[i - 1] && conflictArc[i] > conflictArc[i + 1]
              && conflictArc[i] > 0.25) {
            turningPts.push(i);
          }
        }
      }
      if (primaryClimaxPts.length === 0 && climaxIdx >= 0) {
        primaryClimaxPts = [climaxIdx];
      }
      if (conflictBurstPts.length === 0) {
        for (let i = 1; i < n; i++) {
          const delta = Math.abs(conflictArc[i] - conflictArc[i - 1]);
          if (delta > 0.15 && !primaryClimaxPts.includes(i)) {
            conflictBurstPts.push(i);
          }
        }
      }

      const sceneLabels = scenes.map((_, i) => `第${i + 1}场`);

      const phaseColors = [
        "rgba(184,155,109,0.08)", "rgba(150,84,77,0.08)",
        "rgba(196,77,77,0.1)", "rgba(127,150,141,0.08)",
      ];
      const phaseColorsDimmed = [
        "rgba(184,155,109,0.02)", "rgba(150,84,77,0.02)",
        "rgba(196,77,77,0.02)", "rgba(127,150,141,0.02)",
      ];

      const allMarkAreas: any[] = [];
      if (selectedPhase !== null && selectedPhase !== undefined) {
        const sp = phases[selectedPhase];
        if (sp) {
          if (sp.startScene > 0) {
            allMarkAreas.push([{
              name: "dim-left", xAxis: 0, yAxis: -0.5,
              itemStyle: { color: "rgba(255,255,255,0.40)" },
            }, { xAxis: sp.startScene - 0.01, yAxis: 1.5 }]);
          }
          if (sp.endScene < n - 1) {
            allMarkAreas.push([{
              name: "dim-right", xAxis: sp.endScene + 0.01, yAxis: -0.5,
              itemStyle: { color: "rgba(255,255,255,0.40)" },
            }, { xAxis: n - 1, yAxis: 1.5 }]);
          }
        }
      }
      phases.forEach((p: any, pi: number) => {
        const startX = p.startScene ?? (p.pct ? Math.floor(n * p.pct[0]) : 0);
        const endX = p.endScene ?? (p.pct ? Math.min(n - 1, Math.floor(n * p.pct[1])) : n - 1);
        const isSel = selectedPhase !== null && selectedPhase !== undefined && pi === selectedPhase;
        allMarkAreas.push([{
          name: p.label, xAxis: startX, yAxis: 0,
          itemStyle: {
            color: isSel ? phaseColors[pi % phaseColors.length]
              : (selectedPhase !== null && selectedPhase !== undefined ? phaseColorsDimmed[pi % phaseColorsDimmed.length] : phaseColors[pi % phaseColors.length]),
          },
          label: { show: true, position: "insideTop" as const, fontSize: 11,
            fontWeight: 700, color: isSel ? "#5E4B3A" : (selectedPhase !== null && selectedPhase !== undefined ? "#B8A898" : "#5E4B3A"),
            formatter: p.label },
        }, { xAxis: endX, yAxis: 1 }]);
      });

      const turningMarkPoints = [
        ...conflictBurstPts.filter(i => !primaryClimaxPts.includes(i) && !secondaryClimaxPts.includes(i)).map(i => ({
          name: "冲突爆发", coord: [i, conflictArc[i]],
          symbol: "circle", symbolSize: 8,
          itemStyle: { color: "#c44d4d", borderColor: "#fff", borderWidth: 1.5 },
          label: { show: true, fontSize: 9, fontWeight: 600, color: "#c44d4d",
            formatter: "●", position: "top" as const, distance: 6 },
        })),
        ...turningPts.filter(i => !primaryClimaxPts.includes(i) && !secondaryClimaxPts.includes(i) && !conflictBurstPts.includes(i)).map(i => ({
          name: "转折", coord: [i, conflictArc[i]],
          symbol: "diamond", symbolSize: 10,
          itemStyle: { color: "#c4a56e", borderColor: "#fff", borderWidth: 1.5 },
          label: { show: true, fontSize: 9, fontWeight: 600, color: "#c4a56e",
            formatter: "◆", position: "top" as const, distance: 6 },
        })),
        ...secondaryClimaxPts.map(i => ({
          name: "次高潮", coord: [i, conflictArc[i]],
          symbol: "diamond", symbolSize: 8,
          itemStyle: { color: "#c4a56e", borderColor: "#fff", borderWidth: 1.5 },
          label: { show: true, fontSize: 8, fontWeight: 500, color: "#c4a56e",
            formatter: "◆", position: "top" as const, distance: 5 },
        })),
        ...primaryClimaxPts.map(i => ({
          name: "高潮", coord: [i, conflictArc[i]],
          symbol: "pin", symbolSize: 22,
          itemStyle: {
            color: "#c44d4d",
            borderColor: "#ffd700",
            borderWidth: 2.5,
            shadowBlur: 12,
            shadowColor: "rgba(196, 77, 77, 0.6)",
          },
          label: { show: true, fontSize: 10, fontWeight: 700, color: "#c44d4d",
            formatter: "冲突爆发", position: "top" as const, distance: 10 },
        })),
      ];

      const allMarkPoints = [...turningMarkPoints];

      // Ribbon geometry: width proportional to char density, 3D lighting gradient
      const maxD = Math.max(...charDensity, 1);
      const ribbonHalfW = conflictArc.map((_, i) => 0.025 + (charDensity[i] / maxD) * (0.14 - 0.025));
      const lo = conflictArc.map((v, i) => +Math.max(v - ribbonHalfW[i], -0.05).toFixed(3));
      const hi = conflictArc.map((v, i) => +Math.min(v + ribbonHalfW[i], 1.08).toFixed(3));
      const body = hi.map((v, i) => +(v - lo[i]).toFixed(3));
      const sOff = 0.02;
      const sLo = lo.map(v => +Math.max(v - sOff, -0.08).toFixed(3));
      const sHi = hi.map(v => +Math.max(v - sOff * 0.5, 0).toFixed(3));
      const sBody = sHi.map((v, i) => +(v - sLo[i]).toFixed(3));

      chart.setOption({
        tooltip: {
          trigger: "axis",
          appendToBody: true,
          backgroundColor: "rgba(255,255,255,0.94)",
          borderColor: "rgba(150,84,77,0.2)",
          borderWidth: 1, borderRadius: 10, padding: [10, 14],
          textStyle: { fontSize: 12, color: "#5E4B3A" },
          formatter: (params: any) => {
            const idx = params[0]?.dataIndex;
            if (idx === undefined) return "";
            const scene = scenes[idx];
            const isPinned = pinnedSceneRef.current === idx;
            let html = `<b>第${scene.number || idx + 1}场 · ${scene.name || ""}</b><br/>`;
            for (const p of params) {
              if (p.seriesName === "冲突强度")
                html += `⚔️ 冲突强度：${(conflictArc[idx] * 100).toFixed(0)}%<br/>`;
              if (p.seriesName === "情感评分")
                html += `💭 情感评分：${(sentimentArc[idx] >= 0 ? "+" : "")}${(sentimentArc[idx] * 100).toFixed(0)}%<br/>`;
              if (p.seriesName === "出场角色")
                html += `👥 出场角色：${charDensity[idx]} 人<br/>`;
            }
            html += `📍 ${scene.location || "舞台"}<br/>`;
            if (scene.characters && scene.characters.length > 0) {
              const chars = scene.characters.map((c: any) => (typeof c === 'string' ? c : (c.name || c))).join(' · ');
              html += `<div style="font-size:10px;color:#8E8A84;margin-top:2px;max-width:240px;line-height:1.4">👤 ${chars}</div>`;
            }
            html += `<div class="t4-echart-tooltip-actions">`;
            html += `<span class="t4-echart-pin-btn" data-pin-idx="${idx}">📌 ${isPinned ? '已固定' : '固定'}</span>`;
            html += `<span class="t4-echart-copy-btn" data-copy-idx="${idx}">📋 复制</span>`;
            html += `</div>`;
            return html;
          },
        },
        grid: { left: 52, right: 52, top: 16, bottom: 36 },
        xAxis: {
          type: "category", data: sceneLabels,
          axisLabel: { fontSize: 10, color: "#5E4B3A", interval: 0,
            rotate: n > 8 ? 30 : 0 },
          axisTick: { alignWithLabel: true },
        },
        yAxis: [
          {
            type: "value", name: "强度/评分", min: -0.2, max: 1.1,
            nameTextStyle: { fontSize: 10, fontWeight: 600, color: "#96544D" },
            axisLabel: { fontSize: 10, color: "#96544D",
              formatter: (v: number) => `${(v * 100).toFixed(0)}%` },
            splitLine: { lineStyle: { color: "#e8ddce" } },
          },
          {
            type: "value", name: "角色数",
            nameTextStyle: { fontSize: 10, fontWeight: 600, color: "#7F968D" },
            axisLabel: { fontSize: 10, color: "#7F968D" },
            splitLine: { show: false },
          },
        ],
        series: [
          // ══ 阴影层 S0+S1：悬浮投影，sits below ribbon ══
          { name: "s-base", type: "line", yAxisIndex: 0, data: sLo, smooth: true, symbol: "none",
            lineStyle: { opacity: 0 }, itemStyle: { opacity: 0 }, stack: "ts", areaStyle: { opacity: 0 } },
          { name: "s-fill", type: "line", yAxisIndex: 0, data: sBody, smooth: true, symbol: "none",
            lineStyle: { opacity: 0 }, stack: "ts",
            areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(60,20,18,0.10)" }, { offset: 0.5, color: "rgba(50,15,12,0.04)" },
              { offset: 1, color: "rgba(40,10,8,0.00)" }]) } },
          // ══ 丝带主体 S2+S3：3D照明渐变 ══
          { name: "r-base", type: "line", yAxisIndex: 0, data: lo.map(v => +v.toFixed(3)), smooth: true,
            symbol: "none", lineStyle: { opacity: 0 }, itemStyle: { opacity: 0 }, stack: "tr", areaStyle: { opacity: 0 } },
          { name: "叙事张力丝带", type: "line", yAxisIndex: 0, data: body, smooth: true, symbol: "none",
            lineStyle: { opacity: 0 }, stack: "tr",
            areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(252,215,198,0.84)" },     // specular highlight
              { offset: 0.08, color: "rgba(228,148,122,0.74)" },   // diffuse bright
              { offset: 0.22, color: "rgba(198,108,88,0.66)" },    // diffuse mid
              { offset: 0.40, color: "rgba(168,82,68,0.56)" },     // transition
              { offset: 0.58, color: "rgba(138,62,52,0.42)" },     // ambient
              { offset: 0.76, color: "rgba(105,42,35,0.24)" },     // occlusion
              { offset: 0.90, color: "rgba(70,25,20,0.10)" },      // shadow edge
              { offset: 1, color: "rgba(45,15,10,0.02)" },         // fade to bg
            ]) },
            emphasis: { areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(255,228,212,0.90)" }, { offset: 0.15, color: "rgba(235,150,120,0.80)" },
              { offset: 0.5, color: "rgba(185,92,72,0.62)" }, { offset: 0.85, color: "rgba(110,45,35,0.16)" },
              { offset: 1, color: "rgba(50,18,12,0.03)" }]), shadowBlur: 14, shadowColor: "rgba(200,70,55,0.22)" } } },
          // ══ S4: 冲突锚线 ══
          { name: "冲突强度", type: "line", yAxisIndex: 0,
            data: conflictArc.map(v => +v.toFixed(3)), smooth: true, symbol: "circle", symbolSize: 6,
            lineStyle: { color: "#3D1512", width: 2.4 },
            itemStyle: { color: "#3D1512", borderColor: "#fff", borderWidth: 2 },
            markArea: allMarkAreas.length > 0 ? { silent: false, data: allMarkAreas } : undefined,
            markLine: climaxIdx >= 0 ? { silent: true, symbol: "none",
              label: { show: true, formatter: "▼ 高潮", fontSize: 10, fontWeight: 700, color: "#c44d4d",
                position: "middle", distance: [26, 0], rotate: 0 },
              lineStyle: { color: "#c44d4d", type: "dashed", width: 2 }, data: [{ xAxis: climaxIdx }] } : undefined,
            markPoint: allMarkPoints.length > 0 ? { silent: true, data: allMarkPoints } : undefined },
          // ══ S5: 情感纱线 ══
          { name: "情感评分", type: "line", yAxisIndex: 0,
            data: sentimentArc.map(v => +v.toFixed(3)), smooth: true, symbol: "none",
            lineStyle: { color: "rgba(184,149,111,0.32)", width: 1, type: "dashed" as const }, areaStyle: { opacity: 0 } },
          // ══ S6: 角色柱 ══
          { name: "出场角色", type: "bar", yAxisIndex: 1, data: charDensity, barMaxWidth: 14, barGap: "30%",
            itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(127,150,141,0.35)" }, { offset: 1, color: "rgba(127,150,141,0.04)" }]),
              borderRadius: [3, 3, 0, 0] } },
        ],
      });
    } catch (err) {
      console.error("CombinedRhythmChart init failed:", err);
      return;
    }

    const lastHoverRef = { current: null as number | null };
    chart.getZr().on('mousemove', (event: any) => {
      const point = chart.convertFromPixel('grid', [event.offsetX, event.offsetY]);
      if (point && Array.isArray(point) && Number.isFinite(point[0])) {
        const idx = Math.round(Math.max(0, Math.min(n - 1, point[0])));
        if (idx !== lastHoverRef.current) {
          lastHoverRef.current = idx;
          onSceneHover?.(idx);
        }
      }
    });

    chart.getZr().on('mouseout', () => {
      lastHoverRef.current = null;
      onSceneHover?.(null);
    });

    chart.on('click', (params: any) => {
      if (params.componentType === 'markArea') {
        const dimCount = (selectedPhase !== null && selectedPhase !== undefined) ? 2 : 0;
        const phaseIdx = params.dataIndex !== undefined ? params.dataIndex - dimCount : -1;
        if (phaseIdx >= 0 && phaseIdx < phases.length) {
          onPhaseClick?.(phaseIdx === selectedPhase ? null : phaseIdx);
        }
      } else if (params.componentType === 'series') {
        const idx = params.dataIndex;
        if (idx !== undefined) {
          onSceneClick?.(idx);
        }
      } else {
        onPhaseClick?.(null);
      }
    });

    const handleTooltipClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('t4-echart-pin-btn') && target.dataset.pinIdx !== undefined) {
        const idx = parseInt(target.dataset.pinIdx);
        pinnedSceneRef.current = pinnedSceneRef.current === idx ? null : idx;
        if (pinnedSceneRef.current !== null) {
          chart?.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: idx });
        }
      }
      if (target.classList.contains('t4-echart-copy-btn') && target.dataset.copyIdx !== undefined) {
        const idx = parseInt(target.dataset.copyIdx);
        const scene = scenes[idx];
        const text = [
          `第${scene.number || idx + 1}场 · ${scene.name || ''}`,
          `冲突强度：${(conflictArc[idx] * 100).toFixed(0)}%`,
          `情感评分：${(sentimentArc[idx] >= 0 ? '+' : '')}${(sentimentArc[idx] * 100).toFixed(0)}%`,
          `出场角色：${charDensity[idx]} 人`,
          `位置：${scene.location || '舞台'}`,
          scene.characters && scene.characters.length > 0
            ? `角色：${scene.characters.map((c: any) => (typeof c === 'string' ? c : (c.name || c))).join('、')}`
            : '',
        ].filter(Boolean).join('\n');
        navigator.clipboard.writeText(text).then(() => {
          target.textContent = '✅ 已复制';
          setTimeout(() => { target.textContent = '📋 复制'; }, 1500);
        }).catch(() => {});
      }
    };
    document.addEventListener('click', handleTooltipClick);

    const handleShowTip = () => {
      if (pinnedSceneRef.current !== null) {
        setTimeout(() => {
          chart?.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: pinnedSceneRef.current! });
        }, 50);
      }
    };
    chart.on('globalout', handleShowTip);

    const h = () => chart?.resize();
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("resize", h);
      document.removeEventListener('click', handleTooltipClick);
      chart?.off('globalout', handleShowTip);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, [analysis, fingerprint, turningPoints, selectedPhase]);

  // ── 角色切换增量更新（不重建图表）──
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !analysis) return;
    const { conflictArc } = analysis.narrativeMetrics;
    const n = conflictArc.length;

    // 计算选中角色每场出场人数（柱状图数据）
    const totalDensity = analysis.narrativeMetrics.characterDensity;
    let barData: number[];
    if (activeChars.size === 0) {
      barData = totalDensity;
    } else {
      barData = new Array(n).fill(0);
      Array.from(activeChars).forEach(charName => {
        const cs = analysis.characterScenes?.find((c: any) => c.character === charName);
        if (cs?.scenes) cs.scenes.forEach((i: number) => { if (i < n) barData[i]++; });
      });
    }

    // 角色标记（堆叠偏移）
    const charMarkPoints: any[] = [];
    const sceneStack = new Map<number, number>();
    if (activeChars.size > 0 && analysis.characterScenes) {
      Array.from(activeChars).forEach((charName, ci) => {
        const cs = analysis.characterScenes.find((c: any) => c.character === charName);
        if (cs?.scenes) {
          const color = CHAR_COLORS[ci % CHAR_COLORS.length];
          cs.scenes.forEach((sceneIdx: number) => {
            if (sceneIdx >= 0 && sceneIdx < n) {
              const stackIdx = sceneStack.get(sceneIdx) || 0;
              sceneStack.set(sceneIdx, stackIdx + 1);
              charMarkPoints.push({
                name: charName,
                coord: [sceneIdx, Math.min(conflictArc[sceneIdx] + 0.05 + stackIdx * 0.07, 1.04)],
                symbol: "pin", symbolSize: 14,
                itemStyle: { color, borderColor: "#fff", borderWidth: 1 },
                label: { show: false },
              });
            }
          });
        }
      });
    }

    chart.setOption({
      series: [
        {}, {}, {}, {}, // S0-S3: shadow+ribbon layers
        { markPoint: { data: charMarkPoints } }, // S4: 冲突强度
        {}, // S5: 情感
        { data: barData }, // S6: 出场角色
      ],
    }, { notMerge: false, lazyUpdate: false });
  }, [activeChars, analysis]);

  // ── 角色列表（用于底部切换按钮）──
  const characters = analysis?.sortedCharacters || [];

  return (
    <div className="t4-combined-chart-block">
      <div className="t4-combined-chart-header">
        <div className="t4-section-title-row">
          <span className="t4-section-icon">📊</span>
          <h3>综合叙事节奏图</h3>
        </div>
        <span className="t4-chart-hint">
          {fingerprint ? `${fingerprint.sceneCount} 场 · 张力丝带宽∝角色密度 · 高潮&转折标注` : "请选择剧本"}
        </span>
      </div>
      <div ref={ref} className="t4-combined-chart-canvas" />

      {/* ── 图例说明 + 角色切换面板（占 15% 高度）── */}
      {analysis && (
        <div className="t4-chart-legend-panel">
          {/* 角色切换按钮 */}
          {characters.length > 0 && (
            <div className="t4-char-toggle-bar">
              <div className="t4-char-toggle-header">
                <span className="t4-char-toggle-title">🎭 角色出场</span>
                <span className="t4-legend-sep" />
                <span className="t4-legend-chip">
                  <span className="t4-legend-chip-dot" style={{ background: '#c44d4d' }} />
                  <span className="t4-legend-chip-label">张力丝带</span>
                </span>
                <span className="t4-legend-chip">
                  <span className="t4-legend-chip-dot" style={{ background: '#3D1512' }} />
                  <span className="t4-legend-chip-label">冲突</span>
                </span>
                <span className="t4-legend-chip">
                  <span className="t4-legend-chip-dot" style={{ background: '#B89B6D' }} />
                  <span className="t4-legend-chip-label">情感</span>
                </span>
                {activeChars.size > 0 && (
                  <>
                    <span className="t4-legend-sep" />
                    <button className="t4-char-toggle-clear" onClick={clearChars}>
                      清除
                    </button>
                  </>
                )}
              </div>
              <div className="t4-char-toggle-list">
                {characters.slice(0, 12).map((ch, ci) => {
                  const isActive = activeChars.has(ch.character);
                  const color = CHAR_COLORS[ci % CHAR_COLORS.length];
                  const cs = analysis.characterScenes?.find(
                    (c: any) => c.character === ch.character
                  );
                  const sceneCount = cs?.scenes?.length || 0;
                  return (
                    <button
                      key={ch.character}
                      className={`t4-char-toggle-btn ${isActive ? "active" : ""}`}
                      style={{
                        "--char-color": color,
                        borderColor: isActive ? color : undefined,
                        background: isActive
                          ? `${color}18`
                          : undefined,
                      } as React.CSSProperties}
                      onClick={() => toggleChar(ch.character)}
                      title={`${ch.character}：出场 ${sceneCount} 场${ch.group ? ` · ${ch.group}` : ""}`}
                    >
                      <span
                        className="t4-char-toggle-dot"
                        style={{ background: color }}
                      />
                      <span className="t4-char-toggle-name">{ch.short || ch.character}</span>
                      <span className="t4-char-toggle-count">{sceneCount}场</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CombinedRhythmChart;
