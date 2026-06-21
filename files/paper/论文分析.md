你选的这三篇论文，其实对应了 ChinaVis 这个赛题里三个非常关键的研究方向：

| 论文                                                                                        | 对应赛题核心       | 可借鉴价值          |
| ----------------------------------------------------------------------------------------- | ------------ | -------------- |
| 《A Visual Approach for the Comparative Analysis of Character Networks in Narrative Texts》 | 角色关系网络       | 网络结构分析、跨剧本比较   |
| 《Story Curves》                                                                            | 叙事结构分析       | 时间线、非线性叙事、剧情节奏 |
| 《Story Ribbons》                                                                           | 多维综合分析 + LLM | 人物—主题—事件联合可视分析 |

这三个方向组合起来，实际上已经非常接近一个完整的「数字人文 + Narrative Visualization」研究框架了。

下面我详细拆解一下它们对你赛题的借鉴意义，以及目前能找到的开源情况。

---

# 一、《A Visual Approach for the Comparative Analysis of Character Networks in Narrative Texts》

A Visual Approach for the Comparative Analysis of Character Networks in Narrative Texts

论文信息：2019 IEEE PacificVis ([ResearchGate][1])

---

## 1. 这篇论文真正重要的地方

它不是简单“画人物关系图”。

它的核心贡献是：

> **比较多个叙事文本中的角色网络结构差异**

即：

* 不同故事的人物组织结构
* 主角群的聚集模式
* 权力中心如何变化
* 哪些角色是桥接者
* 网络密度如何变化

这和你们赛题：

> “不同剧目中的角色关系网络结构特征”

高度一致。

---

## 2. 对京剧赛题的直接借鉴

### （1）角色关系网络构建

京剧天然适合：

* 君臣
* 父子
* 师徒
* 仇敌
* 忠奸
* 爱情
* 阵营

你可以构建：

| 类型     | 表达    |
| ------ | ----- |
| 共现网络   | 同场出现  |
| 对话网络   | 互相唱念  |
| 情感网络   | 忠诚/敌对 |
| 权力网络   | 上下级   |
| 戏剧冲突网络 | 冲突频率  |

---

### （2）剧目类型比较

这是论文最适合借鉴的地方。

例如：

| 剧种    | 网络特征   |
| ----- | ------ |
| 历史戏   | 中心化强   |
| 公案戏   | 多角色交叉  |
| 家庭伦理戏 | 小团体聚集  |
| 武戏    | 高频冲突边  |
| 宫廷戏   | 权力层级明显 |

你可以直接做：

* 网络密度
* 社区划分
* 中心性
* structural holes
* motif 分析

这是标准的 narrative network analysis。

---

### （3）动态网络

京剧特别适合做：

> “剧情推进过程中角色关系如何变化”

因为京剧“折”“场”天然有时间结构。

可以：

* 横轴：剧情推进
* 纵轴：角色
* 边权：互动强度

这会直接衔接到 Storyline Visualization。

---

## 3. 可借鉴的可视化设计

论文里比较经典的是：

### Comparative Character Network

即：

* 左右两个剧本
* 中间做结构映射
* 对比核心人物结构

你可以升级成：

### 京剧多剧本关系谱系

例如：

* 《霸王别姬》
* 《四郎探母》
* 《赵氏孤儿》

比较：

* 忠臣结构
* 家族结构
* 帝王中心结构

这是非常“国风数字人文”的方向。

---

## 4. 开源情况

目前：

没有发现官方 GitHub。

但论文属于：

* network visualization
* force layout
* graph comparison

技术上完全可复现。

推荐技术栈：

| 功能   | 技术                    |
| ---- | --------------------- |
| 网络分析 | NetworkX / graph-tool |
| 社区检测 | Leiden / Louvain      |
| 可视化  | D3.js / Cytoscape.js  |
| 动态网络 | Sigma.js              |

---

## 5. 对你赛题的价值评分

| 维度   | 价值    |
| ---- | ----- |
| 任务2  | ★★★★★ |
| 任务5  | ★★★★★ |
| 创新性  | ★★★★  |
| 实现难度 | 中等    |
| 可扩展性 | 极强    |

---

# 二、《Story Curves》

Visualizing Nonlinear Narratives with Story Curves

论文主页可找到软件链接 ([视觉计算组][2])

---

## 1. 这篇论文为什么重要

它是 Narrative Visualization 领域经典论文之一。

核心思想：

> 将“故事时间”与“叙事时间”分离

即：

* 故事真实发生顺序
* 剧本呈现顺序

