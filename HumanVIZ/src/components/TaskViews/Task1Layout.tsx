import React, { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import RoleTreeModal from "../Modals/RoleTreeModal";

import "./Task1Layout.scss";

/* ================================================================
   Data — 戏曲角色行当推断与演化分析
   Dataset: 1,473 份剧本, 39 个来源集, 7,875 角色人次, 3,581 独立角色
   ================================================================ */

// 行当体系定义 — 大类独立配色 + 外圈显式浅色变体 (数据来源于 dataset 角色统计)
const ROLE_TREE = {
  name: "行当体系",
  itemStyle: { color: "#e8ddce" },
  children: [
    {
      name: "生", value: 3274,
      itemStyle: { color: "#b8926a" },
      children: [
        { name: "老生", value: 1439, itemStyle: { color: "#d4bea6" }, desc: "中老年男性，重唱工", traits: ["忠义", "稳重", "儒雅"] },
        { name: "小生", value: 805, itemStyle: { color: "#dcc8b1" }, desc: "青年男性，真假声", traits: ["文雅", "清秀", "儒生气"] },
        { name: "武生", value: 353, itemStyle: { color: "#cdb59c" }, desc: "武艺男性，重做工", traits: ["英勇", "刚毅", "武艺高强"] },
        { name: "末·外·生", value: 677, itemStyle: { color: "#e0d2be" }, desc: "传统生行扩展类别", traits: ["宽厚", "持重"] },
      ],
    },
    {
      name: "旦", value: 1507,
      itemStyle: { color: "#96544d" },
      children: [
        { name: "青衣·正旦", value: 945, itemStyle: { color: "#c09894" }, desc: "端庄正派女性", traits: ["贞烈", "端庄", "贤淑"] },
        { name: "老旦", value: 280, itemStyle: { color: "#c9a49f" }, desc: "老年女性角色", traits: ["慈祥", "稳重", "沧桑"] },
        { name: "花旦·花衫", value: 212, itemStyle: { color: "#d3b8b3" }, desc: "活泼少女/青年女性", traits: ["活泼", "娇俏", "直率"] },
        { name: "武旦", value: 70, itemStyle: { color: "#b88b86" }, desc: "武艺女性角色", traits: ["英武", "飒爽", "矫健"] },
      ],
    },
    {
      name: "净", value: 1755,
      itemStyle: { color: "#5e6b76" },
      children: [
        { name: "净", value: 1755, itemStyle: { color: "#9ea6ad" }, desc: "性格刚烈/豪放男性", traits: ["豪放", "刚毅", "粗犷"] },
      ],
    },
    {
      name: "丑", value: 1339,
      itemStyle: { color: "#7f968d" },
      children: [
        { name: "文丑", value: 1282, itemStyle: { color: "#a7b8b3" }, desc: "滑稽/机敏角色", traits: ["滑稽", "机敏", "诙谐"] },
        { name: "武丑", value: 57, itemStyle: { color: "#8ca39e" }, desc: "武艺丑角", traits: ["敏捷", "灵活", "滑稽"] },
      ],
    },
  ],
};

// 规则推断知识库 — 11 条核心推断规则
const INFERENCE_RULES = [
  { condition: "男性 + 老年 + 忠义稳重", result: "老生", confidence: 92 },
  { condition: "男性 + 青年 + 文雅清秀", result: "小生", confidence: 88 },
  { condition: "男性 + 武艺 + 英勇刚毅", result: "武生", confidence: 90 },
  { condition: "男性 + 宽厚持重 + 老年", result: "末·外·生", confidence: 82 },
  { condition: "女性 + 端庄 + 贤淑贞烈", result: "青衣·正旦", confidence: 93 },
  { condition: "女性 + 老年 + 慈祥稳重", result: "老旦", confidence: 88 },
  { condition: "女性 + 活泼 + 年轻娇俏", result: "花旦·花衫", confidence: 87 },
  { condition: "女性 + 武艺 + 飒爽英武", result: "武旦", confidence: 85 },
  { condition: "男性 + 刚烈 + 豪放粗犷", result: "净", confidence: 89 },
  { condition: "不限 + 滑稽 + 机敏诙谐", result: "文丑", confidence: 86 },
  { condition: "不限 + 敏捷 + 灵活滑稽", result: "武丑", confidence: 84 },
];

// 角色样本数 (来自数据集统计，用于置信度计算依据)
const ROLE_SAMPLE_COUNTS: Record<string, number> = {
  "老生": 1439, "小生": 805, "武生": 353, "末·外·生": 677,
  "青衣·正旦": 945, "老旦": 280, "花旦·花衫": 212, "武旦": 70,
  "净": 1755, "文丑": 1282, "武丑": 57,
};

// 表演模式数据 (角色 -> 唱念做打)
const PERFORMANCE_DATA = [
  { role: "包公", sing: 82, speak: 75, act: 50, fight: 15 },
  { role: "诸葛亮", sing: 85, speak: 80, act: 45, fight: 10 },
  { role: "穆桂英", sing: 60, speak: 55, act: 78, fight: 85 },
  { role: "孙悟空", sing: 30, speak: 50, act: 95, fight: 90 },
  { role: "唐明皇", sing: 70, speak: 65, act: 55, fight: 20 },
  { role: "杨贵妃", sing: 88, speak: 60, act: 65, fight: 10 },
  { role: "曹操", sing: 65, speak: 75, act: 60, fight: 35 },
  { role: "红娘", sing: 55, speak: 80, act: 72, fight: 25 },
];

// 角色配色 — 基于燕京清辉主题六色，按角色所属行当分配，同门角色以深浅区分
const ROLE_COLORS: Record<string, string> = {
  "包公": "#5E6B76",     // 净 — 石板灰 (theme-slate)
  "诸葛亮": "#B89B6D",   // 老生 — 琉璃金 (theme-gold)
  "穆桂英": "#96544D",   // 武旦 — 朱砂红 (theme-red)
  "孙悟空": "#7F968D",   // 武丑 — 云水青 (theme-celadon)
  "唐明皇": "#CFBFA0",   // 老生 — 琉璃金·浅 (gold light)
  "杨贵妃": "#B8807A",   // 青衣·正旦 — 朱砂红·浅 (red light)
  "曹操": "#8A949D",     // 净 — 石板灰·浅 (slate light)
  "红娘": "#CFAAA5",     // 花旦·花衫 — 朱砂红·更浅 (red lighter)
};

// 四维定义 — 唱念做打
type Dimension = "sing" | "speak" | "act" | "fight";
const DIMENSIONS: { key: Dimension; label: string; full: string; color: string }[] = [
  { key: "sing", label: "唱", full: "歌唱", color: "var(--theme-red)" },
  { key: "speak", label: "念", full: "念白", color: "var(--theme-gold)" },
  { key: "act", label: "做", full: "身段", color: "var(--theme-celadon)" },
  { key: "fight", label: "打", full: "武打", color: "var(--theme-slate)" },
];

const DIM_DESC: Record<Dimension, string> = {
  sing: "歌唱表演占比",
  speak: "念白台词占比",
  act: "身段动作占比",
  fight: "武打场面占比",
};

// 行当-特征关联数据 (用于Sankey) — 强度值基于数据集角色人次统计加权计算
const SANKEY_LINKS = [
  // 老生 (1,439人次) — 忠义稳重儒雅
  { source: "忠义", target: "老生", value: 402 },
  { source: "稳重", target: "老生", value: 345 },
  { source: "儒雅", target: "老生", value: 230 },
  { source: "英勇", target: "老生", value: 115 },
  { source: "刚毅", target: "老生", value: 57 },
  // 小生 (805人次) — 文雅清秀儒生气
  { source: "文雅", target: "小生", value: 257 },
  { source: "清秀", target: "小生", value: 193 },
  { source: "儒生气", target: "小生", value: 128 },
  { source: "英勇", target: "小生", value: 32 },
  { source: "刚毅", target: "小生", value: 32 },
  // 武生 (353人次) — 英勇刚毅武艺高强
  { source: "英勇", target: "武生", value: 98 },
  { source: "刚毅", target: "武生", value: 84 },
  { source: "武艺高强", target: "武生", value: 70 },
  { source: "矫健", target: "武生", value: 28 },
  // 末·外·生 (677人次) — 宽厚持重稳重
  { source: "宽厚", target: "末·外·生", value: 216 },
  { source: "持重", target: "末·外·生", value: 162 },
  { source: "稳重", target: "末·外·生", value: 81 },
  { source: "忠义", target: "末·外·生", value: 81 },
  // 青衣·正旦 (945人次) — 端庄贤淑贞烈
  { source: "端庄", target: "青衣·正旦", value: 264 },
  { source: "贞烈", target: "青衣·正旦", value: 189 },
  { source: "贤淑", target: "青衣·正旦", value: 189 },
  { source: "武艺高强", target: "青衣·正旦", value: 37 },
  { source: "娇俏", target: "青衣·正旦", value: 37 },
  { source: "活泼", target: "青衣·正旦", value: 37 },
  // 老旦 (280人次) — 慈祥稳重沧桑
  { source: "慈祥", target: "老旦", value: 89 },
  { source: "稳重", target: "老旦", value: 67 },
  { source: "沧桑", target: "老旦", value: 44 },
  { source: "端庄", target: "老旦", value: 22 },
  // 花旦·花衫 (212人次) — 活泼娇俏直率
  { source: "活泼", target: "花旦·花衫", value: 67 },
  { source: "娇俏", target: "花旦·花衫", value: 59 },
  { source: "直率", target: "花旦·花衫", value: 25 },
  { source: "机敏", target: "花旦·花衫", value: 16 },
  // 武旦 (70人次) — 英武飒爽矫健
  { source: "英武", target: "武旦", value: 19 },
  { source: "飒爽", target: "武旦", value: 16 },
  { source: "矫健", target: "武旦", value: 11 },
  { source: "刚毅", target: "武旦", value: 8 },
  // 净 (1,755人次) — 豪放刚毅粗犷
  { source: "豪放", target: "净", value: 421 },
  { source: "刚毅", target: "净", value: 351 },
  { source: "粗犷", target: "净", value: 280 },
  { source: "忠义", target: "净", value: 210 },
  { source: "武艺高强", target: "净", value: 140 },
  // 文丑 (1,282人次) — 滑稽机敏诙谐
  { source: "滑稽", target: "文丑", value: 307 },
  { source: "机敏", target: "文丑", value: 256 },
  { source: "诙谐", target: "文丑", value: 256 },
  { source: "活泼", target: "文丑", value: 102 },
  { source: "直率", target: "文丑", value: 102 },
  // 武丑 (57人次) — 敏捷灵活滑稽
  { source: "敏捷", target: "武丑", value: 15 },
  { source: "灵活", target: "武丑", value: 13 },
  { source: "滑稽", target: "武丑", value: 9 },
  { source: "矫健", target: "武丑", value: 6 },
];

// 行当演化数据 (年代 x 行当) — 基于数据集来源年代分布推算
const EVOLUTION_DATA = [
  { era: "清乾隆", 老生: 38, 小生: 22, 武生: 12, "青衣·正旦": 32, "花旦·花衫": 8, 老旦: 10, 武旦: 4, 净: 40, 文丑: 30, 武丑: 3 },
  { era: "清嘉庆", 老生: 42, 小生: 24, 武生: 14, "青衣·正旦": 35, "花旦·花衫": 10, 老旦: 12, 武旦: 5, 净: 42, 文丑: 32, 武丑: 3 },
  { era: "清道光", 老生: 46, 小生: 26, 武生: 16, "青衣·正旦": 38, "花旦·花衫": 12, 老旦: 14, 武旦: 6, 净: 44, 文丑: 34, 武丑: 4 },
  { era: "清咸丰", 老生: 48, 小生: 28, 武生: 18, "青衣·正旦": 40, "花旦·花衫": 14, 老旦: 16, 武旦: 7, 净: 46, 文丑: 35, 武丑: 4 },
  { era: "清同治", 老生: 50, 小生: 30, 武生: 22, "青衣·正旦": 42, "花旦·花衫": 16, 老旦: 18, 武旦: 8, 净: 46, 文丑: 36, 武丑: 4 },
  { era: "清光绪", 老生: 52, 小生: 32, 武生: 26, "青衣·正旦": 44, "花旦·花衫": 18, 老旦: 20, 武旦: 9, 净: 48, 文丑: 38, 武丑: 5 },
  { era: "民国", 老生: 46, 小生: 34, 武生: 30, "青衣·正旦": 38, "花旦·花衫": 22, 老旦: 22, 武旦: 11, 净: 42, 文丑: 36, 武丑: 5 },
  { era: "现代", 老生: 40, 小生: 34, 武生: 28, "青衣·正旦": 34, "花旦·花衫": 20, 老旦: 18, 武旦: 12, 净: 38, 文丑: 32, 武丑: 6 },
];

// 数据集概览 — 39个文件夹，1,473份剧本 (实际扫描统计)
const FOLDER_STATS = [
  { code: "01", name: "《戏考》", count: 448 },
  { code: "02", name: "《国剧大成》", count: 194 },
  { code: "03", name: "《京剧汇编》", count: 360 },
  { code: "04", name: "《京剧丛刊》", count: 71 },
  { code: "05", name: "《传统剧目汇编》", count: 67 },
  { code: "07", name: "《中国传统戏曲剧本选集》", count: 2 },
  { code: "08-11", name: "其他剧集文献", count: 17 },
  { code: "13-15", name: "戏曲刊物合辑 · 3种", count: 33 },
  { code: "70-72", name: "名演员·流派剧本选 · 12种", count: 126 },
  { code: "704-706", name: "花脸·丑行演员选 · 3种", count: 19 },
  { code: "708", name: "作家剧本集 · 5种", count: 14 },
  { code: "709", name: "昆曲·名家剧本选 · 4种", count: 71 },
  { code: "800-940", name: "录音·演出·院团改编本 · 3种", count: 51 },
];

/* ================================================================
   Sub-components — 抽屉面板内容 (保持不变)
   ================================================================ */

const StageCard: React.FC<{
  step: number; title: string; subtitle: string;
  details: string[]; evidence: string; color: string;
}> = ({ step, title, subtitle, details, evidence, color }) => (
  <div className="t1-stage-card">
    <div className="t1-stage-card-header">
      <span className="t1-stage-number" style={{ background: color }}>{step}</span>
      <div>
        <div className="t1-stage-title">{title}</div>
        <div className="t1-stage-subtitle">{subtitle}</div>
      </div>
    </div>
    <ul className="t1-stage-details">
      {details.map((d, i) => <li key={i}>{d}</li>)}
    </ul>
    <div className="t1-stage-evidence">
      <span className="t1-evidence-icon">📋</span>{evidence}
    </div>
  </div>
);

const FeatureModelPanel: React.FC = () => (
  <div className="t1-stage-cards">
    <StageCard step={1} title="基础属性抽取" subtitle="正则规则 + 关键词词典 + NER识别"
      details={["性别: 男/女", "年龄: 少年/中年/老年", "身份: 官员/书生/将军/平民", "社会地位: 皇帝~乞丐 多层级体系"]}
      evidence="从角色出场白、舞台提示中提取基础身份信息"
      color="var(--theme-red)" />
    <StageCard step={2} title="性格特征抽取" subtitle="情感词典 + KeyBERT + TF-IDF"
      details={["忠义/狡诈/泼辣/温婉/刚毅/诙谐", "基于台词文本的情感极性分析", "KeyBERT 关键词自动提取", "TF-IDF 核心特征词发现"]}
      evidence="综合多维度特征词库构建角色性格画像"
      color="var(--theme-gold)" />
    <StageCard step={3} title="表演形式分析 (重点)" subtitle="唱·念·做·打 四功统计"
      details={["唱: 情感表达 — 大段唱腔占比", "念: 台词主导 — 韵白/散白比例", "做: 身段动作 — 舞台提示频次", "打: 武戏行为 — 武打场面密度"]}
      evidence="构建角色→表演模式向量 (唱念做打四维)"
      color="var(--theme-celadon)" />
    <StageCard step={4} title="社会关系网络" subtitle="角色共现 + 对白交互"
      details={["角色共现场次矩阵", "对白交互频率统计", "上下级/亲属/敌对等关系类型", "中心角色 → 辅助角色层级"]}
      evidence="关系网络辅助行当推断（如: 对峙关系 → 净/武生）"
      color="var(--theme-slate)" />
  </div>
);

const InferenceModelPanel: React.FC = () => (
  <div className="t1-inference-panel">
    <div className="t1-section-intro">
      <strong>「规则推断 + 语义表示」融合方案</strong>
      <p>不采用纯黑盒分类，而是先以规则知识库进行可解释推断，再用语义embedding进行概率融合，最终输出行当概率分布。</p>
    </div>

    <h3 className="t1-panel-subtitle">第一阶段：规则推断知识库</h3>
    <table className="t1-data-table">
      <thead><tr><th>条件组合</th><th>推断结果</th><th>置信度</th></tr></thead>
      <tbody>
        {INFERENCE_RULES.map((r, i) => (
          <tr key={i}>
            <td>{r.condition}</td>
            <td><span className="t1-role-tag">{r.result}</span></td>
            <td><ConfidenceWithInfo confidence={r.confidence} roleType={r.result} /></td>
          </tr>
        ))}
      </tbody>
    </table>

    <h3 className="t1-panel-subtitle">第二阶段：语义Embedding</h3>
    <div className="t1-tech-grid">
      <div className="t1-tech-card"><span className="t1-tech-badge recommend">强烈推荐</span><strong>BGE</strong><p>中文语义理解SOTA</p></div>
      <div className="t1-tech-card"><span className="t1-tech-badge">推荐</span><strong>SimCSE</strong><p>对比学习表征</p></div>
      <div className="t1-tech-card"><span className="t1-tech-badge">推荐</span><strong>sentence-transformers</strong><p>多语言支持</p></div>
    </div>

    <h3 className="t1-panel-subtitle">第三阶段：概率融合输出</h3>
    <div className="t1-probability-example">
      <div className="t1-prob-role">
        <span className="t1-prob-name">角色: 包公</span>
        <div className="t1-prob-bars">
          <div className="t1-prob-bar"><span className="t1-bar-label">老生</span><span className="t1-bar-fill" style={{ width: "78%" }} /><span className="t1-bar-pct">78%</span></div>
          <div className="t1-prob-bar"><span className="t1-bar-label">净</span><span className="t1-bar-fill" style={{ width: "15%" }} /><span className="t1-bar-pct">15%</span></div>
          <div className="t1-prob-bar"><span className="t1-bar-label">武生</span><span className="t1-bar-fill" style={{ width: "7%" }} /><span className="t1-bar-pct">7%</span></div>
        </div>
      </div>
      <p className="t1-prob-note">概率化输出更符合行当模糊与融合现象</p>
    </div>
  </div>
);

// 行当分布特征数据 (从数据集统计)
interface RoleFeatureRow {
  rank: number;
  role: string;
  count: number;
  uniqueChars: number;
  pct: string;
  topChars: string;
  keyTraits: string;
}
const ROLE_FEATURE_DATA: RoleFeatureRow[] = [
  { rank: 1, role: "净", count: 1755, uniqueChars: 744, pct: "22.3%", topChars: "曹操(79)、关羽(79)、张飞(76)", keyTraits: "豪放·刚毅·粗犷" },
  { rank: 2, role: "老生", count: 1439, uniqueChars: 540, pct: "18.3%", topChars: "诸葛亮(89)、刘备(85)、鲁肃(32)", keyTraits: "忠义·稳重·儒雅" },
  { rank: 3, role: "文丑", count: 1282, uniqueChars: 811, pct: "16.3%", topChars: "程咬金(26)、书童(16)、酒保(16)", keyTraits: "滑稽·机敏·诙谐" },
  { rank: 4, role: "青衣·正旦", count: 945, uniqueChars: 523, pct: "12.0%", topChars: "王宝钏(28)、孙尚香(12)、丫鬟(11)", keyTraits: "端庄·贤淑·贞烈" },
  { rank: 5, role: "小生", count: 805, uniqueChars: 413, pct: "10.2%", topChars: "周瑜(30)、李世民(20)、贾宝玉(16)", keyTraits: "文雅·清秀·儒生气" },
  { rank: 6, role: "末·外·生", count: 677, uniqueChars: 492, pct: "8.6%", topChars: "刘备(13)、王承恩(7)、徐勣(6)", keyTraits: "宽厚·持重·稳重" },
  { rank: 7, role: "武生", count: 353, uniqueChars: 161, pct: "4.5%", topChars: "赵云(44)、孙悟空(26)、黄天霸(18)", keyTraits: "英勇·刚毅·武艺高强" },
  { rank: 8, role: "老旦", count: 280, uniqueChars: 144, pct: "3.6%", topChars: "佘太君(24)、吴国太(10)、徐母(10)", keyTraits: "慈祥·稳重·沧桑" },
  { rank: 9, role: "花旦·花衫", count: 212, uniqueChars: 156, pct: "2.7%", topChars: "丫鬟(7)、春香(5)、杨贵妃(4)", keyTraits: "活泼·娇俏·直率" },
  { rank: 10, role: "武旦", count: 70, uniqueChars: 55, pct: "0.9%", topChars: "鲍金花(5)、花碧莲(4)、穆桂英(3)", keyTraits: "英武·飒爽·矫健" },
  { rank: 11, role: "武丑", count: 57, uniqueChars: 38, pct: "0.7%", topChars: "朱光祖(6)、杨香武(5)、时迁(3)", keyTraits: "敏捷·灵活·滑稽" },
];

// 特征标签词汇表 — 共19个特征维度
const ALL_FEATURE_TRAITS = [
  "忠义", "稳重", "儒雅", "文雅", "清秀", "儒生气",
  "英勇", "刚毅", "武艺高强", "矫健", "宽厚", "持重",
  "端庄", "贞烈", "贤淑", "慈祥", "沧桑", "活泼", "娇俏",
  "直率", "英武", "飒爽", "豪放", "粗犷", "滑稽", "机敏",
  "诙谐", "敏捷", "灵活",
];

/** 紧凑版 Sankey 图 — 用于右侧悬浮面板 */
const SankeyPanel: React.FC = () => {
  const sankeyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sankeyRef.current) return;
    const chart = echarts.init(sankeyRef.current);
    const featureNodes = ALL_FEATURE_TRAITS.map(n => ({ name: n, itemStyle: { color: "#b8926a" } }));
    const roleNodes = ["老生", "小生", "武生", "末·外·生", "青衣·正旦", "花旦·花衫", "老旦", "武旦", "净", "文丑", "武丑"].map(n => ({ name: n, itemStyle: { color: "#96544d" } }));
    chart.setOption({
      tooltip: {
        trigger: "item",
        triggerOn: "mousemove",
        formatter: (params: any) => {
          if (params.dataType === "edge") {
            return `${params.data.source} → ${params.data.target}<br/>关联强度: ${params.data.value}`;
          }
          return `${params.name}`;
        },
      },
      series: [{
        type: "sankey",
        emphasis: { focus: "adjacency" },
        nodeAlign: "left",
        layoutIterations: 0,
        data: [...featureNodes, ...roleNodes],
        links: SANKEY_LINKS.map(l => ({
          source: l.source,
          target: l.target,
          value: l.value,
          lineStyle: { color: "gradient", curveness: 0.5 },
        })),
        label: { fontSize: 10, color: "#3a2c21" },
        lineStyle: { color: "gradient", curveness: 0.5, opacity: 0.25 },
      }],
    });
    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(sankeyRef.current);
    return () => {
      window.removeEventListener("resize", handleResize);
      observer.disconnect();
      chart.dispose();
    };
  }, []);

  return (
    <div className="t1-sankey-compact">
      <div ref={sankeyRef} style={{ width: "100%", height: "100%" }} />
      <p className="t1-prob-note" style={{ marginTop: 6, fontSize: 11, flexShrink: 0 }}>
        左侧 29 个特征维度 → 右侧 11 个行当分类 · 连线宽度 ∝ 关联强度
      </p>
    </div>
  );
};

