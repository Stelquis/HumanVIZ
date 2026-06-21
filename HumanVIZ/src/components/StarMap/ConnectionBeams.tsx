/**
 * 共享角色光桥连线 — 按模式显示局部角色关联
 *
 * Modes:
 *   "off"      – 不渲染连线（默认）
 *   "hover"    – 仅显示悬停星的共享角色邻居连线
 *   "selected" – 仅显示选中星的共享角色邻居连线
 *
 * Builds a neighbor index once so per-star lookup is O(1).
 */
import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { ScriptStarLayout } from "./UniverseLayout";

export type ConnectionMode = "off" | "hover" | "selected";

interface Props {
  stars: ScriptStarLayout[];
  charLinks: any[];
  timeRef: React.MutableRefObject<number>;
  showMode: ConnectionMode;
  hoverStar: ScriptStarLayout | null;
  selectedStar: ScriptStarLayout | null;
}

const ConnectionBeams: React.FC<Props> = ({
  stars, charLinks, timeRef, showMode, hoverStar, selectedStar,
}) => {
  const linesRef = useRef<THREE.LineSegments | null>(null);
  const opacityRef = useRef(0); // smooth lerp target

  // ── Star id → index lookup ──
  const starIdxMap = useMemo(() => {
    const m = new Map<string, number>();
    stars.forEach((s, i) => m.set(s.id, i));
    return m;
  }, [stars]);

  // ── Neighbor index: scriptId → Set of neighbor scriptIds ──
  const neighborIndex = useMemo(() => {
    const idx = new Map<string, { neighborId: string; sharedCount: number }[]>();
    for (const link of charLinks) {
      const srcId = link.sourceId ?? link.source;
      const tgtId = link.targetId ?? link.target;
      if (!starIdxMap.has(srcId) || !starIdxMap.has(tgtId)) continue;
      const sc = link.sharedCount ?? 1;
      if (!idx.has(srcId)) idx.set(srcId, []);
      if (!idx.has(tgtId)) idx.set(tgtId, []);
      idx.get(srcId)!.push({ neighborId: tgtId, sharedCount: sc });
      idx.get(tgtId)!.push({ neighborId: srcId, sharedCount: sc });
    }
    return idx;
  }, [charLinks, starIdxMap]);

  // ── Build line geometry based on current mode ──
  const { positions, colors } = useMemo(() => {
    const targetStar =
      showMode === "hover" ? hoverStar :
      showMode === "selected" ? selectedStar : null;

    if (!targetStar || showMode === "off") {
      return { positions: new Float32Array(0), colors: new Float32Array(0) };
    }

    const neighbors = neighborIndex.get(targetStar.id);
    if (!neighbors || neighbors.length === 0) {
      return { positions: new Float32Array(0), colors: new Float32Array(0) };
    }

    const targetIdx = starIdxMap.get(targetStar.id);
    if (targetIdx === undefined) {
      return { positions: new Float32Array(0), colors: new Float32Array(0) };
    }

    const tp = stars[targetIdx].position;

    const pos = new Float32Array(neighbors.length * 6);
    const col = new Float32Array(neighbors.length * 6);

    for (let i = 0; i < neighbors.length; i++) {
      const n = neighbors[i];
      const ni = starIdxMap.get(n.neighborId);
      if (ni === undefined) continue;
      const np = stars[ni].position;

      pos[i * 6] = tp.x;     pos[i * 6 + 1] = tp.y;     pos[i * 6 + 2] = tp.z;
      pos[i * 6 + 3] = np.x; pos[i * 6 + 4] = np.y; pos[i * 6 + 5] = np.z;

      // Color from neighbor star, with alpha proportional to sharedCount
      const nc = new THREE.Color(stars[ni].starColor);
      col[i * 6] = nc.r; col[i * 6 + 1] = nc.g; col[i * 6 + 2] = nc.b;
      col[i * 6 + 3] = nc.r; col[i * 6 + 4] = nc.g; col[i * 6 + 5] = nc.b;
    }

    return { positions: pos, colors: col };
  }, [showMode, hoverStar, selectedStar, neighborIndex, stars, starIdxMap]);

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, [positions, colors]);

  useFrame(() => {
    if (!linesRef.current) return;
    const targetBase = showMode === "off" ? 0 : showMode === "hover" ? 0.68 : 0.78;
    const target = targetBase + Math.sin(timeRef.current * 0.7) * 0.05;
    // Gentle lerp — visibly fades in over ~30 frames
    const prev = opacityRef.current;
    const lerpFactor = target > prev ? 0.10 : 0.08;
    opacityRef.current = prev + (target - prev) * lerpFactor;
    (linesRef.current.material as THREE.LineBasicMaterial).opacity = opacityRef.current;
  });

  const segments = positions.length / 6;
  // Always render (with empty geom if no beams) so opacity can lerp to 0;
  // only truly unmount when fully faded out
  if (segments === 0 && opacityRef.current < 0.002) return null;

  return (
    <lineSegments ref={linesRef} geometry={geom}>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={0.65}
        depthWrite={false}
        blending={THREE.NormalBlending}
        toneMapped={false}
      />
    </lineSegments>
  );
};

export default ConnectionBeams;
