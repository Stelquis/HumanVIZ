/**
 * p4_opera_ribbon_viewer.tsx — 京剧故事丝带可视化查看器
 *
 * 最大程度复用现有 MainPlot/StoryVis/Defs 的渲染逻辑，
 * 使用 p4_story_ribbon_core 提供的标准化接口，
 * 实现京剧剧本的叙事结构丝带图浏览与交互。
 */

import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
import {
  analyzeStoryRibbons,
  RibbonAnalysisResult,
  StoryFingerprint,
  extractFingerprint,
  RawStoryInput,
} from "../../utils/p4_story_ribbon_core";
import { character_height } from "../../utils/consts";
import { normalizeImportance, normalizeMarkerSize } from "../../utils/helpers";
import { bezierCommand, svgPath } from "../../utils/curve";
import { Scene } from "../../utils/data";

// ═══════════════════════════════════════════════════════════════
// Props
// ═══════════════════════════════════════════════════════════════

interface OperaRibbonViewerProps {
  /** 多剧本数据: key = 文件名/标题, value = 标准化输入 */
  operaDataMap: Map<string, RawStoryInput>;
  /** 初始选中的剧本 key */
  initialSelection?: string;
  /** 容器宽度 */
  width?: number;
  /** 容器高度 */
  height?: number;
  /** 受控模式：外部指定的选中 key */
  selectionKey?: string;
  /** 受控模式：key 变更回调 */
  onSelectionChange?: (key: string) => void;
  /** 隐藏顶部选择器和指标面板（用于外部布局） */
  hideControls?: boolean;
  /** 外部传入的分析结果（受控模式下由父组件计算） */
  analysisOverride?: RibbonAnalysisResult | null;
  /** 外部传入的指纹（受控模式下由父组件计算） */
  fingerprintOverride?: StoryFingerprint | null;
  /** 启用冲突波形图（默认 true） */
  enableWaveform?: boolean;
  /** 启用人情感火花图（默认 true） */
  enableSparklines?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// 颜色常量 — 基于「燕京清晖」全局配色方案
// ═══════════════════════════════════════════════════════════════

/** 行当分组色板（对齐 theme.css 六主体色） */
export const ROLE_GROUP_COLORS: Record<string, string> = {
  "生": "#96544D",  // --theme-red    朱砂红 — 男性主角，沉稳厚重
  "旦": "#B89B6D",  // --theme-gold   琉璃金 — 女性主角，华贵典雅
  "净": "#7F968D",  // --theme-celadon 云水青 — 花脸角色，冷峻鲜明
  "丑": "#5E6B76",  // --theme-slate  石板灰 — 喜剧角色，低调朴实
  "其他": "#8E8A84", // --text-muted   中性灰 — 未归类行当
};

/** 行当角色专属渐变基色（用于丝带填充） */
const ROLE_GRADIENT_BASE: Record<string, string> = {
  "生": "#96544D",
  "旦": "#B89B6D",
  "净": "#7F968D",
  "丑": "#5E6B76",
};

/** SVG 背景色 */
const SVG_BG = "#F6F1E7";  // --theme-paper

export const RHYTHM_LABELS: Record<string, string> = {
  "密集高潮型": "情绪集中、节奏紧凑",
  "长篇铺陈型": "叙事绵长、布局宏大",
  "文武交替型": "打斗与抒情交替",
  "渐进推进型": "线性推进、渐入高潮",
  "未知": "",
};

// ═══════════════════════════════════════════════════════════════
// 字体常量
// ═══════════════════════════════════════════════════════════════

const FONT_UI = "'Noto Sans SC', sans-serif";

// ═══════════════════════════════════════════════════════════════
// 主题化颜色辅助
// ═══════════════════════════════════════════════════════════════

/** 根据行当分组获取主题色（用于丝带和标记点） */
function getThemeGroupColor(group: string): string {
  return ROLE_GROUP_COLORS[group] || ROLE_GROUP_COLORS["其他"];
}

/** 为角色生成主题色：优先行当分组色，未归类则按索引分配 */
function getThemeCharColor(index: number, _total: number, group?: string): string {
  if (group && ROLE_GRADIENT_BASE[group]) {
    return ROLE_GRADIENT_BASE[group];
  }
  // 兜底：按索引在 生/旦/净/丑 四色间轮转
  const fallback = ["生", "旦", "净", "丑"];
  return ROLE_GRADIENT_BASE[fallback[index % 4]];
}

function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function getPhaseLabelForScene(
  sceneIndex: number,
  sceneCount: number,
  phases?: Array<{ label: string; startScene?: number; endScene?: number; pct?: number[] }>
): string {
  if (!phases || phases.length === 0) return "叙事阶段";

  const adaptive = phases[0]?.startScene !== undefined;
  if (adaptive) {
    const hit = phases.find(
      (phase) =>
        phase.startScene !== undefined &&
        phase.endScene !== undefined &&
        sceneIndex >= phase.startScene &&
        sceneIndex <= phase.endScene
    );
    return hit?.label || phases[phases.length - 1]?.label || "叙事阶段";
  }

  const ratio = sceneCount <= 1 ? 0 : sceneIndex / (sceneCount - 1);
  const hit = phases.find((phase) => phase.pct && ratio >= phase.pct[0] && ratio <= phase.pct[1]);
  return hit?.label || phases[phases.length - 1]?.label || "叙事阶段";
}

// ═══════════════════════════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════════════════════════

const OperaRibbonViewer: React.FC<OperaRibbonViewerProps> = ({
  operaDataMap,
  initialSelection,
  width = 1200,
  height = 700,
  selectionKey,
  onSelectionChange,
  hideControls = false,
  analysisOverride,
  fingerprintOverride,
  enableWaveform = true,
  enableSparklines: _enableSparklines = true,
}) => {
  const keys = useMemo(() => Array.from(operaDataMap.keys()), [operaDataMap]);
  const isControlled = selectionKey !== undefined;

  const [internalKey, setInternalKey] = useState<string>(
    initialSelection || keys[0] || ""
  );
  const selectedKey = isControlled ? selectionKey : internalKey;
  const compactMode = hideControls;

  const [hoveredChar, setHoveredChar] = useState<string>("");
  const [hoveredScene, setHoveredScene] = useState<number>(-1);
  const [selectedChar, setSelectedChar] = useState<string>("");
  const [selectedScene, setSelectedScene] = useState<number>(-1);
  const [showMetrics, setShowMetrics] = useState<boolean>(true);

  // 缩放状态
  const [zoom, setZoom] = useState(1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const rect = wrapper.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setZoom((prev) => {
      const next = Math.min(5, Math.max(0.3, prev * factor));
      requestAnimationFrame(() => {
        const ratio = next / prev;
        wrapper.scrollLeft = (wrapper.scrollLeft + mouseX) * ratio - mouseX;
        wrapper.scrollTop = (wrapper.scrollTop + mouseY) * ratio - mouseY;
      });
      return next;
    });
  }, []);