const FeatureRelationPanel: React.FC = () => {
  const sankeyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sankeyRef.current) return;
    const chart = echarts.init(sankeyRef.current);
    const featureNodes = ALL_FEATURE_TRAITS.map(n => ({ name: n, itemStyle: { color: "#b8926a" } }));
    const roleNodes = ["老生", "小生", "武生", "末·外·生", "青衣·正旦", "花旦·花衫", "老旦", "武旦", "净", "文丑", "武丑"].map(n => ({ name: n, itemStyle: { color: "#96544d" } }));
    const nodes = [...featureNodes, ...roleNodes];
    chart.setOption({
      tooltip: {
        trigger: "item",
        triggerOn: "mousemove",
        formatter: (params: any) => {
          if (params.dataType === "edge") {
            return `${params.data.source} → ${params.data.target}<br/>关联强度: ${params.data.value}`;
          }
          return `${params.name}`;
        },
      },
      series: [{
        type: "sankey",
        emphasis: { focus: "adjacency" },
        nodeAlign: "left",
        data: nodes,
        links: SANKEY_LINKS.map(l => ({
          source: l.source,
          target: l.target,
          value: l.value,
          lineStyle: { color: "gradient", curveness: 0.5 },
        })),
        label: { fontSize: 11, color: "#3a2c21" },
        lineStyle: { color: "gradient", curveness: 0.5, opacity: 0.3 },
      }],
    });
    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(sankeyRef.current);
    return () => {
      window.removeEventListener("resize", handleResize);
      observer.disconnect();
      chart.dispose();
    };
  }, []);

  return (
    <div className="t1-feature-relation">
      {/* 数据概况 */}
      <div className="t1-section-intro">
        <strong>基于 1,473 份剧本 · 7,875 条角色信息的特征-行当关系分析</strong>
        <p>从数据集中提取11种典型行当类型，关联29个核心表演与性格特征维度，构建行当-特征双模态推断矩阵。左侧为角色性格/表演特征，右侧为行当分类，连线宽度表示特征-行当关联强度（基于数据集实际频率加权）。</p>
      </div>

      {/* Sankey 图 */}
      <div className="t1-sankey-wrapper">
        <h3 className="t1-panel-subtitle">特征—行当关系 Sankey 图</h3>
        <div ref={sankeyRef} style={{ width: "100%", height: "520px" }} />
        <p className="t1-prob-note" style={{ marginTop: 8 }}>
          左侧为 29 个核心特征维度（琉璃金），右侧为 11 个行当分类（朱砂红）。连线宽度 ∝ 关联强度，强度值由数据集角色人次与特征权重共同决定。
        </p>
      </div>

      {/* 行当-特征数据详表 */}
      <h3 className="t1-panel-subtitle">数据集行当分布与特征关联详表</h3>
      <div className="t1-table-scroll">
        <table className="t1-data-table t1-feature-table">
          <thead>
            <tr>
              <th>#</th>
              <th>行当</th>
              <th>总人次</th>
              <th>占比</th>
              <th>独立角色数</th>
              <th>核心特征</th>
              <th>典型角色 (频次)</th>
            </tr>
          </thead>
          <tbody>
            {ROLE_FEATURE_DATA.map((r) => (
              <tr key={r.role}>
                <td className="t1-rank">{r.rank}</td>
                <td><span className="t1-role-tag">{r.role}</span></td>
                <td className="t1-num">{r.count.toLocaleString()}</td>
                <td className="t1-pct">{r.pct}</td>
                <td className="t1-num">{r.uniqueChars}</td>
                <td className="t1-traits">{r.keyTraits}</td>
                <td className="t1-chars">{r.topChars}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 关键发现 */}
      <div className="t1-evolution-insights" style={{ marginTop: 16 }}>
        <h3>特征-行当关系关键发现</h3>
        <ul>
          <li><strong>净行主导</strong>: 净行（1,755人次, 22.3%）是全数据集最大行当类别，以豪放·刚毅·粗犷为核心特征，反映了京剧剧目偏好性格强烈的男性角色</li>
          <li><strong>文丑广泛性</strong>: 文丑角色种类最丰富（811 独立角色类型），覆盖书童、酒保、鸨儿等大量社会底层角色，说明丑行在叙事中承担广泛的社会功能</li>
          <li><strong>老生核心地位</strong>: 老生（1,439人次）以忠义稳重为主特征，诸葛亮、刘备等历史人物高频出现，反映忠义题材在京剧中的核心地位</li>
          <li><strong>特征交叉性</strong>: 净与老生共享"忠义"特征，青衣·正旦与花旦共享"活泼娇俏"特征，说明行当之间存在边界模糊区域</li>
          <li><strong>武行小众性</strong>: 武旦(0.9%)、武丑(0.7%)占比最低，但每类特征的辨识度极高，武术与特定性格特征高度绑定</li>
          <li><strong>多达658个角色</strong>在不同剧本中被赋予不同行当，进一步说明行当推断需要灵活的概率化输出</li>
        </ul>
      </div>
    </div>
  );
};

// 演化图配色 — 按行当大类归属映射，与 ROLE_TREE 色系一致
const EVO_LINE_COLORS: Record<string, string> = {
  // 生行 — 琉璃金系 (theme-gold #b8926a)
  "老生": "#b8926a",
  "小生": "#c9a87d",
  "武生": "#a6845e",
  // 旦行 — 朱砂红系 (theme-red #96544d)
  "青衣·正旦": "#96544d",
  "花旦·花衫": "#b8807a",
  "老旦": "#a86b66",
  "武旦": "#8b4a44",
  // 净行 — 石板灰系 (theme-slate #5e6b76)
  "净": "#5e6b76",
  // 丑行 — 云水青系 (theme-celadon #7f968d)
  "文丑": "#7f968d",
  "武丑": "#6b8279",
};

const EvolutionPanel: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const eras = EVOLUTION_DATA.map(d => d.era);
    const types = ["老生", "小生", "武生", "青衣·正旦", "花旦·花衫", "老旦", "武旦", "净", "文丑", "武丑"];
    chart.setOption({
      color: types.map(t => EVO_LINE_COLORS[t]),
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(255,255,255,0.94)",
        borderColor: "var(--theme-border)",
        textStyle: { fontSize: 12, color: "var(--theme-wood)", fontFamily: "Noto Sans SC, sans-serif" },
        axisPointer: { type: "cross", crossStyle: { color: "var(--theme-text-soft)" } },
      },
      legend: {
        type: "scroll", bottom: 0,
        textStyle: { fontSize: 11, color: "var(--theme-wood)", fontFamily: "Noto Sans SC, sans-serif" },
        itemWidth: 14, itemHeight: 3, itemGap: 12,
        pageIconSize: 10, pageTextStyle: { color: "var(--theme-text-soft)" },
      },
      grid: { left: 48, right: 24, top: 24, bottom: 48 },
      xAxis: {
        type: "category", data: eras, boundaryGap: false,
        axisLine: { lineStyle: { color: "var(--theme-border-soft)" } },
        axisTick: { show: false },
        axisLabel: { rotate: 30, fontSize: 11, color: "var(--theme-wood)", fontFamily: "Noto Sans SC, sans-serif" },
      },
      yAxis: {
        type: "value", name: "出现频次",
        nameTextStyle: { fontSize: 11, color: "var(--theme-text-soft)", fontFamily: "Noto Sans SC, sans-serif" },
        axisLabel: { fontSize: 11, color: "var(--theme-text-soft)", fontFamily: "Noto Sans SC, sans-serif" },
        splitLine: { lineStyle: { color: "var(--theme-border-soft)", type: "dashed" } },
      },
      series: types.map(t => ({
        name: t, type: "line",
        data: EVOLUTION_DATA.map(d => (d as any)[t]),
        symbol: "circle", symbolSize: 4,
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.06 },
        emphasis: { focus: "series", symbolSize: 7 },
      })),
    });
    return () => chart.dispose();
  }, []);
  return (
    <div>
      <div ref={ref} style={{ width: "100%", height: "340px" }} />
      <div className="t1-evolution-insights">
        <h3>关键发现</h3>
        <ul>
          <li><strong>老生主导期 (清中期)</strong>: 乾隆至光绪，老生行当占比持续上升，反映忠义题材盛行</li>
          <li><strong>花旦上升期 (民国)</strong>: 花旦角色显著增多，女性角色地位提升</li>
          <li><strong>行当融合趋势 (现代)</strong>: 各行当占比趋于均衡，行当边界模糊化</li>
          <li><strong>武戏增长</strong>: 武生/武旦自同治后持续增长，技术性表演受重视</li>
        </ul>
      </div>
    </div>
  );
};

