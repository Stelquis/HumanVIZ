/**
 * p4_opera_ribbon_viewer.tsx — 京剧故事丝带可视化查看器
 *
 * 最大程度复用现有 MainPlot/StoryVis/Defs 的渲染逻辑，
 * 使用 storyRibbonCore 提供的标准化接口，
 * 实现京剧剧本的叙事结构丝带图浏览与交互。
 */

import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
import {
  analyzeStoryRibbons,
  RibbonAnalysisResult,
  StoryFingerprint,
  extractFingerprint,
  RawStoryInput,
} from "../../utils/storyRibbonCore";
import { character_height } from "../../utils/constants";
import { normalizeImportance, normalizeMarkerSize } from "../../utils/normalize";
import { bezierCommand, svgPath } from "../../utils/curve";
import { Scene } from "../../utils/sceneData";

// ═══════════════════════════════════════════════════════════════
// Props
// ═══════════════════════════════════════════════════════════════

interface OperaRibbonViewerProps {
  /** 多剧本数据: key = 文件名/标题, value = 标准化输入 */
  operaDataMap: Map<string, RawStoryInput>;
  /** 初始选中的剧本 key */
  initialSelection?: string;
  /** 容器宽度 */
  width?: number;
  /** 容器高度 */
  height?: number;
  /** 受控模式：外部指定的选中 key */
  selectionKey?: string;
  /** 受控模式：key 变更回调 */
  onSelectionChange?: (key: string) => void;
  /** 隐藏顶部选择器和指标面板（用于外部布局） */
  hideControls?: boolean;
  /** 单独控制图例显隐（默认跟随 hideControls） */
  hideLegend?: boolean;
  /** 外部传入的分析结果（受控模式下由父组件计算） */
  analysisOverride?: RibbonAnalysisResult | null;
  /** 外部传入的指纹（受控模式下由父组件计算） */
  fingerprintOverride?: StoryFingerprint | null;
  /** 启用冲突波形图（默认 true） */
  enableWaveform?: boolean;
  /** 启用人情感火花图（默认 true） */
  enableSparklines?: boolean;
  /** 丝带着色模式: role=行当固有色, sentiment=情感热力色 (论文默认) */
  colorMode?: "role" | "sentiment";
  /** Y轴模式: conflict=冲突驱动, location=地点驱动 (论文默认) */
  yAxisMode?: "conflict" | "location";
}

// ═══════════════════════════════════════════════════════════════
// 京剧角色知识库 — 丰富注释内容
// ═══════════════════════════════════════════════════════════════

interface CharAnnotation {
  facePaint?: string;   // 脸谱颜色与象征
  traits?: string;       // 性格特征
  plays?: string;        // 代表剧目/场景
  significance?: string; // 戏剧史地位
}

const CHARACTER_KNOWLEDGE: Record<string, CharAnnotation> = {
  "诸葛亮": {
    facePaint: "素面老生，不勾脸谱，挂黑三髯口，手持羽扇",
    traits: "智慧超群、运筹帷幄、鞠躬尽瘁",
    plays: "《空城计》抚琴退兵、《群英会》草船借箭、《定军山》智激黄忠",
    significance: "老生行当巅峰代表，京剧'智慧型主角'的经典范式，唱做并重",
  },
  "曹操": {
    facePaint: "白色整脸（水白脸），象征奸诈多疑、城府极深",
    traits: "奸雄、多疑、雄才大略、亦正亦邪",
    plays: "《捉放曹》杀吕伯奢、《群英会》横槊赋诗、《战宛城》败走华容道",
    significance: "净行'白脸'的创始人设，京剧最具复杂性的反派角色",
  },
  "关羽": {
    facePaint: "红色整脸（揉红脸），象征忠义无双、赤胆忠心",
    traits: "忠义、刚烈、傲上而不忍下、武艺超群",
    plays: "《古城会》斩蔡阳、《战长沙》释黄忠、《走麦城》败走麦城",
    significance: "红生代表，京剧武圣人，'红脸关公'成为忠义文化符号",
  },
  "司马懿": {
    facePaint: "铜锤花脸，白粉脸稍带灰，眼神犀利",
    traits: "深沉、隐忍、善谋略、能屈能伸",
    plays: "《空城计》疑兵退去、《战北原》师徒斗智",
    significance: "净行'白脸奸雄'经典，与诸葛亮的智斗构成京剧最经典博弈戏",
  },
  "赵云": {
    facePaint: "素面武生，面如冠玉，白盔白甲",
    traits: "忠勇、儒雅、常胜将军、白马银枪",
    plays: "《长坂坡》七进七出、《空城计》护城扎营、《定军山》辅佐黄忠",
    significance: "武生行当的标志性角色，'常山赵子龙'是完美的武将形象",
  },
  "杨贵妃": {
    facePaint: "花旦梳大头，凤冠霞帔，牡丹头面",
    traits: "雍容华贵、多情善感、由期待而至绝望",
    plays: "《贵妃醉酒》百花亭醉酒、《太真外传》马嵬坡自缢",
    significance: "旦角艺术的最高成就之一，梅兰芳将此剧锤炼为花旦做工戏巅峰",
  },
  "黄忠": {
    facePaint: "老生素面，白髯口，老将装束，金色盔甲",
    traits: "老当益壮、不服年迈、勇猛刚烈",
    plays: "《定军山》刀劈夏侯渊、《战长沙》大战关羽",
    significance: "老生行'老将戏'的标杆，展现'老骥伏枥'的刚健美学",
  },
  "刘备": {
    facePaint: "老生素面，挂黑三髯口，帝王冠冕",
    traits: "仁德宽厚、知人善任、以柔克刚",
    plays: "《定军山》授印黄忠、《三顾茅庐》请诸葛亮、《白帝城》托孤",
    significance: "老生'仁义之君'范式，与曹操形成正邪对照的叙事双轴",
  },
  "张飞": {
    facePaint: "黑色十字门脸（黑脸），环眼豹头，象征勇猛刚直",
    traits: "勇猛、粗中有细、性如烈火、忠心不二",
    plays: "《古城会》三通鼓斩蔡阳、《长坂坡》喝退曹兵",
    significance: "净行'黑脸猛将'的代表，民间最受欢迎的莽撞英雄形象",
  },
  "周瑜": {
    facePaint: "小生素面，翎子生，头戴紫金冠插双翎",
    traits: "年少英俊、才华横溢、气量偏狭",
    plays: "《群英会》蒋干盗书、《黄鹤楼》困刘备",
    significance: "小生行当'翎子生'的巅峰，'既生瑜何生亮'成千古绝叹",
  },
  "窦尔敦": {
    facePaint: "蓝色碎脸（蓝脸），象征刚烈勇猛、草莽英雄",
    traits: "性如烈火、讲义气、武艺高强、宁折不弯",
    plays: "《连环套》盗御马、《拜山》与黄天霸对决",
    significance: "净行'蓝脸'反英雄代表，道德模糊性使角色具有深度叙事价值",
  },
  "程婴": {
    facePaint: "老生素面，寒衣素服，形容憔悴",
    traits: "忠义、隐忍、牺牲、十五载负重前行",
    plays: "《赵氏孤儿》舍子救孤、十五年忍辱育孤复仇",
    significance: "老生'忠义牺牲'型角色的极致，中国悲剧文学中的伟大父亲形象",
  },
  "杨延昭": {
    facePaint: "老生素面，白髯口，元帅装束",
    traits: "忠孝、沉稳、镇守边关、智勇双全",
    plays: "《洪羊洞》孟良盗骨、《四郎探母》兄弟相会",
    significance: "老生'忠臣良将'典范，杨家将故事的核心人物",
  },
  "佘太君": {
    facePaint: "老旦素面，白发苍苍，龙头拐杖",
    traits: "刚毅、睿智、百岁挂帅、巾帼不让须眉",
    plays: "《洪羊洞》痛失亲子、《杨门女将》挂帅出征",
    significance: "老旦行当的里程碑式角色，打破女性角色的年龄与权力边界",
  },
  "萧恩": {
    facePaint: "老生素面，白髯口，渔翁装束",
    traits: "刚正不阿、侠义心肠、被逼上梁山",
    plays: "《打渔杀家》痛打教师爷、《庆顶珠》携女投梁",
    significance: "老生'平民侠义'形象，'官逼民反'社会叙事的京剧表达",
  },
  "黄天霸": {
    facePaint: "武生素面，短打武生装束，英气逼人",
    traits: "武艺高强、胆色过人、亦侠亦吏",
    plays: "《连环套》拜山斗窦尔敦、《恶虎村》大义灭亲",
    significance: "武生'绿林英雄'代表，身份矛盾（官府鹰犬vs江湖义气）引发叙事张力",
  },
  "杨宗保": {
    facePaint: "小生素面，翎子生，年少将帅",
    traits: "少年英勇、忠孝传家、穆桂英之夫",
    plays: "《洪羊洞》探父尽孝、《穆柯寨》与穆桂英结缘",
    significance: "小生'少年英雄'范式，杨家将第三代传人",
  },
  "孟良": {
    facePaint: "红色碎脸（红脸），花脸武将，火葫芦为标志",
    traits: "性如烈火、忠义勇猛、善使火攻",
    plays: "《洪羊洞》盗骨殉友、《打孟良》与焦赞纠葛",
    significance: "净行'红脸勇将'，与焦赞并称'焦不离孟'，代表生死情义",
  },
  "焦赞": {
    facePaint: "黑色碎脸（黑脸），花脸武将，双鞭为兵器",
    traits: "粗豪莽撞、忠心耿耿、嫉恶如仇",
    plays: "《洪羊洞》随孟良盗骨、《辕门斩子》闯帐求情",
    significance: "净行'黑脸莽将'，与孟赞构成京剧最经典的将佐搭档",
  },
  "赵德芳": {
    facePaint: "老生素面，王冠朝服，八贤王",
    traits: "刚正不阿、辅佐忠良、持金锏可上打昏君",
    plays: "《洪羊洞》请杨延昭复出、《清官册》审潘洪",
    significance: "老生'贤王清官'形象，代表皇权内部的道德制衡力量",
  },
  "夏侯渊": {
    facePaint: "黑花脸（黑碎脸），猛将装束，大刀为兵器",
    traits: "勇猛、刚愎、轻敌冒进",
    plays: "《定军山》被黄忠刀劈、《战长沙》与关羽对阵",
    significance: "净行'反派猛将'，衬托正面角色的勇武",
  },
  "张郃": {
    facePaint: "紫花脸（紫碎脸），曹魏大将装束",
    traits: "善战、机变、曹操麾下五子良将之一",
    plays: "《定军山》与黄忠大战、《街亭》击败马谡",
    significance: "净行'宿将'形象，与蜀将的对抗构成三国武戏的重要篇幅",
  },
  "严颜": {
    facePaint: "老生素面，白髯口，蜀中老将",
    traits: "老而弥坚、忠勇刚正、善使大刀",
    plays: "《定军山》辅佐黄忠破曹",
    significance: "老生'黄忠搭档'，双老将组合展现'老当益壮'的舞台美学",
  },
  "柴夫人": {
    facePaint: "青衣素面，端庄华贵，郡主身份",
    traits: "贤淑、坚韧、柴郡主之名门风范",
    plays: "《洪羊洞》守节尽孝、《状元媒》联姻杨家",
    significance: "旦角'贤妻良母'范式，杨家将故事中的女性支撑力量",
  },
  "老军": {
    facePaint: "丑角勾小花脸，老军装束，佝偻身形",
    traits: "寻常兵卒、底层视角、以俚俗言语插科打诨",
    plays: "《空城计》扫地洒水、以市井智慧映衬诸葛亮的冷静",
    significance: "丑行'小人物'代表，通过底层视角折射宏大叙事中的荒诞",
  },
  "报子": {
    facePaint: "丑角勾小花脸或素面，探子装束，手执令旗",
    traits: "传递军情、推动剧情转折的功能性角色",
    plays: "《空城计》三报军情、《定军山》报夏侯渊挑战",
    significance: "功能性角色，但'三报'的节奏递进是京剧悬念叙事的经典技法",
  },
};

