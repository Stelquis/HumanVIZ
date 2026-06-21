# ===================================================================
# Claude Code 配置初始化脚本
# ===================================================================
# 功能: 根据环境变量或默认值生成 Claude Code CLI 配置文件
# 配置路径: /root/.claude/ 和 /home/admin/.claude/
# 文档: https://platform.xiaomimimo.com/docs/zh-CN/integration/claudecode
# 一键运行:
#       bash /workspace/scripts/init-claude.sh
#
# 自动安装的 Skills:
#   - karpathy-skills      编码规范（GitHub: forrestchang/andrej-karpathy-skills）
#   - gsap-skills          8 个 GSAP 动画技能（GitHub: greensock/gsap-skills）
#   - taste-skill          2 个前端设计品味技能（GitHub: Leonxlnx/taste-skill）
#   - frontend-design      22 个前端设计领域技能（npm: @flitzrrr/frontend-design-skills）
# ===================================================================

set -e

# -----------------------------------------------------------------------------
# 用户配置区
# -----------------------------------------------------------------------------

# API Key: 支持任意兼容 Anthropic API 的提供商
# 格式: sk-xxxxx (OpenRouter/官方/硅基流动) 或 tp-xxxxx (Token Plan) 等
# DeepSeek Platform: https://platform.deepseek.com/
# 硅基流动 SiliconFlow: https://cloud.siliconflow.cn/
# 注意: API Key 不再硬编码，运行脚本时会提示手动输入
MY_API_KEY=""

# API 基础地址
# DeepSeek 官方: https://api.deepseek.com/anthropic
# 硅基流动 SiliconFlow: https://api.siliconflow.cn/
MY_BASE_URL=""

# 模型名称（DeepSeek 官方平台命名）
# 选择硅基流动时会自动替换为 SiliconFlow 命名格式
MY_MODEL="deepseek-v4-pro[1m]"

# 默认 OPUS/SONNET 使用 deepseek-v4-pro[1m]（与 MY_MODEL 一致）
MY_DEFAULT_OPUS_MODEL="deepseek-v4-pro[1m]"
MY_DEFAULT_SONNET_MODEL="deepseek-v4-pro[1m]"
MY_DEFAULT_HAIKU_MODEL="deepseek-v4-flash"
MY_SUBAGENT_MODEL="deepseek-v4-flash"

# 工作努力程度: min / low / medium / high / max
MY_EFFORT_LEVEL="max"

# -----------------------------------------------------------------------------
# 配置读取逻辑
# -----------------------------------------------------------------------------
# 优先级: 环境变量 > 交互式平台选择 > 脚本默认值
# 先保存环境变量（用户显式指定的最高优先）
ENV_BASE_URL="${ANTHROPIC_BASE_URL:-}"
ENV_MODEL="${ANTHROPIC_MODEL:-}"
ENV_OPUS="${ANTHROPIC_DEFAULT_OPUS_MODEL:-}"
ENV_SONNET="${ANTHROPIC_DEFAULT_SONNET_MODEL:-}"
ENV_HAIKU="${ANTHROPIC_DEFAULT_HAIKU_MODEL:-}"
ENV_SUBAGENT="${CLAUDE_CODE_SUBAGENT_MODEL:-}"

ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-$MY_API_KEY}"
CLAUDE_CODE_EFFORT_LEVEL="${CLAUDE_CODE_EFFORT_LEVEL:-$MY_EFFORT_LEVEL}"

# -----------------------------------------------------------------------------
# 交互式选择 API 平台 + 输入 API Key
# -----------------------------------------------------------------------------
if [ -z "$ENV_BASE_URL" ]; then
    echo ""
    echo "🌐 请选择你的 API 平台："
    echo "   1) DeepSeek 官方  (https://platform.deepseek.com/)"
    echo "   2) 硅基流动 SiliconFlow  (https://cloud.siliconflow.cn/)"
    echo ""
    printf "请输入选项 [1/2] (默认 1): "
    read -r PROVIDER_CHOICE
    case "$PROVIDER_CHOICE" in
        2)
            ANTHROPIC_BASE_URL="https://api.siliconflow.cn/"
            ANTHROPIC_MODEL="${ENV_MODEL:-deepseek-ai/DeepSeek-V4-Pro}"
            ANTHROPIC_DEFAULT_OPUS_MODEL="${ENV_OPUS:-deepseek-ai/DeepSeek-V4-Pro}"
            ANTHROPIC_DEFAULT_SONNET_MODEL="${ENV_SONNET:-deepseek-ai/DeepSeek-V4-Flash}"
            ANTHROPIC_DEFAULT_HAIKU_MODEL="${ENV_HAIKU:-deepseek-ai/DeepSeek-V4-Flash}"
            CLAUDE_CODE_SUBAGENT_MODEL="${ENV_SUBAGENT:-deepseek-ai/DeepSeek-V4-Flash}"
            echo "✅ 已选择: 硅基流动 SiliconFlow"
            ;;
        *)
            ANTHROPIC_BASE_URL="https://api.deepseek.com/anthropic"
            ANTHROPIC_MODEL="${ENV_MODEL:-$MY_MODEL}"
            ANTHROPIC_DEFAULT_OPUS_MODEL="${ENV_OPUS:-$MY_DEFAULT_OPUS_MODEL}"
            ANTHROPIC_DEFAULT_SONNET_MODEL="${ENV_SONNET:-$MY_DEFAULT_SONNET_MODEL}"
            ANTHROPIC_DEFAULT_HAIKU_MODEL="${ENV_HAIKU:-$MY_DEFAULT_HAIKU_MODEL}"
            CLAUDE_CODE_SUBAGENT_MODEL="${ENV_SUBAGENT:-$MY_SUBAGENT_MODEL}"
            echo "✅ 已选择: DeepSeek 官方"
            ;;
    esac
    echo ""
