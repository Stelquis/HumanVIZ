/**
 * 京剧宇宙 — Task 5 综合结构布局算法
 *
 * A script is one luminous star. Spatial position is not grouped by genre.
 * Task 5 asks for the relation among role network, theme structure, and
 * narrative structure, so those three dimensions drive the layout:
 * theme structure = bearing, role-network complexity = radius, narrative
 * type = altitude. Genre remains a color/filter/comparison variable.
 */

import * as THREE from "three";

// ═══════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════

export interface ScriptStarLayout {
  id: string;
  scriptIdx: number;
  titleShort: string;
  genre: string;
  genreColor: string;    // Muted — for UI panels (matches theme)
  starColor: string;     // Bright/saturated — for 3D star rendering
  galaxy: string;
  position: THREE.Vector3;
  starRadius: number;
  brightness: number;
  charCount: number;
  totalEdges: number;
  topChars: string[];
  topThemes: string[];
  themePresent: string[];
  roleComplexity: number;
  themeDominance: number;
  themeRichness: number;
  narrativeLayer: number;
  rhythmOffset: number;
  narrType: string;
  narrColor: string;
  roleDist: Record<string, number>;
  density: number;
  centralization: number;
  clustering: number;
  singingRatio: number;
  recitingRatio: number;
  fightingRatio: number;
  speakingRatio: number;
  sceneCount: number;
  breathPhase: number;
  raw: any;
}

export interface GalaxyLayout {
  name: string;
  color: string;
  center: THREE.Vector3;
  radius: number;
  scriptCount: number;
}

export interface UniverseLayout {
  galaxies: GalaxyLayout[];
  stars: ScriptStarLayout[];
  centerPosition: THREE.Vector3;
}

// ═══════════════════════════════════════════════════════
//  Deterministic helpers
// ═══════════════════════════════════════════════════════