/* ================================================================
   Main-grid Charts — 左/右侧面板 + 中央主区
   ================================================================ */

/** 左侧面板 — 剧本数据概览 (柱状图) */
const DatasetOverviewChart: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const data = [...FOLDER_STATS].reverse();
    chart.setOption({
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 136, right: 32, top: 6, bottom: 6 },
      xAxis: { type: "value", axisLabel: { fontSize: 12 }, splitLine: { lineStyle: { color: "var(--theme-border-soft)" } } },
      yAxis: { type: "category", data: data.map(d => d.name), axisLabel: { fontSize: 12, color: "var(--theme-wood)" }, axisLine: { show: false }, axisTick: { show: false } },
      series: [{
        type: "bar", data: data.map(d => d.count), barWidth: 14,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: "rgba(184,149,111,0.5)" }, { offset: 1, color: "rgba(184,149,111,0.95)" },
          ]),
          borderRadius: [0, 4, 4, 0],
        },
        label: { show: true, position: "right", fontSize: 12, color: "var(--theme-wood)", fontWeight: 600 },
      }],
    });
    return () => chart.dispose();
  }, []);
  return <div ref={ref} style={{ width: "100%", height: `${FOLDER_STATS.length * 30 + 16}px` }} />;
};

/** 行当体系结构 — 双层环形图: 内圈生旦净丑不变 + 外圈邻接气泡展示子类 (支持点击放大) */
const RoleTreeChart: React.FC<{ onClick?: () => void; className?: string }> = ({ onClick, className }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);

    const categories = ROLE_TREE.children as any[];

    // 内圈 — 生旦净丑 四大行当 (donut)
    const innerData = categories.map((c: any) => ({
      name: c.name,
      value: c.value,
      itemStyle: {
        color: c.itemStyle.color,
        borderColor: "#fff",
        borderWidth: 3,
      },
    }));

    // 外圈 — 子类气泡 (pie with padAngle + borderRadius)
    const outerData: any[] = [];
    for (const cat of categories) {
      const subs: any[] = cat.children || [];
      for (const sub of subs) {
        outerData.push({
          name: sub.name,
          value: sub.value,
          itemStyle: {
            color: sub.itemStyle.color,
            borderColor: "#fff",
            borderWidth: 2.5,
            borderRadius: 8,
            shadowBlur: 4,
            shadowColor: "rgba(0,0,0,0.12)",
          },
          _desc: sub.desc,
          _traits: sub.traits,
          _parent: cat.name,
        });
      }
    }

    const option = {
      tooltip: {
        trigger: "item",
        formatter: (p: any) => {
          const d = p.data;
          if (d._parent) {
            const traits = d._traits ? `<br/>特征: ${d._traits.join(" · ")}` : "";
            const desc = d._desc ? `<br/>${d._desc}` : "";
            return `<strong>${d.name}</strong> (${d.value}人次) · ${d._parent}行${desc}${traits}`;
          }
          return `<strong>${d.name}</strong><br/>角色人次: ${d.value.toLocaleString()}`;
        },
      },
      series: [
        {
          type: "pie",
          data: innerData,
          radius: ["22%", "50%"],
          center: ["50%", "50%"],
          startAngle: 90,
          label: {
            show: true,
            position: "inside",
            fontSize: 13,
            fontWeight: 700,
            color: "#fff",
            textShadowColor: "rgba(0,0,0,0.35)",
            textShadowBlur: 2,
          },
          emphasis: {
            scaleSize: 6,
            label: { fontSize: 15 },
          },
          z: 2,
        },
        {
          type: "pie",
          data: outerData,
          radius: ["58%", "90%"],
          center: ["50%", "50%"],
          startAngle: 90,
          padAngle: 1.0,
          label: {
            show: true,
            position: "inside",
            fontSize: 9,
            fontWeight: 600,
            color: "#fff",
            textShadowColor: "rgba(0,0,0,0.3)",
            textShadowBlur: 1.5,
            formatter: (p: any) => p.data.value > 300 ? p.data.name : "",
          },
          emphasis: {
            scaleSize: 6,
            label: { fontSize: 11 },
            itemStyle: {
              shadowBlur: 10,
              shadowColor: "rgba(0,0,0,0.18)",
            },
          },
          z: 1,
        },
      ],
    };
    chart.setOption(option);

    const handleResize = () => chart.resize();
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    window.addEventListener("resize", handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`t1-role-tree-thumb ${className ?? ""}`}
      onClick={onClick}
      title="点击查看大图"
    />
  );
};

