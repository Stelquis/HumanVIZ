#!/usr/bin/env python3
"""
HumanVIZ 前端模块功能标注分析器
功能：
  1. 读取前端可视化源文件
  2. 通过 AI 分析各模块：丝带区域、图例、控制项等
  3. 生成结构化的前端梳理报告，为后续扩展开发提供基础
"""

import requests
import os
from datetime import datetime

# ─── API 配置 ─────────────────────────────────────────────
API_KEY  = "sk-ccb46e17cc974f12b2cded9736ae1b72"
BASE_URL = "https://api.deepseek.com/v1"
MODEL    = "deepseek-chat"

# ─── 项目根目录 ────────────────────────────────────────────
PROJECT_ROOT = "/workspace/HumanVIZ/src"

# ─── 按功能分组的文件列表 ──────────────────────────────────
# 格式: (文件路径, 所属模块分组, 期望分析侧重点)
FILES_TO_ANALYZE = [
    # ── 入口 & 路由 ──────────────────────────────────────
    ("main.tsx",         "入口与路由",    "应用挂载点、路由配置、全局 Provider"),
    ("App.tsx",          "入口与路由",    "顶层布局结构、页面切换逻辑"),

    # ── 后端服务 ─────────────────────────────────────────
    ("server.ts",        "后端服务",      "API 路由、数据读取、静态资源托管"),

    # ── 状态管理（Stores）────────────────────────────────
    ("stores/storyStore.ts",    "状态管理", "故事/叙事数据的状态结构与更新逻辑"),
    ("stores/dataStore.ts",     "状态管理", "原始数据加载、缓存、选择逻辑"),
    ("stores/positionStore.ts", "状态管理", "元素位置/布局状态管理"),

    # ── 核心可视化组件 ───────────────────────────────────
    (
        "components/Vis/StoryVis.tsx",
        "核心可视化",
        "整体可视化容器：丝带区域布局、图例区域、各子图层的组装方式"
    ),
    (
        "components/Vis/MainPlot.tsx",
        "核心可视化",
        "主绘图区：丝带（Ribbon）绘制逻辑、SVG 元素、交互事件"
    ),
    (
        "components/Vis/CharacterNetwork.tsx",
        "核心可视化",
        "人物关系网络图：节点/边渲染、力导向布局、图例说明"
    ),
    (
        "components/Vis/LocationChart.tsx",
        "核心可视化",
        "地点图表：坐标映射、标注、颜色编码"
    ),

    # ── 坐标轴组件 ───────────────────────────────────────
    ("components/XAxis/XAxis.tsx",    "坐标轴", "X 轴刻度、时间/场次标签、控制项联动"),
    ("components/YAxis/YAxisDiv.tsx", "坐标轴", "Y 轴人物/地点排列、分组标签"),

    # ── 工具函数 ─────────────────────────────────────────
    ("utils/colors.ts",   "工具函数", "颜色映射规则、图例颜色定义、主题色板"),
    ("utils/helpers.ts",  "工具函数", "数据格式化、坐标计算、通用辅助函数"),
]

# ─── 针对可视化模块的专项分析 Prompt ──────────────────────
VIS_ANALYSIS_PROMPT = """你是一位专业的前端可视化工程师，正在整理一份叙事可视化系统（HumanVIZ）的技术文档。

请分析以下文件，重点关注：
1. **模块职责**：该文件在整个可视化系统中承担什么功能？
2. **丝带区域（Ribbon）**：如果涉及，描述丝带的数据绑定方式、SVG 路径生成逻辑、颜色/透明度控制。
3. **图例（Legend）**：如果涉及，描述图例的构成要素、与颜色映射的关联、交互行为。
4. **控制项（Controls）**：如果涉及，描述用户可操作的控件（筛选、缩放、高亮等）及其事件流。
5. **关键接口/Props**：列出对外暴露的主要 Props 或状态依赖（Store）。
6. **扩展建议**：基于现有代码，提出 1~2 条后续扩展开发的切入点。

文件路径: {filepath}
分析侧重: {focus}

代码内容（前 3000 字符）:
{content}

请用中文回答，结构清晰，每个要点用小标题标注（Markdown 格式）。
"""

# ─── 整体项目综合分析 Prompt ───────────────────────────────
SUMMARY_PROMPT = """你是一位资深前端架构师，已完成对 HumanVIZ 叙事可视化系统的全文件分析。

以下是各文件的分析摘要：
{all_analyses}

请生成一份**前端梳理总结报告**，包含：

## 一、系统架构概述
简述整体技术栈与分层架构（入口 → 状态 → 可视化组件 → 工具层）。

## 二、核心模块功能地图
用表格或结构化列表，汇总各模块的核心职责。

## 三、关键可视化机制说明
3.1 丝带区域（Ribbon）的实现原理与数据流  
3.2 图例系统的设计与颜色映射机制  
3.3 控制项的交互模式与状态联动  

## 四、当前前端梳理成果总结
指出已摸清的技术底盘、数据流向、组件边界。

## 五、后续扩展开发建议
列出 3~5 条具体可行的扩展方向，说明切入文件与改动思路。

请用中文，Markdown 格式输出。
"""


