/**
 * NarrativeDNASummaryCard.tsx — 叙事DNA总结卡片 (维度9)
 *
 * 7 维雷达图 + 综合评价文本。
 * 作为独立组件，可嵌入主视图底部或 sidebar 内。
 */
import React, { useRef, useEffect } from "react";
import * as echarts from "echarts";
import { generateNarrativeDNAText } from "../../utils/narrativeAnalysisEnhancer";

interface DNAValues {
  sceneScale: number;
  charDensity: number;
  conflictIntensity: number;
  emotionVolatility: number;
  climaxConcentration: number;
  suspenseRetention: number;
  perfFormComplexity: number;
}

interface NarrativeDNASummaryCardProps {
  /** 7 维 DNA 值 (0-100) */
  values?: DNAValues | null;
  /** 结构框架名称 (用于生成文本) */
  framework?: string;
  /** 该剧所属叙事类型的名称 */
  structureType?: string;
  /** 类型均值 (用于对比) */
  baselineValues?: Partial<DNAValues> | null;
  /** 紧凑模式 (用于右侧面板) */
  compact?: boolean;
}

const DNA_DIMS = [
  { key: "sceneScale", label: "场景规模" },
  { key: "charDensity", label: "角色密度" },
  { key: "conflictIntensity", label: "冲突强度" },
  { key: "emotionVolatility", label: "情绪波动" },
  { key: "climaxConcentration", label: "高潮集中度" },
  { key: "suspenseRetention", label: "悬念保持度" },
  { key: "perfFormComplexity", label: "形式复杂度" },
];

const NarrativeDNASummaryCard: React.FC<NarrativeDNASummaryCardProps> = ({
  values,
  framework = "线性渐进",
  structureType,
  baselineValues,
  compact = false,
}) => {
  const radarRef = useRef<HTMLDivElement>(null);
  const defaultValues: DNAValues = {
    sceneScale: 30,
    charDensity: 30,
    conflictIntensity: 40,
    emotionVolatility: 35,
    climaxConcentration: 50,
    suspenseRetention: 40,
    perfFormComplexity: 30,
  };

  const dnaValues = values || defaultValues;
  const dnaColor = "#96544D";

  useEffect(() => {
    if (!radarRef.current) return;
    let chart: echarts.ECharts | null = null;
    try {
      const existing = echarts.getInstanceByDom(radarRef.current);
      if (existing) existing.dispose();
      chart = echarts.init(radarRef.current);

      const indicator = DNA_DIMS.map((d) => ({
        name: d.label,
        max: 100,
      }));

      const currentData = DNA_DIMS.map(
        (d) => (dnaValues as any)[d.key] ?? 50
      );

      const seriesData: any[] = [
        {
          name: "当前剧本",
          value: currentData,
          lineStyle: { color: dnaColor, width: 2 },
          areaStyle: { color: dnaColor, opacity: 0.15 },
          itemStyle: { color: dnaColor },
          symbol: "circle",
          symbolSize: 5,
        },
      ];

      if (baselineValues) {
        const baseData = DNA_DIMS.map(
          (d) => (baselineValues as any)[d.key] ?? 0
        );
        if (baseData.some((v) => v > 0)) {
          seriesData.push({
            name: `${structureType || ""}均值`,
            value: baseData,
            lineStyle: {
              color: dnaColor,
              type: "dashed" as const,
              width: 1.5,
              opacity: 0.5,
            },
            areaStyle: { opacity: 0 },
            itemStyle: { color: dnaColor, opacity: 0.3 },
            symbol: "diamond",
            symbolSize: 4,
          });
        }
      }

      const legendBottom = compact ? 0 : 4;

      chart.setOption({
        tooltip: {
          backgroundColor: "rgba(255,255,255,0.94)",
          borderColor: "rgba(150,84,77,0.2)",
          borderWidth: 1,
          borderRadius: 10,
          padding: [6, 10],
          textStyle: { fontSize: 11, color: "#5E4B3A" },
          formatter: (params: any) => {
            if (!params.seriesName) return "";
            const dimIdx = params.dataIndex;
            return `<b>${params.seriesName}</b><br/>${DNA_DIMS[dimIdx].label}: ${params.value.toFixed(0)}%`;
          },
        },
        legend: seriesData.length > 1
          ? {
              bottom: legendBottom,
              data: seriesData.map((s) => s.name),
              textStyle: { fontSize: compact ? 8 : 10, color: "#5E4B3A" },
              icon: "roundRect",
              itemWidth: compact ? 6 : 8,
              itemHeight: compact ? 6 : 8,
            }
          : undefined,
        radar: {
          center: compact ? ["50%", "50%"] : ["50%", "50%"],
          radius: compact ? "48%" : "70%",
          indicator,
          axisName: {
            fontSize: compact ? 8 : 10,
            fontWeight: 600,
            color: "#5E4B3A",
          },
          axisLine: { lineStyle: { color: "rgba(94,107,118,0.12)" } },
          splitLine: { lineStyle: { color: "rgba(94,107,118,0.06)" } },
          splitArea: {
            areaStyle: {
              color: ["rgba(246,241,231,0.3)", "rgba(255,253,249,0.2)"],
            },
          },
        },
        series: [
          {
            type: "radar",
            data: seriesData,
            symbol: "circle",
            symbolSize: compact ? 3 : 5,
          },
        ],
      });
    } catch (err) {
      console.error("NarrativeDNASummaryCard radar init failed:", err);
    }
    const h = () => chart?.resize();
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("resize", h);
      chart?.dispose();
    };
  }, [dnaValues, baselineValues, structureType, compact, dnaColor]);

  // 生成评价文本
  const summaryText = generateNarrativeDNAText(dnaValues, framework);

  return (
    <div className={`t4-dna-summary${compact ? " t4-dna-summary-compact" : ""}`}>
      {!compact && (
        <div className="t4-section-title-row">
          <span className="t4-section-icon">🧬</span>
          <h3>叙事DNA总结</h3>
        </div>
      )}
      <div ref={radarRef} className="t4-dna-summary-canvas" />
      <div className="t4-dna-summary-text">{summaryText}</div>
    </div>
  );
};

export default NarrativeDNASummaryCard;
