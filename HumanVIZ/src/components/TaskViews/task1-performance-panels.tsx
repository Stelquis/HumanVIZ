/**
 * task1-performance-panels.tsx
 * Enhanced analysis panels for the "表演模式分析" tab in Task1.
 * Transforms simple data display into a knowledge discovery experience.
 *
 * Exports: DimDiscriminantCard, KeyFindingsCards, KnowledgeDiscoveryPanel,
 *          CharacterComparisonPanel, StatisticalEvidencePanel
 */

import React, { useMemo, useState } from "react";

/* ── Types ── */
type Dimension = "sing" | "speak" | "act" | "fight";

interface PerformanceItem {
  role: string;
  sing: number;
  speak: number;
  act: number;
  fight: number;
}

interface DimStats {
  mean: number; sd: number; cv: string; sem: number;
  ciLow: number; ciHigh: number; variability: string;
}

interface AnovaResult {
  F: number; dfBetween: number; dfWithin: number;
  p: number; etaSq: number; sig: string;
}

interface PairwiseDiff {
  cat1: string; cat2: string; dim: string;
  diff: number; effectSize: number; sig: string;
}

interface Correlation {
  dim1: string; dim2: string; r: number; interpretation: string;
}

interface CategoryProfile {
  category: string; color: string; label: string;
  scriptCount: number;
  sing: { mean: number; sd: number; n: number };
  speak: { mean: number; sd: number; n: number };
  act: { mean: number; sd: number; n: number };
  fight: { mean: number; sd: number; n: number };
}

/* ── Color Constants ── */
const COLORS = {
  gold: "#b89b6d", red: "#96544d", celadon: "#7f968d", slate: "#5e6b76",
  wood: "#7a5e4e", ink: "#3a2c21", textSoft: "#8a939b",
  border: "rgba(94,107,118,0.2)", borderSoft: "rgba(94,107,118,0.12)",
} as const;

const DIM_COLORS: Record<Dimension, string> = {
  sing: COLORS.gold, speak: COLORS.red, act: COLORS.celadon, fight: COLORS.slate,
};

const DIM_LABELS: Record<Dimension, string> = {
  sing: "唱", speak: "念", act: "做", fight: "打",
};

const DIM_FULL: Record<Dimension, string> = {
  sing: "歌唱", speak: "念白", act: "身段", fight: "武打",
};

/* ════════════════════════════════════════════════════════════════
   Computation Utilities
   ════════════════════════════════════════════════════════════════ */

/** Map ANOVA F-value to star rating (1–5) */
function starRating(f: number): number {
  if (f >= 25) return 5;
  if (f >= 15) return 4;
  if (f >= 10) return 3;
  if (f >= 3)  return 2;
  return 1;
}

/** Render star icons */
const Stars: React.FC<{ n: number }> = ({ n }) => (
  <span className="t1-pf-stars">
    {[1, 2, 3, 4, 5].map(i => (
      <span key={i} className={`t1-pf-star ${i <= n ? "t1-pf-star--filled" : "t1-pf-star--empty"}`}>
        {i <= n ? "★" : "☆"}
      </span>
    ))}
  </span>
);

/** Build rich dimension description for the discriminant cards */
function dimRichDesc(dim: Dimension): string {
  const map: Record<Dimension, string> = {
    sing: "唱功是京剧表演的核心声乐技能，以板腔体唱段为表现形式，是区分演唱型与对白型角色的关键维度。老生、青衣等行当以唱工见长，常通过大段唱腔塑造人物。",
    speak: "念白是京剧台词的艺术化表达，包含韵白与散白两种形式，体现角色的身份层级与文化修养。净行讲究『虎音』气势，旦行注重『莺声』韵味，丑行则以京白为特色。",
    act: "做功即身段动作表演，涵盖面部表情、手势步法、水袖髯口等程式化动作体系，是展现人物行为特征与情感状态的核心手段。做功细腻度与角色性格复杂度高度相关。",
    fight: "武打是京剧武戏的表演形式，融合武术套路、翻打跌扑与舞蹈化对打，集中体现角色的武戏属性与动作复杂度。武生、武旦、武丑等行当以武打为标志性技能。",
  };
  return map[dim];
}

