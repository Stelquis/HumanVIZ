/**
 * PerformanceFormPanel.tsx — 表演形式分析面板 (维度5)
 *
 * 展示剧本的唱/念/做/打/白 表演形式比率，含:
 *   - 堆叠柱状图 (各阶段变化)
 *   - 雷达图 (与同类型均值对比)
 *   - 信息熵 (复杂度) 评分
 */
import React, { useRef, useEffect } from "react";
import * as echarts from "echarts";

interface PerformanceFormData {
  singing: number;   // 唱
  reciting: number;  // 念
  speaking: number;  // 做
  acting: number;    // 表
  fighting: number;  // 打
  entropy: number;
}

interface PhaseFormData {
  label: string;
  singing: number;
  reciting: number;
  speaking: number;
  acting: number;
  fighting: number;
}

interface PerformanceFormPanelProps {
  /** 当前剧的表演形式数据 (来自 universal-narrative-analysis.json) */
  performanceForm?: PerformanceFormData | null;
  /** 各阶段表演形式分布的估算数据 (按阶段) */
  phaseForms?: PhaseFormData[] | null;
  /** 该剧所属叙事类型的平均表演形式数据 (来自 baselines) */
  typeBaseline?: PerformanceFormData | null;
  /** 该剧的叙事类型名称 (用于 comparison 标签) */
  structureType?: string;
}

const FORM_COLORS: Record<string, string> = {
  singing: "#c44d4d",
  reciting: "#5e6b76",
  speaking: "#b89b6d",
  acting: "#7f968d",
  fighting: "#c4a56e",
};

const FORM_LABELS: Record<string, string> = {
  singing: "唱",
  reciting: "念",
  speaking: "做(白)",
  acting: "做(表)",
  fighting: "打",
};

