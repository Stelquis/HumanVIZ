# HumanVIZ 多人协作开发指南

## 一、仓库结构

```
oriondawn/HumanVIZ (主仓库)
       │
       ├── A/HumanVIZ (成员A的Fork)
       ├── B/HumanVIZ (成员B的Fork)
       ├── C/HumanVIZ (成员C的Fork)
       └── D/HumanVIZ (成员D的Fork)
```

### 远程仓库约定

| 远程仓库 | 指向 | 说明 |
|----------|------|------|
| `origin` | 成员自己的 Fork 仓库 | 推送代码使用 |
| `upstream` | 主仓库 oriondawn/HumanVIZ | 同步最新代码使用 |

## 二、CNB 双层存储机制

Cloud Native Build (CNB) 将代码和开发环境分开存储：

| 存储层 | 存储位置 | 内容 | 更新方式 |
|--------|----------|------|----------|
| **代码层** | 各成员的 Fork 仓库 | 项目源代码 | `git push` 自动同步 |
| **镜像层** | `docker.cnb.cool/oriondawn/humanviz:latest` | 开发环境 | 仅配置变更时构建 |

### 工作原理

```
成员打开 CNB 时：
    ↓
1. 拉取源仓库 latest 镜像启动开发环境
2. 代码从自己的 Fork 仓库拉取
```

## 三、构建触发规则

### 触发条件（需同时满足）

- ✓ 推送到主仓库 `oriondawn/HumanVIZ`
- ✓ 本次提交涉及配置文件变更

### 配置变更文件列表

| 文件 | 说明 |
|------|------|
| `Dockerfile` | Docker 镜像构建配置 |
| `.cnb.yml` | CNB 云原生构建配置 |

### 跳过构建场景

- ✗ Fork 仓库推送（任意分支）
- ✗ 主仓库推送但无配置文件变更

### 构建流程

```
push 到 main 分支
    ↓
1. 检查是否为 oriondawn/HumanVIZ 主仓库
2. 检查本次提交是否涉及配置文件变更
3. 仅当两者同时满足时才执行构建
```

### 构建效果对比

| 提交类型 | 代码更新 | 镜像构建 | 完成速度 |
|----------|----------|----------|----------|
| 普通代码提交 | ✓ | ✗ | 快速 |
| 配置文件提交 | ✓ | ✓ | 较慢 |

## 四、版本策略

- **镜像标签**：使用 `latest` 单一版本
- **更新方式**：每次 main 分支构建直接覆盖 `latest`
- **优势**：简化版本管理，减少镜像仓库存储

## 五、模块隔离策略

### 协作原则

每人负责独立模块，**不修改他人代码**。

### 目录结构示例

```
src/
├── components/      # 公共组件（需协商修改）
├── features/
│   ├── ui/          # A 负责
│   ├── api_v2/      # B 负责
│   └── utils_v2/    # C 负责
└── shared/          # 公共工具（需协商修改）
```

### 冲突避免方法

1. 新功能使用新目录（如 `api_v2` 而非修改 `api`）
2. 保持旧模块可用，作为过渡
3. 新模块稳定后，删除旧模块

## 六、开发工作流

### 成员 A 开发新功能流程

```
1. 在自己的 Fork (A/HumanVIZ) 创建功能分支
       ↓
2. 编写代码，推送到自己的 Fork
   → 不触发构建，仅保存代码
       ↓
3. 提交 PR 到主仓库 oriondawn/HumanVIZ
       ↓
4. 管理员 Review 并合并到 main
   → 若涉及配置文件，触发构建，镜像更新
       ↓
5. 其他成员同步最新代码
```

### 成员 B 获取最新代码

#### 方法一：CNB 网页操作

```
1. 进入自己的 Fork 仓库
2. 点击 "Sync fork" → "Sync fork" 按钮
```

#### 方法二：Git 命令行

```bash
# 添加上游仓库（只需执行一次）
git remote add upstream https://cnb.cool/OrionDawn/HumanVIZ.git

# 同步上游最新代码
git fetch upstream
git merge upstream/main

# 推送到自己的 Fork
git push origin main
```

## 七、Git 提交信息规范

### 格式

```
<type>: <subject>
```

### 类型说明

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修复 bug |
| `docs` | 文档更新 |
| `style` | 代码格式调整 |
| `refactor` | 代码重构 |
| `test` | 测试相关 |
| `chore` | 构建/工具 |

### 规则

- 使用祈使语气
- 全部小写
- 主题不超过 50 个字符
- 句末不加句号
- 仅使用英文

### 示例

```
feat: add quick sort implementation
fix: resolve null pointer exception
docs: update readme with examples
refactor: simplify binary search
style: format with 4 spaces
chore: add mit license
```

## 八、常见问题

### Q1: Fork 仓库推送后没有触发构建，正常吗？

**正常**。Fork 仓库推送只会更新代码层，不会触发镜像构建。镜像构建统一由主仓库管理。

### Q2: 普通代码提交需要等待镜像构建吗？

**不需要**。普通代码提交只更新代码层，构建流程会自动跳过镜像构建。

### Q3: 如何确保镜像是最新的？

当管理员合并涉及 `Dockerfile` 或 `.cnb.yml` 变更的 PR 时，镜像会自动更新。

### Q4: 成员可以直接修改主仓库吗？

**不建议**。建议通过 Fork 仓库提 PR，由管理员统一管理和 Review。

## 九、快速开始

### 新成员加入步骤

```
1. Fork 主仓库到自己的账号
       ↓
2. 克隆自己的 Fork 到本地
   git clone https://cnb.cool/你的用户名/HumanVIZ.git
       ↓
3. 添加上游仓库
   git remote add upstream https://cnb.cool/OrionDawn/HumanVIZ.git
       ↓
4. 开始开发（创建功能分支）
   git checkout -b feature/your-feature
       ↓
5. 开发完成后，推送到自己的 Fork
   git push origin feature/your-feature
       ↓
6. 在 GitLab/GitHub 提交 Pull Request
```

### 日常开发步骤

```
1. 切换到 main 分支
   git checkout main
       ↓
2. 拉取上游最新代码
   git pull upstream main
       ↓
3. 创建功能分支
   git checkout -b feature/new-feature
       ↓
4. 开发并提交代码
   git add .
   git commit -m "feat: add new feature"
       ↓
5. 推送到自己的 Fork
   git push origin feature/new-feature
       ↓
6. 提 PR，等待管理员合并
```

---

> 文档版本：1.0
> 最后更新：2026-05-08
