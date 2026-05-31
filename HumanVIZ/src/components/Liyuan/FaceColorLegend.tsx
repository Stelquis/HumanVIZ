import React from "react";

const FACE_COLORS = [
  { color: "#c0392b", label: "红色", meaning: "忠勇义烈", example: "关羽、姜维" },
  { color: "#2c3e50", label: "黑色", meaning: "刚正勇猛", example: "包拯、张飞" },
  { color: "#ecf0f1", label: "白色", meaning: "奸诈阴险", example: "曹操、严嵩" },
  { color: "#2980b9", label: "蓝色", meaning: "刚强骁勇", example: "窦尔敦" },
  { color: "#27ae60", label: "绿色", meaning: "暴躁勇猛", example: "程咬金" },
  { color: "#d4a017", label: "黄色", meaning: "凶狠残暴", example: "典韦" },
  { color: "#8e6b3e", label: "金银", meaning: "神仙鬼怪", example: "如来、悟空" },
];

const FaceColorLegend: React.FC = () => {
  return (
    <div className="facecolor-wrapper">
      <div className="facecolor-header">🎨 脸谱色彩</div>
      <div className="facecolor-list">
        {FACE_COLORS.map((fc) => (
          <div key={fc.label} className="facecolor-row">
            <span
              className="facecolor-swatch"
              style={{ background: fc.color }}
            />
            <span className="facecolor-label">{fc.label}</span>
            <span className="facecolor-meaning">{fc.meaning}</span>
            <span className="facecolor-example">{fc.example}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FaceColorLegend;
