# Claude Code Skills 配置指南

> [init-claude.sh](../scripts/init-claude.sh) 一键安装四组 Skills，涵盖编码规范、动画、设计品味和前端全领域知识。
>
> 文档版本：1.1 · 最后更新：2026-06-02

---

## ⚡ 最简单的使用方式

**你只需要描述想做什么，我来帮你调最合适的 Skill。**

不需要记名字，不需要打 `/`。例如：

| 你说 | 我自动调 |
|------|---------|
| "帮我写个 GSAP 滚动动画" | → `gsap-skills:gsap-scrolltrigger` |
| "帮我设计这个页面的配色" | → `frontend-design:color-theory` |
| "帮我审查一下这个 UI" | → `frontend-design:webdesign-review` |
| "帮我做个 Landing 页，别太模板化" | → `taste-skill:design-taste-frontend` |
| "约束一下编码风格" | → `andrej-karpathy-skills:karpathy-guidelines` |

**像聊天一样就行了。** 如果你明确知道用哪个，也可以直接说"用 gsap-core"。

> 当然，想手动调用的话，输入 `/` 搜索关键词也能找到所有 44 个 Skill。

---

## 四组 Skills 概览

| Skill | 定位 | 模块数 | 来源 |
|-------|------|--------|------|
| **karpathy-skills** | 编码行为规范 | 1 套 4 原则 | [GitHub](https://github.com/forrestchang/andrej-karpathy-skills) |
| **gsap-skills** | GSAP 动画引擎 | 8 个 | [GitHub](https://github.com/greensock/gsap-skills) |
| **taste-skill** | 前端设计品味 | 13 个 | [GitHub](https://github.com/Leonxlnx/taste-skill) |
| **frontend-design** | 前端设计全领域 | 22 个 | [npm](https://www.npmjs.com/package/@flitzrrr/frontend-design-skills) |

---

## 一、karpathy-skills — 编码规范

**解决 LLM 四大编码问题：**

| 原则 | 要点 |
|------|------|
| 编码前思考 | 明确假设、呈现权衡、困惑时停下 |
| 简洁优先 | 最少代码、拒绝臃肿抽象 |
| 精准修改 | 只改必要部分、不删有价值内容 |
| 目标驱动 | 测试优先、可验证的成功标准 |

**调用：** 输入 `/andrej-karpathy-skills:karpathy-guidelines`，或编码时自动生效。

---

## 二、gsap-skills — 动画引擎

GreenSock 官方出品，教 AI 正确使用 GSAP 动画库。

| 模块 | 用途 |
|------|------|
| `gsap-core` | 核心 API：tween、easing、stagger |
| `gsap-timeline` | 时间线编排、序列控制 |
| `gsap-scrolltrigger` | 滚动驱动动画、视差、pinning |
| `gsap-plugins` | Flip、Draggable、MotionPath 等插件 |
| `gsap-react` | React：useGSAP hook、context、cleanup |
| `gsap-frameworks` | Vue / Svelte 集成 |
| `gsap-performance` | 60fps 优化、避免布局抖动 |
| `gsap-utils` | clamp、mapRange、random 等工具 |

**调用：** 输入 `/gsap-skills:gsap-core` 等。

---

## 三、taste-skill — 设计品味

"反套板"设计系统，阻止 AI 生成千篇一律的"AI 味"界面。先读懂需求 → 推断受众/氛围 → 输出"Design Read" → 生成代码。

| 模块 | 风格/用途 |
|------|----------|
| `design-taste-frontend` | 通用默认版，Landing 页/作品集 |
| `minimalist-ui` | Notion/Linear 风格，暖色单色 |
| `industrial-brutalist-ui` | 工业粗野主义，Swiss 字体 + CRT |
| `high-end-visual-design` | 高端奢侈风，大量留白 |
| `gpt-taste` | 精英 UX/UI + 高级 GSAP 动效 |
| `image-to-code` | 图片→分析→代码 全流程 |
| `redesign-existing-projects` | 审计改版现有项目 |
| `full-output-enforcement` | 强制完整输出，禁止占位 |
| `brandkit` | 品牌识别套件、VI 手册 |
| 其他 4 个 | imagegen-web/mobile、v1 兼容版、stitch |

**调用：** 输入 `/taste-skill:design-taste-frontend` 等。支持三个可调参数（1-10）：`DESIGN_VARIANCE`（布局实验性）、`MOTION_INTENSITY`（动效深度）、`VISUAL_DENSITY`（信息密度）。

---

## 四、frontend-design-skills — 设计全领域

整合 12 个来源的 21 个设计领域技能，覆盖从色彩到无障碍的完整知识体系。

| 类别 | 模块 |
|------|------|
| **总控** | `webdesign-review` — 统筹所有领域的综合设计审查 |
| **核心** | `ui-design`、`ux-design` — 布局/组件/交互/信息架构 |
| **细节** | `color-theory`、`web-typography`、`accessibility` — 色彩/排版/无障碍 |
| **实现** | `responsive-design`、`navigation-design`、`images-media`、`branding-identity`、`usability` |
| **策略** | `customer-journey`、`design-process`、`ai-design-workflow`、`landing-pages`、`website-audit` |
| **趋势** | `design-trends`、`ui-patterns`、`visual-direction`、`component-patterns`、`agent-ui-design` |

**调用：** 输入 `/frontend-design:ui-design`、`/frontend-design:color-theory` 等。

---

## 使用方式

**最简单：输入 `/` 后选关键词筛选，回车即调用。**

| 你要做什么 | 调哪个 |
|-----------|--------|
| 约束 AI 编码行为 | `/andrej-karpathy-skills:karpathy-guidelines` |
| 写 GSAP 动画 | `/gsap-skills:gsap-core` |
| 设计 Landing 页 | `/taste-skill:design-taste-frontend` |
| 定色彩/排版 | `/frontend-design:color-theory` |
| 全面设计审查 | `/frontend-design:webdesign-review` |
| 滚动视差效果 | `/gsap-skills:gsap-scrolltrigger` |
| 项目 UI 改版 | `/taste-skill:redesign-existing-projects` |

## 安装

```bash
bash /workspace/scripts/init-claude.sh   # 一键安装 + 注册
```