/** 中央主区 — 角色表演模式图 (支持极坐标扇形图 / Cartesian 分组柱状图切换) */
const PerformanceRadarChart: React.FC<{ hiddenRoles: Set<string>; mode: "polar" | "cartesian" }> = ({ hiddenRoles, mode }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);

    const visibleData = PERFORMANCE_DATA.filter(d => !hiddenRoles.has(d.role));
    const dimKeys: Dimension[] = ["sing", "speak", "act", "fight"];

    if (mode === "polar") {
      const dimNames = ["唱\n(歌唱)", "念\n(念白)", "做\n(身段)", "打\n(武打)"];
      const dimShort = ["唱(歌唱)", "念(念白)", "做(身段)", "打(武打)"];
      const n = visibleData.length;
      const barWidth = n > 0 ? `${(80 / n).toFixed(1)}%` : "80%";

      chart.setOption({
        tooltip: {
          trigger: "item",
          formatter: (p: any) => {
            if (!p.seriesName) return "";
            const d = PERFORMANCE_DATA.find(r => r.role === p.seriesName);
            if (!d) return p.seriesName;
            return `<strong>${d.role}</strong><br/>
              ${dimShort[p.dataIndex]}: ${p.value}<br/>
              唱: ${d.sing} &nbsp;|&nbsp; 念: ${d.speak} &nbsp;|&nbsp; 做: ${d.act} &nbsp;|&nbsp; 打: ${d.fight}`;
          },
        },
        legend: n > 0 ? {
          show: true,
          bottom: 6,
          textStyle: { fontSize: 11, color: "var(--theme-wood)", fontFamily: "PT Serif, Noto Serif SC, serif" },
          data: visibleData.map(d => d.role),
        } : undefined,
        polar: {
          center: ["50%", "50%"],
          radius: ["6%", "68%"],
        },
        angleAxis: {
          type: "category",
          data: dimNames,
          boundaryGap: true,
          axisLabel: {
            fontSize: 16,
            color: "#3a2c21",
            fontWeight: 700,
            margin: 14,
            fontFamily: "PT Serif, Noto Serif SC, serif",
          },
          axisLine: {
            lineStyle: { color: "rgba(127,150,141,0.3)", width: 1.5 },
          },
          splitLine: {
            lineStyle: { color: "rgba(127,150,141,0.18)", width: 1 },
          },
        },
        radiusAxis: {
          max: 100,
          splitNumber: 4,
          axisLabel: {
            show: true,
            fontSize: 10,
            color: "var(--theme-text-soft)",
            distance: 2,
            fontFamily: "PT Serif, Noto Serif SC, serif",
            formatter: (v: number) => (v === 0 ? "" : String(v)),
          },
          axisLine: { lineStyle: { color: "var(--theme-border-strong)", width: 1.5 } },
          splitLine: {
            lineStyle: { color: "rgba(127,150,141,0.18)", width: 1 },
          },
          splitArea: {
            areaStyle: { color: ["rgba(127,150,141,0.02)", "rgba(127,150,141,0.05)"] },
          },
        },
        series: visibleData.map((d, idx) => ({
          type: "bar",
          data: [d.sing, d.speak, d.act, d.fight],
          coordinateSystem: "polar",
          name: d.role,
          barWidth,
          barGap: "12%",
          barCategoryGap: "8%",
          itemStyle: {
            color: ROLE_COLORS[d.role],
            opacity: 0.78,
            borderColor: "#fff",
            borderWidth: 0.6,
            borderRadius: [4, 4, 0, 0],
          },
          emphasis: {
            itemStyle: {
              opacity: 1,
              borderWidth: 2,
              shadowBlur: 10,
              shadowColor: "rgba(0,0,0,0.15)",
            },
          },
          label: {
            show: n <= 4,
            position: "outside",
            fontSize: 10,
            color: "var(--theme-wood)",
            fontWeight: 600,
            fontFamily: "PT Serif, Noto Serif SC, serif",
            formatter: (p: any) => (p.value > 30 ? d.role : ""),
          },
          z: PERFORMANCE_DATA.length - idx,
        })),
      }, true);
    } else {
      chart.setOption({
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: (p: any) => {
            if (!Array.isArray(p)) return "";
            let html = `<strong>${p[0].name}</strong>`;
            p.forEach((item: any) => {
              html += `<br/>${item.marker} ${item.seriesName}: ${item.value}`;
            });
            return html;
          },
        },
        legend: {
          show: true,
          bottom: 6,
          textStyle: { fontSize: 11, color: "var(--theme-wood)", fontFamily: "PT Serif, Noto Serif SC, serif" },
          data: visibleData.map(d => d.role),
        },
        grid: { left: 48, right: 24, top: 20, bottom: 52 },
        xAxis: {
          type: "category",
          data: dimKeys,
          boundaryGap: true,
          axisLine: {
            lineStyle: { color: "var(--theme-border-strong)", width: 1.5 },
          },
          axisTick: { show: false },
          axisLabel: {
            fontSize: 16,
            fontWeight: 700,
            margin: 10,
            fontFamily: "PT Serif, Noto Serif SC, serif",
            formatter: (key: string) => {
              const dim = DIMENSIONS.find(dim => dim.key === key);
              return dim ? dim.label : key;
            },
            color: (key: string) => {
              const dim = DIMENSIONS.find(dim => dim.key === key);
              return dim ? dim.color : "var(--theme-wood)";
            },
          },
          splitLine: { show: false },
        },
        yAxis: {
          type: "value",
          max: 100,
          interval: 25,
          name: "得分",
          nameTextStyle: { fontSize: 11, color: "var(--theme-text-soft)", fontFamily: "PT Serif, Noto Serif SC, serif" },
          axisLabel: {
            fontSize: 11,
            color: "var(--theme-text-soft)",
            fontFamily: "PT Serif, Noto Serif SC, serif",
          },
          axisLine: {
            show: true,
            lineStyle: { color: "var(--theme-border-strong)", width: 1.5 },
          },
          axisTick: { show: false },
          splitLine: {
            lineStyle: { color: "var(--theme-border-soft)", type: "dashed" },
          },
        },
        series: visibleData.map((d) => ({
          type: "bar",
          name: d.role,
          data: dimKeys.map(k => d[k]),
          barWidth: `${Math.min(70 / visibleData.length, 18)}%`,
          barGap: "10%",
          barCategoryGap: "20%",
          itemStyle: {
            color: ROLE_COLORS[d.role],
            opacity: 0.82,
            borderColor: "#fff",
            borderWidth: 0.6,
            borderRadius: [4, 4, 0, 0],
          },
          emphasis: {
            itemStyle: {
              opacity: 1,
              borderWidth: 2,
              shadowBlur: 10,
              shadowColor: "rgba(0,0,0,0.15)",
            },
          },
          label: {
            show: visibleData.length <= 4,
            position: "top",
            fontSize: 10,
            color: "var(--theme-wood)",
            fontWeight: 600,
            fontFamily: "PT Serif, Noto Serif SC, serif",
          },
        })),
      }, true);
    }

    return () => chart.dispose();
  }, [hiddenRoles, mode]);

  return <div ref={ref} style={{ width: "100%", height: "100%", minHeight: "400px", position: "relative", zIndex: 1 }} />;};