/** 根据角色名获取丰富的京剧知识注释 */
function getCharKnowledge(name: string): CharAnnotation | null {
  // 精确匹配
  if (CHARACTER_KNOWLEDGE[name]) return CHARACTER_KNOWLEDGE[name];
  // 模糊匹配（含角色名的一部分）
  for (const [key, val] of Object.entries(CHARACTER_KNOWLEDGE)) {
    if (name.includes(key) || key.includes(name)) return val;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// 颜色常量 — 基于「燕京清晖」全局配色方案
// ═══════════════════════════════════════════════════════════════

/** 行当分组色板（对齐 theme.css 六主体色） */
export const ROLE_GROUP_COLORS: Record<string, string> = {
  "生": "#96544D",  // --theme-red    朱砂红 — 男性主角，沉稳厚重
  "旦": "#B89B6D",  // --theme-gold   琉璃金 — 女性主角，华贵典雅
  "净": "#7F968D",  // --theme-celadon 云水青 — 花脸角色，冷峻鲜明
  "丑": "#5E6B76",  // --theme-slate  石板灰 — 喜剧角色，低调朴实
  "其他": "#8E8A84", // --text-muted   中性灰 — 未归类行当
};

/** 行当角色专属渐变基色（用于丝带填充） */
const ROLE_GRADIENT_BASE: Record<string, string> = {
  "生": "#96544D",
  "旦": "#B89B6D",
  "净": "#7F968D",
  "丑": "#5E6B76",
};

/** 扩展色板 — 每个行当提供多色调变体，确保视觉丰富性 */
const ROLE_VARIANT_COLORS: Record<string, string[]> = {
  "生": ["#96544D", "#a04030", "#8b5e4b", "#b8654a", "#c47a5e", "#7a4038"],
  "旦": ["#B89B6D", "#c49b6a", "#a08050", "#d4a874", "#c8956e", "#9b7a55"],
  "净": ["#7F968D", "#5e7b70", "#6b8a80", "#4a6b60", "#8da398", "#558070"],
  "丑": ["#5E6B76", "#4a5866", "#6d7a85", "#556270", "#7a8792", "#3d4d5a"],
  "其他": ["#8E8A84", "#7a7670", "#9e9a94", "#6e6a64", "#a8a49e", "#807c76"],
};

/** 根据角色索引和行当分配丰富的颜色变体 */
function getVariantCharColor(index: number, _total: number, group?: string): string {
  const variants = ROLE_VARIANT_COLORS[group || "其他"] || ROLE_VARIANT_COLORS["其他"];
  if (group && ROLE_GRADIENT_BASE[group]) {
    // 同一行当内按索引循环取色
    const groupIdx = index % variants.length;
    return variants[groupIdx];
  }
  // 无行当时按索引在全部色板中轮转
  const allColors = Object.values(ROLE_VARIANT_COLORS).flat();
  return allColors[index % allColors.length];
}

/** SVG 背景色 */
const SVG_BG = "#F6F1E7";  // --theme-paper

export const RHYTHM_LABELS: Record<string, string> = {
  "密集高潮型": "情绪集中、节奏紧凑",
  "长篇铺陈型": "叙事绵长、布局宏大",
  "文武交替型": "打斗与抒情交替",
  "渐进推进型": "线性推进、渐入高潮",
  "未知": "",
};

// ═══════════════════════════════════════════════════════════════
// 字体常量
// ═══════════════════════════════════════════════════════════════

const FONT_UI = "'Noto Sans SC', sans-serif";

// ═══════════════════════════════════════════════════════════════
// 主题化颜色辅助
// ═══════════════════════════════════════════════════════════════

/** 根据行当分组获取主题色（用于丝带和标记点） */
function getThemeGroupColor(group: string): string {
  return ROLE_GROUP_COLORS[group] || ROLE_GROUP_COLORS["其他"];
}

/** 为角色生成主题色：使用变体色板，确保视觉丰富性 */
function getThemeCharColor(index: number, _total: number, group?: string): string {
  return getVariantCharColor(index, _total, group);
}

function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function getPhaseLabelForScene(
  sceneIndex: number,
  sceneCount: number,
  phases?: Array<{ label: string; startScene?: number; endScene?: number; pct?: number[] }>
): string {
  if (!phases || phases.length === 0) return "叙事阶段";

  const adaptive = phases[0]?.startScene !== undefined;
  if (adaptive) {
    const hit = phases.find(
      (phase) =>
        phase.startScene !== undefined &&
        phase.endScene !== undefined &&
        sceneIndex >= phase.startScene &&
        sceneIndex <= phase.endScene
    );
    return hit?.label || phases[phases.length - 1]?.label || "叙事阶段";
  }

  const ratio = sceneCount <= 1 ? 0 : sceneIndex / (sceneCount - 1);
  const hit = phases.find((phase) => phase.pct && ratio >= phase.pct[0] && ratio <= phase.pct[1]);
  return hit?.label || phases[phases.length - 1]?.label || "叙事阶段";
}

// ═══════════════════════════════════════════════════════════════
// T5: 场景对白面板
// ═══════════════════════════════════════════════════════════════

const DialoguePanel: React.FC<{
  show: boolean;
  sceneName: string;
  text: string;
  characters: any[];
  onClose: () => void;
}> = React.memo(({ show, sceneName, text, characters, onClose }) => {
  if (!show || !text) return null;

  // 为每个角色分配颜色
  const charColors = useMemo(() => {
    const m = new Map<string, string>();
    const palette = ["#96544D", "#B89B6D", "#7F968D", "#5E6B76", "#c44d4d", "#6b5b4f", "#c4a56e", "#8a7a8e"];
    characters.forEach((c: any, i: number) => {
      m.set(c.name, palette[i % palette.length]);
    });
    return m;
  }, [characters]);

  // 高亮角色名
  const highlightText = useMemo(() => {
    const lines = text.split("\n");
    return lines.map((line, li) => {
      let highlighted: React.ReactNode[] = [];
      let remaining = line;
      let keyIdx = 0;

      // Find character names and performance markers
      while (remaining.length > 0) {
        // Try to match a character name at the start
        let matched = false;
        for (const c of characters) {
          const name = c.name;
          if (remaining.startsWith(name) && remaining.length > name.length) {
            const after = remaining[name.length];
            // Character names are followed by space, （, or performance marker
            if (after === " " || after === "（" || after === "(") {
              highlighted.push(
                <span key={keyIdx++} style={{ color: charColors.get(name) || "#96544D", fontWeight: 700 }}>
                  {name}
                </span>
              );
              remaining = remaining.slice(name.length);
              matched = true;
              break;
            }
          }
        }
        if (!matched) {
          // Take one char at a time
          highlighted.push(<span key={keyIdx++}>{remaining[0]}</span>);
          remaining = remaining.slice(1);
        }
      }
      return (
        <div key={li} className="p4-dialogue-line" style={{ lineHeight: 1.8, minHeight: "1.8em" }}>
          {highlighted}
        </div>
      );
    });
  }, [text, characters, charColors]);

  // 表演标记统计
  const perfCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const markers = ["唱", "念", "白", "哭", "笑", "内白", "叫头", "西皮", "二黄"];
    for (const m of markers) {
      const re = new RegExp(`[（(]${m}[）)]`, "g");
      const matches = text.match(re);
      if (matches) counts[m] = matches.length;
    }
    return counts;
  }, [text]);

  return (
    <div className="p4-dialogue-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="p4-dialogue-panel">
        <div className="p4-dialogue-header">
          <h3>📜 {sceneName} — 原文对白</h3>
          <div className="p4-dialogue-header-right">
            <div className="p4-dialogue-perf-tags">
              {Object.entries(perfCounts).filter(([, c]) => c > 0).slice(0, 6).map(([m, c]) => (
                <span key={m} className="p4-perf-tag">{m}×{c}</span>
              ))}
            </div>
            <button className="p4-dialogue-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="p4-dialogue-body">
          {highlightText}
        </div>
        <div className="p4-dialogue-footer">
          <span>共 {text.length} 字 · {text.split("\n").filter((l: string) => l.trim()).length} 行</span>
          <span>{characters.length} 位角色出场</span>
        </div>
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════════════════════════

const OperaRibbonViewer: React.FC<OperaRibbonViewerProps> = ({
  operaDataMap,
  initialSelection,
  width = 1200,
  height = 700,
  selectionKey,
  onSelectionChange,
  hideControls = false,
  hideLegend,
  analysisOverride,
  fingerprintOverride,
  enableWaveform = true,
  enableSparklines: _enableSparklines = true,
}) => {
  const keys = useMemo(() => Array.from(operaDataMap.keys()), [operaDataMap]);
  const isControlled = selectionKey !== undefined;

  const [internalKey, setInternalKey] = useState<string>(
    initialSelection || keys[0] || ""
  );
  const selectedKey = isControlled ? selectionKey : internalKey;
  const compactMode = hideControls;
  const shouldHideLegend = hideLegend ?? hideControls; // 默认跟随 hideControls

  const [hoveredChar, setHoveredChar] = useState<string>("");
  const [hoveredScene, setHoveredScene] = useState<number>(-1);
  const [selectedChar, setSelectedChar] = useState<string>("");
  const [selectedScene, setSelectedScene] = useState<number>(-1);
  const [showMetrics, setShowMetrics] = useState<boolean>(true);

  // ── 论文视觉模式: 着色模式 ──
  const [colorMode, setColorMode] = useState<"role" | "sentiment">("role");

  // 注释/提示框状态
  const [annotation, setAnnotation] = useState<{
    show: boolean;
    x: number;
    y: number;
    type: "character" | "scene" | "line";
    title: string;
    subtitle?: string;
    details?: string[];
  }>({ show: false, x: 0, y: 0, type: "character", title: "" });

  // 缩放状态
  const [zoom, setZoom] = useState(1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ── T5: 对白面板状态 ──
  const [dialoguePanel, setDialoguePanel] = useState<{
    show: boolean; sceneIdx: number; sceneName: string; text: string; characters: any[];
  }>({ show: false, sceneIdx: -1, sceneName: "", text: "", characters: [] });

  // ── 非被动滚轮缩放（确保 preventDefault 生效）──
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = wrapper.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const factor = e.deltaY < 0 ? 1.3 : 1 / 1.3;
      setZoom((prev) => {
        const next = Math.min(5, Math.max(0.25, prev * factor));
        requestAnimationFrame(() => {
          const ratio = next / prev;
          wrapper.scrollLeft = (wrapper.scrollLeft + mouseX) * ratio - mouseX;
          wrapper.scrollTop = (wrapper.scrollTop + mouseY) * ratio - mouseY;
        });
        return next;
      });
    };

    wrapper.addEventListener("wheel", onWheel, { passive: false });
    return () => wrapper.removeEventListener("wheel", onWheel);
  }, [setZoom]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
  }, []);

  const handleDoubleClick = useCallback(() => {
    setZoom(1);
  }, []);

  // 拖拽平移状态
  const dragRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: wrapper.scrollLeft,
      scrollTop: wrapper.scrollTop,
    };
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const wrapper = wrapperRef.current;
    if (!wrapper || !dragRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      wrapper.scrollLeft = dragRef.current.scrollLeft - dx;
      wrapper.scrollTop = dragRef.current.scrollTop - dy;
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // 分析当前选中的剧本（受控模式下优先使用外部传入的数据）
  const internalAnalysis = useMemo<RibbonAnalysisResult | null>(() => {
    if (isControlled && analysisOverride !== undefined) return analysisOverride;
    const input = operaDataMap.get(selectedKey);
    if (!input) return null;
    try {
      return analyzeStoryRibbons(input);
    } catch (e) {
      console.error("分析失败:", e);
      return null;
    }
  }, [selectedKey, operaDataMap, isControlled, analysisOverride]);

  const analysis = internalAnalysis;

  // 指纹提取
  const fingerprint = useMemo<StoryFingerprint | null>(() => {
    if (isControlled && fingerprintOverride !== undefined) return fingerprintOverride;
    if (!analysis) return null;
    return extractFingerprint(analysis);
  }, [analysis, isControlled, fingerprintOverride]);

  // 切换剧本
  const handleSelectOpera = useCallback((key: string) => {
    if (isControlled && onSelectionChange) {
      onSelectionChange(key);
    } else {
      setInternalKey(key);
    }
    setHoveredChar("");
    setHoveredScene(-1);
    setSelectedChar("");
    setSelectedScene(-1);
  }, [isControlled, onSelectionChange]);

  if (!analysis) {
    return (
      <div className="p4-viewer-empty">
        <p>暂无数据，请先运行 opera_processor.py 生成剧本数据</p>
      </div>
    );
  }

  const { positions, characterScenes, sortedCharacters, scenes } = analysis;
  const phases = analysis.narrativeMetrics.narrativePhases?.length
    ? analysis.narrativeMetrics.narrativePhases
    : NARRATIVE_PHASES;

  const activeChar = hoveredChar || selectedChar;
  const activeScene = hoveredScene >= 0 ? hoveredScene : selectedScene;

  const handleCharSelect = useCallback((char: string) => {
    setSelectedChar((prev) => (prev === char ? "" : char));
  }, []);

  const handleSceneSelect = useCallback((sceneIdx: number) => {
    const isSame = selectedScene === sceneIdx;
    setSelectedScene(isSame ? -1 : sceneIdx);
    // ── T5: 打开/关闭对白面板 ──
    if (!isSame && analysis) {
      const scene = analysis.scenes[sceneIdx];
      if (scene) {
        const text = (scene as any).text || (scene as any).dialogue || scene.summary || "";
        setDialoguePanel({
          show: true,
          sceneIdx,
          sceneName: scene.name || `第${scene.number || sceneIdx + 1}场`,
          text,
          characters: scene.characters || [],
        });
      }
    } else {
      setDialoguePanel({ show: false, sceneIdx: -1, sceneName: "", text: "", characters: [] });
    }
  }, [selectedScene, analysis]);

  // 注释框回调
  const handleShowAnnotation = useCallback((
    x: number, y: number,
    type: "character" | "scene" | "line",
    title: string, subtitle?: string, details?: string[]
  ) => {
    setAnnotation({ show: true, x, y, type, title, subtitle, details });
  }, []);

  const handleHideAnnotation = useCallback(() => {
    setAnnotation((prev) => ({ ...prev, show: false }));
  }, []);

  return (
    <div className="p4-viewer-container" style={{ maxWidth: hideControls ? width : width + 40, fontFamily: FONT_UI }}>
      {/* 顶部控制栏 — 仅在非受控/非隐藏模式下显示 */}
      {!hideControls && (
        <OperaSelector
          keys={keys}
          selectedKey={selectedKey}
          onSelect={handleSelectOpera}
          fingerprint={fingerprint}
          showMetrics={showMetrics}
          onToggleMetrics={() => setShowMetrics(!showMetrics)}
          colorMode={colorMode}
          onColorMode={setColorMode}
        />
      )}

      {/* 叙事指标面板 — 仅在非隐藏模式下显示 */}
      {!hideControls && showMetrics && fingerprint && (
        <MetricsPanel fingerprint={fingerprint} />
      )}

      {/* SVG 丝带图 — 纵向布局 (从上往下) */}
      <div
        ref={wrapperRef}
        className={`p4-ribbon-svg-wrapper ${isDragging ? "dragging" : ""}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        title="滚轮缩放 · 拖拽平移 · 双击重置"
      >
        <RibbonSvg
          analysis={analysis}
          characterScenes={characterScenes}
          sortedCharacters={sortedCharacters}
          positions={positions}
          scenes={scenes}
          hoveredScene={activeScene}
          hoveredChar={activeChar}
          onSceneHover={setHoveredScene}
          onCharHover={setHoveredChar}
          onSceneSelect={handleSceneSelect}
          onCharSelect={handleCharSelect}
          enableWaveform={enableWaveform}
          targetWidth={width}
          targetHeight={height}
          compactMode={compactMode}
          zoomMultiplier={zoom}
          annotation={annotation}
          onShowAnnotation={handleShowAnnotation}
          onHideAnnotation={handleHideAnnotation}
          colorMode={colorMode}
        />
      </div>

      <div className={`p4-secondary-layout ${compactMode ? "compact" : ""}`}>
        <SceneTimelineStrip
          scenes={scenes}
          metrics={analysis.narrativeMetrics}
          activeScene={activeScene}
          hoveredScene={activeScene >= 0 ? activeScene : hoveredScene}
          phases={phases}
          onSelect={handleSceneSelect}
          onSceneHover={setHoveredScene}
          compactMode={compactMode}
        />
      </div>

      {/* 图例 — 默认显示；可通过 hideLegend 单独隐藏 */}
      {!shouldHideLegend && (
        <CharacterLegend
          sortedCharacters={sortedCharacters}
          hoveredChar={activeChar}
          onCharHover={setHoveredChar}
          onCharSelect={handleCharSelect}
          characterScenes={characterScenes}
        />
      )}

      {/* ── T5: 原文对白面板 ── */}
      <DialoguePanel
        show={dialoguePanel.show}
        sceneName={dialoguePanel.sceneName}
        text={dialoguePanel.text}
        characters={dialoguePanel.characters}
        onClose={() => setDialoguePanel({ show: false, sceneIdx: -1, sceneName: "", text: "", characters: [] })}
      />
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// 论文 Fig.1: 场景情感色带 — 每场景一色条，红=正面蓝=负面
// ═══════════════════════════════════════════════════════════════

const SceneSentimentStrip: React.FC<{
  scenes: any[];
  scenePos: Position[];
  bandTop: number;
  plotWidth: number;
}> = React.memo(({ scenes, scenePos, bandTop, plotWidth }) => {
  const n = scenes.length;
  if (n === 0) return null;
  const stripH = 10;
  const firstX = scenePos[0]?.x || 0;
  const lastX = scenePos[n - 1]?.x || plotWidth;
  const sceneW = n > 0 ? (lastX - firstX) / n : 10;

  return (
    <g id="p4-sentiment-strip" pointerEvents="none">
      {scenes.map((s: any, i: number) => {
        const sentiment = s.ratings?.sentiment ?? 0;
        const color = sentimentColor(sentiment);
        const sx = scenePos[i]?.x || firstX + sceneW * i;
        const gapPx = Math.max(1, sceneW * 0.15);
        const barW = Math.max(3, sceneW - gapPx);
        return (
          <rect
            key={`ss-${i}`}
            x={sx - barW / 2}
            y={bandTop}
            width={barW}
            height={stripH}
            fill={color}
            fillOpacity={0.55 + Math.abs(sentiment) * 0.4}
            rx={2}
          />
        );
      })}
      {/* 图例 */}
      <rect x={lastX + 12} y={bandTop} width={6} height={stripH / 2} fill="#C44D4D" fillOpacity={0.7} rx={1} />
      <text x={lastX + 22} y={bandTop + stripH / 2 + 3} fontSize={9} fill="rgba(94,107,118,0.5)" fontFamily={FONT_UI}>正</text>
      <rect x={lastX + 40} y={bandTop} width={6} height={stripH / 2} fill="#4A6B7A" fillOpacity={0.7} rx={1} />
      <text x={lastX + 50} y={bandTop + stripH / 2 + 3} fontSize={9} fill="rgba(94,107,118,0.5)" fontFamily={FONT_UI}>负</text>
    </g>
  );
});

// ═══════════════════════════════════════════════════════════════
// RibbonSvg — SVG 容器（整合波形图 + 丝带图）
// ═══════════════════════════════════════════════════════════════

const RibbonSvg: React.FC<{
  analysis: RibbonAnalysisResult;
  characterScenes: any[];
  sortedCharacters: any[];
  positions: any;
  scenes: any[];
  hoveredScene: number;
  hoveredChar: string;
  onSceneHover: (idx: number) => void;
  onCharHover: (char: string) => void;
  onSceneSelect: (idx: number) => void;
  onCharSelect: (char: string) => void;
  enableWaveform: boolean;
  targetWidth: number;
  targetHeight: number;
  compactMode: boolean;
  zoomMultiplier?: number;
  annotation?: { show: boolean; x: number; y: number; type: string; title: string; subtitle?: string; details?: string[] };
  onShowAnnotation?: (x: number, y: number, type: "character" | "scene" | "line", title: string, subtitle?: string, details?: string[]) => void;
  onHideAnnotation?: () => void;
  colorMode?: "role" | "sentiment";
}> = ({
  analysis,
  characterScenes,
  sortedCharacters,
  positions,
  scenes,
  hoveredScene,
  hoveredChar,
  onSceneHover,
  onCharHover,
  onSceneSelect,
  onCharSelect,
  enableWaveform,
  targetWidth,
  targetHeight,
  compactMode,
  zoomMultiplier = 1,
  annotation,
  onShowAnnotation,
  onHideAnnotation,
  colorMode = "role",
}) => {
  // 波形图顶部高度（横向布局，波形位于顶部）
  const waveformHeight = enableWaveform
    ? Math.max(compactMode ? 64 : 92, Math.floor((positions.plotHeight + (compactMode ? 118 : 170)) * (compactMode ? 0.13 : 0.18)))
    : 0;

  // 横向布局：宽 = 场景推进轴，高 = 角色堆叠 + 波形图
  const totalW = positions.plotWidth + (compactMode ? 128 : 200);
  const totalH = positions.plotHeight + (compactMode ? 118 : 170) + waveformHeight;
  const ribbonTop = waveformHeight; // 丝带区域从波形图下方开始

  const widthScale = targetWidth > 0 ? targetWidth / totalW : 1;
  const heightScale = targetHeight > 0 ? targetHeight / totalH : 1;
  const svgScale = Math.min(widthScale, heightScale, 1);
  const renderW = Math.max(320, totalW * svgScale) * zoomMultiplier;
  const renderH = Math.max(220, totalH * svgScale) * zoomMultiplier;

  // 获取阶段数据：优先自适应检测，场景数≤3时回退到硬编码
  const metrics = analysis.narrativeMetrics;
  const adaptivePhases =
    metrics.narrativePhases && metrics.narrativePhases.length > 1
      ? metrics.narrativePhases
      : null;

  const phases = adaptivePhases || NARRATIVE_PHASES;
  const isAdaptive = adaptivePhases !== null;

  // 预构建查找 Map，消除 O(C^2) 的 .find() 调用
  const charGroupMap = useMemo(() => {
    const m = new Map<string, string>();
    sortedCharacters.forEach((c: any) => m.set(c.character, c.group));
    return m;
  }, [sortedCharacters]);

  const charShortMap = useMemo(() => {
    const m = new Map<string, string>();
    sortedCharacters.forEach((c: any) => m.set(c.character, c.short || c.character));
    return m;
  }, [sortedCharacters]);

  const sceneCharRatingMap = useMemo(() => {
    const m = new Map<string, number>();
    scenes.forEach((scene: any, si: number) => {
      scene.characters?.forEach((c: any) => {
        m.set(`${si}:${c.name}`, c.rating ?? 0);
      });
    });
    return m;
  }, [scenes]);

  return (
    <svg
      id="p4-opera-ribbon"
      viewBox={`0 0 ${totalW} ${totalH}`}
      width={renderW}
      height={renderH}
      style={{ background: SVG_BG, borderRadius: 8, fontFamily: FONT_UI }}
    >
      <defs>
        <RibbonDefs
          characterScenes={characterScenes}
          charGroupMap={charGroupMap}
          colorMode={colorMode}
          sceneCharRatingMap={sceneCharRatingMap}
        />
        {/* 波形图渐变 — 横向布局：从上到下 */}
        <linearGradient id="p4-waveform-conflict" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#96544D" stopOpacity={0.35} />
          <stop offset="100%" stopColor="#96544D" stopOpacity={0.06} />
        </linearGradient>
        <linearGradient id="p4-waveform-sentiment" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#B89B6D" stopOpacity={0.30} />
          <stop offset="100%" stopColor="#B89B6D" stopOpacity={0.04} />
        </linearGradient>
        {/* 叙事阶段背景渐变 — 横向布局：从左到右 */}
        <linearGradient id="p4-phase-begin" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#96544D" stopOpacity={0.07} />
          <stop offset="100%" stopColor="#96544D" stopOpacity={0.02} />
        </linearGradient>
        <linearGradient id="p4-phase-develop" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#B89B6D" stopOpacity={0.06} />
          <stop offset="100%" stopColor="#B89B6D" stopOpacity={0.01} />
        </linearGradient>
        <linearGradient id="p4-phase-climax" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#96544D" stopOpacity={0.10} />
          <stop offset="100%" stopColor="#96544D" stopOpacity={0.04} />
        </linearGradient>
        <linearGradient id="p4-phase-end" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7F968D" stopOpacity={0.06} />
          <stop offset="100%" stopColor="#7F968D" stopOpacity={0.01} />
        </linearGradient>
      </defs>

      {/* ── 横向布局 (无坐标轴交换) ── */}

      {/* 叙事阶段背景色带（纵向竖条，全高） */}
      <NarrativePhaseBands
        scenes={scenes}
        scenePos={positions.scenePos}
        plotHeight={totalH}
        phases={phases}
        isAdaptive={isAdaptive}
      />

      {/* 阶段分隔虚线（纵向竖线，全高） */}
      <PhaseDividers
        scenes={scenes}
        scenePos={positions.scenePos}
        plotHeight={totalH}
        phases={phases}
        isAdaptive={isAdaptive}
      />

      {/* 冲突波形图（顶部宽条带） */}
      {enableWaveform && (
        <ConflictWaveformBand
          analysis={analysis}
          scenePos={positions.scenePos}
          bandHeight={waveformHeight}
          phases={phases}
          isAdaptive={isAdaptive}
        />
      )}

      {/* 阶段标签（波形图区域上方） */}
      {enableWaveform && (
        <PhaseLabels
          scenes={scenes}
          scenePos={positions.scenePos}
          plotWidth={positions.plotWidth}
          phases={phases}
          isAdaptive={isAdaptive}
          bandHeight={waveformHeight}
        />
      )}

      {/* ── 论文 Fig.1: 场景情感色带（章节标题按情感着色）── */}
      <SceneSentimentStrip
        scenes={scenes}
        scenePos={positions.scenePos}
        bandTop={waveformHeight}
        plotWidth={positions.plotWidth}
      />

      {/* 主内容区（下移 waveformHeight，为波形图腾出顶部空间） */}
      <g transform={`translate(0, ${ribbonTop})`}>
        {/* 场景背景 */}
        <SceneBackgrounds
          positions={positions}
          sceneCharacters={analysis.sceneCharacters}
          hoveredScene={hoveredScene}
          hoveredChar={hoveredChar}
          onSceneHover={onSceneHover}
          onSceneSelect={onSceneSelect}
          scenes={scenes}
          onShowAnnotation={onShowAnnotation}
          onHideAnnotation={onHideAnnotation}
        />

        {/* 数据丝带 */}
        <RibbonLayer
          characterScenes={characterScenes}
          charGroupMap={charGroupMap}
          charShortMap={charShortMap}
          sceneCharRatingMap={sceneCharRatingMap}
          positions={positions}
          scenes={scenes}
          hoveredChar={hoveredChar}
          onCharHover={onCharHover}
          onCharSelect={onCharSelect}
          onShowAnnotation={onShowAnnotation}
          onHideAnnotation={onHideAnnotation}
          colorMode={colorMode}
        />

        {/* 场景标签（横轴底部） */}
        <SceneLabels positions={positions} scenes={scenes} />
      </g>

      {/* ── 注释/提示框覆盖层 ── */}
      {annotation?.show && (
        <AnnotationOverlay
          annotation={annotation}
          totalW={totalW}
          totalH={totalH}
        />
      )}
    </svg>
  );
};

// ═══════════════════════════════════════════════════════════════
// 子组件：冲突波形图
// ═══════════════════════════════════════════════════════════════

const ConflictWaveformBand: React.FC<{
  analysis: RibbonAnalysisResult;
  scenePos: Position[];
  bandHeight: number;
  phases: any[];
  isAdaptive: boolean;
}> = React.memo(({ analysis, scenePos, bandHeight }) => {
  const { conflictArc, sentimentArc } = analysis.narrativeMetrics;
  const n = conflictArc.length;
  if (n < 2) return null;

  const pad = 10;
  const innerH = bandHeight - pad * 2;

  const firstX = scenePos[0]?.x || 0;
  const lastX = scenePos[n - 1]?.x || 0;

  // 横向布局：x = 场景位置（水平），y = 波形值（垂直，顶部=高强度）
  const conflictPoints: number[][] = [];
  const sentimentPoints: number[][] = [];

  for (let i = 0; i < n; i++) {
    const sx = scenePos[i]?.x || 0;
    const cVal = Math.max(0.05, conflictArc[i] || 0);
    const sVal = Math.max(0.05, sentimentArc[i] || 0);
    conflictPoints.push([sx, pad + innerH * (1 - cVal)]);
    sentimentPoints.push([sx, pad + innerH * (1 - sVal)]);
  }

  // 冲突填充区域（顶部=0到底部=bandHeight）
  const conflictPath = svgPath(conflictPoints, [], bezierCommand, 0.3);
  let areaD = conflictPath;
  areaD += ` L ${lastX},${bandHeight}`;
  areaD += ` L ${firstX},${bandHeight} Z`;

  // 情感线路径
  const sentimentPath = svgPath(sentimentPoints, [], bezierCommand, 0.3);
  // 冲突线路径
  const conflictLinePath = svgPath(conflictPoints, [], bezierCommand, 0.3);

  return (
    <g id="p4-waveform-band" pointerEvents="none">
      {/* 背景 */}
      <rect x={firstX - 20} y={0} width={lastX - firstX + 40} height={bandHeight}
        fill="rgba(246,241,231,0.45)" />

      {/* 冲突填充区域 */}
      <path d={areaD} fill="url(#p4-waveform-conflict)" opacity={0.55} />

      {/* 情感线 */}
      <path d={sentimentPath} fill="none" stroke="#B89B6D" strokeWidth={2}
        strokeOpacity={0.55} strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="6 3" />

      {/* 冲突线 */}
      <path d={conflictLinePath} fill="none" stroke="#96544D" strokeWidth={2.4}
        strokeOpacity={0.65} strokeLinecap="round" strokeLinejoin="round" />

      {/* 场景节点 */}
      {conflictPoints.map((pt, i) => {
        const c = conflictArc[i] || 0;
        return (
          <circle key={`wf-dot-${i}`} cx={pt[0]} cy={pt[1]}
            r={2.5 + c * 3.5} fill="#96544D"
            fillOpacity={0.25 + c * 0.4} stroke="#F6F1E7" strokeWidth={0.8} />
        );
      })}

      {/* Y 轴标签（左侧，水平文字） */}
      <text x={firstX - 14} y={pad + 4} textAnchor="end"
        fontSize={10} fontWeight={500} fontFamily={FONT_UI}
        fill="rgba(94,107,118,0.55)">1.0</text>
      <text x={firstX - 14} y={pad + innerH / 2 + 3} textAnchor="end"
        fontSize={10} fontWeight={500} fontFamily={FONT_UI}
        fill="rgba(94,107,118,0.55)">0.5</text>
      <text x={firstX - 14} y={bandHeight - pad + 4} textAnchor="end"
        fontSize={10} fontWeight={500} fontFamily={FONT_UI}
        fill="rgba(94,107,118,0.55)">0.0</text>

      {/* Y 轴标题 — 移到更左侧，避免与刻度标签重叠 */}
      <text x={firstX - 42} y={bandHeight / 2} textAnchor="middle"
        transform={`rotate(-90, ${firstX - 42}, ${bandHeight / 2})`}
        fontSize={11} fontWeight={600} fontFamily={FONT_UI}
        fill="rgba(94,107,118,0.6)" paintOrder="stroke"
        stroke={SVG_BG} strokeWidth={2}>
        冲突 / 情感
      </text>

      {/* 图例（右上角） */}
      <g transform={`translate(${lastX - 110}, 6)`}>
        <line x1={0} y1={0} x2={16} y2={0} stroke="#96544D" strokeWidth={2.4} strokeOpacity={0.65} />
        <text x={20} y={0} fontSize={11} fontFamily={FONT_UI} fill="rgba(94,107,118,0.65)" dominantBaseline="middle">冲突</text>
        <line x1={50} y1={0} x2={66} y2={0} stroke="#B89B6D" strokeWidth={2} strokeOpacity={0.55} strokeDasharray="4 2" />
        <text x={70} y={0} fontSize={11} fontFamily={FONT_UI} fill="rgba(94,107,118,0.65)" dominantBaseline="middle">情感</text>
      </g>
    </g>
  );
});

// ═══════════════════════════════════════════════════════════════
// 子组件：角色情感火花图（Sparkline）
// ═══════════════════════════════════════════════════════════════

export const CharacterEmotionSparkline: React.FC<{
  characterName: string;
  scenes: Scene[];
  characterScenes: any[];
  width?: number;
  height?: number;
}> = React.memo(({ characterName, scenes, characterScenes, width = 120, height = 36 }) => {
  const charData = characterScenes.find((c: any) => c.character === characterName);
  if (!charData) return null;

  // 预构建场景-情感查找表
  const ratingByScene = useMemo(() => {
    const m = new Map<number, number>();
    scenes.forEach((scene: any, idx: number) => {
      const c = scene.characters?.find((ch: any) => ch.name === characterName);
      if (c) m.set(idx, c.rating ?? 0);
    });
    return m;
  }, [scenes, characterName]);

  // 提取该角色在所有场景中的情感序列
  const points = useMemo(() => {
    const arr: { sceneIdx: number; rating: number }[] = [];
    charData.scenes.forEach((sceneIdx: number) => {
      const rating = ratingByScene.get(sceneIdx);
      if (rating !== undefined) {
        arr.push({ sceneIdx, rating });
      }
    });
    return arr;
  }, [charData.scenes, ratingByScene]);

  if (points.length < 2) return null;

  const n = scenes.length;
  const padX = 6;
  const padY = 4;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;
  const midY = padY + plotH / 2;

  // 映射到像素坐标
  const coords = points.map((p) => [
    padX + (p.sceneIdx / Math.max(n - 1, 1)) * plotW,
    midY - p.rating * (plotH / 2),
  ]);

  const pathD = svgPath(coords, [], bezierCommand, 0.35);

  // 情感极性的填充区域
  const areaTop = coords.map(([cx]) => [cx, midY]);
  let areaD = pathD;
  const lastPt = coords[coords.length - 1];
  areaD += ` L ${lastPt[0]},${midY}`;
  const revArea = [...areaTop].reverse();
  for (let i = 0; i < revArea.length; i++) {
    areaD += ` L ${revArea[i][0]},${revArea[i][1]}`;
  }
  areaD += " Z";

  // 平均情感极性决定主导色
  const avgRating = points.reduce((s, p) => s + p.rating, 0) / points.length;
  const warmColor = avgRating >= 0 ? "#96544D" : "#7F968D";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "inline-block", verticalAlign: "middle", overflow: "visible" }}
    >
      {/* 零线 */}
      <line
        x1={padX} y1={midY} x2={width - padX} y2={midY}
        stroke="rgba(94,107,118,0.18)" strokeWidth={0.8}
      />
      {/* 填充区域 */}
      <path d={areaD} fill={warmColor} fillOpacity={0.10} />
      {/* 曲线 */}
      <path
        d={pathD}
        fill="none"
        stroke={warmColor}
        strokeWidth={1.5}
        strokeOpacity={0.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 端点 */}
      {coords.length > 0 && (
        <>
          <circle cx={coords[0][0]} cy={coords[0][1]} r={2} fill={warmColor} fillOpacity={0.7} />
          <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r={2} fill={warmColor} fillOpacity={0.7} />
        </>
      )}
    </svg>
  );
});

// ═══════════════════════════════════════════════════════════════
// 子组件：剧本选择器
// ═══════════════════════════════════════════════════════════════

const OperaSelector: React.FC<{
  keys: string[];
  selectedKey: string;
  onSelect: (key: string) => void;
  fingerprint: StoryFingerprint | null;
  showMetrics: boolean;
  onToggleMetrics: () => void;
  colorMode: "role" | "sentiment";
  onColorMode: (m: "role" | "sentiment") => void;
}> = ({ keys, selectedKey, onSelect, fingerprint, showMetrics, onToggleMetrics, colorMode, onColorMode }) => (
  <div className="p4-selector-bar">
    <select
      value={selectedKey}
      onChange={(e) => onSelect(e.target.value)}
      className="p4-opera-select"
    >
      {keys.map((k) => {
        const label = k.replace(".json", "").replace(/^\d+_/, "");
        return (
          <option key={k} value={k}>
            {label}
          </option>
        );
      })}
    </select>

    {fingerprint && (
      <span className="p4-fingerprint-badge">
        <span className="p4-badge">{fingerprint.sceneCount} 场</span>
        <span className="p4-badge">{fingerprint.charCount} 角色</span>
        <span className={`p4-badge p4-rhythm-${fingerprint.rhythmType}`}>
          {fingerprint.rhythmType}
        </span>
      </span>
    )}

    <button
      onClick={onToggleMetrics}
      className={`p4-toggle-btn ${showMetrics ? "active" : ""}`}
    >
      {showMetrics ? "隐藏指标" : "显示指标"}
    </button>
    {/* ── 论文: 着色模式切换 ── */}
    <button
      onClick={() => onColorMode(colorMode === "role" ? "sentiment" : "role")}
      className={`p4-toggle-btn ${colorMode === "sentiment" ? "active" : ""}`}
      title="行当颜色 vs 情感热力色"
    >
      {colorMode === "role" ? "🎨 行当色" : "🔥 情感色"}
    </button>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// 子组件：叙事指标面板
// ═══════════════════════════════════════════════════════════════

const MetricsPanel: React.FC<{
  fingerprint: StoryFingerprint;
}> = ({ fingerprint }) => (
  <div className="p4-metrics-panel">
    <div className="p4-metric-item">
      <label>叙事节奏</label>
      <span className="p4-metric-value">{fingerprint.rhythmType}</span>
      <small>{RHYTHM_LABELS[fingerprint.rhythmType] || ""}</small>
    </div>
    <div className="p4-metric-item">
      <label>情感波动</label>
      <span className="p4-metric-value">
        {(fingerprint.sentimentVolatility * 100).toFixed(0)}%
      </span>
      <div className="p4-mini-bar">
        <div
          className="p4-mini-bar-fill"
          style={{ width: `${fingerprint.sentimentVolatility * 100}%` }}
        />
      </div>
    </div>
    <div className="p4-metric-item">
      <label>场景密度</label>
      <span className="p4-metric-value">
        {fingerprint.avgCharsPerScene.toFixed(1)} 角色/场
      </span>
    </div>
    <div className="p4-metric-item">
      <label>场景均匀度</label>
      <span className="p4-metric-value">
        CV = {fingerprint.sceneLengthCV.toFixed(2)}
      </span>
    </div>
    <div className="p4-metric-item">
      <label>总行数</label>
      <span className="p4-metric-value">{fingerprint.totalLines}</span>
    </div>
  </div>
);

const SceneTimelineStrip: React.FC<{
  scenes: Scene[];
  metrics: RibbonAnalysisResult["narrativeMetrics"];
  activeScene: number;
  hoveredScene: number;
  onSelect: (idx: number) => void;
  onSceneHover: (idx: number) => void;
  phases: Array<{ label: string; startScene?: number; endScene?: number; pct?: number[] }>;
  compactMode?: boolean;
}> = ({ scenes, metrics, activeScene, hoveredScene, phases, onSelect, onSceneHover, compactMode = false }) => (
  <div className={`p4-scene-strip ${compactMode ? "compact" : ""}`}>
    <div className="p4-scene-strip-header">
      <div>
        <strong>场景导航</strong>
        <span>{compactMode ? "快速定位场次" : "悬停联动丝带图"}</span>
      </div>
      <small>{compactMode ? "点选固定" : "悬停高亮 · 点击固定"}</small>
    </div>
    <div className="p4-scene-strip-track">
      {scenes.map((scene, idx) => {
        const conflict = metrics.conflictArc[idx] || 0;
        const sentiment = metrics.sentimentArc[idx] || 0;
        const phaseLabel = getPhaseLabelForScene(idx, scenes.length, phases);
        const charCount = scene.characters?.length || 0;
        const isActive = idx === activeScene;
        const isHovered = idx === hoveredScene;
        return (
          <button
            key={`scene-strip-${idx}`}
            type="button"
            className={`p4-scene-pill ${isActive ? "active" : ""} ${isHovered ? "hovered" : ""}`}
            onClick={() => onSelect(idx)}
            onMouseEnter={() => onSceneHover(idx)}
            onMouseLeave={() => onSceneHover(-1)}
          >
            <span className="p4-scene-pill-top">
              <span className="p4-scene-pill-no">第{scene.number || idx + 1}场</span>
              <span className="p4-scene-pill-phase">{phaseLabel}</span>
            </span>
            <span className="p4-scene-pill-name">{scene.name || `场景 ${idx + 1}`}</span>
            {!compactMode && (
              <span className="p4-scene-pill-meta">
                <span>{charCount} 角色</span>
                <span>{scene.location || "舞台"}</span>
              </span>
            )}
            <span className="p4-scene-pill-bars">
              <span className="p4-scene-bar">
                <span className="p4-scene-bar-label">冲突</span>
                <span className="p4-scene-bar-track">
                  <span className="p4-scene-bar-fill conflict" style={{ width: formatPercent(conflict) }} />
                </span>
              </span>
              <span className="p4-scene-bar">
                <span className="p4-scene-bar-label">情感</span>
                <span className="p4-scene-bar-track mood">
                  <span
                    className={`p4-scene-bar-fill ${sentiment >= 0 ? "positive" : "negative"}`}
                    style={{ width: `${Math.min(100, Math.abs(sentiment) * 100)}%` }}
                  />
                </span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// 子组件：渐变定义
// ═══════════════════════════════════════════════════════════════

/** 情感→颜色映射 (论文: 红=正面, 蓝=负面) */
function sentimentColor(rating: number): string {
  if (rating > 0.3) return "#C44D4D";      // 强烈正面: 暖红
  if (rating > 0.1) return "#D4896A";      // 偏正面: 暖橙
  if (rating < -0.3) return "#4A6B7A";     // 强烈负面: 冷蓝
  if (rating < -0.1) return "#7F968D";     // 偏负面: 青灰
  return "#B89B6D";                         // 中性: 琉璃金
}

const RibbonDefs: React.FC<{
  characterScenes: any[];
  charGroupMap: Map<string, string>;
  colorMode?: "role" | "sentiment";
  sceneCharRatingMap?: Map<string, number>;
}> = React.memo(({ characterScenes, charGroupMap, colorMode = "role", sceneCharRatingMap }) => (
  <defs>
    {characterScenes.map((char, i) => {
      const group = charGroupMap.get(char.character);

      // 为每个连续出场段生成渐变
      let segments: number[][] = [];
      let curSeg: number[] = [];
      char.scenes.forEach((scene: number, j: number) => {
        curSeg.push(scene);
        const next = char.scenes[j + 1];
        if (next === undefined || next - scene > 1) {
          segments.push(curSeg);
          curSeg = [];
        }
      });

      return segments.map((seg, segIdx) => {
        if (seg.length === 0) return null;

        // ── 论文: 情感色模式 vs 行当色模式 ──
        let fillColor: string;
        if (colorMode === "sentiment" && sceneCharRatingMap) {
          // 取该段场景中该角色的平均情感
          let sum = 0; let cnt = 0;
          for (const si of seg) {
            const r = sceneCharRatingMap.get(`${si}:${char.character}`);
            if (r !== undefined) { sum += r; cnt++; }
          }
          const avgRating = cnt > 0 ? sum / cnt : 0;
          fillColor = sentimentColor(avgRating);
        } else {
          fillColor = getThemeCharColor(i, characterScenes.length, group);
        }

        return (
          <linearGradient
            key={`p4-grad-${i}-${segIdx}`}
            id={`p4-linear-${i}-${segIdx}`}
            x1="0%" y1="0%" x2="0%" y2="100%"
          >
            <stop offset="0%" stopColor={fillColor} stopOpacity={0.2} />
            <stop offset="15%" stopColor={fillColor} stopOpacity={0.55} />
            <stop offset="85%" stopColor={fillColor} stopOpacity={0.55} />
            <stop offset="100%" stopColor={fillColor} stopOpacity={0.2} />
          </linearGradient>
        );
      });
    })}
  </defs>
));

// ═══════════════════════════════════════════════════════════════
// 子组件：场景背景（alternating colors for visual separation）
// ═══════════════════════════════════════════════════════════════

const SCENE_BG_COLORS = [
  "rgba(246,241,231,0.5)",  // --theme-paper warm
  "rgba(255,253,249,0.5)",  // lighter warm
];

// ═══════════════════════════════════════════════════════════════
// 子组件：注释/提示框覆盖层 (Annotation Overlay)
// ═══════════════════════════════════════════════════════════════

const AnnotationOverlay: React.FC<{
  annotation: { show: boolean; x: number; y: number; type: string; title: string; subtitle?: string; details?: string[] };
  totalW: number;
  totalH: number;
}> = React.memo(({ annotation, totalW, totalH }) => {
  if (!annotation.show) return null;

  const { x, y, type, title, subtitle, details } = annotation;
  const pad = 16;
  const lineHeight = 22;
  const titleFontSize = 14;
  const bodyFontSize = 11;
  // 中文字符宽度估算：fontSize * 0.9（等宽近似）
  const titleCharW = titleFontSize * 0.95;
  const bodyCharW = bodyFontSize * 0.95;
  const MAX_BOX_W = 400;

  // 计算每行文本所需宽度（取最长者）
  const titleW = title.length * titleCharW + pad * 2;
  const subtitleW = subtitle ? subtitle.length * bodyCharW + pad * 2 : 0;
  const detailsMaxW = details
    ? Math.max(...details.map((d) => d.length * bodyCharW + pad * 2), 0)
    : 0;
  let boxW = Math.max(titleW, subtitleW, detailsMaxW, 180);
  boxW = Math.min(boxW, MAX_BOX_W);

  // 内容可用宽度
  const contentW = boxW - pad * 2;

  // 长文本自动换行
  const wrapLine = (text: string, fontSize: number): string[] => {
    const charW = fontSize * 0.95;
    const maxChars = Math.floor(contentW / charW);
    if (text.length <= maxChars) return [text];
    const lines: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= maxChars) {
        lines.push(remaining);
        break;
      }
      // 在 maxChars 附近找自然断点（标点符号后）
      let cut = maxChars;
      for (let j = maxChars - 1; j >= maxChars - 8 && j > 0; j--) {
        if (/[，、。；：！？》」』）\)\,\.\;\:\!\?]/.test(remaining[j])) {
          cut = j + 1;
          break;
        }
      }
      lines.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut);
    }
    return lines;
  };

  // 构建所有显示行
  const titleLines = wrapLine(title, titleFontSize);
  const subtitleLines = subtitle ? wrapLine(subtitle, bodyFontSize) : [];
  const detailLineGroups = (details || []).map((d) => wrapLine(`· ${d}`, bodyFontSize));

  // 计算总行数
  let totalLines = titleLines.length;
  if (subtitleLines.length > 0) totalLines += subtitleLines.length;
  for (const g of detailLineGroups) totalLines += g.length;

  const boxH = pad * 2 + totalLines * lineHeight + (subtitleLines.length > 0 ? 4 : 0) + 8;
  const titleStartY = pad + titleFontSize + 2;

  // 确保提示框不超出边界
  let bx = x + 18;
  let by = y - boxH / 2;
  if (bx + boxW > totalW) bx = x - boxW - 18;
  if (bx < 2) bx = 2;
  if (by < 4) by = 4;
  if (by + boxH > totalH) by = totalH - boxH - 4;

  const bgColor = type === "character" ? "rgba(250,245,235,0.96)"
    : type === "scene" ? "rgba(248,242,230,0.96)"
    : "rgba(252,248,240,0.96)";
  const borderColor = type === "character" ? "#96544D"
    : type === "scene" ? "#B89B6D"
    : "#7F968D";

  // 渲染行
  let curY = titleStartY;
  const textEls: React.ReactNode[] = [];

  // 标题行
  titleLines.forEach((line, i) => {
    textEls.push(
      <text key={`tt-${i}`} x={bx + pad} y={by + curY}
        fontSize={titleFontSize} fontWeight={700} fontFamily={FONT_UI} fill="#4a3424">
        {line}
      </text>
    );
    curY += lineHeight;
  });

  // 副标题行
  if (subtitleLines.length > 0) {
    curY += 4; // 额外间距
    subtitleLines.forEach((line, i) => {
      textEls.push(
        <text key={`st-${i}`} x={bx + pad} y={by + curY}
          fontSize={bodyFontSize} fontWeight={500} fontFamily={FONT_UI}
          fill="rgba(107,85,64,0.8)">
          {line}
        </text>
      );
      curY += lineHeight;
    });
  }

  // 详情行
  detailLineGroups.forEach((group, gi) => {
    group.forEach((line, li) => {
      textEls.push(
        <text key={`dt-${gi}-${li}`} x={bx + pad} y={by + curY}
          fontSize={bodyFontSize} fontWeight={400} fontFamily={FONT_UI}
          fill="rgba(74,52,36,0.7)">
          {line}
        </text>
      );
      curY += lineHeight;
    });
  });

  return (
    <g id="p4-annotation-overlay" pointerEvents="none">
      {/* 指向线 */}
      <line x1={x} y1={y} x2={bx} y2={by + boxH / 2}
        stroke={borderColor} strokeWidth={1.2} strokeOpacity={0.5}
        strokeDasharray="3 2" />

      {/* 提示框背景 */}
      <rect x={bx} y={by} width={boxW} height={boxH} rx={8}
        fill={bgColor} stroke={borderColor} strokeWidth={1.5}
        filter="drop-shadow(0 3px 8px rgba(58,44,33,0.15))" />

      {textEls}
    </g>
  );
});

const SceneBackgrounds: React.FC<{
  positions: any;
  sceneCharacters: any[];
  hoveredScene: number;
  hoveredChar: string;
  onSceneHover: (idx: number) => void;
  onSceneSelect: (idx: number) => void;
  scenes?: any[];
  onShowAnnotation?: (x: number, y: number, type: "character" | "scene" | "line", title: string, subtitle?: string, details?: string[]) => void;
  onHideAnnotation?: () => void;
}> = ({ positions, sceneCharacters, hoveredScene, hoveredChar, onSceneHover, onSceneSelect, scenes, onShowAnnotation, onHideAnnotation }) => (
  <g id="p4-scene-bg">
    {positions.sceneBoxes.map((box: any, i: number) => {
      if (!box) return null;
      const isHighlighted =
        hoveredScene === i ||
        (hoveredChar !== "" &&
          sceneCharacters[i]?.characters?.includes(hoveredChar));
      const sceneData = scenes?.[i];
      const confidence = sceneData?.confidence;
      const isLowConfidence = confidence !== undefined && confidence < 0.5;

      return (
        <rect
          key={`p4-scene-bg-${i}`}
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          fill={isHighlighted ? "rgba(150,84,77,0.12)" : SCENE_BG_COLORS[i % 2]}
          stroke={isHighlighted ? "rgba(150,84,77,0.35)"
            : isLowConfidence ? "rgba(200,150,50,0.45)"
            : "rgba(184,149,111,0.12)"}
          strokeWidth={isHighlighted ? 2 : 1}
          strokeDasharray={isLowConfidence ? "5 3" : undefined}
          rx={4}
          onMouseEnter={(e: React.MouseEvent) => {
            onSceneHover(i);
            const svgEl = (e.target as SVGRectElement).closest("svg");
            if (svgEl && onShowAnnotation) {
              const ctm = (e.target as SVGGraphicsElement).getScreenCTM();
              if (ctm) {
                const svgP = svgEl.createSVGPoint();
                svgP.x = e.clientX;
                svgP.y = e.clientY;
                svgP.matrixTransform(ctm.inverse());
                const sceneName = sceneData?.name || `场景${i + 1}`;
                const charCount = sceneData?.characters?.length || 0;
                const conflict = sceneData?.ratings?.conflict;
                const sentiment = sceneData?.ratings?.sentiment;
                const location = sceneData?.location || "舞台";
                const charNames = sceneData?.characters?.map((c: any) => c.name).slice(0, 5).join("、") || "";

                // ── T4/T5: 增强注释数据 ──
                const confidence = sceneData?.confidence;
                const sentimentConf = sceneData?.ratings?.sentiment_confidence;
                const posWords = sceneData?.ratings?.pos_word_count;
                const negWords = sceneData?.ratings?.neg_word_count;
                const textPreview = sceneData?.text || sceneData?.dialogue || "";

                const details: string[] = [];
                if (charNames) details.push(`出场角色：${charNames}${charCount > 5 ? ` 等${charCount}人` : ""}`);
                if (conflict !== undefined) {
                  const level = conflict > 0.7 ? "激烈冲突" : conflict > 0.4 ? "中度对峙" : conflict > 0.15 ? "轻微摩擦" : "平和推进";
                  details.push(`⚔️ 冲突强度：${(conflict * 100).toFixed(0)}%（${level}）`);
                }
                if (sentiment !== undefined) {
                  const mood = sentiment > 0.3 ? "正面昂扬" : sentiment < -0.3 ? "低沉压抑" : "中性平和";
                  const scLabel = sentimentConf !== undefined
                    ? ` · 可信度${(sentimentConf * 100).toFixed(0)}%`
                    : "";
                  details.push(`💭 情感基调：${mood}${scLabel}`);
                }
                if (posWords !== undefined || negWords !== undefined) {
                  details.push(`📝 词汇分布：正面${posWords ?? 0}词 · 负面${negWords ?? 0}词`);
                }
                // T5: 原文预览
                if (textPreview && textPreview.length > 10) {
                  const preview = textPreview.length > 80 ? textPreview.slice(0, 80) + "…" : textPreview;
                  details.push(`📜 原文预览：${preview}`);
                }

                // 副标题行：数据质量标签
                let subtitle = `📍 地点：${location}  |  👥 角色：${charCount}人`;
                if (confidence !== undefined) {
                  const label = confidence >= 0.7 ? "🟢高" : confidence >= 0.4 ? "🟡中" : "🔴低";
                  subtitle += `  |  数据质量：${label}(${(confidence * 100).toFixed(0)}%)`;
                }

                onShowAnnotation(
                  box.x + box.width / 2, box.y,
                  "scene",
                  `第${sceneData?.number || i + 1}场 · ${sceneName}`,
                  subtitle,
                  details,
                );
              }
            }
          }}
          onMouseMove={(_e: React.MouseEvent) => {
            // Annotation updates handled by parent state via onMouseEnter
          }}
          onMouseLeave={() => {
            onSceneHover(-1);
            if (onHideAnnotation) onHideAnnotation();
          }}
          onClick={() => onSceneSelect(i)}
          style={{ cursor: "pointer", transition: "fill 0.2s, stroke 0.2s" }}
        />
      );
    })}
  </g>
);

// ═══════════════════════════════════════════════════════════════
// 子组件：丝带路径层
// ═══════════════════════════════════════════════════════════════

const RibbonLayer: React.FC<{
  characterScenes: any[];
  charGroupMap: Map<string, string>;
  charShortMap: Map<string, string>;
  sceneCharRatingMap: Map<string, number>;
  positions: any;
  scenes: any[];
  hoveredChar: string;
  onCharHover: (char: string) => void;
  onCharSelect: (char: string) => void;
  onShowAnnotation?: (x: number, y: number, type: "character" | "scene" | "line", title: string, subtitle?: string, details?: string[]) => void;
  onHideAnnotation?: () => void;
  colorMode?: "role" | "sentiment";
}> = ({ characterScenes, charGroupMap, charShortMap, sceneCharRatingMap, positions, scenes, hoveredChar, onCharHover, onCharSelect, onShowAnnotation, onHideAnnotation, colorMode = "role" }) => {
  const total = characterScenes.length;

  // ── T4: 预构建角色→增强数据查找表，避免 O(n) 扫描 ──
  const charEnrichMap = useMemo(() => {
    const m = new Map<string, { emotion: string; confidence: number; evidence: string[]; transitions: number }>();
    for (const s of (scenes || [])) {
      for (const c of (s.characters || [])) {
        const name = c.name;
        if (!name) continue;
        let entry = m.get(name);
        if (!entry) {
          entry = { emotion: "", confidence: 0, evidence: [], transitions: 0 };
          m.set(name, entry);
        }
        if (c.emotion_detail) entry.emotion = c.emotion_detail;
        if (c.emotion_confidence) entry.confidence = Math.max(entry.confidence, c.emotion_confidence);
        if (c.evidence) {
          for (const ev of c.evidence) {
            if (!entry.evidence.includes(ev)) entry.evidence.push(ev);
          }
        }
        if (c.enhanced_emotion?.transition_detected) entry.transitions++;
      }
    }
    // 限制证据数量
    for (const [, v] of m) { v.evidence = v.evidence.slice(0, 3); }
    return m;
  }, [scenes]);

  // ── 丝带粗细权重: 计算最大出场场景数 ──
  const maxCharScenes = useMemo(
    () => Math.max(1, ...characterScenes.map((c: any) => c.scenes?.length || 0)),
    [characterScenes]
  );

  return (
    <g id="p4-ribbon-layer">
      {characterScenes.map((character, i) => {
        const paths = positions.characterPaths[i] || [];
        const squares = positions.characterSquares[i] || [];
        const group = charGroupMap.get(character.character);
        const isFaded = hoveredChar !== "" && hoveredChar !== character.character;
        const isActive = hoveredChar === character.character;

        // ── 论文: 行当色 vs 情感色 ──
        const roleColor = getThemeCharColor(i, total, group);
        let sentimentAvg = 0;
        if (colorMode === "sentiment") {
          let sum = 0; let cnt = 0;
          for (const si of (character.scenes || [])) {
            const r = sceneCharRatingMap.get(`${si}:${character.character}`);
            if (r !== undefined) { sum += r; cnt++; }
          }
          sentimentAvg = cnt > 0 ? sum / cnt : 0;
        }
        const fillColor = colorMode === "sentiment" ? sentimentColor(sentimentAvg) : roleColor;

        // ── 丝带粗细 = 角色重要性 (出场场景数比例) ──
        const sceneRatio = (character.scenes?.length || 1) / maxCharScenes;
        const ribbonStrokeW = isActive ? 0.8 + sceneRatio * 3.5 : 0.5 + sceneRatio * 2.5;

        // ── 置信度透明度: 低置信角色整体淡化 ──
        const enriched = charEnrichMap.get(character.character);
        const avgConfidence = enriched?.confidence || 0.5;
        const confidenceOpacity = isFaded ? 0.12 : Math.max(0.3, avgConfidence);

        return (
          <g
            key={`p4-char-${i}`}
            className={`p4-char-group ${isFaded ? "p4-faded" : ""}`}
            onMouseEnter={(e: React.MouseEvent) => {
              onCharHover(character.character);
              if (onShowAnnotation) {
                const svgEl = (e.target as SVGElement).closest("svg");
                if (svgEl) {
                  const ctm = (e.target as SVGGraphicsElement).getScreenCTM();
                  if (ctm) {
                    const svgP = svgEl.createSVGPoint();
                    svgP.x = e.clientX;
                    svgP.y = e.clientY;
                    const cursor = svgP.matrixTransform(ctm.inverse());
                    const group = charGroupMap.get(character.character) || "其他";
                    const sceneCount = character.scenes?.length || 0;
                    const fullName = character.character;
                    const shortName = charShortMap.get(fullName) || fullName;
                    const knowledge = getCharKnowledge(fullName);

                    // ── T4: 从预构建查找表获取增强数据 ──
                    const enriched = charEnrichMap.get(fullName);

                    // 构建丰富注释
                    const details: string[] = [];
                    if (knowledge?.facePaint) details.push(`🎨 ${knowledge.facePaint}`);
                    if (knowledge?.traits) details.push(`📖 ${knowledge.traits}`);
                    if (knowledge?.plays) details.push(`🎬 ${knowledge.plays}`);
                    if (knowledge?.significance && details.length < 4) details.push(`💡 ${knowledge.significance}`);

                    // T4: 情感描述
                    if (enriched?.emotion && details.length < 5) {
                      details.push(`💭 ${enriched.emotion}`);
                    }
                    // T4: 置信度
                    if (enriched && enriched.confidence > 0 && details.length < 5) {
                      details.push(`📊 情感可信度：${(enriched.confidence * 100).toFixed(0)}%`);
                    }
                    // T4: 情绪转折
                    if (enriched && enriched.transitions > 0 && details.length < 5) {
                      details.push(`⚠️ 检测到 ${enriched.transitions} 处情绪转折`);
                    }
                    // 兜底
                    if (details.length === 0) {
                      details.push(`出场 ${sceneCount} 场 · 点击可固定高亮`);
                      details.push(`悬停其他角色可对比出场关系`);
                    }

                    // T4: 原文证据
                    const evidenceLines: string[] = (enriched?.evidence || []).map(
                      (e, ei) => `📜 证据${ei + 1}：${e.length > 40 ? e.slice(0, 40) + "…" : e}`
                    );

                    onShowAnnotation(
                      cursor.x, cursor.y,
                      "character",
                      `${shortName}`,
                      `行当分组：${group}  |  共出场 ${sceneCount} 场`,
                      [...details.slice(0, 5), ...evidenceLines.slice(0, 3)],
                    );
                  }
                }
              }
            }}
            onMouseMove={(e: React.MouseEvent) => {
              if (!onShowAnnotation) return;
              const svgEl = (e.target as SVGElement).closest("svg");
              if (!svgEl) return;
              const ctm = (e.target as SVGGraphicsElement).getScreenCTM();
              if (ctm) {
                const svgP = svgEl.createSVGPoint();
                svgP.x = e.clientX;
                svgP.y = e.clientY;
                const cursor = svgP.matrixTransform(ctm.inverse());
                const group = charGroupMap.get(character.character) || "其他";
                const sceneCount = character.scenes?.length || 0;
                const fullName = character.character;
                const shortName = charShortMap.get(fullName) || fullName;
                const knowledge = getCharKnowledge(fullName);
                const enriched = charEnrichMap.get(fullName);
                const details: string[] = [];
                if (knowledge?.facePaint) details.push(`🎨 ${knowledge.facePaint}`);
                if (knowledge?.traits) details.push(`📖 ${knowledge.traits}`);
                if (knowledge?.plays) details.push(`🎬 ${knowledge.plays}`);
                if (enriched?.emotion && details.length < 5) details.push(`💭 ${enriched.emotion}`);
                const evidenceLines: string[] = (enriched?.evidence || []).map(
                  (e, ei) => `📜 证据${ei + 1}：${e.length > 40 ? e.slice(0, 40) + "…" : e}`
                );
                if (details.length === 0) {
                  details.push(`出场 ${sceneCount} 场 · 点击可固定高亮`);
                }
                onShowAnnotation(
                  cursor.x, cursor.y,
                  "character",
                  `${shortName}`,
                  `行当分组：${group}  |  共出场 ${sceneCount} 场`,
                  [...details.slice(0, 5), ...evidenceLines.slice(0, 3)],
                );
              }
            }}
            onMouseLeave={() => {
              onCharHover("");
              if (onHideAnnotation) onHideAnnotation();
            }}
            onClick={() => onCharSelect(character.character)}
            style={{ cursor: "pointer", transition: "opacity 0.2s" }}
            opacity={isFaded ? 0.12 : confidenceOpacity}
          >
            {/* 丝带路径 — 粗细反映角色重要性 */}
            {paths.map((path: string, j: number) => (
              <path
                key={`p4-path-${i}-${j}`}
                d={path}
                fill={`url(#p4-linear-${i}-${j})`}
                stroke={fillColor}
                strokeWidth={ribbonStrokeW}
                strokeOpacity={isActive ? 0.8 : isFaded ? 0.25 : 0.45}
                paintOrder="stroke"
              />
            ))}

            {/* 角色标记点 */}
            {squares.map((sq: any, j: number) => {
              if (!sq) return null;
              const sceneIdx = character.scenes[j];
              const importance = sceneCharRatingMap.get(`${sceneIdx}:${character.character}`) ?? 0.5;
              const numChars = scenes[sceneIdx]?.characters?.length || 1;
              const normImportance = normalizeImportance(importance, numChars);
              const markerSize = normalizeMarkerSize(normImportance * character_height);

              return (
                <circle
                  key={`p4-dot-${i}-${j}`}
                  cx={sq.x + sq.width / 2}
                  cy={sq.y + sq.height / 2}
                  r={markerSize / 2}
                  fill={fillColor}
                  stroke={SVG_BG}
                  strokeWidth={1}
                />
              );
            })}

            {/* 角色名标签（第一个出场位置左侧）+ 情感指示点 */}
            {positions.firstPoints[i] && (() => {
              const lx = positions.firstPoints[i].x - 10;
              // 将标签Y对齐到角色行的中心而非顶部, 增大行间距
              const ly = positions.firstPoints[i].y + character_height * 0.55;
              const charName = charShortMap.get(character.character) || character.character;
              // 标签过长时自动截断
              const displayName = charName.length > 4 ? charName.slice(0, 3) + "…" : charName;

              // ── 角色情感指示点 ──
              const enriched = charEnrichMap.get(character.character);
              const avgRating = enriched?.confidence
                ? (() => {
                    let sum = 0; let cnt = 0;
                    for (const s of (scenes || [])) {
                      const c = (s.characters || []).find((ch: any) => ch.name === character.character);
                      if (c && typeof c.rating === "number") { sum += c.rating; cnt++; }
                    }
                    return cnt > 0 ? sum / cnt : 0;
                  })()
                : 0;
              const sentimentColor = avgRating > 0.15 ? "#96544D" : avgRating < -0.15 ? "#7F968D" : "#B89B6D";
              const dotR = 2.5 + (enriched?.confidence || 0.3) * 2;

              return (
                <>
                  <circle cx={lx - 8} cy={ly - 3} r={dotR}
                    fill={sentimentColor} fillOpacity={0.7}
                    stroke={SVG_BG} strokeWidth={1} />
                  <text
                    x={lx}
                    y={ly}
                    textAnchor="end"
                    fill={fillColor}
                    fontSize={13}
                    fontWeight={isActive ? 700 : 500}
                    fontFamily={FONT_UI}
                    paintOrder="stroke"
                    stroke={SVG_BG}
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {displayName}
                  </text>
                </>
              );
            })()}
          </g>
        );
      })}
    </g>
  );
};