  const handleDoubleClick = useCallback(() => {
    setZoom(1);
  }, []);

  // 拖拽平移状态
  const dragRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: wrapper.scrollLeft,
      scrollTop: wrapper.scrollTop,
    };
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const wrapper = wrapperRef.current;
    if (!wrapper || !dragRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      wrapper.scrollLeft = dragRef.current.scrollLeft - dx;
      wrapper.scrollTop = dragRef.current.scrollTop - dy;
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // 分析当前选中的剧本（受控模式下优先使用外部传入的数据）
  const internalAnalysis = useMemo<RibbonAnalysisResult | null>(() => {
    if (isControlled && analysisOverride !== undefined) return analysisOverride;
    const input = operaDataMap.get(selectedKey);
    if (!input) return null;
    try {
      return analyzeStoryRibbons(input);
    } catch (e) {
      console.error("分析失败:", e);
      return null;
    }
  }, [selectedKey, operaDataMap, isControlled, analysisOverride]);

  const analysis = internalAnalysis;

  // 指纹提取
  const fingerprint = useMemo<StoryFingerprint | null>(() => {
    if (isControlled && fingerprintOverride !== undefined) return fingerprintOverride;
    if (!analysis) return null;
    return extractFingerprint(analysis);
  }, [analysis, isControlled, fingerprintOverride]);

  // 切换剧本
  const handleSelectOpera = useCallback((key: string) => {
    if (isControlled && onSelectionChange) {
      onSelectionChange(key);
    } else {
      setInternalKey(key);
    }
    setHoveredChar("");
    setHoveredScene(-1);
    setSelectedChar("");
    setSelectedScene(-1);
  }, [isControlled, onSelectionChange]);

  if (!analysis) {
    return (
      <div className="p4-viewer-empty">
        <p>暂无数据，请先运行 p4_opera_processor.py 生成剧本数据</p>
      </div>
    );
  }

  const { positions, characterScenes, sortedCharacters, scenes } = analysis;
  const phases = analysis.narrativeMetrics.narrativePhases?.length
    ? analysis.narrativeMetrics.narrativePhases
    : NARRATIVE_PHASES;

  const activeChar = hoveredChar || selectedChar;
  const activeScene = hoveredScene >= 0 ? hoveredScene : selectedScene;

  const handleCharSelect = useCallback((char: string) => {
    setSelectedChar((prev) => (prev === char ? "" : char));
  }, []);

  const handleSceneSelect = useCallback((sceneIdx: number) => {
    setSelectedScene((prev) => (prev === sceneIdx ? -1 : sceneIdx));
  }, []);

  return (
    <div className="p4-viewer-container" style={{ maxWidth: hideControls ? width : width + 40, fontFamily: FONT_UI }}>
      {/* 顶部控制栏 — 仅在非受控/非隐藏模式下显示 */}
      {!hideControls && (
        <OperaSelector
          keys={keys}
          selectedKey={selectedKey}
          onSelect={handleSelectOpera}
          fingerprint={fingerprint}
          showMetrics={showMetrics}
          onToggleMetrics={() => setShowMetrics(!showMetrics)}
        />
      )}

      {/* 叙事指标面板 — 仅在非隐藏模式下显示 */}
      {!hideControls && showMetrics && fingerprint && (
        <MetricsPanel fingerprint={fingerprint} />
      )}

      {/* SVG 丝带图 — 纵向布局 (从上往下) */}
      <div
        ref={wrapperRef}
        className={`p4-ribbon-svg-wrapper ${isDragging ? "dragging" : ""}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        title="滚轮缩放 · 拖拽平移 · 双击重置"
      >
        <RibbonSvg
          analysis={analysis}
          characterScenes={characterScenes}
          sortedCharacters={sortedCharacters}
          positions={positions}
          scenes={scenes}
          hoveredScene={activeScene}
          hoveredChar={activeChar}
          onSceneHover={setHoveredScene}
          onCharHover={setHoveredChar}
          onSceneSelect={handleSceneSelect}
          onCharSelect={handleCharSelect}
          enableWaveform={enableWaveform}
          targetWidth={width}
          targetHeight={height}
          compactMode={compactMode}
          zoomMultiplier={zoom}
        />
      </div>

      <div className={`p4-secondary-layout ${compactMode ? "compact" : ""}`}>
        <SceneTimelineStrip
          scenes={scenes}
          metrics={analysis.narrativeMetrics}
          activeScene={activeScene}
          phases={phases}
          onSelect={handleSceneSelect}
          compactMode={compactMode}
        />
      </div>

      {/* 图例 — 仅在非隐藏模式下显示 */}
      {!hideControls && (
        <CharacterLegend
          sortedCharacters={sortedCharacters}
          hoveredChar={activeChar}
          onCharHover={setHoveredChar}
          onCharSelect={handleCharSelect}
        />
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// RibbonSvg — SVG 容器（整合波形图 + 丝带图）
// ═══════════════════════════════════════════════════════════════

const RibbonSvg: React.FC<{
  analysis: RibbonAnalysisResult;
  characterScenes: any[];
  sortedCharacters: any[];
  positions: any;
  scenes: any[];
  hoveredScene: number;
  hoveredChar: string;
  onSceneHover: (idx: number) => void;
  onCharHover: (char: string) => void;
  onSceneSelect: (idx: number) => void;
  onCharSelect: (char: string) => void;
  enableWaveform: boolean;
  targetWidth: number;
  targetHeight: number;
  compactMode: boolean;
  zoomMultiplier?: number;
}> = ({
  analysis,
  characterScenes,
  sortedCharacters,
  positions,
  scenes,
  hoveredScene,
  hoveredChar,
  onSceneHover,
  onCharHover,
  onSceneSelect,
  onCharSelect,
  enableWaveform,
  targetWidth,
  targetHeight,
  compactMode,
  zoomMultiplier = 1,
}) => {
  // 波形图顶部高度（横向布局，波形位于顶部）
  const waveformHeight = enableWaveform
    ? Math.max(compactMode ? 64 : 92, Math.floor((positions.plotHeight + (compactMode ? 118 : 170)) * (compactMode ? 0.13 : 0.18)))
    : 0;

  // 横向布局：宽 = 场景推进轴，高 = 角色堆叠 + 波形图
  const totalW = positions.plotWidth + (compactMode ? 128 : 200);
  const totalH = positions.plotHeight + (compactMode ? 118 : 170) + waveformHeight;
  const ribbonTop = waveformHeight; // 丝带区域从波形图下方开始

  const widthScale = targetWidth > 0 ? targetWidth / totalW : 1;
  const heightScale = targetHeight > 0 ? targetHeight / totalH : 1;
  const svgScale = Math.min(widthScale, heightScale, 1);
  const renderW = Math.max(320, totalW * svgScale) * zoomMultiplier;
  const renderH = Math.max(220, totalH * svgScale) * zoomMultiplier;

  // 获取阶段数据：优先自适应检测，场景数≤3时回退到硬编码
  const metrics = analysis.narrativeMetrics;
  const adaptivePhases =
    metrics.narrativePhases && metrics.narrativePhases.length > 1
      ? metrics.narrativePhases
      : null;

  const phases = adaptivePhases || NARRATIVE_PHASES;
  const isAdaptive = adaptivePhases !== null;

  // 预构建查找 Map，消除 O(C^2) 的 .find() 调用
  const charGroupMap = useMemo(() => {
    const m = new Map<string, string>();
    sortedCharacters.forEach((c: any) => m.set(c.character, c.group));
    return m;
  }, [sortedCharacters]);

  const charShortMap = useMemo(() => {
    const m = new Map<string, string>();
    sortedCharacters.forEach((c: any) => m.set(c.character, c.short || c.character));
    return m;
  }, [sortedCharacters]);

  const sceneCharRatingMap = useMemo(() => {
    const m = new Map<string, number>();
    scenes.forEach((scene: any, si: number) => {
      scene.characters?.forEach((c: any) => {
        m.set(`${si}:${c.name}`, c.rating ?? 0);
      });
    });
    return m;
  }, [scenes]);

  return (
    <svg
      id="p4-opera-ribbon"
      viewBox={`0 0 ${totalW} ${totalH}`}
      width={renderW}
      height={renderH}
      style={{ background: SVG_BG, borderRadius: 8, fontFamily: FONT_UI }}
    >
      <defs>
        <RibbonDefs
          characterScenes={characterScenes}
          charGroupMap={charGroupMap}
        />
        {/* 波形图渐变 — 横向布局：从上到下 */}
        <linearGradient id="p4-waveform-conflict" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#96544D" stopOpacity={0.35} />
          <stop offset="100%" stopColor="#96544D" stopOpacity={0.06} />
        </linearGradient>
        <linearGradient id="p4-waveform-sentiment" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#B89B6D" stopOpacity={0.30} />
          <stop offset="100%" stopColor="#B89B6D" stopOpacity={0.04} />
        </linearGradient>
        {/* 叙事阶段背景渐变 — 横向布局：从左到右 */}
        <linearGradient id="p4-phase-begin" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#96544D" stopOpacity={0.07} />
          <stop offset="100%" stopColor="#96544D" stopOpacity={0.02} />
        </linearGradient>
        <linearGradient id="p4-phase-develop" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#B89B6D" stopOpacity={0.06} />
          <stop offset="100%" stopColor="#B89B6D" stopOpacity={0.01} />
        </linearGradient>
        <linearGradient id="p4-phase-climax" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#96544D" stopOpacity={0.10} />
          <stop offset="100%" stopColor="#96544D" stopOpacity={0.04} />
        </linearGradient>
        <linearGradient id="p4-phase-end" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7F968D" stopOpacity={0.06} />
          <stop offset="100%" stopColor="#7F968D" stopOpacity={0.01} />
        </linearGradient>
      </defs>

      {/* ── 横向布局 (无坐标轴交换) ── */}

      {/* 叙事阶段背景色带（纵向竖条，全高） */}
      <NarrativePhaseBands
        scenes={scenes}
        scenePos={positions.scenePos}
        plotHeight={totalH}
        phases={phases}
        isAdaptive={isAdaptive}
      />

      {/* 阶段分隔虚线（纵向竖线，全高） */}
      <PhaseDividers
        scenes={scenes}
        scenePos={positions.scenePos}
        plotHeight={totalH}
        phases={phases}
        isAdaptive={isAdaptive}
      />

      {/* 冲突波形图（顶部宽条带） */}
      {enableWaveform && (
        <ConflictWaveformBand
          analysis={analysis}
          scenePos={positions.scenePos}
          bandHeight={waveformHeight}
          phases={phases}
          isAdaptive={isAdaptive}
        />
      )}

      {/* 阶段标签（波形图区域上方） */}
      {enableWaveform && (
        <PhaseLabels
          scenes={scenes}
          scenePos={positions.scenePos}
          plotWidth={positions.plotWidth}
          phases={phases}
          isAdaptive={isAdaptive}
          bandHeight={waveformHeight}
        />
      )}

      {/* 主内容区（下移 waveformHeight，为波形图腾出顶部空间） */}
      <g transform={`translate(0, ${ribbonTop})`}>
        {/* 场景背景 */}
        <SceneBackgrounds
          positions={positions}
          sceneCharacters={analysis.sceneCharacters}
          hoveredScene={hoveredScene}
          hoveredChar={hoveredChar}
          onSceneHover={onSceneHover}
          onSceneSelect={onSceneSelect}
        />

        {/* 数据丝带 */}
        <RibbonLayer
          characterScenes={characterScenes}
          charGroupMap={charGroupMap}
          charShortMap={charShortMap}
          sceneCharRatingMap={sceneCharRatingMap}
          positions={positions}
          scenes={scenes}
          hoveredChar={hoveredChar}
          onCharHover={onCharHover}
          onCharSelect={onCharSelect}
        />

        {/* 场景标签（横轴底部） */}
        <SceneLabels positions={positions} scenes={scenes} />
      </g>
    </svg>
  );
};

// ═══════════════════════════════════════════════════════════════
// 子组件：冲突波形图
// ═══════════════════════════════════════════════════════════════

const ConflictWaveformBand: React.FC<{
  analysis: RibbonAnalysisResult;
  scenePos: Position[];
  bandHeight: number;
  phases: any[];
  isAdaptive: boolean;
}> = React.memo(({ analysis, scenePos, bandHeight }) => {
  const { conflictArc, sentimentArc } = analysis.narrativeMetrics;
  const n = conflictArc.length;
  if (n < 2) return null;

  const pad = 10;
  const innerH = bandHeight - pad * 2;

  const firstX = scenePos[0]?.x || 0;
  const lastX = scenePos[n - 1]?.x || 0;

  // 横向布局：x = 场景位置（水平），y = 波形值（垂直，顶部=高强度）
  const conflictPoints: number[][] = [];
  const sentimentPoints: number[][] = [];

  for (let i = 0; i < n; i++) {
    const sx = scenePos[i]?.x || 0;
    const cVal = Math.max(0.05, conflictArc[i] || 0);
    const sVal = Math.max(0.05, sentimentArc[i] || 0);
    conflictPoints.push([sx, pad + innerH * (1 - cVal)]);
    sentimentPoints.push([sx, pad + innerH * (1 - sVal)]);
  }

  // 冲突填充区域（顶部=0到底部=bandHeight）
  const conflictPath = svgPath(conflictPoints, [], bezierCommand, 0.3);
  let areaD = conflictPath;
  areaD += ` L ${lastX},${bandHeight}`;
  areaD += ` L ${firstX},${bandHeight} Z`;

  // 情感线路径
  const sentimentPath = svgPath(sentimentPoints, [], bezierCommand, 0.3);
  // 冲突线路径
  const conflictLinePath = svgPath(conflictPoints, [], bezierCommand, 0.3);

  return (
    <g id="p4-waveform-band" pointerEvents="none">
      {/* 背景 */}
      <rect x={firstX - 20} y={0} width={lastX - firstX + 40} height={bandHeight}
        fill="rgba(246,241,231,0.45)" />

      {/* 冲突填充区域 */}
      <path d={areaD} fill="url(#p4-waveform-conflict)" opacity={0.55} />

      {/* 情感线 */}
      <path d={sentimentPath} fill="none" stroke="#B89B6D" strokeWidth={2}
        strokeOpacity={0.55} strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="6 3" />

      {/* 冲突线 */}
      <path d={conflictLinePath} fill="none" stroke="#96544D" strokeWidth={2.4}
        strokeOpacity={0.65} strokeLinecap="round" strokeLinejoin="round" />

      {/* 场景节点 */}
      {conflictPoints.map((pt, i) => {
        const c = conflictArc[i] || 0;
        return (
          <circle key={`wf-dot-${i}`} cx={pt[0]} cy={pt[1]}
            r={2.5 + c * 3.5} fill="#96544D"
            fillOpacity={0.25 + c * 0.4} stroke="#F6F1E7" strokeWidth={0.8} />
        );
      })}

      {/* Y 轴标签（左侧，水平文字） */}
      <text x={firstX - 14} y={pad + 4} textAnchor="end"
        fontSize={9} fontWeight={500} fontFamily={FONT_UI}
        fill="rgba(94,107,118,0.5)">1.0</text>
      <text x={firstX - 14} y={pad + innerH / 2 + 3} textAnchor="end"
        fontSize={9} fontWeight={500} fontFamily={FONT_UI}
        fill="rgba(94,107,118,0.5)">0.5</text>
      <text x={firstX - 14} y={bandHeight - pad + 4} textAnchor="end"
        fontSize={9} fontWeight={500} fontFamily={FONT_UI}
        fill="rgba(94,107,118,0.5)">0.0</text>

      {/* Y 轴标题 */}
      <text x={firstX - 18} y={bandHeight / 2} textAnchor="middle"
        transform={`rotate(-90, ${firstX - 18}, ${bandHeight / 2})`}
        fontSize={9} fontWeight={600} fontFamily={FONT_UI}
        fill="rgba(94,107,118,0.55)" paintOrder="stroke"
        stroke={SVG_BG} strokeWidth={2}>
        冲突 / 情感
      </text>

      {/* 图例（右上角） */}
      <g transform={`translate(${lastX - 100}, 6)`}>
        <line x1={0} y1={0} x2={14} y2={0} stroke="#96544D" strokeWidth={2.4} strokeOpacity={0.65} />
        <text x={17} y={0} fontSize={9} fontFamily={FONT_UI} fill="rgba(94,107,118,0.65)" dominantBaseline="middle">冲突</text>
        <line x1={40} y1={0} x2={54} y2={0} stroke="#B89B6D" strokeWidth={2} strokeOpacity={0.55} strokeDasharray="4 2" />
        <text x={57} y={0} fontSize={9} fontFamily={FONT_UI} fill="rgba(94,107,118,0.65)" dominantBaseline="middle">情感</text>
      </g>
    </g>
  );
});

// ═══════════════════════════════════════════════════════════════
// 子组件：角色情感火花图（Sparkline）
// ═══════════════════════════════════════════════════════════════

export const CharacterEmotionSparkline: React.FC<{
  characterName: string;
  scenes: Scene[];
  characterScenes: any[];
  width?: number;
  height?: number;
}> = React.memo(({ characterName, scenes, characterScenes, width = 120, height = 36 }) => {
  const charData = characterScenes.find((c: any) => c.character === characterName);
  if (!charData) return null;

  // 预构建场景-情感查找表
  const ratingByScene = useMemo(() => {
    const m = new Map<number, number>();
    scenes.forEach((scene: any, idx: number) => {
      const c = scene.characters?.find((ch: any) => ch.name === characterName);
      if (c) m.set(idx, c.rating ?? 0);
    });
    return m;
  }, [scenes, characterName]);

  // 提取该角色在所有场景中的情感序列
  const points = useMemo(() => {
    const arr: { sceneIdx: number; rating: number }[] = [];
    charData.scenes.forEach((sceneIdx: number) => {
      const rating = ratingByScene.get(sceneIdx);
      if (rating !== undefined) {
        arr.push({ sceneIdx, rating });
      }
    });
    return arr;
  }, [charData.scenes, ratingByScene]);

  if (points.length < 2) return null;

  const n = scenes.length;
  const padX = 6;
  const padY = 4;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;
  const midY = padY + plotH / 2;

  // 映射到像素坐标
  const coords = points.map((p) => [
    padX + (p.sceneIdx / Math.max(n - 1, 1)) * plotW,
    midY - p.rating * (plotH / 2),
  ]);

  const pathD = svgPath(coords, [], bezierCommand, 0.35);

  // 情感极性的填充区域
  const areaTop = coords.map(([cx]) => [cx, midY]);
  let areaD = pathD;
  const lastPt = coords[coords.length - 1];
  areaD += ` L ${lastPt[0]},${midY}`;
  const revArea = [...areaTop].reverse();
  for (let i = 0; i < revArea.length; i++) {
    areaD += ` L ${revArea[i][0]},${revArea[i][1]}`;
  }
  areaD += " Z";

  // 平均情感极性决定主导色
  const avgRating = points.reduce((s, p) => s + p.rating, 0) / points.length;
  const warmColor = avgRating >= 0 ? "#96544D" : "#7F968D";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "inline-block", verticalAlign: "middle", overflow: "visible" }}
    >
      {/* 零线 */}
      <line
        x1={padX} y1={midY} x2={width - padX} y2={midY}
        stroke="rgba(94,107,118,0.18)" strokeWidth={0.8}
      />
      {/* 填充区域 */}
      <path d={areaD} fill={warmColor} fillOpacity={0.10} />
      {/* 曲线 */}
      <path
        d={pathD}
        fill="none"
        stroke={warmColor}
        strokeWidth={1.5}
        strokeOpacity={0.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 端点 */}
      {coords.length > 0 && (
        <>
          <circle cx={coords[0][0]} cy={coords[0][1]} r={2} fill={warmColor} fillOpacity={0.7} />
          <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r={2} fill={warmColor} fillOpacity={0.7} />
        </>
      )}
    </svg>
  );
});

// ═══════════════════════════════════════════════════════════════
// 子组件：剧本选择器
// ═══════════════════════════════════════════════════════════════

const OperaSelector: React.FC<{
  keys: string[];
  selectedKey: string;
  onSelect: (key: string) => void;
  fingerprint: StoryFingerprint | null;
  showMetrics: boolean;
  onToggleMetrics: () => void;
}> = ({ keys, selectedKey, onSelect, fingerprint, showMetrics, onToggleMetrics }) => (
  <div className="p4-selector-bar">
    <select
      value={selectedKey}
      onChange={(e) => onSelect(e.target.value)}
      className="p4-opera-select"
    >
      {keys.map((k) => {
        const label = k.replace(".json", "").replace(/^\d+_/, "");
        return (
          <option key={k} value={k}>
            {label}
          </option>
        );
      })}
    </select>

    {fingerprint && (
      <span className="p4-fingerprint-badge">
        <span className="p4-badge">{fingerprint.sceneCount} 场</span>
        <span className="p4-badge">{fingerprint.charCount} 角色</span>
        <span className={`p4-badge p4-rhythm-${fingerprint.rhythmType}`}>
          {fingerprint.rhythmType}
        </span>
      </span>
    )}

    <button
      onClick={onToggleMetrics}
      className={`p4-toggle-btn ${showMetrics ? "active" : ""}`}
    >
      {showMetrics ? "隐藏指标" : "显示指标"}
    </button>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// 子组件：叙事指标面板
// ═══════════════════════════════════════════════════════════════

const MetricsPanel: React.FC<{
  fingerprint: StoryFingerprint;
}> = ({ fingerprint }) => (
  <div className="p4-metrics-panel">
    <div className="p4-metric-item">
      <label>叙事节奏</label>
      <span className="p4-metric-value">{fingerprint.rhythmType}</span>
      <small>{RHYTHM_LABELS[fingerprint.rhythmType] || ""}</small>
    </div>
    <div className="p4-metric-item">
      <label>情感波动</label>
      <span className="p4-metric-value">
        {(fingerprint.sentimentVolatility * 100).toFixed(0)}%
      </span>
      <div className="p4-mini-bar">
        <div
          className="p4-mini-bar-fill"
          style={{ width: `${fingerprint.sentimentVolatility * 100}%` }}
        />
      </div>
    </div>
    <div className="p4-metric-item">
      <label>场景密度</label>
      <span className="p4-metric-value">
        {fingerprint.avgCharsPerScene.toFixed(1)} 角色/场
      </span>
    </div>
    <div className="p4-metric-item">
      <label>场景均匀度</label>
      <span className="p4-metric-value">
        CV = {fingerprint.sceneLengthCV.toFixed(2)}
      </span>
    </div>
    <div className="p4-metric-item">
      <label>总行数</label>
      <span className="p4-metric-value">{fingerprint.totalLines}</span>
    </div>
  </div>
);

const SceneTimelineStrip: React.FC<{
  scenes: Scene[];
  metrics: RibbonAnalysisResult["narrativeMetrics"];
  activeScene: number;
  phases: Array<{ label: string; startScene?: number; endScene?: number; pct?: number[] }>;
  onSelect: (idx: number) => void;
  compactMode?: boolean;
}> = ({ scenes, metrics, activeScene, phases, onSelect, compactMode = false }) => (
  <div className={`p4-scene-strip ${compactMode ? "compact" : ""}`}>
    <div className="p4-scene-strip-header">
      <div>
        <strong>场景导航</strong>
        <span>{compactMode ? "快速定位场次" : "按场次快速定位剧情阶段与强度峰值"}</span>
      </div>
      <small>{compactMode ? "点选固定" : "点击卡片可固定高亮"}</small>
    </div>
    <div className="p4-scene-strip-track">
      {scenes.map((scene, idx) => {
        const conflict = metrics.conflictArc[idx] || 0;
        const sentiment = metrics.sentimentArc[idx] || 0;
        const phaseLabel = getPhaseLabelForScene(idx, scenes.length, phases);
        const charCount = scene.characters?.length || 0;
        const isActive = idx === activeScene;
        return (
          <button
            key={`scene-strip-${idx}`}
            type="button"
            className={`p4-scene-pill ${isActive ? "active" : ""}`}
            onClick={() => onSelect(idx)}
          >
            <span className="p4-scene-pill-top">
              <span className="p4-scene-pill-no">第{scene.number || idx + 1}场</span>
              <span className="p4-scene-pill-phase">{phaseLabel}</span>
            </span>
            <span className="p4-scene-pill-name">{scene.name || `场景 ${idx + 1}`}</span>
            {!compactMode && (
              <span className="p4-scene-pill-meta">
                <span>{charCount} 角色</span>
                <span>{scene.location || "舞台"}</span>
              </span>
            )}
            <span className="p4-scene-pill-bars">
              <span className="p4-scene-bar">
                <span className="p4-scene-bar-label">冲突</span>
                <span className="p4-scene-bar-track">
                  <span className="p4-scene-bar-fill conflict" style={{ width: formatPercent(conflict) }} />
                </span>
              </span>
              <span className="p4-scene-bar">
                <span className="p4-scene-bar-label">情感</span>
                <span className="p4-scene-bar-track mood">
                  <span
                    className={`p4-scene-bar-fill ${sentiment >= 0 ? "positive" : "negative"}`}
                    style={{ width: `${Math.min(100, Math.abs(sentiment) * 100)}%` }}
                  />
                </span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// 子组件：渐变定义
// ═══════════════════════════════════════════════════════════════

const RibbonDefs: React.FC<{
  characterScenes: any[];
  charGroupMap: Map<string, string>;
}> = React.memo(({ characterScenes, charGroupMap }) => (
  <defs>
    {characterScenes.map((char, i) => {
      const group = charGroupMap.get(char.character);
      const fillColor = getThemeCharColor(i, characterScenes.length, group);

      // 为每个连续出场段生成渐变
      let segments: number[][] = [];
      let curSeg: number[] = [];
      char.scenes.forEach((scene: number, j: number) => {
        curSeg.push(scene);
        const next = char.scenes[j + 1];
        if (next === undefined || next - scene > 1) {
          segments.push(curSeg);
          curSeg = [];
        }
      });

      return segments.map((seg, segIdx) => {
        if (seg.length === 0) return null;

        return (
          <linearGradient
            key={`p4-grad-${i}-${segIdx}`}
            id={`p4-linear-${i}-${segIdx}`}
            x1="0%" y1="0%" x2="0%" y2="100%"
          >
            <stop offset="0%" stopColor={fillColor} stopOpacity={0.2} />
            <stop offset="15%" stopColor={fillColor} stopOpacity={0.55} />
            <stop offset="85%" stopColor={fillColor} stopOpacity={0.55} />
            <stop offset="100%" stopColor={fillColor} stopOpacity={0.2} />
          </linearGradient>
        );
      });
    })}
  </defs>
));

// ═══════════════════════════════════════════════════════════════
// 子组件：场景背景（alternating colors for visual separation）
// ═══════════════════════════════════════════════════════════════

const SCENE_BG_COLORS = [
  "rgba(246,241,231,0.5)",  // --theme-paper warm
  "rgba(255,253,249,0.5)",  // lighter warm
];

const SceneBackgrounds: React.FC<{
  positions: any;
  sceneCharacters: any[];
  hoveredScene: number;
  hoveredChar: string;
  onSceneHover: (idx: number) => void;
  onSceneSelect: (idx: number) => void;
}> = ({ positions, sceneCharacters, hoveredScene, hoveredChar, onSceneHover, onSceneSelect }) => (
  <g id="p4-scene-bg">
    {positions.sceneBoxes.map((box: any, i: number) => {
      if (!box) return null;
      const isHighlighted =
        hoveredScene === i ||
        (hoveredChar !== "" &&
          sceneCharacters[i]?.characters?.includes(hoveredChar));

      return (
        <rect
          key={`p4-scene-bg-${i}`}
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          fill={isHighlighted ? "rgba(150,84,77,0.12)" : SCENE_BG_COLORS[i % 2]}
          stroke={isHighlighted ? "rgba(150,84,77,0.35)" : "rgba(184,149,111,0.12)"}
          strokeWidth={isHighlighted ? 2 : 1}
          rx={4}
          onMouseEnter={() => onSceneHover(i)}
          onMouseLeave={() => onSceneHover(-1)}
          onClick={() => onSceneSelect(i)}
          style={{ cursor: "pointer", transition: "fill 0.2s, stroke 0.2s" }}
        />
      );
    })}
  </g>
);

// ═══════════════════════════════════════════════════════════════
// 子组件：丝带路径层
// ═══════════════════════════════════════════════════════════════

const RibbonLayer: React.FC<{
  characterScenes: any[];
  charGroupMap: Map<string, string>;
  charShortMap: Map<string, string>;
  sceneCharRatingMap: Map<string, number>;
  positions: any;
  scenes: any[];
  hoveredChar: string;
  onCharHover: (char: string) => void;
  onCharSelect: (char: string) => void;
}> = ({ characterScenes, charGroupMap, charShortMap, sceneCharRatingMap, positions, scenes, hoveredChar, onCharHover, onCharSelect }) => {
  const total = characterScenes.length;

  return (
    <g id="p4-ribbon-layer">
      {characterScenes.map((character, i) => {
        const paths = positions.characterPaths[i] || [];
        const squares = positions.characterSquares[i] || [];
        const group = charGroupMap.get(character.character);
        const fillColor = getThemeCharColor(i, total, group);
        const isFaded = hoveredChar !== "" && hoveredChar !== character.character;
        const isActive = hoveredChar === character.character;

        return (
          <g
            key={`p4-char-${i}`}
            className={`p4-char-group ${isFaded ? "p4-faded" : ""}`}
            onMouseEnter={() => onCharHover(character.character)}
            onMouseLeave={() => onCharHover("")}
            onClick={() => onCharSelect(character.character)}
            style={{ cursor: "pointer", transition: "opacity 0.2s" }}
            opacity={isFaded ? 0.12 : 1}
          >
            {/* 丝带路径 */}
            {paths.map((path: string, j: number) => (
              <path
                key={`p4-path-${i}-${j}`}
                d={path}
                fill={`url(#p4-linear-${i}-${j})`}
                stroke={fillColor}
                strokeWidth={isActive ? 1.8 : 1}
                strokeOpacity={isActive ? 0.8 : 0.35}
                paintOrder="stroke"
              />
            ))}

            {/* 角色标记点 */}
            {squares.map((sq: any, j: number) => {
              if (!sq) return null;
              const sceneIdx = character.scenes[j];
              const importance = sceneCharRatingMap.get(`${sceneIdx}:${character.character}`) ?? 0.5;
              const numChars = scenes[sceneIdx]?.characters?.length || 1;
              const normImportance = normalizeImportance(importance, numChars);
              const markerSize = normalizeMarkerSize(normImportance * character_height);

              return (
                <circle
                  key={`p4-dot-${i}-${j}`}
                  cx={sq.x + sq.width / 2}
                  cy={sq.y + sq.height / 2}
                  r={markerSize / 2}
                  fill={fillColor}
                  stroke={SVG_BG}
                  strokeWidth={1}
                />
              );
            })}

            {/* 角色名标签（第一个出场位置左侧）— 横向布局无需旋转 */}
            {positions.firstPoints[i] && (() => {
              const lx = positions.firstPoints[i].x - 6;
              const ly = positions.firstPoints[i].y + character_height * 0.3;
              return (
                <text
                  x={lx}
                  y={ly}
                  textAnchor="end"
                  fill={fillColor}
                  fontSize={11}
                  fontWeight={isActive ? 700 : 600}
                  fontFamily={FONT_UI}
                  paintOrder="stroke"
                  stroke={SVG_BG}
                  strokeWidth={3}
                >
                  {charShortMap.get(character.character) || character.character}
                </text>
              );
            })()}
          </g>
        );
      })}
    </g>
  );
};