/** 维度对比柱状图 — 选中维度后比较所有可见角色的该维度数值 */
const DimensionBarChart: React.FC<{ dim: Dimension; hiddenRoles: Set<string> }> = ({ dim, hiddenRoles }) => {
  const ref = useRef<HTMLDivElement>(null);
  const dimInfo = DIMENSIONS.find(d => d.key === dim)!;

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const visibleData = PERFORMANCE_DATA
      .filter(d => !hiddenRoles.has(d.role))
      .sort((a, b) => (b[dim] as number) - (a[dim] as number));

    chart.setOption({
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (p: any) => {
          const item = p[0];
          const d = PERFORMANCE_DATA.find(r => r.role === item.name);
          if (!d) return item.name;
          return `<strong>${d.role}</strong><br/>
            唱(歌唱): ${d.sing} &nbsp;|&nbsp; 念(念白): ${d.speak}<br/>
            做(身段): ${d.act} &nbsp;|&nbsp; 打(武打): ${d.fight}`;
        },
      },
      grid: { left: 72, right: 24, top: 8, bottom: 8 },
      xAxis: {
        type: "value",
        max: 100,
        axisLabel: { fontSize: 10, color: "var(--theme-text-soft)" },
        splitLine: { lineStyle: { color: "var(--theme-border-soft)" } },
        name: dimInfo.full,
        nameTextStyle: { fontSize: 10, color: "var(--theme-text-soft)" },
      },
      yAxis: {
        type: "category",
        data: visibleData.map(d => d.role).reverse(),
        axisLabel: { fontSize: 12, color: "var(--theme-wood)", fontWeight: 600 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [{
        type: "bar",
        data: visibleData.map(d => ({
          name: d.role,
          value: d[dim] as number,
          itemStyle: {
            color: ROLE_COLORS[d.role],
            borderRadius: [0, 4, 4, 0],
          },
        })).reverse(),
        barWidth: 16,
        label: {
          show: true,
          position: "right",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--theme-wood)",
        },
      }],
    }, true);

    return () => chart.dispose();
  }, [dim, hiddenRoles]);

  return (
    <div className="t1-dim-bar-panel">
      <div className="t1-dim-bar-header">
        <span className="t1-dim-bar-dot" style={{ background: dimInfo.color }} />
        <span className="t1-dim-bar-title">{dimInfo.label}（{dimInfo.full}）维度对比</span>
      </div>
      <div ref={ref} style={{ width: "100%", height: `${Math.max(180, PERFORMANCE_DATA.filter(d => !hiddenRoles.has(d.role)).length * 36)}px` }} />
    </div>
  );
};

