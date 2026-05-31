import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import "./Task4Layout.scss";
import OperaRibbonViewer, {
  CharacterEmotionSparkline,
  RHYTHM_LABELS,
  ROLE_GROUP_COLORS,
} from "./OperaRibbonViewer";
import {
  analyzeStoryRibbons,
  extractFingerprint,
  RibbonAnalysisResult,
  StoryFingerprint,
  RawStoryInput,
} from "../../utils/p4_story_ribbon_core";
import operaSamplesRaw from "../../data/opera-samples.json";

/* ================================================================
   Selection Report — inline data
   ================================================================ */

interface ScriptCard {
  id: number;
  name: string;
  alias: string;
  collection: string;
  collectionScale: string;
  era: string;
  charCount: number;
  roles: string;
  wordCount: string;
  summary: string;
  reasons: string[];
  structureType: string;
  dominantRole: string;
  narrativeArc: string;
}

const SELECTED_SCRIPTS: ScriptCard[] = [
  {
    id: 5893, name: "空城计", alias: "抚琴退兵",
    collection: "《戏考》", collectionScale: "448 部（数据集最大合集，占 30.4%）",
    era: "三国", charCount: 7, roles: "老生 2、净 2、小生 1、丑 2", wordCount: "3,497 字",
    summary: "马谡失街亭，司马懿大军压境。诸葛亮于西城兵微将寡，乃设空城之计——大开城门，自坐城楼抚琴。司马懿疑有埋伏，竟引兵退去。",
    reasons: [
      "悬念型叙事结构：全剧围绕单一戏剧危机展开，通过「信息不对称」制造强烈的戏剧张力，是京剧中最经典的「心理博弈」叙事模式。",
      "老生行当的巅峰代表：诸葛亮是老生核心人物，本剧唱做并重，三句「再探」配合三种面色变化，是公认的表演艺术范本。",
      "数据代表性：来自最大合集，角色规模处均值（5.4）附近，行当分布均衡（生净丑兼有），为典型「中等规模历史剧」。",
      "叙事结构清晰可解剖：线性因果链（失街亭→围西城→设空城→退敌），起承转合分明，适合作为叙事结构分析教学案例。",
    ],
    structureType: "悬念型", dominantRole: "老生", narrativeArc: "外部危机驱动 · 单次博弈",
  },
  {
    id: 6066, name: "贵妃醉酒", alias: "百花亭",
    collection: "《戏考》", collectionScale: "448 部（数据集最大合集）",
    era: "唐", charCount: 3, roles: "花旦 1、小生 1、丑 1", wordCount: "2,329 字",
    summary: "杨贵妃在百花亭设宴等候唐玄宗，被告知皇帝已往江妃宫。杨贵妃由期待转为失望、妒恨、借酒浇愁，最终放浪形骸、倦极回宫。",
    reasons: [
      "内心情感型叙事结构：几乎是纯内心叙事——外部事件仅在第一幕发生，此后全剧围绕杨贵妃的内在情感变化展开。",
      "最小角色规模的极端代表：仅 3 个角色，极简的角色配置使叙事分析可聚焦于单一角色的情感弧线。",
      "旦角艺术的最高成就：梅兰芳将此剧锤炼为旦角做工戏巅峰——醉酒的三层递进（微醺→沉醉→狂放）构成完整叙事弧。",
      "与《空城计》形成互补对照：一个是智慧与克制，一个是情感与失控；一个外部危机驱动，一个内心情感驱动。",
    ],
    structureType: "内心型", dominantRole: "花旦", narrativeArc: "情感变化驱动 · 三层递进",
  },
  {
    id: 7103, name: "赵氏孤儿", alias: "",
    collection: "马连良剧本选", collectionScale: "9 部（名家藏本）",
    era: "春秋", charCount: 23, roles: "老生 5、旦 3、净 7、小生 2、武生 3、丑 1、杂 2", wordCount: "23,264 字",
    summary: "晋灵公荒淫无道，宠信奸臣屠岸贾。赵盾忠言进谏遭陷害，满门三百口被杀。赵氏遗孤在程婴和公孙杵臼的舍命保护下得以存活。程婴忍辱负重十五年，将孤儿抚养成人，最终复仇。",
    reasons: [
      "史诗型跨代叙事结构：时间跨度长达十五年，涉及三代人、多个政治势力的角逐。叙事分为「灭门」和「复仇」两大章节。",
      "行当最齐全的群戏代表：23 个角色覆盖 7 个行当类别，叙事在多角色类型间切换呈现多维视角。",
      "名家演出本的特殊文献价值：来自马连良剧本选，附有详细的角色心理刻画和唱腔设计说明。",
      "道德叙事的经典结构：忠奸对立→牺牲→潜伏→复仇，具有跨文化的叙事学价值。",
    ],
    structureType: "史诗型", dominantRole: "老生 / 净", narrativeArc: "命运/道德驱动 · 跨代复仇",
  },
  {
    id: 7050, name: "连环套", alias: "",
    collection: "《传统戏曲剧目资料汇编》", collectionScale: "2 部（罕见藏本）",
    era: "清", charCount: 30, roles: "武生 1、净 10、老生 4、武丑 1、丑 3、群演 11", wordCount: "23,696 字",
    summary: "连环套寨主窦尔敦盗走御马，嫁祸黄三太。黄天霸只身拜山，窦尔敦感其胆色，约定比武。不料朱光祖夜盗窦尔敦的护手双钩，施反间计使其降服。",
    reasons: [
      "猫鼠追逐型叙事结构：由《行围》《盗马》《拜山》《盗钩》《被骗》五折构成，呈现完整的悬念叙事链。",
      "武戏叙事的代表：以武生、净、武丑为三核心，是「武戏文唱」的典范——动作场面承载叙事功能。",
      "罕见的来源合集：仅收录 2 部剧本，由李洪春、侯喜瑞口述，保留了杨小楼演出本原貌。",
      "反英雄叙事：窦尔敦并非传统反派，黄天霸反而是官府鹰犬，道德模糊性使叙事分析可探讨深层主题。",
    ],
    structureType: "追逐型", dominantRole: "武生 / 净", narrativeArc: "智力博弈驱动 · 多回合对决",
  },
  {
    id: 6653, name: "打面缸", alias: "周腊梅",
    collection: "《京剧汇编》", collectionScale: "360 部（数据集第二大合集，占 24.4%）",
    era: "古代", charCount: 5, roles: "丑 4、旦 1", wordCount: "8,449 字",
    summary: "妓女周腊梅从良，县太爷配与衙役张才，实则与王书吏、四老爷均欲染指。三人先后登门，被周腊梅分藏于灶里、面缸、床下。张才折返，逐一揪出，三人狼狈赠银而去。",
    reasons: [
      "喜剧型（闹剧）叙事结构：全剧围绕「藏人与被揭穿」的喜剧性情境展开，代表京剧叙事光谱中不可或缺的喜剧一端。",
      "丑角主导的极端案例：5 个角色中 4 个是丑角，丑角在叙事中通常承担配角功能，本剧以丑角为核心推动全部情节。",
      "民间讽刺叙事：讽刺县官、书吏等基层官吏的虚伪好色，属于底层视角的讽刺喜剧。",
      "三叠式喜剧结构：三次藏入、三次揪出的反复结构，是民间叙事中经典的「三次重复」模式。",
    ],
    structureType: "喜剧型", dominantRole: "丑", narrativeArc: "误解/揭露驱动 · 三叠重复",
  },
];

