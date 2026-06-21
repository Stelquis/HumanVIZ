/**
 * 梨园星图 · Task 5 integrated structure field.
 *
 * One script is one luminous star. Spatial layout is driven by Task 5's
 * three analytic dimensions: theme vector = bearing, role-network
 * complexity = radius, narrative structure = altitude. Genre is kept as
 * a color/filter/comparison variable instead of a spatial grouping rule.
 */
import React, { useState, useMemo, useRef, Suspense, useCallback } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import starmapData from "../../data/starmap-data.json";
import evidenceData from "../../data/task5-evidence.json";
import { buildGalaxyLayout } from "./UniverseLayout";
import type { ScriptStarLayout } from "./UniverseLayout";
import SpaceBackground from "./SpaceBackground";
import ScriptStars from "./ScriptStars";
import GalaxyFields from "./GalaxyFields";
import ConnectionBeams from "./ConnectionBeams";
import type { ConnectionMode } from "./ConnectionBeams";
import UniverseFilterPanel from "./UniverseFilterPanel";
import RightDetailPanel from "./RightDetailPanel";
import LayoutLegend from "./LayoutLegend";
import type { ScriptNode } from "./types";

const data = starmapData as any;
const EVD = evidenceData as any;

type FilterMode = "genre" | "theme" | "narr" | "proto" | null;

const THEME_COLORS: Record<string, string> = data.config.themeColors || {};
const NARR_COLORS: Record<string, string> = data.config.narrColors || {};

const DEFAULT_CAMERA = new THREE.Vector3(0, 0, 295);
const RESET_DURATION = 1.2;
const DISK_FACE_CAMERA_X_ROTATION = Math.PI / 2;
const DISK_AUTO_ROTATION_SPEED = 0.0375;

// ── Main Scene ──

interface SceneProps {
  onScriptSelect?: (s: ScriptNode) => void;
  selectedStar: ScriptStarLayout | null;
  setSelectedStar: React.Dispatch<React.SetStateAction<ScriptStarLayout | null>>;
  hoveredStar: ScriptStarLayout | null;
  setHoveredStar: (s: ScriptStarLayout | null) => void;
  dimmedIds: Set<string>;
  resetTrigger: number;
  hoverNeighborIds: Set<string>;
  connectionMode: ConnectionMode;
  hubIds: Set<string>;
  hexIds: Set<string>;
  ringIds: Set<string>;
  glowIds: Set<string>;
}

const FLY_DURATION = 0.9;
const ORIGIN = new THREE.Vector3(0, 0, 0);

// ── Small Canvas-child that handles camera fly-to-centroid animation ──
const FlyController: React.FC<{
  controlsRef: React.RefObject<any>;
  stars: ScriptStarLayout[];
  dimmedIds: Set<string>;
  resetTrigger: number;
}> = ({ controlsRef, stars, dimmedIds, resetTrigger }) => {
  const flyRef = useRef({ active: false, start: new THREE.Vector3(), target: new THREE.Vector3(), elapsed: 0 });
  const prevDimCountRef = useRef(dimmedIds.size);
  const lastResetRef = useRef(0);

  useFrame((_, delta) => {
    const dimCount = dimmedIds.size;
    const total = stars.length;
    const prevCount = prevDimCountRef.current;

    if (dimCount !== prevCount && dimCount > 0 && dimCount < total) {
      const centroid = new THREE.Vector3();
      let n = 0;
      for (const s of stars) {
        if (!dimmedIds.has(s.id)) { centroid.add(s.position); n++; }
      }
      if (n > 0) {
        centroid.divideScalar(n);
        const c = controlsRef.current;
        flyRef.current.start.copy(c ? c.target : ORIGIN);
        flyRef.current.target.copy(centroid);
        flyRef.current.elapsed = 0;
        flyRef.current.active = true;
      }
    }
    prevDimCountRef.current = dimCount;

    if (flyRef.current.active) {
      flyRef.current.elapsed += delta;
      const t = Math.min(flyRef.current.elapsed / FLY_DURATION, 1.0);
      const ease = 1 - Math.pow(1 - t, 3);
      const c = controlsRef.current;
      if (c) c.target.lerpVectors(flyRef.current.start, flyRef.current.target, ease);
      if (t >= 1.0) flyRef.current.active = false;
    }

    if (resetTrigger > lastResetRef.current) {
      lastResetRef.current = resetTrigger;
      flyRef.current.active = false;
    }
  });

  return null;
};

