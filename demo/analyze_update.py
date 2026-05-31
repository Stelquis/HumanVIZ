#!/usr/bin/env python3
"""
HumanVIZ 前端架构分析工具 v2
梳理 React 组件树、Zustand 状态管理、D3.js 可视化渲染机制
新增：可视化修改指南 —— 告诉你改哪里、怎么改、怎么不踩坑
"""
import requests
import os
import json
from datetime import datetime
from typing import Dict, List, Optional, Tuple

API_KEY = "sk-ccb46e17cc974f12b2cded9736ae1b72"
BASE_URL = "https://api.deepseek.com/v1"
MODEL = "deepseek-chat"

PROJECT_ROOT = "/workspace/HumanVIZ/src"

# 分类文件以便系统化分析
ANALYSIS_CATEGORIES = {
    "核心应用入口": ["main.tsx", "App.tsx", "server.ts"],
    "状态管理": [
        "stores/storyStore.ts",
        "stores/dataStore.ts",
        "stores/positionStore.ts"
    ],
    "可视化组件": [
        "components/Vis/StoryVis.tsx",
        "components/Vis/MainPlot.tsx",
        "components/Vis/CharacterNetwork.tsx",
        "components/Vis/LocationChart.tsx"
    ],
    "UI控制组件": [
        "components/XAxis/XAxis.tsx",
        "components/YAxis/YAxisDiv.tsx"
    ],
    "工具函数": [
        "utils/colors.ts",
        "utils/helpers.ts"
    ]
}

# ─────────────────────────────────────────────────────────────────────────────
# 新增：可视化修改场景映射表
# key   = 用户想改的内容（自然语言描述）
# value = 对应需要改动的文件 + 修改策略
# ─────────────────────────────────────────────────────────────────────────────
MODIFICATION_SCENARIOS = {
    "修改颜色/配色方案": {
        "primary_files": ["utils/colors.ts"],
        "secondary_files": [
            "components/Vis/MainPlot.tsx",
            "components/Vis/CharacterNetwork.tsx"
        ],
        "risk": "低",
        "strategy": "只改 colors.ts，组件通过函数引用颜色，不需要改组件本体",
        "safe_pattern": "修改 Chroma.js 色阶定义，或替换颜色映射函数返回值"
    },
    "修改丝带路径/形状": {
        "primary_files": ["components/Vis/MainPlot.tsx"],
        "secondary_files": ["utils/helpers.ts"],
        "risk": "中",
        "strategy": "只改 MainPlot.tsx 中的 D3 路径生成器参数，不动数据绑定逻辑",
        "safe_pattern": "修改 d3.line/area/ribbon 的 curve 类型或插值参数"
    },
    "修改角色网络图布局": {
        "primary_files": ["components/Vis/CharacterNetwork.tsx"],
        "secondary_files": [],
        "risk": "中",
        "strategy": "修改 D3 force simulation 参数，保持节点数据结构不变",
        "safe_pattern": "调整 forceLink.distance / forceManyBody.strength / forceCenter 参数"
    },
    "修改坐标轴样式": {
        "primary_files": [
            "components/XAxis/XAxis.tsx",
            "components/YAxis/YAxisDiv.tsx"
        ],
        "secondary_files": [],
        "risk": "低",
        "strategy": "这两个组件相对独立，修改不影响数据逻辑",
        "safe_pattern": "修改 tickFormat、tickSize、轴标签 CSS"
    },
    "新增一种可视化图表": {
        "primary_files": ["components/Vis/StoryVis.tsx"],
        "secondary_files": [
            "stores/dataStore.ts",
            "stores/storyStore.ts"
        ],
        "risk": "高",
        "strategy": "新建独立组件文件，在 StoryVis.tsx 中条件渲染，不改现有组件",
        "safe_pattern": "新建 components/Vis/MyNewChart.tsx，在 StoryVis 中用 {showNew && <MyNewChart />} 挂载"
    },
    "修改动画/过渡效果": {
        "primary_files": [
            "components/Vis/MainPlot.tsx",
            "components/Vis/CharacterNetwork.tsx"
        ],
        "secondary_files": [],
        "risk": "低",
        "strategy": "只改 D3 transition().duration() 参数，或 CSS transition 属性",
        "safe_pattern": "搜索 .transition() 或 transition: 关键字定位动画代码"
    },
    "修改数据处理/过滤逻辑": {
        "primary_files": ["stores/dataStore.ts"],
        "secondary_files": ["utils/helpers.ts"],
        "risk": "高",
        "strategy": "dataStore 被多个组件订阅，改动会全局影响，必须先理清订阅关系",
        "safe_pattern": "在 helpers.ts 中新增纯函数处理，dataStore action 调用新函数，保持 state shape 不变"
    },
    "修改布局/尺寸": {
        "primary_files": ["App.tsx"],
        "secondary_files": [
            "components/Vis/StoryVis.tsx",
            "components/XAxis/XAxis.tsx"
        ],
        "risk": "中",
        "strategy": "App.tsx 控制整体布局，修改 flex/grid 属性；各子组件尺寸通过 props 传入",
        "safe_pattern": "修改 App.tsx 中容器的 width/height，确保子组件 props 中的尺寸同步更新"
    }
}