const COMPARISON_TABLE = [
  ["来源合集", "《戏考》", "《戏考》", "马连良剧本选", "传统戏曲剧目资料汇编", "《京剧汇编》"],
  ["合集规模", "448 部", "448 部", "9 部", "2 部", "360 部"],
  ["角色数", "7", "3", "23", "30", "5"],
  ["剧本长度", "3,497 字", "2,329 字", "23,264 字", "23,696 字", "8,449 字"],
  ["主导行当", "老生", "花旦", "老生/净", "武生/净", "丑"],
  ["行当种类", "4 种", "3 种", "7 种", "5 种+", "2 种"],
  ["叙事结构", "悬念型", "内心型", "史诗型", "追逐型", "喜剧型"],
  ["时间跨度", "数日", "一夜", "十五年", "数日", "一夜"],
  ["叙事驱动", "外部危机", "情感变化", "命运/道德", "智力博弈", "误解/揭露"],
];

/* ================================================================
   Narrative pattern summaries — 叙事模式总结
   ================================================================ */

interface NarrativePattern {
  type: string;
  color: string;
  description: string;
  rhythm: string;
  typicalStructure: string;
  emotionCurve: string;
  keyFeature: string;
}

const NARRATIVE_PATTERNS: NarrativePattern[] = [
  {
    type: "悬念型", color: "#96544D",
    description: "以信息不对称为核心驱动力，观众知晓而剧中人不知，通过悬念的建立、维持与揭示推动剧情发展。常见于军事智谋剧与公案剧。",
    rhythm: "单峰急冲型：从悬念建立开始持续攀升，在高潮处集中释放",
    typicalStructure: "危机爆发 → 信息差建立 → 多方博弈 → 悬念揭示 → 危机解除",
    emotionCurve: "∧ 型（单峰）：紧张感持续上升至高潮后迅速回落",
    keyFeature: "观众处于「全知」位置，欣赏剧中人物在信息迷雾中的抉择",
  },
  {
    type: "内心型", color: "#B89B6D",
    description: "外部事件仅作为触发，核心叙事围绕角色的内心情感变化展开。剧情驱动从「发生了什么」转向「感受到了什么」。多见于旦角情感戏。",
    rhythm: "波浪递进型：情感层层叠加，每一波比前一波更深更烈",
    typicalStructure: "期待建立 → 期待受挫 → 情感内转 → 层层宣泄 → 疲惫归寂",
    emotionCurve: "层层递进上升型：微醺→沉醉→狂放，三阶递进",
    keyFeature: "极少的角色配置使情感弧线完全聚焦于单一角色的内在变化",
  },
  {
    type: "史诗型", color: "#5E6B76",
    description: "跨越大时间尺度（数年至数十年），涉及多代人、多势力角逐。叙事分为多个大章节，每章有独立的起承转合，整体构成宏大的道德叙事。",
    rhythm: "双峰跨越型：前半部「灭门」与后半部「复仇」各形成独立高潮",
    typicalStructure: "秩序建立 → 秩序崩塌（灭门） → 潜伏隐匿 → 力量积蓄 → 秩序重建（复仇）",
    emotionCurve: "M 型（双峰）：悲壮高潮→压抑低谷→复仇高潮→升华落幕",
    keyFeature: "道德叙事驱动，忠奸对立贯穿始终，牺牲与复仇构成叙事双翼",
  },
  {
    type: "追逐型", color: "#7F968D",
    description: "以「犯案—追查—对决」为核心链，包含多回合智力或武力博弈。每回合有独立的胜负，但整体指向最终对决。常见于武侠公案剧。",
    rhythm: "锯齿递进型：多回合对抗，每回合有小高潮，最终指向大对决",
    typicalStructure: "犯案 → 侦察 → 第一次交锋 → 计中计 → 第二次交锋 → 降服/落网",
    emotionCurve: "锯齿上升型：多次对决形成反复紧张-释放，但总体紧张度递增",
    keyFeature: "计中计的反间结构是核心叙事装置，道德模糊性增加叙事深度",
  },
  {
    type: "喜剧型", color: "#B89B6D",
    description: "以「误解/隐藏/揭露」的喜剧性情境为核心，通过反复的藏与露制造笑料。通常采用「三次重复」的民间叙事模式，节奏轻快。",
    rhythm: "阶梯攀升型：三次藏入逐次升级，三次揪出逐次暴露，构成阶梯式喜剧节奏",
    typicalStructure: "情境建立 → 第一次藏入 → 第二次藏入 → 第三次藏入 → 逐层揭露 → 谐谑收场",
    emotionCurve: "台阶上升型：每一轮「藏-揪」构成一个喜剧节拍，三拍叠加至最终释放",
    keyFeature: "底层视角讽刺上位者，丑角主导叙事，颠覆常规行当权力结构",
  },
];