// ═══════════════════════════════════════════════════════════════
// 子组件：场景标签（突出的横轴设计）
// ═══════════════════════════════════════════════════════════════

const SceneLabels: React.FC<{
  positions: any;
  scenes: any[];
}> = React.memo(({ positions, scenes }) => {
  const axisY = positions.plotHeight + 12;
  const tickLen = 6;
  const labelY1 = axisY + 20;
  const labelY2 = axisY + 35;

  return (
    <g id="p4-scene-labels">
      {/* 横轴主线 */}
      <line
        x1={positions.scenePos[0]?.x - 16 || 0}
        y1={axisY}
        x2={positions.scenePos[positions.scenePos.length - 1]?.x + 16 || positions.plotWidth}
        y2={axisY}
        stroke="rgba(94,107,118,0.4)"
        strokeWidth={1.5}
        strokeLinecap="round"
      />

      {positions.scenePos.map((pos: any, i: number) => {
        const sceneName = scenes[i]?.name || "";
        const sceneNum = scenes[i]?.number || i + 1;
        const shortName = sceneName.length > 6 ? sceneName.slice(0, 5) + "…" : sceneName;
        const maxW = positions.sceneWidth || 100;
        const tooNarrow = maxW < 80;

        return (
          <g key={`p4-label-${i}`}>
            {/* 刻度线（纵向） */}
            <line
              x1={pos.x} y1={axisY - tickLen}
              x2={pos.x} y2={axisY + tickLen}
              stroke="rgba(94,107,118,0.35)"
              strokeWidth={1.2}
              strokeLinecap="round"
            />

            {/* 场景号（主标签）— 横向布局，正常水平文字 */}
            {!tooNarrow && (
              <text
                x={pos.x}
                y={labelY1}
                textAnchor="middle"
                fontSize={12}
                fontWeight={700}
                fontFamily={FONT_UI}
                fill="var(--theme-wood, #5E4B3A)"
                paintOrder="stroke"
                stroke={SVG_BG}
                strokeWidth={2}
              >
                第{sceneNum}场
              </text>
            )}

            {/* 场景名（副标签）— 横向布局，正常水平文字 */}
            {shortName && !tooNarrow && (
              <text
                x={pos.x}
                y={labelY2}
                textAnchor="middle"
                fontSize={9}
                fontWeight={500}
                fontFamily={FONT_UI}
                fill="rgba(94,107,118,0.65)"
                paintOrder="stroke"
                stroke={SVG_BG}
                strokeWidth={2}
              >
                {shortName}
              </text>
            )}

            {/* 场景分隔虚线（向上延伸） */}
            <line
              x1={pos.x} y1={axisY - tickLen}
              x2={pos.x} y2={0}
              stroke="rgba(94,107,118,0.08)"
              strokeWidth={0.8}
              strokeDasharray="3 5"
            />
          </g>
        );
      })}

      {/* 横轴标签 — 横向布局，正常水平文字 */}
      <text
        x={positions.scenePos[positions.scenePos.length - 1]?.x + 22 || positions.plotWidth}
        y={axisY + 4}
        textAnchor="start"
        fontSize={11}
        fontWeight={600}
        fontFamily={FONT_UI}
        fill="var(--theme-text-soft, #8E8A84)"
        paintOrder="stroke"
        stroke={SVG_BG}
        strokeWidth={2}
      >
        场次 →
      </text>
    </g>
  );
});

