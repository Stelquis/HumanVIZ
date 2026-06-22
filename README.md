<!-- ![HumanVIZ](files/Image/Poster.png)

--- -->

# 🎭 HumanVIZ

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.12](https://img.shields.io/badge/Python-3.12-3776AB.svg?logo=python)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.136-009688.svg?logo=fastapi)](https://fastapi.tiangolo.com/)
[![TypeScript 6](https://img.shields.io/badge/TypeScript-6.0-3178C6.svg?logo=typescript)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React-19.1-61DAFB.svg?logo=react)](https://react.dev/)
[![Vite 6](https://img.shields.io/badge/Vite-6.3-646CFF.svg?logo=vite)](https://vitejs.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-0.184-black.svg?logo=three.js)](https://threejs.org/)
[![D3.js](https://img.shields.io/badge/D3.js-7.9-F9A03C.svg?logo=d3.js)](https://d3js.org/)
[![ECharts](https://img.shields.io/badge/ECharts-6.1-AA344D.svg)](https://echarts.apache.org/)
[![Mantine](https://img.shields.io/badge/Mantine-7.17-339AF0.svg)](https://mantine.dev/)
[![Docker](https://img.shields.io/badge/Docker-2496ED.svg?logo=docker)](https://www.docker.com/)

> 🎭 梨园万象——京剧剧本多维可视化分析系统
>
> 面向 1,473 部京剧剧本，我们构建"梨园万象"多维可视分析系统，从行当、关系、主题、叙事与综合关联五个层面提炼结构规律，以可交互界面支持单剧验证与跨剧本比较，呈现京剧文本中的人物组织、主题组合与叙事节奏。

---

## 📖 项目简介

HumanVIZ 是一个面向京剧剧本数据的多维可视化分析系统，为 **ChinaVIS 2026 可视分析挑战赛** 1-I的任务一而构建。系统通过定制化的可视化视图和交互式分析，帮助用户深入理解京剧剧本中的人物关系、主题表达、叙事结构及其演化规律。

### 🎯 核心能力

- 👥 **角色行当分析**：29 维特征 + 11 条推断规则，识别生旦净丑 11 子类，分析六大时期行当演化
- 🕸️ **角色关系网络**：1473 张角色共现网络，7 种剧种的 PCA 结构指纹对比
- 📜 **主题提取比较**：12 维主题体系，6 种主题原型，覆盖率 59% 的家庭伦理与贯穿性最强的忠义母题
- 🎬 **叙事结构分析**：8 种叙事模式，三层丝带图（情感/表演/冲突），叙事重心均值 52%
- 🔮 **多维综合分析**：3D 漩涡星系星图，三条因果链统计检验（χ²=84.6, KW p<0.0001），6 种结构原型及协同演化

---

## 🏆 ChinaVIS 2026 可视分析挑战赛

> - **[ChinaVIS 2026 挑战赛](https://chinavis.org/2026/zh/challenge_call_for_participation/)**
> - **[京剧科普](files/京剧科普.md)**

### 📜 赛道 I：数据可视化与人文创意赛

#### 比赛背景

京剧作为中国传统戏曲艺术的重要代表，融合了文学、表演、音乐、美术与历史文化等多重元素，承载着丰富的人物塑造、叙事结构与文化表达。大量京剧剧本不仅记录了经典舞台艺术的演化过程，也反映了不同时代背景下的社会观念、价值体系与审美特征。

随着数字化整理工作的推进，京剧剧本文本数据的规模与完整性不断提升，为传统戏曲的计算分析与可视化研究提供了新的契机。本赛题基于京剧剧本数据集，鼓励参赛者结合自然语言处理、复杂网络分析、时序分析与可视化等方法，从人物关系、主题表达、叙事结构以及版本演化等多个角度，对京剧剧本展开系统分析与可视化探索。

参赛者不仅需要关注单一剧本内部的文本结构与艺术特征，还需通过跨剧本、跨来源、跨流派的比较分析，挖掘京剧剧本之间潜在的结构规律、文化关联与演化趋势。

大赛数据集包括跨来源、跨流派的京剧数据。此外，参赛者可结合历史文献、演出资料、戏曲音视频、角色行当知识或其他开放数据，以提升分析深度与研究价值。大赛鼓励选手在确保数据准确性的基础上，融合人工智能与可视化创新方法，推动京剧数据研究从传统文本解读迈向数据驱动的人文智能分析新范式，为中国优秀传统文化的数字化保护、学术研究与国际传播提供新的可能。

---

#### 任务一：🎭「戏韵万象」京剧数据可视分析挑战赛

##### 1. 👥 角色-行当分类与时代变迁分析

基于剧本中角色的性别、年龄、身份、性格描述及唱念做打等表演提示，推断未标注角色的行当归属（如生、旦、净、丑及其细分支），并分析角色特征与行当分类之间的典型对应模式。进一步结合剧本创作年代或历史时期背景，利用数据分析和可视化等手段，探究不同时期角色-行当对应关系的变化规律。

> 📝 建议文字：≤ 800 字 · 🖼️ 建议图片：≤ 5 张

##### 2. 🕸️ 角色关系网络与剧目类型分析

识别剧本中主要角色之间的互动关系，构建角色关系网络，并分析不同剧目（历史戏、家庭戏、公案戏等）中的角色关系网络结构特征。

> 📝 建议文字：≤ 800 字 · 🖼️ 建议图片：≤ 5 张

##### 3. 📜 剧本主题提取与跨剧本比较

从剧本中提取核心主题，分析不同剧本的主题构成及其组合方式。通过跨剧本比较，总结主题表达的共性与差异，探讨是否存在具有代表性的主题组合模式及其特征。

> 📝 建议文字：≤ 800 字 · 🖼️ 建议图片：≤ 5 张

##### 4. 🎬 叙事结构分析与模式总结

基于剧本中表演形式的标记以及剧本内容等对剧本的叙事结构进行系统分析，识别剧情发展中的关键阶段，刻画剧情起伏与节奏变化。进一步比较不同剧本在叙事结构上的差异，总结典型叙事模式及其结构特征。

> 📝 建议文字：≤ 800 字 · 🖼️ 建议图片：≤ 5 张

##### 5. 🔮 多维综合分析与交互系统构建

在前述分析基础上，综合角色关系、主题结构与叙事结构，系统分析三者之间的关联机制与差异特征。通过构建可交互的 **可视分析系统**，探索人物关系、主题表达与叙事方式之间是否存在典型的关联模式、协同演化规律或稳定结构特征。

> 📝 建议文字：≤ 800 字 · 🖼️ 建议图片：≤ 5 张

#### 🏅 关键成果

| 任务 | 发现 | 统计验证 |
|------|------|----------|
| 1 | 生约四成，六大时期行当分布整体稳定 | χ²=9,847, p<0.001 |
| 2 | 历史戏阵营分明、家庭戏紧密、爱情戏集中 | PCA 结构指纹 + ANOVA |
| 3 | 家庭伦理 (59%) 与宫廷朝堂 (57%) 覆盖率最高，6 种主题原型 | 卡方检验 + NPMI |
| 4 | 8 种叙事模式，叙事重心均值 52%，中段偏前 | 模式评分 + 相位检测 |
| 5 | 三角因果 (χ²=84.6, KW p<0.0001)，6 种原型，协同演化 14%→28% | χ² + KW + KMeans |

---

#### 📊 数据来源

本赛事数据集为京剧剧本数据集，包含：

| 类别 | 数量 | 说明 |
|------|------|------|
| 📚 综合剧目集 | 13 个文件夹，1195 PDF | 《戏考》《国剧大成》《京剧汇编》《京剧丛刊》等 |
| 🎭 京剧名家剧本选 | 13 个文件夹，145 PDF | 周信芳、马连良、梅兰芳、程砚秋、荀慧生等 |
| ✍️ 现代剧作家剧本选 | 5 个文件夹，14 PDF | 田汉、老舍、翁偶虹等 |
| 🎵 昆曲剧本选 | 4 个文件夹，71 PDF | 俞振飞、侯玉山等昆曲名家 |
| 📼 其他剧本 | 3 个文件夹，51 PDF | 录音唱片本、名家藏本、院团改编本 |

**📊 总计：38 个压缩包，38 个文件夹，1473 个 PDF 剧本**

---

## 🛠️ 技术栈

### ⚛️ 前端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| ⚛️ **React** | 19.1.0 | UI 框架 |
| 📘 **TypeScript** | 6.0.3 | 类型安全 |
| ⚡ **Vite** | 6.3.5 | 构建工具与开发服务器 |
| 🎨 **Mantine** | 7.17.5 | UI 组件库 |
| 📊 **D3.js** | 7.9.0 | 数据可视化（力导向图、和弦图、SVG） |
| 📈 **ECharts** | 6.1.0 | 图表库（雷达图、热力图、散点图等） |
| 🎮 **Three.js** | 0.184.0 | 3D 可视化（React Three Fiber） |
| 🎬 **React Three Fiber** | 9.6.1 | Three.js React 渲染器 |
| ✨ **Drei** | 10.7.7 | Three.js 辅助工具（OrbitControls 等） |
| 🔆 **Postprocessing** | 3.0.4 | Three.js 后处理特效（Bloom） |
| 🗃️ **Zustand** | 5.0.14 | 状态管理 |
| 🎨 **Sass** | 1.100.0 | 样式预处理 |

### 🐍 后端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| 🐍 **Python** | 3.12 | 编程语言 |
| ⚡ **FastAPI** | 0.136 | 异步 Web 框架 |
| 🚀 **Uvicorn** | - | ASGI 服务器 |
| ✅ **Pydantic** | v2 | 数据验证与序列化 |
| 🤖 **LangChain** | - | LLM 集成框架 |
| 🧠 **OpenAI API** | - | 大语言模型接口 |
| 🗄️ **SQLite** | - | 数据库（含 FTS5 全文搜索）|
| 📋 **Jinja2** | - | 模板引擎（管理后台）|
| 🔢 **NumPy** | 2.4 | 科学计算 |
| 📈 **SciPy** | 1.17 | 统计检验（χ²/KW/Pearson）|
| 🧠 **scikit-learn** | 1.9 | 聚类与降维（KMeans/PCA）|

### 🛠️ 开发工具

| 工具 | 用途 |
|------|------|
| 🐳 **Docker** | 容器化部署 |
| ☁️ **CNB** | 云原生构建 |
| 💻 **code-server** | 浏览器端 VS Code |
| 🤖 **AI 编程** | Claude Code + CodeBuddy + CodeX |

---

## 💻 环境要求

### 🖥️ 系统要求

- **操作系统**: Linux / macOS / Windows（支持 Docker）
- **内存**: 建议 4GB 及以上
- **磁盘空间**: 建议 10GB 及以上

### 📦 软件要求

- **Node.js**: 22.x 或更高版本
- **Python**: 3.12 或更高版本
- **Yarn**: 包管理工具
- **Docker**（可选，用于容器化部署）

---

## 🚀 快速开始

### 📥 安装依赖

```bash
# 前端依赖
cd HumanVIZ
yarn install

# 后端依赖
cd backend
pip install fastapi uvicorn pydantic langchain-openai pandas jinja2
```

### ▶️ 启动开发服务器

```bash
# 一键启动（推荐）
./scripts/start.sh

# 或分别启动：
# 前端开发服务器（端口 5200）
cd HumanVIZ
yarn dev

# 后端开发服务器（端口 5000）
cd HumanVIZ/backend
uvicorn main:app --reload --port 5000
```

### 🏗️ 构建生产版本

```bash
# 前端构建
cd HumanVIZ
yarn build

# 后端启动
cd HumanVIZ/backend
uvicorn main:app --host 0.0.0.0 --port 5000
```

### ⏹️ 停止服务

```bash
./scripts/stop.sh
```

---

## 📁 项目结构

```
workspace/
├── HumanVIZ/                    # 主应用目录
│   ├── src/                     # 🎨 前端源码
│   │   ├── components/          #   React 组件
│   │   │   ├── Dashboard/       #     主仪表板与侧边栏
│   │   │   ├── Liyuan/          #     梨园万象概览（∞字粒子河流）
│   │   │   ├── StarMap/         #     星图可视化（3D 漩涡星系 + Bloom）
│   │   │   ├── TaskViews/       #     5 个任务视图
│   │   │   ├── Modals/          #     弹窗组件
│   │   │   └── SplashScreen/    #     启动画面
│   │   ├── data/                #   前端数据文件（JSON, ~30MB）
│   │   ├── hooks/               #   自定义 React Hooks
│   │   ├── stores/              #   Zustand 状态管理
│   │   ├── types/               #   TypeScript 类型定义
│   │   └── utils/               #   工具函数
│   ├── backend/                 # 🐍 后端服务（FastAPI）
│   ├── scripts/                 # 📊 数据处理管线（Python, ~40 个脚本）
│   ├── notebooks/               # 📓 Jupyter 笔记本
│   ├── data/                    # 💾 原始与加工数据
│   │   ├── raw/dataSet/         #   1473 部剧本 JSON
│   │   └── processed/           #   网络/主题/叙事/结构指纹等加工数据
│   └── public/                  #   静态资源
├── scripts/                     # 🚀 部署与工具脚本
│   ├── start.sh                 #   一键启动开发服务器
│   ├── stop.sh                  #   停止所有服务
│   ├── deploy-to-tencent.sh     #   部署到腾讯云
│   ├── sync-to-gitee.sh         #   同步到 Gitee
│   ├── sync-to-github.sh        #   同步到 GitHub
│   ├── init-claude.sh           #   初始化 Claude Code 环境
│   ├── init-codex.sh            #   初始化 CodeX 环境
│   ├── init-opencode.sh         #   初始化 OpenCode 环境
│   ├── init-qoder.sh            #   初始化 Qoder 环境
│   └── test_api.py              #   API 测试脚本
├── docs/                        # 📖 项目文档
│   ├── claude-code-skills.md    #   Claude Code Skills 说明
│   ├── Collaboration.md         #   协作开发指南
│   ├── CV-ChinaVIS.md           #   项目价值挖掘
│   ├── github-sync-guide.md     #   GitHub 同步指南
│   ├── md-to-web-deploy.md      #   Markdown 转 Web 部署
│   └── tencent-cloud-deployment.md  # 腾讯云部署文档
├── files/                       # 📚 文档与比赛材料
│   ├── FULL-STACK.md            #   全栈开发学习指南
│   ├── 京剧科普.md               #   京剧知识科普
│   ├── competition/             #   比赛相关
│   │   ├── papre.tex            #     LaTeX 论文源文件
│   │   ├── papre.pdf            #     论文 PDF
│   │   ├── poster.html          #     海报 HTML
│   │   ├── CODEX.md             #     CodeX 使用说明
│   │   ├── files/               #     比赛提交文档
│   │   │   ├── Problem.md       #       赛题说明
│   │   │   ├── Submit.md        #       提交指南
│   │   │   ├── Data.md          #       数据集说明
│   │   │   ├── 1-I_answerSheet.pdf  #   答题纸模板
│   │   │   ├── Subtitles.md     #       视频字幕稿
│   │   │   └── Front_Back_page-Prompt.md  # 封面封底提示
│   │   └── Image/               #     比赛截图与可视化成果
│   ├── Image/                   #   项目宣传图
│   │   ├── Poster.png           #     海报
│   │   └── HumanVIZ.png         #     项目 Logo
│   └── paper/                   #   论文参考资料
│       ├── CharacterNetworks/   #     角色网络
│       └── StroyRibbon/         #     故事丝带
├── Dockerfile                   # 🐳 容器化配置
├── .cnb.yml                     # ☁️ 云原生构建配置
├── LICENSE                      # 📜 MIT 许可证
└── README.md                    # 📘 项目说明
```

---

## 📚 项目文档

本项目的详细文档位于 `files/` 目录：

### 🏆 比赛提交文档

| 文档 | 说明 |
|------|------|
| 📋 **[Problem.md](./files/competition/files/Problem.md)** | ChinaVIS 2026 赛题说明 |
| 📝 **[Submit.md](./files/competition/files/Submit.md)** | 作品提交指南与评审标准 |
| 📊 **[Data.md](./files/competition/files/Data.md)** | 京剧剧本数据集详细说明 |
| 📄 **[1-I_answerSheet.pdf](./files/competition/files/1-I_answerSheet.pdf)** | 比赛答题纸模板 |

### 📖 技术文档

| 文档 | 说明 |
|------|------|
| 📚 **[FULL-STACK.md](./files/FULL-STACK.md)** | 全栈开发学习指南 |
| 📄 **[papre.tex](./files/competition/papre.tex)** | 比赛论文 LaTeX 源文件 |
| 📄 **[papre.pdf](./files/competition/papre.pdf)** | 比赛论文 PDF |
| 🎨 **[poster.html](./files/competition/poster.html)** | 比赛海报 |

---

## 📜 许可证

本项目基于 MIT 许可证开源。

> ⚠️ **重要提示**：
>
> - 本项目仅供学习和研究使用
> - 商业用途请先获得相关方的授权

---

## 🙏 致谢

- 🏆 感谢 **ChinaVIS 2026 组委会** 提供的比赛机会和数据集
- 🎭 感谢所有为京剧数字化保护和研究做出贡献的学者和艺术家

---

<div align="center">

**🎭 感谢使用 HumanVIZ！**

</div>
