import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as echarts from "echarts";
import "./Task2Layout.scss";
import "./Task2Profile.scss";
import { useTask2Store } from "../../stores/task2Store";
import { useTask2Data } from "../../hooks/useTask2Data";
import type { PlayNetwork } from "../../types/task2";
import {
  EDGE_RELATION_COLORS,
  INK_DARK,
  INK_WARM,
  INK_SOFT,
  PAPER_BG,
  FONT_SERIF,
} from "../../types/task2";

/* ================================================================
   Task2Profile — Page 4: 互动剖面解码

   三联视图：
   - 互动频次排名图：Top 15 角色对
   - 情感-频次象限图：四象限经典戏剧关系模式
   ================================================================ */

/* ── 关系类型 → 情感得分映射 ── */
const SENTIMENT_SCORE: Record<string, number> = {
  "敌对": -1.0,
  "中立":  0.0,
  "从属":  0.3,
  "同盟":  0.7,
  "亲属":  0.8,
  "情感":  1.0,
};

/* ── 象限标签 ── */
const QUADRANT_LABELS = [
  { text: "远距离对抗", x: "15%", y: "12%", desc: "低频+敌对" },
  { text: "核心冲突",   x: "85%", y: "12%", desc: "高频+敌对" },
  { text: "远距离联盟", x: "15%", y: "92%", desc: "低频+同盟" },
  { text: "核心搭档",   x: "85%", y: "92%", desc: "高频+同盟" },
];

/* ================================================================
   Main Component
   ================================================================ */
