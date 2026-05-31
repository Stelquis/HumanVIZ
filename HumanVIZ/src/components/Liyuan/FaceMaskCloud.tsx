import React, { useMemo } from "react";
import { KEYWORD_DATA, KEYWORD_CATEGORY_COLORS } from "../../utils/liyuanData";

// ── 生成脸谱形状内的密集坐标 ──
// 脸谱轮廓：宽额 → 眼窝留白 → 高颧骨 → 窄下颌 → 尖下巴
function generateMaskPositions(count: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];

  // 脸谱边界判断：点是否在脸谱轮廓内（含眼窝/嘴部镂空）
  const insideMask = (x: number, y: number): boolean => {
    // 整体椭圆脸型：中心 (50, 46)，rx≈38, ry≈43
    const cx = 50, cy = 46, rx = 39, ry = 44;
    const e = ((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2);
    if (e > 1.05) return false; // 脸外

    // 左眼窝镂空：椭圆中心 (30, 28)，rx≈7, ry≈5
    const le = ((x - 30) ** 2) / 49 + ((y - 28) ** 2) / 25;
    if (le < 0.95) return false;

    // 右眼窝镂空：椭圆中心 (70, 28)，rx≈7, ry≈5
    const re = ((x - 70) ** 2) / 49 + ((y - 28) ** 2) / 25;
    if (re < 0.95) return false;

    // 嘴部镂空：椭圆中心 (50, 63)，rx≈11, ry≈5.5
    const me = ((x - 50) ** 2) / 121 + ((y - 63) ** 2) / 30;
    if (me < 0.9) return false;

    return true;
  };

  // 分层密度填充
  const layers = [
    // 核心区（鼻梁+眉心+颧骨内侧）——最密
    { xRange: [42, 58], yRange: [18, 52], pct: 0.20 },
    // 颧骨主体（宽大面颊）
    { xRange: [12, 42], yRange: [28, 56], pct: 0.22 },
    { xRange: [58, 88], yRange: [28, 56], pct: 0.22 },
    // 额头
    { xRange: [18, 82], yRange: [2, 22], pct: 0.18 },
    // 下颌+下巴
    { xRange: [26, 74], yRange: [58, 92], pct: 0.18 },
  ];

  const totalPct = layers.reduce((s, l) => s + l.pct, 0);

  for (const layer of layers) {
    const layerCount = Math.round(count * (layer.pct / totalPct));
    let added = 0;
    const maxAttempts = layerCount * 8;
    let attempts = 0;

    while (added < layerCount && attempts < maxAttempts) {
      const x = layer.xRange[0] + Math.random() * (layer.xRange[1] - layer.xRange[0]);
      const y = layer.yRange[0] + Math.random() * (layer.yRange[1] - layer.yRange[0]);

      if (insideMask(x, y)) {
        // 检查与已有点的最小间距
        const minDist = 2.5;
        const tooClose = points.some(
          (p) => Math.hypot(p.x - x, p.y - y) < minDist
        );
        if (!tooClose) {
          points.push({ x, y });
          added++;
        }
      }
      attempts++;
    }
  }

  return points;
}