/* ================================================================
   Character narrative function — 角色叙事功能
   ================================================================ */

interface CharacterNarrativeRole {
  role: string;
  function: string;
  description: string;
  examples: string[];
}

const CHAR_NARRATIVE_ROLES: CharacterNarrativeRole[] = [
  { role: "主角/核心驱动者", function: "推动剧情发展的核心力量", description: "拥有最完整的叙事弧线，经历最显著的变化或揭示。其欲望/目标是叙事的核心驱动力。", examples: ["诸葛亮（空城计）", "杨贵妃（贵妃醉酒）", "程婴（赵氏孤儿）"] },
  { role: "对抗者/阻碍者", function: "制造冲突与障碍", description: "与主角形成对立，制造核心冲突。在京剧叙事中常以净行或反派角色承担，但京剧中的「反派」常具有人格复杂性。", examples: ["司马懿（空城计）", "屠岸贾（赵氏孤儿）", "窦尔敦（连环套）"] },
  { role: "辅助者/帮手", function: "协助主角完成叙事目标", description: "在关键时刻提供帮助、信息或情感支持。常为丑行或次要行当承担，但叙事功能不可或缺。", examples: ["朱光祖（连环套）", "公孙杵臼（赵氏孤儿）", "张才（打面缸）"] },
  { role: "信息传递者", function: "触发叙事转折的关键信息源", description: "通过传递消息改变剧情走向。在京剧中常由探子、太监、丫鬟等功能性角色承担。", examples: ["报信太监（贵妃醉酒）", "探子（空城计）", "周腊梅（打面缸）"] },
  { role: "旁观者/评论者", function: "提供外部视角与社会评价", description: "通过旁观评论，为观众提供道德判断或情感参照。丑角常承担此功能，以插科打诨承载社会批判。", examples: ["众将（空城计）", "宫人（贵妃醉酒）", "四老爷/王书吏（打面缸）"] },
];

