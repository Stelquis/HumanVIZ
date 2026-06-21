# ===================================================================
# Gitee 同步脚本
# ===================================================================
# 功能: 将 CNB main 分支内容同步到 Gitee
#
# 前置条件: 有 Gitee 私人令牌（运行时会提示输入，不保存到文件）
#
# 工作流程:
#   输入令牌 → 验证 → 自动创建仓库 → 快照同步 → push → 切回 main → 清理 remote
#
# 一键运行:
#   bash /workspace/scripts/sync-to-gitee.sh
#
# 环境变量方式（可选，跳过交互）:
#   GITEE_TOKEN="xxx" bash /workspace/scripts/sync-to-gitee.sh
# ===================================================================

set -e

# -------------------------------------------------------------------
# 配置区
# -------------------------------------------------------------------

GITEE_REMOTE="gitee"
SYNC_BRANCH="gitee-main"
GITEE_API="https://gitee.com/api/v5"

echo "=== 同步到 Gitee ==="

# -------------------------------------------------------------------
# 0. 获取 Gitee 私人令牌（交互输入，不回显）
# -------------------------------------------------------------------
if [ -z "${GITEE_TOKEN:-}" ]; then
    printf "🔐 请输入 Gitee 私人令牌: "
    stty -echo
    read -r GITEE_TOKEN
    stty echo
    echo ""
fi

if [ -z "$GITEE_TOKEN" ]; then
    echo "❌ 令牌不能为空"
    exit 1
fi

# -------------------------------------------------------------------
# 1. 验证令牌，获取用户名
# -------------------------------------------------------------------
echo "🔍 验证 Gitee 令牌..."
GITEE_USER=$(curl -s -H "Authorization: token $GITEE_TOKEN" "${GITEE_API}/user" | python3 -c "import sys,json; print(json.load(sys.stdin).get('login',''))" 2>/dev/null)
if [ -z "$GITEE_USER" ]; then
    echo "❌ 令牌无效或网络错误"
    exit 1
fi
echo "✅ 已登录 Gitee: $GITEE_USER"

# -------------------------------------------------------------------
# 2. 推断仓库名
# -------------------------------------------------------------------
REPO_NAME=$(git remote get-url origin 2>/dev/null | sed 's|.*/||; s|\.git$||')
echo "📦 目标仓库: https://gitee.com/${GITEE_USER}/${REPO_NAME}"

# -------------------------------------------------------------------
# 3. 检查/创建 Gitee 仓库
# -------------------------------------------------------------------
echo "🔍 检查 Gitee 仓库是否存在..."
REPO_EXISTS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: token $GITEE_TOKEN" "${GITEE_API}/repos/${GITEE_USER}/${REPO_NAME}")
if [ "$REPO_EXISTS" = "200" ]; then
    echo "✅ 仓库已存在"
else
    echo "🔧 创建 Gitee 仓库..."
    CREATE_RESP=$(curl -s -X POST -H "Authorization: token $GITEE_TOKEN" -H "Content-Type: application/json" \
        -d "{\"name\":\"${REPO_NAME}\",\"private\":\"false\"}" \
        "${GITEE_API}/user/repos")
    echo "$CREATE_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('✅ 仓库已创建:', d.get('html_url','?'))" 2>/dev/null || echo "✅ 仓库已创建"
fi

# -------------------------------------------------------------------
# 4. 配置 Gitee remote
# -------------------------------------------------------------------
TARGET_URL="https://oauth2:${GITEE_TOKEN}@gitee.com/${GITEE_USER}/${REPO_NAME}.git"

# 禁止 git 弹窗索要密码
export GIT_TERMINAL_PROMPT=0

# 先清理旧的 gitee remote
git remote remove "$GITEE_REMOTE" 2>/dev/null || true
git remote add "$GITEE_REMOTE" "$TARGET_URL"
echo "✅ Gitee remote 已配置"

# -------------------------------------------------------------------
# 5. 检测 Gitee 仓库状态
# -------------------------------------------------------------------
GITEE_HEAD=$(git ls-remote "$GITEE_REMOTE" HEAD 2>/dev/null | awk '{print $1}')

# 删除旧的同步分支（如果存在），重新创建
git branch -D "$SYNC_BRANCH" 2>/dev/null || true

if [ -n "$GITEE_HEAD" ]; then
    # Gitee 上已有历史：拉取元数据做树级对比
    echo "🔧 Gitee 已有历史，拉取元数据..."
    git fetch --depth=1 --filter=blob:none "$GITEE_REMOTE" main 2>/dev/null || \
        git fetch "$GITEE_REMOTE" main

    CNB_TREE=$(git rev-parse main^{tree})
    GITEE_TREE=$(git rev-parse "${GITEE_REMOTE}/main^{tree}")
    if [ "$CNB_TREE" = "$GITEE_TREE" ]; then
        echo "⏭️  没有新变更（树 hash 一致），跳过推送"
        git remote remove "$GITEE_REMOTE"
        exit 0
    fi

    # 基于 main 创建分支，parent 设为 gitee/main（纯增量）
    git checkout -b "$SYNC_BRANCH" main
    git reset --soft "${GITEE_REMOTE}/main"
    git commit -m "$(date '+%Y-%m-%d %H:%M')"
else
    # Gitee 是空仓库：创建孤儿分支，全量提交
    echo "🔧 Gitee 为空仓库，创建孤儿分支全量提交..."
    git checkout --orphan "$SYNC_BRANCH"
    git rm -rf --quiet . 2>/dev/null || true
    git commit --allow-empty -m "root"
    git checkout main -- .
    git add -A
    git commit -m "$(date '+%Y-%m-%d %H:%M')"
fi

# -------------------------------------------------------------------
# 6. 推送到 Gitee
# -------------------------------------------------------------------
echo "📤 推送到 Gitee..."
git push --force "$GITEE_REMOTE" "${SYNC_BRANCH}:main"

# -------------------------------------------------------------------
# 7. 切回 main，清理 remote
# -------------------------------------------------------------------
git checkout -f main
git remote remove "$GITEE_REMOTE"
echo "✅ Gitee remote 已清理（令牌不落盘）"

echo ""
echo "✅ 同步完成！"
echo "   origin (cnb.cool): 不受影响"
echo "   gitee: https://gitee.com/${GITEE_USER}/${REPO_NAME}"