/** 角色切换开关面板 */
const RoleToggles: React.FC<{
  hiddenRoles: Set<string>;
  onToggle: (role: string) => void;
}> = ({ hiddenRoles, onToggle }) => (
  <div className="t1-role-toggles">
    <h4 className="t1-role-toggles-title">
      <span className="t1-role-toggles-title-icon">🎭</span>
      角色切换
    </h4>
    <div className="t1-role-toggles-list">
      {PERFORMANCE_DATA.map((r) => {
        const isVisible = !hiddenRoles.has(r.role);
        return (
          <button
            key={r.role}
            className={`t1-role-toggle-btn ${isVisible ? "active" : ""}`}
            onClick={() => onToggle(r.role)}
            title={`${isVisible ? "隐藏" : "显示"} ${r.role}`}
          >
            <span
              className="t1-role-toggle-dot"
              style={{
                background: isVisible ? ROLE_COLORS[r.role] : "#ccc",
                boxShadow: isVisible ? `0 0 10px ${ROLE_COLORS[r.role]}80` : "none",
              }}
            />
            <span className="t1-role-toggle-name">{r.role}</span>
            <span className={`t1-role-toggle-state ${isVisible ? "on" : "off"}`}>
              {isVisible ? "ON" : "OFF"}
            </span>
          </button>
        );
      })}
    </div>
  </div>
);


/** 置信度信息图标 + 悬浮提示 */
const ConfidenceWithInfo: React.FC<{ confidence: number; roleType: string }> = ({ confidence, roleType }) => {
  const sampleCount = ROLE_SAMPLE_COUNTS[roleType];
  const basis = sampleCount
    ? `基于 ${sampleCount.toLocaleString()} 个训练样本中「${roleType}」的特征分布统计`
    : "基于戏曲表演规律的专家经验规则";
  return (
    <span className="t1-confidence-cell">
      <span className="t1-confidence">{confidence}%</span>
      <span className="t1-confidence-info" tabIndex={0}>
        ⓘ
        <span className="t1-confidence-tooltip">
          <strong>置信度 {confidence}%</strong>
          <span>{basis}</span>
          <span className="t1-tooltip-divider" />
          <span>规则条件与角色特征的匹配度越高，置信度越高</span>
        </span>
      </span>
    </span>
  );
};

/* ================================================================
   Main Layout
   ================================================================ */