// ═══════════════════════════════════════════════════════════════
// 子组件：场景标签（突出的横轴设计）
// ═══════════════════════════════════════════════════════════════

const SceneLabels: React.FC<{
  positions: any;
  scenes: any[];
}> = React.memo(({ positions, scenes }) => {
  const axisY = positions.plotHeight + 12;
  const tickLen = 6;
  const labelY1 = axisY + 22;
  const labelY2 = axisY + 40;
  const sceneW = positions.sceneWidth || 100;

  // 根据场宽动态决定标签显示策略
  const labelEveryN = sceneW < 50 ? 3 : sceneW < 75 ? 2 : 1;
  const labelFontSize = sceneW < 55 ? 10 : sceneW < 75 ? 11 : 13;
  const showSubLabels = sceneW >= 100;

  return (
    <g id="p4-scene-labels">
      {/* 横轴主线 */}
      <line
        x1={positions.scenePos[0]?.x - 16 || 0}
        y1={axisY}
        x2={positions.scenePos[positions.scenePos.length - 1]?.x + 16 || positions.plotWidth}
        y2={axisY}
        stroke="rgba(94,107,118,0.4)"
        strokeWidth={1.5}
        strokeLinecap="round"
      />

      {positions.scenePos.map((pos: any, i: number) => {
        // 过窄时每隔N场显示一个标签
        if (i % labelEveryN !== 0) {
          // 仍显示刻度线
          return (
            <g key={`p4-label-${i}`}>
              <line
                x1={pos.x} y1={axisY - tickLen / 2}
                x2={pos.x} y2={axisY + tickLen / 2}
                stroke="rgba(94,107,118,0.2)"
                strokeWidth={0.8}
                strokeLinecap="round"
              />
            </g>
          );
        }

        const sceneName = scenes[i]?.name || "";
        const sceneNum = scenes[i]?.number || i + 1;
        const shortName = sceneName.length > 5 ? sceneName.slice(0, 4) + "…" : sceneName;

        return (
          <g key={`p4-label-${i}`}>
            {/* 刻度线（纵向） */}
            <line
              x1={pos.x} y1={axisY - tickLen}
              x2={pos.x} y2={axisY + tickLen}
              stroke="rgba(94,107,118,0.35)"
              strokeWidth={1.2}
              strokeLinecap="round"
            />

            {/* 场景号（主标签） */}
            <text
              x={pos.x}
              y={labelY1}
              textAnchor="middle"
              fontSize={labelFontSize}
              fontWeight={700}
              fontFamily={FONT_UI}
              fill="var(--theme-wood, #5E4B3A)"
              paintOrder="stroke"
              stroke={SVG_BG}
              strokeWidth={2}
            >
              第{sceneNum}场
            </text>

            {/* 场景名（副标签）— 仅宽场景显示 */}
            {shortName && showSubLabels && (
              <text
                x={pos.x}
                y={labelY2}
                textAnchor="middle"
                fontSize={10}
                fontWeight={500}
                fontFamily={FONT_UI}
                fill="rgba(94,107,118,0.65)"
                paintOrder="stroke"
                stroke={SVG_BG}
                strokeWidth={2}
              >
                {shortName}
              </text>
            )}

            {/* 场景分隔虚线（向上延伸） */}
            <line
              x1={pos.x} y1={axisY - tickLen}
              x2={pos.x} y2={0}
              stroke="rgba(94,107,118,0.08)"
              strokeWidth={0.8}
              strokeDasharray="3 5"
            />
          </g>
        );
      })}

      {/* 横轴标签 — 横向布局，正常水平文字 */}
      <text
        x={positions.scenePos[positions.scenePos.length - 1]?.x + 22 || positions.plotWidth}
        y={axisY + 4}
        textAnchor="start"
        fontSize={13}
        fontWeight={600}
        fontFamily={FONT_UI}
        fill="var(--theme-text-soft, #8E8A84)"
        paintOrder="stroke"
        stroke={SVG_BG}
        strokeWidth={2}
      >
        场次 →
      </text>
    </g>
  );
});