const Task2Profile: React.FC = () => {
  const { selectedType, selectedPlayEntityId } = useTask2Store();
  const { allPlaysList, loadPlayNetwork, getCurrentNetwork, cacheVersion, allPlaysLoading } =
    useTask2Data(selectedType);

  const lollipopRef = useRef<HTMLDivElement>(null);
  const quadrantRef = useRef<HTMLDivElement>(null);

  /* ── 本地状态 ── */
  const [playDropdownOpen, setPlayDropdownOpen] = useState(false);
  const [playSearch, setPlaySearch] = useState("");
  const [excludeNeutral, setExcludeNeutral] = useState(true);
  const playDropdownRef = useRef<HTMLDivElement>(null);

  /* ── 当前网络 ── */
  const currentNet: PlayNetwork | null = useMemo(
    () => getCurrentNetwork(selectedPlayEntityId),
    [getCurrentNetwork, selectedPlayEntityId, cacheVersion],
  );

  /* ── 筛选剧本 ── */
  const filteredAllPlays = useMemo(() => {
    if (!playSearch) return allPlaysList;
    const q = playSearch.toLowerCase();
    return allPlaysList.filter((p) => (p.title || "").toLowerCase().includes(q));
  }, [allPlaysList, playSearch]);

  const handleSelectPlay = useCallback(
    async (entityId: number) => {
      useTask2Store.getState().setSelectedPlayEntityId(entityId);
      setPlayDropdownOpen(false);
      setPlaySearch("");
      if (!getCurrentNetwork(entityId)) {
        await loadPlayNetwork(entityId);
      }
    },
    [loadPlayNetwork, getCurrentNetwork],
  );

  /* ── 关闭下拉 ── */
  useEffect(() => {
    if (!playDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (playDropdownRef.current && !playDropdownRef.current.contains(e.target as Node)) {
        setPlayDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [playDropdownOpen]);

  /* ── 角色对聚合数据 ── */
  const pairData = useMemo(() => {
    if (!currentNet || !currentNet.nodes) return null;
    const pairMap = new Map<string, { totalWeight: number; relTypes: Map<string, number> }>();
    const nodeSceneMap = new Map<string, number>();
    currentNet.nodes.forEach((n) => nodeSceneMap.set(n.name, n.scene_count || 0));

    (currentNet.edges || []).forEach((e) => {
      if (excludeNeutral && e.relation_type === "中立") return;
      const key = [e.source, e.target].sort().join("|||");
      const existing = pairMap.get(key);
      if (existing) {
        existing.totalWeight += e.weight || 0;
        existing.relTypes.set(e.relation_type, (existing.relTypes.get(e.relation_type) || 0) + (e.weight || 0));
      } else {
        const rm = new Map<string, number>();
        rm.set(e.relation_type, e.weight || 0);
        pairMap.set(key, { totalWeight: e.weight || 0, relTypes: rm });
      }
    });

    const pairs = Array.from(pairMap.entries())
      .map(([key, val]) => {
        const [a, b] = key.split("|||");
        let dominantRel = "中立";
        let maxW = 0;
        val.relTypes.forEach((w, r) => { if (w > maxW) { maxW = w; dominantRel = r; } });
        return {
          source: a,
          target: b,
          totalWeight: val.totalWeight,
          dominantRelation: dominantRel,
          relTypeMap: val.relTypes,
          sceneA: nodeSceneMap.get(a) || 0,
          sceneB: nodeSceneMap.get(b) || 0,
        };
      })
      .sort((a, b) => b.totalWeight - a.totalWeight);

    return {
      pairs,
      nodeSceneMap,
      pairMap,
    };
  }, [currentNet, excludeNeutral]);

  /* ==================================================================
     Chart 1 — 互动频次排名 (Top 15)
     ================================================================== */
  useEffect(() => {
    if (!lollipopRef.current || !pairData || pairData.pairs.length === 0) return;
    const chart = echarts.init(lollipopRef.current);

    const top = pairData.pairs.slice(0, 15);
    const labels = top.map((p) => {
      const s = p.source.length > 3 ? p.source.slice(0, 3) + "…" : p.source;
      const t = p.target.length > 3 ? p.target.slice(0, 3) + "…" : p.target;
      return `${s}—${t}`;
    });

    chart.setOption(
      {
        backgroundColor: PAPER_BG,
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          backgroundColor: "rgba(250,245,235,0.94)",
          borderColor: "rgba(160,130,100,0.45)",
          borderWidth: 1,
          textStyle: { color: INK_DARK, fontSize: 11, fontFamily: FONT_SERIF },
          formatter: (params: any) => {
            const idx = params[0]?.dataIndex;
            if (idx === undefined) return "";
            const p = top[idx];
            let html = `<b>${p.source} — ${p.target}</b><br/>共现权重: ${p.totalWeight}<br/>主导关系: ${p.dominantRelation}`;
            p.relTypeMap.forEach((w, r) => { html += `<br/>  ${r}: ${w}`; });
            return html;
          },
        },
        grid: { left: 110, right: 30, top: 10, bottom: 8 },
        xAxis: {
          type: "value",
          name: "互动权重",
          nameTextStyle: { fontSize: 9, color: INK_SOFT, fontFamily: FONT_SERIF },
          axisLabel: { fontSize: 8, color: INK_SOFT, fontFamily: FONT_SERIF },
          splitLine: { lineStyle: { color: "rgba(180,155,120,0.1)" } },
        },
        yAxis: {
          type: "category",
          data: labels.reverse(),
          position: "left",
          axisLabel: { fontSize: 8, color: INK_DARK, fontFamily: FONT_SERIF, width: 100, overflow: "truncate" },
          axisLine: { show: false },
          axisTick: { show: false },
        },
        series: [
          {
            type: "bar",
            data: [...top].reverse().map((p) => ({
              value: p.totalWeight,
              itemStyle: {
                color: EDGE_RELATION_COLORS[p.dominantRelation as keyof typeof EDGE_RELATION_COLORS] || "#c0c0c0",
                opacity: 0.75,
                borderRadius: [0, 3, 3, 0],
              },
            })),
            barMaxWidth: 14,
          },
        ],
        animationDuration: 500,
      },
      true,
    );

    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("resize", h);
      chart.dispose();
    };
  }, [pairData]);

  /* ==================================================================
     Chart 2 — 情感-频次象限图
     ================================================================== */
  useEffect(() => {
    if (!quadrantRef.current || !pairData || pairData.pairs.length === 0) return;
    const chart = echarts.init(quadrantRef.current);

    const points = pairData.pairs.map((p) => {
      // 情感得分：按权重加权平均
      let totalSentiment = 0;
      let totalW = 0;
      p.relTypeMap.forEach((w, r) => {
        totalSentiment += (SENTIMENT_SCORE[r] ?? 0) * w;
        totalW += w;
      });
      const sentiment = totalW > 0 ? totalSentiment / totalW : 0;
      return {
        value: [sentiment, p.totalWeight],
        name: `${p.source}—${p.target}`,
        relation: p.dominantRelation,
        weight: p.totalWeight,
        sentiment,
      };
    });

    const relTypes = [...new Set(points.map((p) => p.relation))];

    const series = relTypes.map((rel) => ({
      name: rel,
      type: "scatter",
      data: points.filter((p) => p.relation === rel),
      symbolSize: (val: any) => Math.max(6, Math.min(24, Math.sqrt(val[1]) * 3)),
      itemStyle: {
        color: EDGE_RELATION_COLORS[rel as keyof typeof EDGE_RELATION_COLORS] || "#c0c0c0",
        opacity: 0.6,
      },
      emphasis: { scale: 1.4, itemStyle: { opacity: 0.9 } },
    }));

    chart.setOption(
      {
        backgroundColor: PAPER_BG,
        tooltip: {
          trigger: "item",
          backgroundColor: "rgba(250,245,235,0.94)",
          borderColor: "rgba(160,130,100,0.45)",
          borderWidth: 1,
          textStyle: { color: INK_DARK, fontSize: 11, fontFamily: FONT_SERIF },
          formatter: (p: any) => {
            const d = p.data;
            return `<b>${d.name}</b><br/>关系: ${d.relation}<br/>情感得分: ${d.sentiment.toFixed(2)}<br/>权重: ${d.weight}`;
          },
        },
        legend: {
          data: relTypes,
          bottom: 0,
          textStyle: { fontSize: 9, color: INK_SOFT, fontFamily: FONT_SERIF },
          itemWidth: 10,
          itemHeight: 6,
        },
        grid: { left: 55, right: 25, top: 30, bottom: 48 },
        xAxis: {
          name: "情感倾向 (敌对 ← → 同盟)",
          nameLocation: "center",
          nameGap: 10,
          min: -1.2,
          max: 1.2,
          nameTextStyle: { fontSize: 10, color: INK_SOFT, fontFamily: FONT_SERIF },
          axisLabel: {
            fontSize: 8, color: INK_SOFT, fontFamily: FONT_SERIF,
            formatter: (v: number) => v < 0 ? "敌对" : v > 0 ? "同盟" : "中立",
          },
          splitLine: { lineStyle: { color: "rgba(180,155,120,0.1)" } },
        },
        yAxis: {
          name: "互动频次 (权重)",
          nameLocation: "center",
          nameGap: 32,
          nameTextStyle: { fontSize: 10, color: INK_SOFT, fontFamily: FONT_SERIF },
          axisLabel: { fontSize: 8, color: INK_SOFT, fontFamily: FONT_SERIF },
          splitLine: { lineStyle: { color: "rgba(180,155,120,0.1)" } },
        },
        series,
        animationDuration: 600,
      },
      true,
    );

    // 添加十字分割线：X=0(情感中性) + Y=中位频次
    const medianWeight = points.length > 0
      ? [...points].sort((a, b) => a.value[1] - b.value[1])[Math.floor(points.length / 2)].value[1]
      : 0;

    chart.setOption({
      series: [
        ...series,
        {
          type: "scatter",
          data: [],
          markLine: {
            silent: true,
            symbol: "none",
            label: { show: false },
            data: [
              { xAxis: 0, lineStyle: { color: INK_SOFT, width: 1, opacity: 0.3, type: "dashed" as const } },
              { yAxis: medianWeight, lineStyle: { color: INK_SOFT, width: 1, opacity: 0.3, type: "dashed" as const } },
            ],
          },
        },
      ],
    } as any);

    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("resize", h);
      chart.dispose();
    };
  }, [pairData]);

  /* ==================================================================
     JSX
     ================================================================== */
  return (
    <div className="t2-screen">
      <div className="t2-chart-toolbar" style={{ flexShrink: 0, padding: "4px 16px 0" }}>
        <div className="t2-net-meta-inline">
          <div className="t2-play-selector" ref={playDropdownRef}>
            <button className="t2-play-selector-btn"
              onClick={() => { setPlayDropdownOpen(!playDropdownOpen); setPlaySearch(""); }}>
              <span className="t2-net-title">{currentNet?.title || (allPlaysLoading ? "加载中..." : "选择剧本")}</span>
              <span className="t2-play-arrow">{playDropdownOpen ? "▲" : "▼"}</span>
            </button>
            {playDropdownOpen && (
              <div className="t2-play-dropdown">
                <div className="t2-play-search-bar">
                  <input className="t2-play-search-input"
                    placeholder={`搜索${selectedType}剧本... (共${allPlaysList.length}部)`}
                    value={playSearch} onChange={(e) => setPlaySearch(e.target.value)}
                    onClick={(e) => e.stopPropagation()} autoFocus />
                </div>
                <div className="t2-play-dropdown-scroll">
                  {filteredAllPlays.map((p) => (
                    <button key={p.entity_id}
                      className={`t2-play-dropdown-item ${selectedPlayEntityId === p.entity_id ? "active" : ""}`}
                      onClick={() => handleSelectPlay(p.entity_id)}>
                      <span className="t2-play-name">{p.title}</span>
                      <span className="t2-play-meta">{p.node_count || 0}角·{p.edge_count || 0}边</span>
                    </button>
                  ))}
                  {filteredAllPlays.length === 0 && <div className="t2-play-search-empty">无匹配剧本</div>}
                </div>
              </div>
            )}
          </div>
          {currentNet && (<><span className="t2-net-stat">角色{currentNet.total_characters}</span><span className="t2-net-stat">边{currentNet.total_edges}</span></>)}
          <button className={`t2-edge-toggle ${excludeNeutral ? "active" : ""}`}
            onClick={() => setExcludeNeutral(!excludeNeutral)} title="排除/包含中立关系">
            {excludeNeutral ? "✓ 排除中立" : "✗ 含中立边"}
          </button>
        </div>
      </div>

      <div className="t2-profile-grid">
        {/* ── 棒棒糖排名 ── */}
        <div className="t2-pr-card t2-pr-lollipop">
          <div className="t2-pr-card-header">
            <h3>互动频次排名 · Top 15</h3>
            <span className="t2-pr-hint">颜色=主导关系类型</span>
          </div>
          <div ref={lollipopRef} className="t2-pr-chart" />
        </div>

        {/* ── 情感象限图 ── */}
        <div className="t2-pr-card t2-pr-quadrant">
          <div className="t2-pr-card-header">
            <h3>情感-频次 · 四象限图</h3>
            <span className="t2-pr-hint">
              X=情感倾向(敌对↔同盟) Y=互动频次 | 点大小=权重
            </span>
          </div>
          <div ref={quadrantRef} className="t2-pr-chart" />
          {/* 象限标注 */}
          <div className="t2-pr-quadrant-labels">
            {QUADRANT_LABELS.map((ql) => (
              <div
                key={ql.text}
                className="t2-pr-quadrant-label"
                style={{ left: ql.x, top: ql.y }}
                title={ql.desc}
              >
                <b>{ql.text}</b>
                <span>{ql.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Task2Profile;
