# HumanViz：人文数据可视化系统

> 基于 Story Ribbons 架构演进的人文数据可视化分析系统  

---

## 一、项目定位

### 1.1 核心概念

**HumanViz** 是一个面向人文领域（文学、历史、哲学、艺术）的**可视化分析系统**，通过定制化的可视化视图和 AI 辅助分析，帮助用户深入理解人文数据中的模式、关系和演变规律。

### 1.2 与 Story Ribbons 的关系

```
Story Ribbons (基座)
    │
    ├── 核心可视化：Narrative Ribbon（故事线）
    ├── AI 解析管道：LLM 数据提取
    └── 交互设计：多层叙事探索
            │
            ▼
    HumanViz (演进)
    │
    ├── 保留：Narrative Ribbon 核心能力
    ├── 扩展：多种可视化视图（应对不同数据类型）
    ├── 增强：AI 辅助分析功能
    └── 优化：针对赛题数据的定制分析流程
```

### 1.3 预设

| 方向 | 可能的数据类型 | 准备的可视化模板 |
|------|----------------|------------------|
| **文学叙事** | 小说、剧本 | Narrative Ribbon（故事线） |
| **历史演变** | 历史事件、人物 | Timeline + Network（时网图） |
| **社交网络** | 人物关系、组织 | Graph Network（关系网络） |
| **地理传播** | 迁徙、传播路径 | GeoNarrative（地理叙事） |
| **概念演化** | 思想、理论发展 | Concept Map（概念图） |

---

## 二、技术选型与架构

### 2.1 技术选型

| 层级 | 技术 | 选型理由 |
|------|------|----------|
| **前端框架** | Next.js 14 + React 18 + TypeScript | SSR/SSG 优化、类型安全、生态完善 |
| **UI 组件** | Mantine | 现有代码基础、组件丰富、主题定制方便 |
| **状态管理** | Zustand | 轻量、现有代码已使用、TypeScript 友好 |
| **后端 API** | FastAPI + Uvicorn | 异步高性能、自动文档、类型安全 |
| **LLM 服务** | Python FastAPI + LangChain OpenAI | 与现有后端兼容、Python 生态完善 |
| **数据库** | MongoDB (主) + SQLite (辅) | 文档存储灵活、结构化查询轻量 |
| **部署** | Docker + Docker Compose | 环境一致性、易于演示 |

### 2.2 可视化技术选型参考

赛题数据类型确定后，根据以下参考选择合适工具：

| 可视化场景 | 推荐工具 | 选型理由 |
|------------|----------|----------|
| **核心叙事线 (Narrative Ribbon)** | D3.js | 现有实现保留、无限定制能力、学术标准 |
| **统计图表 (柱状图/饼图/折线图)** | ECharts | 开发效率高、中文文档友好、配置简单 |
| **网络/关系图 (人物关系/概念图)** | G6 / Cytoscape.js | 力导向布局成熟、性能优秀、交互丰富 |
| **地理可视化 (迁徙/传播路径)** | Mapbox GL JS / L7 | 矢量地图渲染、自定义样式强 |
| **时序网络 (Timeline + Network)** | D3.js + G6 组合 | 时间轴用 D3，网络用 G6 |
| **配色处理** | Chroma.js | 颜色插值、色盲友好、与 D3 配合好 |