// ═══════════════════════════════════════════════════════════════
// 子组件：叙事阶段背景色带 (storycurve-inspired phase bands)
// ═══════════════════════════════════════════════════════════════

const NARRATIVE_PHASES = [
  { label: "开端", pct: [0, 0.2], color: "url(#p4-phase-begin)" },
  { label: "发展", pct: [0.2, 0.55], color: "url(#p4-phase-develop)" },
  { label: "高潮", pct: [0.55, 0.8], color: "url(#p4-phase-climax)" },
  { label: "结局", pct: [0.8, 1.0], color: "url(#p4-phase-end)" },
];

interface Position { x: number; y: number; }

const NarrativePhaseBands: React.FC<{
  scenes: Scene[];
  scenePos: Position[];
  plotHeight: number;
  phases?: any[];
  isAdaptive?: boolean;
}> = React.memo(({ scenes, scenePos, plotHeight, phases }) => {
  const n = scenes.length;
  if (n === 0 || !scenePos[0]) return null;

  const phaseList = phases || NARRATIVE_PHASES;

  // 硬编码模式：使用百分比 (startScene 为 undefined)
  const isLegacy = !phases || phases[0]?.startScene === undefined;

  const phaseColors = [
    "url(#p4-phase-begin)",
    "url(#p4-phase-develop)",
    "url(#p4-phase-climax)",
    "url(#p4-phase-end)",
  ];

  return (
    <g id="p4-phase-bands" pointerEvents="none">
      {isLegacy
        ? phaseList.map((phase: any) => {
            const startIdx = Math.floor(n * phase.pct[0]);
            const endIdx = Math.min(Math.floor(n * phase.pct[1]), n - 1);
            const x0 = (scenePos[startIdx]?.x || 0) - 18;
            const x1 = (scenePos[endIdx]?.x || 0) + 18;
            const w = x1 - x0;
            if (w <= 0) return null;
            return (
              <rect
                key={phase.label}
                x={x0}
                y={0}
                width={w}
                height={plotHeight}
                fill={phase.color}
              />
            );
          })
        : phaseList.map((phase: any, pi: number) => {
            const x0 = (scenePos[phase.startScene]?.x || 0) - 18;
            const x1 = (scenePos[phase.endScene]?.x || 0) + 18;
            const w = x1 - x0;
            if (w <= 0) return null;
            return (
              <rect
                key={phase.label}
                x={x0}
                y={0}
                width={w}
                height={plotHeight}
                fill={phaseColors[pi % phaseColors.length]}
              />
            );
          })}
    </g>
  );
});