const TAU = Math.PI * 2;

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hashFloat(seed: string | number): number {
  const n = typeof seed === "number" ? seed : hashString(seed);
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function polarVec(angle: number, radius: number, y = 0): THREE.Vector3 {
  return new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
}

function narrativeAltitude(type: string): number {
  switch (type) {
    case "悬念突转式": return 5.2;   // Dramatic peaks, highest layer
    case "史诗铺陈式": return 4.5;   // Grand scope, high layer
    case "多幕群像式": return 2.8;   // Distributed narrative
    case "双线交织式": return 2.2;   // Dual threads
    case "情感波浪式": return 1.0;   // Emotional journey, mid layer
    case "线性渐进式": return -0.8;  // Steady progression (default)
    case "三叠反复式": return -1.5;  // Structured repetition, lower
    case "回环照应式": return -3.4;  // Circular return
    default: return -0.8;
  }
}

function normalized(value: number, max: number): number {
  if (!Number.isFinite(value) || max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function buildThemeAnchors(themeOrder: string[]): Map<string, THREE.Vector3> {
  const anchors = new Map<string, THREE.Vector3>();
  themeOrder.forEach((theme, i) => {
    const angle = -Math.PI / 2 + (i / Math.max(themeOrder.length, 1)) * TAU;
    anchors.set(theme, polarVec(angle, 1));
  });
  return anchors;
}

function themeVectorSignature(
  script: any,
  themeAnchors: Map<string, THREE.Vector3>,
): { direction: THREE.Vector3; dominance: number; richness: number; coherence: number } {
  const weighted = new THREE.Vector3();
  const themeVector = script.themeVector || {};
  const present: string[] = script.themePresent || [];
  let weightSum = 0;
  let maxWeight = 0;

  const themes = Object.keys(themeVector).length > 0 ? Object.keys(themeVector) : present;
  for (const theme of themes) {
    const anchor = themeAnchors.get(theme);
    if (!anchor) continue;
    const weight = Number(themeVector[theme] ?? 0.65);
    weighted.add(anchor.clone().multiplyScalar(weight));
    weightSum += weight;
    maxWeight = Math.max(maxWeight, weight);
  }

  if (weightSum === 0) {
    const angle = hashFloat(script.id) * TAU;
    return {
      direction: polarVec(angle, 1),
      dominance: 0,
      richness: 0,
      coherence: 0,
    };
  }

  weighted.divideScalar(weightSum);
  const coherence = clamp01(weighted.length());
  const direction = coherence > 0.035
    ? weighted.clone().normalize()
    : polarVec(hashFloat(`${script.id}:theme-fallback`) * TAU, 1);

  return {
    direction,
    dominance: clamp01(maxWeight / weightSum),
    richness: Math.min(themes.length, 12) / 12,
    coherence,
  };
}

function roleNetworkComplexity(
  script: any,
  maxChars: number,
  maxCentralization: number,
  maxEdges: number,
): number {
  return clamp01(
    0.30 * normalized(script.charCount || 0, maxChars) +
    0.25 * clamp01(script.density || 0) +
    0.20 * normalized(script.centralization || 0, maxCentralization) +
    0.15 * clamp01(script.clustering || 0) +
    0.10 * normalized(script.totalEdges || 0, maxEdges),
  );
}

function narrativeRhythmOffset(script: any, maxScenes: number): number {
  const sceneLoad = normalized(script.sceneCount || script.totalScenes || 0, maxScenes);
  const actionLoad = clamp01((script.fightingRatio || 0) / 0.09);
  const speechLoad = clamp01(script.speakingRatio || 0);
  const singingLoad = clamp01(script.singingRatio || 0);
  return (0.44 * actionLoad + 0.28 * sceneLoad + 0.16 * singingLoad - 0.12 * speechLoad) * 2.8;
}

// ═══════════════════════════════════════════════════════════════
//  Two-arm spiral galaxy — inspired by the Whirlpool Galaxy (M51).
//  Empty centre ("black hole"), two wide winding arms 180° apart,
//  thick 3D disk, diffuse halo between arms.
// ═══════════════════════════════════════════════════════════════

const NUM_ARMS = 2;
const TOTAL_WIND = Math.PI * 4.8;   // ~2.4 rotations — open arms, distinct silhouette
const ARM_FRACTION = 0.88;          // 12% halo — tighter arm population for crisp outline

/** Thickness (Y-scale) — ultra-thin disk, spiral outline pops */
function diskThickness(radius: number, fieldRadius: number): number {
  const t = Math.min(radius / (fieldRadius * 0.5), 1);
  return (0.008 + t * 0.045) * fieldRadius;
}

function buildIntegratedPlacement(
  script: any,
  index: number,
  total: number,
  themeAnchors: Map<string, THREE.Vector3>,
  fieldRadius: number,
  maxChars: number,
  maxCentralization: number,
  maxEdges: number,
  maxScenes: number,
): {
  position: THREE.Vector3;
  roleComplexity: number;
  themeDominance: number;
  themeRichness: number;
  narrativeLayer: number;
  rhythmOffset: number;
} {
  const theme = themeVectorSignature(script, themeAnchors);
  const roleComplexity = roleNetworkComplexity(script, maxChars, maxCentralization, maxEdges);

  const h1 = hashFloat(`${script.id}:gal-type`);
  // Compact centre — smaller black hole, arms start winding closer in
  const innerRadius = fieldRadius * 0.07;

  let posX: number;
  let posZ: number;
  let posY: number;

  if (h1 < ARM_FRACTION) {
    // ── Spiral arm ──
    const armIdx = index % NUM_ARMS;
    const armBaseAngle = armIdx * Math.PI;

    // Use dataset order as a low-noise radial sequence, then add a small
    // deterministic offset. Pure hash radii make the arm contour grainy.
    const tBase = (index + 0.5) / Math.max(total, 1);
    const t = clamp01(tBase + (hashFloat(`${script.id}:arm-t`) - 0.5) / total * 18);
    const tWarped = Math.pow(t, 0.74);
    const armRadius = innerRadius + tWarped * (fieldRadius * 0.78 - innerRadius);

    // Tight spiral, minimal wiggle
    const armAngle = armBaseAngle + tWarped * TOTAL_WIND
      + (hashFloat(`${script.id}:arm-wiggle`) - 0.5) * 0.045;

    // Tighter arms — crisp spiral outline, less lateral scatter
    const armWidth = fieldRadius * (0.006 + tWarped * 0.020);
    const perpOffset = (hashFloat(`${script.id}:arm-perp`) - 0.5) * 2.5 * armWidth;
    const alongOffset = (hashFloat(`${script.id}:arm-along`) - 0.5) * fieldRadius * 0.010;
    const perpAngle = armAngle + Math.PI / 2;

    posX = Math.cos(armAngle) * (armRadius + alongOffset) + Math.cos(perpAngle) * perpOffset;
    posZ = Math.sin(armAngle) * (armRadius + alongOffset) + Math.sin(perpAngle) * perpOffset;

    const thick = diskThickness(armRadius, fieldRadius);
    posY = (hashFloat(`${script.id}:arm-y`) - 0.5) * 0.95 * thick;

  } else {
    // ── Sparse inter-arm halo — just enough to soften edges, not fill gaps ──
    const angle = hashFloat(`${script.id}:halo-a`) * TAU;
    const r = innerRadius * 0.3
      + Math.sqrt(hashFloat(`${script.id}:halo-r`)) * fieldRadius * 0.45;
    posX = Math.cos(angle) * r;
    posZ = Math.sin(angle) * r;
    const thick = diskThickness(r, fieldRadius);
    posY = (hashFloat(`${script.id}:halo-y`) - 0.5) * 1.05 * thick;
  }

  // ── Weak theme drift ──
  const themePull = theme.coherence * 0.035 * fieldRadius;
  posX += theme.direction.x * themePull;
  posZ += theme.direction.z * themePull;

  // ── Weak complexity radial bias ──
  const complexityBias = (roleComplexity - 0.48) * 0.025 * fieldRadius;
  const flatDist = Math.hypot(posX, posZ);
  if (flatDist > 0.1) {
    posX += (posX / flatDist) * complexityBias;
    posZ += (posZ / flatDist) * complexityBias;
  }

  const pos = new THREE.Vector3(posX, posY, posZ);

  // ── Soft boundary ──
  const maxDist = fieldRadius * 0.82;
  const dist = Math.hypot(pos.x, pos.z);
  if (dist > maxDist) {
    pos.x = (pos.x / dist) * maxDist;
    pos.z = (pos.z / dist) * maxDist;
  }

  // ── Narrative altitude ──
  const narrativeLayer = narrativeAltitude(script.narrType);
  const rhythmOffset = narrativeRhythmOffset(script, maxScenes);
  pos.y += narrativeLayer + rhythmOffset;

  return {
    position: pos,
    roleComplexity,
    themeDominance: theme.dominance,
    themeRichness: theme.richness,
    narrativeLayer,
    rhythmOffset,
  };
}

// ═══════════════════════════════════════════════════════
//  Main builder
// ═══════════════════════════════════════════════════════

export function buildGalaxyLayout(data: any): UniverseLayout {
  const scripts: any[] = data.scripts;
  const genreColors: Record<string, string> = data.config.genreColors;
  const themeColors: Record<string, string> = data.config.themeColors || {};
  const themeOrder: string[] = data.config.themeOrder || [];
  const maxChars = Math.max(...scripts.map((s: any) => s.charCount), 1);
  const maxCentralization = Math.max(...scripts.map((s: any) => s.centralization || 0), 1);
  const maxEdges = Math.max(...scripts.map((s: any) => s.totalEdges || 0), 1);
  const maxScenes = Math.max(...scripts.map((s: any) => s.sceneCount || s.totalScenes || 0), 1);

  // ── Wide-hue ink palette — saturated, hue-separated for small-size readability ──
  // At 8–16 px the eye discriminates by hue category (warm/cool/red/blue/green),
  // not by subtle lightness shifts. Cool tones are distinctly blue/teal;
  // warm tones span amber→red→rose→gold with deliberate spacing.
  const STAR_COLORS: Record<string, string> = {
    历史戏: "#b87838",     // warm amber
    家庭戏: "#a83830",     // clear red
    侠义戏: "#3870a8",     // distinct blue
    爱情戏: "#b84058",     // rose
    神话戏: "#389878",     // distinct teal
    公案戏: "#486888",     // slate/steel
    技法展示戏: "#b88838", // warm gold
  };

  // ── Theme fields around the map edge ──
  const FIELD_RADIUS = 225;
  const themeAnchors = buildThemeAnchors(themeOrder);
  const galaxies: GalaxyLayout[] = themeOrder.map((theme) => {
    const anchor = themeAnchors.get(theme) || new THREE.Vector3();
    const count = scripts.filter((s: any) => s.themePresent?.includes(theme)).length;
    return {
      name: theme,
      color: themeColors[theme] || "#c4a56e",
      center: anchor.clone().multiplyScalar(FIELD_RADIUS * 0.94),
      radius: 4.5 + Math.sqrt(count) * 0.14,
      scriptCount: count,
    };
  });

  const allStars: ScriptStarLayout[] = [];

  scripts.forEach((s, i) => {
    const placement = buildIntegratedPlacement(
      s, i, scripts.length, themeAnchors, FIELD_RADIUS, maxChars, maxCentralization, maxEdges, maxScenes,
    );
    allStars.push({
      id: s.id,
      scriptIdx: s.idx,
      titleShort: s.titleShort,
      genre: s.genre,
      genreColor: s.genreColor || genreColors[s.genre] || "#b8926a",
      starColor: STAR_COLORS[s.genre] || genreColors[s.genre] || "#f5c070",
      galaxy: s.topThemes?.[0] || s.themePresent?.[0] || "综合结构",
      position: placement.position,
      starRadius: 11 + Math.sqrt(s.charCount / maxChars) * 26,
      brightness: Math.max(0.22, (s as any).brightness ?? 0.35),
      charCount: s.charCount,
      totalEdges: s.totalEdges || 0,
      topChars: s.topChars,
      topThemes: s.topThemes,
      themePresent: s.themePresent,
      roleComplexity: placement.roleComplexity,
      themeDominance: placement.themeDominance,
      themeRichness: placement.themeRichness,
      narrativeLayer: placement.narrativeLayer,
      rhythmOffset: placement.rhythmOffset,
      narrType: s.narrType,
      narrColor: s.narrColor,
      roleDist: s.roleDist,
      density: s.density,
      centralization: s.centralization,
      clustering: s.clustering,
      singingRatio: s.singingRatio,
      recitingRatio: s.recitingRatio,
      fightingRatio: s.fightingRatio,
      speakingRatio: s.speakingRatio,
      sceneCount: s.sceneCount,
      breathPhase: hashFloat(`${s.id}:breath`) * TAU,
      raw: s,
    });
  });

  return {
    galaxies,
    stars: allStars,
    centerPosition: new THREE.Vector3(0, 0, 0),
  };
}

// ═══════════════════════════════════════════════════════
//  Legacy compatibility — buildUniverseLayout → buildGalaxyLayout
// ═══════════════════════════════════════════════════════

/**
 * @deprecated Use buildGalaxyLayout for the integrated Task 5 star-field layout.
 * Kept for backward compatibility with existing imports.
 */
export const buildUniverseLayout = buildGalaxyLayout;