class HumanVIZAnalyzer:
    def __init__(self):
        self.file_contents = {}
        self.analysis_results = {}

    def read_file(self, filepath: str) -> Optional[str]:
        """读取文件内容"""
        full_path = os.path.join(PROJECT_ROOT, filepath)
        if not os.path.exists(full_path):
            print(f"  ⚠️  文件不存在: {filepath}")
            return None
        try:
            with open(full_path, 'r', encoding='utf-8') as f:
                content = f.read(5000)
                self.file_contents[filepath] = content
                return content
        except Exception as e:
            print(f"  ❌ 读取失败: {filepath} - {e}")
            return None

    def load_all_files(self) -> Dict[str, str]:
        """加载所有需要分析的文件"""
        print("\n📂 加载文件...")
        for category, files in ANALYSIS_CATEGORIES.items():
            print(f"\n  [{category}]")
            for filepath in files:
                print(f"    📄 {filepath}", end="")
                content = self.read_file(filepath)
                if content:
                    print(f" ✅ ({len(content)} 字符)")
                else:
                    print(" ❌")
        return self.file_contents

    # ─────────────────────────────────────────────────────────────────────────
    # 新增：核心方法 —— 分析修改策略
    # ─────────────────────────────────────────────────────────────────────────

    def analyze_modification_guide(self) -> str:
        """
        【新增】分析前端可视化修改指南
        让 AI 结合真实代码，给出每种改动场景的具体修改方案
        """
        print("🛠️  生成可视化修改指南（新增模块）...")

        # 把场景表和实际代码都喂给 AI
        vis_files = {
            name: self.file_contents.get(name, "【文件未找到】")
            for name in ANALYSIS_CATEGORIES["可视化组件"]
        }
        store_files = {
            name: self.file_contents.get(name, "【文件未找到】")
            for name in ANALYSIS_CATEGORIES["状态管理"]
        }
        util_files = {
            name: self.file_contents.get(name, "【文件未找到】")
            for name in ANALYSIS_CATEGORIES["工具函数"]
        }

        scenarios_json = json.dumps(MODIFICATION_SCENARIOS, indent=2, ensure_ascii=False)

        prompt = f"""你是一位资深前端架构师，正在帮助开发者安全地修改 HumanVIZ 可视化项目。

以下是项目真实代码（部分截取）：

【可视化组件代码】
{json.dumps(vis_files, indent=2, ensure_ascii=False)[:4000]}

【状态管理代码】
{json.dumps(store_files, indent=2, ensure_ascii=False)[:2000]}

【工具函数代码】
{json.dumps(util_files, indent=2, ensure_ascii=False)[:1500]}

以下是预定义的修改场景：
{scenarios_json}

请针对每一个修改场景，结合真实代码内容，生成详细的修改指南，每个场景包含：

1. **要改哪个文件**（精确到文件路径）
2. **要改哪个函数/代码块**（定位到具体函数名或代码行特征）
3. **修改前后的代码对比示例**（伪代码或真实代码均可）
4. **哪些地方绝对不能动**（防止破坏现有逻辑的红线）
5. **修改完如何验证**（简单的自测方法）

格式要求：
- 使用 Markdown，每个场景用 `###` 标题
- 代码示例用 ```typescript 代码块
- 危险操作用 ⚠️ 标注
- 安全操作用 ✅ 标注
- 风险等级用 emoji 标注：🟢低风险 🟡中风险 🔴高风险

请直接开始输出各场景的修改指南，不需要介绍语。"""

        return self._call_api(prompt, max_tokens=3000)

    def analyze_safe_extension_pattern(self) -> str:
        """
        【新增】分析如何扩展而不影响原代码的通用模式
        """
        print("🔒 分析安全扩展模式（新增模块）...")

        app_content = self.file_contents.get("App.tsx", "【未找到】")
        story_vis_content = self.file_contents.get(
            "components/Vis/StoryVis.tsx", "【未找到】"
        )
        store_content = self.file_contents.get("stores/storyStore.ts", "【未找到】")

        prompt = f"""基于以下 HumanVIZ 代码，总结"安全扩展前端可视化"的通用设计模式。

App.tsx:
{app_content[:1500]}

StoryVis.tsx（可视化管理器）:
{story_vis_content[:2000]}

storyStore.ts（状态管理）:
{store_content[:1500]}

请输出以下内容：

### 一、新增组件的标准模板
给出一个完整的、可直接复制使用的新可视化组件模板代码（TypeScript + React + D3），
包含：
- Props 接口定义
- Zustand store 订阅写法
- useEffect + D3 渲染骨架
- cleanup 函数防止内存泄漏
- 条件渲染守卫

### 二、向 StoryVis 注册新组件的标准流程
结合 StoryVis.tsx 真实代码，给出在哪里加、怎么加、注意什么。

### 三、向 Store 新增状态而不破坏现有订阅的方法
结合 storyStore.ts 真实代码，给出：
- 如何 append 新字段而不改现有字段
- 如何新增 action 而不影响现有 action
- 组件选择性订阅（避免不必要的重渲染）的写法

### 四、开发调试建议
- 推荐的热更新调试工作流
- 如何用 React DevTools 验证状态变化
- 如何用 D3 Inspector 调试路径坐标

全部用 Markdown + TypeScript 代码块输出，代码要可以直接运行。"""

        return self._call_api(prompt, max_tokens=3000)

    def analyze_risk_checklist(self) -> str:
        """
        【新增】生成修改前的风险检查清单
        """
        print("✅ 生成修改风险检查清单（新增模块）...")

        all_files_summary = {
            cat: files for cat, files in ANALYSIS_CATEGORIES.items()
        }

        prompt = f"""为 HumanVIZ 前端项目生成一份"修改前必做风险检查清单"。

项目文件结构:
{json.dumps(all_files_summary, indent=2, ensure_ascii=False)}

已知技术栈: React + TypeScript + Zustand + D3.js + Chroma.js

请按以下结构输出：

### 修改前 —— 5分钟快速检查清单

**① 文件依赖检查**
- 列出哪些文件被多个组件引用（改动影响面最广）
- 给出快速查看依赖的命令（grep 命令）

**② 状态依赖检查**
- 哪些 Store 字段被多个组件订阅（改 Store 风险最高）
- 给出查找订阅关系的 grep 命令

**③ D3 副作用检查**
- 修改 D3 渲染函数前，需要确认哪些 cleanup 逻辑
- 内存泄漏的常见来源

**④ TypeScript 类型检查**
- 修改数据结构前，如何用 tsc 提前发现类型错误
- 推荐的 tsconfig 检查命令

**⑤ 修改后验证清单**
- 功能验证步骤（5条，按优先级排列）
- 性能验证（大数据量下的渲染帧率）
- 视觉回归检查

每个检查项用 `- [ ]` 格式输出（Markdown checklist）。
代码命令用 ```bash 代码块。"""

        return self._call_api(prompt, max_tokens=2000)

    # ─────────────────────────────────────────────────────────────────────────
    # 原有方法（保持不变）
    # ─────────────────────────────────────────────────────────────────────────

    def analyze_component_tree(self) -> str:
        """分析 React 组件树结构"""
        print("\n🌳 分析 React 组件树...")

        app_files = {
            "main.tsx": self.file_contents.get("main.tsx", ""),
            "App.tsx": self.file_contents.get("App.tsx", ""),
        }
        vis_files = {
            name: self.file_contents.get(name, "")
            for name in ANALYSIS_CATEGORIES["可视化组件"]
            if name in self.file_contents
        }
        ui_files = {
            name: self.file_contents.get(name, "")
            for name in ANALYSIS_CATEGORIES["UI控制组件"]
            if name in self.file_contents
        }

        prompt = f"""作为前端架构专家，请分析 HumanVIZ 项目的 React 组件树结构。

应用入口文件:
{json.dumps(app_files, indent=2, ensure_ascii=False)[:2000]}

可视化组件:
{json.dumps(vis_files, indent=2, ensure_ascii=False)[:3000]}

UI控制组件:
{json.dumps(ui_files, indent=2, ensure_ascii=False)[:1000]}

请从以下角度分析：
1. **组件树结构图**：用树形文本图展示完整的组件嵌套关系
2. **主要布局组件**：主布局、丝带面板、控制面板的构成
3. **组件职责分工**：每个组件的核心功能
4. **组件间层级关系**：父子组件、兄弟组件关系
5. **关键 Props 传递**：哪些 props 在哪些组件间传递

请用 Markdown 格式输出，包含清晰的树形图。"""

        return self._call_api(prompt)

    def analyze_state_management(self) -> str:
        """分析 Zustand 状态管理机制"""
        print("🔄 分析 Zustand 状态管理...")

        store_contents = {}
        for filepath in ANALYSIS_CATEGORIES["状态管理"]:
            if filepath in self.file_contents:
                store_name = filepath.split("/")[-1].replace(".ts", "")
                store_contents[store_name] = self.file_contents[filepath]

        prompt = f"""分析 HumanVIZ 项目的 Zustand 状态管理架构。

Store 定义:
{json.dumps(store_contents, indent=2, ensure_ascii=False)[:4000]}

请分析：
1. **状态切片设计**：每个 Store 管理的状态字段及其用途
2. **数据流向**：指出数据如何从 Store 流向组件的完整路径
3. **Actions 分析**：列出主要的 action 函数及其触发时机
4. **Store 间依赖关系**：哪些 Store 相互引用或依赖
5. **订阅模式**：组件如何订阅和使用这些状态
6. **状态更新流程**：从用户操作到状态更新的完整链路

请用 Markdown 格式输出，可用流程图表示数据流向。"""

        return self._call_api(prompt)

    def analyze_d3_rendering(self) -> str:
        """分析 D3.js 可视化渲染机制"""
        print("📊 分析 D3.js 渲染机制...")

        vis_files = {}
        for filepath in ANALYSIS_CATEGORIES["可视化组件"]:
            if filepath in self.file_contents:
                component_name = filepath.split("/")[-1].replace(".tsx", "")
                vis_files[component_name] = self.file_contents[filepath]

        color_file = self.file_contents.get("utils/colors.ts", "")
        helper_file = self.file_contents.get("utils/helpers.ts", "")

        prompt = f"""深入分析 HumanVIZ 的 D3.js 可视化实现机制。

可视化组件:
{json.dumps(vis_files, indent=2, ensure_ascii=False)[:4000]}

颜色映射工具 (Chroma.js):
{color_file[:1000]}

辅助工具:
{helper_file[:1000]}

请详细分析：
1. **数据绑定流程**：从数据获取到 D3 绑定的完整过程
2. **比例尺设定**：各比例尺的 domain 和 range 设置，如何动态调整
3. **颜色映射**：Chroma.js 色阶方案及图例生成逻辑
4. **丝带路径生成**：路径生成器类型、坐标计算逻辑、参数控制
5. **动画与交互**：过渡动画实现、鼠标交互事件、缩放平移
6. **坐标轴系统**：X/Y 轴配置、刻度线和标签

请结合代码段解释，用 Markdown 格式输出。"""

        return self._call_api(prompt)

    def generate_final_summary(self) -> str:
        """生成整体架构总结"""
        print("📝 生成架构总结...")

        prompt = f"""基于 HumanVIZ 项目的代码分析，生成全面的前端架构总结。

项目结构概览:
- 应用入口: main.tsx, App.tsx
- 状态管理: 3个 Zustand stores (storyStore, dataStore, positionStore)
- 可视化组件: StoryVis, MainPlot, CharacterNetwork, LocationChart
- UI组件: XAxis, YAxisDiv
- 工具: colors.ts (Chroma.js), helpers.ts

请总结：
1. **架构优势**：当前设计的优点
2. **技术栈整合**：React + Zustand + D3.js + TypeScript 的整合方式
3. **可扩展性**：当前架构支持哪些扩展方向
4. **组件复用性**：哪些组件可以直接复用
5. **性能考虑**：大数据量下的渲染策略
6. **后续开发建议**：基于当前架构的最佳实践建议"""

        return self._call_api(prompt)

    def generate_component_diagram(self) -> str:
        """生成组件关系 Mermaid 图"""
        print("📐 生成组件关系图...")

        prompt = """根据 HumanVIZ 项目的组件结构，生成 Mermaid 格式的组件关系图。

已知组件：
- App (主布局)
  - StoryVis (可视化管理器)
    - MainPlot (主图表/丝带图)
    - CharacterNetwork (角色网络图)
    - LocationChart (地点图表)
  - XAxis (X轴控制)
  - YAxisDiv (Y轴控制面板)

Zustand Stores:
- storyStore
- dataStore
- positionStore

请生成：
1. 组件层级关系的 Mermaid 图
2. 数据流关系的 Mermaid 图（Store -> 组件）
3. 可视化渲染流程的 Mermaid 图

使用 ```mermaid 代码块格式。"""

        return self._call_api(prompt)

    def _call_api(self, prompt: str, max_tokens: int = 2000) -> str:
        """调用 DeepSeek API"""
        try:
            response = requests.post(
                f"{BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": MODEL,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "你是前端架构分析专家，擅长分析 React、TypeScript、D3.js 项目。"
                                "请用中文详细分析，输出 Markdown 格式。"
                                "代码示例必须使用 TypeScript，并标注注释说明修改意图。"
                            )
                        },
                        {"role": "user", "content": prompt}
                    ],
                    "max_tokens": max_tokens,
                    "temperature": 0.3
                },
                timeout=60
            )

            if response.status_code == 200:
                return response.json()['choices'][0]['message']['content']
            else:
                return f"❌ API调用失败 ({response.status_code}): {response.text}"
        except Exception as e:
            return f"❌ 请求异常: {str(e)}"

    # ─────────────────────────────────────────────────────────────────────────
    # 报告组装（新增三个章节）
    # ─────────────────────────────────────────────────────────────────────────

    def generate_report(self) -> str:
        """生成完整的分析报告（含修改指南）"""
        print("\n" + "=" * 70)
        print("🚀 开始生成 HumanVIZ 前端架构分析报告 v2")
        print("=" * 70)

        # 阶段1：加载文件
        self.load_all_files()

        # 阶段2：分模块分析
        analyses = {}

        # 原有分析模块
        analyses["component_diagram"]   = self.generate_component_diagram()
        analyses["component_tree"]      = self.analyze_component_tree()
        analyses["state_management"]    = self.analyze_state_management()
        analyses["d3_rendering"]        = self.analyze_d3_rendering()
        analyses["final_summary"]       = self.generate_final_summary()

        # ── 新增分析模块 ──────────────────────────────────────────────────
        analyses["modification_guide"]  = self.analyze_modification_guide()
        analyses["safe_extension"]      = self.analyze_safe_extension_pattern()
        analyses["risk_checklist"]      = self.analyze_risk_checklist()
        # ──────────────────────────────────────────────────────────────────

        # 阶段3：组装报告
        # 生成场景速查表（静态，不需要 API）
        scenario_table = self._build_scenario_table()

        report = f"""# HumanVIZ 前端架构分析报告 v2

> 📅 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
> 🔧 分析工具: DeepSeek API
> 📊 分析文件数: {len(self.file_contents)} 个
> 🆕 新增模块: 可视化修改指南、安全扩展模式、风险检查清单

---

## 📋 目录

**架构分析**
1. [组件关系图](#1-组件关系图)
2. [React 组件树结构](#2-react-组件树结构)
3. [Zustand 状态管理](#3-zustand-状态管理)
4. [D3.js 可视化渲染机制](#4-d3js-可视化渲染机制)
5. [架构总结与开发建议](#5-架构总结与开发建议)

**🆕 可视化修改指南**

6. [修改场景速查表](#6-修改场景速查表)
7. [各场景详细修改方案](#7-各场景详细修改方案)
8. [安全扩展模式与组件模板](#8-安全扩展模式与组件模板)
9. [修改前风险检查清单](#9-修改前风险检查清单)

---

## 1. 组件关系图

{analyses["component_diagram"]}

---

## 2. React 组件树结构

{analyses["component_tree"]}

---

## 3. Zustand 状态管理

{analyses["state_management"]}

---

## 4. D3.js 可视化渲染机制

{analyses["d3_rendering"]}

---

## 5. 架构总结与开发建议

{analyses["final_summary"]}

---

## 6. 修改场景速查表

> 根据你想改的内容，快速定位需要改动的文件和风险等级。

{scenario_table}

---

## 7. 各场景详细修改方案

> 以下内容结合真实项目代码，给出每种改动的具体操作步骤。

{analyses["modification_guide"]}

---

## 8. 安全扩展模式与组件模板

> 如何在不破坏原有代码的前提下，安全地添加新功能。

{analyses["safe_extension"]}

---

## 9. 修改前风险检查清单

> 每次改动前花 5 分钟过一遍，避免踩坑。

{analyses["risk_checklist"]}

---

## 📎 附录：分析文件清单

| 文件路径 | 大小 | 类别 |
|---------|------|------|
"""

        for category, files in ANALYSIS_CATEGORIES.items():
            for filepath in files:
                if filepath in self.file_contents:
                    size = len(self.file_contents[filepath])
                    report += f"| `{filepath}` | {size} 字符 | {category} |\n"
                else:
                    report += f"| `{filepath}` | ⚠️ 未找到 | {category} |\n"

        report += """
---

*报告由 HumanVIZ 架构分析工具 v2 生成，基于 DeepSeek API*
"""
        return report

    def _build_scenario_table(self) -> str:
        """
        【新增辅助方法】
        静态生成修改场景速查表，不需要 API 调用
        """
        risk_emoji = {"低": "🟢", "中": "🟡", "高": "🔴"}

        lines = [
            "| 想改什么 | 主要改动文件 | 风险 | 核心策略 |",
            "|---------|------------|------|---------|"
        ]

        for scenario, info in MODIFICATION_SCENARIOS.items():
            primary = "<br>".join([f"`{f}`" for f in info["primary_files"]])
            risk    = risk_emoji.get(info["risk"], "") + " " + info["risk"]
            strategy = info["strategy"]
            lines.append(f"| {scenario} | {primary} | {risk} | {strategy} |")

        return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# 入口
# ─────────────────────────────────────────────────────────────────────────────

def main():
    analyzer = HumanVIZAnalyzer()
    report = analyzer.generate_report()

    # 保存报告
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    output_file = f"/workspace/HumanVIZ_architecture_report_{timestamp}.md"

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(report)

    print("\n" + "=" * 70)
    print("✅ 架构分析完成！")
    print(f"📄 报告已保存: {output_file}")
    print(f"📊 报告大小: {len(report)} 字符")
    print("=" * 70)

    print("\n📑 报告章节概要:")
    print("-" * 70)
    sections = report.split("## ")
    for section in sections[1:]:
        title = section.split("\n")[0].strip()
        content_length = len(section)
        print(f"  📄 {title} ({content_length} 字符)")


if __name__ == "__main__":
    main()