const UniverseScene: React.FC<SceneProps> = ({
  onScriptSelect, selectedStar, setSelectedStar,
  hoveredStar, setHoveredStar,
  dimmedIds, resetTrigger,
  hoverNeighborIds, connectionMode,
  hubIds, hexIds, ringIds, glowIds,
}) => {
  const timeRef = useRef(0);
  const diskSpinGroupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const resetAnimRef = useRef({ active: false, startPos: new THREE.Vector3(), elapsed: 0 });
  const lastResetRef = useRef(0);
  const layout = useMemo(() => buildGalaxyLayout(data), []);
  const [selectedAtTime, setSelectedAtTime] = useState(0);

  const handleStarClick = useCallback((star: ScriptStarLayout) => {
    setSelectedStar(prev => prev?.id === star.id ? null : star);
    setSelectedAtTime(timeRef.current);
    onScriptSelect?.(star.raw as ScriptNode);
  }, [setSelectedStar, onScriptSelect]);

  useFrame((_, delta) => {
    timeRef.current += delta;

    if (diskSpinGroupRef.current) {
      diskSpinGroupRef.current.rotation.y = timeRef.current * DISK_AUTO_ROTATION_SPEED;
    }

    // Camera reset animation (double-click)
    if (resetTrigger > lastResetRef.current) {
      lastResetRef.current = resetTrigger;
      resetAnimRef.current.active = true;
      resetAnimRef.current.startPos.copy(camera.position);
      resetAnimRef.current.elapsed = 0;
    }
    if (resetAnimRef.current.active) {
      resetAnimRef.current.elapsed += delta;
      const t = Math.min(resetAnimRef.current.elapsed / RESET_DURATION, 1.0);
      const ease = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(resetAnimRef.current.startPos, DEFAULT_CAMERA, ease);
      camera.lookAt(0, 0, 0);
      if (t >= 1.0) {
        resetAnimRef.current.active = false;
        camera.position.copy(DEFAULT_CAMERA);
        camera.lookAt(0, 0, 0);
      }
    }
  });

  return (
    <>
      <SpaceBackground />
      <ambientLight intensity={0.35} />
      <pointLight position={[0, 20, 0]} intensity={0.5} color="#c4a56e" distance={80} />

      <group rotation={[DISK_FACE_CAMERA_X_ROTATION, 0, 0]}>
        <group ref={diskSpinGroupRef}>
          {/* Theme fields: soft anchors for the integrated Task 5 layout */}
          <GalaxyFields galaxies={layout.galaxies} />

          {/* Shared-character connection beams (hover/selected local links only) */}
          <ConnectionBeams
            stars={layout.stars}
            charLinks={data.charLinks}
            timeRef={timeRef}
            showMode={connectionMode}
            hoverStar={hoveredStar}
            selectedStar={selectedStar}
          />

          {/* Script stars */}
          <ScriptStars
            stars={layout.stars}
            dimmedIds={dimmedIds}
            hoveredId={hoveredStar?.id ?? null}
            selectedId={selectedStar?.id ?? null}
            neighborIds={hoverNeighborIds}
            onHover={setHoveredStar}
            onClick={handleStarClick}
            timeRef={timeRef}
            selectedAtTime={selectedAtTime}
            hubIds={hubIds}
            hexIds={hexIds}
            ringIds={ringIds}
            glowIds={glowIds}
          />
        </group>
      </group>

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.35}
          luminanceSmoothing={0.65}
          intensity={0.7}
          radius={0.4}
        />
      </EffectComposer>
    </>
  );
};

// ── Public Component ──

interface Props {
  onScriptSelect?: (s: ScriptNode) => void;
}

