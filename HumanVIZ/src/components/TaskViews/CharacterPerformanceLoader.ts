/**
 * CharacterPerformanceLoader.ts
 * Data loading utility for character-performance-index.json.
 *
 * Provides:
 *   - Dynamic import of the character index (3,581 characters, ~1.4MB)
 *   - Character search with relevance scoring
 *   - Category stats extraction from task1-performance.json
 *   - Helper to build CommentaryInput from loaded data
 */

import type { Dimension, CategoryStats, CommentaryInput } from "./commentaryTemplates";

/* ── Types ── */

export interface CharacterScores {
  sing: number;
  speak: number;
  act: number;
  fight: number;
}

export interface CharacterPerformance {
  scores: CharacterScores;
  category: string;        // 生/旦/净/丑/其他
  confidence: "expert" | "script-inferred" | "no-data";
  source: string;
  scriptCount: number;
  displayName?: string;
  percentiles: Record<Dimension, number>;
}

export interface CharacterIndex {
  _meta: {
    totalCharacters: number;
    expertCharacters: number;
    scriptInferredCharacters: number;
    dimensions: Dimension[];
    dimensionLabels: Record<Dimension, string>;
    dataSources: string[];
  };
  searchOrder: string[];
  characters: Record<string, CharacterPerformance>;
}

/** Per-category stats from task1-performance.json */
export interface PerformanceStats {
  categoryProfiles: Array<{
    category: string;
    color: string;
    label: string;
    scriptCount: number;
    sing: { mean: number; sd: number };
    speak: { mean: number; sd: number };
    act: { mean: number; sd: number };
    fight: { mean: number; sd: number };
  }>;
  globalStats: Record<Dimension, {
    mean: number; sd: number; median: number;
    min: number; max: number; nonzeroPct: number;
  }>;
  anova: Record<string, { F: number; dfBetween: number; dfWithin: number; p: number; etaSq: number; sig: string }>;
  pairwiseDiffs: Array<any>;
  correlations: Array<{ dim1: string; dim2: string; r: number; interpretation: string }>;
}

/* ── Module-level cache ── */

let _cachedIndex: CharacterIndex | null = null;
let _cachedStats: PerformanceStats | null = null;

/** Normalization parameters from the character index (set after loading). */
let _normParams: {
  power: number;
  target: number;
} | null = null;

/** P99 reference values for act/fight rescaling (derived from character index). */
let _normP99: Record<string, number> = {};

/* ── Normalization helpers ── */

/**
 * Apply the sqrt-based rescaling to a raw act/fight value.
 * Uses the same formula as build_character_index.py:
 *   normalized = min(1.0, (raw / P99) ** power * target)
 */
function normalizeScore(raw: number, dim: string): number {
  if (!_normParams) return raw; // normalization not yet loaded
  const p99 = _normP99[dim];
  if (!p99 || p99 <= 0) return raw;
  if (raw <= 0) return 0;
  const normalized = (raw / p99) ** _normParams.power * _normParams.target;
  return Math.min(1.0, Math.round(normalized * 10000) / 10000);
}

/* ── Loaders ── */

/** Load the character performance index (cached). */
export async function loadCharacterIndex(): Promise<CharacterIndex> {
  if (_cachedIndex) return _cachedIndex;
  const mod = await import("../../data/character-performance-index.json") as unknown as CharacterIndex;
  _cachedIndex = mod;

  // Store normalization parameters for use in category stats rescaling
  if (mod._meta && (mod._meta as any).normalization) {
    const norm = (mod._meta as any).normalization;
    _normParams = {
      power: norm.power || 0.5,
      target: norm.target || 0.75,
    };
    // Use raw P99 values stored by the build script (before normalization was applied)
    if (norm.p99Raw) {
      for (const dim of Object.keys(norm.p99Raw)) {
        _normP99[dim] = norm.p99Raw[dim];
      }
    }
  }

  return mod;
}

/** Load category/global stats from task1-performance.json (cached). */
export async function loadPerformanceStats(): Promise<PerformanceStats> {
  if (_cachedStats) return _cachedStats;
  const mod = await import("../../data/task1-performance.json") as unknown as PerformanceStats;
  _cachedStats = mod;
  return mod;
}

/* ── Search ── */

export interface SearchResult {
  name: string;
  displayName: string;
  category: string;
  confidence: "expert" | "script-inferred" | "no-data";
  scriptCount: number;
  /** Score for sorting: higher = better match */
  relevance: number;
}

/**
 * Search characters by name fragment.
 * Returns top matches sorted by relevance (expert > script-inferred, then by scriptCount).
 */
