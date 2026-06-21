import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { ROLE_DETAILS, CATEGORY_META } from "../../data/role-details";
import "./RoleTreeModal.scss";

const ROLE_TREE = {
  name: "行当体系",
  itemStyle: { color: "#e8ddce" },
  children: [
    {
      name: "生", value: 3274,
      itemStyle: { color: "#b8926a" },
      children: [
        { name: "老生", value: 1439, itemStyle: { color: "#d4bea6" }, desc: "中老年男性，重唱工", traits: ["忠义", "稳重", "儒雅"] },
        { name: "小生", value: 805, itemStyle: { color: "#dcc8b1" }, desc: "青年男性，真假声", traits: ["文雅", "清秀", "儒生气"] },
        { name: "武生", value: 353, itemStyle: { color: "#cdb59c" }, desc: "武艺男性，重做工", traits: ["英勇", "刚毅", "武艺高强"] },
        { name: "末·外·生", value: 677, itemStyle: { color: "#e0d2be" }, desc: "传统生行扩展类别", traits: ["宽厚", "持重"] },
      ],
    },
    {
      name: "旦", value: 1507,
      itemStyle: { color: "#96544d" },
      children: [
        { name: "青衣·正旦", value: 945, itemStyle: { color: "#c09894" }, desc: "端庄正派女性", traits: ["贞烈", "端庄", "贤淑"] },
        { name: "老旦", value: 280, itemStyle: { color: "#c9a49f" }, desc: "老年女性角色", traits: ["慈祥", "稳重", "沧桑"] },
        { name: "花旦·花衫", value: 212, itemStyle: { color: "#d3b8b3" }, desc: "活泼少女/青年女性", traits: ["活泼", "娇俏", "直率"] },
        { name: "武旦", value: 70, itemStyle: { color: "#b88b86" }, desc: "武艺女性角色", traits: ["英武", "飒爽", "矫健"] },
      ],
    },
    {
      name: "净", value: 1755,
      itemStyle: { color: "#5e6b76" },
      children: [
        { name: "净", value: 1755, itemStyle: { color: "#9ea6ad" }, desc: "性格刚烈/豪放男性", traits: ["豪放", "刚毅", "粗犷"] },
      ],
    },
    {
      name: "丑", value: 1339,
      itemStyle: { color: "#7f968d" },
      children: [
        { name: "文丑", value: 1282, itemStyle: { color: "#a7b8b3" }, desc: "滑稽/机敏角色", traits: ["滑稽", "机敏", "诙谐"] },
        { name: "武丑", value: 57, itemStyle: { color: "#8ca39e" }, desc: "武艺丑角", traits: ["敏捷", "灵活", "滑稽"] },
      ],
    },
  ],
};

interface RoleTreeModalProps {
  opened: boolean;
  onClose: () => void;
}

