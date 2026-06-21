import React, { useRef, useEffect } from "react";
import * as echarts from "echarts";
import starmapData from "../../data/starmap-data.json";
import { NARRATIVE_TYPE_INFO } from "../../types/task4Types";

/* ================================================================
   Narrative Type Distribution Chart (horizontal bar)
   ================================================================ */

export const NarrativeTypeChart: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);

    const narrTypes = (starmapData as any).config.narrTypes as string[];
    const narrColors = (starmapData as any).config.narrColors as Record<string, string>;
    const narrStats = (starmapData as any).narrStats as Record<string, { count: number }>;
    const total = (starmapData as any).meta.totalScripts as number;

    const data = narrTypes
      .map((t: string) => ({
        name: t,
        value: narrStats[t]?.count ?? 0,
        color: narrColors[t] || "#999",
        pct: ((narrStats[t]?.count ?? 0) / total * 100),
      }))
      .sort((a, b) => b.value - a.value);

    chart.setOption({
      tooltip: {
        backgroundColor: "rgba(255,255,255,0.94)",
        borderColor: "rgba(150,84,77,0.2)",
        borderWidth: 1,
        borderRadius: 10,
        padding: [10, 14],
        textStyle: { fontSize: 13, color: "#5E4B3A" },
        formatter: (p: any) => {
          const info = NARRATIVE_TYPE_INFO[p.name] || "";
          return `<b>${p.name}</b><br/>剧本数：${p.value} 部（${p.data.pct.toFixed(1)}%）<br/><span style="color:#8E8A84;font-size:11px">${info}</span>`;
        },
      },
      grid: { left: 80, right: 12, top: 8, bottom: 6 },
      xAxis: {
        type: "value",
        show: false,
      },
      yAxis: {
        type: "category",
        data: data.map((d) => d.name),
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          fontSize: 12,
          fontWeight: 600,
          color: "#5E4B3A",
          margin: 8,
        },
      },
      series: [
        {
          type: "bar",
          data: data.map((d) => ({
            value: d.value,
            pct: d.pct,
            name: d.name,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                { offset: 0, color: d.color + "88" },
                { offset: 1, color: d.color },
              ]),
              borderRadius: [0, 6, 6, 0],
            },
          })),
          barMaxWidth: 22,
          label: {
            show: true,
            position: "right",
            fontSize: 11,
            fontWeight: 500,
            color: "#8E8A84",
            formatter: (p: any) => `${p.data.value} 部`,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 4,
              shadowColor: "rgba(0,0,0,0.08)",
            },
          },
        },
      ],
    });

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, []);

  return (
    <div className="t4-narr-type-chart">
      <div ref={ref} style={{ width: "100%", height: 65 }} />
    </div>
  );
};

export default NarrativeTypeChart;