export function searchCharacters(
  query: string,
  index: CharacterIndex,
  limit: number = 15,
): SearchResult[] {
  const q = query.trim().toLowerCase();
  const { characters, searchOrder } = index;

  if (!q) {
    // No query: return top characters (experts first, then high scriptCount)
    return searchOrder.slice(0, limit).map(name => ({
      name,
      displayName: characters[name].displayName || name,
      category: characters[name].category,
      confidence: characters[name].confidence,
      scriptCount: characters[name].scriptCount,
      relevance: characters[name].confidence === "expert" ? 3 : 2,
    }));
  }

  const results: SearchResult[] = [];

  for (const name of searchOrder) {
    const char = characters[name];
    const displayName = char.displayName || name;

    // Match against both formal and display names
    const nameMatch = name.includes(q);
    const displayMatch = displayName !== name && displayName.includes(q);

    if (nameMatch || displayMatch) {
      // Relevance scoring:
      // - Exact match: highest
      // - Prefix match: high
      // - Contains match: medium
      // - Expert bonus: +3
      let relevance = 0;
      if (name === q || displayName === q) relevance = 10;
      else if (name.startsWith(q) || displayName.startsWith(q)) relevance = 8;
      else relevance = 5;

      if (char.confidence === "expert") relevance += 3;
      relevance += Math.min(char.scriptCount / 10, 2); // up to +2 for high script count

      results.push({
        name,
        displayName,
        category: char.category,
        confidence: char.confidence,
        scriptCount: char.scriptCount,
        relevance,
      });
    }
  }

  // Sort by relevance descending, then by name
  results.sort((a, b) => b.relevance - a.relevance || a.displayName.localeCompare(b.displayName));
  return results.slice(0, limit);
}

/* ── Commentary input builder ── */

/**
 * Build a CommentaryInput from a character's performance data and stats.
 */
export function buildCommentaryInput(
  charName: string,
  char: CharacterPerformance,
  stats: PerformanceStats,
): CommentaryInput {
  // Find the category profile
  const catProfile = stats.categoryProfiles.find(cp => cp.category === char.category);

  // Build category stats (fall back to global if category not found, e.g., "其他")
  const rawCategoryStats: Record<Dimension, CategoryStats> = {
    sing: catProfile
      ? { mean: catProfile.sing.mean, sd: catProfile.sing.sd }
      : { mean: stats.globalStats.sing.mean, sd: stats.globalStats.sing.sd },
    speak: catProfile
      ? { mean: catProfile.speak.mean, sd: catProfile.speak.sd }
      : { mean: stats.globalStats.speak.mean, sd: stats.globalStats.speak.sd },
    act: catProfile
      ? { mean: catProfile.act.mean, sd: catProfile.act.sd }
      : { mean: stats.globalStats.act.mean, sd: stats.globalStats.act.sd },
    fight: catProfile
      ? { mean: catProfile.fight.mean, sd: catProfile.fight.sd }
      : { mean: stats.globalStats.fight.mean, sd: stats.globalStats.fight.sd },
  };

  // Apply the same sqrt normalization to category reference means/sds
  // for act/fight, so z-scores are computed against correctly-scaled references
  const RESCALE_DIMS: Dimension[] = ["act", "fight"];
  const categoryStats: Record<Dimension, CategoryStats> = { ...rawCategoryStats };
  for (const dim of RESCALE_DIMS) {
    if (_normParams) {
      categoryStats[dim] = {
        mean: normalizeScore(rawCategoryStats[dim].mean, dim),
        sd: normalizeScore(rawCategoryStats[dim].sd, dim),
      };
    }
  }

  const rawGlobalStats: Record<Dimension, { mean: number; sd: number }> = {
    sing: { mean: stats.globalStats.sing.mean, sd: stats.globalStats.sing.sd },
    speak: { mean: stats.globalStats.speak.mean, sd: stats.globalStats.speak.sd },
    act: { mean: stats.globalStats.act.mean, sd: stats.globalStats.act.sd },
    fight: { mean: stats.globalStats.fight.mean, sd: stats.globalStats.fight.sd },
  };

  const globalStats: Record<Dimension, { mean: number; sd: number }> = { ...rawGlobalStats };
  for (const dim of RESCALE_DIMS) {
    if (_normParams) {
      globalStats[dim] = {
        mean: normalizeScore(rawGlobalStats[dim].mean, dim),
        sd: normalizeScore(rawGlobalStats[dim].sd, dim),
      };
    }
  }

  return {
    charName,
    displayName: char.displayName,
    isExpert: char.confidence === "expert",
    category: char.category,
    scriptCount: char.scriptCount,
    scores: char.scores,
    percentiles: char.percentiles,
    categoryStats,
    globalStats,
  };
}

/**
 * Get category color for display purposes.
 */
export function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    "生": "#b89b6d",
    "旦": "#96544d",
    "净": "#5e6b76",
    "丑": "#7f968d",
    "其他": "#8a939b",
  };
  return colors[category] || "#8a939b";
}

/**
 * Get category display name.
 */
export function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    "生": "生行",
    "旦": "旦行",
    "净": "净行",
    "丑": "丑行",
    "其他": "未归类",
  };
  return labels[category] || category;
}
