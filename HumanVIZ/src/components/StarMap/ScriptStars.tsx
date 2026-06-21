/**
 * 剧本恒星 — 1473 颗径向发光星体
 *
 * Each script is rendered as a soft sprite with a bright core and
 * feathered halo. The sprites billboard to face the camera. Animation
 * includes subtle breathing and twinkle, with stronger glow for
 * hovered, selected, and neighbor stars.
 */
import React, { useMemo, useRef, useCallback } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { ScriptStarLayout } from "./UniverseLayout";

interface Props {
  stars: ScriptStarLayout[];
  dimmedIds: Set<string>;
  hoveredId: string | null;
  selectedId: string | null;
  neighborIds?: Set<string>;
  onHover: (star: ScriptStarLayout | null) => void;
  onClick: (star: ScriptStarLayout) => void;
  timeRef: React.MutableRefObject<number>;
  selectedAtTime: number;
  /** Star IDs that get the 5-tier visual design */
  hubIds?: Set<string>;   // cross flare — anchor stars
  hexIds?: Set<string>;   // hexagonal crystal — important
  ringIds?: Set<string>;  // ringed planet — notable
  glowIds?: Set<string>;  // soft wide glow — above average
}

// Reduced amplitudes for a subtler organic feel (per design doc guidance)
const BREATH_PERIOD_MIN = 3.0;
const BREATH_PERIOD_MAX = 6.0;
const BREATH_AMPLITUDE = 0.06;
const TWINKLE_FREQ_BASE = 5.5;
const TWINKLE_FREQ_RANGE = 4.2;
const TWINKLE_AMPLITUDE = 0.04;

function hashFloat(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function createNormalStarTexture(): THREE.CanvasTexture {
  const size = 128; const c = size / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);

  const body = ctx.createRadialGradient(c, c, 0, c, c, c);
  body.addColorStop(0.00, "rgba(255,255,255,0.95)");
  body.addColorStop(0.03, "rgba(255,255,255,0.72)");
  body.addColorStop(0.12, "rgba(200,200,200,1.0)");
  body.addColorStop(0.25, "rgba(140,140,140,0.85)");
  body.addColorStop(0.40, "rgba(75,75,75,0.48)");
  body.addColorStop(0.55, "rgba(30,30,30,0.12)");
  body.addColorStop(0.72, "rgba(8,8,8,0.02)");
  body.addColorStop(1.00, "rgba(0,0,0,0)");
  ctx.fillStyle = body; ctx.fillRect(0, 0, size, size);

  const core = ctx.createRadialGradient(c, c, 0, c, c, size * 0.04);
  core.addColorStop(0, "rgba(255,255,255,1)");
  core.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = core; ctx.fillRect(0, 0, size, size);

  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}

function createPlanetStarTexture(): THREE.CanvasTexture {
  const size = 128; const c = size / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);

  // Core body — brighter, wider
  const body = ctx.createRadialGradient(c, c, 0, c, c, c);
  body.addColorStop(0.00, "rgba(255,255,255,1.0)");
  body.addColorStop(0.04, "rgba(255,255,255,0.85)");
  body.addColorStop(0.18, "rgba(220,220,220,1.0)");
  body.addColorStop(0.38, "rgba(160,160,160,0.82)");
  // — ring gap —
  body.addColorStop(0.44, "rgba(40,40,40,0.15)");
  body.addColorStop(0.50, "rgba(20,20,20,0.08)");
  // — outer ring —
  body.addColorStop(0.56, "rgba(140,140,140,0.55)");
  body.addColorStop(0.62, "rgba(100,100,100,0.30)");
  body.addColorStop(0.72, "rgba(30,30,30,0.08)");
  body.addColorStop(1.00, "rgba(0,0,0,0)");
  ctx.fillStyle = body; ctx.fillRect(0, 0, size, size);

  // Bright core pin
  const core = ctx.createRadialGradient(c, c, 0, c, c, size * 0.06);
  core.addColorStop(0, "rgba(255,255,255,1)");
  core.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = core; ctx.fillRect(0, 0, size, size);

  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}

