# ===================================================================
# Claude Code 配置初始化脚本
# ===================================================================
# 功能: 根据环境变量或默认值生成 Claude Code CLI 配置文件
# 配置路径: /root/.claude/ 和 /home/admin/.claude/
# 文档: https://platform.xiaomimimo.com/docs/zh-CN/integration/claudecode
# 一键运行:
#   bash /workspace/scripts/init-claude.sh
# ===================================================================

set -e

# -----------------------------------------------------------------------------
# 用户配置区
# -----------------------------------------------------------------------------

# API Key: 支持任意兼容 Anthropic API 的提供商
# 格式: sk-xxxxx (OpenRouter/官方) 或 tp-xxxxx (Token Plan) 等
# DeepSeek Platform: https://platform.deepseek.com/
MY_API_KEY="sk-YOUR_API_KEY_HERE"

# API 基础地址
MY_BASE_URL="https://api.deepseek.com/anthropic"

# 模型名称
# DeepSeek 模型: deepseek-v4-pro[1m] / deepseek-v4-flash
MY_MODEL="deepseek-v4-pro[1m]"

MY_DEFAULT_OPUS_MODEL="deepseek-v4-pro[1m]"
MY_DEFAULT_SONNET_MODEL="deepseek-v4-pro[1m]"
MY_DEFAULT_HAIKU_MODEL="deepseek-v4-flash"
MY_SUBAGENT_MODEL="deepseek-v4-flash"

# 工作努力程度: min / low / medium / high / max
MY_EFFORT_LEVEL="max"

# -----------------------------------------------------------------------------
# 配置读取逻辑
# -----------------------------------------------------------------------------
# 优先级: 环境变量 > 脚本默认值

ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-$MY_API_KEY}"
ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-$MY_BASE_URL}"
ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-$MY_MODEL}"
ANTHROPIC_DEFAULT_OPUS_MODEL="${ANTHROPIC_DEFAULT_OPUS_MODEL:-$MY_DEFAULT_OPUS_MODEL}"
ANTHROPIC_DEFAULT_SONNET_MODEL="${ANTHROPIC_DEFAULT_SONNET_MODEL:-$MY_DEFAULT_SONNET_MODEL}"
ANTHROPIC_DEFAULT_HAIKU_MODEL="${ANTHROPIC_DEFAULT_HAIKU_MODEL:-$MY_DEFAULT_HAIKU_MODEL}"
CLAUDE_CODE_SUBAGENT_MODEL="${CLAUDE_CODE_SUBAGENT_MODEL:-$MY_SUBAGENT_MODEL}"
CLAUDE_CODE_EFFORT_LEVEL="${CLAUDE_CODE_EFFORT_LEVEL:-$MY_EFFORT_LEVEL}"

ROOT_CLAUDE_DIR="/root/.claude"
ADMIN_CLAUDE_DIR="/home/admin/.claude"
PLUGINS_DIR="$ROOT_CLAUDE_DIR/plugins"

echo "=== Claude Code 配置初始化 ==="

# -----------------------------------------------------------------------------
# 安装 karpathy-skills 编码规范（从 GitHub 拉取）
# -----------------------------------------------------------------------------
install_karpathy_skills() {
    local SKILLS_DIR="$ROOT_CLAUDE_DIR/skills/andrej-karpathy-skills"

    # 检查是否已安装
    if [ -d "$SKILLS_DIR/.git" ]; then
        echo "⏭️  karpathy-skills 已安装，尝试更新..."
        cd "$SKILLS_DIR" && git pull --ff-only 2>/dev/null || echo "⚠️  更新失败，使用现有版本"
        return
    fi

    echo "📦 正在从 GitHub 安装 karpathy-skills 编码规范..."
    mkdir -p "$ROOT_CLAUDE_DIR/skills"

    # 从 GitHub 克隆
    git clone --depth 1 https://github.com/forrestchang/andrej-karpathy-skills.git "$SKILLS_DIR" 2>/dev/null

    if [ -d "$SKILLS_DIR" ]; then
        echo "✅ karpathy-skills 安装完成"
    else
        echo "❌ 安装失败"
    fi
}

# 安装 karpathy-skills
install_karpathy_skills

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "⚠️  警告: 未设置 ANTHROPIC_API_KEY"
    echo ""
    echo "   快速配置方法:"
    echo "   1. 编辑本脚本: vim /usr/local/bin/init-claude.sh"
    echo "   2. 修改第 16 行: MY_API_KEY=\"sk-你的API密钥\""
    echo "   3. 保存并运行: /usr/local/bin/init-claude.sh"
    echo ""
    mkdir -p "$ROOT_CLAUDE_DIR" "$ADMIN_CLAUDE_DIR"
else
    echo "✅ 检测到 ANTHROPIC_API_KEY，正在生成配置文件..."

    mkdir -p "$ROOT_CLAUDE_DIR"

    # 创建 settings.json - Claude Code 环境变量配置
    cat > "$ROOT_CLAUDE_DIR/settings.json" << EOF
{
    "env": {
        "ANTHROPIC_BASE_URL": "${ANTHROPIC_BASE_URL}",
        "ANTHROPIC_AUTH_TOKEN": "${ANTHROPIC_API_KEY}",
        "ANTHROPIC_MODEL": "${ANTHROPIC_MODEL}",
        "ANTHROPIC_DEFAULT_OPUS_MODEL": "${ANTHROPIC_DEFAULT_OPUS_MODEL}",
        "ANTHROPIC_DEFAULT_SONNET_MODEL": "${ANTHROPIC_DEFAULT_SONNET_MODEL}",
        "ANTHROPIC_DEFAULT_HAIKU_MODEL": "${ANTHROPIC_DEFAULT_HAIKU_MODEL}",
        "CLAUDE_CODE_SUBAGENT_MODEL": "${CLAUDE_CODE_SUBAGENT_MODEL}",
        "CLAUDE_CODE_EFFORT_LEVEL": "${CLAUDE_CODE_EFFORT_LEVEL}"
    },
    "theme": "light-daltonized"
}
EOF

    # 创建 .claude.json - 初始化完成标志
    cat > "$ROOT_CLAUDE_DIR/.claude.json" << EOF
{
    "hasCompletedOnboarding": true
}
EOF

    echo "✅ 已创建 $ROOT_CLAUDE_DIR/settings.json"
    echo "✅ 已创建 $ROOT_CLAUDE_DIR/.claude.json"

    mkdir -p "$ADMIN_CLAUDE_DIR"
    cp "$ROOT_CLAUDE_DIR/settings.json" "$ADMIN_CLAUDE_DIR/"
    cp "$ROOT_CLAUDE_DIR/.claude.json" "$ADMIN_CLAUDE_DIR/"

    echo "✅ 已创建 $ADMIN_CLAUDE_DIR/ 配置"
    echo ""
    echo "=== Claude Code 配置完成 ==="
    echo "Base URL: ${ANTHROPIC_BASE_URL}"
    echo "模型: ${ANTHROPIC_MODEL}"
fi

echo ""
echo "=== 所有配置完成 ==="