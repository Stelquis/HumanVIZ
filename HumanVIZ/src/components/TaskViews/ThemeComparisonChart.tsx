// ============================================================
// ThemeComparisonChart — 主题对比图（单剧本环形放射 / 对比旭日图）
// 修复版 v2：
//   - 单剧本：标签水平排列不遮挡，突出最大主题节点
//   - 对比模式：旭日图文字不跨扇区，交互 tooltip 显示完整数据，突出最大差异主题
// ============================================================

import React, { useEffect, useRef } from "react";
import * as echarts from "echarts";

const THEME_COLORS: Record<string, string> = {
  "忠义报国": "#b8926a", "征战讨伐": "#8b5e3c", "冤案昭雪": "#6b7b8e",
  "权谋斗争": "#5e3a2e", "爱情姻缘": "#c77d8b", "家庭伦理": "#96544d",
  "神话灵异": "#7f968d", "侠义江湖": "#5e6b76", "智谋韬略": "#c4a56e",
  "科举功名": "#d4c4a8", "宫廷朝堂": "#8b7355", "生死离别": "#4a6b7a",
};
const THEME_ORDER = Object.keys(THEME_COLORS);

interface Props {
  playData1: any;
  playData2?: any;
  mode: "single" | "compare";
  height?: string | number;
}

