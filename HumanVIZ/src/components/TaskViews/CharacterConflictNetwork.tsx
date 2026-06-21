import React, { useRef, useEffect, useMemo } from "react";
import * as echarts from "echarts";
import type { RibbonAnalysisResult } from "../../utils/storyRibbonCore";

/* ================================================================
   Character Conflict Network — ECharts force-directed graph
   Nodes = characters (sized by scene count)
   Edges = co-occurrence in same scene (weighted by frequency)
   Color-coded by narrative role
   ================================================================ */

interface Props {
  analysis: RibbonAnalysisResult | null;
}

const CharacterConflictNetwork: React.FC<Props> = ({ analysis }) => {
  const ref = useRef<HTMLDivElement>(null);

  const { nodes, links } = useMemo(() => {
    if (!analysis || !analysis.sortedCharacters) {
      return { nodes: [], links: [] };
    }

    const chars = analysis.sortedCharacters.slice(0, 12);
    const charNames = new Set(chars.map(c => c.character));

    // Build co-occurrence map from characterScenes
    const charSceneMap = new Map<string, Set<number>>();
    for (const cs of analysis.characterScenes as any[]) {
      if (!charNames.has(cs.character)) continue;
      charSceneMap.set(cs.character, new Set(cs.scenes || []));
    }

    // Nodes
    const maxScenes = Math.max(1, ...Array.from(charSceneMap.values()).map(s => s.size));
    const nodes = chars.map(c => {
      const sceneCount = charSceneMap.get(c.character)?.size || 0;
      const size = Math.max(10, Math.min(30, (sceneCount / maxScenes) * 25 + 5));
      return {
        name: c.character,
        symbolSize: size,
        itemStyle: { color: c.color || "#B89B6D" },
        category: c.group || "角色",
      };
    });

    // Edges: co-occurrence
    const edgeMap = new Map<string, number>();
    const charList = chars.map(c => c.character);
    for (let i = 0; i < charList.length; i++) {
      for (let j = i + 1; j < charList.length; j++) {
        const scenesI = charSceneMap.get(charList[i]);
        const scenesJ = charSceneMap.get(charList[j]);
        if (!scenesI || !scenesJ) continue;
        let count = 0;
        for (const s of scenesI) {
          if (scenesJ.has(s)) count++;
        }
        if (count > 0) {
          edgeMap.set(`${i}-${j}`, count);
        }
      }
    }

    const maxCooccur = Math.max(1, ...Array.from(edgeMap.values()));
    const links = Array.from(edgeMap.entries()).map(([key, count]) => {
      const [i, j] = key.split("-").map(Number);
      return {
        source: charList[i],
        target: charList[j],
        value: count,
        lineStyle: {
          width: Math.max(0.5, Math.min(4, (count / maxCooccur) * 3)),
          color: "rgba(184, 155, 109, 0.4)",
          curveness: 0.1,
        },
      };
    });

    return { nodes, links };
  }, [analysis]);

  useEffect(() => {
    if (!ref.current || nodes.length === 0) return;

    let chart: echarts.ECharts | null = null;
    try {
      const existing = echarts.getInstanceByDom(ref.current);
      if (existing) existing.dispose();
      chart = echarts.init(ref.current);

      chart.setOption({
        tooltip: {
          backgroundColor: "rgba(255,255,255,0.94)",
          borderColor: "rgba(150,84,77,0.2)",
          borderWidth: 1,
          borderRadius: 10,
          padding: [8, 12],
          textStyle: { fontSize: 12, color: "#5E4B3A" },
          formatter: (p: any) => {
            if (p.dataType === "node") {
              return `<b>${p.name}</b><br/>出场场景：${Math.round(p.value || 0)} 场`;
            }
            return `${p.data.source} ↔ ${p.data.target}<br/>共现场景：${p.data.value} 场`;
          },
        },
        series: [
          {
            type: "graph",
            layout: "force",
            force: {
              repulsion: 150,
              edgeLength: [40, 120],
              gravity: 0.1,
            },
            roam: true,
            draggable: true,
            data: nodes.map(n => ({
              ...n,
              value: Math.round((n.symbolSize as number - 5) * 2),
            })),
            links,
            emphasis: {
              focus: "adjacency",
              lineStyle: { width: 3 },
            },
            label: {
              show: true,
              fontSize: 9,
              fontWeight: 500,
              color: "#5E4B3A",
              position: "bottom",
              distance: 8,
            },
            lineStyle: {
              color: "rgba(184, 155, 109, 0.25)",
              curveness: 0.1,
            },
          },
        ],
      });
    } catch (err) {
      console.error("CharacterConflictNetwork init failed:", err);
    }

    const h = () => chart?.resize();
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("resize", h);
      chart?.dispose();
    };
  }, [nodes, links]);

  if (nodes.length === 0) {
    return (
      <div className="t4-aux-empty">
        <span>🔗</span>
        <p>无角色数据</p>
      </div>
    );
  }

  return (
    <div className="t4-aux-chart-wrap">
      <div className="t4-aux-chart-header">
        <span className="t4-section-icon">🔗</span>
        <h3>角色驱动网络</h3>
      </div>
      <div ref={ref} className="t4-aux-chart-canvas" />
    </div>
  );
};

export default CharacterConflictNetwork;