// ═══════════════════════════════════════════════════════════════
// 子组件：叙事阶段标签 (波形图区域内)
// ═══════════════════════════════════════════════════════════════

const PhaseLabels: React.FC<{
  scenes: Scene[];
  scenePos: Position[];
  plotWidth: number;
  phases?: any[];
  isAdaptive?: boolean;
  bandHeight?: number;
}> = React.memo(({ scenes, scenePos, phases, bandHeight = 0 }) => {
  const n = scenes.length;
  if (n === 0) return null;

  const phaseList = phases || NARRATIVE_PHASES;
  const isLegacy = !phases || phases[0]?.startScene === undefined;

  // 横向布局：标签位于波形图区域内、各阶段列的上方
  const labelY = bandHeight > 0 ? bandHeight - 8 : 24;

  return (
    <g id="p4-phase-labels" pointerEvents="none">
      {isLegacy
        ? phaseList.map((phase: any) => {
            const startIdx = Math.floor(n * phase.pct[0]);
            const endIdx = Math.min(Math.floor(n * phase.pct[1]), n - 1);
            const midX = ((scenePos[startIdx]?.x || 0) + (scenePos[endIdx]?.x || 0)) / 2;
            return (
              <text
                key={phase.label}
                x={midX}
                y={labelY}
                textAnchor="middle"
                fontSize={13}
                fontWeight={700}
                fontFamily={FONT_UI}
                fill="var(--theme-wood, #5E4B3A)"
                fillOpacity={0.55}
                paintOrder="stroke"
                stroke={SVG_BG}
                strokeWidth={3}
                letterSpacing="0.08em"
              >
                {phase.label}
              </text>
            );
          })
        : phaseList.map((phase: any) => {
            const midX = ((scenePos[phase.startScene]?.x || 0) + (scenePos[phase.endScene]?.x || 0)) / 2;
            // ── 增强阶段标签：显示冲突/情感指标 ──
            const hasMetrics = phase.avgConflict !== undefined;
            const subLabel = hasMetrics
              ? `冲突${(phase.avgConflict * 100).toFixed(0)}% · 情感${phase.avgSentiment > 0 ? "+" : ""}${(phase.avgSentiment * 100).toFixed(0)}%`
              : "";
            return (
              <g key={phase.label}>
                <text
                  x={midX}
                  y={labelY}
                  textAnchor="middle"
                  fontSize={13}
                  fontWeight={700}
                  fontFamily={FONT_UI}
                  fill="var(--theme-wood, #5E4B3A)"
                  fillOpacity={0.55}
                  paintOrder="stroke"
                  stroke={SVG_BG}
                  strokeWidth={3}
                  letterSpacing="0.08em"
                >
                  {phase.label}
                </text>
                {subLabel && (
                  <text
                    x={midX}
                    y={labelY + 15}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={500}
                    fontFamily={FONT_UI}
                    fill="var(--theme-text-soft, #8E8A84)"
                    fillOpacity={0.55}
                    paintOrder="stroke"
                    stroke={SVG_BG}
                    strokeWidth={2}
                  >
                    {subLabel}
                  </text>
                )}
              </g>
            );
          })}
    </g>
  );
});

