# HumanVIZ 前端模块功能标注报告

> 生成时间：2026-05-09 16:29:16  
> 分析文件：14 个  
> 分析重点：丝带区域 · 图例 · 控制项 · 扩展建议

---

## 1. 入口与路由

### `main.tsx`

**分析侧重**：应用挂载点、路由配置、全局 Provider

好的，作为一名专业的前端可视化工程师，现在我将根据您提供的 `main.tsx` 文件内容，结合“叙事可视化系统（HumanVIZ）”的上下文，对这份技术文档进行分析。

---

### 1. 模块职责

`main.tsx` 是 HumanVIZ 系统的 **应用入口** 和 **全局配置挂载点**。它的核心职责是：

-   **启动应用**：使用 `ReactDOM.createRoot` 将根组件 `App` 渲染到 HTML 页面中 `id="root"` 的 DOM 节点上。
-   **提供全局上下文**：通过包裹 `MantineProvider` 为整个应用提供 Mantine UI 框架的主题、样式和组件上下文。
-   **基础样式初始化**：引入全局样式文件（`index.scss`）和 Mantine 核心样式（`@mantine/core/styles.css`）。

**在整个可视化系统中，`main.tsx` 不直接参与任何可视化数据的处理、渲染或交互逻辑，它是整个应用的“地基”和“启动开关”。**

### 2. 丝带区域（Ribbon）

**未涉及**。当前文件（`main.tsx`）仅为应用入口，不包含任何与“丝带”相关的数据绑定、SVG 路径生成或颜色控制逻辑。这些逻辑应位于具体的可视化组件（如 `RibbonChart.tsx`）中。

### 3. 图例（Legend）

**未涉及**。当前文件不包含图例的构成要素、颜色映射或交互行为。图例通常由系统中独立的 `Legend` 组件实现，并由 `App.tsx` 或更上层的页面组件组合使用。

### 4. 控制项（Controls）

**未涉及**。当前文件不包含任何用户可操作的控件。筛选、缩放、高亮等交互逻辑应存在于具体的 `Controls` 组件或 `Store`（全局状态管理）中，并经由 `App.tsx` 进行编排。

### 5. 关键接口/Props

这是 `main.tsx` 文件中最有价值的部分。它暴露了以下关键配置：

-   **全局 Provider**: `MantineProvider`
    -   **Props**: `theme` (通过 `createTheme` 方法创建)。
    -   **作用**: 定义整个应用的 UI 主题风格。
    -   **当前配置**: `primaryColor: "dark"`，表明系统基础色为深色主题。所有 Mantine 组件（如按钮、滑块、弹窗）的样式都会继承这个主题。

-   **状态依赖 (Store)**: **无**。当前文件不依赖任何 Redux、Zustand、Pinia、Valtio 或 Context 等状态管理库。这意味着该文件非常轻量，状态管理的初始化逻辑应在 `App.tsx` 或 `store` 目录下完成。

**总结：`main.tsx` 对外暴露的唯一决定性 Props 是 `theme` 配置。**

### 6. 扩展建议

基于 `main.tsx` 的代码入口特性，提出以下 2 条扩展切入点：

1.  **增加全局状态管理与初始化**：
    -   **切入点**：在 `MantineProvider` 内部，`<App />` 外部，包裹一个全局状态管理 Provider（如 `Provider` from `react-redux` 或 `Zustand` 的 `Provider`）。
    -   **实施**：例如，如果需要管理可视化数据的全局筛选状态（如时间范围、数据分类），可以在 `main.tsx` 中引入 `store` 并包裹 App，确保任何子组件都能访问到全局的叙事数据状态。

2.  **引入多主题/动态主题切换**：
    -   **切入点**：修改 `

---

### `App.tsx`

**分析侧重**：顶层布局结构、页面切换逻辑

好的，作为一名专业的前端可视化工程师，我将对您提供的 `App.tsx` 文件进行分析，并按照您要求的格式输出技术文档。

---

### 分析文件：App.tsx

#### 1. 模块职责

**顶层布局与页面状态管理器**

该文件是 HumanVIZ 系统的**根组件**，职责是：

-   **顶层布局**：定义整个应用最外层的 HTML 骨架，包括头部（Header）、主可视区域（StoryVis）和未在片段中展示的其他覆盖层。
-   **页面状态切换**：通过读取 `storyStore` 中的状态（如 `story`、`chapterView`、`detailView`、`fullHeight`、`showLegend` 等），动态调整布局的边距、高度和样式，从而驱动整个应用在“概览视图”、“章节视图”、“详情视图”以及不同数据维度（如按角色、按地点）之间的切换。
-   **全局事件绑定**：负责监听窗口的 `resize` 事件，动态计算 Header 高度并设置到全局 store 中，以便其他组件做出响应式布局调整。同时，它也管理主内容区域的水平滚动同步。

简而言之，`App.tsx` **不直接生成任何可视化图形**，而是作为控制中心，协调所有子组件的布局和可见性。

#### 2. 丝带区域（Ribbon）

**不涉及**
在该文件的前 3000 字符及代码逻辑中，**没有**与“丝带”相关的代码、组件引用或状态。丝带的生成逻辑应位于 `StoryVis` 或其他子组件中。

#### 3. 图例（Legend）

**间接管理**

-   **构成要素**：该文件没有直接渲染图例，但引用了 `LegendHoverMsg` 组件，这可能是图例的提示或交互部分。图例的主体可能位于其他地方（如 `LegendDiv` 被注释掉了）。
-   **与颜色映射的关联**：通过读取 `storyStore` 中的 `showLegend` 状态，该文件可以控制图例的显示/隐藏，但具体的颜色映射逻辑不在此文件中。
-   **交互行为**：当 `showLegend` 状态变化时，`App.tsx` 会触发 `handleResize`（详见关键接口/Props部分），从而调整主内容区边距，为图例的出现腾出空间。这间接管理了图例可见性对布局的影响。

#### 4. 控制项（Controls）

**不直接提供**

-   该文件**没有**实现任何用户可操作的筛选、缩放、高亮等交互控件。这些控件应位于子组件中，例如：
    -   **PlotOptions**：可能包含图表类型、数据筛选等控件。
    -   **SceneOptions**：可能用于切换场景视图或控制X轴。
    -   **ChapterSidebar**：可能用于章节导航和筛选。
-   **事件流**：该文件负责监听 `windows.resize` 和 `story-contain` 的滚动事件，这是最基础的全局事件流。具体子控件的事件处理在其各自的组件内部实现，并通过 `storyStore`、`positionStore` 等全局状态管理器来影响整个应用。

#### 5. 关键接口/Props

**核心依赖（Store）与内部计算属性**

该文件接收的“Props”实际上是通过 Zustand 等状态管理库获取的全局状态。以下是其依赖的关键状态和计算值：

| 属性/状态名 | 来源 (Store) | 用途 |
| :--- | :--- | :--- |
| `scene_data` | `dataStore` | 触发 `handleResize`，确保布局在数据加载后更新。 |
| `plotHeight` | `position

