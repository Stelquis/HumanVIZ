# ===================================================================
# GitHub 同步脚本
# ===================================================================
# 功能: 将 main 分支内容同步到 GitHub（自动处理 API Key 敏感信息）
#
# 工作流程:
#   替换 API Key 为占位符 → 全量替换文件 → push → 恢复 Key
#
# 一键运行:
#   bash /workspace/scripts/sync-to-github.sh
# ===================================================================

set -e

# -------------------------------------------------------------------
# 配置区
# -------------------------------------------------------------------

# 真实 API Key（只在本地使用，不会推送到 GitHub）
REAL_CLAUDE_KEY="sk-1142eb72d7d0418d8d311c39abe31de1"
REAL_CODEX_KEY="sk-VQFRDgf7eWb8GC0VHdN6TSvXCfqdGHwHoqxjgWsbofrEbayz"

# GitHub 占位符 Key（推送到远程的版本）
PLACEHOLDER="sk-YOUR_API_KEY_HERE"

# 需要屏蔽 Key 的文件
CLAUDE_FILE="scripts/init-claude.sh"
CODEX_FILE="scripts/init-codex.sh"

echo "=== 同步到 GitHub ==="

# -------------------------------------------------------------------
# 1. 替换 API Key 为占位符
# -------------------------------------------------------------------
echo "🔒 替换 API Key 为占位符..."
sed -i "s|${REAL_CLAUDE_KEY}|${PLACEHOLDER}|g" "$CLAUDE_FILE"
sed -i "s|${REAL_CODEX_KEY}|${PLACEHOLDER}|g" "$CODEX_FILE"

# -------------------------------------------------------------------
# 2. 确保在 main 分支，提交占位符版本
# -------------------------------------------------------------------
git checkout main
git add "$CLAUDE_FILE" "$CODEX_FILE"
git commit -m "chore: mask API keys for GitHub sync" --no-verify || true

# -------------------------------------------------------------------
# 3. 切到 github-main，全量替换文件
# -------------------------------------------------------------------
echo "🔀 同步文件到 github-main..."
git checkout github-main
git checkout main -- .
git add -A

# 有变更才提交，否则跳过
if git diff --cached --quiet; then
    echo "⏭️  没有新变更，跳过提交"
else
    git commit -m "sync: $(date '+%Y-%m-%d %H:%M')"
fi

# -------------------------------------------------------------------
# 4. 推送到 GitHub
# -------------------------------------------------------------------
echo "📤 推送到 GitHub..."
git push github github-main:main --force

# -------------------------------------------------------------------
# 5. 切回 main，撤销临时 commit 并恢复 API Key
# -------------------------------------------------------------------
echo "🔓 恢复 API Key..."
git checkout main
git reset --hard HEAD~1

echo "✅ 同步完成！"
echo "   origin (cnb.cool): 不受影响"
echo "   github: https://github.com/Stelquis/HumanVIZ"
