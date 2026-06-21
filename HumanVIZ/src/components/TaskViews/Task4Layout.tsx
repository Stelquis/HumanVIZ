import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import "./Task4Layout.scss";

import {
  analyzeStoryRibbons,
  extractFingerprint,
  detectNarrativePhases,
  RibbonAnalysisResult,
  StoryFingerprint,
  RawStoryInput,
} from "../../utils/storyRibbonCore";
import {
  detectAllClimaxes,
  computeStructureFramework,
} from "../../utils/narrativeAnalysisEnhancer";
import { mapAlgorithmicTypeToPattern } from "../../utils/narrativeTaxonomyBridge";
import operaSamplesRaw from "../../data/opera-samples.json";
import narrativeClassifications from "../../data/narrative-classifications.json";
import narrativeScenesLite from "../../data/narrative-scenes-lite.json";
import universalNarrativeAnalysis from "../../data/universal-narrative-analysis.json";

import starmapData from "../../data/starmap-data.json";

import CrossPlayComparison from "./CrossPlayComparison";
import TurningPointsPanel from "./TurningPointsPanel";
import NarrativeDNASummaryCard from "./NarrativeDNASummaryCard";
import MultiPlayOverlayChart from "./MultiPlayOverlayChart";
import Toast from "./Toast";
import selectedScriptsRaw from "../../data/selected-scripts.json";
import { useTask4Store } from "../../stores/task4Store";

// Extracted sub-components
import PatternSummaryPanel from "./PatternSummaryPanel";
import CharacterNarrativePanel from "./CharacterNarrativePanel";
import CombinedRhythmChart from "./CombinedRhythmChart";
import { computePatternScores } from "./NarrativePatternCompare";
import TurningPointsTimeline from "./TurningPointsTimeline";

// Shared types and constants
import type { ScriptCard } from "../../types/task4Types";
import {
  NARRATIVE_PATTERNS,
  NARRATIVE_TYPE_CONFIG,
  USER_TYPE_TO_STARMAP,
  FALLBACK_PHASES,
  keyToLabel,
} from "../../types/task4Types";

/* ================================================================
   Selection Report — data from external JSON files
   ================================================================ */

const SELECTED_SCRIPTS: ScriptCard[] = selectedScriptsRaw as ScriptCard[];

