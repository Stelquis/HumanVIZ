# GitHub 双远程仓库同步实操（CNB & Github）

> 本文档记录将 CNB 仓库同步到 GitHub，并解决大文件拦截、敏感信息泄露等问题的完整流程。

---

## 背景

原仓库托管在 `cnb.cool`（远程名：`origin`），希望同时推送到 GitHub 作为镜像。但面临两个问题：

1. **Git 历史中有超大文件**（`humanviz.db` 202MB、xlsx 188MB）超过 GitHub 100MB 限制
2. **脚本中包含 API Key**（`init-claude.sh`、`init-codex.sh`）不适合公开

---

## 解决方案

### 最终架构

```
main (cnb.cool):    ● → ● → ● → commit A → commit B → ...
                    完整历史，每次 dev 都记录

github-main (GitHub): ★ → [sync: 05-31] → [sync: 06-02] → ...
                      孤儿起点          每次 squash 合并只产一条记录
```

两条历史线**完全独立**：
- `main`：保留所有开发提交记录，推送到 cnb.cool
- `github-main`：孤儿分支起步，每次同步 squash 合并产生一条时间戳记录，推送到 GitHub
- **文件内容一致**（API Key 除外：本地真实，GitHub 占位符）

- **日常开发**：`git push origin main` 只推 cnb.cool
- **同步 GitHub**：运行 `bash scripts/sync-to-github.sh`

---

## 实施步骤

### 1. 安装 GitHub CLI

```bash
sudo apt update && sudo apt install -y gh
```

### 2. 登录 GitHub

```bash
gh auth login --hostname github.com --git-protocol https --web
```

- 复制终端显示的一次性验证码
- 在浏览器打开 `github.com/login/device`，输入验证码授权

### 3. 创建 GitHub 仓库并添加远程

```bash
gh repo create Stelquis/HumanVIZ --private \
  --description "HumanVIZ - Human visualization project" \
  --source . --remote github --push
```

⚠️ 首次 push 可能因大文件失败（GitHub 拒绝 >100MB 的文件）

### 4. 处理敏感信息

将 `init-claude.sh` 和 `init-codex.sh` 中的 API Key 替换为占位符：

```bash
# init-claude.sh 第 20 行
MY_API_KEY="sk-YOUR_API_KEY_HERE"

# init-codex.sh 第 18 行
MY_API_KEY="sk-YOUR_API_KEY_HERE"
```

> **最佳实践**：脚本本身支持环境变量优先（如 `ANTHROPIC_API_KEY`），
> 在 `~/.bashrc` 中设置真实 Key 即可，无需反复修改脚本。

### 5. 移除大文件

```bash
# 从 Git 跟踪中移除（保留本地文件）
git rm --cached HumanVIZ/data/humanviz.db

# .gitignore 已有 *.db 规则，未来不会再被跟踪
```

### 6. 创建孤儿分支（无历史、仅当前内容）

由于 Git 历史中包含已删除的大文件（xlsx），直接 push 会被 GitHub 拦截。
用**孤儿分支**绕过：创建一条全新的、没有父提交的分支，只包含当前文件。

```bash
# 创建孤儿分支
git checkout --orphan github-main

# 清空暂存区
git rm --cached -r .

# 重新添加所有当前文件（自动遵循 .gitignore）
git add .

# 提交
git commit -m "Welcome to HumanVIZ !"

# 强制推送到 GitHub
git push github github-main:main --force

# 切回 main
git checkout main
```

### 7. 推送到 origin

```bash
git push origin main
```

---

## 什么是孤儿分支？

```
普通分支：   ● → ● → ● → ●    每个 commit 都有父提交（历史链）

孤儿分支：   ★                 没有父提交，凭空诞生
```

就像把当前文件"拍照"存为新 commit，不带任何历史包袱。适合绕过：
- 历史中的大文件
- 历史中的敏感信息
- 需要干净起点的场景

---

## 日常工作流

### 日常开发（推 cnb.cool）

```bash
git add .
git commit -m "描述你的改动"
git push origin main
```

仅此三步，和以前完全一样。

### 同步到 GitHub（一条命令）

```bash
bash scripts/sync-to-github.sh
```

**脚本逻辑**（全程不影响 origin）：

```
① sed 替换     → main 上 Key → 占位符
② git add       → 暂存占位符版本
③ git commit    → main 上临时 commit（不推 origin）
④ squash 合并   → 切到 github-main，squash 所有改动为一条 commit
⑤ git push      → 推到 GitHub
⑥ git checkout  → 切回 main
⑦ git reset     → 撤销步骤③的临时 commit，main 恢复原样
```

> `--squash` 是关键：只同步文件内容，不绑定历史。两个仓库的提交记录完全独立。

### 常用命令速查

```bash
# 查看所有远程
git remote -v

# 查看所有分支
git branch -a

# 查看当前提交
git log --oneline -5

# 对比两个分支差异
git diff main github-main --stat
```

---

## 当前状态一览

| 远程 | 地址 | 分支 | 历史 |
|------|------|------|------|
| `origin` | cnb.cool | main | 完整 |
| `github` | github.com/Stelquis/HumanVIZ | main | 孤儿（单 commit） |

---

## 注意事项

- **GitHub 仓库是 private 的**，API Key 已替换为占位符，但建议仍保持谨慎
- **大文件**：`humanviz.db` 已加入 `.gitignore`，再也不会被跟踪
- **GitHub 首次 push 失败是正常的**：GitHub 扫描到历史中的大文件就会拒绝，不影响本地
- **两个远程历史不同**：不能用同一个 `git push` 同时推两边，必须分开处理
- **环境变量优先**：建议用环境变量管理 API Key，而不是硬编码在脚本中

---

> 最后更新：2026-05-31