// ═══════════════════════════════════════════════════════════════
// 子组件：叙事阶段背景色带 (storycurve-inspired phase bands)
// ═══════════════════════════════════════════════════════════════

const NARRATIVE_PHASES = [
  { label: "开端", pct: [0, 0.2], color: "url(#p4-phase-begin)" },
  { label: "发展", pct: [0.2, 0.55], color: "url(#p4-phase-develop)" },
  { label: "高潮", pct: [0.55, 0.8], color: "url(#p4-phase-climax)" },
  { label: "结局", pct: [0.8, 1.0], color: "url(#p4-phase-end)" },
];

interface Position { x: number; y: number; }

const NarrativePhaseBands: React.FC<{
  scenes: Scene[];
  scenePos: Position[];
  plotHeight: number;
  phases?: any[];
  isAdaptive?: boolean;
}> = React.memo(({ scenes, scenePos, plotHeight, phases }) => {
  const n = scenes.length;
  if (n === 0 || !scenePos[0]) return null;

  const phaseList = phases || NARRATIVE_PHASES;

  // 硬编码模式：使用百分比 (startScene 为 undefined)
  const isLegacy = !phases || phases[0]?.startScene === undefined;

  const phaseColors = [
    "url(#p4-phase-begin)",
    "url(#p4-phase-develop)",
    "url(#p4-phase-climax)",
    "url(#p4-phase-end)",
  ];

  return (
    <g id="p4-phase-bands" pointerEvents="none">
      {isLegacy
        ? phaseList.map((phase: any) => {
            const startIdx = Math.floor(n * phase.pct[0]);
            const endIdx = Math.min(Math.floor(n * phase.pct[1]), n - 1);
            const x0 = (scenePos[startIdx]?.x || 0) - 18;
            const x1 = (scenePos[endIdx]?.x || 0) + 18;
            const w = x1 - x0;
            if (w <= 0) return null;
            return (
              <rect
                key={phase.label}
                x={x0}
                y={0}
                width={w}
                height={plotHeight}
                fill={phase.color}
              />
            );
          })
        : phaseList.map((phase: any, pi: number) => {
            const x0 = (scenePos[phase.startScene]?.x || 0) - 18;
            const x1 = (scenePos[phase.endScene]?.x || 0) + 18;
            const w = x1 - x0;
            if (w <= 0) return null;
            return (
              <rect
                key={phase.label}
                x={x0}
                y={0}
                width={w}
                height={plotHeight}
                fill={phaseColors[pi % phaseColors.length]}
              />
            );
          })}
    </g>
  );
});

