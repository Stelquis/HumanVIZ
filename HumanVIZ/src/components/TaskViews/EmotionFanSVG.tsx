/**
 * EmotionTimeline — 角色情感轨迹 · 多轨时间线
 *
 * 以"乐谱"为隐喻：每个角色一行 = 一条情感音轨，
 * X轴 = 场景序列，颜色 = 情感极性，亮度 = 情感强度。
 * 支持"群览"（所有角色）和"独观"（单角色放大含场景摘要）两种模式。
 */
import React, { useMemo, useState } from "react";

/* ================================================================
   Types
   ================================================================ */
interface SceneData {
  sceneIndex: number;
  sceneLabel: string;
  sentiment: number;
  intensity: number;
  importance: number;
}
interface CharacterEmotion {
  name: string;
  roleType: string;
  narrativeFunction: string;
  scenes: SceneData[];
}
interface Props {
  characters: CharacterEmotion[];
  mode: "single" | "group";
  selectedChar: string | null;
  onSelectChar: (name: string) => void;
  playTitle?: string;
}

/* ================================================================
   Constants
   ================================================================ */
const ROLE_COLORS: Record<string, string> = { "生": "#b8926a", "旦": "#96544d", "净": "#5e6b76", "丑": "#7f968d" };

const SENTIMENT_GRADIENT = [
  { stop: -1.0, color: "#5e6b76" },  // 深灰蓝 — 极悲
  { stop: -0.5, color: "#7f968d" },  // 青灰 — 哀
  { stop: 0.0,  color: "#b89b6d" },  // 暖金 — 中性
  { stop: 0.5,  color: "#c77d8b" },  // 暖红 — 喜
  { stop: 1.0,  color: "#96544d" },  // 朱砂 — 极乐
];

function sentimentColor(s: number, intensity: number): string {
  const t = (s + 1) / 2;
  const alpha = (0.3 + intensity * 0.55).toFixed(2);
  if (t > 0.65) return `rgba(199,125,139,${alpha})`;
  if (t > 0.45) return `rgba(184,155,109,${alpha})`;
  if (t > 0.25) return `rgba(127,150,141,${alpha})`;
  return `rgba(94,107,118,${alpha})`;
}

/* ================================================================
   Component
   ================================================================ */
