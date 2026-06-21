# ===================================================================
# Qoder 配置初始化脚本
# ===================================================================
# 功能: 安装 Qoder CLI 终端原生 AI 编程助手
# 官网: https://qoder.com
# 说明: Qoder 围绕真实代码协同开发，支持从开发、调试到上线全流程
#       支持 Claude、GPT、Gemini 等主流模型，内置终端 IDE
#
# 一键运行:
#   bash /workspace/scripts/init-qoder.sh
# ===================================================================

set -e

# -----------------------------------------------------------------------------
# 用户配置区
# -----------------------------------------------------------------------------

# 安装方式: curl (官方一键脚本)
INSTALL_METHOD="${QODER_INSTALL_METHOD:-curl}"

# 安装脚本地址
INSTALL_URL="https://qoder.com/install"

# 注意: Qoder CLI 安装后的二进制名为 qodercli，非 qoder
QODER_BIN="qodercli"

# -----------------------------------------------------------------------------
# 安装函数
# -----------------------------------------------------------------------------

install_qoder_cli() {
    case "$INSTALL_METHOD" in
        curl|*)
            echo "📦 通过 curl 安装 Qoder CLI..."

            # 检查是否已安装
            if command -v "$QODER_BIN" &>/dev/null; then
                echo "⏭️  Qoder CLI 已安装，当前版本: $($QODER_BIN --version 2>/dev/null || echo 'unknown')"
                return 0
            fi

            # 官方一键安装脚本
            curl -fsSL "$INSTALL_URL" | bash
            ;;
    esac
}

# -----------------------------------------------------------------------------
# 验证安装
# -----------------------------------------------------------------------------

verify_installation() {
    echo ""

    # 刷新 PATH（安装脚本可能写入 shell 配置文件）
    for rc in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
        [ -f "$rc" ] && source "$rc" 2>/dev/null || true
    done

    # 尝试常见安装路径
    for p in "$HOME/.qoder/bin" "$HOME/bin" "$HOME/.local/bin" "/usr/local/bin"; do
        [ -d "$p" ] && export PATH="$p:$PATH"
    done

    if command -v "$QODER_BIN" &>/dev/null; then
        echo "✅ Qoder CLI 安装成功！"
        echo "   版本: $($QODER_BIN --version 2>/dev/null || echo 'unknown')"
        echo ""
        echo "   使用方式:"
        echo "     qodercli                     # 启动交互式终端"
        echo "     qodercli \"你的问题\"            # 单次提问"
        echo "     qodercli --help               # 查看帮助"
        echo ""
        echo "   特点:"
        echo "     - 终端原生 AI 编程助手"
        echo "     - 支持多模型（Claude / GPT / Gemini）"
        echo "     - 内置代码编辑与 Diff 预览"
        echo "     - 支持开发、调试、上线全流程"
    else
        echo ""
        echo "❌ Qoder CLI 安装失败，请手动安装:"
        echo "   curl -fsSL https://qoder.com/install | bash"
        exit 1
    fi
}

# -----------------------------------------------------------------------------
# 主流程
# -----------------------------------------------------------------------------

echo "=== Qoder 配置初始化 ==="
echo ""
echo "Qoder 是终端原生 AI 编程助手，围绕真实代码协同开发。"
echo "官网: https://qoder.com"
echo ""

# 安装 CLI
install_qoder_cli

# 验证安装
verify_installation

echo ""
echo "=== 所有配置完成 ==="