// ═══════════════════════════════════════════════════════════════
// 子组件：叙事阶段标签 (波形图区域内)
// ═══════════════════════════════════════════════════════════════

const PhaseLabels: React.FC<{
  scenes: Scene[];
  scenePos: Position[];
  plotWidth: number;
  phases?: any[];
  isAdaptive?: boolean;
  bandHeight?: number;
}> = React.memo(({ scenes, scenePos, phases, bandHeight = 0 }) => {
  const n = scenes.length;
  if (n === 0) return null;

  const phaseList = phases || NARRATIVE_PHASES;
  const isLegacy = !phases || phases[0]?.startScene === undefined;

  // 横向布局：标签位于波形图区域内、各阶段列的上方
  const labelY = bandHeight > 0 ? bandHeight - 8 : 24;

  return (
    <g id="p4-phase-labels" pointerEvents="none">
      {isLegacy
        ? phaseList.map((phase: any) => {
            const startIdx = Math.floor(n * phase.pct[0]);
            const endIdx = Math.min(Math.floor(n * phase.pct[1]), n - 1);
            const midX = ((scenePos[startIdx]?.x || 0) + (scenePos[endIdx]?.x || 0)) / 2;
            return (
              <text
                key={phase.label}
                x={midX}
                y={labelY}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fontFamily={FONT_UI}
                fill="var(--theme-wood, #5E4B3A)"
                fillOpacity={0.5}
                paintOrder="stroke"
                stroke={SVG_BG}
                strokeWidth={3}
                letterSpacing="0.06em"
              >
                {phase.label}
              </text>
            );
          })
        : phaseList.map((phase: any) => {
            const midX = ((scenePos[phase.startScene]?.x || 0) + (scenePos[phase.endScene]?.x || 0)) / 2;
            return (
              <text
                key={phase.label}
                x={midX}
                y={labelY}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fontFamily={FONT_UI}
                fill="var(--theme-wood, #5E4B3A)"
                fillOpacity={0.5}
                paintOrder="stroke"
                stroke={SVG_BG}
                strokeWidth={3}
                letterSpacing="0.06em"
              >
                {phase.label}
              </text>
            );
          })}
    </g>
  );
});