const PekingOperaUniverse: React.FC<Props> = ({ onScriptSelect }) => {
  const controlsRef = useRef<any>(null);
  const [selectedStar, setSelectedStar] = useState<ScriptStarLayout | null>(null);
  const [hoveredStar, setHoveredStar] = useState<ScriptStarLayout | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>(null);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [resetTrigger, setResetTrigger] = useState(0);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>("off");
  const [showHint, setShowHint] = useState(true);

  const layout = useMemo(() => buildGalaxyLayout(data), []);
  const narrativeLayerCount = useMemo(
    () => new Set(layout.stars.map(s => s.narrType)).size,
    [layout.stars],
  );

  // ── Neighbor lookup for hover highlighting ──
  const neighborMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const link of data.charLinks) {
      const srcId = link.sourceId ?? link.source;
      const tgtId = link.targetId ?? link.target;
      if (!map.has(srcId)) map.set(srcId, new Set());
      if (!map.has(tgtId)) map.set(tgtId, new Set());
      map.get(srcId)!.add(tgtId);
      map.get(tgtId)!.add(srcId);
    }
    return map;
  }, []);

  const hoverNeighborIds = useMemo(() => {
    if (!hoveredStar) return new Set<string>();
    return neighborMap.get(hoveredStar.id) ?? new Set<string>();
  }, [hoveredStar, neighborMap]);

  // ── Fade out hint after 4 seconds ──
  React.useEffect(() => {
    if (showHint) {
      const t = setTimeout(() => setShowHint(false), 4500);
      return () => clearTimeout(t);
    }
  }, [showHint]);

  const handleDoubleClick = useCallback(() => {
    setResetTrigger(n => n + 1);
  }, []);

  // ── Prototype filter data ──
  const protoClusters = (EVD?.prototypes?.clusters || []) as any[];
  const protoAssignments: Record<string, string> = (EVD?.prototypes?.assignments || {}) as Record<string, string>;
  const protoOptions = useMemo(() => protoClusters.map((c: any) => c.label), [protoClusters]);
  const protoColors = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of protoClusters) m[c.label] = c.color;
    return m;
  }, [protoClusters]);
  // ── 5-tier star classification based on brightness percentiles ──
  const tierIds = useMemo(() => {
    const hubSet  = new Set<string>();
    const hexSet  = new Set<string>();
    const ringSet = new Set<string>();
    const glowSet = new Set<string>();

    // Collect brightness values and prototype reps
    const starBrightness: { id: string; b: number }[] = layout.stars.map(s => ({
      id: s.id, b: s.brightness,
    }));
    starBrightness.sort((a, b) => b.b - a.b);

    // Percentile thresholds — push more stars into middle tiers
    const p98 = starBrightness[Math.floor(starBrightness.length * 0.02)]?.b ?? 0.5;   // hub: top 2%
    const p85 = starBrightness[Math.floor(starBrightness.length * 0.15)]?.b ?? 0.4;   // hex: top 15%
    const p60 = starBrightness[Math.floor(starBrightness.length * 0.40)]?.b ?? 0.35;  // ring: top 40%
    const p35 = starBrightness[Math.floor(starBrightness.length * 0.65)]?.b ?? 0.30;  // glow: top 65%

    // Prototype reps get a bonus (promoted at least one tier up)
    const protoRepIds = new Set<string>();
    const protoTopIds = new Set<string>();
    for (const c of (EVD?.prototypes?.clusters || [])) {
      const reps = (c.representatives || []) as any[];
      for (const r of reps.slice(0, 3)) protoTopIds.add(r.id);
      for (const r of reps) protoRepIds.add(r.id);
    }

    for (const s of layout.stars) {
      const b = s.brightness;
      const isTopRep = protoTopIds.has(s.id);
      const isRep    = protoRepIds.has(s.id);

      if (isTopRep && b >= p85)        hubSet.add(s.id);   // top-3 proto rep + bright
      else if (b >= p98)               hubSet.add(s.id);   // top 2% overall
      else if (isRep && b >= p60)      hexSet.add(s.id);   // proto rep + moderate
      else if (b >= p85)               hexSet.add(s.id);   // top 15% overall
      else if (isRep)                  ringSet.add(s.id);  // remaining proto reps
      else if (b >= p60)               ringSet.add(s.id);  // top 40%
      else if (b >= p35)               glowSet.add(s.id);  // top 65%
      // else → normal tier
    }

    console.log(`[Tiers] hub:${hubSet.size} hex:${hexSet.size} ring:${ringSet.size} glow:${glowSet.size} normal:${layout.stars.length - hubSet.size - hexSet.size - ringSet.size - glowSet.size}`);
    return { hubIds: hubSet, hexIds: hexSet, ringIds: ringSet, glowIds: glowSet };
  }, [layout.stars]);
  const protoCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of protoClusters) m[c.label] = c.count;
    return m;
  }, [protoClusters]);

  const hubIds  = tierIds.hubIds;
  const hexIds  = tierIds.hexIds;
  const ringIds = tierIds.ringIds;
  const glowIds = tierIds.glowIds;

  // Map script id → cluster label (for fast proto filtering)
  const protoLabelById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of protoClusters) {
      for (const r of c.representatives || []) {
        m[r.id] = c.label;
      }
    }
    // also use assignments map
    for (const [sid, pid] of Object.entries(protoAssignments)) {
      if (!m[sid]) {
        const c = protoClusters.find((pc: any) => pc.id === pid);
        if (c) m[sid] = c.label;
      }
    }
    return m;
  }, [protoClusters, protoAssignments]);

  const filterOptions: string[] = filterMode === "genre"
    ? data.config.genreOrder
    : filterMode === "theme"
    ? data.config.themeOrder
    : filterMode === "narr"
    ? data.config.narrTypes
    : filterMode === "proto"
    ? protoOptions
    : [];

  const filterColors: Record<string, string> = filterMode === "genre"
    ? data.config.genreColors
    : filterMode === "theme"
    ? THEME_COLORS
    : filterMode === "narr"
    ? NARR_COLORS
    : filterMode === "proto"
    ? protoColors
    : {};

  const toggleFilter = (val: string) => {
    const next = new Set(activeFilters);
    next.has(val) ? next.delete(val) : next.add(val);
    setActiveFilters(next);
  };

  const clearFilters = () => setActiveFilters(new Set());

  const filterDimmedIds = useMemo(() => {
    if (activeFilters.size === 0)
      return new Set<string>();
    const dim = new Set<string>();
    for (const s of layout.stars) {
      let passesCategory = activeFilters.size === 0;
      if (!passesCategory) {
        passesCategory = filterMode === "genre" ? activeFilters.has(s.genre) :
          filterMode === "theme" ? s.themePresent.some(t => activeFilters.has(t)) :
          filterMode === "narr" ? activeFilters.has(s.narrType) :
          filterMode === "proto" ? activeFilters.has(protoLabelById[s.id] || "") : true;
      }
      if (!passesCategory) dim.add(s.id);
    }
    return dim;
  }, [activeFilters, filterMode, layout.stars]);

  // ── Filter statistics ──
  const filterStats = useMemo(() => {
    if (activeFilters.size === 0)
      return null;
    const visible = layout.stars.filter(s => !filterDimmedIds.has(s.id));
    if (visible.length === 0) return null;

    const avgComplexity = visible.reduce((sum, s) => sum + s.roleComplexity, 0) / visible.length;
    const avgBrightness = visible.reduce((sum, s) => sum + s.brightness, 0) / visible.length;

    // Top-3 themes among visible
    const themeCounts: Record<string, number> = {};
    for (const s of visible) {
      for (const t of s.topThemes) {
        themeCounts[t] = (themeCounts[t] || 0) + 1;
      }
    }
    const top3Themes = Object.entries(themeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    // Genre distribution among visible
    const genreCounts: Record<string, number> = {};
    for (const s of visible) {
      genreCounts[s.genre] = (genreCounts[s.genre] || 0) + 1;
    }

    // Brightest star in filter
    const brightest = visible.reduce((best, s) =>
      s.brightness > best.brightness ? s : best, visible[0]);

    return {
      visibleCount: visible.length,
      totalCount: layout.stars.length,
      avgComplexity,
      avgBrightness,
      top3Themes,
      genreCounts,
      brightest,
    };
  }, [layout.stars, filterDimmedIds, activeFilters]);

  // ── Connection mode cycle ──
  const cycleConnectionMode = useCallback(() => {
    setConnectionMode(prev =>
      prev === "off" ? "hover" : prev === "hover" ? "selected" : "off"
    );
  }, []);

  const connectionModeLabel =
    connectionMode === "off" ? "连线: 关" :
    connectionMode === "hover" ? "连线: 悬停" : "连线: 选中";

  // ── Click on filter recommendation → select that star ──
  const handleSelectRecommendation = useCallback(() => {
    if (!filterStats?.brightest) return;
    const star = layout.stars.find(s => s.titleShort === filterStats.brightest.titleShort);
    if (star) {
      setSelectedStar(star);
      onScriptSelect?.(star.raw as ScriptNode);
    }
  }, [filterStats, layout.stars, onScriptSelect]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* ── Left filter panel (bottom-left) ── */}
      <UniverseFilterPanel
        filterMode={filterMode} setFilterMode={setFilterMode}
        filterOptions={filterOptions} filterColors={filterColors}
        activeFilters={activeFilters} toggleFilter={toggleFilter} clearFilters={clearFilters}
        genreGroups={data.genreGroups} themeStats={data.themeStats} narrStats={data.narrStats}
        protoOptions={protoOptions} protoColors={protoColors} protoAssignments={protoAssignments} protoCounts={protoCounts}
        filterStats={filterStats}
        connectionMode={connectionMode} cycleConnectionMode={cycleConnectionMode}
        connectionModeLabel={connectionModeLabel}
        onSelectRecommendation={handleSelectRecommendation}
      />

      {/* ── Top-left layout legend ── */}
      <LayoutLegend
        starCount={layout.stars.length}
        galaxyCount={layout.galaxies.length}
        narrativeLayerCount={narrativeLayerCount}
      />

      <Suspense fallback={
        <div style={{
          color: "#b8926a", display: "flex", alignItems: "center", justifyContent: "center",
          height: "100%", fontFamily: '"PT Serif", serif',
        }}>
          梨园星图加载中...
        </div>
      }>
        <Canvas
          camera={{ position: [0, 0, 295], fov: 60, near: 0.5, far: 700 }}
          gl={{ antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance" }}
          dpr={[1, 1.2]}
          performance={{ min: 0.5 }}
          onDoubleClick={handleDoubleClick}
        >
          <UniverseScene
            onScriptSelect={onScriptSelect}
            selectedStar={selectedStar}
            setSelectedStar={setSelectedStar}
            hoveredStar={hoveredStar}
            setHoveredStar={setHoveredStar}
            dimmedIds={filterDimmedIds}
            resetTrigger={resetTrigger}
            hoverNeighborIds={hoverNeighborIds}
            connectionMode={connectionMode}
            hubIds={hubIds}
            hexIds={hexIds}
            ringIds={ringIds}
            glowIds={glowIds}
          />
          <FlyController
            controlsRef={controlsRef}
            stars={layout.stars}
            dimmedIds={filterDimmedIds}
            resetTrigger={resetTrigger}
          />
          <OrbitControls
            ref={controlsRef}
            enableDamping dampingFactor={0.08}
            minDistance={16} maxDistance={700}
            target={[0, 0, 0]}
          />
        </Canvas>

        {/* Double-click reset hint */}
        <div style={{
          position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
          color: "rgba(139,115,85,0.45)", fontSize: 10,
          fontFamily: '"Noto Sans SC", sans-serif',
          pointerEvents: "none", userSelect: "none", opacity: 0.7,
        }}>
          双击空白处 · 复位视角
        </div>

        {/* First-load interaction hint */}
        {showHint && (
          <div style={{
            position: "absolute", bottom: 48, left: "50%", transform: "translateX(-50%)",
            color: "rgba(196,165,110,0.72)", fontSize: 11,
            fontFamily: '"Noto Sans SC", sans-serif',
            pointerEvents: "none", userSelect: "none",
            background: "rgba(255,253,249,0.14)", borderRadius: 10,
            padding: "6px 16px", border: "1px solid rgba(184,149,109,0.12)",
            backdropFilter: "blur(8px)",
            animation: "fadeInOut 4.5s ease forwards",
          }}>
            悬停查看剧本邻居 · 点击查看详情 · 滚轮缩放 · 右键旋转
          </div>
        )}
        <style>{`@keyframes fadeInOut{0%{opacity:0}15%{opacity:1}75%{opacity:1}100%{opacity:0}}`}</style>
      </Suspense>

      {/* ── Right detail panel ── */}
      {selectedStar && (
        <RightDetailPanel
          star={selectedStar}
          onClose={() => setSelectedStar(null)}
          neighborMap={neighborMap}
          allStars={layout.stars}
        />
      )}
    </div>
  );
};

export default PekingOperaUniverse;
