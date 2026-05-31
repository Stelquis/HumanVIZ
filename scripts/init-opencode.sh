# ===================================================================
# OpenCode 安装脚本
# ===================================================================
# 功能: 安装 OpenCode CLI + VS Code 插件
# 项目: https://github.com/anomalyco/opencode
# 一键运行:
#   bash ./scripts/init-opencode.sh
#
# -------------------------------------------------------------------
# 免费可用模型速览
# -------------------------------------------------------------------
# 1. DSv4flash (DeepSeek / 深度求索)
#    - 架构: MoE, 284B 总参 / ~13B 激活
#    - 上下文: 1M tokens
#    - 特色: 混合注意力 (CSA+HCA)，支持 Non-think / Think High / Think Max 推理模式
#    - 定位: 高效推理，极致性价比
#
# 2. MiMo V2.5 (小米)
#    - 架构: MoE，全模态 (文本/图像/音频/视频)
#    - 上下文: 1M tokens
#    - 特色: 复杂软件工程 Agent、长程推理 (long-horizon reasoning)、TTS 语音合成
#    - 定位: 全模态 Agent 大脑
#
# 3. Nemotron 3 Super (NVIDIA)
#    - 架构: MoE, 120B 总参 / ~12B 激活
#    - 上下文: 百万级 tokens
#    - 特色: 开源权重+训练数据，SFT+RLVR+RLHF 多阶段训练
#    - 定位: 大规模多智能体协作系统
# ===================================================================

set -e

# -----------------------------------------------------------------------------
# 用户配置区
# -----------------------------------------------------------------------------

# 安装方式: npm | curl (默认 npm，利用 Dockerfile 中已装的 Node.js)
INSTALL_METHOD="${OPENCODE_INSTALL_METHOD:-npm}"

# npm 全局安装包名
NPM_PACKAGE="opencode-ai@latest"

# VS Code / code-server 扩展 ID
VSCODE_EXT_ID="sst-dev.opencode"

# -----------------------------------------------------------------------------
# 安装函数
# -----------------------------------------------------------------------------

install_opencode_cli() {
    case "$INSTALL_METHOD" in
        curl)
            echo "📦 通过 curl 一键安装 OpenCode CLI..."
            if command -v opencode &>/dev/null; then
                echo "⏭️  OpenCode CLI 已安装，当前版本: $(opencode --version 2>/dev/null || echo 'unknown')"
                return 0
            fi
            curl -fsSL https://opencode.ai/install | bash
            ;;
        npm|*)
            echo "📦 通过 npm 安装 OpenCode CLI..."
            if command -v opencode &>/dev/null; then
                echo "⏭️  OpenCode CLI 已安装，当前版本: $(opencode --version 2>/dev/null || echo 'unknown')"
                return 0
            fi
            npm i -g "$NPM_PACKAGE"
            ;;
    esac
}

install_opencode_vscode_ext() {
    echo ""
    echo "📦 安装 OpenCode VS Code 插件..."

    # 检查 code-server 命令是否可用
    if command -v code-server &>/dev/null; then
        echo "   通过 code-server 安装扩展: $VSCODE_EXT_ID"
        code-server --install-extension "$VSCODE_EXT_ID" 2>/dev/null && {
            echo "✅ OpenCode VS Code 插件安装完成"
            return 0
        } || {
            echo "⚠️  code-server 安装失败，尝试 Open VSX Registry..."
        }
    fi

    # 回退: 通过 Open VSX Registry 安装（code-server 默认使用 open-vsx）
    if command -v code-server &>/dev/null; then
        code-server --install-extension "$VSCODE_EXT_ID" --force 2>/dev/null || {
            echo "⚠️  插件安装失败，请手动在 VS Code 扩展市场搜索 'opencode' 安装"
            return 1
        }
    else
        echo "⚠️  未检测到 code-server，跳过插件安装"
        echo "   请在 VS Code 扩展市场搜索 'opencode' 手动安装"
        return 1
    fi

    echo "✅ OpenCode VS Code 插件安装完成"
}

# -----------------------------------------------------------------------------
# 主流程
# -----------------------------------------------------------------------------

echo "=== OpenCode 安装初始化 ==="
echo ""
echo "OpenCode 是开源的 AI 编程代理，免费使用。"
echo "项目地址: https://github.com/anomalyco/opencode"
echo ""

# 安装 CLI
install_opencode_cli

# 刷新 PATH（安装脚本可能写入 ~/.bashrc，当前 shell 未加载）
for rc in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
    [ -f "$rc" ] && source "$rc" 2>/dev/null || true
done
# 尝试常见安装路径
for p in "$HOME/.opencode/bin" "$HOME/bin" "$HOME/.local/bin" "/usr/local/bin"; do
    [ -d "$p" ] && export PATH="$p:$PATH"
done

# 验证 CLI 安装
if command -v opencode &>/dev/null; then
    echo ""
    echo "✅ OpenCode CLI 安装成功！"
    echo "   版本: $(opencode --version 2>/dev/null || echo 'unknown')"
    echo ""
    echo "   使用方式:"
    echo "     opencode                 # 启动交互式会话"
    echo "     opencode \"你的问题\"        # 单次提问"
    echo "     opencode --help           # 查看帮助"
    echo ""
    echo "   内置 Agent:"
    echo "     build - 默认，全权限开发 agent"
    echo "     plan  - 只读分析 agent（按 Tab 切换）"
else
    echo ""
    echo "❌ OpenCode CLI 安装失败，请手动安装:"
    echo "   npm i -g opencode-ai@latest"
    echo "   curl -fsSL https://opencode.ai/install | bash"
    exit 1
fi

# 安装 VS Code 插件
install_opencode_vscode_ext

echo ""
echo "=== 所有配置完成 ==="
echo ""
echo "🔔 提示: 请刷新浏览器页面以加载 OpenCode 插件"
echo "   快捷键: Cmd+Esc (Mac) / Ctrl+Esc (Windows/Linux) 快速启动"