const ThemeComparisonChart: React.FC<Props> = ({
  playData1,
  playData2,
  mode,
  height = "100%",
}) => {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current || (!playData1 && !playData2)) return;
    const existing = echarts.getInstanceByDom(chartRef.current);
    if (existing) existing.dispose();
    const chart = echarts.init(chartRef.current);

    // 构建主题节点数据（按值降序排列）
    const buildThemeNodes = (data: any) => {
      if (!data || !data.themes) return [];
      return THEME_ORDER
        .map((t) => {
          const val = (data.themes[t] || 0) * 100;
          return {
            name: t,
            value: parseFloat(val.toFixed(1)),
            itemStyle: { color: THEME_COLORS[t] || "#8b7355" },
          };
        })
        .filter((d) => d.value > 0)
        .sort((a, b) => b.value - a.value); // 降序：大值在前
    };

    let option: any = {};

    // ── 单剧本模式：环形放射树 ──
    //   - 标签全部水平方向（统一 position: right），不随角度翻转
    //   - 最大主题节点放大 + 金色描边高亮
    //   - 缩小环形半径，让节点 + 标签适配容器高度
    if (mode === "single" && playData1) {
      const nodes = buildThemeNodes(playData1);
      const maxVal = nodes.length > 0 ? nodes[0].value : 0;

      const centerNode = {
        name: playData1.title || "剧本",
        symbolSize: 36,
        itemStyle: {
          color: "#fffefb",
          borderColor: "#c4b08a",
          borderWidth: 3,
          shadowBlur: 8,
        },
        label: {
          show: true,
          position: "bottom",
          distance: 8,
          fontSize: 12,
          fontWeight: 700,
          color: "#4a3020",
          formatter: "{b}",
        },
      };

      const graphData = [
        centerNode,
        ...nodes.map((n) => {
          const isMax = n.value === maxVal && maxVal > 0;
          return {
            name: n.name,
            symbolSize: isMax ? 28 : 20,
            value: n.value,
            itemStyle: {
              color: n.itemStyle.color,
              borderColor: isMax ? "#B89B6D" : "#fffefb",
              borderWidth: isMax ? 3.5 : 2.5,
              shadowBlur: isMax ? 10 : 5,
              shadowColor: isMax ? "rgba(184,155,109,0.5)" : "rgba(0,0,0,0.08)",
            },
            label: {
              show: true,
              // 统一水平排列：所有标签都放 right，文字始终保持水平
              position: "right",
              distance: 10,
              fontSize: 11,
              fontWeight: isMax ? 800 : 600,
              color: isMax ? "#3a1a0a" : "#4a3020",
              formatter: isMax
                ? `{title|{b}} {star|★}\n{val|{c}%}`
                : `{title|{b}}\n{val|{c}%}`,
              rich: {
                title: {
                  fontSize: 11,
                  fontWeight: isMax ? 800 : 600,
                  color: isMax ? "#3a1a0a" : "#4a3020",
                  lineHeight: 18,
                  padding: [2, 0],
                },
                star: {
                  fontSize: 11,
                  color: "#B89B6D",
                  fontWeight: 700,
                  padding: [0, 0, 0, 2],
                },
                val: {
                  fontSize: 12,
                  color: "#5e3a2e",
                  fontWeight: 600,
                  padding: [0, 0, 2, 0],
                },
              },
            },
          };
        }),
      ];

      const links = nodes.map((n) => {
        const isMax = n.value === maxVal && maxVal > 0;
        return {
          source: playData1.title || "剧本",
          target: n.name,
          lineStyle: {
            color: THEME_COLORS[n.name] || "#c4b08a",
            width: isMax ? 4.5 : 3,
            curveness: 0.35,
            opacity: isMax ? 0.7 : 0.45,
          },
        };
      });

      option = {
        tooltip: {
          trigger: "item",
          backgroundColor: "#fffefb",
          borderColor: "#c4b08a",
          borderWidth: 1,
          padding: [10, 14],
          textStyle: { color: "#4a3020", fontSize: 12 },
          formatter: (params: any) => {
            if (
              params.dataType === "node" &&
              params.name !== (playData1.title || "剧本")
            ) {
              const isMax = params.value === maxVal && maxVal > 0;
              const star = isMax ? ' ⭐ 最大主题' : '';
              return `<b style="font-size:14px;color:${params.color};">${params.name}</b>${star}<br/>占比: <b>${params.value}%</b><br/><span style="color:#8b7355;font-size:10px;">所属剧本: ${playData1.title}</span>`;
            }
            return `<b>${params.name}</b>`;
          },
        },
        series: [
          {
            type: "graph",
            layout: "circular",
            // @ts-ignore
            circular: {
              rotateLabel: false,
              radius: "15%",
            },
            symbol: "circle",
            roam: false,
            draggable: false,
            data: graphData,
            links: links,
            label: { show: true },
            edgeSymbol: ["none", "none"],
            lineStyle: { color: "source", width: 3, opacity: 0.45, curveness: 0.35 },
            labelLayout: { hideOverlap: true },
            emphasis: {
              focus: "adjacency",
              lineStyle: { width: 5, opacity: 0.85 },
              itemStyle: {
                shadowBlur: 10,
                shadowColor: "rgba(0,0,0,0.25)",
              },
            },
            itemStyle: { borderColor: "#fffefb", borderWidth: 2 },
          },
        ],
        backgroundColor: "transparent",
      };
    }

    // ── 对比模式：旭日图 ──
    //   - 外圈文字使用 horizontal 旋转避免跨扇区
    //   - tooltip 始终显示主题名称 + 百分比 + 所属剧本
    //   - 突出最大差异主题（金色描边 + 光晕）
    else if (mode === "compare" && playData1 && playData2) {
      const themes1 = buildThemeNodes(playData1);
      const themes2 = buildThemeNodes(playData2);

      // 计算差异最大的主题并高亮（最多 3 个）
      const allThemeNames = [
        ...new Set([
          ...themes1.map((t) => t.name),
          ...themes2.map((t) => t.name),
        ]),
      ];
      const diffMap: { name: string; diff: number }[] = [];
      allThemeNames.forEach((name) => {
        const v1 = themes1.find((t) => t.name === name)?.value || 0;
        const v2 = themes2.find((t) => t.name === name)?.value || 0;
        diffMap.push({ name, diff: Math.abs(v1 - v2) });
      });
      diffMap.sort((a, b) => b.diff - a.diff);
      const topDiffNames = new Set(diffMap.slice(0, 3).map((d) => d.name));

      const highlightMaxDiffNode = (items: any[]) => {
        items.forEach((item: any) => {
          if (item.children) {
            highlightMaxDiffNode(item.children);
          } else if (topDiffNames.has(item.name)) {
            item.itemStyle = {
              ...(item.itemStyle || {}),
              borderColor: "#B89B6D",
              borderWidth: 2.5,
              shadowBlur: 8,
              shadowColor: "rgba(184,155,109,0.45)",
            };
            item.label = {
              ...(item.label || {}),
              fontWeight: 800,
            };
          }
        });
      };

      const sunburstData = [
        { name: playData1.title, children: themes1 },
        { name: playData2.title, children: themes2 },
      ];
      highlightMaxDiffNode(sunburstData);

      // 阈值：低于此值的扇区不显示内部文字，仅交互时在 tooltip 中查看
      const LABEL_THRESHOLD = 15;

      option = {
        tooltip: {
          trigger: "item",
          backgroundColor: "#fffefb",
          borderColor: "#c4b08a",
          borderWidth: 1,
          padding: [12, 16],
          textStyle: { color: "#4a3020", fontSize: 12 },
          formatter: (params: any) => {
            // 有 value 数据的节点（叶节点或有值的扇区）→ 显示完整信息
            // 不使用 treePath 长度判断，因为 drill-down 后树结构会变化
            const hasValue = params.value != null && params.value > 0;
            if (hasValue) {
              // 从 treePath 或 treePathInfo 中提取所属剧本名
              const treePath = params.treePath || params.treePathInfo || [];
              const playName = treePath.length >= 2
                ? (treePath[treePath.length - 2]?.name || '')
                : '';
              const isMaxDiff = topDiffNames.has(params.name);
              const diffBadge = isMaxDiff
                ? '<span style="display:inline-block;margin-left:6px;padding:1px 8px;border-radius:4px;background:#B89B6D20;color:#B89B6D;font-size:10px;font-weight:700;">最大差异</span>'
                : '';
              return `
                <div style="display:flex;flex-direction:column;gap:4px;min-width:160px;">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
                    <span style="font-weight:700;font-size:14px;color:#4a3020;">${params.name}${diffBadge}</span>
                    <span style="font-size:13px;padding:2px 12px;border-radius:4px;background:${params.color}25;color:#5e3a2e;font-weight:700;">${params.value.toFixed(1)}%</span>
                  </div>
                  <div style="height:1px;background:rgba(196,176,138,0.15);margin:2px 0 4px;"></div>
                  ${playName ? `<div style="font-size:12px;color:#8b7355;">📜 所属剧本: <b style="color:#5e3a2e;">${playName}</b></div>` : ''}
                  ${params.value <= LABEL_THRESHOLD ? '<div style="font-size:10px;color:#b89b6d;margin-top:2px;">📌 小占比主题（≤15%），扇区内隐藏文字，hover 查看详情</div>' : ''}
                </div>
              `;
            }
            // 父节点（剧本名）→ 显示简洁名称
            return `<b style="font-size:14px">${params.name}</b>`;
          },
        },
        series: [
          {
            type: "sunburst",
            data: sunburstData,
            radius: [0, "96%"],
            center: ["50%", "50%"],
            // @ts-ignore
            nodeClick: "rootToNode",
            sort: "desc",
            levels: [
              {
                r0: "0%",
                r: "4%",
                itemStyle: { color: "transparent", borderWidth: 0 },
              },
              {
                // 内圈：剧本标题层
                r0: "4%",
                r: "22%",
                label: {
                  rotate: "radial",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#4a3020",
                  textBorderColor: "#fff",
                  textBorderWidth: 2,
                  position: "inside",
                  overflow: "truncate",
                  ellipsis: "…",
                },
                itemStyle: {
                  borderColor: "#fff",
                  borderWidth: 2,
                  borderRadius: 4,
                },
              },
              {
                // 外圈：主题层 — 使用 horizontal 旋转避免文字跨扇区
                r0: "23%",
                r: "95%",
                label: {
                  rotate: "horizontal",
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#fff",
                  textBorderColor: "rgba(0,0,0,0.4)",
                  textBorderWidth: 1.5,
                  align: "center",
                  overflow: "truncate",
                  ellipsis: "…",
                  width: 55,
                  formatter: (params: any) => {
                    if (params.value > LABEL_THRESHOLD) {
                      return `${params.name}\n${params.value.toFixed(1)}%`;
                    }
                    return '';
                  },
                },
                itemStyle: {
                  borderColor: "#fff",
                  borderWidth: 1.5,
                  borderRadius: 2,
                },
              },
            ],
            labelLayout: {
              hideOverlap: true,
            },
            emphasis: {
              focus: "descendant",
              itemStyle: {
                shadowBlur: 12,
                shadowColor: "rgba(0,0,0,0.25)",
              },
              label: {
                fontWeight: 700,
                fontSize: 12,
              },
            },
          },
        ],
        backgroundColor: "transparent",
      };
    } else {
      option = {
        title: {
          text: "请选择剧本生成",
          left: "center",
          top: "center",
          textStyle: { color: "#999", fontSize: 12 },
        },
      };
    }

    chart.setOption(option);
    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, [playData1, playData2, mode]);

  return <div ref={chartRef} style={{ height: height, width: "100%" }} />;
};

export default ThemeComparisonChart;
