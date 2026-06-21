/** 梨园万象 — 主界面数据（基于 1,473 部京剧剧本真实统计） */

import sourceEvolutionRaw from "../data/source-evolution.json";

// ── 类型定义 ──
interface SourceEvolutionData {
  _meta: { description: string; generatedFrom: string[]; note: string; totalScripts: number };
  sourceOrder: string[];
  sourceMeta: Record<string, { yearStart: number; yearEnd: number; shortLabel: string; desc: string; note: string }>;
  roleColors: Record<string, string>;
  roleKeys: string[];
  sourceRolePcts: Record<string, { counts: Record<string, number>; pcts: Record<string, number>; totalClassified: number; scriptCount: number }>;
  sourceThemes: Record<string, { theme: string; coverage: number }[]>;
  sourceStructural: Record<string, { avgChars: number; avgScenes: number; avgSinging: number; avgFighting: number; avgSpeaking: number; avgDensity: number; avgCentralization: number }>;
  sourceTopChars: Record<string, Record<string, string[]>>;
  globalTopChars: Record<string, string[]>;
  insights: { text: string; source: string }[];
}

const SE = sourceEvolutionRaw as unknown as SourceEvolutionData;

// ── InfinityRiver 粒子配色（按来源大类） ──
export const RIVER_COLORS: Record<string, string> = {
  "综合剧目集": "#b8926a",
  "名家剧本选": "#96544d",
  "昆曲剧本选": "#7f968d",
  "现代剧作家": "#5e6b76",
  "其他剧本": "#c4a57b",
};

// ══════════════════════════════════════════════════════════════
// 行当格局演变数据 — 按编辑出版年代聚合（真实统计）
// 数据来源: starmap-data.json + theme-data.json + role-treering.json
// ══════════════════════════════════════════════════════════════

export interface EraEvolutionPoint {
  era: string;        // 来源时代简称
  yearStart: number;
  yearEnd: number;
  count: number;       // 该年代的剧本数量
  生: number;
  旦: number;
  净: number;
  丑: number;
  themes: string;     // 逗号分隔的主导主题
  note?: string;
}

export const ROLE_EVOLUTION_DATA: EraEvolutionPoint[] = SE.sourceOrder
  .filter((sc) => SE.sourceRolePcts[sc])
  .map((sc) => {
    const meta = SE.sourceMeta[sc];
    const pcts = SE.sourceRolePcts[sc].pcts;
    const themes = (SE.sourceThemes[sc] || [])
      .slice(0, 4)
      .map((t) => t.theme)
      .join(",");
    return {
      era: meta.shortLabel,
      count: SE.sourceRolePcts[sc].scriptCount,
      yearStart: meta.yearStart,
      yearEnd: meta.yearEnd,
      生: pcts["生"] || 0,
      旦: pcts["旦"] || 0,
      净: pcts["净"] || 0,
      丑: pcts["丑"] || 0,
      themes,
      note: meta.note,
    };
  });

export const ROLE_COLORS: Record<string, string> = SE.roleColors;
export const ROLE_KEYS = SE.roleKeys;

// ══════════════════════════════════════════════════════════════
// 来源时代 × 行当代表角色（真实统计，来自 scripts-summary）
// ══════════════════════════════════════════════════════════════

export const ERA_CHARACTERS: Record<string, Record<string, string[]>> = {};
for (const sc of SE.sourceOrder) {
  const meta = SE.sourceMeta[sc];
  const chars = SE.sourceTopChars[sc] || {};
  ERA_CHARACTERS[meta.shortLabel] = {
    "生": chars["生"] || [],
    "旦": chars["旦"] || [],
    "净": chars["净"] || [],
    "丑": chars["丑"] || [],
  };
}

// ══════════════════════════════════════════════════════════════
// 全局 Top 角色（不分来源）
// ══════════════════════════════════════════════════════════════

export const GLOBAL_TOP_CHARS: Record<string, string[]> = SE.globalTopChars;

// ══════════════════════════════════════════════════════════════
// 关键洞察（从真实数据中自动提取）
// ══════════════════════════════════════════════════════════════

export const OVERVIEW_INSIGHTS = SE.insights;

// ══════════════════════════════════════════════════════════════
// 来源时代元信息（供外部查询）
// ══════════════════════════════════════════════════════════════

export const SOURCE_META = SE.sourceMeta;
export const SOURCE_ORDER = SE.sourceOrder;
export const SOURCE_STRUCTURAL = SE.sourceStructural;

// ── 梨园科普角数据 ──
export interface EduCard {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  image: string;  // 4:3 横版信息图 PNG，存放于 public/
}

export const EDU_CARDS: EduCard[] = [
  { id: "roles",  icon: "🎭", title: "四大行当",   subtitle: "生·旦·净·丑",       image: "/edu-roles.png" },
  { id: "music",  icon: "🎵", title: "京剧声腔",   subtitle: "西皮·二黄·板式",    image: "/edu-music.png" },
  { id: "terms",  icon: "📖", title: "术语小词典", subtitle: "行话·表演·功法",    image: "/edu-terms.png" },
  { id: "faces",  icon: "🎨", title: "脸谱艺术",   subtitle: "色彩·纹样·寓意",    image: "/edu-faces.png" },
];