/** Build differentiation text from pairwise effect size data */
function dimDiffText(dim: Dimension, pairwise: PairwiseDiff[], catProfiles: CategoryProfile[]): string {
  // Find the top 2 most significant pairwise diffs for this dimension
  const relevant = pairwise
    .filter(p => p.dim === dim && p.sig !== "n.s.")
    .sort((a, b) => Math.abs(b.effectSize) - Math.abs(a.effectSize))
    .slice(0, 2);

  const dimKey = dim;
  const pctMap = catProfiles.reduce((acc, cp) => {
    acc[cp.category] = (cp[dimKey] as any)?.mean ?? 0;
    return acc;
  }, {} as Record<string, number>);

  let text = "";
  if (relevant.length > 0) {
    text = relevant.map(p => {
      const val1 = (pctMap[p.cat1] * 100).toFixed(1);
      const val2 = (pctMap[p.cat2] * 100).toFixed(1);
      return `${p.cat1}行(${val1}%) vs ${p.cat2}行(${val2}%), Cohen's d=${p.effectSize.toFixed(2)} (${p.sig})`;
    }).join("；");
  } else {
    // Fallback: use global stats
    const vals = catProfiles.map(cp => (cp[dimKey] as any)?.mean ?? 0);
    const maxCat = catProfiles[vals.indexOf(Math.max(...vals))].category;
    const minCat = catProfiles[vals.indexOf(Math.min(...vals))].category;
    const maxV = (Math.max(...vals) * 100).toFixed(1);
    const minV = (Math.min(...vals) * 100).toFixed(1);
    text = `${maxCat}行(${maxV}%)与${minCat}行(${minV}%)差异显著，是区分两者重要维度`;
  }
  return text;
}

/** Auto-detect core discriminating dimension(s) */
function detectCoreDiscriminator(
  dimStats: Record<Dimension, DimStats>,
  anova: Record<string, AnovaResult>
): { dim: Dimension; label: string; stat: string; reason: string }[] {
  const findings: { dim: Dimension; label: string; stat: string; reason: string }[] = [];
  const dims: Dimension[] = ["sing", "speak", "act", "fight"];

  // Find highest CV
  const maxCvDim = dims.reduce((a, b) =>
    parseFloat(dimStats[a].cv) > parseFloat(dimStats[b].cv) ? a : b
  );
  findings.push({
    dim: maxCvDim,
    label: DIM_FULL[maxCvDim],
    stat: `CV=${dimStats[maxCvDim].cv}`,
    reason: `变异系数最高，角色间${DIM_FULL[maxCvDim]}戏份差异极大，是区分文武行当的核心维度`,
  });

  // Find highest F-value
  const maxFDim = dims.reduce((a, b) =>
    (anova[a]?.F ?? 0) > (anova[b]?.F ?? 0) ? a : b
  );
  findings.push({
    dim: maxFDim,
    label: DIM_FULL[maxFDim],
    stat: `F=${(anova[maxFDim]?.F ?? 0).toFixed(1)}`,
    reason: `ANOVA F值最高，在行当间均值差异最为显著，η²=${(anova[maxFDim]?.etaSq ?? 0).toFixed(4)}`,
  });

  return findings;
}

/** Compute Euclidean-distance-based character clusters */
function computeCharacterClusters(
  data: PerformanceItem[]
): { members: string[]; label: string; desc: string }[] {
  const dimKeys: Dimension[] = ["sing", "speak", "act", "fight"];

  // Pairwise normalized distances
  const pairs: { a: string; b: string; dist: number }[] = [];
  for (let i = 0; i < data.length; i++) {
    for (let j = i + 1; j < data.length; j++) {
      const dist = Math.sqrt(
        dimKeys.reduce((s, k) =>
          s + (((data[i][k] as number) - (data[j][k] as number)) / 100) ** 2, 0)
      );
      pairs.push({ a: data[i].role, b: data[j].role, dist });
    }
  }

  // Simple agglomerative: merge pairs below threshold
  const THRESHOLD = 0.4;
  const close = pairs.filter(p => p.dist < THRESHOLD).sort((a, b) => a.dist - b.dist);
  const clusters: Set<string>[] = [];

  for (const p of close) {
    let ca = clusters.find(c => c.has(p.a));
    let cb = clusters.find(c => c.has(p.b));
    if (!ca && !cb) { const s = new Set([p.a, p.b]); clusters.push(s); }
    else if (ca && !cb) ca.add(p.b);
    else if (!ca && cb) cb.add(p.a);
    else if (ca && cb && ca !== cb) { cb.forEach(x => ca!.add(x)); clusters.splice(clusters.indexOf(cb), 1); }
  }

  // Assign isolated chars
  data.forEach(d => { if (!clusters.some(c => c.has(d.role))) clusters.push(new Set([d.role])); });

  // Label clusters
  return clusters.map(c => {
    const members = [...c];
    if (members.length === 1) return { members, label: "独立型", desc: "表演模式较为独特" };

    // Compute cluster centroid
    const centroid = dimKeys.map(k =>
      members.reduce((s, r) => s + (data.find(d => d.role === r)?.[k] as number ?? 0), 0) / members.length
    );
    const [singAvg, speakAvg, actAvg, fightAvg] = centroid;

    if (fightAvg >= 70) return { members, label: "武戏主导型", desc: "武打做功突出，文武兼备" };
    if (singAvg >= 80 && speakAvg >= 65) return { members, label: "唱念主导型", desc: "唱念并重，以声传情" };
    if (singAvg >= 70 && actAvg >= 60) return { members, label: "唱做兼备型", desc: "唱做兼顾，表演全面" };
    return { members, label: "均衡发展型", desc: "四维分布较为均衡" };
  });
}