else
    ANTHROPIC_BASE_URL="$ENV_BASE_URL"
    ANTHROPIC_MODEL="${ENV_MODEL:-$MY_MODEL}"
    ANTHROPIC_DEFAULT_OPUS_MODEL="${ENV_OPUS:-$MY_DEFAULT_OPUS_MODEL}"
    ANTHROPIC_DEFAULT_SONNET_MODEL="${ENV_SONNET:-$MY_DEFAULT_SONNET_MODEL}"
    ANTHROPIC_DEFAULT_HAIKU_MODEL="${ENV_HAIKU:-$MY_DEFAULT_HAIKU_MODEL}"
    CLAUDE_CODE_SUBAGENT_MODEL="${ENV_SUBAGENT:-$MY_SUBAGENT_MODEL}"
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo ""
    echo "🔑 请输入你的 API Key："
    echo "   当前平台: $ANTHROPIC_BASE_URL"
    echo ""
    printf "API Key: "
    read -r USER_API_KEY
    if [ -n "$USER_API_KEY" ]; then
        ANTHROPIC_API_KEY="$USER_API_KEY"
        echo "✅ API Key 已设置"
    else
        echo "⚠️  未输入 API Key，将跳过配置文件生成"
    fi
    echo ""
fi

ROOT_CLAUDE_DIR="/root/.claude"
ADMIN_CLAUDE_DIR="/home/admin/.claude"
PLUGINS_DIR="$ROOT_CLAUDE_DIR/plugins"

# 项目根目录（skills CLI 安装到当前工作目录，需先 cd 到此目录）
PROJECT_DIR="${CLAUDE_CODE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || echo '/workspace')}"

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

# -----------------------------------------------------------------------------
# 安装 gsap-skills（GreenSock 动画平台技能）
# -----------------------------------------------------------------------------
install_gsap_skills() {
    local SKILLS_DIR="$PROJECT_DIR/.agents/skills/gsap-core"

    # 检查是否已安装
    if [ -d "$SKILLS_DIR" ]; then
        echo "⏭️  gsap-skills 已安装，跳过"
        return
    fi

    echo "📦 正在安装 gsap-skills（8 个 GSAP 动画技能）..."
    cd "$PROJECT_DIR"
    # --all = --skill '*' --agent '*' -y（全选技能 + 全选 Agent + 跳过确认）
    npx --yes skills add https://github.com/greensock/gsap-skills --all 2>/dev/null || true

    if [ -d "$SKILLS_DIR" ]; then
        echo "✅ gsap-skills 安装完成"
    else
        echo "❌ gsap-skills 安装失败（可稍后手动安装）"
    fi
}

# -----------------------------------------------------------------------------
# 安装 taste-skill（前端设计品味技能）
# -----------------------------------------------------------------------------
install_taste_skill() {
    local SKILLS_DIR="$PROJECT_DIR/.agents/skills/design-taste-frontend"

    # 检查是否已安装
    if [ -d "$SKILLS_DIR" ]; then
        echo "⏭️  taste-skill 已安装，跳过"
        return
    fi

    echo "📦 正在安装 taste-skill（2 个前端设计品味技能：brandkit, design-taste-frontend）..."
    cd "$PROJECT_DIR"
    npx --yes skills add https://github.com/Leonxlnx/taste-skill \
        --skill 'brandkit,design-taste-frontend' \
        --agent '*' \
        -y 2>/dev/null || true

    if [ -d "$SKILLS_DIR" ]; then
        echo "✅ taste-skill 安装完成"
    else
        echo "❌ taste-skill 安装失败（可稍后手动安装）"
    fi
}

# -----------------------------------------------------------------------------
# 安装 frontend-design-skills（前端设计综合技能）
# -----------------------------------------------------------------------------
install_frontend_design_skills() {
    local SKILLS_SRC="$PROJECT_DIR/skills-src"

    # 检查是否已安装：symlink 必须存在且目标有效
    if [ -L "$SKILLS_SRC" ] && [ -e "$SKILLS_SRC" ]; then
        echo "⏭️  frontend-design-skills 已安装，跳过"
        return
    fi

    # 清理残留断链（如上次 npx 缓存被清理导致的悬空 symlink）
    if [ -L "$SKILLS_SRC" ] && [ ! -e "$SKILLS_SRC" ]; then
        echo "🧹 检测到断链，清理旧 symlink..."
        rm -f "$SKILLS_SRC"
    fi

    echo "📦 正在安装 frontend-design-skills（22 个前端设计领域技能）..."
    cd "$PROJECT_DIR"
    npx --yes @flitzrrr/frontend-design-skills install claude-code 2>/dev/null || true

    if [ -L "$SKILLS_SRC" ] && [ -e "$SKILLS_SRC" ]; then
        echo "✅ frontend-design-skills 安装完成"
    else
        echo "❌ frontend-design-skills 安装失败（可稍后手动安装）"
    fi
}

