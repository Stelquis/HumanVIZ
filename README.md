![HumanVIZ](files/HumanVIZ.png)

---

# 🎭 HumanVIZ

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.12](https://img.shields.io/badge/Python-3.12-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://react.dev/)
[![UV](https://img.shields.io/badge/Package%20Manager-UV-purple.svg)](https://github.com/astral-sh/uv)

> 面向人文数据的可视化分析系统 | 基于 [Story Ribbons](https://github.com/catherinesyeh/story-viz.git)

## 📖 项目简介

HumanVIZ 是一个面向人文领域（文学、历史、哲学、艺术）的可视化分析系统。通过定制化的可视化视图和 AI 辅助分析，帮助用户深入理解人文数据中的模式、关系和演变规律。基于 [Story Ribbons](https://github.com/catherinesyeh/story-viz.git) 开源项目演进，并计划重构支持更多可视化类型以应对不同的人文数据场景。

### 🔗 原始项目信息

- **论文** 📄: [Story Ribbons: Reimagining Storyline Visualizations with Large Language Models](https://ieeexplore.ieee.org/document/11278504)
- **演示** 🌐: [Story Ribbons Demo](https://catherinesyeh.github.io/story-demo/)
- **文档** 📚: [Story Ribbons Docs](https://catherinesyeh.github.io/story-docs/)
- **原始仓库** 🐙: [GitHub - catherinesyeh/story-viz](https://github.com/catherinesyeh/story-viz.git)

---

## 🏆 ChinaVIS 2026 可视分析挑战赛

> 🌐 比赛官网：[ChinaVIS 2026 挑战赛](https://chinavis.org/2026/zh/challenge_call_for_participation/)

### 📜 赛道 I：数据可视化与人文创意赛

#### 比赛背景

京剧作为中国传统戏曲艺术的重要代表，融合了文学、表演、音乐、美术与历史文化等多重元素，承载着丰富的人物塑造、叙事结构与文化表达。大量京剧剧本不仅记录了经典舞台艺术的演化过程，也反映了不同时代背景下的社会观念、价值体系与审美特征。

本赛题基于京剧剧本数据集，鼓励参赛者结合自然语言处理、复杂网络分析、时序分析与可视化等方法，从人物关系、主题表达、叙事结构以及版本演化等多个角度，对京剧剧本展开系统分析与可视化探索。

#### 任务一：「戏韵万象」京剧数据可视分析挑战赛

| 任务 | 主题 | 核心问题 |
|------|------|----------|
| Task 1 | 角色-行当分类与时代变迁分析 | 基于角色特征推断行当归属，分析不同时期角色-行当对应关系的变化规律 |
| Task 2 | 角色关系网络与剧目类型分析 | 识别主要角色互动关系，分析不同剧目类型的网络结构特征 |
| Task 3 | 剧本主题提取与跨剧本比较 | 提取核心主题，分析不同剧本的主题构成及组合方式 |
| Task 4 | 叙事结构分析与模式总结 | 识别剧情发展关键阶段，刻画剧情起伏与节奏变化 |
| Task 5 | 多维综合分析与交互系统构建 | 综合角色关系、主题结构与叙事结构，构建可交互可视分析系统 |

#### 📊 数据来源

本赛事数据集为京剧剧本数据集，包含：

| 类别 | 数量 | 说明 |
|------|------|------|
| 综合剧目集 | 13 个文件夹，1195 PDF | 《戏考》《国剧大成》《京剧汇编》《京剧丛刊》等 |
| 京剧名家剧本选 | 13 个文件夹，145 PDF | 周信芳、马连良、梅兰芳、程砚秋、荀慧生等 |
| 现代剧作家剧本选 | 5 个文件夹，14 PDF | 田汉、老舍、翁偶虹等 |
| 昆曲剧本选 | 4 个文件夹，71 PDF | 俞振飞、侯玉山等昆曲名家 |
| 其他剧本 | 3 个文件夹，51 PDF | 录音唱片本、名家藏本、院团改编本 |

**总计：38 个压缩包，38 个文件夹，1473 个 PDF 剧本**

详细数据说明请查看：[Data.md](./files/Data.md)

---

## 🛠️ 技术栈

### ⚛️ 前端技术栈

- **框架**: React 18 + TypeScript
- **构建工具**: Vite 5
- **UI 组件库**: Mantine 7
- **数据可视化**: D3.js + Chroma.js
- **状态管理**: Zustand
- **样式**: Sass

### 🐍 后端技术栈

- **语言**: Python 3.12
- **框架**: FastAPI (异步高性能)
- **ASGI 服务器**: Uvicorn
- **包管理**: UV (极速 Python 包管理器)
- **AI 集成**: LangChain OpenAI (兼容 OpenAI、智谱、DeepSeek 等厂商)
- **数据验证**: Pydantic v2
- **模板引擎**: Jinja2 (管理后台)

### 🛠️ 开发工具

- **容器化**: Docker 🐳
- **云原生**: CNB (Cloud Native Build) ☁️
- **代码编辑**: code-server（VS Code 浏览器版）💻
- **AI 编程**: CodeBuddy + CodeX + ChatGPT 🤖

## 💻 环境要求

### 🖥️ 系统要求

- **操作系统**: Linux / macOS / Windows（支持 Docker）
- **内存**: 建议 4GB 及以上
- **磁盘空间**: 建议 10GB 及以上

### 📦 软件要求

- **Node.js**: 22.x 或更高版本
- **Python**: 3.12 或更高版本
- **UV**: 极速 Python 包管理器
- **Yarn**: npm 包管理工具
- **Docker**（可选，用于容器化部署）

---

## 📁 目录结构

```
/workspace/
├── README.md                     # 项目说明文档
├── .cnb.yml                      # 云原生构建配置文件（CNB 平台配置）
├── Dockerfile                    # Docker 镜像构建配置
├── LICENSE                       # 开源许可证
├── files/                        # 项目文档与比赛资料
│   ├── Problem.md                # ChinaVIS 2026 赛题说明
│   ├── Start.md                  # 快速上手指南
│   ├── Submit.md                 # 作品提交说明
│   ├── OUTLINE.md                # 项目架构设计与规划
│   ├── OPERATION.md              # 前端开发手册
│   ├── BACKEND.md                # 后端 API 文档
│   ├── FULL-STACK.md             # 全栈技术栈参考
│   ├── DATASET.md                # 数据集详细说明
│   ├── analysis_report_4.md      # 数据分析报告
│   ├── 多人协作开发指南.md        # 多人协作开发规范
│   ├── StoryRibbons.pdf         # 原始论文 PDF
│   └── 1-I_answerSheet.pdf      # 比赛答题纸
├── scripts/                      # 脚本工具
│   ├── init-claude.sh            # Claude Code CLI 配置初始化脚本
│   ├── init-codex.sh             # CodeX CLI 配置初始化脚本
│   ├── start.sh                  # 一键启动脚本（自动检查环境、安装依赖、启动服务）
│   ├── stop.sh                   # 停止服务脚本
│   └── test_api.py               # LLM API 测试脚本
└── HumanVIZ/                     # HumanVIZ 核心源代码
    ├── data/                     # 数据目录
    │   └── dataset/              # 京剧剧本数据集（1473 个 PDF，38 个文件夹）
    │       ├── 01000000/         # 《戏考》
    │       ├── 02000000/         # 《国剧大成》
    │       ├── 03000000/         # 《京剧汇编》
    │       ├── 04000000/         # 《京剧丛刊》
    │       └── ...               # 其他剧目文件夹（共 38 个）
    ├── notebooks/                # Jupyter Notebook 数据分析
    │   ├── parsing-data.ipynb    # 数据解析与处理
    │   └── scripts/              # 辅助脚本
    ├── backend/                  # 后端 Python 服务 (FastAPI)
    │   ├── main.py               # FastAPI 应用入口
    │   ├── api/                  # API 路由
    │   │   ├── routes.py         # 路由定义
    │   │   └── dependencies.py   # 依赖注入
    │   ├── core/                 # 核心模块
    │   │   ├── config.py         # 配置管理
    │   │   └── exceptions.py     # 异常处理
    │   ├── database/             # 数据库模块
    │   │   ├── connection.py     # 数据库连接管理
    │   │   └── models.py         # ORM 模型定义
    │   ├── models/               # 数据模型
    │   │   └── schemas.py        # Pydantic 模型
    │   ├── scripts/              # 数据导入脚本
    │   │   └── import_data.py    # 数据导入工具
    │   ├── services/             # 业务服务
    │   │   ├── llm_service.py    # LLM 服务
    │   │   ├── data_service.py   # 数据服务
    │   │   └── prompts.py        # LLM 提示词模板
    │   ├── static/               # 静态资源
    │   │   ├── css/              # 样式文件
    │   │   └── favicon.svg       # 网站图标
    │   └── templates/            # Jinja2 模板（管理后台）
    │       ├── base.html         # 基础布局模板
    │       ├── dashboard.html    # 管理后台首页
    │       ├── data_manager.html # 数据管理页面
    │       ├── data_preview.html # 数据预览页面
    │       ├── import_export.html# 数据导入导出
    │       ├── llm_test.html     # LLM 测试页面
    │       ├── sql_query.html    # SQL 查询页面
    │       ├── api_docs.html     # API 文档页面
    │       └── color_schemes.html# 配色方案管理
    ├── public/                   # 前端静态资源
    │   ├── chapters/             # 章节文本文件
    │   ├── characters/           # 角色图片资源
    │   ├── covers/               # 封面图片
    │   └── fav.svg               # 网站图标
    ├── src/                      # 前端 React 源代码
    │   ├── components/           # React 组件
    │   │   ├── Header/           # 顶部导航栏组件
    │   │   ├── Legend/           # 图例组件
    │   │   ├── Misc/             # 杂项组件
    │   │   ├── Modals/           # 弹窗组件（含 ChinaVIS 概览、数据概览等）
    │   │   ├── Overlays/         # 覆盖层组件
    │   │   ├── Vis/              # 可视化核心组件（角色网络、故事图等）
    │   │   ├── XAxis/            # X 轴组件
    │   │   ├── YAxis/            # Y 轴组件
    │   │   ├── Dashboard/        # 综合仪表盘（朝代环、时间轴等）
    │   │   ├── Overview/         # 数据总览组件
    │   │   ├── Stage3D/          # 3D 京剧舞台组件
    │   │   └── TaskViews/        # 任务视图组件（叙事结构等）
    │   ├── data/                 # 数据文件（JSON 格式）
    │   ├── stores/               # Zustand 状态管理
    │   │   ├── storyStore.ts     # 故事/叙事状态
    │   │   ├── dataStore.ts      # 数据加载状态
    │   │   ├── positionStore.ts  # 位置/布局状态
    │   │   └── dashStore.ts      # 仪表盘状态
    │   ├── styles/               # 全局样式
    │   │   ├── dashboard.scss    # 仪表盘样式
    │   │   └── overview.scss     # 总览样式
    │   ├── types/                # TypeScript 类型定义
    │   │   └── geojson.d.ts      # GeoJSON 类型声明
    │   ├── utils/                # 工具函数
    │   │   └── colors.ts         # 色彩工具
    │   ├── App.scss              # 主样式文件
    │   ├── App.tsx               # 主应用组件
    │   └── main.tsx              # 应用入口
    ├── .eslintrc.cjs             # ESLint 配置
    ├── index.html                # HTML 入口
    ├── package.json              # 前端依赖配置
    ├── requirements.txt          # Python 依赖清单
    ├── vite.config.ts            # Vite 构建配置
    ├── secrets_example.json      # API 密钥配置示例
    ├── tsconfig.json             # TypeScript 配置
    ├── tsconfig.node.json        # TypeScript Node 配置
    ├── README.md                 # HumanVIZ 子项目说明
    └── yarn.lock                 # Yarn 锁定文件
```

---

## 📚 项目文档

本项目的详细文档位于 `files/` 目录：

**比赛相关：**
- **[Problem.md](./files/Problem.md)** — ChinaVIS 2026 赛题说明
- **[Start.md](./files/Start.md)** — 快速上手指南
- **[Submit.md](./files/Submit.md)** — 作品提交说明
- **[1-I_answerSheet.pdf](./files/1-I_answerSheet.pdf)** — 比赛答题纸

**技术文档：**
- **[OUTLINE.md](./files/OUTLINE.md)** — 项目架构设计与规划（适用于架构师、项目经理）
- **[OPERATION.md](./files/OPERATION.md)** — 前端开发手册（适用于前端开发者）
- **[BACKEND.md](./files/BACKEND.md)** — 后端 API 文档（适用于后端开发者）
- **[FULL-STACK.md](./files/FULL-STACK.md)** — 全栈技术栈参考（适用于学习者）
- **[DATASET.md](./files/DATASET.md)** — 数据集详细说明

**其他：**
- **[analysis_report_4.md](./files/analysis_report_4.md)** — 数据分析报告
- **[多人协作开发指南.md](./files/多人协作开发指南.md)** — 多人协作开发规范
- **[StoryRibbons.pdf](./files/StoryRibbons.pdf)** — 原始论文 PDF

---

## 📄 学术引用

如果你在研究或项目中使用了 Story Ribbons，请引用原始论文：

```bibtex
@article{yeh2025story,
  title={Story Ribbons: Reimagining Storyline Visualizations with Large Language Models},
  author={Yeh, Catherine and Menon, Tara and Arya, Robin Singh and He, Helen and Weigel, Moira and Vi{\'e}gas, Fernanda and Wattenberg, Martin},
  journal={IEEE Transactions on Visualization and Computer Graphics},
  year={2025},
  publisher={IEEE}
}
```

---

## 📜 许可证

本项目基于 Story Ribbons 开源项目。原始项目的许可证信息请参考原始仓库。

> **⚠️ 重要提示**：
>
> - 本项目仅供学习和研究使用
> - 使用本项目时请遵守原始项目的许可证条款
> - 商业用途请先获得原始项目作者的授权

---

## 🙏 致谢

感谢原始 Story Ribbons 项目的作者和贡献者！

**原始作者**：

- Catherine Yeh
- Tara Menon
- Robin Singh Arya
- Helen He
- Moira Weigel
- Fernanda Viégas
- Martin Wattenberg

---

<div align="center">

**🎭 感谢使用 HumanVIZ！！！**

</div>