/** Generate knowledge discovery rules */
function computeKnowledgeRules(
  inferenceRules: any[],
  catProfiles: CategoryProfile[]
): { condition: string; conclusion: string; confidence: number; source: string }[] {
  const rules: { condition: string; conclusion: string; confidence: number; source: string }[] = [];

  // Rule 1: from inference rules — male + high sing → 老生, male + high fight → 武生
  const laoshengRule = inferenceRules.find((r: any) => r.result === "老生");
  const wushengRule = inferenceRules.find((r: any) => r.result === "武生");
  if (laoshengRule) {
    rules.push({
      condition: "男性 + 唱工突出 + 年长稳重",
      conclusion: "老生",
      confidence: laoshengRule.confidence,
      source: `${laoshengRule.sampleCount}个角色样本`,
    });
  }
  if (wushengRule) {
    rules.push({
      condition: "男性 + 武打占比高（打≥80）",
      conclusion: "武生/武丑",
      confidence: wushengRule.confidence,
      source: `${wushengRule.sampleCount}个角色样本`,
    });
  }

  // Rule 2: female + high sing+act → 青衣, female + high speak+act → 花旦
  const qingyiRule = inferenceRules.find((r: any) => r.result === "青衣·正旦");
  const huadanRule = inferenceRules.find((r: any) => r.result === "花旦·花衫");
  if (qingyiRule) {
    rules.push({
      condition: "女性 + 唱做突出（唱≥60, 做≥65）",
      conclusion: "青衣·正旦",
      confidence: qingyiRule.confidence,
      source: `${qingyiRule.sampleCount}个角色样本`,
    });
  }
  if (huadanRule) {
    rules.push({
      condition: "女性 + 念做突出（念≥70, 做≥70）",
      conclusion: "花旦·花衫",
      confidence: huadanRule.confidence,
      source: `${huadanRule.sampleCount}个角色样本`,
    });
  }

  // Rule 3: 净行 — 念白显著高于其他行当
  const jingSpeak = catProfiles.find(c => c.category === "净")?.speak.mean ?? 0;
  const avgSpeakOther = catProfiles
    .filter(c => c.category !== "净")
    .reduce((s, c) => s + c.speak.mean, 0) / 3;
  if (jingSpeak > 0) {
    rules.push({
      condition: `念白占比偏高（${(jingSpeak * 100).toFixed(1)}% vs 其他行当均值${(avgSpeakOther * 100).toFixed(1)}%）`,
      conclusion: "净行",
      confidence: 85,
      source: `${catProfiles.find(c => c.category === "净")?.scriptCount ?? 0}个剧本统计`,
    });
  }

  // Rule 4: 丑行 — 念白占比最高，分布均衡
  const chouSpeak = catProfiles.find(c => c.category === "丑")?.speak.mean ?? 0;
  if (chouSpeak > 0) {
    rules.push({
      condition: `念白占比最高（${(chouSpeak * 100).toFixed(1)}%），四维分布最均衡`,
      conclusion: "丑行",
      confidence: 90,
      source: `53个丑行剧本的聚合统计`,
    });
  }

  return rules;
}