const FaceMaskCloud: React.FC = () => {
  const positionedWords = useMemo(() => {
    const sorted = [...KEYWORD_DATA].sort((a, b) => b.value - a.value);
    const positions = generateMaskPositions(sorted.length);

    const minV = 5;
    const maxV = 90;
    const minSize = 7;
    const maxSize = 19;

    // 将词按频率分配到位置（高频词优先放核心区）
    return sorted.slice(0, positions.length).map((kw, i) => {
      const t = (kw.value - minV) / (maxV - minV);
      const fontSize = minSize + t * (maxSize - minSize);
      const pos = positions[i] || { x: 50, y: 50 };

      // 鼻梁/眉心区用较深色，外围用较浅色
      const distFromCenter = Math.hypot(pos.x - 50, pos.y - 46) / 50;
      const opacity = 0.62 + (kw.value / 160) - distFromCenter * 0.1;

      return {
        ...kw,
        fontSize,
        color: KEYWORD_CATEGORY_COLORS[kw.category] || "#8b7355",
        x: pos.x,
        y: pos.y,
        opacity: Math.max(0.45, Math.min(0.95, opacity)),
      };
    });
  }, []);

  return (
    <div className="facemask-wrapper">
      {/* 脸谱底纹 SVG */}
      <svg className="facemask-bg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="faceGrad" cx="50%" cy="45%">
            <stop offset="0%" stopColor="rgba(184,155,109,0.18)" />
            <stop offset="100%" stopColor="rgba(184,155,109,0.04)" />
          </radialGradient>
        </defs>

        {/* 面部轮廓 */}
        <path
          d="M35,3 C44,-1 56,-1 65,3 C79,6 84,16 87,28
             C91,38 90,48 88,54 C84,58 78,61 70,69
             C62,77 56,83 50,93 C44,83 38,77 30,69
             C22,61 16,58 12,54 C10,48 9,38 13,28
             C16,16 21,6 35,3 Z"
          fill="url(#faceGrad)"
          stroke="rgba(184,155,109,0.32)"
          strokeWidth="0.7"
        />

        {/* 左眉 */}
        <path
          d="M20,21 Q28,18 40,22"
          fill="none" stroke="rgba(150,84,77,0.18)" strokeWidth="1.2" strokeLinecap="round"
        />
        {/* 右眉 */}
        <path
          d="M60,22 Q72,18 80,21"
          fill="none" stroke="rgba(150,84,77,0.18)" strokeWidth="1.2" strokeLinecap="round"
        />

        {/* 左眼窝 */}
        <ellipse cx="30" cy="29" rx="7.5" ry="5"
          fill="rgba(94,107,118,0.08)" stroke="rgba(184,155,109,0.28)" strokeWidth="0.5"
        />
        {/* 右眼窝 */}
        <ellipse cx="70" cy="29" rx="7.5" ry="5"
          fill="rgba(94,107,118,0.08)" stroke="rgba(184,155,109,0.28)" strokeWidth="0.5"
        />

        {/* 鼻梁 */}
        <line x1="50" y1="24" x2="50" y2="55"
          stroke="rgba(184,155,109,0.22)" strokeWidth="0.8"
        />
        {/* 鼻翼 */}
        <path d="M44,52 Q47,57 50,55" fill="none" stroke="rgba(184,155,109,0.16)" strokeWidth="0.6" />
        <path d="M56,52 Q53,57 50,55" fill="none" stroke="rgba(184,155,109,0.16)" strokeWidth="0.6" />

        {/* 嘴部 */}
        <ellipse cx="50" cy="63" rx="12" ry="5.5"
          fill="rgba(150,84,77,0.06)" stroke="rgba(184,155,109,0.25)" strokeWidth="0.5"
        />

        {/* 法令纹 */}
        <path d="M42,50 Q46,56 43,62" fill="none" stroke="rgba(184,155,109,0.13)" strokeWidth="0.6" />
        <path d="M58,50 Q54,56 57,62" fill="none" stroke="rgba(184,155,109,0.13)" strokeWidth="0.6" />
      </svg>

      {/* 关键词定位层 */}
      <div className="facemask-words">
        {positionedWords.map((kw, i) => (
          <span
            key={`${kw.text}-${i}`}
            className="facemask-word"
            style={{
              left: `${kw.x}%`,
              top: `${kw.y}%`,
              fontSize: `${kw.fontSize}px`,
              color: kw.color,
              fontWeight: kw.value > 30 ? 700 : kw.value > 15 ? 500 : 400,
              opacity: kw.opacity,
            }}
            title={`${kw.text}: 约${kw.value}部相关剧本`}
          >
            {kw.text}
          </span>
        ))}
      </div>

      {/* 底部类别图例 */}
      <div className="facemask-legend">
        {["人物", "主题", "题材", "典故", "地点"].map((cat) => (
          <span key={cat} className="facemask-legend-item">
            <span className="facemask-legend-dot" style={{ background: KEYWORD_CATEGORY_COLORS[cat] }} />
            {cat}
          </span>
        ))}
      </div>
    </div>
  );
};

export default FaceMaskCloud;