const EmotionFanSVG: React.FC<Props> = ({ characters, mode, selectedChar, onSelectChar, playTitle }) => {
  const [hovered, setHovered] = useState<{ char: string; scene: number; label: string; s: number } | null>(null);

  const displayChars = useMemo(() => {
    if (mode === "single" && selectedChar) return characters.filter(c => c.name === selectedChar);
    return characters.slice(0, 9);
  }, [characters, mode, selectedChar]);

  const maxScenes = useMemo(() => {
    let m = 0;
    characters.forEach(c => c.scenes.forEach(s => { if (s.sceneIndex > m) m = s.sceneIndex; }));
    return m + 1;
  }, [characters]);

  // Layout constants
  const LEFT_PANEL = 80;
  const RIGHT_PAD = 20;
  const TOP = 36;
  const ROW_H = mode === "single" ? 58 : 34;
  const SCENE_W = mode === "single" ? 70 : 52;
  const TOTAL_W = LEFT_PANEL + maxScenes * SCENE_W + RIGHT_PAD;
  const TOTAL_H = TOP + displayChars.length * ROW_H + 24;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "auto" }}>
      <svg viewBox={`0 0 ${TOTAL_W} ${TOTAL_H}`}
        style={{ minWidth: "100%", minHeight: "100%", display: "block" }}>
        {/* Background */}
        <rect width={TOTAL_W} height={TOTAL_H} fill="#faf8f5" rx={6} />

        {/* Title */}
        {playTitle && (
          <text x={12} y={22} fill="#4a3020" fontSize={14} fontWeight={700}
            fontFamily="'Noto Serif SC','PT Serif',serif">
            {playTitle}
          </text>
        )}

        {/* Scene axis labels */}
        {Array.from({ length: maxScenes }).map((_, si) => (
          <text key={`hdr-${si}`}
            x={LEFT_PANEL + si * SCENE_W + SCENE_W / 2} y={TOP - 10}
            textAnchor="middle" fill="#8b7355" fontSize={9} fontFamily="sans-serif">
            第{si + 1}场
          </text>
        ))}

        {/* Grid lines */}
        {Array.from({ length: maxScenes }).map((_, si) => (
          <line key={`grid-${si}`}
            x1={LEFT_PANEL + si * SCENE_W} y1={TOP - 4}
            x2={LEFT_PANEL + si * SCENE_W} y2={TOP + displayChars.length * ROW_H}
            stroke="#e8ddce" strokeWidth={0.5} strokeDasharray="3 4" />
        ))}

        {/* Character tracks */}
        {displayChars.map((char, ci) => {
          const isSelected = selectedChar === char.name;
          const y = TOP + ci * ROW_H;
          const roleColor = ROLE_COLORS[char.roleType] || "#8b7355";

          return (
            <g key={char.name} style={{ cursor: "pointer" }}
              onClick={() => onSelectChar(char.name)}>
              {/* Row background (alternating) */}
              <rect x={0} y={y} width={TOTAL_W} height={ROW_H}
                fill={isSelected ? "rgba(184,155,109,0.1)" : ci % 2 === 0 ? "rgba(255,255,255,0.3)" : "rgba(246,241,231,0.2)"}
                stroke={isSelected ? roleColor : "transparent"} strokeWidth={1.5} />

              {/* Character label */}
              <text x={LEFT_PANEL - 6} y={y + ROW_H / 2 + 4}
                textAnchor="end" fill={isSelected ? "#3a1a0a" : "#6b5540"}
                fontSize={isSelected ? 13 : 11} fontWeight={isSelected ? 700 : 500}
                fontFamily="'Noto Serif SC','PT Serif',serif">
                {char.name}
              </text>
              {/* Role dot */}
              <circle cx={LEFT_PANEL - 2} cy={y + 14} r={4} fill={roleColor} stroke="#fff" strokeWidth={0.8} />

              {/* Scene blocks */}
              {char.scenes.map((scene) => {
                const sx = LEFT_PANEL + scene.sceneIndex * SCENE_W + 3;
                const barH = ROW_H * 0.22 + scene.intensity * ROW_H * 0.65;
                const barY = y + (ROW_H - barH) / 2;
                return (
                  <g key={scene.sceneIndex}>
                    <rect x={sx} y={barY} width={SCENE_W - 6} height={barH}
                      rx={3} fill={sentimentColor(scene.sentiment, scene.intensity)}
                      stroke={isSelected ? roleColor : "transparent"} strokeWidth={0.8}
                      onMouseEnter={() => setHovered({
                        char: char.name, scene: scene.sceneIndex,
                        label: scene.sceneLabel, s: scene.sentiment,
                      })}
                      onMouseLeave={() => setHovered(null)}>
                      <title>{`${char.name} · 第${scene.sceneIndex + 1}场 · ${scene.sceneLabel} · 情感: ${scene.sentiment > 0 ? "+" : ""}${(scene.sentiment * 100).toFixed(0)}%`}</title>
                    </rect>
                    {/* Emotion emoji (single mode) */}
                    {isSelected && scene.importance > 0.3 && (
                      <text x={sx + SCENE_W / 2 - 3} y={barY + barH / 2 + 4}
                        textAnchor="middle" fontSize={12}>
                        {scene.sentiment > 0.5 ? "😊" : scene.sentiment > 0 ? "🙂" : scene.sentiment > -0.5 ? "😐" : "😟"}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Legend bar */}
        <g transform={`translate(${LEFT_PANEL},${TOP + displayChars.length * ROW_H + 10})`}>
          {SENTIMENT_GRADIENT.map((g, i) => (
            <rect key={i} x={i * 40} y={0} width={36} height={8} rx={2} fill={g.color} opacity={0.6} />
          ))}
          <text x={-4} y={7} textAnchor="end" fill="#8b7355" fontSize={8}>悲</text>
          <text x={SENTIMENT_GRADIENT.length * 40 + 4} y={7} fill="#8b7355" fontSize={8}>喜</text>
        </g>
      </svg>

      {/* Hover tooltip */}
      {hovered && (
        <div style={{
          position: "fixed", top: "50%", right: 20, zIndex: 50,
          background: "rgba(255,253,249,.96)", border: "1px solid #c4b08a",
          borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "#4a3020",
          boxShadow: "0 4px 14px rgba(0,0,0,.12)", pointerEvents: "none",
        }}>
          <b>{hovered.char}</b> · 第{hovered.scene + 1}场<br />
          {hovered.label}<br />
          情感: {hovered.s > 0.4 ? "😊 强烈正向" : hovered.s > 0 ? "🙂 正向" : hovered.s > -0.3 ? "😐 中性" : "😟 负向"}
        </div>
      )}

      {/* Mode tag */}
      <div style={{
        position: "absolute", top: 6, right: 12,
        fontSize: 9, color: "#8b7355", background: "rgba(255,255,255,.7)",
        padding: "2px 8px", borderRadius: 5, border: "1px solid #d4c4a8",
      }}>
        {mode === "single" ? "🔍 独观" : "👥 群览"} · {displayChars.length}角色 · {maxScenes}场
      </div>
    </div>
  );
};

export default EmotionFanSVG;
export type { CharacterEmotion, SceneData };