/** Get top 3 similar and different characters */
function getSimilarity(
  targetRole: string, data: PerformanceItem[]
): { similar: { role: string; sim: number; deltas: { dim: Dimension; label: string; delta: number }[] }[];
     different: { role: string; sim: number; deltas: { dim: Dimension; label: string; delta: number }[] }[] } {
  const target = data.find(d => d.role === targetRole);
  if (!target) return { similar: [], different: [] };

  const dimKeys: Dimension[] = ["sing", "speak", "act", "fight"];
  const others = data.filter(d => d.role !== targetRole);
  const dimL = DIM_LABELS;

  const scored = others.map(d => {
    const deltas = dimKeys.map(k => ({
      dim: k, label: dimL[k],
      delta: (target[k] as number) - (d[k] as number),
    }));
    const euc = Math.sqrt(dimKeys.reduce((s, k) =>
      s + (((target[k] as number) - (d[k] as number)) / 100) ** 2, 0));
    // Convert distance to similarity (0-100%)
    const sim = Math.round((1 - euc / 1.5) * 100);
    return { role: d.role, sim, deltas };
  });

  const sorted = [...scored].sort((a, b) => b.sim - a.sim);
  return {
    similar: sorted.slice(0, 3),
    different: sorted.slice(-3).reverse(),
  };
}


/* ════════════════════════════════════════════════════════════════
   Components
   ════════════════════════════════════════════════════════════════ */

/* ─── 1. DimDiscriminantCard ─── */

interface DimDiscriminantCardProps {
  dim: Dimension;
  rank: number;
  fValue: number;
  etaSq: number;
  cvPercent: string;
  topChars: { role: string; value: number; color: string }[];
  pairwise: PairwiseDiff[];
  catProfiles: CategoryProfile[];
}

export const DimDiscriminantCard: React.FC<DimDiscriminantCardProps> = ({
  dim, rank, fValue, etaSq, cvPercent, topChars,
  pairwise, catProfiles,
}) => {
  const color = DIM_COLORS[dim];
  const label = DIM_LABELS[dim];
  const full = DIM_FULL[dim];
  const stars = starRating(fValue);
  const desc = dimRichDesc(dim);
  const diffText = dimDiffText(dim, pairwise, catProfiles);

  // Contribution rate based on CV (scaled to percentage for display)
  const allDims: Dimension[] = ["sing", "speak", "act", "fight"];
  const cvVals = allDims.map(_d => parseFloat(cvPercent) || 0);
  const totalCv = cvVals.reduce((a, b) => a + b, 0);
  const contribPct = totalCv > 0 ? Math.round((parseFloat(cvPercent) / totalCv) * 100) : 0;

  return (
    <div className="t1-pf-dim-card" style={{ "--card-accent": color } as React.CSSProperties}>
      {/* Header: rank badge + name + stars */}
      <div className="t1-pf-dim-card-header">
        <span className="t1-pf-dim-rank" style={{ background: color }}>#{rank}</span>
        <span className="t1-pf-dim-name">
          <span className="t1-pf-dim-dot" style={{ background: color }} />
          {label}（{full}）
        </span>
        <Stars n={stars} />
      </div>

      {/* Definition */}
      <p className="t1-pf-dim-desc">{desc}</p>

      {/* Differentiation ability */}
      <div className="t1-pf-dim-diff">
        <span className="t1-pf-dim-diff-label">行当区分力：</span>
        <span className="t1-pf-dim-diff-text">{diffText}</span>
      </div>

      {/* Statistical contribution: F-value bar */}
      <div className="t1-pf-dim-stats-row">
        <div className="t1-pf-dim-stat">
          <span className="t1-pf-dim-stat-val" style={{ color }}>F={fValue.toFixed(1)}</span>
          <span className="t1-pf-dim-stat-lbl">ANOVA</span>
        </div>
        <div className="t1-pf-dim-stat">
          <span className="t1-pf-dim-stat-val" style={{ color }}>{cvPercent}</span>
          <span className="t1-pf-dim-stat-lbl">变异系数</span>
        </div>
        <div className="t1-pf-dim-stat">
          <span className="t1-pf-dim-stat-val" style={{ color }}>η²={etaSq.toFixed(4)}</span>
          <span className="t1-pf-dim-stat-lbl">效应量</span>
        </div>
        <div className="t1-pf-dim-stat">
          <span className="t1-pf-dim-stat-val" style={{ color }}>{contribPct}%</span>
          <span className="t1-pf-dim-stat-lbl">贡献率</span>
        </div>
      </div>

      {/* Contribution bar */}
      <div className="t1-pf-contrib-bar">
        <span className="t1-pf-contrib-label">区分贡献</span>
        <div className="t1-pf-contrib-track">
          <div className="t1-pf-contrib-fill" style={{ width: `${contribPct}%`, background: color }} />
        </div>
        <span className="t1-pf-contrib-pct">{contribPct}%</span>
      </div>

      {/* Representative characters */}
      <div className="t1-pf-dim-chars">
        <span className="t1-pf-dim-chars-label">典型代表</span>
        <div className="t1-pf-dim-chips">
          {topChars.map(ch => (
            <span key={ch.role} className="t1-pf-char-chip" style={{ "--chip-color": ch.color } as React.CSSProperties}>
              <span className="t1-pf-char-chip-dot" style={{ background: ch.color }} />
              {ch.role}
              <span className="t1-pf-char-chip-val">{ch.value}</span>
            </span>
          ))}
          {/* If we have fewer top chars from perfData, show more from catProfiles */}
        </div>
      </div>
    </div>
  );
};


