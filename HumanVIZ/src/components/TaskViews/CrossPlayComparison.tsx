/**
 * CrossPlayComparison.tsx — 跨剧本对比面板 (维度11)
 *
 * 允许选择 2-5 部剧本进行多维对比，支持:
 *   - 多选剧本下拉
 *   - 雷达图叠加对比
 *   - 维度差异高亮
 *   - 对比表格
 */
import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import * as echarts from "echarts";

interface FingerprintData {
  title: string;
  sceneCount: number;
  charCount: number;
  conflictRange: number;
  sentimentVolatility: number;
  peakPosition: number;
  conflictTrend: number;
  structureType?: string;
  rhythmType?: string;
  avgCharsPerScene?: number;
}

interface CrossPlayComparisonProps {
  /** 所有可选的剧本列表 */
  allPlays: { key: string; title: string; sceneCount: number }[];
  /** 获取指定剧本的指纹数据 */
  getFingerprint: (key: string) => FingerprintData | null;
  /** 当前选中的剧本 key (可能高亮) */
  currentKey?: string;
}

const COMPARE_DIMS = [
  { key: "conflictRange", label: "冲突强度" },
  { key: "sentimentVolatility", label: "情绪波动" },
  { key: "avgCharsPerScene", label: "角色密度" },
  { key: "peakPosition", label: "高潮位置" },
  { key: "sceneCount", label: "场景规模" },
];

const COMPARE_MAX: Record<string, number> = {
  conflictRange: 1,
  sentimentVolatility: 1,
  avgCharsPerScene: 8,
  peakPosition: 1,
  sceneCount: 30,
};

const CHART_COLORS = [
  "#c44d4d", "#5e6b76", "#7f968d", "#b89b6d", "#c4a56e",
];

