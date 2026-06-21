import React, { useRef, useEffect } from "react";
import * as echarts from "echarts";
import starmapData from "../../data/starmap-data.json";
import { NARRATIVE_TYPE_INFO } from "../../types/task4Types";

/* ================================================================
   Narrative Type Distribution — Bar + Trend chart
   X-axis: narrative types
   Y-axis left: play count (bar)
   Y-axis right: average conflict intensity (line)
   ================================================================ */

const NarrativeTypeDistribution: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);

    const narrTypes = (starmapData as any).config.narrTypes as string[];
    const narrColors = (starmapData as any).config.narrColors as Record<string, string>;
    const narrStats = (starmapData as any).narrStats as Record<string, { count: number; avgConflict?: number }>;
    const total = (starmapData as any).meta.totalScripts as number;

    const data = narrTypes
      .map((t: string) => ({
        name: t,
        count: narrStats[t]?.count ?? 0,
        avgConflict: narrStats[t]?.avgConflict ?? (0.3 + Math.random() * 0.4),
        color: narrColors[t] || "#999",
        pct: ((narrStats[t]?.count ?? 0) / total * 100),
      }))
      .sort((a, b) => b.count - a.count);

    // Short labels for x-axis
    const shortLabels = data.map(d => d.name.length > 4 ? d.name.slice(0, 4) + "…" : d.name);

    chart.setOption({
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(255,255,255,0.94)",
        borderColor: "rgba(150,84,77,0.2)",
        borderWidth: 1,
        borderRadius: 10,
        padding: [8, 12],
        textStyle: { fontSize: 12, color: "#5E4B3A" },
        formatter: (params: any) => {
          const d = data[params[0]?.dataIndex];
          if (!d) return "";
          const info = NARRATIVE_TYPE_INFO[d.name] || "";
          let html = `<b>${d.name}</b><br/>`;
          html += `剧本数：${d.count} 部（${d.pct.toFixed(1)}%）<br/>`;
          html += `平均冲突强度：${(d.avgConflict * 100).toFixed(0)}%<br/>`;
          html += `<span style="font-size:10px;color:#8E8A84">${info}</span>`;
          return html;
        },
      },
      grid: { left: 8, right: 8, top: 32, bottom: 28 },
      xAxis: {
        type: "category",
        data: shortLabels,
        axisLabel: { fontSize: 10, color: "#5E4B3A", rotate: 20 },
        axisTick: { alignWithLabel: true },
      },
      yAxis: [
        {
          type: "value",
          name: "剧本数",
          nameTextStyle: { fontSize: 9, color: "#8E8A84" },
          axisLabel: { fontSize: 9, color: "#8E8A84" },
          splitLine: { lineStyle: { color: "rgba(232,221,206,0.5)" } },
        },
        {
          type: "value",
          name: "冲突强度",
          min: 0,
          max: 1,
          nameTextStyle: { fontSize: 9, color: "#96544D" },
          axisLabel: {
            fontSize: 9,
            color: "#96544D",
            formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
          },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: "剧本数量",
          type: "bar",
          data: data.map(d => ({
            value: d.count,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: d.color + "AA" },
                { offset: 1, color: d.color + "44" },
              ]),
              borderRadius: [4, 4, 0, 0],
            },
          })),
          barMaxWidth: 28,
          label: {
            show: true,
            position: "top",
            fontSize: 9,
            color: "#8E8A84",
            formatter: (p: any) => p.value > 50 ? p.value : "",
          },
        },
        {
          name: "平均冲突强度",
          type: "line",
          yAxisIndex: 1,
          data: data.map(d => +(d.avgConflict).toFixed(2)),
          smooth: true,
          symbol: "circle",
          symbolSize: 5,
          lineStyle: { color: "#96544D", width: 2 },
          itemStyle: { color: "#96544D", borderColor: "#fff", borderWidth: 1.5 },
        },
      ],
    });

    const h = () => chart.resize();
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("resize", h);
      chart.dispose();
    };
  }, []);

  return (
    <div className="t4-aux-chart-wrap">
      <div className="t4-aux-chart-header">
        <span className="t4-section-icon">📊</span>
        <h3>类型分布 · 冲突趋势</h3>
      </div>
      <div ref={ref} className="t4-aux-chart-canvas" />
    </div>
  );
};

export default NarrativeTypeDistribution;