function RoleTreeModal({ opened, onClose }: RoleTreeModalProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!opened || !chartRef.current) return;

    const timer = setTimeout(() => {
      if (!chartRef.current) return;
      if (chartInstance.current) chartInstance.current.dispose();

      const chart = echarts.init(chartRef.current);
      chartInstance.current = chart;

      const categories = ROLE_TREE.children as any[];

      const innerData = categories.map((c: any) => ({
        name: c.name,
        value: c.value,
        itemStyle: {
          color: c.itemStyle.color,
          borderColor: "#fff",
          borderWidth: 3.5,
        },
      }));

      const outerData: any[] = [];
      for (const cat of categories) {
        const subs: any[] = cat.children || [];
        for (const sub of subs) {
          outerData.push({
            name: sub.name,
            value: sub.value,
            itemStyle: {
              color: sub.itemStyle.color,
              borderColor: "#fff",
              borderWidth: 3,
              borderRadius: 12,
              shadowBlur: 6,
              shadowColor: "rgba(0,0,0,0.12)",
            },
            _desc: sub.desc,
            _traits: sub.traits,
            _parent: cat.name,
          });
        }
      }

      chart.setOption({
        tooltip: {
          trigger: "item",
          backgroundColor: "rgba(255,253,249,0.96)",
          borderColor: "rgba(184,149,111,0.5)",
          borderWidth: 1,
          padding: [10, 14],
          textStyle: {
            fontSize: 13,
            color: "#3a2c21",
            fontFamily: "Noto Sans SC, sans-serif",
          },
          formatter: (p: any) => {
            const d = p.data;
            if (d._parent) {
              const traits = d._traits ? `<br/>特征: ${d._traits.join(" · ")}` : "";
              const desc = d._desc ? `<br/>${d._desc}` : "";
              return `<strong>${d.name}</strong> (${d.value}人次) · ${d._parent}行${desc}${traits}`;
            }
            return `<strong>${d.name}</strong><br/>角色人次: ${d.value.toLocaleString()}`;
          },
        },
        series: [
          {
            type: "pie",
            data: innerData,
            radius: ["22%", "50%"],
            center: ["50%", "50%"],
            startAngle: 90,
            label: {
              show: true,
              position: "inside",
              fontSize: 16,
              fontWeight: 700,
              color: "#1c1c1c",
              fontFamily: "PT Serif, Noto Serif SC, serif",
            },
            emphasis: {
              scaleSize: 8,
              label: { fontSize: 18, fontFamily: "PT Serif, Noto Serif SC, serif" },
            },
            z: 2,
          },
          {
            type: "pie",
            data: outerData,
            radius: ["56%", "90%"],
            center: ["50%", "50%"],
            startAngle: 90,
            padAngle: 0.8,
            label: {
              show: true,
              position: "inside",
              fontSize: 12,
              fontWeight: 600,
              color: "#000000",
              fontFamily: "宋体, SimSun, serif",
              formatter: (p: any) => p.data.value > 200 ? p.data.name : "",
            },
            emphasis: {
              scaleSize: 6,
              label: { fontSize: 14, fontFamily: "Noto Sans SC, sans-serif" },
              itemStyle: {
                shadowBlur: 12,
                shadowColor: "rgba(0,0,0,0.2)",
              },
            },
            z: 1,
          },
        ],
      });
    }, 200);

    return () => {
      clearTimeout(timer);
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, [opened]);

  // Group role details by category
  const groupedRoles = ROLE_DETAILS.reduce((acc, role) => {
    if (!acc[role.category]) acc[role.category] = [];
    acc[role.category].push(role);
    return acc;
  }, {} as Record<string, typeof ROLE_DETAILS>);

  if (!opened) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="rtm-backdrop" onClick={onClose} />

      {/* Drawer panel */}
      <aside className="rtm-drawer">
        {/* Header */}
        <div className="rtm-header">
          <div className="rtm-header-left">
            <span className="rtm-header-icon">🌳</span>
            <h2>行当体系结构</h2>
            <span className="rtm-header-badge">生·旦·净·丑</span>
          </div>
          <button className="rtm-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className="rtm-body">
          {/* Summary stats */}
          <div className="rtm-stats">
            {ROLE_TREE.children.map((cat: any) => (
              <div key={cat.name} className="rtm-stat-item" style={{ borderLeftColor: cat.itemStyle.color }}>
                <span className="rtm-stat-value">{cat.value.toLocaleString()}</span>
                <span className="rtm-stat-label">{cat.name}</span>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="rtm-chart-area">
            <h3 className="rtm-section-title">行当层级分布</h3>
            <div ref={chartRef} className="rtm-chart" />
          </div>

          {/* Detailed breakdown by category */}
          <div className="rtm-details">
            <h3 className="rtm-section-title">行当细分详解</h3>

            {Object.entries(groupedRoles).map(([category, roles]) => {
              const meta = CATEGORY_META[category];
              return (
                <div key={category} className="rtm-category-group">
                  <div className="rtm-category-header" style={{ background: meta.bg, borderLeftColor: meta.color }}>
                    <span className="rtm-category-dot" style={{ background: meta.color }} />
                    <span className="rtm-category-name">{category}</span>
                    <span className="rtm-category-desc">{meta.desc}</span>
                  </div>
                  <div className="rtm-category-cards">
                    {roles.map((role) => (
                      <div key={role.name} className="rtm-detail-card">
                        <div className="rtm-detail-top">
                          <span className="rtm-detail-dot" style={{ background: role.color }} />
                          <span className="rtm-detail-name">{role.name}</span>
                        </div>
                        <p className="rtm-detail-desc">{role.desc}</p>
                        <div className="rtm-detail-traits">
                          {role.traits.map((t) => (
                            <span key={t} className="rtm-trait-tag">{t}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </>
  );
}

export default RoleTreeModal;