---

## 2. 后端服务

### `server.ts`

**分析侧重**：API 路由、数据读取、静态资源托管

好的，作为一名专业的前端可视化工程师，以下是对 `server.ts` 文件的技术分析文档。

---

### **1. 模块职责**

该文件是 **HumanVIZ** 可视化系统的 **数据通信与后端接口层**。其核心职责是：

*   **封装 HTTP 请求**：对 `axios` 库进行二次封装，提供统一的 `get` 和 `post` 方法来与运行在 `http://127.0.0.1:5000` 的 **FastAPI (Python)** 后端进行交互。
*   **定义业务接口**：将后端提供的 RESTful API 端点（如 `/api/v1/llm/colors`）抽象为可调用的 `async` 异步函数（如 `getNewColors`），方便前端其他模块（如 Vue/React 组件）调用。
*   **承担“桥梁”角色**：它是一个纯粹的服务层，不包含任何 UI 逻辑、状态管理或 DOM 操作。它专注于数据的发送与接收，并将结果以 Promise 的形式返回给调用方。

**总结**：该文件是整个可视化系统的“数据神经”，负责所有对后端大语言模型（LLM）及状态查询的请求。

---

### **2. 丝带区域（Ribbon）、图例（Legend）、控制项（Controls）**

**不涉及。** 此文件 `server.ts` 是一个纯服务层模块，没有包含任何与 SVG 路径生成、颜色/透明度控制、图例构成元素或用户交互控件相关的 UI 代码。这些功能应在前端 UI 组件（例如 `VisualizationChart.vue` 或 `RibbonView.tsx`）中实现。

---

### **3. 关键接口/Props**

此文件不暴露 UI 组件的 Props，而是暴露 **一组异步 API 调用函数**。以下是核心接口：

| 接口函数 | 参数 | 返回类型 | 说明 |
| :--- | :--- | :--- | :--- |
| `getNewColors(data, color_desc, palette_info, type)` | `data: any`, `color_desc: string`, `palette_info: string`, `type: string` | `Promise<any>` | 向后端请求新的配色方案。 |
| `getNewYAxis(data, yaxis_desc, type)` | `data: any`, `yaxis_desc: string`, `type: string` | `Promise<any>` | 向后端请求新的 Y 轴字段。 |
| `askLLMQuestion(question, info)` | `question: string`, `info: string` | `Promise<any>` | 向 LLM 提问，用于交互式分析。 |
| `findChapterWithLLM(question, info)` | `question: string`, `info: string` | `Promise<any>` | 通过 LLM 查找或跳转到特定章节。 |
| `checkBackendStatus()` | 无 | `Promise<any>` | 用于健康检查，检测后端服务是否可用。 |
| `dataServerUrl` | - | `string` | 常量，硬编码的后端地址 `http://127.0.0.1:5000`。|

**状态依赖**：该文件不依赖任何前端 Store（如 Pinia、Vuex、Redux）。它是一个无状态的工具模块。

---

### **4. 扩展建议**

基于当前代码结构，以下是两个明确的扩展方向：

1.  **引入 Axios 拦截器与统一错误处理**：
    *   **现状**：每个 `get` 和 `post` 函数调用都重复了 `.then()` 和 `.catch()` 的逻辑，且 `catch` 中只是 `reject(errResponse)`，没有进行统一的错误格式化或用户提示。
    *   **切入点**

---

## 3. 状态管理

### `stores/storyStore.ts`

**分析侧重**：故事/叙事数据的状态结构与更新逻辑

好的，作为一名专业的前端可视化工程师，以下是我对 `stores/storyStore.ts` 文件的分析与解读。

---

### 1. 模块职责