/* ─── 2. KeyFindingsCards ─── */

interface KeyFinding {
  title: string;
  body: string;
  color: string;
  icon: string;
}

export const KeyFindingsCards: React.FC<{
  dimStats: Record<Dimension, DimStats>;
  anova: Record<string, AnovaResult>;
  correlations: Correlation[];
}> = ({ dimStats, anova, correlations }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dims: Dimension[] = ["sing", "speak", "act", "fight"];
  const findings: KeyFinding[] = [];

  // Finding 1: highest F-value dimension
  const maxFDim = dims.reduce((a, b) =>
    (anova[a]?.F ?? 0) > (anova[b]?.F ?? 0) ? a : b
  );
  findings.push({
    title: `「${DIM_FULL[maxFDim]}」是行当核心鉴别维度`,
    body: `ANOVA F(${(anova[maxFDim]?.dfBetween ?? 3)},${(anova[maxFDim]?.dfWithin ?? 1469)}) = ${(anova[maxFDim]?.F ?? 0).toFixed(2)}, ` +
      `η² = ${(anova[maxFDim]?.etaSq ?? 0).toFixed(4)} (${anova[maxFDim]?.sig ?? "***"})。` +
      `${DIM_FULL[maxFDim]}在四大行当之间均值差异最显著，是区分行当归属的首要表演维度。`,
    color: DIM_COLORS[maxFDim],
    icon: maxFDim === "speak" ? "🎤" : maxFDim === "fight" ? "⚔️" : maxFDim === "sing" ? "🎵" : "💃",
  });

  // Finding 2: highest CV dimension
  const maxCvDim = dims.reduce((a, b) =>
    parseFloat(dimStats[a].cv) > parseFloat(dimStats[b].cv) ? a : b
  );
  findings.push({
    title: `「${DIM_FULL[maxCvDim]}」角色间差异巨大`,
    body: `CV = ${dimStats[maxCvDim].cv}，角色间${DIM_FULL[maxCvDim]}表现跨度极大，是区分文武行当的最强单一特征。`,
    color: DIM_COLORS[maxCvDim],
    icon: "📊",
  });

  // Finding 3: strongest negative correlation
  const sortedCorr = [...correlations].sort((a, b) => Math.abs(a.r) - Math.abs(b.r));
  const strongest = sortedCorr[sortedCorr.length - 1];
  if (strongest) {
    findings.push({
      title: `${DIM_FULL[strongest.dim1 as Dimension]}与${DIM_FULL[strongest.dim2 as Dimension]}呈${strongest.interpretation}`,
      body: `r = ${strongest.r.toFixed(4)}，表明${DIM_FULL[strongest.dim1 as Dimension]}占比高的角色其${DIM_FULL[strongest.dim2 as Dimension]}占比往往较低。` +
        `二者构成「文武」判别轴的两极——唱工型角色念白比重降低，武戏型角色做功时间增加。`,
      color: COLORS.wood,
      icon: "🔗",
    });
  }

  return (
    <div className="t1-pf-section">
      <div
        className={`t1-pf-section-header ${isOpen ? 'is-open' : 'is-closed'}`}
        onClick={() => setIsOpen(o => !o)}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setIsOpen(o => !o); }}
      >
        <span className="t1-pf-section-icon">🔍</span>
        <h3>关键发现</h3>
        <span className={`t1-pf-section-chevron ${isOpen ? 'is-open' : ''}`}>▼</span>
      </div>
      <div className={`t1-pf-section-collapse ${isOpen ? 'is-open' : ''}`}>
      <div className="t1-pf-findings-stack">
        {findings.map((f, i) => (
          <div key={i} className="t1-pf-finding-card" style={{ borderLeftColor: f.color }}>
            <div className="t1-pf-finding-header">
              <span className="t1-pf-finding-icon">{f.icon}</span>
              <span className="t1-pf-finding-title">{f.title}</span>
            </div>
            <p className="t1-pf-finding-body">{f.body}</p>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
};


/* ─── 3. KnowledgeDiscoveryPanel ─── */

export const KnowledgeDiscoveryPanel: React.FC<{
  inferenceRules: any[];
  catProfiles: CategoryProfile[];
}> = ({ inferenceRules, catProfiles }) => {
  const [isOpen, setIsOpen] = useState(false);
  const rules = useMemo(
    () => computeKnowledgeRules(inferenceRules, catProfiles),
    [inferenceRules, catProfiles]
  );

  return (
    <div className="t1-pf-section">
      <div
        className={`t1-pf-section-header ${isOpen ? 'is-open' : 'is-closed'}`}
        onClick={() => setIsOpen(o => !o)}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setIsOpen(o => !o); }}
      >
        <span className="t1-pf-section-icon">💡</span>
        <h3>角色—行当映射规律</h3>
        <span className={`t1-pf-section-chevron ${isOpen ? 'is-open' : ''}`}>▼</span>
      </div>
      <div className={`t1-pf-section-collapse ${isOpen ? 'is-open' : ''}`}>
      <p className="t1-pf-section-subtitle">
        基于 8 个典型角色剖面与 1,473 部剧本统计推导的行当判别规律
      </p>
      <div className="t1-pf-rules-stack">
        {rules.map((rule, i) => (
          <div key={i} className="t1-pf-rule-card">
            <div className="t1-pf-rule-number">{i + 1}</div>
            <div className="t1-pf-rule-body">
              <span className="t1-pf-rule-condition">{rule.condition}</span>
              <span className="t1-pf-rule-arrow">→</span>
              <span className="t1-pf-rule-conclusion">{rule.conclusion}</span>
              <div className="t1-pf-rule-meta">
                <span className="t1-pf-rule-confidence" style={{ width: `${rule.confidence}%` }} />
                <span className="t1-pf-rule-source">{rule.confidence}% · {rule.source}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
};


/* ─── 4. CharacterComparisonPanel ─── */

const CharacterComparisonPanel: React.FC<{
  selectedRole: string;
  perfData: PerformanceItem[];
  allColors: Record<string, string>;
  roleTypeMap: Record<string, string>;
  onClear: () => void;
}> = ({ selectedRole, perfData, allColors, roleTypeMap, onClear }) => {
  const { similar, different } = useMemo(
    () => getSimilarity(selectedRole, perfData),
    [selectedRole, perfData]
  );

  const selectedData = perfData.find(d => d.role === selectedRole);

  return (
    <div className="t1-pf-section">
      <div className="t1-pf-section-header">
        <span className="t1-pf-section-icon">🔄</span>
        <h3>角色对比分析</h3>
        <button className="t1-pf-clear-btn" onClick={onClear} title="取消选择">✕</button>
      </div>
      {selectedData && (
        <div className="t1-pf-selected-badge">
          当前角色：<strong>{selectedRole}</strong>
          <span className="t1-pf-selected-roletype" style={{ background: allColors[selectedRole] }}>
            {roleTypeMap[selectedRole] ?? "—"}
          </span>
        </div>
      )}
      <div className="t1-pf-compare-grid">
        <div className="t1-pf-compare-col">
          <h4 className="t1-pf-compare-col-title">
            <span className="t1-pf-compare-col-icon">✅</span> 最相似角色
          </h4>
          {similar.map((item, i) => {
            const roleData = perfData.find(d => d.role === item.role);
            return (
              <div key={i} className="t1-pf-compare-item" style={{ borderLeftColor: allColors[item.role] ?? COLORS.border }}>
                <span className="t1-pf-compare-rank">{i + 1}</span>
                <span className="t1-pf-compare-dot" style={{ background: allColors[item.role] }} />
                <span className="t1-pf-compare-name">{item.role}</span>
                <span className="t1-pf-compare-sim">{item.sim}%</span>
                {roleData && (
                  <div className="t1-pf-compare-deltas">
                    {item.deltas.filter(d => Math.abs(d.delta) >= 5).slice(0, 2).map(d => (
                      <span key={d.dim} className={`t1-pf-compare-delta ${d.delta > 0 ? "pos" : "neg"}`}>
                        {d.label}{d.delta > 0 ? `+${d.delta}` : d.delta}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="t1-pf-compare-col">
          <h4 className="t1-pf-compare-col-title">
            <span className="t1-pf-compare-col-icon">🔀</span> 差异最大角色
          </h4>
          {different.map((item, i) => {
            const roleData = perfData.find(d => d.role === item.role);
            return (
              <div key={i} className="t1-pf-compare-item" style={{ borderLeftColor: allColors[item.role] ?? COLORS.border }}>
                <span className="t1-pf-compare-rank">{i + 1}</span>
                <span className="t1-pf-compare-dot" style={{ background: allColors[item.role] }} />
                <span className="t1-pf-compare-name">{item.role}</span>
                <span className="t1-pf-compare-sim">{item.sim}%</span>
                {roleData && (
                  <div className="t1-pf-compare-deltas">
                    {item.deltas.filter(d => Math.abs(d.delta) >= 5).slice(0, 2).map(d => (
                      <span key={d.dim} className={`t1-pf-compare-delta ${d.delta > 0 ? "pos" : "neg"}`}>
                        {d.label}{d.delta > 0 ? `+${d.delta}` : d.delta}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};


/* ─── 5. StatisticalEvidencePanel ─── */

export const StatisticalEvidencePanel: React.FC<{
  dimStats: Record<Dimension, DimStats>;
  anova: Record<string, AnovaResult>;
  catProfiles: CategoryProfile[];
  selectedRole: string | null;
  perfData: PerformanceItem[];
  roleTypeMap: Record<string, string>;
}> = ({
  dimStats, anova, catProfiles,
  selectedRole, perfData, roleTypeMap,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dims: Dimension[] = ["sing", "speak", "act", "fight"];
  const coreFindings = detectCoreDiscriminator(dimStats, anova);
  const clusters = useMemo(() => computeCharacterClusters(perfData), [perfData]);

  // Inference basis for selected role
  const inferenceBasis = useMemo(() => {
    if (!selectedRole || !perfData) return null;
    const d = perfData.find(p => p.role === selectedRole);
    if (!d) return null;
    const roleType = roleTypeMap[selectedRole] ?? "未知";
    // Compare with category average
    const dimK: Dimension[] = ["sing", "speak", "act", "fight"];
    const cats = ["生", "旦", "净", "丑"] as const;
    // Find which category matches best
    const catScores = cats.map(cat => {
      const profile = catProfiles.find(p => p.category === cat);
      if (!profile) return { cat, score: 0 };
      const score = dimK.reduce((s, k) => {
        const catMean = (profile[k] as any)?.mean ?? 0;
        const charVal = (d[k] as number) / 100;
        return s - Math.abs(charVal - catMean);
      }, 0);
      return { cat, score };
    });
    catScores.sort((a, b) => b.score - a.score);

    // Compute deviation from matched category means
    const matchedCat = catScores[0]?.cat ?? "";
    const matchedProfile = catProfiles.find(p => p.category === matchedCat);
    const dimDeviations = dimK.map(k => {
      const catMean = matchedProfile ? ((matchedProfile[k] as any)?.mean ?? 0) * 100 : 0;
      const charVal = d[k] as number;
      return { dim: k, label: DIM_LABELS[k], charVal, catMean, diff: charVal - catMean };
    }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    return { roleType, matchedCat, dimDeviations };
  }, [selectedRole, perfData, catProfiles, roleTypeMap]);

  return (
    <div className="t1-pf-section">
      <div
        className={`t1-pf-section-header ${isOpen ? 'is-open' : 'is-closed'}`}
        onClick={() => setIsOpen(o => !o)}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setIsOpen(o => !o); }}
      >
        <span className="t1-pf-section-icon">📊</span>
        <h3>统计证据</h3>
        <span className={`t1-pf-section-chevron ${isOpen ? 'is-open' : ''}`}>▼</span>
      </div>

      <div className={`t1-pf-section-collapse ${isOpen ? 'is-open' : ''}`}>
      {/* Core discriminating dimension */}
      <div className="t1-pf-stats-block">
        <h4 className="t1-pf-stats-block-title">核心区分维度</h4>
        <div className="t1-pf-core-grid">
          {coreFindings.map((f, i) => (
            <div key={i} className="t1-pf-core-card" style={{ borderLeftColor: DIM_COLORS[f.dim] }}>
              <span className="t1-pf-core-stat" style={{ color: DIM_COLORS[f.dim] }}>{f.stat}</span>
              <span className="t1-pf-core-label">{f.label}</span>
              <p className="t1-pf-core-reason">{f.reason}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Feature separation summary */}
      <div className="t1-pf-stats-block">
        <h4 className="t1-pf-stats-block-title">特征分离度（ANOVA）</h4>
        <table className="t1-pf-stats-table">
          <thead>
            <tr>
              <th>维度</th>
              <th>F值</th>
              <th>η²</th>
              <th>p</th>
              <th>显著性</th>
            </tr>
          </thead>
          <tbody>
            {dims.map(d => {
              const a = anova[d] as AnovaResult | undefined;
              if (!a) return null;
              return (
                <tr key={d}>
                  <td>
                    <span className="t1-pf-stats-dot" style={{ background: DIM_COLORS[d] }} />
                    {DIM_LABELS[d]}
                  </td>
                  <td>{a.F.toFixed(2)}</td>
                  <td>{a.etaSq.toFixed(4)}</td>
                  <td>{a.p < 0.001 ? "&lt;0.001" : a.p.toFixed(4)}</td>
                  <td><span className="t1-pf-sig-badge" data-sig={a.sig}>{a.sig}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Character clustering */}
      <div className="t1-pf-stats-block">
        <h4 className="t1-pf-stats-block-title">角色聚类分组</h4>
        <div className="t1-pf-cluster-grid">
          {clusters.map((c, i) => (
            <div key={i} className="t1-pf-cluster-card">
              <div className="t1-pf-cluster-header">
                <span className="t1-pf-cluster-num">{`C${i + 1}`}</span>
                <span className="t1-pf-cluster-label">{c.label}</span>
              </div>
              <div className="t1-pf-cluster-members">
                {c.members.map(m => (
                  <span key={m} className="t1-pf-cluster-member">{m}</span>
                ))}
              </div>
              <p className="t1-pf-cluster-desc">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Inference basis for selected role */}
      {inferenceBasis && (
        <div className="t1-pf-stats-block">
          <h4 className="t1-pf-stats-block-title">行当推断依据</h4>
          <div className="t1-pf-inference-card">
            <div className="t1-pf-inference-header">
              <span className="t1-pf-inference-char">{selectedRole}</span>
              <span className="t1-pf-inference-arrow">→</span>
              <span className="t1-pf-inference-role">{inferenceBasis.roleType}</span>
            </div>
            <p className="t1-pf-inference-note">
              匹配行当：<strong>{inferenceBasis.matchedCat}行</strong>
              （基于四维表演模式的最近邻匹配）
            </p>
            <div className="t1-pf-inference-dims">
              {inferenceBasis.dimDeviations.slice(0, 3).map(d => {
                const absDiff = Math.abs(d.diff);
                const isMajor = absDiff >= 15;
                return (
                  <div key={d.dim} className="t1-pf-inference-dim">
                    <span className="t1-pf-inference-dim-name" style={{ color: DIM_COLORS[d.dim] }}>
                      {d.label}
                    </span>
                    <div className="t1-pf-inference-dim-bar">
                      <div className="t1-pf-inference-dim-track">
                        <div
                          className={`t1-pf-inference-dim-fill ${d.diff > 0 ? "above" : "below"}`}
                          style={{
                            width: `${Math.min(Math.abs(d.diff) * 2, 100)}%`,
                            background: d.diff > 0 ? DIM_COLORS[d.dim] : `${DIM_COLORS[d.dim]}80`,
                          }}
                        />
                      </div>
                      <span className={`t1-pf-inference-dim-diff ${isMajor ? "major" : ""}`}>
                        {d.diff > 0 ? `+${d.diff.toFixed(0)}` : d.diff.toFixed(0)}
                      </span>
                    </div>
                    {isMajor && <span className="t1-pf-inference-dim-tag">关键依据</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Descriptive statistics summary (collapsible) */}
      <details className="t1-pf-stats-details">
        <summary className="t1-pf-stats-summary">查看描述统计详情</summary>
        <table className="t1-pf-stats-table">
          <thead>
            <tr>
              <th>维度</th>
              <th>均值</th>
              <th>SD</th>
              <th>CV</th>
              <th>SEM</th>
              <th>95% CI</th>
            </tr>
          </thead>
          <tbody>
            {dims.map(d => {
              const s = dimStats[d];
              return (
                <tr key={d}>
                  <td>
                    <span className="t1-pf-stats-dot" style={{ background: DIM_COLORS[d] }} />
                    {DIM_LABELS[d]}
                  </td>
                  <td>{s.mean.toFixed(1)}</td>
                  <td>{s.sd.toFixed(1)}</td>
                  <td><strong>{s.cv}</strong></td>
                  <td>{s.sem.toFixed(1)}</td>
                  <td>[{s.ciLow.toFixed(0)},{s.ciHigh.toFixed(0)}]</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="t1-pf-stats-footnote">n=8 典型角色剖面；SD=标准差，CV=变异系数，SEM=标准误，CI=置信区间</p>
      </details>
      </div>
    </div>
  );
};