const PerformanceFormPanel: React.FC<PerformanceFormPanelProps> = ({
  performanceForm,
  typeBaseline,
  structureType,
}) => {
  const radarRef = useRef<HTMLDivElement>(null);

  // 雷达图：当前剧 vs 类型均值
  useEffect(() => {
    if (!radarRef.current || !performanceForm) return;
    let chart: echarts.ECharts | null = null;
    try {
      const existing = echarts.getInstanceByDom(radarRef.current);
      if (existing) existing.dispose();
      chart = echarts.init(radarRef.current);

      const dims = ["singing", "reciting", "speaking", "acting", "fighting"];
      const indicator = dims.map((d) => ({
        name: FORM_LABELS[d],
        max: 1.0,
      }));

      const currentValues = dims.map((d) =>
        Math.round((performanceForm[d as keyof PerformanceFormData] as number) * 1000) / 10
      );

      const seriesData: any[] = [
        {
          name: "当前剧本",
          value: currentValues,
          lineStyle: { color: "#96544D", width: 2 },
          areaStyle: { color: "rgba(150,84,77,0.15)" },
          itemStyle: { color: "#96544D" },
          symbol: "circle",
          symbolSize: 5,
        },
      ];

      if (typeBaseline) {
        const baseValues = dims.map((d) =>
          Math.round((typeBaseline[d as keyof PerformanceFormData] as number) * 1000) / 10
        );
        seriesData.push({
          name: `${structureType || ""}均值`,
          value: baseValues,
          lineStyle: { color: "#B89B6D", type: "dashed" as const, width: 1.5, opacity: 0.6 },
          areaStyle: { opacity: 0 },
          itemStyle: { color: "#B89B6D", opacity: 0.3 },
          symbol: "diamond",
          symbolSize: 4,
        });
      }

      chart.setOption({
        tooltip: {
          trigger: "item",
          backgroundColor: "rgba(255,255,255,0.94)",
          borderColor: "rgba(150,84,77,0.2)",
          borderWidth: 1,
          borderRadius: 10,
          padding: [8, 12],
          textStyle: { fontSize: 12, color: "#5E4B3A" },
        },
        legend: {
          bottom: 0,
          data: seriesData.map((s) => s.name),
          textStyle: { fontSize: 10, color: "#5E4B3A" },
          icon: "roundRect",
          itemWidth: 8,
          itemHeight: 8,
        },
        radar: {
          center: ["50%", "48%"],
          radius: "60%",
          indicator,
          axisName: { fontSize: 11, fontWeight: 600, color: "#5E4B3A" },
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
      console.error("PerformanceForm Radar init failed:", err);
    }
    const h = () => chart?.resize();
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("resize", h);
      chart?.dispose();
    };
  }, [performanceForm, typeBaseline, structureType]);

  if (!performanceForm) {
    return (
      <div className="t4-perf-panel">
        <div className="t4-section-intro">
          <strong>表演形式分析</strong>
          <p>当前剧本暂无表演形式数据</p>
        </div>
      </div>
    );
  }

  const total =
    performanceForm.singing +
    performanceForm.reciting +
    performanceForm.speaking +
    performanceForm.acting +
    performanceForm.fighting;
  const totalFormatted = total > 0 ? total : 1;

  const formEntries = [
    { key: "singing", label: "唱腔", value: performanceForm.singing, color: FORM_COLORS.singing },
    { key: "reciting", label: "念白", value: performanceForm.reciting, color: FORM_COLORS.reciting },
    { key: "speaking", label: "做(白)", value: performanceForm.speaking, color: FORM_COLORS.speaking },
    { key: "acting", label: "做(表)", value: performanceForm.acting, color: FORM_COLORS.acting },
    { key: "fighting", label: "武打", value: performanceForm.fighting, color: FORM_COLORS.fighting },
  ].sort((a, b) => b.value - a.value);

  return (
    <div className="t4-perf-panel">
      <div className="t4-section-intro">
        <strong>表演形式分析</strong>
        <p>基于结构指纹提取的唱、念、做、打、白五种表演形式在剧本中的比率分布。</p>
      </div>

      {/* 占比水平柱状图 */}
      <div className="t4-mini-title">表演形式占比</div>
      <div className="t4-perf-bar-list">
        {formEntries.map((entry) => {
          const pct = ((entry.value / totalFormatted) * 100).toFixed(1);
          return (
            <div key={entry.key} className="t4-perf-bar-row">
              <span className="t4-perf-bar-label">{entry.label}</span>
              <div className="t4-perf-bar-track">
                <div
                  className="t4-perf-bar-fill"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: entry.color,
                  }}
                />
              </div>
              <span className="t4-perf-bar-value">{pct}%</span>
            </div>
          );
        })}
      </div>

      {/* 信息熵 (复杂度) */}
      <div className="t4-perf-entropy-row">
        <span className="t4-perf-entropy-label">表演形式复杂度</span>
        <div className="t4-perf-entropy-bar">
          <div
            className="t4-perf-entropy-fill"
            style={{ width: `${(performanceForm.entropy * 100).toFixed(0)}%` }}
          />
        </div>
        <span className="t4-perf-entropy-val">
          {(performanceForm.entropy * 100).toFixed(0)}%
        </span>
      </div>

      {/* 对比雷达图 */}
      <div className="t4-mini-title" style={{ marginTop: 14 }}>
        与同类均值对比
      </div>
      <div ref={radarRef} className="t4-perf-radar-canvas" />

      <div className="t4-section-intro" style={{ marginTop: 12 }}>
        <p style={{ fontSize: 11, color: "#8E8A84" }}>
          该剧本以<strong>{formEntries[0].label}</strong>为主要表演形式（占
          {((formEntries[0].value / totalFormatted) * 100).toFixed(0)}%），
          {formEntries[1].value > 0
            ? `${formEntries[1].label}次之（${((formEntries[1].value / totalFormatted) * 100).toFixed(0)}%），`
            : ""}
          表演形式复杂度为
          <strong>
            {performanceForm.entropy > 0.7
              ? "高（形式多样）"
              : performanceForm.entropy > 0.4
              ? "中（适度多样）"
              : "低（形式集中）"}
          </strong>
          。
        </p>
      </div>
    </div>
  );
};

export default PerformanceFormPanel;