const CrossPlayComparison: React.FC<CrossPlayComparisonProps> = ({
  allPlays,
  getFingerprint,
  currentKey,
}) => {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const radarRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const togglePlay = useCallback(
    (key: string) => {
      setSelectedKeys((prev) => {
        if (prev.includes(key)) {
          return prev.filter((k) => k !== key);
        }
        if (prev.length >= 5) return prev;
        return [...prev, key];
      });
    },
    []
  );

  // 点击外部关闭下拉
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dropdownRef.current?.contains(target)) return;
      setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  // 添加当前剧本
  useEffect(() => {
    if (currentKey && selectedKeys.length === 0) {
      setSelectedKeys([currentKey]);
    }
  }, [currentKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 雷达图
  useEffect(() => {
    if (!radarRef.current || selectedKeys.length === 0) return;
    let chart: echarts.ECharts | null = null;
    try {
      const existing = echarts.getInstanceByDom(radarRef.current);
      if (existing) existing.dispose();
      chart = echarts.init(radarRef.current);

      const fps = selectedKeys
        .map((k) => getFingerprint(k))
        .filter((fp): fp is FingerprintData => fp !== null);

      if (fps.length === 0) return;

      const indicator = COMPARE_DIMS.map((d) => ({
        name: d.label,
        max: COMPARE_MAX[d.key],
      }));

      const seriesData = fps.map((fp, i) => {
        const values = COMPARE_DIMS.map((d) => {
          const raw = (fp as any)[d.key] ?? 0;
          const max = COMPARE_MAX[d.key];
          return +Math.min(100, (raw / max) * 100).toFixed(1);
        });
        return {
          name: fp.title,
          value: values,
          lineStyle: { color: CHART_COLORS[i % CHART_COLORS.length], width: 2 },
          areaStyle: {
            color: CHART_COLORS[i % CHART_COLORS.length],
            opacity: 0.1,
          },
          itemStyle: { color: CHART_COLORS[i % CHART_COLORS.length] },
          symbol: "circle",
          symbolSize: 5,
        };
      });

      chart.setOption({
        tooltip: {
          trigger: "item",
          backgroundColor: "rgba(255,255,255,0.94)",
          borderColor: "rgba(150,84,77,0.2)",
          borderWidth: 1,
          borderRadius: 10,
          padding: [8, 12],
          textStyle: { fontSize: 12, color: "#5E4B3A" },
          formatter: (params: any) => {
            if (!params.seriesName) return "";
            const fp = fps[seriesData.findIndex((s) => s.name === params.seriesName)];
            if (!fp) return "";
            const dimIndex = params.dataIndex;
            const dim = COMPARE_DIMS[dimIndex];
            const rawVal = (fp as any)[dim.key] ?? 0;
            return `<b>${fp.title}</b><br/>${dim.label}: ${
              dim.key === "sceneCount" || dim.key === "avgCharsPerScene"
                ? rawVal.toFixed(1)
                : (rawVal * 100).toFixed(0) + "%"
            }`;
          },
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
          center: ["50%", "45%"],
          radius: "55%",
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
      console.error("CrossPlayComparison radar init failed:", err);
    }
    const h = () => chart?.resize();
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("resize", h);
      chart?.dispose();
    };
  }, [selectedKeys, getFingerprint]);

  // 对比表格数据
  const compareTable = useMemo(() => {
    return selectedKeys
      .map((k) => getFingerprint(k))
      .filter((fp): fp is FingerprintData => fp !== null);
  }, [selectedKeys, getFingerprint]);

  return (
    <div className="t4-compare-panel">
      <div className="t4-section-intro">
        <strong>跨剧本对比</strong>
        <p>选择 2-5 部剧本进行多维度对比分析，包含冲突强度、情绪波动、角色密度、高潮位置和场景规模。</p>
      </div>

      {/* 下拉选择区 */}
      <div className="t4-compare-selector" ref={dropdownRef}>
        <button
          className="t4-compare-selector-btn"
          onClick={() => setDropdownOpen(!dropdownOpen)}
        >
          <span>{selectedKeys.length > 0 ? `已选 ${selectedKeys.length} 部` : "选择剧本对比"}</span>
          <span>{dropdownOpen ? "▲" : "▼"}</span>
        </button>
        {dropdownOpen && (
          <div className="t4-compare-dropdown">
            <div className="t4-compare-dropdown-list">
              {allPlays.map((play) => {
                const isSelected = selectedKeys.includes(play.key);
                const isDisabled = !isSelected && selectedKeys.length >= 5;
                return (
                  <button
                    key={play.key}
                    className={`t4-compare-dropdown-item ${
                      isSelected ? "active" : ""
                    }`}
                    disabled={isDisabled}
                    onClick={() => togglePlay(play.key)}
                  >
                    <span className="t4-compare-checkbox">
                      {isSelected ? "✓" : ""}
                    </span>
                    <span className="t4-compare-dropdown-label">
                      {play.title}
                    </span>
                    <span className="t4-compare-dropdown-meta">
                      {play.sceneCount}场
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 已选标签 */}
      {selectedKeys.length > 0 && (
        <div className="t4-compare-tags">
          {selectedKeys.map((key, i) => {
            const fp = getFingerprint(key);
            return (
              <div
                key={key}
                className="t4-compare-tag"
                style={{
                  borderColor: CHART_COLORS[i % CHART_COLORS.length],
                }}
              >
                <span
                  className="t4-compare-tag-dot"
                  style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                />
                <span className="t4-compare-tag-name">
                  {fp?.title || key}
                </span>
                <button
                  className="t4-compare-tag-remove"
                  onClick={() => togglePlay(key)}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 雷达图 */}
      {selectedKeys.length >= 2 && (
        <div className="t4-compare-chart-block">
          <div className="t4-mini-title">多维对比雷达图</div>
          <div ref={radarRef} className="t4-compare-radar-canvas" />
        </div>
      )}

      {selectedKeys.length === 1 && (
        <div className="t4-compare-hint">
          请再选择至少 1 部剧本以进行对比
        </div>
      )}

      {/* 对比表格 */}
      {compareTable.length >= 2 && (
        <div className="t4-compare-table-block">
          <div className="t4-mini-title">数值对比</div>
          <div className="t4-compare-table-wrap">
            <table className="t4-compare-table">
              <thead>
                <tr>
                  <th>维度</th>
                  {compareTable.map((fp, i) => (
                    <th key={i} style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}>
                      {fp.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>场景数</td>
                  {compareTable.map((fp, i) => (
                    <td key={i}>{fp.sceneCount}场</td>
                  ))}
                </tr>
                <tr>
                  <td>角色数</td>
                  {compareTable.map((fp, i) => (
                    <td key={i}>{fp.charCount}人</td>
                  ))}
                </tr>
                <tr>
                  <td>冲突强度</td>
                  {compareTable.map((fp, i) => (
                    <td key={i}>{(fp.conflictRange * 100).toFixed(0)}%</td>
                  ))}
                </tr>
                <tr>
                  <td>情绪波动</td>
                  {compareTable.map((fp, i) => (
                    <td key={i}>{(fp.sentimentVolatility * 100).toFixed(0)}%</td>
                  ))}
                </tr>
                <tr>
                  <td>高潮位置</td>
                  {compareTable.map((fp, i) => (
                    <td key={i}>{(fp.peakPosition * 100).toFixed(0)}%</td>
                  ))}
                </tr>
                <tr>
                  <td>叙事模式</td>
                  {compareTable.map((fp, i) => (
                    <td key={i}>{fp.structureType || "—"}</td>
                  ))}
                </tr>
                <tr>
                  <td>节奏类型</td>
                  {compareTable.map((fp, i) => (
                    <td key={i}>{fp.rhythmType || "—"}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default CrossPlayComparison;