// ═══════════════════════════════════════════════════════════════
// 子组件：阶段分隔虚线 (storycurve-inspired phase dividers)
// ═══════════════════════════════════════════════════════════════

const PhaseDividers: React.FC<{
  scenes: Scene[];
  scenePos: Position[];
  plotHeight: number;
  phases?: any[];
  isAdaptive?: boolean;
}> = React.memo(({ scenes, scenePos, plotHeight, phases }) => {
  const n = scenes.length;
  if (n < 2) return null;

  const phaseList = phases || NARRATIVE_PHASES;
  const isLegacy = !phases || phases[0]?.startScene === undefined;

  const colors = ["#B89B6D", "#96544D", "#7F968D", "#5E6B76"];

  // 在阶段边界处绘制分隔线（不含首尾）
  const boundaries: number[] = [];
  if (isLegacy) {
    boundaries.push(0.2, 0.55, 0.8);
  } else {
    for (let i = 1; i < phaseList.length; i++) {
      boundaries.push(phaseList[i].startScene / Math.max(n - 1, 1));
    }
  }

  return (
    <g id="p4-phase-dividers" pointerEvents="none">
      {boundaries.map((pct, i) => {
        const idx = isLegacy ? Math.floor(n * pct) : Math.floor(n * pct);
        const safeIdx = Math.min(idx, n - 1);
        const x = scenePos[safeIdx]?.x || 0;
        return (
          <line
            key={`div-${i}`}
            x1={x}
            y1={0}
            x2={x}
            y2={plotHeight}
            stroke={colors[i % colors.length]}
            strokeWidth={1}
            strokeOpacity={0.18}
            strokeDasharray="6 8"
          />
        );
      })}
    </g>
  );
});

