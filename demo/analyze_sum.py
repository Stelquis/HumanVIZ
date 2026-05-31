#!/usr/bin/env python3
"""
HumanVIZ 前端架构分析工具
梳理 React 组件树、Zustand 状态管理、D3.js 可视化渲染机制
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
                content = f.read(5000)  # 读取更多内容用于分析
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

    def analyze_component_tree(self) -> str:
        """分析 React 组件树结构"""
        print("\n🌳 分析 React 组件树...")
        
        # 收集应用入口和组件文件
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
2. **比例尺设定**：
   - 有哪些比例尺（线性、序数、时间等）
   - 各自的 domain 和 range 设置
   - 如何动态调整
3. **颜色映射**：
   - Chroma.js 的颜色方案
   - 颜色如何映射到数据类别
   - 图例的生成逻辑
4. **丝带路径生成**：
   - 使用什么 D3 路径生成器（line/area/ribbon）
   - 路径的坐标计算逻辑
   - 丝带粗细、弯曲度的控制参数
5. **动画与交互**：
   - 过渡动画的实现
   - 鼠标交互事件
   - 缩放和平移功能
6. **坐标轴系统**：
   - X轴和Y轴的配置
   - 刻度线和标签的生成

请结合代码段解释，用 Markdown 格式输出。"""
        
        return self._call_api(prompt)

    def generate_final_summary(self) -> str:
        """生成整体架构总结"""
        print("📝 生成架构总结...")
        
        prompt = f"""基于 HumanVIZ 项目的代码分析，请生成一份全面的前端架构总结。

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
6. **后续开发建议**：基于当前架构的最佳实践建议

面向开发者，提供实用价值。"""
        
        return self._call_api(prompt)

    def generate_component_diagram(self) -> str:
        """生成组件关系 Mermaid 图"""
        print("📐 生成组件关系图...")
        
        prompt = """根据 HumanVIZ 项目的组件结构，生成一个 Mermaid 格式的组件关系图。

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
                            "content": "你是前端架构分析专家，擅长分析 React、TypeScript、D3.js 项目。请用中文详细分析，输出 Markdown 格式。"
                        },
                        {"role": "user", "content": prompt}
                    ],
                    "max_tokens": max_tokens,
                    "temperature": 0.3  # 降低随机性以获得更准确的分析
                },
                timeout=60
            )
            
            if response.status_code == 200:
                return response.json()['choices'][0]['message']['content']
            else:
                return f"❌ API调用失败 ({response.status_code}): {response.text}"
        except Exception as e:
            return f"❌ 请求异常: {str(e)}"

    def generate_report(self) -> str:
        """生成完整的分析报告"""
        print("\n" + "="*70)
        print("🚀 开始生成 HumanVIZ 前端架构分析报告")
        print("="*70)
        
        # 阶段1：加载文件
        self.load_all_files()
        
        # 阶段2：分模块分析
        analyses = {}
        
        analyses["component_diagram"] = self.generate_component_diagram()
        analyses["component_tree"] = self.analyze_component_tree()
        analyses["state_management"] = self.analyze_state_management()
        analyses["d3_rendering"] = self.analyze_d3_rendering()
        analyses["final_summary"] = self.generate_final_summary()
        
        # 阶段3：组装报告
        report = f"""# HumanVIZ 前端架构分析报告

> 📅 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
> 🔧 分析工具: DeepSeek API
> 📊 分析文件数: {len(self.file_contents)} 个

---

## 📋 目录

1. [组件关系图](#1-组件关系图)
2. [React 组件树结构](#2-react-组件树结构)
3. [Zustand 状态管理](#3-zustand-状态管理)
4. [D3.js 可视化渲染机制](#4-d3js-可视化渲染机制)
5. [架构总结与开发建议](#5-架构总结与开发建议)

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

## 📎 附录：分析文件清单

| 文件路径 | 大小 | 类别 |
|---------|------|------|
"""
        
        for category, files in ANALYSIS_CATEGORIES.items():
            for filepath in files:
                if filepath in self.file_contents:
                    size = len(self.file_contents[filepath])
                    report += f"| {filepath} | {size} 字符 | {category} |\n"
                else:
                    report += f"| {filepath} | ⚠️ 未找到 | {category} |\n"
        
        report += f"""
---

*报告由自动化架构分析工具生成，基于 DeepSeek API 分析结果*
"""
        
        return report

def main():
    analyzer = HumanVIZAnalyzer()
    report = analyzer.generate_report()
    
    # 保存报告
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    output_file = f"/workspace/HumanVIZ_architecture_report_{timestamp}.md"
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(report)
    
    print("\n" + "="*70)
    print("✅ 架构分析完成！")
    print(f"📄 报告已保存: {output_file}")
    print(f"📊 报告大小: {len(report)} 字符")
    print("="*70)
    
    # 显示报告章节概要
    print("\n📑 报告章节概要:")
    print("-"*70)
    sections = report.split("## ")
    for section in sections[1:]:  # 跳过标题
        title = section.split("\n")[0].strip()
        content_length = len(section)
        print(f"  📄 {title} ({content_length} 字符)")

if __name__ == "__main__":
    main()