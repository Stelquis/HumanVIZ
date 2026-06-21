# /workspace/Repo — Repository Overview

该目录包含三个独立的数据可视化项目，均基于 **D3.js** 构建。

---

## 目录

1. [ORCA](./ORCA/) — GitHub 贡献者生态系统可视化
2. [Beautiful in English](./beautiful-in-english/) — 跨语言翻译数据新闻
3. [Story Curve](./storycurve-master/) — 非线性叙事对比可视化库

---

## 1. ORCA

| 字段 | 内容 |
|---|---|
| **作者** | Nadieh Bremer (Visual Cinnamon) |
| **许可证** | Mozilla Public License 2.0 |
| **委托方** | Mozilla MIECO / Builder 项目 |
| **目的** | 探索 Open Retrospective Compensation Agreement (ORCA) 实验性资助模型在开源社区中的影响 |

### 1a. Commit History

- **位置：** [ORCA/commit-history/](./ORCA/commit-history/)
- **在线演示：** https://nbremer.github.io/ORCA/commit-history/
- **功能：** 展示 GitHub 仓库的完整提交历史，每个提交渲染为小圆点，按月分组，ORCA 资助者以六边形高亮
- **默认数据集：** `mozilla/pdf.js`，可通过 `?repo=d3` 切换为 `d3/d3`
- **渲染：** HTML5 Canvas（3层：base + animation + hover）
- **交互：** 悬停查看提交详情、高亮同一作者的所有提交、点击锁定、搜索贡献者
- **关键文件：**
  - `createORCAVisual.js` — 主可视化引擎（D3 v7 + Canvas + 力模拟布局）
  - `index.html` — 展示页面
  - `data/` — CSV 数据集及 R 预处理脚本

### 1b. Top Contributor Network

- **位置：** [ORCA/top-contributor-network/](./ORCA/top-contributor-network/)
- **在线演示：** https://nbremer.github.io/ORCA/top-contributor-network/
- **功能：** 展示核心贡献者与其参与的其他仓库之间的网络关系，揭示开源生态系统连接
- **默认数据集：** `mozilla/pdf.js`，可通过 `?repo=terraform` 切换
- **布局：** 力导向图 — 内环（ORCA 贡献者）+ 外环（其他贡献者），连线到外围仓库节点
- **关键文件：**
  - `createORCAVisual.js` — 主可视化引擎（D3 v7 + Canvas + 3层渲染）
  - `index.html` — 展示页面
  - `data/` — 四个 CSV 数据集（贡献者、仓库、连接、ORCA 信息）

---

## 2. Beautiful in English

| 字段 | 内容 |
|---|---|
| **作者** | Nadieh Bremer (Visual Cinnamon) + Google News Lab |
| **在线地址** | https://beautifulinenglish.visualcinnamon.com/ |
| **目的** | 分析 10 种语言通过 Google 翻译译为英语的热门词汇 |
| **数据来源** | Google Translate，2016 年 8–12 月 |
| **技术栈** | D3 v4、SVG、Bootstrap 网格 |

### 分析语言

德语、西班牙语、法语、意大利语、日语、荷兰语、波兰语、葡萄牙语、俄语、土耳其语

### 四个可视化

| 可视化 | 文件 | 功能 |
|---|---|---|
| **Word Snake** | `js/wordsnake.js` | 每种语言最常翻译的一个词，蛇形排列，带 Google Trends 数据 |
| **Tree Ring** | `js/treering.js` | 每种语言前 10 个翻译词，环形树图，可切换语言 |
| **Similarity Network** | `js/similarityNetwork.js` | 不同语言间共享翻译词的相似度网络 |
| **Loop Beautiful** | `js/loopBeautiful.js` | 页眉装饰动画，循环展示 "beautiful" 的多语言翻译 |

### 关键发现

> **"Beautiful"** 是所有语言中翻译最频繁的词。10 种语言中有 6 种的首位翻译词带有正面情感色彩。

### 关键文件

- `index.html` — 完整文章页面（含叙述、可视化、方法说明）
- `css/style.css` — 页面样式
- `css/bootstrap-grid.css` — 响应式网格
- `data/` — 包含 6 个 CSV 数据集（top1、top10、top100、相似度链接、相关查询、Google Trends）

---

## 3. Story Curve

| 字段 | 内容 |
|---|---|
| **作者** | Nam Wook Kim |
| **许可证** | MIT |
| **npm** | `storycurve` v1.0.1 |
| **在线演示** | http://storycurve.namwkim.org/ |
| **目的** | 比较同一组元素的两种时间顺序——"故事时间"与"叙事时间" |

### 功能说明

Story Curve 专为分析**非线性叙事**设计（如《低俗小说》《记忆碎片》）。它将事件按"故事时间线"（chronological）和"叙事时间线（影片呈现顺序）"两个维度进行对比，生成一条视觉曲线。

### 技术栈

- **语言：** ES6
- **构建：** Rollup + Babel → UMD 输出
- **依赖：** 模块化 D3（d3-selection, d3-shape, d3-zoom, d3-axis, d3-scale, d3-array, d3-tip）
- **渲染：** SVG

### 核心 API

```js
const chart = new StoryCurve('#container')
  .x(d => d.narrative_order)
  .y(d => d.story_order)
  .size(d => d.scene_metadata.size)
  .children(d => d.characters);

chart.draw(data);
chart.highlights(['CharacterA', 'CharacterB']);
chart.isHighlighted(d => /* custom highlight logic */);
```

### 特性

- 自定义 accessor 函数，适配任意数据格式
- 背景面板（Beginning / Middle / End）
- 元数据图层：`band`（地点）、`backdrop`（时间）、`children`（角色）
- 缩放/平移（d3-zoom）
- 工具提示（d3-tip）
- 与外部组件协调的事件系统

### 关键文件

| 文件 | 用途 |
|---|---|
| `src/storycurve.js` | 核心库实现（ES6 类） |
| `src/storycurve.css` | 可视化样式 |
| `index.js` | 入口文件，导出 StoryCurve |
| `package.json` | npm 配置 |
| `rollup.config.js` | Rollup 构建配置 |
| `dist/` | 构建产物 |

---

## 总结对比

| 维度 | ORCA | Beautiful in English | Story Curve |
|---|---|---|---|
| **类型** | 交互可视化（工具） | 数据新闻文章 | 可复用可视化库 |
| **作者** | Nadieh Bremer (Visual Cinnamon) | Nadieh Bremer + Google News Lab | Nam Wook Kim |
| **许可证** | MPL 2.0 | — | MIT |
| **渲染** | Canvas（3层） | SVG | SVG |
| **D3 版本** | v7 | v4 | 模块化 |
| **交互** | 悬停、点击、搜索 | 悬停、点击、语言切换 | 缩放、高亮、悬停 |
| **可复用性** | 函数式（可切换数据集） | 单用途 | npm 库 |
| **数据格式** | CSV（git log 导出） | CSV（Google Translate） | JSON（影片场景） |
