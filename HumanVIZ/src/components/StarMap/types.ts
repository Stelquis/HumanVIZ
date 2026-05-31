/** Types for the 梨园星图 (Pear Garden Star Map) visualization */

export interface StarMapConfig {
  genreOrder: string[];
  genreColors: Record<string, string>;
  roleColors: Record<string, string>;
  themeColors: Record<string, string>;
  themeOrder: string[];
  narrColors: Record<string, string>;
  narrTypes: string[];
}

export interface ScriptNode {
  id: string;
  idx: number;
  title: string;
  titleShort: string;
  genre: string;
  genreColor: string;
  sourceCategory: string;
  charCount: number;
  topChars: string[];
  topThemes: string[];
  themeVector: Record<string, number>;
  themePresent: string[];
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
  totalScenes: number;
  totalEdges: number;
  // Computed during layout
  x?: number;
  y?: number;
  r?: number;
  layer?: number;
}

export interface CharLink {
  source: number;
  target: number;
  sourceId: string;
  targetId: string;
  sharedChars: string[];
  sharedCount: number;
  totalWeight: number;
}

export interface ThemeLink {
  source: number;
  target: number;
  sharedThemes: string[];
  count: number;
}

export interface GenreGroup {
  name: string;
  color: string;
  count: number;
  indices: number[];
}

export interface GenreCharacter {
  name: string;
  scripts: number;
  totalDegree: number;
  role: string;
  roleColor: string;
}

export interface ThemeStat {
  name: string;
  color: string;
  count: number;
  ratio: number;
}

export interface NarrStat {
  name: string;
  color: string;
  count: number;
}

export interface StarMapData {
  meta: {
    totalScripts: number;
    totalCharLinks: number;
    totalThemeLinks: number;
    generatedAt: string;
  };
  config: StarMapConfig;
  scripts: ScriptNode[];
  charLinks: CharLink[];
  themeLinks: ThemeLink[];
  genreGroups: Record<string, GenreGroup>;
  genreCharacters: Record<string, GenreCharacter[]>;
  themeStats: Record<string, ThemeStat>;
  narrStats: Record<string, NarrStat>;
}

/** View modes for the star map */
export type ViewMode = "genre" | "theme" | "narr" | "role";

/** Zoom layers */
export type ZoomLayer = "macro" | "meso" | "micro";

/** Node that has been positioned for canvas rendering */
export interface PositionedNode {
  x: number;
  y: number;
  r: number;
  data: ScriptNode;
}

/** Positioned link for canvas rendering */
export interface PositionedLink {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  data: CharLink | ThemeLink;
  type: "char" | "theme";
}

/** Tooltip data */
export interface TooltipData {
  x: number;
  y: number;
  node: ScriptNode | null;
  visible: boolean;
}