该文件是 **HumanVIZ** 系统的**核心状态管理层**，使用 [Zustand](https://github.com/pmndrs/zustand) 库实现全局状态管理。

-   **核心职责**：统一管理影响“叙事/故事”视图的所有交互状态和视觉配置。
-   **功能定位**：它是连接用户交互（如点击、滚动、筛选）与可视化渲染（如丝带、图例、时间轴）的**数据中枢**。所有组件都通过该 Store 读取状态或触发更新，确保整个系统状态的一致性。
-   **数据流**：用户操作 → 调用 Store 中的 setter 函数 → 状态更新 → 依赖该状态的 React 组件自动重渲染。

---

### 2. 丝带区域（Ribbon）

**当前文件中未直接涉及丝带区域的具体实现**（如 SVG 路径生成、数据绑定等）。丝带相关的逻辑通常存在于组件文件（如 `Ribbon.tsx` 或 `NarrativeChart.tsx`）中。

但该 Store 为丝带区域提供了关键的**状态依赖**：

-   **数据变量绑定**：通过 `yAxis`（决定丝带纵轴映射的字段，如地点）、`colorBy`、`sizeBy`、`weightBy` 等字段，丝带组件会从 Store 中读取这些配置，从而决定如何从原始故事数据中提取相应属性进行视觉编码。
-   **交互控制**：丝带区域的高亮（`sceneHover`、`chapterHover`、`linkHover`）、隐藏（`hidden`）等行为，依赖 Store 中的 hover 和 hidden 数组来实现联动。

**扩展建议**：如果需要在此文件中补充丝带逻辑，可以考虑引入 `ribbonData`（处理后的描点坐标数组）并定义 `computeRibbonPath` 这样的纯函数。

---

### 3. 图例（Legend）

**当前文件中未直接涉及图例构成**，但提供了图例显示的必要条件：

-   **显示控制**：通过 `showLegend: boolean` 决定图例是否渲染。
-   **交互联动**：`legendHover: string` 用于在鼠标悬停图例项时，高亮视图中对应的视觉元素（如丝带中对应颜色类别的弧段）。
-   **颜色映射**：图例的颜色方案依赖于 `colorBy`（决定颜色映射的维度）和 `characterColor`（自定义颜色覆盖）。图例组件需要从 Store 中读取这两个字段，从颜色尺度函数中获取颜色列表。

---

### 4. 控制项（Controls）

虽然该文件不直接包含 UI 控件，但它定义的 setter 函数是控件交互的**最终目标**。以下是 Store 中声明的、典型的用户控制项及其事件流：

| 控制类型 | 对应的 Store 状态 | 典型交互事件流 |
| :--- | :--- | :--- |
| **视图切换** | `chapterView`, `themeView`, `fullHeight` | 点击按钮 → 调用 `setChapterView(true)` → 视图组件重排 |
| **数据缩放/映射** | `scaleByLength`, `yAxisHeight`, `xAxisWidth` | 拖动滑块 → 调用 `setScaleByLength(val)` → 丝带长度重新计算 |
| **滚动同步** | `storyScroll`, `storyScrollX` | 滚动文章/故事文本 → 调用 `setStoryScroll(scrollPos)` → 丝带自动滚动到对应位置 |
| **视觉编码** | `colorBy`,

---

### `stores/dataStore.ts`

**分析侧重**：原始数据加载、缓存、选择逻辑

好的，作为一名专业的前端可视化工程师，我将对您提供的 `stores/dataStore.ts` 文件进行分析，并按照您要求的结构整理技术文档。

---

### 文件: `stores/dataStore.ts` 技术分析

#### 1. 模块职责

该文件是整个 **HumanVIZ** 系统的 **数据核心 (Data Core)** 和 **状态管理中心 (State Management Hub)**。它不直接负责绘制任何可视化元素，而是承担以下关键职责：

- **数据加载与初始化**：负责从本地硬编码的 `gatsby-new.json` 文件加载原始数据，并立即通过 `getAllData()` 工具函数将其处理成系统内部使用的标准化格式（如 `Scene[]`, `CharacterData[]` 等）。
- **全局状态存储**：使用 Zustand 状态管理库，维护系统运行所需的全部核心数据状态，包括场景、角色、位置、章节、颜色配置、Y轴选项等。
- **数据缓存 (隐含)**：虽然代码片段中导入了 `localforage`，但其具体的持久化逻辑（如从 IndexedDB 读写）未在当前片段展示。这表明该模块具备或规划了 **跨会话数据持久化** 的能力，用于缓存用户的自定义配置或处理后的数据，以提升下次加载速度。
- **数据选择与过滤**：提供了 `setData`, `setActiveChapters` 等接口，允许其他模块（用户交互组件）对当前活跃的数据子集（如按章节过滤的场景）进行修改和选择。

简而言之，这个模块是连接 **原始数据** 与 **可视化组件** 的桥梁和大脑，确保整个系统有统一、可靠的数据来源。

#### 2. 丝带区域（Ribbon）

**该文件不涉及丝带区域的生成逻辑**。丝带区域（通常指表示角色在时间线上出现频率的连续曲线）的 SVG 路径生成、数据绑定、颜色/透明度控制等可视化渲染逻辑，通常在专门的 **视觉组件** 中实现（例如 `components/RibbonChart.tsx`）。`dataStore` 仅为这些组件提供所需的底层数据，例如 `characterScenes`（角色-场景对应关系）和 `characterColorOptions`（角色颜色选项）。

#### 3. 图例（Legend）

**该文件不直接渲染图例**，但为图例的构建提供了**必要的状态支持**：

- **构成要素关联**：图例通常需要展示角色名称及其对应的颜色。该模块通过 `customColorDict`（自定义颜色字典）和 `characterColorOptions`（角色颜色选项数组）存储了颜色与角色之间的映射关系。这为图例组件提供了数据来源。
- **交互行为支持**：虽然不负责交互，但图例的点击（筛选/高亮某个角色）可能需要通过调用该模块提供的 `setCharacterData`, `setSceneData` 等接口来改变底层数据，从而驱动视图更新。

简单来说，`dataStore` 是图例的 **数据后盾**。

#### 4. 控制项（Controls）

**该文件为控制项提供了核心的数据操作接口**。用户可操作的控件（如章节滑块、角色筛选器等）产生的交互事件，最终会流向这里的状态更新函数。

- **筛选**：
  - `setActiveChapters(val: [number, number])`：允许用户选择章节范围，从而筛选出对应章节的场景和角色数据。
  - `resetActiveChapters(val: number)`：将章节过滤器重置到初始状态（例如全部章节或第一章）。
- **数据重载**：
  - `setData(val, val1, val2, val3, val4)`：这是一个非常核心的接口，允许上层应用**重新加载或切换**数据源（例如上传新文件、切换回

---

### `stores/positionStore.ts`

**分析侧重**：元素位置/布局状态管理

好的，作为一名专业的前端可视化工程师，我将对该文件 `stores/positionStore.ts` 进行详细分析。

---

### 1. 模块职责

该文件是 **HumanVIZ** 系统中负责 **元素位置与布局状态管理** 的模块。其核心职责是：

- **计算并存储所有视图元素的精确位置**：包括场景（Scene）、角色（Character）、地点（Location）等在可视化画布上的坐标。
- **提供布局重算能力**：当用户更改筛选条件（如 `evenSpacing`、`yAxis` 选项）时，能够重新计算整个布局。
- **作为全局状态中心**：通过 Zustand 库管理状态，使得整个应用（特别是 SVG 渲染组件）可以响应式地获取最新的位置数据，从而驱动视图更新。

简而言之，该模块是可视化系统的“骨架”和“坐标系”，没有它，任何元素都无法被正确地绘制在画布上。

### 2. 丝带区域（Ribbon）

该文件**不直接涉及**丝带（Ribbon）的数据绑定、SVG 路径生成或颜色/透明度控制。

丝带通常用于表示角色在时间线上的连续轨迹，其路径生成和样式逻辑很可能在**视图组件**（如一个专门的 `RibbonLayer` 或 `CharacterBand` 组件）中实现，依赖于本 Store 提供的 `characterPos`（角色位置点）或 `characterPaths`（预计算的路径字符串）。

- **关联点**：尽管本文件不直接绘制丝带，但它提供了丝带渲染所必需的**基础位置数据** (`characterPos`) 和**预计算 SVG 路径字符串** (`characterPaths`)。这表明绘制丝带的组件会从 `positionStore` 订阅 `characterPaths` 来直接渲染路径。

### 3. 图例（Legend）

该文件**不涉及**图例（Legend）的管理。

图例的构成、颜色映射和交互行为通常属于**视图组件**的职责，配合专门的颜色主题 Store 或图表库来生成。本文件专注于纯几何位置，与颜色和语义标签无关。

### 4. 控制项（Controls）

该文件**部分涉及**布局控制，但不直接包含交互控件的事件流。

它暴露了一个 `setPositions` 方法，该方法接受一系列参数（如 `evenSpacing`、`yAxis`、`customYAxisOptions`），这些参数正是由用户控件修改的。

- **事件流示例**：
  1.  用户在界面上点击“均匀间距”开关。
  2.  一个 React 组件（如 `ControlsPanel`）监听到变更事件。
  3.  该组件调用 `positionStore.getState().setPositions(..., newEvenSpacingValue, ...)`。
  4.  `setPositions` 内部调用 `getAllPositions` 重新计算所有位置，并更新 Store。
  5.  Zustand 状态变化引发所有订阅了该 Store 的视图组件重新渲染。

- **关键控制点**：
    - `evenSpacing: boolean`：控制场景或角色的间距是否均匀。
    - `yAxis: string`：控制 Y 轴的分类依据（例如按“地点”分组还是按其他自定义分类）。
    - `customYAxisOptions: string[]`：用于自定义 Y 轴分类的选项列表。

### 5. 关键接口/Props

该文件对外暴露的核心是一个 Zustand **Store 实例**，其接口定义如下：

| 属性/方法 | 类型 | 说明 |
| :--- | :--- | :--- |
| **状态 (State)** | | |
| `sceneWidth`, `plotWidth`, `plotHeight` | `number` | 画布及场景区域的宽度/高度。

---

## 4. 核心可视化

### `components/Vis/StoryVis.tsx`

**分析侧重**：整体可视化容器：丝带区域布局、图例区域、各子图层的组装方式

好的，作为一名专业的前端可视化工程师，我将对您提供的 `StoryVis.tsx` 文件进行详细分析。

---

### 模块职责：整体可视化容器与布局协调

该文件是 `HumanVIZ` 叙事可视化系统的**根容器组件**。它的核心职责是：

1.  **定义画布**：创建一个 SVG 画布（`<svg id="story">`），作为所有叙事可视化元素（如主图、丝带、装饰等）的承载容器。
2.  **管理尺寸与滚动**：协调外部状态（来自 `positionStore` 和 `storyStore`）与浏览器窗口尺寸、滚动位置之间的关系，动态调整 SVG 的 `width`、`height` 和 `viewBox`，确保可视化内容在不同视图模式下（如概览、细节）正确缩放和布局。
3.  **组装子图层**：将核心可视化组件（如 `MainPlot`）和辅助元素（如 `Defs`）组合在一起，形成一个完整的 SVG 文档结构。
4.  **控制视图模式**：根据 `storyStore` 中的 `detailView` 和 `fullHeight` 状态，切换不同的尺寸计算逻辑，以支持“全览模式”和“细节模式”的切换。

**简而言之，`StoryVis` 是可视化系统的“画架”，决定了画布有多大（尺寸）、画布如何展示（缩放、滚动）、以及画布上要放哪些画板（子组件）。**

---

### 丝带区域（Ribbon）

**当前文件中未直接涉及。** 该文件是容器层，主要负责布局和尺寸管理，并未实现丝带（Ribbon）的绘制逻辑。丝带的具体绘制、数据绑定和路径生成大概率在 `MainPlot` 组件内部完成。

**基于系统架构的推测（扩展点）：**

-   **数据绑定方式**：丝带通常代表叙事流程，其数据可能来自 `dataStore` 中的 `scene_data` 和 `locations`。每一条丝带可能对应一个“场景”或一个“角色轨迹”，数据通过 D3.js 的 `.data()` 方法绑定到 `<path>` 元素上。
-   **SVG 路径生成**：`MainPlot` 内部可能会使用 D3.js 的 `d3.line()` 或 `d3.curveBasis()` 等路径生成器，根据 `scenePos`（场景位置）和 `yAxis`（Y轴类型）来生成曲线或折线路径。
-   **颜色/透明度控制**：颜色可能映射自 `dataStore` 中的分类属性（如角色ID），并通过 `Defs` 组件定义的渐变色或纯色来实现。透明度可能用于表示事件的“强度”或“时间远近”，通过动态计算 `opacity` 属性值来控制。

---

### 图例（Legend）

**当前文件中未直接涉及。** 图例同样不是本容器的职责。如果系统存在图例，通常是一个独立的 SVG 组件（如 `<Legend>`），会被显式地放入 `<svg>` 标签内。

**基于系统架构的推测（扩展点）：**

-   **构成要素**：图例可能包含颜色条、形状标记和文本标签。颜色条与 `MainPlot` 中使用的颜色映射函数一致。
-   **与颜色映射的关联**：图例的值域（Domain）和值域范围（Range）直接复用了 `dataStore` 或 `colorStore` 中定义的颜色映射规则。
-   **交互行为**：图例可能支持点击或悬停高亮。点击某个图例项，可能触发 `storyStore` 或 `interactionStore` 中的状态更新，进而过滤或高亮对应的数据点/丝带。

---



---

### `components/Vis/MainPlot.tsx`

**分析侧重**：主绘图区：丝带（Ribbon）绘制逻辑、SVG 元素、交互事件

好的，作为一名专业的前端可视化工程师，我将对您提供的 `MainPlot.tsx` 文件（前3000字符）进行技术分析，并按照您的要求结构化为中文文档。

---

### **1. 模块职责**

`MainPlot.tsx` 是 **HumanVIZ** 系统的核心绘图组件。它负责渲染叙事可视化中最重要的“主绘图区”，即展示故事时间线与角色/场景关系的图形主体。

其核心职责包括：
- **场景矩形的渲染**：为每个场景绘制背景方块，形成时间轴的基础视觉结构。
- **丝带（Ribbon）的容器**：虽然丝带的详细绘制可能在子组件（如 `Ribbon.tsx`）中，但 `MainPlot` 负责根据 `positionStore` 和 `dataStore` 的数据，筛选并准备绘制丝带所需的角色路径数据（`characterPaths`）。
- **状态管理与交互协调**：它是用户交互（悬停、点击）的枢纽。它从 `storyStore` 读取多种悬停状态（`sceneHover`, `characterHover`, `chapterHover`），并在用户触发事件时更新这些状态，进而驱动其他视觉元素（如图例、详情面板）的联动变化。
- **布局与章节控制**：根据 `activeChapters`（活跃章节）的范围，动态过滤需要绘制的场景和角色数据，实现“按章节查看”的筛选功能。

简而言之，**`MainPlot` 是整个可视化系统的“画布”和“指挥中心”，负责将数据映射为SVG图形，并管理用户与图形的初步交互。**

---

### **2. 丝带区域（Ribbon）**

根据提供的代码片段，该组件直接引用了 `positionStore` 中的 `characterPaths` 数据，这很可能是用于绘制丝带的路径集合。丝带的完整逻辑可能在后续代码或子组件中，但基于现有代码，可以做如下分析：

#### **数据绑定方式**
- **数据来源**：丝带路径数据直接来源于状态管理库 `positionStore.characterPaths`。
- **数据筛选**：在组件内部，通过 `activeChapterDivisions` 筛选出当前活跃章节的 `firstActiveScene` 和 `lastActiveScene` 索引，然后使用 `sceneCharacters.filter(...)` 和 `sceneBoxes.filter(...)` 来生成 `activeSceneCharacters` 和 `activeSceneBoxes`。这表明 `characterPaths` 在渲染前会基于“活跃章节”进行过滤，实现了章节聚焦功能。

#### **SVG 路径生成逻辑**
- 代码中并未直接展示 `characterPaths` 是如何生成的（这很可能在 `positionStore` 的计算逻辑或专门的位置计算工具函数中），但可以推断：
    - **使用 `<path>` 元素**：这是SVG绘制曲线/带子的标准方式。
    - **属性映射**：`d` 属性（路径描述）直接绑定 `characterPaths[i]`，每个路径对应一个角色。
    - **动态样式**：路径的 `fill` 或 `stroke` 可能会根据 `characterColorBy`（角色着色依据）动态绑定到不同的颜色函数（如 `getGroupColor`, `emotionColor`, `getCustomColor` 等）。`opacity` 可能会根据角色是否被隐藏（`hidden` 数组）进行控制。

#### **颜色/透明度控制**
- **颜色映射**：颜色控制逻辑从 `storyStore` 的 `characterColorBy` 字段开始。代码顶部导入了多种颜色工具函数（`emotionColor`, `getGroupColor`, `getLLMColor` 等），暗示丝带的颜色会根据用户选择的维度（角色组、情感、自定义属性等）动态变化。
- **透明度控制**：虽然没有

---

### `components/Vis/CharacterNetwork.tsx`

**分析侧重**：人物关系网络图：节点/边渲染、力导向布局、图例说明

好的，作为一名专业的前端可视化工程师，我对您提供的 `CharacterNetwork.tsx` 文件代码片段进行分析，并整理出以下技术文档。

---

### 人物关系网络图 (`CharacterNetwork.tsx`) 技术分析

#### 1. 模块职责

该文件 `CharacterNetwork.tsx` 是 **HumanVIZ** 叙事可视化系统的核心模块之一，专门负责**渲染和交互人物关系网络图**。其主要职责包括：

-   **数据驱动渲染**：将人物（节点）及人物间的关系（边）数据，通过 D3.js 的力导向布局 (`d3-force`) 进行解算，并渲染为 SVG 图形。
-   **视觉编码映射**：根据用户选择的配色方案（如按情感、重要性、分组、LLM 生成等），动态计算节点和边的颜色、大小、透明度，实现多维度的视觉编码。
-   **交互控制**：响应用户的悬停 (`hover`)、点击 (`click`) 等操作，实现节点/边高亮、筛选、缩放等交互行为，并与其他视图（如场景视图、章节视图）联动。
-   **上下文关联**：根据当前选中的场景 (`sceneHover`) 或章节 (`chapterHover`)，动态过滤显示的节点和边的数据，呈现当前叙事片段的人物关系网络。

#### 2. 丝带区域（Ribbon）

在此文件片段中，**没有直接涉及到“丝带区域（Ribbon）”** 的构建逻辑。丝带图通常用于展示时间线上的变量变化，而此模块专注于**网络图**的节点与边。

#### 3. 图例（Legend）

在此文件片段中，**没有直接渲染图例的代码**。图例的生成逻辑可能位于更上层的父组件或独立的子组件中。不过，从代码中可以推断出与图例相关的关键信息：

-   **构成要素推断**：图例应该包含：
    -   **节点颜色映射**：根据变量 `characterColor` 的值（如 `'llm'`, `'group'`, `'sentiment'`, `'importance'`）对应的颜色生成图例项。
    -   **节点大小/透明度映射**：映射 `emotion` 或 `importance` 等数值的刻度尺。
    -   **边颜色/粗细映射**：映射边的类型或权重。
-   **与颜色映射的关联**：图例的核心是反向解析 `getNodeColor` 函数的功能。例如，当 `characterColor` 为 `'group'` 时，图例会列出所有唯一分组 (`uniqueGroups`) 及其对应的颜色 (`getGroupColor(group, uniqueGroups)`)。当用户选择 `'sentiment'` 时，图例应显示一个从负面到正面的连续色带。
-   **交互行为**：常见的交互是点击图例项，实现切换显示特定类别的人物或边。

#### 4. 控制项（Controls）

该模块虽然不直接渲染所有 UI 控件，但其交互逻辑依赖于多个 `storyStore` 中的状态，构成了强大的交互控制体系。

-   **筛选与上下文联动**：
    -   **事件流**：用户在场景选择器或章节选择器（外部组件）中选择后 → `sceneHover` 或 `chapterHover` 状态更新 → `CharacterNetwork` 组件重新计算 `cur_scene` 和 `prevScenes` → 过滤出该场景/章节内的人物和关系 → 网络图重绘。
    -   **效果**：实现了“时间”维度的筛选，每次只显示一个叙事切片的人物关系。
-   **缩放与平移**：
    -   **实现**：通过 `useRef` 存储 `d3.

---

### `components/Vis/LocationChart.tsx`

**分析侧重**：地点图表：坐标映射、标注、颜色编码

好的，作为一名专业的前端可视化工程师，我将对 `components/Vis/LocationChart.tsx` 文件进行分析。

### 1. 模块职责
该文件定义了一个名为 `LocationChart` 的React组件。它的核心职责是在叙事可视化系统（HumanVIZ）中，**以水平条形图的形式，展示特定场景或章节下所有地点（Location）的出现频次**。它通过直观的条形长度对比，帮助用户快速理解不同地点在该叙事片段中的重要性或活跃程度。

### 2. 丝带区域（Ribbon）
**不涉及。** 当前代码实现的是传统的水平条形图，没有使用SVG路径或丝带（Ribbon）这种视觉元素。条形图是通过CSS `div` 元素和 `width` 百分比来实现的。

### 3. 图例（Legend）
**不涉及。** 当前代码中，每个地点条形的颜色是固定的 (`backgroundColor: "#000"`，黑色)，没有使用颜色映射，因此没有定义图例。标签直接显示在地点名称旁边，未使用独立图例容器。

### 4. 控制项（Controls）
本组件提供的用户交互控制项相对基础，主要体现在鼠标悬停（Hover）上：
- **悬停高亮（Hover）**：
    - **事件源**：`<div className="loc-label">` 元素。
    - **事件流**：
        1. 用户鼠标移入地点标签，触发 `onMouseEnter` 事件。
        2. 调用 `storyStore()` 中的 `setLocationHover(location)` 动作，将当前悬停的地名写入全局状态。
        3. 用户鼠标移出标签，触发 `onMouseLeave` 事件。
        4. 调用 `setLocationHover("")` 清空状态。
    - **效果**：该动作会响应式地更新其他依赖此状态的组件（如地图上的地点标记或数据面板），实现跨视图的联动高亮。

### 5. 关键接口/Props
- **外部 Props**：
    - `inSidebar` (可选): `boolean` 类型。用于标识该图表是否渲染在侧边栏中，从而影响数据筛选逻辑（详见下方 `dataStore` 的使用）。
- **内部状态依赖 (Store)**：
    - `dataStore`:
        - `scene_data`: 场景数据数组，用于根据场景名称查找具体场景。
        - `location_data`: 地点元数据数组，用于获取地点的 `emoji` 图标。
        - `chapter_data`: 章节数据数组，用于在特定视图下根据章节查找场景。
    - `storyStore`:
        - `sceneHover`: 当前悬停的场景名称。
        - `chapterHover`: 当前悬停的章节名称。
        - `detailView`: 布尔值，表示是否处于详情视图。
        - `chapterView`: 布尔值，表示是否处于章节视图。
        - `setLocationHover`: 更新当前悬停地名的函数。

### 6. 扩展建议
基于现有代码结构，以下是两个可行的扩展切入点：

**1. 引入颜色编码与图例**
当前所有条形颜色固定，当地点类型或重要性需要区分时，信息传达力不足。可以进行如下扩展：
- **颜色映射**：在 `location_data` 中增加 `category: '室内' | '室外'` 或 `importance: number` 等字段。在 `barStyle` 计算中，根据 `location` 从 `location_data` 中查找其属性，并使用一个 `colorMap` 对象来动态设置 `backgroundColor`。
- **图例生成**：在图表下方或侧边增加一个图例组件，遍历 `

---

## 5. 坐标轴

### `components/XAxis/XAxis.tsx`

**分析侧重**：X 轴刻度、时间/场次标签、控制项联动

好的，作为一位专业的前端可视化工程师，我将为您分析 `components/XAxis/XAxis.tsx` 文件在 HumanVIZ 系统中的职责与实现细节。

---

### 模块职责

该 `XAxis` 组件是 **叙事可视化系统的核心坐标轴组件**，主要负责渲染 **X 轴的时间/叙事进度标尺**。

-   **时间维度映射**：它将“场次（Scene）”这一离散的叙事单元映射到水平坐标轴上，直观地展示叙事的推进过程。
-   **章节与场次标签**：根据 `chapterDivisions`（章节划分）和 `scenes`（场次列表）数据，在 X 轴上生成对应的章节标题和场次序号标签，帮助用户理解故事结构。
-   **控制项联动**：紧密依赖全局状态（`storyStore` 和 `dataStore`），根据用户的选择（如高亮章节、缩放视图、切换模式）动态更新 X 轴的显示范围和标签样式，是用户交互和视觉反馈的关键桥梁。

---

### X 轴刻度与场次标签

1.  **刻度生成逻辑**：
    -   **数据源**：从 `dataStore` 获取 `scenes`（所有场次）、`chapterDivisions`（章节在数组中的索引与名称）。
    -   **过滤机制**：根据 `activeChapters`（用户当前选中的章节范围）对 `scenes` 和对应的位置数据（`scenePos`）进行切片（`slice`），仅渲染活跃章节内的场次，实现视图的缩放与聚焦。
    -   **定位依赖**：每个场次刻度的水平位置由 `positionStore` 中的 `scenePos` 数组提供。该组件通过 `activeScenePos` 获取当前可见场次的精确坐标，将每个 `g` 或 `text` 元素平移至对应位置。

2.  **标签类型**：
    -   **章节标签（Chapter Label）**：位于章节起始位置，显示章节名称（如“第一章”）。
    -   **场次标签（Scene Label）**：位于每个场次正下方，通常显示场次序号或自定义名称。

3.  **外观控制**：
    -   **字体权重**：通过 `getFontWeight` 函数，根据当前是否处于对应的交互状态（如 `chapterHover`、`sceneHover`）动态调整字体粗细，实现高亮效果。
    -   **字体大小**：使用 `normalizeFontSize` 函数，根据视图缩放或 `verboseMode`（详细模式）调整文字尺寸，避免拥挤。
    -   **颜色**：基本颜色由 `textColor` 函数或常量控制，高亮颜色则与章节/场次的 hover 状态联动。

---

### 图例（Legend）

*注：分析提供的代码片段未直接涉及图例渲染逻辑。根据上下文推断，图例可能由其他专用组件（如 `Legend.tsx`）处理，或在主组件 `Dashboard` 中作为独立区域。*

**扩展说明（基于系统整体架构推测）：** 系统大概率存在一个独立的 `Legend` 组件，用于解释：
-   **颜色映射**：说明 `colorBy`（如按情感、冲突、重要性着色）字段对应的色带含义。
-   **大小映射**：解释 `sizeBy`（如按角色数量、文本长度缩放）对应的圆圈半径含义。
-   **交互行为**：点击图例项可高亮/过滤特定属性类别的场景或角色。

---

### 控制项联动（Controls）

该组件通过 React Hooks（`useStore`）与全局状态紧密耦合，主要联动的控件及事件流如下：

1.  **章节筛选（Chapter Filter）**：
   

---

### `components/YAxis/YAxisDiv.tsx`

**分析侧重**：Y 轴人物/地点排列、分组标签

好的，作为一名专业的前端可视化工程师，以下是对 `components/YAxis/YAxisDiv.tsx` 文件的分析与技术文档整理。

---

### 模块职责

`YAxisDiv` 是 **Y 轴容器组件**，在整个 HumanVIZ 叙事可视化系统中承担**布局协调与轴类型分发**的核心职责。

-   **布局控制**：负责管理 Y 轴区域的整体高度、宽度、滚动行为（与故事时间线联动），以及根据不同视图模式（全屏、章节视图等）动态调整尺寸。
-   **轴类型分发**：根据 `storyStore` 中的 `yAxis` 状态值（`"location"`、`"character"`、`"importance"`、`"sentiment"` 等），动态渲染不同的子轴组件（`LocationAxis`、`CharacterAxis`、`ColorAxis`）。
-   **滚动同步**：监听 Y 轴容器的滚动事件，并将滚动位置同步到 `storyStore` 的 `storyScroll` 状态，实现 Y 轴与故事时间线（X 轴）的同步滚动。
-   **视图适配**：根据 `fullHeight`（全屏模式）、`chapterView`（章节视图）、`story.includes("-new")`（新叙事模式）等状态，动态计算容器尺寸和字体大小，适配不同展示需求。

**一句话总结：它是 Y 轴的“调度中心”，负责渲染正确的轴类型并管理其与全局视图状态的交互。**

---

### 丝带区域（Ribbon）

该文件中 **没有直接涉及丝带区域** 的绘制逻辑。丝带区域（Ribbon）通常由 `ColorAxis` 组件内部实现，该组件仅在 `yAxis` 为 `"importance"`、`"sentiment"`、自定义颜色轴或堆叠轴时被渲染。若需了解丝带细节，需查看 `ColorAxis.tsx` 文件。

---

### 图例（Legend）

该文件中 **没有直接包含图例的渲染逻辑**。图例通常由独立的图例组件（如 `Legend.tsx`）实现，或由 `ColorAxis` 内部集成。此文件仅通过条件渲染决定显示哪个轴组件，不负责图例的构成与交互。

---

### 控制项（Controls）

该文件暴露了一个**隐式、必需的用户操作控件**：**Y 轴滚动条**。

-   **控件类型**：原生 HTML 滚动条（通过 `overflow` 属性隐式生效）。
-   **交互行为**：
    1.  **用户滚动** Y 轴容器（`#y-axis-div`）。
    2.  `onScroll` 事件触发，调用 `handleScroll` 函数。
    3.  `handleScroll` 将滚动位置写入 `storyStore.setStoryScroll(scroll)`。
    4.  **相关性**：`storyScroll` 状态的变化会同步驱动故事时间线（X 轴）的滚动（需查看 `storyStore` 及相关 X 轴组件的实现），实现 Y 轴与 X 轴的“同步滚动”效果。
-   **程序化滚动**：通过 `useEffect` 监听 `storyScroll` 状态变化，并使用 `elem.scrollTo({ top: storyScroll })` 实现外部对滚动位置的程序化控制（例如来自故事导航或时间轴跳转的触发）。

**事件流总结**：
用户滚动 Y 轴 → `onScroll` → `setStoryScroll(scroll)` → 同步更新 Store → 触发其他组件（如 X 轴）响应。

---

### 关键接口 / Props

该组件是一个 **无 Props 函数组件**，其所有输入均通过 React 外部状态库（`zustand`）的 Store 注入

---

## 6. 工具函数

### `utils/colors.ts`

**分析侧重**：颜色映射规则、图例颜色定义、主题色板

好的，作为一位专业的前端可视化工程师，我将为您分析 `utils/colors.ts` 文件，并按照您的要求整理成技术文档。

---

### 1. 模块职责

该文件是 **HumanVIZ** 系统中的 **颜色引擎与色彩映射中心**。它的核心职责是：

*   **定义主题色板**：生成并导出用于不同数据维度（如情感、冲突、重要性）的连续或离散色彩映射。
*   **提供颜色映射函数**：为系统其他模块（如角色节点、丝带、图例）提供根据数值获取对应颜色的函数。
*   **管理颜色配置**：定义默认的角色颜色方案选项、颜色分段值，并导出用于计算文本对比色的辅助函数，确保可读性。
*   **统一色彩规范**：集成了 `d3-scale`、`chroma-js` 和 `d3-interpolate` 等多个颜色库，为整个项目提供了一个统一的颜色生成与转换接口。

---

### 2. 丝带区域（Ribbon）

根据提供的代码片段，**该文件并未直接涉及丝带（Ribbon）区域**。

文件中没有与“丝带”相关的数据绑定、SVG 路径生成或透明度控制的描述。丝带的绘制逻辑很可能在其他的视图文件（如 `views/RibbonView.tsx` 或 `components/Ribbon.tsx`）中实现。

---

### 3. 图例（Legend）

**该文件不直接定义图例的 UI 组件**，但为图例的构建提供了**核心数据支撑**。

#### 构成要素与颜色映射关联
*   **颜色分段点**：`color_dict` 对象是图例绘制所需的关键数据。它按维度（如 `sentiment`, `conflict`, `importance`）存储了对应的颜色尺度的等间距采样点（共5个）。

    ```typescript
    export const color_dict = {
      length: length_increments,
      importance: importance_increments,
      conflict: conflict_increments,
      sentiment: emotion_increments,
      numChars: numChars_increments,
    } as { [key: string]: number[] };
    ```
    例如，`emotion_increments` 会生成 `[-1, -0.5, 0, 0.5, 1]` 这样的数组。图例组件可以遍历这个数组，利用 `emotionColor` 函数获取每个数值对应的颜色，从而绘制出一条连续渐变的颜色条。

*   **图例项**：文件本身没有定义图例项的标签文本，图例组件的文字标签（如“High Importance”、“Low Sentiment”）需要在图例组件内部根据数据维度 `key` 进行映射。

#### 交互行为
*   该文件**未定义任何交互逻辑**，仅提供颜色数据。交互行为（如点击图例切换筛选、悬停高亮等）需要由图例组件自身的事件监听和状态管理（如 Store）来处理。

---

### 4. 控制项（Controls）

**该文件不涉及任何用户交互控件**。

文件中没有定义或导出与筛选、缩放、高亮等操作相关的函数或事件。所有的控件逻辑应存在于其他专门处理交互的模块中。

---

### 5. 关键接口 / Props

该文件是一个纯工具函数库，**不接受 Props，也没有依赖任何 Store**。它对外暴露的主要是该模块内部定义的颜色映射函数和常量。

#### 核心导出接口

| 导出名称 | 类型 | 描述 |
| :--- | :--- | :--- |
| `defaultCharacterColors` | `string[]` | 预设的角色颜色方案名称列表 (`"default"`, `"llm"`, `"group"` 等

---

### `utils/helpers.ts`

**分析侧重**：数据格式化、坐标计算、通用辅助函数

好的，作为一名专业的前端可视化工程师，我将对您提供的 `utils/helpers.ts` 文件进行分析，并按照您的要求整理成技术文档。

---

### HumanVIZ 技术文档 - `utils/helpers.ts`

#### 1. 模块职责

该文件 (`helpers.ts`) 是整个 HumanVIZ 可视化系统的**数据格式化和辅助函数库**。它不直接参与 DOM 渲染或图形绘制，而是为可视化组件（如丝带、图例、控制面板）提供纯计算逻辑支持。其主要职责包括：

- **数据归一化**: 将原始数据从任意范围映射到目标范围（如 0-1），这是许多视觉编码（如大小、颜色、透明度）的基础。
- **视觉属性映射**: 将归一化后的数据值转换为具体的视觉样式属性，例如字体、字号、字重。
- **布局与度量计算**: 提供计算字符宽度的映射表，为文本布局和坐标计算提供基础数据。

该文件是连接**原始数据**与**可视化编码**的桥梁，确保了系统中视觉元素的计算逻辑集中、可维护且可测试。

#### 2. 丝带区域（Ribbon）

**不涉及。** 该文件专注于数据转换和文本样式计算，没有关于 SVG 路径生成、丝带的数据绑定或颜色/透明度控制的逻辑。所有函数返回的是简单的数值或字符串，并非 SVG 元素或路径描述。

#### 3. 图例（Legend）

**不涉及。** 文件中未包含与图例相关的任何函数或逻辑（例如，生成颜色梯度、创建图例项、处理交互等）。

#### 4. 控制项（Controls）

**不涉及。** 文件中没有定义任何用户交互逻辑（如筛选、缩放、高亮）或事件流处理。它是一个纯数据的计算模块。

#### 5. 关键接口/Props

该文件主要导出一系列纯函数作为模块的公共接口。它不依赖任何 Props (`React` 组件概念) 或全局 Store，而是接收具体参数并返回计算结果。

对外暴露的关键函数如下：

| 函数名 | 输入参数 | 输出 | 用途说明 |
| :--- | :--- | :--- | :--- |
| `capitalize` | `s: string` | `string` | 将字符串首字母大写。 |
| `normalize` | `value, min, max, newMin, newMax: number` | `number` | 通用线性插值/归一化函数。 |
| `normalizeRating` | `rating: number` | `number` | 将 [-1, 1] 区间的评分映射到 [0, 1]，用于颜色或透明度编码。 |
| `normalizeMarkerSize` | `value: number` | `number` | 将原始数据（范围 0 到 `character_height`）映射到 [1, 14] 的像素大小范围。 |
| `normalizeFontSize` | `value: number` | `number` | 将 [0, 1] 区间映射到 [0.5, 1.2] 的字体缩放系数。 |
| `normalizeTextOffset` | `value: number` | `number` | 将 [0, 1] 区间映射到 [1, 2.2] 的文本偏移系数。 |
| `normalizeImportance` | `value: number, num_chars: number` | `number` | 基于角色数量，将“重要性”值归一化到 [0, 1]。 |
| `getFontFamily` | `value: number` | `string` | 根据归一化值（0-1）返回对应的 CSS `font-family` (`inherit`, `Shantell Sans

---

# 前端梳理综合总结

好的，作为一名资深前端架构师，我已根据您提供的全文件分析摘要，对 HumanVIZ 叙事可视化系统进行了一次全面的“架构体检”。以下是梳理总结报告。

---

## HumanVIZ 叙事可视化系统 - 前端梳理总结报告

### 一、系统架构概述

HumanVIZ 是一个基于 **React** 技术栈构建的、专注于叙事结构可视化的单页应用 (SPA)。其整体技术栈与分层架构清晰，遵循了现代前端工程化的最佳实践。

**技术栈核心：**

-   **UI 框架**：`React 18` + TypeScript
-   **状态管理**：`Zustand` (轻量级、无样板代码)
-   **可视化引擎**：`D3.js` (用于力导向图、坐标计算) + 原生 SVG
-   **UI 组件库**：`Mantine` (提供统一的主题、样式和基础 UI 元素)
-   **构建与路由**：`Vite` + `React Router` (页面级切换)
-   **后端通信**：`Axios` (封装为 `server.ts` 服务层)

**分层架构 (从外到内)：**

1.  **入口层 (`main.tsx`)**: 应用启动点，挂载根组件，配置全局 Provider (Mantine) 和路由。
2.  **布局与页面层 (`App.tsx`)**: 定义顶层布局结构 (Header, Main)，根据 Store 状态切换视图模式 (概览/章节/详情)。
3.  **可视化组件层 (`components/Vis/`)**: 核心渲染模块，包括主绘图区、关系网络图、地点图表等，负责所有 SVG/D3 的逻辑。
4.  **状态管理层 (`stores/`)**: 系统的“数据中心”，使用 Zustand 构建，管理数据、视觉配置、位置计算等全局状态。
5.  **工具与工具层 (`utils/`)**: 提供通用的颜色映射、数据格式化、坐标计算等纯函数。
6.  **服务层 (`server.ts`)**: 封装 Axios，作为前端与 FastAPI 后端的通信桥梁。

**核心数据流：**
用户交互 (点击/选择) → `storyStore`/`positionStore` (状态更新) → 可视化组件 (React 重渲染) → SVG 更新 → 用户看到变化。

### 二、核心模块功能地图

| 模块分类 | 文件名 (核心) | 核心职责 | 关键特质 |
| :--- | :--- | :--- | :--- |
| **应用入口** | `main.tsx` | 应用挂载、全局 Provider 注入、路由基础配置 | Mantine 主题初始化 |
| **顶层布局** | `App.tsx` | 整体布局骨架、视图模式切换 (故事/章节/详情) | 依赖 `storyStore` 驱动布局变化 |
| **核心状态** | `stores/storyStore.ts` | 叙事视图状态管理 (章节、高亮、图例、控制项) | **交互和行为的中枢** |
| **数据状态** | `stores/dataStore.ts` | 原始数据加载、标准化、缓存与选择 | **数据的源头和仓库** |
| **位置状态** | `stores/positionStore.ts` | 所有视觉元素 (场景、角色) 的坐标计算与状态管理 | **可视化的“骨架”和“坐标系”** |
| **可视化容器** | `components/Vis/StoryVis.tsx` | SVG 画布容器，协调尺寸、滚动、视图模式 | 负责组装和协调所有子可视化组件 |
| **主绘图区** | `components/Vis/MainPlot.tsx` | 场景矩形、丝带 (Ribbon) 容器、角色路径筛选 | 核心叙事内容的视觉呈现 |
| **关系网络图** | `components/Vis/CharacterNetwork.tsx` | 力导向布局的节点/边渲染、交互 (拖拽、悬停) | 基于 D3.js 的独立复杂可视化 |
| **地点图表** | `components/Vis/LocationChart.tsx` | 水平条形图，展示地点出现频次 | 独立使用 CSS 实现，非 SVG 丝带 |
| **X 轴** | `components/XAxis/XAxis.tsx` | 时间/场次标尺、章节标签、与缩放组件联动 | 与 `storyStore` 中的视图状态紧密耦合 |
| **Y 轴** | `components/YAxis/YAxisDiv.tsx` | 轴类型调度 (角色/地点/情感)、布局协调与滚动 | 根据 `storyStore.yAxis` 动态切换子轴组件 |
| **颜色引擎** | `utils/colors.ts` | 定义色板、提供颜色映射函数 (情感/重要性) | 集成 `d3-scale` 和 `chroma-js`，统一色彩规范 |
| **辅助工具** | `utils/helpers.ts` | 数据归一化、视觉属性映射、布局与度量计算 | 纯函数，提供通用计算逻辑 |
| **服务层** | `server.ts` | API 接口封装、与后端 (FastAPI) 通信 | 异步函数，承担“桥梁”角色 |

### 三、关键可视化机制说明

#### 3.1 丝带区域 (Ribbon) 的实现原理与数据流

丝带是可视化故事时间线中角色参与度的核心视觉元素，其实现原理如下：

1.  **数据与布局准备**:
    -   `dataStore` 提供标准化后的 `Scene[]`、`CharacterData[]` 和 `Events[]`。
    -   `positionStore` 提前计算好所有元素的位置，包括每个场景矩形的 `(x, y, width, height)` 和每个角色在 Y 轴上的坐标 `yPos`。这是所有后续绘制的“蓝图”。

2.  **组件协作与路径生成**:
    -   `StoryVis.tsx` 作为画布容器，将 `positionStore` 中的位置数据传递给 `MainPlot.tsx`。
    -   `MainPlot.tsx` 根据 `storyStore` 的过滤条件 (如 `yAxis` 类型、高亮章节) 筛选出需要绘制的角色路径数据 (`characterPaths`)。
    -   每个角色路径是一个包含该角色所有参与场景的事件序列。
    -   `MainPlot` (或其子组件 `Ribbon.tsx`) 将 `characterPaths` 转换为 SVG `<path>` 元素的 `d` 属性。路径的 X 轴由场景位置决定，Y 轴由角色 Y 坐标决定，形成一条条在场景间流动的“丝带”。

3.  **交互与视觉编码**:
    -   丝带的**颜色**根据 `utils/colors.ts` 的映射规则计算，可以是按角色固定颜色、按情感 (Sentiment) 渐变、或按冲突 (Conflict) 渐变。
    -   丝带的**宽度**或**透明度**可能映射