### 2.3 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      应用层 (Application)                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Next.js 14 前端应用                     │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │   │
│  │  │ 系统首页 │ │ 数据导入 │ │ 可视化  │ │ 分析导出 │   │   │
│  │  │         │ │ 数据管理 │ │ 分析视图 │ │         │   │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘   │   │
│  │                                                     │   │
│  │  可视化组件：D3.js / ECharts / G6 / Mapbox (按需)    │   │
│  │  状态管理：Zustand (storyStore / dataStore / ...)   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                      API 层 (API Layer)                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Next.js API Routes                        │   │
│  │  ├── /api/data    → 数据导入/查询/导出              │   │
│  │  ├── /api/viz     → 可视化数据接口                  │   │
│  │  └── /api/ai/*    → LLM 服务代理 → Python FastAPI   │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Python LLM 服务 (独立容器)                 │   │
│  │  ├── /api/v1/llm/*         → LLM 服务接口           │   │
│  │  ├── /api/v1/datasets/*    → 数据管理接口           │   │
│  │  ├── /HumanVIZ/*           → 管理后台页面           │   │
│  │  └── /docs, /redoc         → 自动 API 文档          │   │
│  │                                                     │   │
│  │  技术栈：FastAPI + Uvicorn + LangChain OpenAI       │   │
│  │  特性：异步高性能、自动 Swagger 文档、Pydantic 验证 │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                      数据层 (Data Layer)                     │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────────┐ │
│  │   MongoDB     │  │    SQLite     │  │    文件存储      │ │
│  │  (文档数据)    │  │  (分析结果)    │  │ (原始文本/图片)  │ │
│  │  - 原始数据    │  │  - 结构化查询  │  │                 │ │
│  │  - 解析结果    │  │  - 关系数据    │  │                 │ │
│  │  - 配置信息    │  │  - 缓存视图    │  │                 │ │
│  └───────────────┘  └───────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、当前仓库实现分析（Story Ribbons）

### 3.1 项目概况

**Story Ribbons** 是一个完整的文学叙事可视化系统，已实现从数据解析到交互可视化的完整流程。

**技术栈**：React + TypeScript + Vite + D3.js + Mantine + Zustand + Python FastAPI

**代码规模**：
- 前端组件：44 个 TSX 组件
- 状态管理：3 个 Zustand Store（storyStore、dataStore、positionStore）
- 工具函数：10+ 个工具模块（colors、helpers、consts、data等）
- 后端服务：Python FastAPI + LangChain LLM 集成

### 3.2 已实现功能（详见各模块文档）

**前端实现**：详见 [`OPERATION.md`](./OPERATION.md)
- 可视化组件（14+ 个核心组件）
- 界面组件（Header、Legend、Overlays、Modals）
- 交互功能（悬停、点击、联动、筛选）
- 状态管理（3 个 Zustand Store）
- 数据流程

**后端实现**：详见 [`BACKEND.md`](./BACKEND.md)
- API 接口（9 个端点）
- AI 功能（问答、查找、着色、Y轴）
- 数据管理（数据集列表、详情、预览）
- 管理后台（4 个页面）
- 服务模块架构

### 3.3 现有功能完整性评估

| 维度 | 完整度 | 说明 |
|------|--------|------|
| **核心可视化** | ⭐⭐⭐⭐⭐ | Narrative Ribbon 完全实现 |
| **辅助视图** | ⭐⭐⭐⭐ | 网络图、地点图、热力图已实现 |
| **交互功能** | ⭐⭐⭐⭐⭐ | 悬停、点击、联动、筛选完整 |
| **AI 集成** | ⭐⭐⭐⭐ | 问答、查找、属性生成已实现 |
| **UI 界面** | ⭐⭐⭐⭐⭐ | 完整的界面组件体系 |
| **状态管理** | ⭐⭐⭐⭐⭐ | 分层状态管理清晰 |
| **代码质量** | ⭐⭐⭐ | 需优化 TypeScript 类型、提取可复用组件 |

### 3.4 待改进/扩展点

**代码层面**：
- [ ] 迁移到 Next.js 框架
- [x] 后端迁移：Flask → FastAPI（已完成）
- [x] 添加管理后台：Jinja2 模板 + 古典书香风格（已完成）
- [ ] 优化 TypeScript 类型定义（减少 any）
- [ ] 提取可复用的 D3.js 组件
- [ ] 性能优化（大数据量渲染）

**功能层面**：
- [ ] 增加更多可视化模板（TimelineNetwork、GeoNarrative等）
- [ ] 支持更多数据类型（历史、哲学、艺术）
- [ ] 增强 AI 分析功能（模式发现、异常检测）
- [ ] 添加协作功能（分享、导出）

**设计层面**：
- [ ] 针对赛题数据优化视觉设计
- [ ] 增加动画过渡效果
- [ ] 优化移动端适配

---

## 四、参考资料

### 4.1 相关项目
- [Story Ribbons](https://github.com/catherinesyeh/story-viz) - 基座项目
- [Observable Plot](https://observablehq.com/plot/) - D3.js 高级封装参考
- [Gephi](https://gephi.org/) - 网络可视化工具参考

### 4.2 学术论文
- Story Ribbons 原始论文 (IEEE TVCG 2025)
- Visualization of Cultural Heritage Data
- Narrative Visualization: Telling Stories with Data

### 4.3 设计参考与工具资源

#### 🎨 配色工具
| 工具 | 链接 | 用途 |
|------|------|------|
| **中国色** | http://zhongguose.com/ | 中国传统色彩，含色名和 CMYK/RGB 值 |
| **ColorBrewer** | https://colorbrewer2.org/ | 数据可视化配色方案（色盲友好） |
| **Coolors** | https://coolors.co/ | 快速生成配色方案 |
| **Adobe Color** | https://color.adobe.com/ | 专业配色工具，支持提取图片配色 |
| **D3.js 配色** | https://github.com/d3/d3-scale-chromatic | D3 内置配色方案参考 |
| **中国传统色** | https://colors.ichuantong.cn/ | 另一个中国传统色网站 |
| **NIPPON COLORS** | https://nipponcolors.com/ | 日本传统色（可参考东亚配色美学） |

#### 🖋️ 字体资源
| 工具 | 链接 | 用途 |
|------|------|------|
| **Google Fonts** | https://fonts.google.com/ | 免费西文字体 |
| **思源宋体/黑体** | https://github.com/adobe-fonts | Adobe 开源泛 CJK 字体 |
| **站酷字体** | https://www.zcool.com.cn/special/zcoolfonts/ | 免费中文字体（站酷系列） |
| **字魂网** | https://izihun.com/ | 中文字体资源 |
| **字体家** | https://www.zitijia.com/ | 中文字体下载 |
| **猫啃网** | https://www.maoken.com/ | 免费商用字体整理 |

#### 🎯 图标资源
| 工具 | 链接 | 用途 |
|------|------|------|
| **Iconify** | https://iconify.design/ | 100+ 图标集统一接口 |
| **Heroicons** | https://heroicons.com/ | 精美 SVG 图标 |
| **Lucide** | https://lucide.dev/ | 现代简约图标 |
| **Iconfont** | https://www.iconfont.cn/ | 阿里巴巴矢量图标库 |
| **IconPark** | https://iconpark.oceanengine.com/ | 字节跳动开源图标库 |
| **Feather Icons** | https://feathericons.com/ | 简洁优雅的图标 |

#### 🗺️ 地图资源（GeoNarrative 用）
| 工具 | 链接 | 用途 |
|------|------|------|
| **Mapbox Studio** | https://studio.mapbox.com/ | 自定义地图样式设计 |
| **DataV GeoAtlas** | http://datav.aliyun.com/portal/school/atlas/area_selector | 阿里云地图选择器，下载 GeoJSON |
| **Natural Earth** | https://www.naturalearthdata.com/ | 免费矢量地图数据 |
| **高德地图 API** | https://lbs.amap.com/ | 国内地图服务 |
| **历史地图** | https://www.oldmapsonline.org/ | 历史地图资源 |
| **中国历史地图** | https://www.ageeye.cn/ | 中国古地图资源 |

#### 📊 可视化灵感与参考
| 工具 | 链接 | 用途 |
|------|------|------|
| **Observable** | https://observablehq.com/ | 数据可视化社区，D3.js 作品 |
| **D3.js Gallery** | https://observablehq.com/@d3/gallery | D3 官方示例库 |
| **Information is Beautiful** | https://informationisbeautiful.net/ | 信息可视化灵感 |
| **Visual Complexity** | http://www.visualcomplexity.com/ | 复杂网络可视化案例 |
| **FlowingData** | https://flowingdata.com/ | 数据可视化博客 |
| **Visually** | https://visual.ly/ | 信息图市场与灵感 |

#### 🎭 中国传统元素
| 工具 | 链接 | 用途 |
|------|------|------|
| **故宫纹样** | https://www.dpm.org.cn/lights/royal.html | 故宫传统纹样 |
| **书格** | https://www.shuge.org/ | 古籍善本数字化 |
| **汉典** | https://www.zdic.net/ | 汉字字形、字源 |
| **中国哲学书电子化计划** | https://ctext.org/ | 古籍文本资源 |
| **中华珍宝馆** | http://www.ltfc.net/ | 高清书画资源 |
| **数字敦煌** | https://www.e-dunhuang.com/ | 敦煌壁画数字化 |

#### 🧰 开发辅助工具
| 工具 | 链接 | 用途 |
|------|------|------|
| **JSON Crack** | https://jsoncrack.com/ | JSON 数据可视化 |
| **Transform.tools** | https://transform.tools/ | 代码格式转换（SVG/JSX/CSS等） |
| **RegExr** | https://regexr.com/ | 正则表达式测试 |
| **Carbon** | https://carbon.now.sh/ | 代码截图美化 |
| **Excalidraw** | https://excalidraw.com/ | 手绘风格图表绘制 |
| **Draw.io** | https://app.diagrams.net/ | 流程图、架构图绘制 |

#### 🎬 动画与交互参考
| 工具 | 链接 | 用途 |
|------|------|------|
| **Easing Functions** | https://easings.net/ | 缓动函数参考 |
| **Animate.css** | https://animate.style/ | CSS 动画库 |
| **Framer Motion** | https://www.framer.com/motion/ | React 动画库 |
| **GSAP** | https://greensock.com/gsap/ | 专业 JavaScript 动画 |
| **Lottie** | https://lottiefiles.com/ | 动画 JSON 格式 |

#### 📐 UI/UX 设计系统
| 工具 | 链接 | 用途 |
|------|------|------|
| **Ant Design** | https://ant.design/ | 企业级 UI 设计语言 |
| **TDesign** | https://tdesign.tencent.com/ | 腾讯设计体系 |
| **Arco Design** | https://arco.design/ | 字节跳动设计体系 |
| **Mantine** | https://mantine.dev/ | React 组件库（本项目选用） |
| **shadcn/ui** | https://ui.shadcn.com/ | 可复制的组件集合 |

#### 🧪 数据生成与测试
| 工具 | 链接 | 用途 |
|------|------|------|
| **Mockaroo** | https://www.mockaroo.com/ | 生成模拟数据 |
| **JSON Generator** | https://next.json-generator.com/ | JSON 数据生成 |
| **Random User** | https://randomuser.me/ | 随机用户数据 |
| **Unsplash** | https://unsplash.com/ | 免费高清图片 |
| **Lorem Picsum** | https://picsum.photos/ | 占位图片服务 |

---

### 4.4 可视化技术选型指南

#### 可视化库分类谱系

```
低层控制 ←────────────────────────→ 高层封装

D3.js    Visx    Vega    ECharts    Tableau
  │        │       │        │          │
  └────────┴───────┴────────┘          │
           编程式                        配置式
```

#### 📊 图表类库（快速开发）

| 库 | 特点 | 适用场景 |
|----|------|----------|
| **ECharts** | 百度开源，功能全面，中文文档友好 | 常规统计图表、地图、仪表盘 |
| **AntV** | 蚂蚁集团，G2/G6/L7 分层 | 图表/图可视化/地理可视化 |
| **Vega / Vega-Lite** | 声明式语法，JSON 配置 | 快速原型、学术可视化 |
| **Plotly.js** | 交互丰富，3D 支持 | 科学数据、3D 可视化 |
| **Observable Plot** | D3 团队出品，简洁 API | 探索性数据分析 |

#### 🕸️ 网络/关系图（图可视化）

| 库 | 特点 | 适用场景 |
|----|------|----------|
| **Cytoscape.js** | 专业图论库，布局算法丰富 | 社交网络、生物网络 |
| **Sigma.js** | 大规模图渲染，性能优秀 | 万级节点网络 |
| **G6 (AntV)** | 图可视化引擎，动画流畅 | 流程图、知识图谱 |
| **vis-network** | 简单易用，开箱即用 | 快速实现关系图 |
| **react-force-graph** | React 封装，3D 力导向 | 3D 网络可视化 |

#### 🗺️ 地理可视化（地图）

| 库 | 特点 | 适用场景 |
|----|------|----------|
| **Mapbox GL JS** | 矢量地图，自定义样式强 | 精美地图应用 |
| **Leaflet** | 轻量开源，插件丰富 | 基础地图、标记 |
| **Deck.gl** | Uber 开源，大规模数据 | 时空数据可视化 |
| **Kepler.gl** | 零代码地理可视化工具 | 快速探索地理数据 |
| **L7 (AntV)** | 地理空间数据可视化 | 中国地图、轨迹数据 |

#### 🎨 React 专用（组件化）

| 库 | 特点 | 适用场景 |
|----|------|----------|
| **Recharts** | 声明式语法，React 原生 | 常规图表 |
| **Victory** | 可组合组件，动画丰富 | 定制图表 |
| **Nivo** | 基于 D3，设计精美 | 仪表盘、数据展示 |
| **Visx** | Airbnb 开源，底层控制 | 高度定制可视化 |
| **React Flow** | 节点编辑器 | 流程图、DAG 图 |

#### 🔬 D3.js 深度解析

**定位**：D3.js 是一个基于数据操作文档的 **底层可视化工具库**，而非图表库。

**核心特点**：
- 不是"图表库"，是"工具箱"
- 直接操作 SVG/Canvas
- 数据绑定 + 数据驱动更新
- 模块化架构，按需引入

**核心模块**：

| 模块 | 功能 | 示例 |
|------|------|------|
| `d3-selection` | DOM 操作、数据绑定 | `.selectAll()`, `.data()`, `.join()` |
| `d3-scale` | 比例尺（数据→视觉） | `d3.scaleLinear()`, `d3.scaleOrdinal()` |
| `d3-shape` | 图形生成器 | `d3.line()`, `d3.area()`, `d3.arc()` |
| `d3-transition` | 动画过渡 | `.transition()`, `.duration()` |
| `d3-zoom` | 缩放交互 | `d3.zoom()` |
| `d3-drag` | 拖拽交互 | `d3.drag()` |
| `d3-hierarchy` | 层次布局 | `d3.tree()`, `d3.cluster()` |
| `d3-force` | 力导向布局 | `d3.forceSimulation()` |
| `d3-geo` | 地理投影 | `d3.geoMercator()`, `d3.geoPath()` |
| `d3-time` | 时间处理 | `d3.timeParse()`, `d3.timeFormat()` |

**优势 vs 劣势**：

| 优势 | 劣势 |
|------|------|
| 无限定制能力 | 学习曲线陡峭 |
| 直接操作 SVG/Canvas | 开发效率低 |
| 强大的数据处理能力 | 代码冗长 |
| 强大的交互能力 | 性能优化难 |
| 适合创新设计 | React 集成麻烦 |

**适用场景**：
- ✅ 定制可视化（Narrative Ribbon、Sankey、Chord 等）
- ✅ 创新设计（论文中的新型可视化方法）
- ✅ 交互复杂（拖拽、缩放、刷选、联动）
- ✅ 动画丰富（复杂的数据更新动画）
- ❌ 快速开发常规图表（用 ECharts）
- ❌ 简单仪表盘（用 React + Recharts）
- ❌ 大数据量（用 Deck.gl、Canvas 库）

#### 📊 可视化库对比

| 特性 | D3.js | ECharts | G6 | Three.js |
|------|-------|---------|-----|------------|
| **抽象层级** | 底层 | 高层 | 高层 | 底层 |
| **定制程度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **学习难度** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **开发效率** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **性能** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **适用场景** | 定制可视化 | 常规图表 | 图/网络 | 3D 可视化 |

---

> **项目愿景**：打造一款面向人文数据的深度可视化分析系统，让复杂的人文信息通过可视化变得可感知、可探索、可理解。

---

*文档版本：v1.1*  
*最后更新：2025-05-02*  
*维护者：HumanViz 团队*

---

## 更新记录

### v1.1 (2025-05-02)
- 更新技术栈：Flask → FastAPI
- 更新架构图：简化数据层，突出 FastAPI 服务
- 更新后端 API 端点列表
- 标记已完成的改进项

### v1.0 (2025-04-29)
- 初始版本
- 项目定位与技术选型
- 可视化组件详细分析
