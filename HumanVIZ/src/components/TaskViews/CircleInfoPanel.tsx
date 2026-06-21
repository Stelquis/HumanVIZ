import React, { useMemo } from "react";
import { ROLE_COLORS, DEFAULT_ROLE_COLOR } from "../../types/task2";

/* ================================================================
   CircleInfoPanel — 圆形关系图角色详情面板

   展示 ego-network 中心角色的详细信息：
   行当、度中心性、出场次数、最近关联角色
   ================================================================ */

interface CircleInfoPanelProps {
  network: {
    nodes?: Array<{ name: string; degree?: number; scene_count?: number }>;
    edges?: Array<{ source: string; target: string; weight?: number }>;
  };
  centerChar: string;
  charRole: Record<string, string>;
}

const CircleInfoPanel: React.FC<CircleInfoPanelProps> = ({
  network,
  centerChar,
  charRole,
}) => {
  const node = useMemo(() => {
    return network.nodes?.find((n) => n.name === centerChar) || null;
  }, [network, centerChar]);

  const connections = useMemo(() => {
    const connMap: { name: string; weight: number }[] = [];
    if (!network.edges) return connMap;
    network.edges.forEach((e) => {
      if (e.source === centerChar) {
        connMap.push({ name: e.target, weight: e.weight || 1 });
      } else if (e.target === centerChar) {
        connMap.push({ name: e.source, weight: e.weight || 1 });
      }
    });
    return connMap.sort((a, b) => b.weight - a.weight).slice(0, 5);
  }, [network, centerChar]);

  if (!node) return null;

  const role = charRole[node.name] || "其他";
  const roleColor = ROLE_COLORS[role as keyof typeof ROLE_COLORS] || DEFAULT_ROLE_COLOR;

  return (
    <div className="t2-circle-info-panel">
      {/* Compact header row */}
      <div className="t2-cip-header-row">
        <span
          className="t2-cip-avatar"
          style={{ backgroundColor: roleColor }}
        >
          {node.name.charAt(0)}
        </span>
        <div className="t2-cip-header-info">
          <span className="t2-cip-name">{node.name}</span>
          <span className="t2-cip-role">{role}</span>
        </div>
        <div className="t2-cip-header-stats">
          <span>度{node.degree || 0}</span>
          <span>·</span>
          <span>共{node.scene_count || 0}场</span>
        </div>
      </div>

      {/* Horizontal connection chips */}
      <div className="t2-cip-connections-h">
        {connections.length === 0 && (
          <span className="t2-cip-empty">无关联角色</span>
        )}
        {connections.map((conn, i) => {
          const connRole = charRole[conn.name] || "其他";
          const connColor =
            ROLE_COLORS[connRole as keyof typeof ROLE_COLORS] || DEFAULT_ROLE_COLOR;
          return (
            <span
              key={i}
              className="t2-cip-conn-chip"
              style={{ borderColor: connColor }}
            >
              <span
                className="t2-cip-conn-chip-dot"
                style={{ backgroundColor: connColor }}
              />
              {conn.name}
              <span className="t2-cip-conn-chip-w">({conn.weight})</span>
            </span>
          );
        })}
      </div>
    </div>
  );
};

export default CircleInfoPanel;
