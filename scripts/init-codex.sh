# ===================================================================
# CodeX 配置初始化脚本
# ===================================================================
# 功能: 根据环境变量或默认值生成 CodeX CLI 配置文件
# 配置路径: /root/.codex/ 和 /home/admin/.codex/
#
# 一键运行:
#   bash /workspace/scripts/init-codex.sh
# ===================================================================

set -e

# ===================================================================
# 用户配置区
# ===================================================================

# 填入你的 API Key: sk-xxx
MY_API_KEY=""           
# 中转站地址：
# - https://api.aifamily.vip/v1
# - https://laoni.laonics.top/v1
MY_BASE_URL="https://laoni.laonics.top/v1"  
MY_MODEL="gpt-5.4"      # 可选:gpt-5.4、gpt-5.5、gpt-5.3-codex

# ===================================================================
# 配置读取逻辑（无需修改下方代码）
# ===================================================================

CODEX_API_KEY="${CODEX_API_KEY:-$MY_API_KEY}"
CODEX_BASE_URL="${CODEX_BASE_URL:-$MY_BASE_URL}"
CODEX_MODEL="${CODEX_MODEL:-$MY_MODEL}"

ROOT_CODEX_DIR="/root/.codex"
ADMIN_CODEX_DIR="/home/admin/.codex"

echo "=== CodeX 配置初始化 ==="

if [ -z "$CODEX_API_KEY" ]; then
    echo "⚠️  警告: 未设置 CODEX_API_KEY"
    echo ""
    echo "   快速配置方法:"
    echo "   1. 编辑本脚本: vim /usr/local/bin/init-codex.sh"
    echo "   2. 修改第 12 行: MY_API_KEY=\"sk-你的API密钥\""
    echo "   3. 保存并运行: /usr/local/bin/init-codex.sh"
    echo ""
    mkdir -p "$ROOT_CODEX_DIR" "$ADMIN_CODEX_DIR"
else
    echo "✅ 检测到 CODEX_API_KEY，正在生成配置文件..."

    mkdir -p "$ROOT_CODEX_DIR"

    cat > "$ROOT_CODEX_DIR/config.toml" << EOF
model_provider = "my_codex"
model = "${CODEX_MODEL}"
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.my_codex]
name = "my_codex"
wire_api = "responses"
requires_openai_auth = true
base_url = "${CODEX_BASE_URL}"

[linux]
sandbox = "elevated"
EOF

    cat > "$ROOT_CODEX_DIR/auth.json" << EOF
{
    "OPENAI_API_KEY": "${CODEX_API_KEY}"
}
EOF

    echo "✅ 已创建 /root/.codex/config.toml"
    echo "✅ 已创建 /root/.codex/auth.json"

    mkdir -p "$ADMIN_CODEX_DIR"
    cp "$ROOT_CODEX_DIR/config.toml" "$ADMIN_CODEX_DIR/"
    cp "$ROOT_CODEX_DIR/auth.json" "$ADMIN_CODEX_DIR/"

    echo "✅ 已创建 /home/admin/.codex/ 配置"
    echo ""
    echo "=== CodeX 配置完成 ==="
    echo "中转站: ${CODEX_BASE_URL}"
    echo "模型: ${CODEX_MODEL}"
fi

echo ""