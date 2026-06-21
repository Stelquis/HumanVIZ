# ===================================================================
# GitHub 同步脚本
# ===================================================================
# 功能: 将 CNB main 分支内容同步到 GitHub
#
# 前置条件: GitHub CLI (gh) 已安装并登录
#   gh auth login
#
# 自动推断目标仓库: {当前登录用户}/{本地仓库名}
#   无需手动配置，fork 用户登录自己的 GitHub 账号即可自动同步到自己的仓库。
#
# 工作流程:
#   安装 gh CLI → 登录 → 推断仓库 → 配置 remote → 快照同步 → push → 切回 main
#
# 一键运行:
#   bash /workspace/scripts/sync-to-github.sh
#
# 覆盖目标仓库（可选）:
#   GITHUB_REPO="OtherUser/OtherRepo" bash /workspace/scripts/sync-to-github.sh
# ===================================================================

set -e

# -------------------------------------------------------------------
# 配置区
# -------------------------------------------------------------------

GITHUB_REMOTE="github"
SYNC_BRANCH="github-main"

echo "=== 同步到 GitHub ==="

# -------------------------------------------------------------------
# 0. 检查并安装 GitHub CLI
# -------------------------------------------------------------------
if ! command -v gh &>/dev/null; then
    echo "🔧 未检测到 GitHub CLI，正在安装..."
    # 使用官方脚本安装（Debian/Ubuntu）
    (type -p wget >/dev/null || apt-get install -y wget) && \
        mkdir -p -m 755 /etc/apt/keyrings && \
        wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | \
            tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null && \
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | \
            tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
        apt-get update && \
        apt-get install -y gh && \
        rm -rf /var/lib/apt/lists/*
    echo "✅ gh CLI 安装完成"
fi

# 检查是否已登录 GitHub，未登录则引导登录
echo "🔍 检查 GitHub 登录状态..."
if ! gh auth status &>/dev/null; then
    echo "🔐 未登录 GitHub，正在启动交互式登录..."
    echo "   请按提示选择: GitHub.com → HTTPS → Login with a web browser"
    gh auth login --hostname github.com --git-protocol https --web
    echo "✅ 登录成功"
fi
echo "✅ 已登录 GitHub: $(gh auth status 2>&1 | head -1)"

# -------------------------------------------------------------------
# 1. 推断目标 GitHub 仓库
# -------------------------------------------------------------------
# 如果环境变量 GITHUB_REPO 已设置则直接使用，否则自动推断：
#   {gh 当前登录用户}/{本地 git 仓库名}
if [ -z "${GITHUB_REPO:-}" ]; then
    GITHUB_USER=$(gh api user --jq '.login' 2>/dev/null)
    REPO_NAME=$(git remote get-url origin 2>/dev/null | sed 's|.*/||; s|\.git$||')
    GITHUB_REPO="${GITHUB_USER}/${REPO_NAME}"
fi
echo "📦 目标仓库: https://github.com/${GITHUB_REPO}"

# -------------------------------------------------------------------
# 2. 初始化 GitHub remote，配置 gh 为 git 凭证助手
# -------------------------------------------------------------------
# 禁止 git 弹窗索要密码（防止 hang），失败即报错
export GIT_TERMINAL_PROMPT=0

# 确保 git 使用 gh CLI 的登录凭证
gh auth setup-git -h github.com

TARGET_URL="https://github.com/${GITHUB_REPO}.git"

# 设置或校验 GitHub remote
if CURRENT_URL=$(git remote get-url "$GITHUB_REMOTE" 2>/dev/null); then
    if [ "$CURRENT_URL" != "$TARGET_URL" ]; then
        echo "🔧 GitHub remote URL 不匹配，更新为: $TARGET_URL"
        git remote set-url "$GITHUB_REMOTE" "$TARGET_URL"
    else
        echo "✅ GitHub remote 已存在且正确"
    fi
else
    echo "🔧 配置 GitHub remote..."

    # 确保 GitHub 仓库存在（不存在则创建，公开仓库）
    gh repo view "$GITHUB_REPO" &>/dev/null || \
        gh repo create "$GITHUB_REPO" --public --source=. --remote="$GITHUB_REMOTE"

    # 如果 remote 仍不存在，手动添加
    if ! git remote get-url "$GITHUB_REMOTE" &>/dev/null; then
        git remote add "$GITHUB_REMOTE" "$TARGET_URL"
    fi

    echo "✅ GitHub remote 已配置"
fi

# -------------------------------------------------------------------
# 2. 检测 GitHub 仓库状态（用 ls-remote 比 fetch 更轻量，不会 hang）
# -------------------------------------------------------------------
# 如果 ls-remote 失败（仓库为空），返回空字符串
GITHUB_HEAD=$(git ls-remote "$GITHUB_REMOTE" HEAD 2>/dev/null | awk '{print $1}')

# 删除旧的 github-main（如果存在），重新创建
git branch -D "$SYNC_BRANCH" 2>/dev/null || true

if [ -n "$GITHUB_HEAD" ]; then
    # GitHub 上已有历史：只拉 commit+tree 元数据（不含 blob 文件），做树级对比
    echo "🔧 GitHub 已有历史，拉取元数据..."
    git fetch --depth=1 --filter=blob:none "$GITHUB_REMOTE" main

    # 直接对比两棵树的 hash，无需下载任何文件内容
    CNB_TREE=$(git rev-parse main^{tree})
    GITHUB_TREE=$(git rev-parse "${GITHUB_REMOTE}/main^{tree}")
    if [ "$CNB_TREE" = "$GITHUB_TREE" ]; then
        echo "⏭️  没有新变更（树 hash 一致），跳过推送"
        exit 0
    fi

    # 基于 main 创建分支，再将父提交设为 github/main
    # 效果：提交树 = CNB 内容，parent = github/main（纯增量）
    git checkout -b "$SYNC_BRANCH" main
    git reset --soft "${GITHUB_REMOTE}/main"
    git commit -m "$(date '+%Y-%m-%d %H:%M')"
else
    # GitHub 是空仓库：创建孤儿分支，全量提交
    echo "🔧 GitHub 为空仓库，创建孤儿分支全量提交..."
    git checkout --orphan "$SYNC_BRANCH"
    git rm -rf --quiet . 2>/dev/null || true
    git commit --allow-empty -m "root"
    git checkout main -- .
    git add -A
    git commit -m "$(date '+%Y-%m-%d %H:%M')"
fi

# -------------------------------------------------------------------
# 3. 推送到 GitHub
# -------------------------------------------------------------------
echo "📤 推送到 GitHub..."
git push "$GITHUB_REMOTE" "${SYNC_BRANCH}:main"

# -------------------------------------------------------------------
# 4. 切回 main
# -------------------------------------------------------------------
git checkout main

echo "✅ 同步完成！"
echo "   origin (cnb.cool): 不受影响"
echo "   github: https://github.com/${GITHUB_REPO}"