// ═══════════════════════════════════════════════════════════════
// 子组件：角色图例
// ═══════════════════════════════════════════════════════════════

export const CharacterLegend: React.FC<{
  sortedCharacters: any[];
  hoveredChar: string;
  onCharHover: (char: string) => void;
  onCharSelect: (char: string) => void;
  characterScenes?: any[];
}> = ({ sortedCharacters, hoveredChar, onCharHover, onCharSelect, characterScenes }) => {
  // ── 角色场景数查找 ──
  const charSceneCount = useMemo(() => {
    const m = new Map<string, number>();
    if (characterScenes) {
      characterScenes.forEach((cs: any) => m.set(cs.character, cs.scenes?.length || 0));
    }
    return m;
  }, [characterScenes]);

  const maxScenes = useMemo(
    () => Math.max(1, ...Array.from(charSceneCount.values())),
    [charSceneCount]
  );

  const uniqueGroups = useMemo(() => [...new Set(sortedCharacters.map((c: any) => c.group))], [sortedCharacters]);

  const charIndexMap = useMemo(() => {
    const m = new Map<string, number>();
    sortedCharacters.forEach((c: any, i: number) => m.set(c.character, i));
    return m;
  }, [sortedCharacters]);

  return (
    <div className="p4-legend">
      <h4 className="p4-legend-title">角色图例 · 按重要性排序</h4>
      <div className="p4-legend-groups">
        {uniqueGroups.map((group) => {
          const chars = sortedCharacters
            .filter((c: any) => c.group === group)
            .sort((a: any, b: any) => (charSceneCount.get(b.character) || 0) - (charSceneCount.get(a.character) || 0));
          const groupColor = getThemeGroupColor(group);
          return (
            <div key={group} className="p4-legend-group">
              <span
                className="p4-legend-group-label"
                style={{ color: groupColor, borderColor: groupColor }}
              >
                {group}
              </span>
              <div className="p4-legend-chars">
                {chars.map((c: any) => {
                  const count = charSceneCount.get(c.character) || 0;
                  const barW = Math.max(4, (count / maxScenes) * 40);
                  return (
                  <span
                    key={c.character}
                    className={`p4-legend-char ${
                      hoveredChar === c.character ? "p4-legend-active" : ""
                    }`}
                    style={{
                      borderColor:
                        hoveredChar === c.character
                          ? groupColor
                          : "transparent",
                    }}
                    onMouseEnter={() => onCharHover(c.character)}
                    onMouseLeave={() => onCharHover("")}
                    onClick={() => onCharSelect(c.character)}
                  >
                    <span
                      className="p4-legend-dot"
                      style={{
                        backgroundColor: getThemeCharColor(
                          charIndexMap.get(c.character) ?? 0,
                          sortedCharacters.length,
                          c.group
                        ),
                      }}
                    />
                    <span className="p4-legend-name">{c.short || c.character}</span>
                    {/* 重要性条 + 场次数 */}
                    <span className="p4-legend-bar-wrap">
                      <span className="p4-legend-bar" style={{
                        width: barW,
                        backgroundColor: getThemeCharColor(charIndexMap.get(c.character) ?? 0, sortedCharacters.length, c.group),
                        opacity: 0.45
                      }} />
                    </span>
                    <span className="p4-legend-count">{count}场</span>
                  </span>
                );})}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OperaRibbonViewer;

// ═══════════════════════════════════════════════════════════════
// 行当配色辅助
// ═══════════════════════════════════════════════════════════════

export function getRoleGroupColor(role: string): string {
  return getThemeGroupColor(role);
}