/* ================================================================
   Theme colors — consistent with 燕京清晖
   ================================================================ */

const RHYTHM_AXIS_COLORS: Record<string, string> = {
  "密集高潮型": "#96544D",
  "长篇铺陈型": "#7F968D",
  "文武交替型": "#5E6B76",
  "渐进推进型": "#B89B6D",
  "未知": "#8E8A84",
};

/* ================================================================
   Helpers
   ================================================================ */

function keyToLabel(key: string): string {
  return key.replace(".json", "").replace(/^\d+_/, "");
}

/** 根据剧本 key 获取对应的叙事阶段数据 */
/* ================================================================
   Sub-components: Panels
   ================================================================ */

/** 叙事模式总结面板 */
const PatternSummaryPanel: React.FC = () => (
  <div className="t4-pattern-panel">
    <div className="t4-section-intro">
      <strong>京剧五大叙事模式</strong>
      <p>基于 1,473 部京剧剧本的叙事结构分析，归纳出五种核心叙事模式，覆盖京剧叙事光谱的完整范围。</p>
    </div>
    <div className="t4-pattern-grid">
      {NARRATIVE_PATTERNS.map((p, i) => (
        <div key={i} className="t4-pattern-card" style={{ borderLeftColor: p.color }}>
          <div className="t4-pattern-card-header">
            <span className="t4-pattern-num">{i + 1}</span>
            <span className="t4-pattern-type" style={{ color: p.color }}>{p.type}</span>
          </div>
          <p className="t4-pattern-desc">{p.description}</p>
          <div className="t4-pattern-detail">
            <div className="t4-pattern-item">
              <span className="t4-pattern-label">节奏特征</span>
              <span>{p.rhythm}</span>
            </div>
            <div className="t4-pattern-item">
              <span className="t4-pattern-label">典型结构</span>
              <span>{p.typicalStructure}</span>
            </div>
            <div className="t4-pattern-item">
              <span className="t4-pattern-label">情感曲线</span>
              <span>{p.emotionCurve}</span>
            </div>
            <div className="t4-pattern-item">
              <span className="t4-pattern-label">核心特征</span>
              <span>{p.keyFeature}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

/** 角色叙事功能面板 */
const CharacterNarrativePanel: React.FC<{ analysis: RibbonAnalysisResult | null }> = ({ analysis }) => (
  <div className="t4-char-narrative-panel">
    <div className="t4-section-intro">
      <strong>角色叙事功能分析</strong>
      <p>在京剧叙事体系中，每个角色不仅承担行当表演功能，还承担特定的叙事结构功能。以下基于叙事学理论，归纳京剧角色的五种核心叙事功能类型。</p>
    </div>

    <div className="t4-char-role-grid">
      {CHAR_NARRATIVE_ROLES.map((cr, i) => (
        <div key={i} className="t4-char-role-card">
          <div className="t4-char-role-header">
            <span className="t4-char-role-num">{i + 1}</span>
            <div>
              <div className="t4-char-role-title">{cr.role}</div>
              <div className="t4-char-role-function">{cr.function}</div>
            </div>
          </div>
          <p className="t4-char-role-desc">{cr.description}</p>
          <div className="t4-char-role-examples">
            <span className="t4-char-role-examples-label">典型角色：</span>
            {cr.examples.map((ex, j) => (
              <span key={j} className="t4-char-role-tag">{ex}</span>
            ))}
          </div>
        </div>
      ))}
    </div>

    {analysis && (
      <div className="t4-current-char-analysis">
        <h4>当前剧本角色叙事功能分布</h4>
        <p>基于故事丝带中各角色的场景分布与交互模式，可进一步推断每个角色的叙事功能类型。角色在场景中的出现频率、与其他角色的共现关系、以及所处场景的情感强度共同决定了其叙事功能定位。</p>
        <div className="t4-char-list-mini">
          {analysis.sortedCharacters.slice(0, 8).map((char, i) => (
            <div key={i} className="t4-char-mini-item">
              <span className="t4-char-mini-dot" style={{ background: char.color || "var(--theme-gold)" }} />
              <span className="t4-char-mini-name">{char.character}</span>
              <span className="t4-char-mini-group">{char.group || "未知行当"}</span>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

/* ================================================================
   Main Layout — Task4Layout
   ================================================================ */

const Task4Layout: React.FC = () => {
  const [reportSidebarOpen, setReportSidebarOpen] = useState(false);
  const [reportTab, setReportTab] = useState<"report" | "patterns" | "characters" | "selection">("report");
  const [scriptDropdownOpen, setScriptDropdownOpen] = useState(false);
  const scriptDropdownRef = useRef<HTMLDivElement>(null);

  // Load opera data
  const operaDataMap = useMemo<Map<string, RawStoryInput>>(() => {
    const map = new Map<string, RawStoryInput>();
    const raw = operaSamplesRaw as Record<string, any>;
    for (const [key, value] of Object.entries(raw)) {
      if (key.startsWith("$")) continue;
      map.set(key, value as RawStoryInput);
    }
    return map;
  }, []);

  const keys = useMemo(() => Array.from(operaDataMap.keys()), [operaDataMap]);

  const [selectedKey, setSelectedKey] = useState<string>(keys[0] || "");

  // Pre-compute all analyses
  const allAnalyses = useMemo<Map<string, RibbonAnalysisResult>>(() => {
    const m = new Map<string, RibbonAnalysisResult>();
    for (const [key, input] of operaDataMap) {
      try {
        m.set(key, analyzeStoryRibbons(input));
      } catch (e) {
        console.error(`分析失败: ${key}`, e);
      }
    }
    return m;
  }, [operaDataMap]);

  const allFingerprints = useMemo<Map<string, StoryFingerprint>>(() => {
    const m = new Map<string, StoryFingerprint>();
    for (const [key, analysis] of allAnalyses) {
      const fp = extractFingerprint(analysis);
      if (fp) m.set(key, fp);
    }
    return m;
  }, [allAnalyses]);

  const currentAnalysis = allAnalyses.get(selectedKey) ?? null;
  const currentFingerprint = allFingerprints.get(selectedKey) ?? null;
  const handleSelectOpera = useCallback((key: string) => {
    setSelectedKey(key);
    setScriptDropdownOpen(false);
  }, []);

  // 点击外部关闭下拉
  useEffect(() => {
    if (!scriptDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (scriptDropdownRef.current && !scriptDropdownRef.current.contains(e.target as Node)) {
        setScriptDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [scriptDropdownOpen]);

  return (
    <div className="t4-screen">
      {/* ====== Topbar ====== */}
      <header className="t4-topbar">
        <div className="t4-topbar-title-group">
          <div className="t4-kicker">Task 4 · 京剧叙事结构分析与模式总结</div>
          <h1>如何识别剧情发展关键阶段，刻画剧情起伏与节奏变化？</h1>
          <p>核心任务：叙事阶段划分 → 节奏特征提取 → 模式识别 → 角色叙事功能分析 · 融合数字人文的叙事结构可视分析框架</p>
        </div>
        <div className="t4-topbar-report-trigger">
          <button
            className="t4-topbar-report-btn"
            onClick={() => { setReportSidebarOpen(true); setReportTab("report"); }}
            title="查看叙事分析设计流程报告"
          >
            <span className="t4-report-btn-icon">📋</span>
            <span>设计流程报告</span>
          </button>
        </div>
      </header>

      {/* ====== Main grid — 双栏布局: 中央主区 + 右侧面板 ====== */}
      <main className="t4-main-grid">
        {/* ── 中央主区 ── */}
        <section className="t4-center-stage">
          <div className="t4-center-header">
            <span className="t4-center-icon">🎬</span>
            <h2>叙事结构可视化</h2>
            <div className="t4-center-header-actions">
              <div className="t4-script-dropdown" ref={scriptDropdownRef}>
                <button
                  className="t4-guide-popup-trigger"
                  onClick={() => setScriptDropdownOpen(!scriptDropdownOpen)}
                  title="切换剧本"
                >
                  <span className="t4-guide-popup-trigger-icon">🎬</span>
                  <span className="t4-guide-popup-trigger-label">{keyToLabel(selectedKey)}</span>
                  <span className="t4-script-dropdown-arrow">{scriptDropdownOpen ? "▲" : "▼"}</span>
                </button>
                {scriptDropdownOpen && (
                  <div className="t4-script-dropdown-menu">
                    {keys.map((key) => {
                      const fp = allFingerprints.get(key);
                      const label = keyToLabel(key);
                      const isActive = key === selectedKey;
                      const dotColor = fp ? (RHYTHM_AXIS_COLORS[fp.rhythmType] || RHYTHM_AXIS_COLORS["未知"]) : RHYTHM_AXIS_COLORS["未知"];
                      return (
                        <button
                          key={key}
                          className={`t4-script-dropdown-item ${isActive ? "active" : ""}`}
                          onClick={() => handleSelectOpera(key)}
                        >
                          <span className="t4-script-dropdown-dot" style={{ background: dotColor }} />
                          <span className="t4-script-dropdown-label">{label}</span>
                          {fp && <span className="t4-script-dropdown-type">{fp.rhythmType}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button className="t4-guide-popup-trigger" onClick={() => { setReportSidebarOpen(true); setReportTab("patterns"); }}>
                <span className="t4-guide-popup-trigger-icon">🔍</span>
                <span className="t4-guide-popup-trigger-label">如何解读</span>
              </button>
              <button className="t4-guide-popup-trigger" onClick={() => { setReportSidebarOpen(true); setReportTab("report"); }}>
                <span className="t4-guide-popup-trigger-icon">💡</span>
                <span className="t4-guide-popup-trigger-label">典型发现</span>
              </button>
            </div>
          </div>
          <div className="t4-center-body">
            <div className="t4-center-row">
              <div className="t4-ribbon-area">
                <OperaRibbonViewer
                  operaDataMap={operaDataMap}
                  selectionKey={selectedKey}
                  onSelectionChange={handleSelectOpera}
                  analysisOverride={currentAnalysis}
                  fingerprintOverride={currentFingerprint}
                  hideControls
                  width={900}
                  height={420}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── 右侧悬浮面板 ── */}
        <aside className="t4-side-panel t4-right-panel">
          {/* 叙事节奏分析 */}
          <div className="t4-side-block">
            <div className="t4-side-block-header">
              <span className="t4-side-block-icon">📊</span>
              <h3>叙事节奏分析</h3>
            </div>
            {currentFingerprint ? (
              <div className="t4-metrics-block">
                <div className="t4-metrics-item">
                  <span className="t4-metrics-label">叙事节奏类型</span>
                  <span className="t4-metrics-value" style={{ color: RHYTHM_AXIS_COLORS[currentFingerprint.rhythmType] || RHYTHM_AXIS_COLORS["未知"] }}>
                    {currentFingerprint.rhythmType}
                  </span>
                  <span className="t4-metrics-unit">{RHYTHM_LABELS[currentFingerprint.rhythmType] || ""}</span>
                </div>
                <div className="t4-metrics-item">
                  <span className="t4-metrics-label">情感波动</span>
                  <span className="t4-metrics-value">{(currentFingerprint.sentimentVolatility * 100).toFixed(0)}%</span>
                  <div className="t4-mini-bar">
                    <div className="t4-mini-bar-fill" style={{ width: `${currentFingerprint.sentimentVolatility * 100}%` }} />
                  </div>
                </div>
                <div className="t4-metrics-item">
                  <span className="t4-metrics-label">场景密度</span>
                  <span className="t4-metrics-value">{currentFingerprint.avgCharsPerScene.toFixed(1)}</span>
                  <span className="t4-metrics-unit">角色/场</span>
                </div>
                <div className="t4-metrics-item">
                  <span className="t4-metrics-label">场景均匀度 (CV)</span>
                  <span className="t4-metrics-value">{currentFingerprint.sceneLengthCV.toFixed(2)}</span>
                </div>
                <div className="t4-metrics-item">
                  <span className="t4-metrics-label">总行数</span>
                  <span className="t4-metrics-value">{currentFingerprint.totalLines}</span>
                  <span className="t4-metrics-unit">行</span>
                </div>
              </div>
            ) : (
              <p className="t4-metrics-empty">请选择一个剧本</p>
            )}
            <div className="t4-side-block-note">叙事节奏指标反映剧本的剧情起伏模式 · 点击顶部「叙事模式总结」与「角色叙事功能」查看详细分析</div>
          </div>

          {/* 角色图例（含情感火花图） */}
          {currentAnalysis && (
            <div className="t4-side-block">
              <div className="t4-side-block-header">
                <span className="t4-side-block-icon">👥</span>
                <h3>角色图例 · 情感轨迹</h3>
              </div>
              <div className="t4-char-sparkline-list">
                {currentAnalysis.sortedCharacters.slice(0, 10).map((char: any) => {
                  const groupColor =
                    ROLE_GROUP_COLORS[char.group] || ROLE_GROUP_COLORS["其他"];
                  return (
                    <div key={char.character} className="t4-char-sparkline-item">
                      <span
                        className="t4-char-sparkline-dot"
                        style={{ backgroundColor: char.color || groupColor }}
                      />
                      <span className="t4-char-sparkline-name">
                        {char.short || char.character}
                      </span>
                      <span className="t4-char-sparkline-group">{char.group || ""}</span>
                      <CharacterEmotionSparkline
                        characterName={char.character}
                        scenes={currentAnalysis.scenes}
                        characterScenes={currentAnalysis.characterScenes}
                        width={90}
                        height={30}
                      />
                    </div>
                  );
                })}
                {currentAnalysis.sortedCharacters.length > 10 && (
                  <div className="t4-char-sparkline-more">
                    …及其他 {currentAnalysis.sortedCharacters.length - 10} 个角色
                  </div>
                )}
              </div>
              <div className="t4-side-block-note">
                火花图曲线表示该角色在各场景中的情感评分变化 · 正值偏暖色（正面情绪），负值偏冷色（负面情绪）
              </div>
            </div>
          )}
        </aside>
      </main>

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
            { id: "characters" as const, icon: "🎭", label: "角色叙事功能" },
            { id: "selection" as const, icon: "📄", label: "代表性剧本选择" },
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
              <h3>一、任务目标解析</h3>
              <p>任务四的核心目标是：基于全量 1473 本京剧剧本的结构化特征，提取叙事结构指纹，通过分层抽样选取典型剧本进行深度叙事分析，并基于"Story Ribbons"可视化范式改造，构建面向京剧剧本的叙事结构可视分析系统。该任务融合了叙事学、结构特征提取与聚类分析、LLM 驱动的深度语义标注、可视化叙事分析与分层抽样。</p>
              <h3>二、整体研究框架</h3>
              <p>整体流程为：Phase 1 批量结构指纹提取（纯正则，30维特征）→ Phase 2 层次聚类 + 叙事结构类型划分 → Phase 3 分层抽样（剧目类型×来源时代×结构类型）→ Phase 4 LLM 深度叙事分析（40-60本典型剧本）→ Phase 5 Story Ribbons 改造 + 三面板可视分析系统。</p>
              <h3>三、数据预处理阶段</h3>
              <p>京剧剧本正文具备天然的结构化标记：场景标记（【第X场】）、表演类型（唱/念/白/做/打）、唱腔板式（西皮摇板/二黄慢板）、舞台指示（急急风/四击头）。采用纯正则方案提取约 30 维结构特征向量，涵盖场景规模、表演类型分布、唱腔细分、场景节奏、情绪标记、角色密度六大维度。构建"剧目类型×来源时代×叙事结构聚类"三维正交分层网格。</p>
              <h3>四、典型剧本选取策略</h3>
              <p>采用四步分层抽样：构建 7×5 分层网格（35个格单元）→ 格内子聚类 + 重心距离选取典型代表 → 特殊覆盖规则（无场景标记型≥3本、昆曲≥3本、技法展示戏全覆盖）→ 校验确保 7 类型×5 来源×5 结构类型全覆盖。</p>
              <h3>五、深度叙事分析设计</h3>
              <p>对 40-60 本典型剧本进行三层深度分析：Layer 1 场景级节奏标注（表演形式配比、唱腔板式序列、情绪强度、冲突级别、叙事功能）；Layer 2 全局叙事模式识别（叙事弧线、阶段边界、节奏模式、收束方式）；Layer 3 表演形式-叙事功能映射。</p>
              <h3>六、可视化设计方案</h3>
              <p>将 Story Ribbons 改造为京剧叙事 Ribbon 编码：X轴=场景序列，Y轴=三层叠加（情绪曲线+表演形式色带+冲突热力），颜色=表演形式（唱红/念蓝/做绿/打橙/白灰），背景=起承转合四阶段。三面板布局：叙事结构对比总览、单本深度丝带图、叙事模式聚类空间。</p>
              <h3>七、创新点</h3>
              <p>创新点1：提出面向京剧剧本的 30 维结构指纹提取方法。创新点2：构建"剧目类型×来源时代×叙事结构"三维正交分层抽样框架。创新点3：将 Story Ribbons 改造为京剧叙事分析工具，以表演形式色带替代角色轨迹。创新点4：建立表演形式-叙事功能映射分析框架。</p>
              <h3>八、推荐技术栈</h3>
              <p>数据处理：Python、pandas、NumPy。聚类分析：scikit-learn、SciPy。深度标注：LangChain + Pydantic。可视化：D3.js、ECharts、React + TypeScript + Zustand。</p>
              <h3>九、与前三任务的协同设计</h3>
              <p>任务一聚焦角色级分析（行当推断），任务二聚焦网络级分析（角色关系），任务三聚焦剧本级分析（主题内容），任务四聚焦场景级分析（叙事结构）。四者共享剧目类型标签体系，共同构成完整戏曲数字人文研究链路。</p>
            </div>
          )}
          {reportTab === "patterns" && <PatternSummaryPanel />}
          {reportTab === "characters" && <CharacterNarrativePanel analysis={currentAnalysis} />}
          {reportTab === "selection" && <SelectionReportContent />}
        </div>
      </aside>
    </div>
  );
};

/* ================================================================
   Selection Report Content (moved from inline drawer)
   ================================================================ */
const SelectionReportContent: React.FC = () => (
  <>
    <section className="t4-report-section">
      <h3>筛选概述</h3>
      <p>本报告从 HumanVIZ 项目收录的 <strong>1,473 部京剧剧本</strong> 中，沿多个维度筛选出 <strong>5 部具有代表性的剧本</strong>，用于「叙事分析」（任务 4）侧边栏中作为分析范本。选择力求覆盖不同的叙事结构类型、行当构成、角色规模、来源合集与文化意义。</p>
    </section>
    <section className="t4-report-section">
      <h3>筛选维度</h3>
      <table className="t4-report-dim-table">
        <thead><tr><th>维度</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td>来源合集多样性</td><td>覆盖主流合集与罕见藏本，反映数据来源的整体分布</td></tr>
          <tr><td>叙事结构类型</td><td>涵盖悬念型、内心型、史诗型、追逐型、喜剧型五种叙事模式</td></tr>
          <tr><td>行当构成</td><td>覆盖老生戏、旦角戏、净角戏、丑角戏、武戏及群戏</td></tr>
          <tr><td>角色规模</td><td>从 3 人私密戏到 30 人大群戏，覆盖角色复杂度的全谱系</td></tr>
          <tr><td>文化地位</td><td>兼具家喻户晓的经典与学术价值较高的冷门剧目</td></tr>
        </tbody>
      </table>
    </section>
    {SELECTED_SCRIPTS.map((s, i) => (
      <section key={s.id} className="t4-report-section t4-script-card">
        <div className="t4-script-card-header">
          <span className="t4-script-index">剧本 {i + 1}</span>
          <h4>《{s.name}》{s.alias && <span className="t4-script-alias">一名：{s.alias}</span>}</h4>
        </div>
        <table className="t4-script-meta">
          <tbody>
            <tr><td>数据库 ID</td><td>{s.id}</td></tr>
            <tr><td>来源合集</td><td>{s.collection}（{s.collectionScale}）</td></tr>
            <tr><td>时代背景</td><td>{s.era}</td></tr>
            <tr><td>角色数</td><td>{s.charCount} 人</td></tr>
            <tr><td>行当分布</td><td>{s.roles}</td></tr>
            <tr><td>剧本长度</td><td>{s.wordCount}</td></tr>
            <tr><td>叙事结构</td><td><span className="t4-tag">{s.structureType}</span></td></tr>
            <tr><td>主导行当</td><td><span className="t4-tag t4-tag-role">{s.dominantRole}</span></td></tr>
            <tr><td>叙事弧线</td><td>{s.narrativeArc}</td></tr>
          </tbody>
        </table>
        <div className="t4-script-summary"><strong>内容概要：</strong>{s.summary}</div>
        <div className="t4-script-reasons">
          <strong>选择理由：</strong>
          <ol>{s.reasons.map((r, j) => <li key={j}>{r}</li>)}</ol>
        </div>
      </section>
    ))}
    <section className="t4-report-section">
      <h3>五部剧本对比总览</h3>
      <div className="t4-comparison-wrap">
        <table className="t4-comparison-table">
          <thead>
            <tr><th>维度</th><th>《空城计》</th><th>《贵妃醉酒》</th><th>《赵氏孤儿》</th><th>《连环套》</th><th>《打面缸》</th></tr>
          </thead>
          <tbody>
            {COMPARISON_TABLE.map((row, ri) => (
              <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
    <section className="t4-report-section">
      <h3>数据集覆盖验证</h3>
      <ul className="t4-coverage-list">
        <li><strong>来源合集覆盖</strong>：5 部来自 4 个不同合集，涵盖最大合集（《戏考》448 部）、第二大合集（《京剧汇编》360 部）、名家藏本（马连良 9 部）、罕见藏本（传统戏曲剧目资料汇编 2 部）</li>
        <li><strong>角色数覆盖</strong>：3 / 5 / 7 / 23 / 30，覆盖了数据集角色数分布的 P5 / P25 / P50 / P95 / P99</li>
        <li><strong>行当覆盖</strong>：老生、花旦、净、丑、小生、武生、武丑、杂 —— 覆盖了数据集全部 8 个主要行当大类</li>
        <li><strong>叙事类型覆盖</strong>：历史军事、宫廷心理、政治悲剧、武侠英雄、民间喜剧 —— 覆盖了京剧叙事的 5 种主要类型</li>
        <li><strong>长度覆盖</strong>：2,329 到 23,696 字，跨两个数量级</li>
      </ul>
    </section>
  </>
);

export default Task4Layout;