可能不同。

---

## 2. 京剧里其实特别适合

因为大量京剧：

* 倒叙
* 插叙
* 梦境
* 回忆
* 前朝往事
* 战场回顾

非常多。

例如：

* 《空城计》
* 《四郎探母》
* 《赵氏孤儿》

都存在：

> “观众认知顺序” ≠ “历史事件顺序”

---

## 3. 对任务4的价值巨大

赛题：

> “叙事结构分析与模式总结”

Story Curves 几乎就是直接答案。

你可以：

---

### （1）构建剧情阶段

比如：

| 阶段 | 特征    |
| -- | ----- |
| 铺垫 | 人物引入  |
| 冲突 | 阵营形成  |
| 高潮 | 武戏/审判 |
| 转折 | 身份揭露  |
| 结局 | 忠奸定论  |

---

### （2）节奏分析

京剧特别适合：

* 唱段密度
* 武戏频率
* 人物登场频率
* 情绪强度

做剧情曲线。

---

### （3）叙事曲线

这是最重要的。

Story Curves 本质：

* 横轴：叙事顺序
* 纵轴：故事真实时间

形成：

* 回环
* 跳跃
* 倒叙

的曲线。

---

## 4. 你可以怎么升级

### 京剧版 Story Curves

你甚至可以加入：

| 维度    | 含义       |
| ----- | -------- |
| 行当颜色  | 生旦净丑     |
| 锣鼓点密度 | 戏剧张力     |
| 唱词情绪  | NLP情感分析  |
| 场景地点  | 宫廷/战场/家宅 |
| 表演形式  | 唱/念/做/打  |

这会非常惊艳。

---

## 5. 开源情况（重要）

论文官网明确有：

> Software: namwkim.github.io/storycurve/