function createHubStarTexture(): THREE.CanvasTexture {
  const size = 128; const c = size / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);

  // Radial core — extra bright
  const body = ctx.createRadialGradient(c, c, 0, c, c, c);
  body.addColorStop(0.00, "rgba(255,255,255,1.0)");
  body.addColorStop(0.05, "rgba(255,255,255,0.92)");
  body.addColorStop(0.20, "rgba(235,235,235,0.95)");
  body.addColorStop(0.40, "rgba(170,170,170,0.60)");
  body.addColorStop(0.55, "rgba(60,60,60,0.18)");
  body.addColorStop(0.75, "rgba(10,10,10,0.03)");
  body.addColorStop(1.00, "rgba(0,0,0,0)");
  ctx.fillStyle = body; ctx.fillRect(0, 0, size, size);

  // ── 4-point cross flare ──
  ctx.globalCompositeOperation = "lighter";
  const flare = ctx.createRadialGradient(c, c, 0, c, c, c);
  flare.addColorStop(0, "rgba(255,255,255,0.0)");
  flare.addColorStop(0.15, "rgba(255,255,255,0.0)");
  flare.addColorStop(0.30, "rgba(255,255,255,0.55)");
  flare.addColorStop(0.45, "rgba(255,255,255,0.70)");
  flare.addColorStop(0.60, "rgba(220,220,255,0.35)");
  flare.addColorStop(0.80, "rgba(160,180,255,0.06)");
  flare.addColorStop(1.00, "rgba(0,0,0,0)");

  // Draw cross arms
  const armW = size * 0.06;
  ctx.save();
  ctx.fillStyle = flare;
  // horizontal
  ctx.fillRect(c - size * 0.45, c - armW / 2, size * 0.9, armW);
  // vertical
  ctx.fillRect(c - armW / 2, c - size * 0.45, armW, size * 0.9);
  ctx.restore();
  ctx.globalCompositeOperation = "source-over";

  // Re-apply bright core on top of cross
  const core2 = ctx.createRadialGradient(c, c, 0, c, c, size * 0.08);
  core2.addColorStop(0, "rgba(255,255,255,1)");
  core2.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = core2; ctx.fillRect(0, 0, size, size);

  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}

function createGlowStarTexture(): THREE.CanvasTexture {
  const size = 128; const c = size / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);

  // Soft wide body — wider color band, gentler falloff
  const body = ctx.createRadialGradient(c, c, 0, c, c, c);
  body.addColorStop(0.00, "rgba(255,255,255,0.90)");
  body.addColorStop(0.05, "rgba(255,255,255,0.65)");
  body.addColorStop(0.18, "rgba(220,220,220,0.92)");
  body.addColorStop(0.35, "rgba(160,160,160,0.70)");
  body.addColorStop(0.52, "rgba(90,90,90,0.32)");
  body.addColorStop(0.68, "rgba(30,30,30,0.06)");
  body.addColorStop(1.00, "rgba(0,0,0,0)");
  ctx.fillStyle = body; ctx.fillRect(0, 0, size, size);

  const core = ctx.createRadialGradient(c, c, 0, c, c, size * 0.05);
  core.addColorStop(0, "rgba(255,255,255,1)");
  core.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = core; ctx.fillRect(0, 0, size, size);

  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}

function createHexStarTexture(): THREE.CanvasTexture {
  const size = 128; const c = size / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);

  // Radial core body
  const body = ctx.createRadialGradient(c, c, 0, c, c, c);
  body.addColorStop(0.00, "rgba(255,255,255,1.0)");
  body.addColorStop(0.04, "rgba(255,255,255,0.88)");
  body.addColorStop(0.16, "rgba(225,225,225,0.92)");
  body.addColorStop(0.32, "rgba(155,155,155,0.65)");
  body.addColorStop(0.48, "rgba(55,55,55,0.20)");
  body.addColorStop(0.66, "rgba(10,10,10,0.03)");
  body.addColorStop(1.00, "rgba(0,0,0,0)");
  ctx.fillStyle = body; ctx.fillRect(0, 0, size, size);

  // Hexagonal outline glow
  ctx.save();
  ctx.strokeStyle = "rgba(200,200,200,0.28)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const hexR = c * 0.55;
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = c + Math.cos(angle) * hexR;
    const y = c + Math.sin(angle) * hexR;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.stroke();
  // Soft fill inside hex
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fill();
  ctx.restore();

  // Central bright core
  const core = ctx.createRadialGradient(c, c, 0, c, c, size * 0.07);
  core.addColorStop(0, "rgba(255,255,255,1)");
  core.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = core; ctx.fillRect(0, 0, size, size);

  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}