// ═══════════════════════════════════════════════════════════════
// 子组件：阶段分隔虚线 (storycurve-inspired phase dividers)
// ═══════════════════════════════════════════════════════════════

const PhaseDividers: React.FC<{
  scenes: Scene[];
  scenePos: Position[];
  plotHeight: number;
  phases?: any[];
  isAdaptive?: boolean;
}> = React.memo(({ scenes, scenePos, plotHeight, phases }) => {
  const n = scenes.length;
  if (n < 2) return null;

  const phaseList = phases || NARRATIVE_PHASES;
  const isLegacy = !phases || phases[0]?.startScene === undefined;

  const colors = ["#B89B6D", "#96544D", "#7F968D", "#5E6B76"];

  // 在阶段边界处绘制分隔线（不含首尾）
  const boundaries: number[] = [];
  if (isLegacy) {
    boundaries.push(0.2, 0.55, 0.8);
  } else {
    for (let i = 1; i < phaseList.length; i++) {
      boundaries.push(phaseList[i].startScene / Math.max(n - 1, 1));
    }
  }

  return (
    <g id="p4-phase-dividers" pointerEvents="none">
      {boundaries.map((pct, i) => {
        const idx = isLegacy ? Math.floor(n * pct) : Math.floor(n * pct);
        const safeIdx = Math.min(idx, n - 1);
        const x = scenePos[safeIdx]?.x || 0;
        return (
          <line
            key={`div-${i}`}
            x1={x}
            y1={0}
            x2={x}
            y2={plotHeight}
            stroke={colors[i % colors.length]}
            strokeWidth={1}
            strokeOpacity={0.18}
            strokeDasharray="6 8"
          />
        );
      })}
    </g>
  );
});