# ─── 工具函数 ──────────────────────────────────────────────

def read_file(filepath: str) -> str | None:
    """读取源文件（最多 3000 字符）"""
    full_path = os.path.join(PROJECT_ROOT, filepath)
    if not os.path.exists(full_path):
        return None
    try:
        with open(full_path, "r", encoding="utf-8") as f:
            return f.read(3000)
    except Exception:
        return None


def call_api(prompt: str, max_tokens: int = 800) -> str:
    """调用 DeepSeek API"""
    try:
        resp = requests.post(
            f"{BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": max_tokens,
            },
            timeout=45,
        )
        if resp.status_code == 200:
            return resp.json()["choices"][0]["message"]["content"]
        return f"> ⚠️ API 返回异常：HTTP {resp.status_code}"
    except Exception as e:
        return f"> ⚠️ 请求失败：{e}"


def analyze_file(filepath: str, focus: str, content: str) -> str:
    """对单个文件调用可视化专项分析"""
    prompt = VIS_ANALYSIS_PROMPT.format(
        filepath=filepath,
        focus=focus,
        content=content,
    )
    return call_api(prompt, max_tokens=800)


def generate_summary(all_analyses: str) -> str:
    """生成项目整体梳理总结"""
    prompt = SUMMARY_PROMPT.format(all_analyses=all_analyses)
    return call_api(prompt, max_tokens=1500)


# ─── 主流程 ────────────────────────────────────────────────

def main():
    print("=" * 65)
    print("  HumanVIZ 前端模块功能标注分析器")
    print("=" * 65)
    print(f"  项目根目录 : {PROJECT_ROOT}")
    print(f"  待分析文件 : {len(FILES_TO_ANALYZE)} 个")
    print("=" * 65 + "\n")

    # ── 报告头部 ──────────────────────────────────────────
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    report_lines: list[str] = [
        "# HumanVIZ 前端模块功能标注报告\n\n",
        f"> 生成时间：{ts}  \n",
        f"> 分析文件：{len(FILES_TO_ANALYZE)} 个  \n",
        "> 分析重点：丝带区域 · 图例 · 控制项 · 扩展建议\n\n",
        "---\n\n",
    ]

    # ── 按分组组织章节 ────────────────────────────────────
    current_group = ""
    group_index = 0
    analyses_for_summary: list[str] = []   # 用于最终综合分析

    for idx, (filepath, group, focus) in enumerate(FILES_TO_ANALYZE, 1):
        # 分组标题
        if group != current_group:
            current_group = group
            group_index += 1
            section_title = f"## {group_index}. {group}\n\n"
            report_lines.append(section_title)
            print(section_title.strip())

        print(f"  [{idx:02d}/{len(FILES_TO_ANALYZE)}] 分析中：{filepath}")

        content = read_file(filepath)

        report_lines.append(f"### `{filepath}`\n\n")
        report_lines.append(f"**分析侧重**：{focus}\n\n")

        if content is None:
            msg = "> 📁 文件不存在或无法读取，请检查路径。\n\n"
            report_lines.append(msg)
            print(f"       ⚠️  文件缺失，跳过\n")
        else:
            analysis = analyze_file(filepath, focus, content)
            report_lines.append(f"{analysis}\n\n")
            analyses_for_summary.append(
                f"### {filepath}\n侧重：{focus}\n{analysis[:400]}...\n"
            )
            print(f"       ✅ 完成\n")

        report_lines.append("---\n\n")

    # ── 生成整体综合总结 ──────────────────────────────────
    print("=" * 65)
    print("  正在生成整体前端梳理总结...")
    print("=" * 65)

    summary_input = "\n".join(analyses_for_summary)
    summary = generate_summary(summary_input)

    report_lines.append("# 前端梳理综合总结\n\n")
    report_lines.append(summary)
    report_lines.append("\n")

    # ── 保存报告 ──────────────────────────────────────────
    out_ts  = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = "/workspace"
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"humanviz_frontend_report_{out_ts}.md")

    with open(out_path, "w", encoding="utf-8") as f:
        f.writelines(report_lines)

    # ── 打印预览 ──────────────────────────────────────────
    print(f"\n✅ 分析完成！报告已保存：{out_path}\n")
    print("─" * 65)
    print("报告预览（前 30 行）：")
    print("─" * 65)
    with open(out_path, "r", encoding="utf-8") as f:
        for line in list(f)[:30]:
            print(line, end="")
    print("\n...\n")
    print("─" * 65)
    print(f"  完整报告 → {out_path}")
    print("─" * 65)


if __name__ == "__main__":
    main()