import React, { useRef, useEffect } from "react";
import * as echarts from "echarts";
import narrativeBaselinesRaw from "../../data/narrative-baselines.json";
import starmapData from "../../data/starmap-data.json";
import type { RibbonAnalysisResult, StoryFingerprint } from "../../utils/storyRibbonCore";
import { DNA_RADAR_DIMS } from "../../types/task4Types";
import type { NarrativeDNARadarProps } from "../../types/task4Types";

const NarrativeDNARadar: React.FC<NarrativeDNARadarProps> = ({ fingerprint, analysis, compact }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !fingerprint) return;
    let chart: echarts.ECharts | null = null;
    try {
      const existing = echarts.getInstanceByDom(ref.current);
      if (existing) existing.dispose();
      chart = echarts.init(ref.current);

      // Compute 6 dimension values
      const conflictArc = analysis?.narrativeMetrics.conflictArc || [];
      const avgConflict = conflictArc.length > 0
        ? conflictArc.reduce((s, v) => s + v, 0) / conflictArc.length : fingerprint.conflictRange;
      const maxConflict = conflictArc.length > 0 ? Math.max(...conflictArc) : 0.5;
      const climaxConcentration = avgConflict > 0
        ? Math.min(1, maxConflict / Math.max(avgConflict, 0.01) / 5) : 0.4;

      // Suspense retention: average conflict level in pre-climax phase
      const climaxIdx = conflictArc.length > 0 ? conflictArc.indexOf(maxConflict) : -1;
      let suspenseRetention = 0.35;
      if (climaxIdx > 0 && conflictArc.length > 0) {
        const preClimax = conflictArc.slice(0, climaxIdx);
        suspenseRetention = preClimax.length > 0
          ? preClimax.reduce((s, v) => s + v, 0) / preClimax.length : 0.35;
      }

      const rawValues: Record<string, number> = {
        sceneScale: fingerprint.sceneCount,
        charDensity: fingerprint.avgCharsPerScene,
        conflictIntensity: avgConflict,
        emotionVolatility: fingerprint.sentimentVolatility,
        climaxConcentration,
        suspenseRetention,
      };

      // Get type average for reference (from narrativeBaselinesRaw)
      const baselines = narrativeBaselinesRaw as any;
      const typeProfiles = baselines.narrTypes?.profiles || {};
      const narrType = fingerprint.structureType || "";
      const typeProfile = typeProfiles[narrType] || null;

      const indicator = DNA_RADAR_DIMS.map(d => ({
        name: d.label, max: 100,
      }));
      const currentData = DNA_RADAR_DIMS.map(d => {
        const raw = rawValues[d.key] || 0;
        return +Math.min(100, (raw / Math.max(d.max, 1) * 100)).toFixed(1);
      });

      // Type average data for reference
      const typeAvgData = typeProfile ? DNA_RADAR_DIMS.map(d => {
        let raw = 0;
        switch (d.key) {
          case "sceneScale": raw = typeProfile.avgSceneCount || 0; break;
          case "charDensity": raw = typeProfile.avgDensity || 0; break;
          case "conflictIntensity": raw = (typeProfile as any).avgConflictRange || 0.4; break;
          case "emotionVolatility": raw = (typeProfile as any).avgSentimentVolatility || 0.3; break;
          case "climaxConcentration": raw = (typeProfile as any).avgClimaxPosition
            ? 1 - Math.abs(0.6 - (typeProfile as any).avgClimaxPosition) : 0.5; break;
          case "suspenseRetention": raw = 0.35; break;
        }
        return +Math.min(100, (raw / Math.max(d.max, 1) * 100)).toFixed(1);
      }) : [];

      // Use narrative type color from starmapData
      const narrColors = (starmapData as any).config?.narrColors || {};
      const typeColor = narrColors[narrType] || "#B89B6D";

      const seriesData: any[] = [{
        name: "当前剧本",
        value: currentData,
        lineStyle: { color: typeColor, width: 2 },
        areaStyle: { color: typeColor, opacity: 0.15 },
        itemStyle: { color: typeColor },
        symbol: "circle", symbolSize: 5,
      }];

      if (typeAvgData.length > 0) {
        seriesData.push({
          name: `${narrType}均值`,
          value: typeAvgData,
          lineStyle: { color: typeColor, type: "dashed" as const, width: 1.5, opacity: 0.5 },
          areaStyle: { opacity: 0 },
          itemStyle: { color: typeColor, opacity: 0.3 },
          symbol: "diamond", symbolSize: 4,
        });
      }

      chart.setOption({
        tooltip: {
          backgroundColor: "rgba(255,255,255,0.94)",
          borderColor: "rgba(150,84,77,0.2)",
          borderWidth: 1, borderRadius: 10, padding: [8, 12],
          textStyle: { fontSize: 12, color: "#5E4B3A" },
        },
        legend: {
          bottom: 0,
          data: seriesData.map(s => s.name),
          textStyle: { fontSize: 10, color: "#5E4B3A" },
          icon: "roundRect", itemWidth: 8, itemHeight: 8,
        },
        radar: {
          center: ["50%", "50%"],
          radius: "75%",
          indicator,
          axisName: { fontSize: 10, fontWeight: 600, color: "#5E4B3A" },
          axisLine: { lineStyle: { color: "rgba(94,107,118,0.12)" } },
          splitLine: { lineStyle: { color: "rgba(94,107,118,0.06)" } },
          splitArea: {
            areaStyle: {
              color: ["rgba(246,241,231,0.3)", "rgba(255,253,249,0.2)"],
            },
          },
        },
        series: [{ type: "radar", data: seriesData }],
      });
    } catch (err) {
      console.error("NarrativeDNARadar init failed:", err);
      return;
    }
    const h = () => chart?.resize();
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("resize", h); chart?.dispose(); };
  }, [fingerprint, analysis]);

  return (
    <div className={`t4-dna-radar-block${compact ? " t4-dna-radar-compact" : ""}`}>
      {!compact && (
        <div className="t4-section-title-row">
          <span className="t4-section-icon">🧬</span>
          <h3>叙事DNA雷达图</h3>
        </div>
      )}
      <div ref={ref} className="t4-dna-radar-canvas" />
    </div>
  );
};

export default NarrativeDNARadar;