// ═══════════════════════════════════════════════════════════════
// 子组件：角色图例
// ═══════════════════════════════════════════════════════════════

export const CharacterLegend: React.FC<{
  sortedCharacters: any[];
  hoveredChar: string;
  onCharHover: (char: string) => void;
  onCharSelect: (char: string) => void;
}> = ({ sortedCharacters, hoveredChar, onCharHover, onCharSelect }) => {
  const uniqueGroups = useMemo(() => [...new Set(sortedCharacters.map((c: any) => c.group))], [sortedCharacters]);

  const charIndexMap = useMemo(() => {
    const m = new Map<string, number>();
    sortedCharacters.forEach((c: any, i: number) => m.set(c.character, i));
    return m;
  }, [sortedCharacters]);

  return (
    <div className="p4-legend">
      <h4 className="p4-legend-title">角色图例</h4>
      <div className="p4-legend-groups">
        {uniqueGroups.map((group) => {
          const chars = sortedCharacters.filter((c: any) => c.group === group);
          const groupColor = getThemeGroupColor(group);
          return (
            <div key={group} className="p4-legend-group">
              <span
                className="p4-legend-group-label"
                style={{ color: groupColor, borderColor: groupColor }}
              >
                {group}
              </span>
              <div className="p4-legend-chars">
                {chars.map((c: any) => (
                  <span
                    key={c.character}
                    className={`p4-legend-char ${
                      hoveredChar === c.character ? "p4-legend-active" : ""
                    }`}
                    style={{
                      borderColor:
                        hoveredChar === c.character
                          ? groupColor
                          : "transparent",
                    }}
                    onMouseEnter={() => onCharHover(c.character)}
                    onMouseLeave={() => onCharHover("")}
                    onClick={() => onCharSelect(c.character)}
                  >
                    <span
                      className="p4-legend-dot"
                      style={{
                        backgroundColor: getThemeCharColor(
                          charIndexMap.get(c.character) ?? 0,
                          sortedCharacters.length,
                          c.group
                        ),
                      }}
                    />
                    {c.short || c.character}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OperaRibbonViewer;

// ═══════════════════════════════════════════════════════════════
// 行当配色辅助
// ═══════════════════════════════════════════════════════════════

export function getRoleGroupColor(role: string): string {
  return getThemeGroupColor(role);
}