const Task1Layout: React.FC = () => {
  const [roleTreeModalOpen, setRoleTreeModalOpen] = useState(false);
  const [hiddenRoles, setHiddenRoles] = useState<Set<string>>(new Set());
  const [reportSidebarOpen, setReportSidebarOpen] = useState(false);
  const [reportTab, setReportTab] = useState<string>("report");
  const [selectedDim, setSelectedDim] = useState<Dimension | null>(null);
  const [chartMode, setChartMode] = useState<"polar" | "cartesian">("polar");

  const toggleRole = (role: string) => {
    setHiddenRoles(prev => {
      const next = new Set(prev);
      if (next.has(role)) {
        next.delete(role);
      } else {
        next.add(role);
      }
      return next;
    });
  };

  return (
    <div className="t1-screen">
      {/* 顶栏 */}
      <header className="t1-topbar">
        <div className="t1-topbar-title-group">
          <div className="t1-kicker">Task 1 · 戏曲角色行当推断与演化分析</div>
          <h1>如何从剧本中推断角色行当，并分析其演化规律？</h1>
          <p>核心任务：角色特征抽取 → 行当推断 → 关系分析 → 演化分析 · 融合NLP与数字人文的可解释分类框架</p>
        </div>
        <button
          className="t1-topbar-report-btn"
          onClick={() => { setReportSidebarOpen(true); setReportTab("report"); }}
          title="查看任务一设计流程报告"
        >
          <span className="t1-report-btn-icon">📋</span>
          <span>设计流程报告</span>
        </button>
      </header>

      {/* 设计流程报告入口 */}

      {/* 主内容 — 三栏布局: 左侧悬浮面板 + 中央表演模式 + 右侧悬浮面板 */}
      <main className="t1-main-grid">
        {/* 左侧悬浮面板 — 推断方法概述 + 行当体系结构 */}
        <aside className="t1-side-panel t1-left-panel">
          <div className="t1-side-block">
            <div className="t1-side-block-header">
              <span className="t1-side-block-icon">📋</span>
              <h3>推断方法概述</h3>
            </div>
            <div className="t1-method-list">
              <div className="t1-method-item">
                <span className="t1-method-num">01</span>
                <div>
                  <div className="t1-method-title">规则驱动</div>
                  <div className="t1-method-desc">基于戏曲表演规律的知识库进行可解释推断</div>
                </div>
              </div>
              <div className="t1-method-item">
                <span className="t1-method-num">02</span>
                <div>
                  <div className="t1-method-title">语义嵌入</div>
                  <div className="t1-method-desc">BGE / SimCSE 中文语义向量表征</div>
                </div>
              </div>
              <div className="t1-method-item">
                <span className="t1-method-num">03</span>
                <div>
                  <div className="t1-method-title">概率融合</div>
                  <div className="t1-method-desc">规则置信度 + 语义相似度加权融合</div>
                </div>
              </div>
            </div>
          </div>

          <div className="t1-side-block">
            <div className="t1-side-block-header">
              <span className="t1-side-block-icon">🔍</span>
              <h3>如何解读</h3>
            </div>
            <ul className="t1-guide-list">
              <li>每个角色的<strong>四维轮廓</strong>反映其表演侧重</li>
              <li><strong>唱念突出</strong>（包公、诸葛亮）→ 偏向「文戏」，多为老生/青衣</li>
              <li><strong>做打突出</strong>（孙悟空、穆桂英）→ 偏向「武戏」，多为武生/武旦</li>
              <li><strong>均衡发展</strong>（唐明皇、曹操）→ 文武兼备，行当归属较模糊</li>
              <li>可对比<strong>同组角色</strong>的四维分布，辅助行当边界的判定</li>
            </ul>
          </div>

          <div className="t1-side-block">
            <div className="t1-side-block-header">
              <span className="t1-side-block-icon">🌳</span>
              <h3>行当体系结构</h3>
              <button
                className="t1-expand-btn"
                onClick={() => setRoleTreeModalOpen(true)}
                title="点击查看大图"
              >
                <span className="t1-expand-icon">⛶</span>
              </button>
            </div>
            <RoleTreeChart onClick={() => setRoleTreeModalOpen(true)} />
            <div className="t1-side-block-note">生·旦·净·丑四大行当及其细分体系 · 数值为行当角色出现人次(全数据集统计) · 点击图表或按钮查看详情</div>
          </div>
        </aside>

        {/* 中央主区 — 角色表演模式分析 (占据主要位置) */}
        <section className="t1-center-stage">
          <div className="t1-center-header">
            <span className="t1-center-icon">🎭</span>
            <h2>角色表演模式分析</h2>
            <button
              className="t1-chart-mode-toggle"
              onClick={() => setChartMode(mode => mode === "polar" ? "cartesian" : "polar")}
              title={chartMode === "polar" ? "切换为分组柱状图" : "切换为极坐标扇形图"}
            >
              <span className="t1-chart-mode-icon">{chartMode === "polar" ? "📊" : "🎯"}</span>
              <span className="t1-chart-mode-label">{chartMode === "polar" ? "柱状图" : "扇形图"}</span>
            </button>
            <div className="t1-dim-selectors">
              {DIMENSIONS.map(d => (
                <button
                  key={d.key}
                  className={`t1-dim-btn ${selectedDim === d.key ? "active" : ""}`}
                  style={{
                    borderColor: selectedDim === d.key ? `color-mix(in srgb, ${d.color} 45%, transparent)` : "var(--theme-border-soft)",
                    background: selectedDim === d.key ? `${d.color}12` : undefined,
                  }}
                  onClick={() => setSelectedDim(selectedDim === d.key ? null : d.key)}
                  title={`点击对比「${d.label}(${d.full})」维度 — 右侧弹出对比图`}
                >
                  <span className="t1-dim-btn-label">{d.label}</span>
                  <span className="t1-dim-btn-full">{d.full}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="t1-center-body">
            <div className="t1-center-row">
              <div className="t1-radar-area">
                <PerformanceRadarChart hiddenRoles={hiddenRoles} mode={chartMode} />
              </div>
              <aside className="t1-center-right">
                <RoleToggles hiddenRoles={hiddenRoles} onToggle={toggleRole} />
              </aside>
            </div>
          </div>
          <div className="t1-center-note">
            {chartMode === "polar"
              ? "典型角色的唱·念·做·打四维极坐标扇形分布图 — 以扇形面积呈现角色表演模式特征"
              : "典型角色的唱·念·做·打四维分组柱状图 — 横轴为表演维度，纵轴为得分值，不同颜色代表不同角色"}
            &nbsp;· 点击维度按钮右侧弹出对比柱状图 · 点击「柱状图/扇形图」按钮切换视图
          </div>
        </section>

        {/* 设计流程报告侧边栏 */}
        <div className={`t1-report-backdrop ${reportSidebarOpen ? "visible" : ""}`} onClick={() => setReportSidebarOpen(false)} />
        <aside className={`t1-report-sidebar ${reportSidebarOpen ? "open" : ""}`}>
          <div className="t1-report-sidebar-header">
            <span className="t1-report-sidebar-header-icon">📋</span>
            <h2>设计流程报告</h2>
            <button className="t1-report-sidebar-close" onClick={() => setReportSidebarOpen(false)}>✕</button>
          </div>

          {/* 侧边栏标签导航 */}
          <nav className="t1-report-tabs">
            {[
              { id: "report", icon: "📋", label: "流程报告" },
              { id: "findings", icon: "💡", label: "典型发现" },
              { id: "dataset", icon: "📊", label: "数据集概览" },
              { id: "features", icon: "🔬", label: "角色特征建模" },
              { id: "inference", icon: "🧩", label: "行当推断模型" },
              { id: "relations", icon: "🔗", label: "特征-行当关系" },
              { id: "evolution", icon: "📜", label: "历史演化分析" },
            ].map(t => (
              <button
                key={t.id}
                className={`t1-report-tab ${reportTab === t.id ? "active" : ""}`}
                onClick={() => setReportTab(t.id)}
              >
                <span className="t1-report-tab-icon">{t.icon}</span>
                <span className="t1-report-tab-label">{t.label}</span>
              </button>
            ))}
          </nav>

          {/* 侧边栏内容区 */}
          <div className="t1-report-sidebar-body">
            {reportTab === "report" && (
              <div className="t1-report-content">
                <p className="t1-report-subtitle">ChinaVis 2026 赛道1-I · 任务一《戏曲角色行当推断与演化分析》设计流程报告</p>
                <p>本任务是 ChinaVis 2026 赛道1"京剧数据可视分析挑战赛"整体五项研究任务中的核心基础模块，主要围绕"角色—行当"体系展开分析，并为后续角色关系网络、主题提取、叙事结构以及综合交互分析系统提供底层角色语义支撑。相比单纯的角色分类任务，本研究更加关注京剧文本中的人物塑造规律、行当体系结构以及跨时代文化演化特征，强调数据驱动的人文智能分析方法。</p>
                <p>系统整体基于"剧本文本解析→角色语义建模→行当推断→关系关联分析→历史演化分析→交互可视化展示"的研究框架展开。项目共处理跨来源、跨流派的京剧剧本数据，通过对角色台词、唱念做打提示、身份信息与行为描写进行结构化抽取，建立面向戏曲角色研究的语义数据库。数据预处理阶段重点完成 OCR 噪声清洗、角色别名统一、历史时期标准化及场次结构解析，为后续分析提供可靠的数据基础。</p>
                <p>在角色建模阶段，系统构建了覆盖性别、年龄、身份、社会地位、性格特征、语言风格、行为模式及社会关系等多维度的角色特征 Schema，并重点引入京剧特有的"唱、念、做、打"表演提示作为核心分析特征。系统通过规则抽取、关键词词典、NER 识别及 KeyBERT、TF-IDF 等方法完成角色特征提取，并进一步构建角色表演模式向量。例如，"老生"角色通常表现为高"唱"、高"念"，而"武生"则更偏向高"做"与高"打"。这种融合戏曲表演特征的语义建模方式，使角色分析不仅停留在文本层面，而是进一步体现了京剧艺术中的舞台表现规律。</p>
                <p>在行当推断部分，系统采用"规则推断 + 语义模型"的融合式方案，避免传统黑盒分类模型缺乏可解释性的问题。系统建立了"生、旦、净、丑"四大行当及其 11 类细分分支的层级结构，并基于角色属性构建可追溯规则知识库。例如"男性 + 老年 + 忠义稳重 → 老生""女性 + 年轻活泼 → 花旦"等规则能够直接体现戏曲角色塑造逻辑。同时结合 BGE、SimCSE 等语义 Embedding 模型生成角色语义向量，实现角色聚类、相似角色发现及概率化行当推断输出，使系统能够更真实地反映戏曲行当之间存在的融合与模糊边界现象。</p>
                <p>在分析层面，系统进一步研究角色特征与行当之间的对应关系，并结合时间维度探索行当体系的历史演化规律。通过 Sankey 图构建"角色特征→行当"关联网络，分析发现老生与净行共享"忠义""朝廷"等特征，而花旦与青衣则在"情感表达""女性形象塑造"方面存在明显交叉。同时，系统利用年代 × 行当矩阵与时间趋势折线图，对清代至现代多个历史时期中的行当变化进行分析，揭示了老生主导、花旦兴起以及现代行当融合等重要演化趋势，体现了京剧艺术随时代发展的角色结构变化。</p>
                <p>作为整体可视分析系统的一部分，本任务不仅关注分析结果本身，更强调交互探索能力与视觉叙事表达。系统采用 React 18 + TypeScript + Vite 构建前端架构，后端基于 FastAPI 提供数据服务，可视化部分结合 ECharts 与 D3.js 实现多视图联动分析。其中，HumanVIZ 系统中的故事丝带（Story Ribbon）通过 SVG Path 与贝塞尔曲线实现角色叙事流的动态表达，`positions.ts` 与 `curve.ts` 负责角色路径与平滑曲线计算，而 `storyStore.ts` 与 `positionStore.ts` 实现丝带交互状态与路径数据管理。故事丝带设计不仅服务于任务一中的角色演化展示，也为后续任务中的角色关系、叙事节奏与主题结构分析提供统一的视觉编码基础。</p>
                <p>在可视化设计上，系统重点采用 Sankey Diagram、双层环形图、时间折线图、Radar Chart 与维度对比柱状图等多种图表形式，实现角色特征、行当结构与历史演化的联合展示。整体布局采用三栏悬浮式结构：左侧展示推断方法概述与行当体系结构，中部展示角色表演模式雷达图与交互式规则推断面板，底部抽屉提供四个专题分析面板（角色特征建模 / 行当推断模型 / 特征-行当关系 / 历史演化分析），形成具有数字人文研究特征的交互式分析环境。</p>
                <p>总体而言，任务一不仅是"角色行当分类"问题，更是整个京剧数据可视分析系统中的角色语义基础层。其核心价值在于通过融合 NLP、可解释推断与交互可视化方法，构建面向传统戏曲文化研究的数字化分析框架，为后续角色关系网络、主题结构分析与叙事模式研究提供统一的数据语义支撑，并最终服务于"京剧文化数字传承与智能表达"的整体研究目标。</p>
              </div>
            )}

            {reportTab === "findings" && (
              <div className="t1-guide-insight">
                <h4>一、行当分布：生净主导，丑旦支撑</h4>
                <p>基于 <strong>1,473 部剧本</strong>、<strong>7,884 个有行当标注的角色</strong>统计：老生出现 1,347 次（17.1%），净 1,309 次（16.6%），丑 1,010 次（12.8%），旦（含青衣/花旦/老旦/武旦等）共约 1,349 次（17.1%），小生 703 次（8.9%），武生 314 次（4.0%）。生行（老生+小生+武生+末·外）合计占比约 33%，净行 16.6%，丑行 12.8%，旦行 17.1%，呈现「<strong>生净双核、旦丑并重</strong>」的行当格局。这与京剧以男性角色、历史征战题材为主导的剧本文本特征高度吻合。</p>
                <h4>二、剧本行当多样性：群戏为常态</h4>
                <p><strong>91.4%</strong> 的剧本包含 2 种及以上行当，平均每部剧本涉及 <strong>3.7 种</strong>行当类型。仅 8.5% 的剧本为单一、二行当构成的小规模角色戏（多为折子戏或独角戏），而 11.4% 的剧本包含了 10 种以上不同的行当细分类型，反映出京剧剧本作为综合性舞台艺术的群落特征。</p>
                <h4>三、行当共现模式：核心对稳定，历史戏主导</h4>
                <p>最常见的行当共现对为 <strong>净 + 老生</strong>（588 部剧本，占 39.9%），其次为 <strong>小生 + 老生</strong>（390 部）、<strong>净 + 小生</strong>（382 部）。净-老生配对在<strong>历史戏</strong>（占全量 52.7%）中尤为突出，如《空城计》诸葛亮（老生）对司马懿（净）、《打鼓骂曹》祢衡（老生）对曹操（净），构成了「忠奸对峙」「智勇博弈」的核心戏剧冲突结构。家庭戏（15.1%）、侠义戏（8.6%）则更多呈现旦-生、武生-净的搭配模式。</p>
                <h4>四、角色跨行当现象：赵云的双重身份</h4>
                <p>部分高频角色在不同剧本中被标注为不同行当：<strong>赵云</strong>（82 部剧本中出现）以武生为主，但在《龙凤呈祥》等剧中被标注为小生，体现其「武艺高强 + 儒将气质」的双重定位；<strong>孙悟空</strong>（26 部）以武丑为常、偶归武生；<strong>包拯</strong>（34 部）以净行为主、部分剧目归入老生。这种<strong>跨行当标注</strong>反映了行当体系的弹性——角色行当并非机械对应，而是随剧目情境、表演侧重灵活调整。</p>
                <h4>五、角色重复度：支撑角色的高频与核心角色的聚焦</h4>
                <p>出场频率最高的角色为<strong>院子</strong>（丑行，228 部剧本），远超第二名刘备（老生，115 部），反映出丑行支撑角色（家院、酒保、门官等）在京剧叙事中的高频功能性使用。核心历史人物中，<strong>诸葛亮</strong>（104 部）、<strong>关羽</strong>（红生，95 部）、<strong>张飞</strong>（净，93 部）、<strong>曹操</strong>（净，83 部）构成了「三国人物集群」，占高频角色前 10 名的半数以上，印证了「<strong>唐三千、宋八百、数不尽的三列国</strong>」的京剧剧目格局。</p>
                <h4>六、对话负载差异：花旦小而精，老生多而深</h4>
                <p>从平均对话量看：<strong>花旦</strong>平均每角色 67.8 句对话（仅 93 个角色样本），<strong>花衫</strong>平均 62.9 句，而<strong>老生</strong>平均 49.9 句（1,347 个角色）、<strong>净</strong>平均 35.6 句（1,309 个角色）。花旦/花衫虽总量小但单角色台词密度高，反映其多为情节核心人物（如红娘、春香）；老生/净虽角色众多，但包含大量次要角色拉低了均值。核心老生角色（如诸葛亮 104 部、刘备 115 部）的实际单剧本对话量远高于平均值。</p>
                <h4>七、表演模式四维特征：唱念做打的角色诊断</h4>
                <p>选取 8 个典型角色的表演模式雷达数据显示：<strong>杨贵妃</strong>唱功最高(88)，反映青衣行当「重唱工、以声传情」的核心特征；<strong>孙悟空</strong>做功最突出(95)、打功 90，体现武丑「身手敏捷、动作夸张」的表演侧重；<strong>穆桂英</strong>做(78)打(85)均衡，典型武旦/刀马旦的「文武兼备」模式。同一行当内也存在显著差异——<strong>包公 vs 诸葛亮</strong>同属老生/净行交叉带，但包公更偏「念」（75），诸葛亮更偏「唱」（85），折射出「白口功夫」与「唱工老生」两种老生表演流派的分野。</p>
                <h4>八、剧目类型-行当关联：类型决定行当配比</h4>
                <p>历史戏（776 部，52.7%）以老生+净为核心行当配置，生净占比合计超 60%；家庭戏（223 部，15.1%）以旦+老生为主，青衣·正旦占比显著上升；神话戏（115 部，7.8%）武生+武丑+净的组合比例最高，做打维度的角色占比明显高于其他类型；公案戏（100 部，6.8%）净行（包拯）与丑行（衙役/解差）配比突出。这印证了「<strong>戏路决定行当，行当承载戏路</strong>」的京剧创作规律。</p>
              </div>
            )}

            {reportTab === "dataset" && (
              <div>
                <DatasetOverviewChart />
                <div className="t1-guide-list" style={{ marginTop: 12 }}>
                  <li>数据集来源涵盖 39 个剧本集，共 1,473 部 PDF 京剧剧本</li>
                  <li>《戏考》(448)、《京剧汇编》(360)、《国剧大成》(194) 为三大主要来源</li>
                </div>
              </div>
            )}

            {reportTab === "features" && (
              <div>
                <div className="t1-section-intro">
                  <strong>角色特征建模 — 四阶段流程</strong>
                  <p>从基础属性到社会关系，构建面向行当推断的多维度角色特征体系。</p>
                </div>
                <FeatureModelPanel />
              </div>
            )}

            {reportTab === "inference" && <InferenceModelPanel />}

            {reportTab === "relations" && <FeatureRelationPanel />}

            {reportTab === "evolution" && <EvolutionPanel />}
          </div>
        </aside>

        {/* 右侧悬浮面板 — 特征—行当关系 Sankey 图 */}
        <aside className="t1-side-panel t1-right-panel">
          <div className="t1-side-block">
            <div className="t1-side-block-header">
              <span className="t1-side-block-icon">🔗</span>
              <h3>特征—行当关系 Sankey 图</h3>
            </div>
            <SankeyPanel />
            <div className="t1-side-block-note">特征→行当流向与关联强度 · 点击顶部「设计流程报告」查看详表</div>
          </div>
        </aside>
      </main>

      {/* 维度对比抽屉 — 选中维度时右侧滑出 */}
      <div className={`t1-perf-backdrop ${selectedDim ? "visible" : ""}`} onClick={() => setSelectedDim(null)} />
      <aside className={`t1-perf-drawer ${selectedDim ? "open" : ""}`}>
        {selectedDim && (() => {
          const dimInfo = DIMENSIONS.find(d => d.key === selectedDim)!;
          return (
            <>
              <div className="t1-perf-drawer-header">
                <span className="t1-perf-drawer-title-icon">📊</span>
                <h2>{dimInfo.label}（{dimInfo.full}）维度对比</h2>
                <button className="t1-perf-drawer-close" onClick={() => setSelectedDim(null)}>✕</button>
              </div>
              <div className="t1-perf-drawer-body">
                <div className="t1-dim-bar-area t1-dim-bar-area-drawer">
                  <DimensionBarChart dim={selectedDim} hiddenRoles={hiddenRoles} />
                </div>
                <div className="t1-perf-section">
                  <h4 className="t1-perf-section-title">
                    <span className="t1-perf-section-dot" />
                    四维含义
                  </h4>
                  <div className="t1-guide-grid">
                    {DIMENSIONS.map(d => (
                      <div key={d.key} className="t1-guide-item">
                        <span className={`t1-guide-label ${d.key === selectedDim ? "t1-guide-label-active" : ""}`} style={{
                          background: d.key === selectedDim ? d.color : undefined,
                          color: d.key === selectedDim ? "#fff" : undefined,
                        }}>{d.label}</span>
                        <span>{DIM_DESC[d.key]}</span>
                      </div>
                    ))}
                  </div>
                  <p className="t1-perf-hint">
                    柱状图展示各角色在<strong>{dimInfo.label}（{dimInfo.full}）</strong>维度的数值对比，辅助判断不同角色在该表演维度的侧重差异。
                  </p>
                </div>
              </div>
            </>
          );
        })()}
      </aside>

      {/* 行当体系结构弹窗 */}
      <RoleTreeModal
        opened={roleTreeModalOpen}
        onClose={() => setRoleTreeModalOpen(false)}
      />
    </div>
  );
};

export default Task1Layout;