# 安装所有 skills
install_karpathy_skills
install_gsap_skills
install_taste_skill
install_frontend_design_skills

# -----------------------------------------------------------------------------
# 注册 Skills 为斜杠命令（创建 symlink 到 Claude Code skills 目录）
# -----------------------------------------------------------------------------
register_skills() {
    echo "🔗 正在注册 Skills 为 / 命令..."

    # gsap-skills（来自 greensock/gsap-skills）
    rm -rf "$ROOT_CLAUDE_DIR/skills/gsap-skills/skills"
    mkdir -p "$ROOT_CLAUDE_DIR/skills/gsap-skills/skills"
    for skill in gsap-core gsap-timeline gsap-scrolltrigger gsap-plugins gsap-react gsap-frameworks gsap-performance gsap-utils; do
        local src="$PROJECT_DIR/.agents/skills/$skill"
        if [ -d "$src" ]; then
            ln -sfn "$src" "$ROOT_CLAUDE_DIR/skills/gsap-skills/skills/$skill" 2>/dev/null
        fi
    done

    # taste-skill（来自 Leonxlnx/taste-skill，仅安装 brandkit 和 design-taste-frontend）
    rm -rf "$ROOT_CLAUDE_DIR/skills/taste-skill/skills"
    mkdir -p "$ROOT_CLAUDE_DIR/skills/taste-skill/skills"
    for skill in brandkit design-taste-frontend; do
        local src="$PROJECT_DIR/.agents/skills/$skill"
        if [ -d "$src" ]; then
            ln -sfn "$src" "$ROOT_CLAUDE_DIR/skills/taste-skill/skills/$skill" 2>/dev/null
        fi
    done

    # frontend-design-skills（来自 npm @flitzrrr/frontend-design-skills）
    rm -rf "$ROOT_CLAUDE_DIR/skills/frontend-design/skills"
    mkdir -p "$ROOT_CLAUDE_DIR/skills/frontend-design/skills"
    for skill in accessibility agent-ui-design ai-design-workflow branding-identity color-theory component-patterns customer-journey design-process design-trends images-media landing-pages navigation-design responsive-design ui-design ui-patterns usability ux-design visual-direction web-typography webdesign-review website-audit; do
        local src="$PROJECT_DIR/skills-src/$skill"
        if [ -d "$src" ] || [ -L "$src" ]; then
            ln -sfn "$src" "$ROOT_CLAUDE_DIR/skills/frontend-design/skills/$skill" 2>/dev/null
        fi
    done

    local count=$(find -L "$ROOT_CLAUDE_DIR/skills" -name "SKILL.md" -type f 2>/dev/null | wc -l)
    echo "✅ 已注册 $count 个 Skills 为 / 命令"
}

register_skills

echo ""
echo "=== Skills 配置状态 ==="
AVAILABLE_COUNT=$(find -L "$ROOT_CLAUDE_DIR/skills" -name "SKILL.md" -type f 2>/dev/null | wc -l)
echo "✅ 可用 Skill 总数: $AVAILABLE_COUNT"

# 分类统计
echo "   编码规范:     $(find -L "$ROOT_CLAUDE_DIR/skills/andrej-karpathy-skills" -name "SKILL.md" -type f 2>/dev/null | wc -l) 个 (andrej-karpathy-skills)"
echo "   GSAP 动画:    $(find -L "$ROOT_CLAUDE_DIR/skills/gsap-skills" -name "SKILL.md" -type f 2>/dev/null | wc -l) 个 (gsap-skills)"
echo "   设计品味:     $(find -L "$ROOT_CLAUDE_DIR/skills/taste-skill" -name "SKILL.md" -type f 2>/dev/null | wc -l) 个 (taste-skill)"
echo "   前端设计:     $(find -L "$ROOT_CLAUDE_DIR/skills/frontend-design" -name "SKILL.md" -type f 2>/dev/null | wc -l) 个 (frontend-design)"

if [ "$AVAILABLE_COUNT" -ge 20 ]; then
    echo ""
    echo "🎉 所有 Skills 就绪！重启 Claude Code 后可直接用 / 命令调用。"
    echo "   例如: /gsap-core, /ui-design, /color-theory, /webdesign-review 等"
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "⚠️  警告: 未设置 ANTHROPIC_API_KEY"
    echo ""
    echo "   可通过以下方式提供 API Key:"
    echo "   1. 重新运行脚本并在提示时输入: bash /workspace/scripts/init-claude.sh"
    echo "   2. 通过环境变量: ANTHROPIC_API_KEY=\"sk-你的密钥\" bash /workspace/scripts/init-claude.sh"
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