[Story Curves Software](https://namwkim.github.io/storycurve/?utm_source=chatgpt.com) ([视觉计算组][2])

不过：

* 原始 GitHub 仓库似乎已经不太活跃
* demo 仍可参考
* 核心是 D3.js storyline layout

---

## 6. 可复用的核心算法

重点不是页面，而是：

### storyline layout

即：

* 最小线交叉
* 人物轨迹优化
* 时间轴压缩

这部分是 Narrative Vis 经典问题。

你还可以参考：

Computing Storyline Visualizations with Few Block Crossings ([arXiv][3])

这是 Storyline 自动布局的重要理论基础。

---

## 7. 对赛题价值评分

| 维度   | 价值    |
| ---- | ----- |
| 任务4  | ★★★★★ |
| 任务5  | ★★★★★ |
| 美观性  | ★★★★★ |
| 学术性  | ★★★★★ |
| 可扩展性 | 极强    |

---

# 三、《Story Ribbons》

Story Ribbons: Reimagining Storyline Visualizations with Large Language Models

([arXiv][4])

---

# 1. 这篇论文真正厉害的地方

它本质上是：

> LLM + Narrative Visualization

传统 storyline vis 最大问题：

* 结构化信息需要人工标注

而 Story Ribbons：

* 自动抽取人物
* 自动抽取主题
* 自动识别事件
* 自动建立 narrative units

这和京剧赛题高度契合。

---

# 2. 对你们的核心价值

这篇论文其实是：

## “任务5 的终极范式”

因为它已经不只是：

* 人物关系

而是：

| 元素        | 联动            |
| --------- | ------------- |
| Character | Theme         |
| Theme     | Event         |
| Event     | Emotion       |
| Emotion   | Narrative Arc |

这是完整 narrative intelligence。

---

# 3. 对京剧最有价值的地方

## （1）LLM 自动结构化

京剧文本大量：

* 文言
* 戏曲对白
* 舞台提示

传统 NLP 很难。

但 LLM 很适合：

* 角色识别
* 情绪抽取
* 事件总结
* 场景划分
* 主题提取

---

## （2）Theme Ribbon

这部分特别适合京剧。

例如：

| 主题 | 颜色 |
| -- | -- |
| 忠义 | 红  |
| 家国 | 金  |
| 爱情 | 粉  |
| 权谋 | 黑  |
| 复仇 | 紫  |

随着剧情推进：

主题 ribbon 宽度变化。

这会极其有视觉冲击力。

---

## （3）多尺度分析

论文强调：

> macro ↔ micro narrative

即：

* 全剧结构
* 单场细节

联动分析。

这非常适合 ChinaVis。

---

# 4. 最大问题：开源情况

目前看：

## 大概率没有正式开源

没找到官方 GitHub。

而且论文比较新。 ([ResearchGate][5])

但：

它的方法论比代码更重要。

---

# 5. 你完全可以复现的部分

## LLM Pipeline

你们完全能做：

```text
京剧文本
↓
LLM
↓
角色抽取
事件抽取
主题抽取
情绪抽取
场景切分
↓
JSON Narrative Graph
↓
Visualization
```

这是现在数字人文的主流路线。

---

# 四、三篇论文之间的关系（非常关键）

它们其实形成了：

# Narrative Visualization 演化链

---

## 第一阶段：结构网络

### Character Network

对应：

* 图网络
* 社会结构
* 关系分析

代表：

* John et al. 2019

---

## 第二阶段：时间叙事

### Story Curves

对应：

* 时间结构
* 剧情节奏
* 非线性叙事

代表：

* Kim et al. 2017

---

## 第三阶段：语义叙事智能

### Story Ribbons

对应：

* LLM
* Theme
* Emotion
* Semantic Narrative

代表：

* Yeh et al. 2025

---

# 五、我对你们赛题的建议（核心）

如果想冲 ChinaVis：

不要只做：

* 单一网络图
* 单一 storyline

而是：

# “Narrative Intelligence System”

即：

## 三层融合

---

### 第一层：角色关系网络

参考：

* John et al.

---

### 第二层：叙事时间结构

参考：

* Story Curves

---

### 第三层：主题/情绪 Ribbon

参考：

* Story Ribbons

---

最终形成：

# 京剧数字叙事分析系统

这是非常有竞争力的方向。

---

# 六、建议你补充看的论文（非常推荐）

## Narrative Visualization 基础

### Storyline Visualization of Events on a Timeline

经典 storyline 起源。

---

## 剧情结构自动化

### Story Explorer: A Visualization Framework for Storyline Generation of Textual Narratives

和 Story Ribbons 非常接近。

---

## 角色网络抽取

### Extraction and Analysis of Fictional Character Networks: A Survey

综述级资料。 ([arXiv][6])

---

## 动态角色网络工具

### Renard: A Modular Pipeline for Extracting Character Networks from Narrative Texts

这个甚至有 Python pipeline。 ([arXiv][7])

---

# 七、最终结论（最重要）

你现在这三篇论文的组合：

| 方向                 | 覆盖 |
| ------------------ | -- |
| 角色关系               | ✓  |
| 时间叙事               | ✓  |
| LLM语义              | ✓  |
| 交互可视分析             | ✓  |
| Narrative Vis      | ✓  |
| Digital Humanities | ✓  |

其实已经形成：

# 一个完整的 ChinaVis 叙事可视化研究框架。

如果你愿意，下一步我还能继续帮你：

1. 设计一个完整的「京剧 Narrative Visualization 系统架构」
2. 给出适合 ChinaVis 的创新点
3. 推荐最适合的可视化编码
4. 设计页面布局
5. 设计论文故事线
6. 设计交互系统
7. 给出技术栈（D3 / React / ECharts / LLM pipeline）
8. 给出一套能投稿的研究叙事逻辑

[1]: https://www.researchgate.net/publication/334849812_A_Visual_Approach_for_the_Comparative_Analysis_of_Character_Networks_in_Narrative_Texts?utm_source=chatgpt.com "A Visual Approach for the Comparative Analysis of Character Networks in Narrative Texts"
[2]: https://vcg.seas.harvard.edu/publications/20180101-visualizing-nonlinear-narratives-with-story-curves?utm_source=chatgpt.com "VCG Harvard | Visualizing Nonlinear Narratives with Story Curves"
[3]: https://arxiv.org/abs/1709.01055?utm_source=chatgpt.com "Computing Storyline Visualizations with Few Block Crossings"
[4]: https://arxiv.org/abs/2508.06772?utm_source=chatgpt.com "Story Ribbons: Reimagining Storyline Visualizations with Large Language Models"
[5]: https://www.researchgate.net/publication/398352003_Story_Ribbons_Reimagining_Storyline_Visualizations_with_Large_Language_Models?utm_source=chatgpt.com "Story Ribbons: Reimagining Storyline Visualizations with Large Language Models"
[6]: https://arxiv.org/abs/1907.02704?utm_source=chatgpt.com "Extraction and Analysis of Fictional Character Networks: A Survey"
[7]: https://arxiv.org/abs/2407.02284?utm_source=chatgpt.com "Renard: A Modular Pipeline for Extracting Character Networks from Narrative Texts"