// ── helpers for per-instance animation ──
function buildAnimData(n: number, stars: ScriptStarLayout[]) {
  const baseColors: THREE.Color[] = [];
  const baseSizes = new Float32Array(n);
  const animParams: { breathPeriod: number; twinkleFreq: number }[] = [];
  for (let i = 0; i < n; i++) {
    const star = stars[i];
    baseColors.push(new THREE.Color(star.starColor));
    baseSizes[i] = 1.05 + star.starRadius * 0.15;
    animParams.push({
      breathPeriod: BREATH_PERIOD_MIN + hashFloat(i * 3 + 7) * (BREATH_PERIOD_MAX - BREATH_PERIOD_MIN),
      twinkleFreq: TWINKLE_FREQ_BASE + hashFloat(i * 11 + 3) * TWINKLE_FREQ_RANGE,
    });
  }
  return { baseColors, baseSizes, animParams };
}

function updateStarFrame(opts: {
  mesh: THREE.InstancedMesh;
  stars: ScriptStarLayout[];
  dummy: THREE.Object3D;
  baseColors: THREE.Color[];
  baseSizes: Float32Array;
  animParams: { breathPeriod: number; twinkleFreq: number }[];
  localBillboardQuat: THREE.Quaternion;
  t: number;
  dimmedIds: Set<string>;
  hoveredId: string | null;
  selectedId: string | null;
  neighborIds?: Set<string>;
  selectedAtTime: number;
  tierScale: number;  // size multiplier for this tier
}) {
  const { mesh, stars: tierStars, dummy, baseColors, baseSizes, animParams,
          localBillboardQuat, t, dimmedIds, hoveredId, selectedId,
          neighborIds, selectedAtTime, tierScale } = opts;
  const n = tierStars.length;
  for (let i = 0; i < n; i++) {
    const star = tierStars[i];
    const dimmed = dimmedIds.has(star.id);
    const hovered = star.id === hoveredId;
    const selected = star.id === selectedId;
    const isNeighbor = neighborIds?.has(star.id) ?? false;
    const ap = animParams[i];

    const breath = 1 + Math.sin(t * (2 * Math.PI) / ap.breathPeriod + star.breathPhase) * BREATH_AMPLITUDE;
    const twinkle = 1 + Math.sin(t * ap.twinkleFreq + star.breathPhase * 2.1) * TWINKLE_AMPLITUDE;
    const baseGlow = 1.0 + star.brightness * 1.4;

    let glow = baseGlow * breath * twinkle;
    let size = baseSizes[i] * (1.05 + star.brightness * 0.42) * breath * tierScale;

    if (dimmed) {
      glow = 0.20;
      size *= 0.58;
    } else if (selected) {
      const sinceSelected = Math.max(0, t - selectedAtTime);
      const flashDecay = Math.max(0, 1 - sinceSelected / 0.8);
      glow = baseGlow * (3.5 + Math.sin(t * 4.2 + star.breathPhase) * 0.55) * (1 + flashDecay * 3.5);
      size *= (2.5 + Math.sin(t * 4.2 + star.breathPhase) * 0.25 + flashDecay * 0.8);
    } else if (hovered) {
      glow = baseGlow * 2.8;
      size *= 2.2;
    } else if (isNeighbor) {
      glow = baseGlow * (2.0 + Math.sin(t * 3.2 + star.breathPhase) * 0.15);
      size *= 1.45;
    }

    mesh.setColorAt(i, baseColors[i].clone().multiplyScalar(glow));
    dummy.position.copy(star.position);
    dummy.quaternion.copy(localBillboardQuat);
    dummy.scale.setScalar(size);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

const ScriptStars: React.FC<Props> = ({
  stars, dimmedIds, hoveredId, selectedId,
  neighborIds, onHover, onClick, timeRef, selectedAtTime,
  hubIds, hexIds, ringIds, glowIds,
}) => {
  const hubMeshRef   = useRef<THREE.InstancedMesh>(null);
  const hexMeshRef   = useRef<THREE.InstancedMesh>(null);
  const ringMeshRef  = useRef<THREE.InstancedMesh>(null);
  const glowMeshRef  = useRef<THREE.InstancedMesh>(null);
  const normalMeshRef = useRef<THREE.InstancedMesh>(null);
  const inverseParentQuatRef = useRef(new THREE.Quaternion());
  const localBillboardQuatRef = useRef(new THREE.Quaternion());
  const { camera } = useThree();

  const texNormal = useMemo(() => createNormalStarTexture(), []);
  const texGlow   = useMemo(() => createGlowStarTexture(), []);
  const texRing   = useMemo(() => createPlanetStarTexture(), []);
  const texHex    = useMemo(() => createHexStarTexture(), []);
  const texHub    = useMemo(() => createHubStarTexture(), []);

  const makeMat = (tex: THREE.Texture) => new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0.94,
    blending: THREE.NormalBlending, depthWrite: false, depthTest: false, toneMapped: false,
  });
  const matNormal = useMemo(() => makeMat(texNormal), [texNormal]);
  const matGlow   = useMemo(() => makeMat(texGlow),   [texGlow]);
  const matRing   = useMemo(() => makeMat(texRing),   [texRing]);
  const matHex    = useMemo(() => makeMat(texHex),    [texHex]);
  const matHub    = useMemo(() => makeMat(texHub),    [texHub]);

  // ── 5-tier classification ──
  type TierKey = "hub" | "hex" | "ring" | "glow" | "normal";
  const { starsByTier, starToGlobalIdx, animByTier, dummy } = useMemo(() => {
    const hSet  = hubIds  ?? new Set<string>();
    const hxSet = hexIds  ?? new Set<string>();
    const rSet  = ringIds ?? new Set<string>();
    const gSet  = glowIds ?? new Set<string>();
    const byTier: Record<TierKey, ScriptStarLayout[]> = { hub:[], hex:[], ring:[], glow:[], normal:[] };
    const idxMap: Record<TierKey, number[]> = { hub:[], hex:[], ring:[], glow:[], normal:[] };

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      if (hSet.has(s.id))           { byTier.hub.push(s);    idxMap.hub.push(i); }
      else if (hxSet.has(s.id))     { byTier.hex.push(s);    idxMap.hex.push(i); }
      else if (rSet.has(s.id))      { byTier.ring.push(s);   idxMap.ring.push(i); }
      else if (gSet.has(s.id))      { byTier.glow.push(s);   idxMap.glow.push(i); }
      else                          { byTier.normal.push(s); idxMap.normal.push(i); }
    }

    return {
      starsByTier: byTier, starToGlobalIdx: idxMap,
      animByTier: {
        hub:    buildAnimData(byTier.hub.length, byTier.hub),
        hex:    buildAnimData(byTier.hex.length, byTier.hex),
        ring:   buildAnimData(byTier.ring.length, byTier.ring),
        glow:   buildAnimData(byTier.glow.length, byTier.glow),
        normal: buildAnimData(byTier.normal.length, byTier.normal),
      },
      dummy: new THREE.Object3D(),
    };
  }, [stars, hubIds, hexIds, ringIds, glowIds]);

  // ── Unified intersection → star lookup ──
  // (refs are stable per React semantics — access .current at call time, not dep time)
  const findNearestStar = useCallback((e: any): ScriptStarLayout | null => {
    const intersections = e.intersections || [];
    for (const hit of intersections) {
      const iid = hit.instanceId as number | undefined;
      if (iid === undefined) continue;
      const obj = hit.object as THREE.InstancedMesh;
      if (obj === hubMeshRef.current && iid < starsByTier.hub.length) {
        const star = stars[starToGlobalIdx.hub[iid]];
        if (!dimmedIds.has(star.id)) return star;
      } else if (obj === hexMeshRef.current && iid < starsByTier.hex.length) {
        const star = stars[starToGlobalIdx.hex[iid]];
        if (!dimmedIds.has(star.id)) return star;
      } else if (obj === ringMeshRef.current && iid < starsByTier.ring.length) {
        const star = stars[starToGlobalIdx.ring[iid]];
        if (!dimmedIds.has(star.id)) return star;
      } else if (obj === glowMeshRef.current && iid < starsByTier.glow.length) {
        const star = stars[starToGlobalIdx.glow[iid]];
        if (!dimmedIds.has(star.id)) return star;
      } else if (obj === normalMeshRef.current && iid < starsByTier.normal.length) {
        const star = stars[starToGlobalIdx.normal[iid]];
        if (!dimmedIds.has(star.id)) return star;
      }
    }
    return null;
  }, [stars, dimmedIds, starsByTier, starToGlobalIdx]);

  const handlePointerMove = useCallback((e: any) => {
    e.stopPropagation();
    onHover(findNearestStar(e));
  }, [findNearestStar, onHover]);
  const handlePointerOut = useCallback(() => { onHover(null); }, [onHover]);
  const handleClick = useCallback((e: any) => {
    e.stopPropagation();
    const star = findNearestStar(e);
    if (star) onClick(star);
  }, [findNearestStar, onClick]);

  // ── Animation ──
  useFrame(() => {
    const t = timeRef.current;
    const parentQuat = new THREE.Quaternion();
    hubMeshRef.current?.parent?.getWorldQuaternion(parentQuat);
    parentQuat.invert();
    localBillboardQuatRef.current.copy(parentQuat).multiply(camera.quaternion);

    const frameOpts = {
      dummy, localBillboardQuat: localBillboardQuatRef.current, t,
      dimmedIds, hoveredId, selectedId, neighborIds, selectedAtTime,
    };

    if (hubMeshRef.current && starsByTier.hub.length > 0)
      updateStarFrame({ mesh: hubMeshRef.current, stars: starsByTier.hub, tierScale: 1.8, ...animByTier.hub, ...frameOpts });
    if (hexMeshRef.current && starsByTier.hex.length > 0)
      updateStarFrame({ mesh: hexMeshRef.current, stars: starsByTier.hex, tierScale: 2.0, ...animByTier.hex, ...frameOpts });
    if (ringMeshRef.current && starsByTier.ring.length > 0)
      updateStarFrame({ mesh: ringMeshRef.current, stars: starsByTier.ring, tierScale: 1.6, ...animByTier.ring, ...frameOpts });
    if (glowMeshRef.current && starsByTier.glow.length > 0)
      updateStarFrame({ mesh: glowMeshRef.current, stars: starsByTier.glow, tierScale: 1.25, ...animByTier.glow, ...frameOpts });
    if (normalMeshRef.current && starsByTier.normal.length > 0)
      updateStarFrame({ mesh: normalMeshRef.current, stars: starsByTier.normal, tierScale: 1.0, ...animByTier.normal, ...frameOpts });
  });

  const sharedEvtHandlers = useMemo(() =>
    ({ onPointerMove: handlePointerMove, onPointerOut: handlePointerOut, onClick: handleClick }),
  [handlePointerMove, handlePointerOut, handleClick]);
  const sharedMeshProps = { frustumCulled: false, renderOrder: 10 } as const;

  return (
    <>
      {starsByTier.hub.length > 0 && (
        <instancedMesh ref={hubMeshRef} args={[undefined, undefined, starsByTier.hub.length]} {...sharedEvtHandlers} {...sharedMeshProps}>
          <planeGeometry args={[1, 1]} /><primitive object={matHub} attach="material" />
        </instancedMesh>
      )}
      {starsByTier.hex.length > 0 && (
        <instancedMesh ref={hexMeshRef} args={[undefined, undefined, starsByTier.hex.length]} {...sharedEvtHandlers} {...sharedMeshProps}>
          <planeGeometry args={[1, 1]} /><primitive object={matHex} attach="material" />
        </instancedMesh>
      )}
      {starsByTier.ring.length > 0 && (
        <instancedMesh ref={ringMeshRef} args={[undefined, undefined, starsByTier.ring.length]} {...sharedEvtHandlers} {...sharedMeshProps}>
          <planeGeometry args={[1, 1]} /><primitive object={matRing} attach="material" />
        </instancedMesh>
      )}
      {starsByTier.glow.length > 0 && (
        <instancedMesh ref={glowMeshRef} args={[undefined, undefined, starsByTier.glow.length]} {...sharedEvtHandlers} {...sharedMeshProps}>
          <planeGeometry args={[1, 1]} /><primitive object={matGlow} attach="material" />
        </instancedMesh>
      )}
      <instancedMesh ref={normalMeshRef} args={[undefined, undefined, starsByTier.normal.length]} {...sharedEvtHandlers} {...sharedMeshProps}>
        <planeGeometry args={[1, 1]} /><primitive object={matNormal} attach="material" />
      </instancedMesh>
    </>
  );
};

export default ScriptStars;