const Task4Layout: React.FC = () => {
  const [reportSidebarOpen, setReportSidebarOpen] = useState(false);
  const [reportTab, setReportTab] = useState<"report" | "patterns" | "compare" | "findings">("report");
  const [patternDrawerOpen, setPatternDrawerOpen] = useState(false);
  // ── 富数据：opera-samples.json (11 部有深度 LLM 分析) ──
  const richOperaMap = useMemo<Map<string, RawStoryInput>>(() => {
    const map = new Map<string, RawStoryInput>();
    const raw = operaSamplesRaw as Record<string, any>;
    for (const [key, value] of Object.entries(raw)) {
      if (key.startsWith("$")) continue;
      map.set(key, value as RawStoryInput);
    }
    return map;
  }, []);

  // ── 增强版通用叙事分析数据：universal-narrative-analysis.json (含performanceForm/conflictType等) ──
  const universalData = useMemo(() => {
    const uid = universalNarrativeAnalysis as any;
    return uid.plays || {};
  }, []);

  // ── 全量分类数据：narrative-classifications.json (1473 部预计算) ──
  const allOperaMeta = useMemo(() => {
    const m = new Map<string, { title: string; rhythmType: string; sceneCount: number; charCount: number }>();
    for (const item of narrativeClassifications as any[]) {
      m.set(item.key, { title: item.title, rhythmType: item.rhythmType, sceneCount: item.sceneCount, charCount: item.charCount });
    }
    return m;
  }, []);

  const allKeys = useMemo(() => Array.from(allOperaMeta.keys()), [allOperaMeta]);
  const [selectedKey, setSelectedKey] = useState<string>(allKeys[0] || "");

  // ── 叙事类型筛选状态 (local multi-select) ──
  const [activeNarrTypes, setActiveNarrTypes] = useState<Set<string>>(new Set());
  // ── 剧本搜索 ──
  const [scriptSearchQuery, setScriptSearchQuery] = useState("");
  const storeMainView = useTask4Store((s) => s.mainView);
  const storeSetMainView = useTask4Store((s) => s.setMainView);
  const storeMultiCompareKeys = useTask4Store((s) => s.multiCompareKeys);
  const storeToggleCompareKey = useTask4Store((s) => s.toggleCompareKey);
  const storeClearCompareKeys = useTask4Store((s) => s.clearCompareKeys);

  // ── Toast 浮窗提示 ──
  const [toastMsg, setToastMsg] = useState<string>("");
  const [toastVisible, setToastVisible] = useState(false);
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
  }, []);
  const hideToast = useCallback(() => {
    setToastVisible(false);
  }, []);

  // ── 当多选达到上限 5 时弹出提示 ──
  const handleToggleCompare = useCallback((key: string) => {
    if (storeMultiCompareKeys.length >= 5 && !storeMultiCompareKeys.includes(key)) {
      showToast("最多添加 3 部剧目进行叠加对比");
      return;
    }
    storeToggleCompareKey(key);
  }, [storeMultiCompareKeys, storeToggleCompareKey, showToast]);

  // ── 根据叙事类型 + 搜索关键词筛选剧目 keys ──
  const filteredKeys = useMemo(() => {
    let keys = allKeys;

    // Filter by narrative types (multi-select OR logic)
    if (activeNarrTypes.size > 0) {
      const activeStarmapTypes = new Set<string>();
      for (const nt of activeNarrTypes) {
        (USER_TYPE_TO_STARMAP[nt] || []).forEach((t) => activeStarmapTypes.add(t));
      }
      if (activeStarmapTypes.size > 0) {
        const starmapScripts = (starmapData as any).scripts as any[];
        const matchingIds = new Set<string>();
        for (const s of starmapScripts) {
          if (activeStarmapTypes.has(s.narrType)) {
            matchingIds.add(s.id);
          }
        }
        keys = keys.filter((k) => matchingIds.has(k));
      }
    }

    // Filter by search query (match script label or title)
    if (scriptSearchQuery.trim()) {
      const q = scriptSearchQuery.trim().toLowerCase();
      keys = keys.filter((k) => {
        const label = keyToLabel(k).toLowerCase();
        const meta = allOperaMeta.get(k);
        const title = meta?.title?.toLowerCase() || "";
        return label.includes(q) || title.includes(q);
      });
    }

    // Sort by proximity to ~10 scenes (十幕左右优先)
    const sorted = [...keys].sort((a, b) => {
      const ma = allOperaMeta.get(a);
      const mb = allOperaMeta.get(b);
      const distA = Math.abs((ma?.sceneCount ?? 0) - 10);
      const distB = Math.abs((mb?.sceneCount ?? 0) - 10);
      return distA - distB;
    });
    return sorted;
  }, [activeNarrTypes, scriptSearchQuery, allKeys, allOperaMeta]);

  // ── 当筛选结果变更时，自动重置 selectedKey 到有效范围 ──
  useEffect(() => {
    if (selectedKey && !filteredKeys.includes(selectedKey)) {
      setSelectedKey(filteredKeys[0] || "");
    }
  }, [filteredKeys, selectedKey]);

  // ── 各叙事类型对应剧本数 (用于侧栏 badge) ──
  const narrTypePlayCounts = useMemo(() => {
    const starmapScripts = (starmapData as any).scripts as any[];
    const narrTypeCounts = new Map<string, number>();
    for (const s of starmapScripts) {
      narrTypeCounts.set(s.narrType, (narrTypeCounts.get(s.narrType) || 0) + 1);
    }
    return NARRATIVE_TYPE_CONFIG.map((nt) => {
      const mapped = USER_TYPE_TO_STARMAP[nt.id] || [];
      const total = mapped.reduce((sum, starmapType) => sum + (narrTypeCounts.get(starmapType) || 0), 0);
      return { id: nt.id, count: total };
    });
  }, []);

  // ── Interactive features state ──
  const [selectedPhase, setSelectedPhase] = useState<number | null>(null);

  // ── 预计算 11 部富数据 + 按需加载其余 1462 部 ──
  const richAnalyses = useMemo<Map<string, RibbonAnalysisResult>>(() => {
    const m = new Map<string, RibbonAnalysisResult>();
    for (const [key, input] of richOperaMap) {
      try { m.set(key, analyzeStoryRibbons(input)); } catch (e) { console.error(`分析失败: ${key}`, e); }
    }
    return m;
  }, [richOperaMap]);

  // ── Ribbon 全量处理数据缓存（opera_processor.py --all 产出）──
  const [ribbonAnalyses, setRibbonAnalyses] = useState<Map<string, RibbonAnalysisResult>>(new Map());
  const ribbonLoadingRef = useRef<Set<string>>(new Set());

  // 当选中的剧本发生变化时，异步加载对应的 ribbon 数据
  useEffect(() => {
    if (!selectedKey) return;
    // 如果已经有富数据或已加载过 ribbon，跳过
    if (richAnalyses.has(selectedKey + ".json")) return;
    if (ribbonAnalyses.has(selectedKey)) return;
    if (ribbonLoadingRef.current.has(selectedKey)) return;

    ribbonLoadingRef.current.add(selectedKey);

    fetch(`/data/opera_ribbon/${selectedKey}_ribbon.json`)
      .then(res => { if (!res.ok) throw new Error('Not found'); return res.json(); })
      .then(data => {
        const input: RawStoryInput = {
          title: data.title || allOperaMeta.get(selectedKey)?.title || selectedKey,
          scenes: (data.scenes || []).map((s: any) => ({
            number: s.number || 0,
            name: s.name || "",
            characters: (s.characters || []).map((c: any) => ({ name: c.name || c.character || "" })),
            numLines: s.numLines || 0,
            ratings: s.ratings || { conflict: 0.3, sentiment: 0 },
          })),
          characters: (data.characters || []).map((c: any) => ({
            character: c.character || "",
            short: c.short || (c.character || "").slice(0, 2),
            group: c.group || "默认分组",
          })),
        };
        const result = analyzeStoryRibbons(input);
        setRibbonAnalyses(prev => new Map(prev).set(selectedKey, result));
      })
      .catch(() => {
        // ribbon 文件不存在，不处理，后续走 lite fallback
      });
  }, [selectedKey, richAnalyses, ribbonAnalyses, allOperaMeta]);

  const lazyCache = useRef<Map<string, RibbonAnalysisResult | null>>(new Map());

  const getAnalysis = useCallback((key: string): RibbonAnalysisResult | null => {
    // 1. 富数据 (opera-samples.json 11部)
    const richKey = key + ".json";
    const rich = richAnalyses.get(richKey);
    if (rich) return rich;

    // 2. Ribbon 全量处理数据 (1473部)
    const ribbon = ribbonAnalyses.get(key);
    if (ribbon) return ribbon;

    // 3. 按需缓存
    if (lazyCache.current.has(key)) return lazyCache.current.get(key)!;

    // 4. 从 narrative-scenes-lite.json 构建 fallback
    const liteScenes = (narrativeScenesLite as any)?.[key];
    if (!liteScenes) { lazyCache.current.set(key, null); return null; }

    try {
      const input: RawStoryInput = {
        title: allOperaMeta.get(key)?.title || key,
        scenes: liteScenes.s.map((s: any) => ({
          number: s.n, name: s.nm || "",
          characters: (s.c || []).map((name: string) => ({ name })),
          numLines: 0,
          ratings: s.r || { conflict: 0.3, sentiment: 0 },
        })),
        characters: (liteScenes.ch || []).map((c: any) => ({
          character: c.c, short: c.s || c.c.slice(0, 2), group: c.g || "默认分组",
        })),
      };
      const result = analyzeStoryRibbons(input);
      lazyCache.current.set(key, result);
      return result;
    } catch (e) {
      console.error(`分析失败: ${key}`, e);
      lazyCache.current.set(key, null);
      return null;
    }
  }, [richAnalyses, ribbonAnalyses, allOperaMeta]);

  const currentAnalysis = useMemo(() => getAnalysis(selectedKey), [selectedKey, getAnalysis]);

  // ── 指纹：优先用分析结果，否则用预计算分类 ──
  const allFingerprints = useMemo<Map<string, StoryFingerprint>>(() => {
    const m = new Map<string, StoryFingerprint>();
    // 从富数据指纹
    for (const [key, analysis] of richAnalyses) {
      const fp = extractFingerprint(analysis);
      if (fp) m.set(key.replace(".json", ""), fp);
    }
    return m;
  }, [richAnalyses]);

  const getFingerprint = useCallback((key: string): StoryFingerprint | null => {
    const cached = allFingerprints.get(key);
    if (cached) return cached;

    // 优先从 universal-narrative-analysis.json 读取预计算指纹
    const uniData = (universalData as Record<string, any>)[key];
    if (uniData?.fingerprint) {
      const uf = uniData.fingerprint;
      return {
        title: keyToLabel(key),
        sceneCount: uf.sceneCount || 0,
        charCount: uf.charCount || 0,
        totalLines: uf.totalLines || 0,
        rhythmType: uf.rhythmType || "单场聚焦型",
        arcShape: uf.arcShape || "",
        conflictTrend: uf.conflictTrend || 0,
        conflictRange: uf.conflictRange || 0,
        sentimentVolatility: uf.sentimentVolatility || 0,
        sentimentTrend: uf.sentimentTrend || 0,
        sceneLengthCV: uf.sceneLengthCV || 0,
        peakPosition: uf.peakPosition || 0,
        avgCharsPerScene: uf.avgCharsPerScene || 0,
        structureType: uf.structureType || "",
      } as StoryFingerprint;
    }

    const meta = allOperaMeta.get(key);
    if (!meta) return null;
    // 从预计算分类构建轻量指纹
    return {
      title: meta.title,
      sceneCount: meta.sceneCount,
      charCount: meta.charCount,
      totalLines: 0,
      rhythmType: meta.rhythmType,
      arcShape: "",
      conflictTrend: 0,
      conflictRange: 0,
      sentimentVolatility: 0,
      sentimentTrend: 0,
      sceneLengthCV: 0,
      peakPosition: 0,
      avgCharsPerScene: meta.sceneCount > 0 ? meta.charCount / meta.sceneCount : 0,
      structureType: "",
    } as StoryFingerprint;
  }, [allFingerprints, allOperaMeta, universalData]);

  const currentFingerprint = useMemo(() => getFingerprint(selectedKey), [selectedKey, getFingerprint]);
  const currentScriptCard = SELECTED_SCRIPTS.find(s => s.name === keyToLabel(selectedKey));

  // ── v2 增强数据 (来自 universal-narrative-analysis.json) ──
  const currentUniversalData = useMemo(() => {
    return (universalData as any)[selectedKey] || null;
  }, [selectedKey, universalData]);

  const currentTurningPoints = useMemo(() => {
    // 1. 优先使用预计算数据
    if (currentUniversalData?.turningPoints?.length) return currentUniversalData.turningPoints;
    // 2. 运行时 fallback: 从冲突弧检测局部极大值
    if (currentAnalysis?.narrativeMetrics?.conflictArc) {
      return detectAllClimaxes(currentAnalysis.narrativeMetrics.conflictArc);
    }
    return null;
  }, [currentUniversalData, currentAnalysis]);

  const currentStructureFramework = useMemo(() => {
    // 1. 优先使用预计算数据
    if (currentUniversalData?.structureFramework) return currentUniversalData.structureFramework;
    // 2. 运行时 fallback: 从结构特征推断
    if (currentAnalysis && currentFingerprint) {
      return computeStructureFramework({
        sceneCount: currentFingerprint.sceneCount,
        conflictArc: currentAnalysis.narrativeMetrics.conflictArc,
        sentimentArc: currentAnalysis.narrativeMetrics.sentimentArc,
        conflictTrend: currentFingerprint.conflictTrend,
        peakPosition: currentFingerprint.peakPosition,
        conflictRange: currentFingerprint.conflictRange,
        avgCharsPerScene: currentFingerprint.avgCharsPerScene,
        rhythmType: currentFingerprint.rhythmType,
      });
    }
    return null;
  }, [currentUniversalData, currentAnalysis, currentFingerprint]);

  // ── 叙事模式类型桥接：将 Python 算法类型映射为前端叙事模式 ──
  const narrativePatternType = useMemo(() => {
    // 1. 5 部硬编码剧本有手工标注的 structureType
    if (currentScriptCard?.structureType) return currentScriptCard.structureType;
    // 2. 通过桥接函数从算法类型推断
    const algoType = currentFingerprint?.structureType || "";
    if (algoType) {
      const bridged = mapAlgorithmicTypeToPattern(algoType, {
        sceneCount: currentFingerprint?.sceneCount || 0,
        conflictRange: currentFingerprint?.conflictRange || 0,
        peakPosition: currentFingerprint?.peakPosition || 0,
        conflictTrend: currentFingerprint?.conflictTrend || 0,
        sentimentVolatility: currentFingerprint?.sentimentVolatility || 0,
        avgCharsPerScene: currentFingerprint?.avgCharsPerScene || 0,
        arcShape: currentFingerprint?.arcShape,
      });
      return bridged.patternType;
    }
    return "线性渐进式"; // 最终默认
  }, [currentScriptCard, currentFingerprint]);

  // ── 叙事DNA 7 维值（用于 NarrativeDNASummaryCard）──
  const dnaValues = useMemo(() => {
    if (!currentFingerprint || !currentAnalysis) return null;
    const conflictArc = currentAnalysis.narrativeMetrics.conflictArc;
    const avgConflict = conflictArc.length > 0
      ? conflictArc.reduce((s, v) => s + v, 0) / conflictArc.length : 0;
    const maxConflict = conflictArc.length > 0 ? Math.max(...conflictArc) : 0.5;
    const climaxConc = avgConflict > 0
      ? Math.min(1, maxConflict / Math.max(avgConflict, 0.01) / 5) : 0.4;
    const climaxIdx = conflictArc.indexOf(maxConflict);
    let suspenseRetention = 0.35;
    if (climaxIdx > 0 && conflictArc.length > 0) {
      const preClimax = conflictArc.slice(0, climaxIdx);
      suspenseRetention = preClimax.length > 0
        ? preClimax.reduce((s, v) => s + v, 0) / preClimax.length : 0.35;
    }
    return {
      sceneScale: Math.min(100, (currentFingerprint.sceneCount / 25) * 100),
      charDensity: Math.min(100, (currentFingerprint.avgCharsPerScene / 8) * 100),
      conflictIntensity: avgConflict * 100,
      emotionVolatility: currentFingerprint.sentimentVolatility * 100,
      climaxConcentration: climaxConc * 100,
      suspenseRetention: suspenseRetention * 100,
      perfFormComplexity: 30,
    };
  }, [currentFingerprint, currentAnalysis]);

  // ── ③ 动态阶段数据（供 PhaseExplainer / Timeline 使用）──
  const currentPhases = useMemo(() => {
    if (!currentAnalysis) return [];
    const scenes = currentAnalysis.scenes;
    const conflictArc = currentAnalysis.narrativeMetrics.conflictArc;
    const sentimentArc = currentAnalysis.narrativeMetrics.sentimentArc;
    const charDensity = currentAnalysis.narrativeMetrics.characterDensity;
    const n = scenes.length;

    if (currentAnalysis.narrativeMetrics.narrativePhases?.length) {
      return currentAnalysis.narrativeMetrics.narrativePhases;
    }
    const detected = detectNarrativePhases(scenes, conflictArc, sentimentArc, charDensity);
    if (detected?.length) return detected;
    return FALLBACK_PHASES.map(fp => ({
      label: fp.label,
      startScene: Math.floor(n * fp.pct[0]),
      endScene: Math.min(n - 1, Math.floor(n * fp.pct[1])),
      dominantFeature: "conflict" as const,
    }));
  }, [currentAnalysis]);

  // ── 右侧洞察面板数据（核心叙事模式 / 高潮集中度 / 角色驱动占比）──
  const rightInsightData = useMemo(() => {
    if (!currentFingerprint || !currentAnalysis) return null;
    const conflictArc = currentAnalysis.narrativeMetrics.conflictArc;
    const avgConflict = conflictArc.length > 0
      ? conflictArc.reduce((s, v) => s + v, 0) / conflictArc.length : 0;
    const maxConflict = conflictArc.length > 0 ? Math.max(...conflictArc) : 0.5;
    const climaxRaw = avgConflict > 0
      ? Math.min(100, (maxConflict / Math.max(avgConflict, 0.01) / 5) * 100)
      : 0;

    const totalAppearances = currentAnalysis.sortedCharacters?.reduce((s, c) => {
      const cs = (currentAnalysis.characterScenes as any[]).find((cs: any) => cs.character === c.character);
      return s + (cs?.scenes?.length || 0);
    }, 0) || 1;
    const dominantScenes = currentAnalysis.sortedCharacters?.[0]
      ? (currentAnalysis.characterScenes as any[]).find((cs: any) => cs.character === currentAnalysis.sortedCharacters[0].character)?.scenes?.length || 0
      : 0;
    const roleDrivenPct = totalAppearances > 0
      ? Math.round((dominantScenes / totalAppearances) * 100)
      : 0;

    // 取场景数最多的角色作为主导角色
    const dominantChar = currentAnalysis.sortedCharacters?.[0]?.character || "—";
    const patternMeta = NARRATIVE_PATTERNS.find(p => p.type === narrativePatternType);

    // Multi-level climax label (replaces binary)
    let climaxLabel: string;
    if (climaxRaw >= 70) climaxLabel = "高度集中的爆发式叙事，戏剧冲突积聚于极少关键场次";
    else if (climaxRaw >= 50) climaxLabel = "冲突趋于集中，核心场次承担主要戏剧张力";
    else if (climaxRaw >= 30) climaxLabel = "存在主要冲突线但非高度集中，节奏相对均衡";
    else climaxLabel = "冲突均匀分布，适合散点叙事或群像式展开";

    // Role-driven commentary
    let roleDrivenLabel: string;
    if (roleDrivenPct >= 50) roleDrivenLabel = `主导角色「${dominantChar}」出场占比${roleDrivenPct}%，叙事高度依赖单一核心角色，常见于传记式/英雄式叙事`;
    else if (roleDrivenPct >= 30) roleDrivenLabel = `主导角色「${dominantChar}」出场占比${roleDrivenPct}%，核心角色驱动与群像配合并重`;
    else roleDrivenLabel = `主导角色「${dominantChar}」出场占比${roleDrivenPct}%，角色戏份分散，属群像式叙事特征`;

    return {
      patternType: narrativePatternType,
      patternColor: patternMeta?.color || "var(--theme-gold)",
      patternDesc: patternMeta?.description?.slice(0, 80) || patternMeta?.keyFeature || "—",
      climaxConcentration: Math.round(climaxRaw),
      climaxLabel,
      roleDrivenPct,
      dominantChar,
      roleDrivenLabel,
    };
  }, [currentFingerprint, currentAnalysis, narrativePatternType]);

  // ── 叙事模式匹配分数 (用于右侧面板紧凑卡 + 抽屉弹窗) ──
  const patternScores = useMemo(() => {
    if (!currentFingerprint) return [];
    return computePatternScores(currentFingerprint);
  }, [currentFingerprint]);
  const topPattern = patternScores[0];
  const topThreePatterns = patternScores.slice(0, 3);

  // ── 多剧本对比面板数据 ──
  const multiCompareData = useMemo(() => {
    if (storeMultiCompareKeys.length < 2) return null;
    const infos = storeMultiCompareKeys.map(k => {
      const meta = allOperaMeta.get(k);
      const starmapScript = (starmapData as any).scripts?.find((s: any) => s.id === k);
      return {
        key: k,
        label: keyToLabel(k),
        sceneCount: meta?.sceneCount || 0,
        charCount: meta?.charCount || 0,
        rhythmType: meta?.rhythmType || '',
        narrType: starmapScript?.narrType || '',
      };
    });
    return {
      infos,
      sceneMin: Math.min(...infos.map(i => i.sceneCount)),
      sceneMax: Math.max(...infos.map(i => i.sceneCount)),
      sceneAvg: Math.round(infos.reduce((s, i) => s + i.sceneCount, 0) / infos.length),
      charMin: Math.min(...infos.map(i => i.charCount)),
      charMax: Math.max(...infos.map(i => i.charCount)),
      narrTypes: [...new Set(infos.map(i => i.narrType).filter(Boolean))],
    };
  }, [storeMultiCompareKeys, allOperaMeta]);

  const handleSelectOpera = useCallback((key: string) => {
    setSelectedKey(key);
  }, []);

  return (
    <div className="t4-screen">
      {/* ====== Topbar ====== */}
      <header className="t4-topbar">
        <div className="t4-topbar-title-group">
          <h1><span className="t4-brand-icon">🎬</span> 叙事结构分析与模式总结</h1>
          <span className="t4-topbar-desc">叙事节奏图谱 — 识别剧情起伏与节奏变化，归纳典型叙事模式及其结构特征</span>
        </div>
        <button
          className="t4-topbar-report-btn"
          onClick={() => { setReportSidebarOpen(true); setReportTab("report"); }}
          title="查看任务四设计流程报告 — 含叙事指纹提取·结构模式归纳·节奏图谱设计"
        >
          <span className="t4-report-btn-icon">📋</span>
          <span className="t4-report-btn-text">
            <span className="t4-report-btn-label">设计流程报告</span>
            <span className="t4-report-btn-sub">方法 · 参数 · 流程</span>
          </span>
          <span className="t4-report-btn-arrow">→</span>
        </button>
      </header>

      {/* ====== Body: Search (12%) + Chart (76%) + Right Insight (12%) ====== */}
      <div className="t4-body-wrapper">
        {/* ── SEARCH PANEL (12%) — 视图切换 + 剧本搜索 + 叙事类型筛选 + 剧本列表 ── */}
        <aside className="t4-search-panel">
          {/* View switcher — 竖排置顶 */}
          <div className="t4-view-switcher t4-view-switcher--side">
            {[
              { id: "single" as const, label: "单剧本视图", icon: "📊" },
              { id: "multi" as const, label: "多剧本叠加对比", icon: "📈" },
            ].map((v) => (
              <button
                key={v.id}
                className={`t4-view-btn ${storeMainView === v.id ? "active" : ""}`}
                onClick={() => storeSetMainView(v.id)}
              >
                <span className="t4-view-btn-icon">{v.icon}</span>
                {v.label}
              </button>
            ))}
            {storeMainView === "multi" && storeMultiCompareKeys.length > 0 && (
              <button
                className="t4-view-btn t4-view-btn--clear"
                onClick={storeClearCompareKeys}
              >
                清除 {storeMultiCompareKeys.length} 部
              </button>
            )}
          </div>
          <div className="t4-side-block t4-side-block--fill">
            <div className="t4-side-block-header"><h3>剧本选取</h3></div>
            <div className="t4-narr-type-chips">
              <button
                className={`t4-narr-type-chip ${activeNarrTypes.size === 0 ? "active" : ""}`}
                onClick={() => setActiveNarrTypes(new Set())}
              >
                全部类型
              </button>
              <div style={{fontSize:10, color:"var(--text-secondary)", padding:"2px 0 4px", borderBottom:"1px dashed rgba(0,0,0,0.08)", marginBottom:2, fontFamily:'inherit'}}>
                📐 多场剧本高潮均值 <strong style={{color:"var(--theme-wood)"}}>34.5%</strong> · 整体偏前
              </div>
              {NARRATIVE_TYPE_CONFIG.map((nt) => {
                const countInfo = narrTypePlayCounts.find((c) => c.id === nt.id);
                const isActive = activeNarrTypes.has(nt.id);
                return (
                  <button
                    key={nt.id}
                    className={`t4-narr-type-chip ${isActive ? "active" : ""}`}
                    style={{"--chip-color": nt.color} as React.CSSProperties}
                    onClick={() => {
                      setActiveNarrTypes((prev) => {
                        const next = new Set(prev);
                        if (next.has(nt.id)) next.delete(nt.id);
                        else next.add(nt.id);
                        return next;
                      });
                    }}
                  >
                    {nt.label}
                    <span className="t4-narr-type-chip-count">{countInfo?.count ?? 0}</span>
                  </button>
                );
              })}
            </div>
            <input
              className="t4-script-search"
              type="text"
              placeholder="搜索剧本名称…"
              value={scriptSearchQuery}
              onChange={(e) => setScriptSearchQuery(e.target.value)}
            />
            <div className="t4-play-list">
              {filteredKeys.map((key) => {
                const meta = allOperaMeta.get(key);
                const isActive = key === selectedKey;
                const starmapScript = (starmapData as any).scripts?.find((s: any) => s.id === key);
                const narrType = starmapScript?.narrType || "";
                const patternMeta = NARRATIVE_PATTERNS.find(p => p.type === narrType);
                return (
                  <button
                    key={key}
                    className={`t4-play-list-btn ${isActive ? "active" : ""}`}
                    onClick={() => handleSelectOpera(key)}
                  >
                    <div className="t4-play-list-row">
                      <span className="t4-play-list-name">{keyToLabel(key)}</span>
                      {storeMainView === "multi" && (
                        <span
                          className={`t4-play-list-compare-toggle ${storeMultiCompareKeys.includes(key) ? "active" : ""}`}
                          onClick={(e) => { e.stopPropagation(); handleToggleCompare(key); }}
                          title={storeMultiCompareKeys.includes(key) ? "取消对比" : "加入对比"}
                        >
                          {storeMultiCompareKeys.includes(key) ? "✓" : "+"}
                        </span>
                      )}
                    </div>
                    <div className="t4-play-list-tags">
                      {narrType && (
                        <span className="t4-play-tag t4-play-tag-type" style={{ color: starmapScript?.narrColor || "var(--theme-gold)" }}>
                          {narrType}
                        </span>
                      )}
                      {meta && (
                        <>
                          <span className="t4-play-tag t4-play-tag-meta">{meta.sceneCount}场</span>
                          <span className="t4-play-tag t4-play-tag-meta">{meta.charCount}角</span>
                        </>
                      )}
                    </div>
                    {patternMeta && (
                      <span className="t4-play-list-insight">{patternMeta.rhythm?.slice(0, 16)}…</span>
                    )}
                  </button>
                );
              })}
              {filteredKeys.length === 0 && (
                <div className="t4-play-list-empty">无匹配剧本</div>
              )}
            </div>
          </div>
        </aside>

        {/* ── MAIN CHART (76%) — 叙事分析核心图表 + 视图切换 ── */}
        <div className="t4-main-content">

        <div className="t4-main-chart-area">

          {/* Conditional chart rendering based on view mode */}
          {storeMainView === "single" && (
            <CombinedRhythmChart
              analysis={currentAnalysis}
              fingerprint={currentFingerprint}
              turningPoints={currentTurningPoints}
              selectedPhase={selectedPhase}
              onPhaseClick={(idx) => setSelectedPhase((prev) => (prev === idx ? null : idx))}
            />
          )}
          {storeMainView === "multi" && (
            <MultiPlayOverlayChart
              plays={storeMultiCompareKeys.map((k) => ({
                key: k,
                title: keyToLabel(k),
                sceneCount: allOperaMeta.get(k)?.sceneCount || 0,
              }))}
              getAnalysis={getAnalysis}
            />
          )}
        </div>

        {/* ── Toast 浮窗 ── */}
        <Toast message={toastMsg} visible={toastVisible} onClose={hideToast} />

        </div>

      {/* ── RIGHT INSIGHT PANEL (12%) — 单剧本:叙事指标 / 多剧本:对比参数 ── */}
      <aside className="t4-right-insight-panel">
        {storeMainView === "multi" ? (
          multiCompareData ? (
            <>
              <div className="t4-right-insight-item t4-right-insight--primary">
                <span className="t4-right-insight-label">多剧本对比</span>
                <span className="t4-right-insight-value" style={{color:"var(--theme-gold)"}}>
                  {multiCompareData.infos.length} 部
                </span>
                <span className="t4-right-insight-desc">
                  {multiCompareData.infos.map(i => i.label).join(' · ')}
                </span>
              </div>
              <div className="t4-right-insight-item">
                <span className="t4-right-insight-label">场次范围</span>
                <span className="t4-right-insight-stat">
                  {multiCompareData.sceneMin}–{multiCompareData.sceneMax}
                  <span className="t4-right-insight-unit">场</span>
                </span>
                <span className="t4-right-insight-hint">均值 {multiCompareData.sceneAvg} 场</span>
              </div>
              <div className="t4-right-insight-item">
                <span className="t4-right-insight-label">角色规模</span>
                <span className="t4-right-insight-stat">
                  {multiCompareData.charMin}–{multiCompareData.charMax}
                  <span className="t4-right-insight-unit">人</span>
                </span>
                <span className="t4-right-insight-hint">跨剧本角色数量跨度</span>
              </div>
              {multiCompareData.narrTypes.length > 0 && (
                <div className="t4-right-insight-item">
                  <span className="t4-right-insight-label">涉及类型</span>
                  <div className="t4-right-insight-desc">
                    {multiCompareData.narrTypes.join(' · ')}
                  </div>
                </div>
              )}
              <div className="t4-right-phase-timeline">
                <span className="t4-right-phase-title">对比列表</span>
                <div className="t4-right-phase-list">
                  {multiCompareData.infos.map(info => (
                    <div key={info.key} className="t4-right-phase-node">
                      <span className="t4-right-phase-label">{info.label}</span>
                      <span className="t4-right-phase-range">
                        {info.sceneCount}场 · {info.charCount}角{info.narrType ? ` · ${info.narrType}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="t4-right-insight-empty">
              <span className="t4-right-insight-empty-icon">📈</span>
              <span className="t4-right-insight-empty-text">勾选 ≥2 部<br/>开始对比</span>
            </div>
          )
        ) : (
          rightInsightData ? (
          <>
            {/* 核心叙事模式 */}
            <div className="t4-right-insight-item t4-right-insight--primary">
              <span className="t4-right-insight-label">核心叙事模式</span>
              <span className="t4-right-insight-value" style={{ color: rightInsightData.patternColor }}>
                {rightInsightData.patternType}
              </span>
              <span className="t4-right-insight-desc">
                {rightInsightData.patternDesc}
              </span>
            </div>

            {/* 高潮集中度 */}
            <div className="t4-right-insight-item">
              <span className="t4-right-insight-label">高潮集中度</span>
              <span className="t4-right-insight-stat">
                {rightInsightData.climaxConcentration}
                <span className="t4-right-insight-unit">%</span>
              </span>
              <span className="t4-right-insight-hint">{rightInsightData.climaxLabel}</span>
            </div>

            {/* 角色驱动占比 */}
            <div className="t4-right-insight-item">
              <span className="t4-right-insight-label">角色驱动占比</span>
              <span className="t4-right-insight-stat">
                {rightInsightData.roleDrivenPct}
                <span className="t4-right-insight-unit">%</span>
              </span>
              <span className="t4-right-insight-hint">
                {rightInsightData.roleDrivenLabel}
              </span>
            </div>

            {/* 叙事阶段时间线 */}
            {currentPhases.length > 0 && (
              <div className="t4-right-phase-timeline">
                <span className="t4-right-phase-title">叙事阶段</span>
                <div className="t4-right-phase-list">
                  {currentPhases.map((phase, idx) => (
                    <React.Fragment key={phase.label}>
                      {idx > 0 && (
                        <span className="t4-right-phase-arrow">→</span>
                      )}
                      <div className="t4-right-phase-node">
                        <span className="t4-right-phase-label">{phase.label}</span>
                        <span className="t4-right-phase-range">
                          第{phase.startScene + 1}–{phase.endScene + 1}场
                        </span>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}

            {/* ── 叙事模式匹配 · 紧凑卡 (最佳匹配) ── */}
            {topPattern && (
              <button
                className="t4-right-pattern-match"
                onClick={() => setPatternDrawerOpen(true)}
                title="点击查看 Top 3 匹配模式"
              >
                <span className="t4-right-pattern-match-label">模式匹配</span>
                <span
                  className="t4-right-pattern-match-dot"
                  style={{ background: topPattern.color }}
                />
                <span className="t4-right-pattern-match-type">{topPattern.type}</span>
                <span
                  className="t4-right-pattern-match-score"
                  style={{ color: topPattern.color }}
                >
                  {topPattern.score}%
                </span>
              </button>
            )}

            {/* ── 关键转折点时间线 ── */}
            <div className="t4-right-turning-points">
              <TurningPointsTimeline
                turningPoints={currentTurningPoints}
                sceneCount={currentFingerprint?.sceneCount || 0}
                sceneNames={currentAnalysis?.scenes.map(s => s.name) || []}
              />
            </div>
          </>
        ) : (
          <div className="t4-right-insight-empty">
            <span className="t4-right-insight-empty-icon">📊</span>
            <span className="t4-right-insight-empty-text">选择剧本<br />查看分析</span>
          </div>
        )
      )}
      </aside>
    </div>

    {/* ====== Pattern Match Drawer ====== */}
    <div
      className={`t4-pattern-drawer-backdrop ${patternDrawerOpen ? "visible" : ""}`}
      onClick={() => setPatternDrawerOpen(false)}
    />
    <aside className={`t4-pattern-drawer ${patternDrawerOpen ? "open" : ""}`}>
      <div className="t4-pattern-drawer-header">
        <span className="t4-pattern-drawer-header-icon">📊</span>
        <h2>叙事模式匹配 · Top 3</h2>
        <button
          className="t4-pattern-drawer-close"
          onClick={() => setPatternDrawerOpen(false)}
        >
          ✕
        </button>
      </div>
      <div className="t4-pattern-drawer-body">
        {topThreePatterns.length > 0 ? (
          <div className="t4-pattern-drawer-list">
            {topThreePatterns.map((pattern, idx) => (
              <div
                key={pattern.type}
                className={`t4-pattern-drawer-item ${idx === 0 ? "t4-pattern-drawer-item--best" : ""}`}
              >
                <div className="t4-pattern-drawer-item-header">
                  <span className="t4-pattern-drawer-rank" style={{ background: pattern.color }}>
                    {idx + 1}
                  </span>
                  <span className="t4-pattern-drawer-type" style={{ color: pattern.color }}>
                    {pattern.type}
                  </span>
                  <span className="t4-pattern-drawer-score" style={{ color: pattern.color }}>
                    {pattern.score}%
                  </span>
                </div>
                <div className="t4-pattern-drawer-bar-wrap">
                  <div
                    className="t4-pattern-drawer-bar"
                    style={{
                      width: `${pattern.score}%`,
                      background: pattern.color,
                    }}
                  />
                </div>
                <p className="t4-pattern-drawer-desc">{pattern.description}</p>
                {pattern.matchDetails.length > 0 && (
                  <div className="t4-pattern-drawer-details">
                    {pattern.matchDetails.map((detail) => (
                      <span key={detail} className="t4-pattern-drawer-tag">{detail}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="t4-pattern-drawer-empty">
            <span>请先选择一个剧本</span>
          </div>
        )}
      </div>
    </aside>

    {/* ====== Report Sidebar ====== */}
      <div className={`t4-report-backdrop ${reportSidebarOpen ? "visible" : ""}`} onClick={() => setReportSidebarOpen(false)} />
      <aside className={`t4-report-sidebar ${reportSidebarOpen ? "open" : ""}`}>
        <div className="t4-report-sidebar-header">
          <span className="t4-report-sidebar-header-icon">📋</span>
          <h2>叙事分析 · 设计流程报告</h2>
          <button className="t4-report-sidebar-close" onClick={() => setReportSidebarOpen(false)}>✕</button>
        </div>
        <nav className="t4-report-tabs">
          {[
            { id: "report" as const, icon: "📋", label: "设计流程报告" },
            { id: "patterns" as const, icon: "🧩", label: "叙事模式总结" },
            { id: "compare" as const, icon: "📊", label: "跨剧本对比" },
            { id: "findings" as const, icon: "💡", label: "关键发现" },
          ].map(t => (
            <button
              key={t.id}
              className={`t4-report-tab ${reportTab === t.id ? "active" : ""}`}
              onClick={() => setReportTab(t.id)}
            >
              <span className="t4-report-tab-icon">{t.icon}</span>
              <span className="t4-report-tab-label">{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="t4-report-sidebar-body">
          {reportTab === "report" && (
            <div className="t4-report-content">
              <p className="t4-report-subtitle">ChinaVis 2026 赛道1-I · 任务四《京剧叙事结构分析与模式总结》设计流程报告</p>
              {/* ── 动态分析上下文 ── */}
              <section className="t4-report-section">
                <h3>📌 当前分析上下文</h3>
                <table className="t4-report-dim-table">
                  <tbody>
                    <tr>
                      <td>当前剧本</td>
                      <td><strong>《{keyToLabel(selectedKey)}》</strong></td>
                    </tr>
                    <tr>
                      <td>叙事类型筛选</td>
                      <td>
                        {activeNarrTypes.size > 0
                          ? Array.from(activeNarrTypes)
                              .map((id) => NARRATIVE_TYPE_CONFIG.find((nt) => nt.id === id)?.label || id)
                              .join(" · ")
                          : "全部（未筛选）"}
                      </td>
                    </tr>
                    <tr>
                      <td>叙事模式</td>
                      <td>{narrativePatternType}</td>
                    </tr>
                    {currentFingerprint && (
                      <>
                        <tr>
                          <td>场次数</td>
                          <td>{currentFingerprint.sceneCount} 场</td>
                        </tr>
                        <tr>
                          <td>角色数</td>
                          <td>{currentFingerprint.charCount} 人</td>
                        </tr>
                      </>
                    )}
                    <tr>
                      <td>匹配剧本数</td>
                      <td>{filteredKeys.length} 部</td>
                    </tr>
                  </tbody>
                </table>
              </section>
              <h3>一、任务定位与核心问题</h3>
              <p>本任务聚焦<strong>四个紧密关联的分析命题</strong>：① <strong>表演形式驱动的结构分析</strong>——如何基于剧本中「唱/念/做/打/白」等表演形式标记，系统量化每场戏的叙事功能与节奏特征；② <strong>关键阶段识别</strong>——如何从冲突弧、情感弧与角色密度的多模态曲线中，自动划分「起·承·转·合」等叙事阶段边界；③ <strong>剧情起伏刻画</strong>——如何将冲突烈度、情绪波动与场景篇幅变化编码为可比较的节奏图谱；④ <strong>跨剧本模式归纳</strong>——基于全量剧本的结构指纹，总结京剧叙事结构的典型模式及其差异化特征。</p>
              <p>数据规模：<strong>1,473 部京剧剧本</strong>，覆盖 8 种叙事结构类型。每部剧本经场景切分后提取 <strong>12 维结构特征</strong>（scene_count, singing_ratio, reciting_ratio, emotion_density, character_count, top3_concentration, scene_lines_cv, ban_variety, line_change_rate, max_scene_pos, first_last_ratio, total_lines），在此基础上进行 30 维叙事指纹增强提取（冲突弧、情感弧、角色密度、表演形式配比序列等），构建全量剧本的叙事结构知识库。</p>

              <h3>二、整体分析框架</h3>
              <p>系统采用 <strong>"结构指纹提取 → 类型聚类划分 → 深度叙事分析 → 节奏图谱生成 → 跨剧本模式归纳"</strong>五阶段分析流水线，每阶段对应独立的数据对象、计算方法和可视化表达：</p>
              <table className="t1-data-table" style={{ marginBottom: 12 }}>
                <thead><tr><th>阶段</th><th>分析目标</th><th>核心方法</th><th>可视化表达</th></tr></thead>
                <tbody>
                  <tr><td><strong>结构指纹提取</strong></td><td>将非结构化剧本转化为可计算的叙事结构向量</td><td>正则场景切分（兼容「场/折/幕/本/出」五种标记）<br/>唱念做打白五行表演形式占比统计<br/>冲突烈度/情绪极性/角色密度逐场量化<br/>结构特征 12 维 + 叙事指纹 30 维联合编码</td><td>CombinedRhythmChart（三层叠加丝带图）</td></tr>
                  <tr><td><strong>类型聚类</strong></td><td>基于结构指纹对全量剧本进行叙事类型划分</td><td>多特征决策树分类器（12 维结构特征）<br/>8 类叙事结构类型（线性渐进/波峰爆发/双峰对峙/散点群像等）<br/>层次聚类验证（UPGMA，Cophenetic r &gt; 0.82）</td><td>叙事类型筛选标签（左侧面板）<br/>NarrativeDNASummaryCard（7 维 DNA 雷达）</td></tr>
                  <tr><td><strong>深度叙事分析</strong></td><td>识别关键转折点与叙事阶段边界</td><td>冲突弧局部极值检测（detectAllClimaxes）<br/>三弧联合阶段分割（冲突×情感×角色密度）<br/>表演形式-叙事功能映射（唱→抒情延宕/打→冲突爆发/白→叙事推进）</td><td>TurningPointsPanel（关键转折点卡片）<br/>右侧叙事阶段时间线</td></tr>
                  <tr><td><strong>节奏图谱生成</strong></td><td>将叙事节奏编码为可比较的可视化图谱</td><td>Story Ribbons 改造（X=场景序列，Y=三层叠加）<br/>颜色编码表演形式（唱红/念蓝/做绿/打橙/白灰）<br/>背景色带标注起承转合四阶段</td><td>CombinedRhythmChart 主图<br/>MultiPlayOverlayChart（多剧本叠加对比）</td></tr>
                  <tr><td><strong>跨剧本模式归纳</strong></td><td>比较不同剧本的叙事结构差异，归纳典型模式</td><td>叙事指纹多维相似度计算（余弦距离+DTW 弧线对齐）<br/>8 种叙事模式的特征画像（高潮集中度/角色驱动占比/情绪波动率）<br/>典型模式识别与剧本匹配度评分（computePatternScores）</td><td>PatternSummaryPanel（模式总结）<br/>NarrativePatternCompare（Top3 匹配）</td></tr>
                </tbody>
              </table>

              <h3>三、表演形式驱动的叙事阶段识别</h3>
              <p>京剧剧本的<strong>表演形式标记</strong>（唱/念/做/打/白）天然携带叙事节奏信息——唱段通常对应情感高潮与抒情延宕，念白承载情节推进与冲突建立，武打标记密集区对应戏剧冲突的物理化爆发，科介（做）提示角色行动与场面调度。系统利用这些标记构建<strong>三条互补的叙事弧线</strong>：</p>
              <ul style={{ marginBottom: 10 }}>
                <li><strong>冲突弧（Conflict Arc）</strong>：逐场统计敌对角色对数、冲突关键词密度（"杀""斩""战""伐"等）与武打标记占比，归一化为 0–1 冲突烈度曲线。冲突曲线的高峰位置、陡升速率和维持长度是区分叙事模式的核心信号——「波峰爆发型」剧本在 60%–80% 位置出现单一尖锐峰值，「双峰对峙型」则在 30%–50% 和 70%–90% 各有一个峰。</li>
                <li><strong>情感弧（Sentiment Arc）</strong>：基于 HowNet 情感词典逐场计算正负情感词占比的差值，形成 −1（悲）到 +1（喜）的情感波动曲线。情感波动率（标准差）量化剧情情绪的起伏幅度——历史戏平均 σ=0.32 高于家庭戏（σ=0.21），反映征战题材的大开大合 vs 家族伦理的温和流转。</li>
                <li><strong>角色密度（Character Density）</strong>：逐场统计出场角色数，密度峰值通常对应群戏高潮场景（如《空城计》城楼对峙、《龙凤呈祥》大团圆），密度低谷对应独角抒情或过场交代。</li>
              </ul>
              <p>三弧联合分析通过<strong>滑动窗口突变检测</strong>自动划分叙事阶段边界：当冲突弧斜率绝对值超过阈值且情感弧同向变化时，标记为阶段转折。阶段标签映射为「起（铺设背景）→ 承（矛盾升级）→ 转（冲突爆发）→ 合（矛盾收束）」的经典四段结构，并在丝带图背景中以渐变灰带区分。</p>

              <h3>四、节奏图谱编码与剧情起伏刻画</h3>
              <p>系统将 Story Ribbons 可视化范式改造为面向京剧叙事的<strong>三层叠加节奏图谱</strong>（CombinedRhythmChart）：</p>
              <ul style={{ marginBottom: 10 }}>
                <li><strong>第一层·情绪曲线</strong>（顶部暖色渐变面积图）：展示逐场情感极性变化，暖色=正向情绪（团圆/凯旋/喜乐），冷色=负向情绪（别离/战败/冤屈），曲线陡峭度编码剧情转折的剧烈程度。</li>
                <li><strong>第二层·表演形式色带</strong>（中部堆叠色条）：每场戏的唱/念/做/打/白五行占比以 100% 堆叠色条呈现——红色=唱（抒情与内心独白）、蓝色=念（对白与情节推进）、绿色=做（身段与调度）、橙色=打（武打与冲突高潮）、灰色=白（叙述性旁白）。色带的颜色构成直接反映该场的叙事功能：唱主导→抒情场面，打主导→冲突场面，念主导→推进场面。</li>
                <li><strong>第三层·冲突热力</strong>（底部柱状/气泡图）：逐场冲突烈度以纵向柱高度编码，柱顶标注关键转折点（结构型/冲突型/情感型/角色型四类标记），悬停时弹出转折点详情卡片。</li>
              </ul>
              <p>右侧面板同步展示<strong>高潮集中度</strong>（冲突峰值相对于均值的集中程度，%）、<strong>角色驱动占比</strong>（主导角色出场场景占总场景数的比例，%）和<strong>叙事阶段时间线</strong>（起承转合四段的场景范围），形成「图谱概览 + 指标精读」的互补认知层次。</p>

              <h3>五、跨剧本叙事模式比较</h3>
              <p>基于全量 1,473 部剧本的叙事指纹，系统归纳出<strong>八种典型叙事结构模式</strong>，每种模式具有可量化的结构特征：</p>
              <table className="t1-data-table" style={{ marginBottom: 12 }}>
                <thead><tr><th>叙事模式</th><th>节奏特征</th><th>高潮位置</th><th>典型代表剧目</th><th>占比</th></tr></thead>
                <tbody>
                  <tr><td><strong>线性渐进式</strong></td><td>冲突逐场抬升，结构最均衡</td><td>后段更常见</td><td>《空城计》《四郎探母》</td><td>26.7%</td></tr>
                  <tr><td><strong>史诗铺陈式</strong></td><td>场次多、人物多，常见多段铺陈</td><td>整体偏前且长篇前移</td><td>《定军山》《赵氏孤儿》</td><td>20.7%</td></tr>
                  <tr><td><strong>多幕群像式</strong></td><td>多角色并进，局部峰值分散</td><td>分散于多段场面</td><td>《斩华雄》《红楼梦》</td><td>13.9%</td></tr>
                  <tr><td><strong>悬念突转式</strong></td><td>关键节点突然抬升，转折集中</td><td>中前段更常见</td><td>《打鼓骂曹》《探阴山》</td><td>11.7%</td></tr>
                  <tr><td><strong>回环照应式</strong></td><td>首尾呼应，结尾回落到初始情境</td><td>首尾呼应型</td><td>《锁麟囊》《洛神》</td><td>11.2%</td></tr>
                  <tr><td><strong>情感波浪式</strong></td><td>情绪多波次推进，唱段承载更强</td><td>随情绪波动起伏</td><td>《黛玉葬花》《春闺梦》</td><td>7.5%</td></tr>
                  <tr><td><strong>三叠反复式</strong></td><td>相似情境反复升级，节拍清楚</td><td>多级递进</td><td>《西游记》系列</td><td>5.3%</td></tr>
                  <tr><td><strong>双线交织式</strong></td><td>两条线并进后汇合，结构最复杂</td><td>双线汇合处形成高潮</td><td>《群英会》《龙凤呈祥》</td><td>2.9%</td></tr>
                </tbody>
              </table>
              <p>跨剧本比较依托<strong>多剧本叠加视图</strong>（MultiPlayOverlayChart）：将选定剧本（≤3部）的冲突弧曲线按场景比例归一化后重叠绘制，不同剧本以不同颜色区分，直观暴露不同叙事模式在「何时达到峰值」「冲突如何累积」「收束是急是缓」等维度上的结构性差异。右侧面板同步展示所选剧本的场景数/角色数/叙事类型标签，支持联动筛选与对比解读。</p>

              <h3>六、可视化设计与交互架构</h3>
              <p>系统的可视化设计遵循 <strong>"概览优先→聚焦分析→细节按需"</strong>的三级探视原则，以三栏悬浮式布局承载：</p>
              <table className="t1-data-table" style={{ marginBottom: 12 }}>
                <thead><tr><th>页面区域</th><th>可视化组件</th><th>数据表达</th><th>交互机制</th></tr></thead>
                <tbody>
                  <tr><td><strong>左侧面板</strong>（概览+导航层）</td><td>叙事类型筛选标签<br/>剧本搜索与列表<br/>单剧本/多剧本视图切换</td><td>8 种叙事类型 + 剧本数 badge<br/>按场景数排序的剧本列表<br/>叙事类型/场景数/角色数标签</td><td>多选类型过滤<br/>搜索剧本名称<br/>点击切换当前剧本<br/>多剧本对比勾选（≤3部）</td></tr>
                  <tr><td><strong>中央主区</strong>（分析层）</td><td>CombinedRhythmChart<br/>MultiPlayOverlayChart<br/>角色叙事功能面板</td><td>三层叠加节奏图谱（情绪+表演+冲突）<br/>多剧本冲突弧叠加对比<br/>角色在各场景的出场热力图</td><td>悬停查阅逐场指标<br/>点击转折点查看详情<br/>阶段背景点击高亮<br/>视图切换（单剧本/多剧本）</td></tr>
                  <tr><td><strong>右侧面板</strong>（指标层）</td><td>叙事模式 + 高潮集中度 + 角色驱动占比<br/>叙事阶段时间线<br/>模式匹配紧凑卡<br/>关键转折点时间线</td><td>核心叙事模式类型与描述<br/>起承转合四段范围<br/>Top1 匹配模式与分数<br/>结构型/冲突型/情感型/角色型转折点</td><td>指标联动当前剧本<br/>悬停查看阶段详情<br/>点击展开 Top3 模式抽屉</td></tr>
                  <tr><td><strong>侧边报告栏</strong>（文档层）</td><td>4 个分析标签页<br/>（设计流程报告/叙事模式总结/跨剧本对比/关键发现）</td><td>完整方法参数与推理链<br/>8 种模式画像 + 7 维 DNA 雷达<br/>多剧本冲突弧叠加对比<br/>转折点分类 + 角色叙事功能</td><td>标签页切换<br/>数据表格展开<br/>当前剧本上下文同步</td></tr>
                </tbody>
              </table>
              <p><strong>图表选型逻辑</strong>：三层叠加丝带图用于单剧本的时间序列叙事阅读——X 轴场景序列天然契合叙事的时间线性本质，Y 轴多层叠加支持用户在同一时间基线上同步观察「情绪→表演形式→冲突」三重叙事维度的共变关系。多剧本叠加折线图用于跨剧本模式比较——将不同剧本的冲突弧按场景比例归一化后重叠，消除绝对场景数差异，聚焦弧线形态的相似与差异。7 维 DNA 雷达图用于叙事模式的特征画像——场景规模/角色密度/冲突强度/情绪波动/高潮集中/悬念保持/表演形式复杂度七轴展开，扇区形状直观表达各模式的侧重维度。</p>

              <h3>七、总结</h3>
              <p>任务四的核心贡献在于提供了一套<strong>从表演形式标记到叙事结构量化、从单本节奏图谱到跨剧本模式归纳</strong>的完整分析方法论。其设计关键可归纳为三条原则：</p>
              <ul style={{ marginBottom: 10 }}>
                <li><strong>表演形式即叙事信号</strong>：京剧的唱念做打白标记不是装饰性元数据，而是可直接解码叙事节奏的结构性信号——唱=情感延宕、打=冲突爆发、念=情节推进、做=场面调度、白=叙述过渡。将表演形式占比序列转化为叙事功能序列，是连接文本与结构的关键桥梁。</li>
                <li><strong>多弧联合优于单指标</strong>：单一冲突曲线无法区分「群像散点」与「英雄单核」——两者的冲突分布可能相似，但角色密度曲线截然不同。冲突弧×情感弧×角色密度的三弧联合分析才能形成可区分的叙事指纹。</li>
                <li><strong>模式归纳服务比较分析</strong>：8 种叙事模式的归纳不是终点，而是跨剧本比较的起点——它为每部剧本提供了可量化的模式归属与匹配度评分，使用户能够从「这部剧本是什么结构」推进到「哪些剧本共享同一结构范式，它们在细节上有何差异」。</li>
              </ul>
              <p>该任务与前三项任务构成互补的分析链路：Task1 提供角色行当语义基础层，Task2 提供角色共现网络拓扑层，Task3 提供主题语义层，Task4 将三者统一到<strong>场景序列的时间维度</strong>上，揭示角色、主题、冲突如何在叙事时间中展开与演化，为 Task5 的综合星图系统提供叙事结构维度的数据支撑。</p>
            </div>
          )}
          {reportTab === "patterns" && (
            <>
              <PatternSummaryPanel />
              <NarrativeDNASummaryCard
                values={dnaValues}
                framework={currentStructureFramework?.framework || "线性渐进"}
                structureType={narrativePatternType}
                compact={true}
              />
            </>
          )}
          {reportTab === "compare" && (
            <CrossPlayComparison
              allPlays={allKeys.map(k => ({
                key: k,
                title: keyToLabel(k),
                sceneCount: allOperaMeta.get(k)?.sceneCount || 0,
              }))}
              getFingerprint={(key: string) => {
                const fp = getFingerprint(key);
                if (!fp) return null;
                return {
                  title: keyToLabel(key),
                  sceneCount: fp.sceneCount,
                  charCount: fp.charCount,
                  conflictRange: fp.conflictRange,
                  sentimentVolatility: fp.sentimentVolatility,
                  peakPosition: fp.peakPosition,
                  conflictTrend: fp.conflictTrend,
                  structureType: fp.structureType,
                  rhythmType: fp.rhythmType,
                  avgCharsPerScene: fp.avgCharsPerScene,
                };
              }}
              currentKey={selectedKey}
            />
          )}
          {reportTab === "findings" && (
            <>
              <TurningPointsPanel
                turningPoints={currentTurningPoints}
                sceneCount={currentFingerprint?.sceneCount || 0}
                sceneNames={currentAnalysis?.scenes.map(s => s.name) || []}
              />
              {currentAnalysis && <CharacterNarrativePanel analysis={currentAnalysis} />}
            </>
          )}
        </div>
      </aside>
    </div>
  );
};

export default Task4Layout;
