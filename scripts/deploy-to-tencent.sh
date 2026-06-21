#!/usr/bin/env bash
# ===================================================================
# HumanVIZ 腾讯云轻量服务器部署脚本
# ===================================================================
# 用途: 将 HumanVIZ 系统一键部署到腾讯云轻量应用服务器
# 场景: 每次重启 CNB 云原生开发环境后，服务器上的配置不受影响
#       但如果需要更新代码/重新部署，运行此脚本即可
#
# 前提条件:
#   1. 腾讯云轻量服务器已开通（Ubuntu 24.04）
#   2. 服务器防火墙已放通 22、80、443 端口
#   3. CNB 环境已安装 sshpass（apt install -y sshpass）
#
# 用法:
#   bash /workspace/scripts/deploy-to-tencent.sh              # 完整部署
#   bash /workspace/scripts/deploy-to-tencent.sh update       # 仅更新代码并重启
#   bash /workspace/scripts/deploy-to-tencent.sh status       # 查看服务器状态
#   bash /workspace/scripts/deploy-to-tencent.sh logs         # 查看后端日志
# ===================================================================

set -e

# ==================== 服务器配置 ====================
SERVER_IP="42.194.193.223"
SERVER_USER="ubuntu"
SERVER_PASSWORD=""  # 留空则交互式输入，填写则直接使用
DEPLOY_DIR="/app/HumanVIZ"
FRONTEND_DIR="/app/HumanVIZ/HumanVIZ"
BACKEND_DIR="/app/HumanVIZ/HumanVIZ/backend"
VENV_DIR="/app/venv"
DIST_DIR="/app/HumanVIZ/HumanVIZ/dist"
NGINX_CONF="/etc/nginx/sites-available/humanviz"
SYSTEMD_SERVICE="humanviz-backend"

# ==================== LLM API 配置 ====================
API_KEY=""
MODEL="deepseek-chat"
BASE_URL="https://api.deepseek.com/v1"
PROVIDER="DeepSeek"

# ==================== 构建配置 ====================
NODE_MEMORY="1900"  # Vite 构建时 Node.js 最大内存（MB），2GB 服务器需要 1900 才能装下 1473 个 ribbon JSON

# ==================== 颜色定义 ====================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[OK]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
print_step()    { echo -e "${CYAN}[STEP]${NC} $1"; }

# ==================== SSH 工具函数 ====================
# 检查 sshpass 是否可用
check_sshpass() {
    if ! command -v sshpass &>/dev/null; then
        print_error "未找到 sshpass，正在安装..."
        sudo apt-get update -qq && sudo apt-get install -y -qq sshpass
        print_success "sshpass 安装完成"
    fi
}

# 在远程服务器执行命令
remote_exec() {
    sshpass -p "$SERVER_PASSWORD" ssh -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_IP" "$1"
}

# 传输文件到远程服务器
remote_copy() {
    sshpass -p "$SERVER_PASSWORD" scp -o StrictHostKeyChecking=no "$1" "$SERVER_USER@$SERVER_IP:$2"
}

# ==================== 密码输入 ====================
input_password() {
    # 如果已配置密码则直接使用，无需交互输入
    if [ -n "$SERVER_PASSWORD" ]; then
        print_info "使用已配置的服务器密码..."
    else
        echo ""
        echo "=========================================="
        echo "  HumanVIZ 腾讯云服务器部署"
        echo "  服务器: $SERVER_IP ($SERVER_USER)"
        echo "=========================================="
        echo ""
        read -s -p "请输入服务器 SSH 密码: " SERVER_PASSWORD
        echo ""
    fi

    # 验证连接
    print_info "验证 SSH 连接..."
    if remote_exec "echo '连接成功'" 2>/dev/null | grep -q "连接成功"; then
        print_success "SSH 连接验证通过"
    else
        print_error "SSH 连接失败，请检查密码"
        exit 1
    fi
}

# ==================== 步骤 1: 安装系统依赖 ====================
install_system_deps() {
    print_step "1/7 安装系统依赖..."

    remote_exec "sudo apt-get update -qq && sudo apt-get upgrade -y -qq" 2>/dev/null

    # 基础工具 + Python + Nginx
    remote_exec "sudo apt-get install -y -qq git curl wget python3 python3-pip python3-venv nginx" 2>/dev/null

    # Node.js 22.x
    remote_exec "curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -" 2>/dev/null
    remote_exec "sudo apt-get install -y -qq nodejs" 2>/dev/null

    # Yarn
    remote_exec "sudo npm install -g yarn" 2>/dev/null

    # UV（参考 Dockerfile 第四部分）
    remote_exec "curl -LsSf https://astral.sh/uv/install.sh | sh" 2>/dev/null

    print_success "系统依赖安装完成"
    remote_exec "echo '  Node.js:' \$(node --version) && echo '  Yarn:' \$(yarn --version) && echo '  Python:' \$(python3 --version) && echo '  Nginx:' \$(nginx -v 2>&1)"
}

# ==================== 步骤 2: 拉取代码 ====================
clone_code() {
    print_step "2/7 拉取代码..."

    # 先尝试从 CNB 仓库拉取（国内速度快）
    if remote_exec "if [ ! -d $DEPLOY_DIR ]; then sudo mkdir -p /app && sudo chown $SERVER_USER:$SERVER_USER /app && cd /app && git clone https://cnb.cool/OrionDawn/HumanVIZ.git && echo 'CNB_CLONE_OK'; else echo 'DIR_EXISTS'; fi" | grep -q "CNB_CLONE_OK"; then
        print_success "代码从 CNB 仓库拉取成功"
    else
        print_info "代码目录已存在，拉取最新版本..."
        remote_exec "cd $DEPLOY_DIR && git pull"
        print_success "代码已更新"
    fi
}

# ==================== 步骤 3: 配置 LLM 密钥 ====================
configure_secrets() {
    print_step "3/7 配置 LLM 密钥..."

    remote_exec "cat > $DEPLOY_DIR/secrets.json << 'EOF'
{
  \"api_key\": \"${API_KEY}\",
  \"model\": \"${MODEL}\",
  \"base_url\": \"${BASE_URL}\",
  \"provider\": \"${PROVIDER}\"
}
EOF"
    print_success "secrets.json 配置完成"
}

# ==================== 步骤 4: 安装 Python 依赖 ====================
install_python_deps() {
    print_step "4/7 安装 Python 依赖（参考 Dockerfile 第四/五部分，使用 UV 加速）..."

    # 创建虚拟环境（如不存在）
    remote_exec "if [ ! -d $VENV_DIR ]; then python3 -m venv $VENV_DIR; echo 'VENV_CREATED'; else echo 'VENV_EXISTS'; fi"

    # 使用 UV 安装依赖（参考 Dockerfile 中 uv pip install 方式）
    remote_exec "source $VENV_DIR/bin/activate && export PATH=\$HOME/.local/bin:\$PATH && uv pip install -r $DEPLOY_DIR/requirements.txt"

    print_success "Python 依赖安装完成"
}

# ==================== 步骤 5: 构建前端 ====================
build_frontend() {
    print_step "5/7 构建前端（Vite 生产构建，替代开发模式的 yarn dev）..."

    # Vite 插件 operaRibbonPlugin 自动从 data/processed/ 复制 ribbon JSON 到 dist/
    # 不再需要符号链接修复

    remote_exec "cd $FRONTEND_DIR && yarn install --frozen-lockfile 2>/dev/null || yarn install"

    # 限制 Node.js 内存，防止 2GB 服务器 OOM（1473 个 ribbon JSON 需要 ~1900MB）
    remote_exec "cd $FRONTEND_DIR && NODE_OPTIONS=\"--max-old-space-size=${NODE_MEMORY}\" yarn build"

    # 验证构建产物
    if remote_exec "if [ -d $DIST_DIR ]; then echo 'DIST_OK'; else echo 'DIST_MISSING'; fi" | grep -q "DIST_OK"; then
        print_success "前端构建完成，产物位于 $DIST_DIR"
    else
        print_error "前端构建失败，dist 目录不存在"
        exit 1
    fi
}

# ==================== 步骤 6: 配置后端 systemd 服务 ====================
configure_backend_service() {
    print_step "6/7 配置后端 systemd 服务（替代 nohup，实现开机自启 + 崩溃自动重启）..."

    # 先停止旧服务（如果存在）
    remote_exec "sudo systemctl stop $SYSTEMD_SERVICE 2>/dev/null || true"

    # 写入 systemd 服务文件
    remote_exec "sudo tee /etc/systemd/system/$SYSTEMD_SERVICE.service > /dev/null << 'SVCEOF'
[Unit]
Description=HumanVIZ Backend (FastAPI)
After=network.target

[Service]
Type=simple
User=$SERVER_USER
WorkingDirectory=$BACKEND_DIR
Environment=\"PYTHONPATH=$BACKEND_DIR\"
ExecStart=$VENV_DIR/bin/uvicorn main:app --host 0.0.0.0 --port 5000
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVCEOF"

    # 修改 CORS 配置，加入服务器 IP
    remote_exec "if ! grep -q '$SERVER_IP' $BACKEND_DIR/core/config.py; then sed -i '/http:\/\/127.0.0.1:5200/a\\    \"http://$SERVER_IP\",' $BACKEND_DIR/core/config.py; echo 'CORS_UPDATED'; else echo 'CORS_ALREADY_SET'; fi"

    # 启动服务
    remote_exec "sudo systemctl daemon-reload && sudo systemctl enable $SYSTEMD_SERVICE && sudo systemctl start $SYSTEMD_SERVICE"

    # 等待并验证
    sleep 3
    local status=$(remote_exec "sudo systemctl is-active $SYSTEMD_SERVICE")
    if [ "$status" = "active" ]; then
        print_success "后端服务运行中 (systemd: $SYSTEMD_SERVICE)"
    else
        print_error "后端服务启动失败"
        remote_exec "sudo journalctl -u $SYSTEMD_SERVICE --no-pager -n 20"
        exit 1
    fi
}

# ==================== 步骤 7: 配置 Nginx 反向代理 ====================
configure_nginx() {
    print_step "7/7 配置 Nginx 反向代理（替代 Vite dev server + proxy）..."

    # 生成 Nginx 配置到本地临时文件
    local tmp_nginx="/tmp/humanviz-nginx.conf"
    cat > "$tmp_nginx" << 'NGINXEOF'
server {
    listen 80;
    server_name _;
    client_max_body_size 100m;

    # Gzip 压缩
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 256;

    # 前端静态文件（yarn build 产物）
    root /app/HumanVIZ/HumanVIZ/dist;
    index index.html;

    # API 请求转发到后端
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 管理后台转发到后端
    location /HumanVIZ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API 文档
    location /docs {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
    }
    location /openapi.json {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
    }
    location /redoc {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
    }

    # SPA 路由：所有非文件路径返回 index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINXEOF

    # 传输配置文件到服务器
    remote_copy "$tmp_nginx" "/tmp/humanviz-nginx.conf"

    # 启用站点配置
    remote_exec "sudo cp /tmp/humanviz-nginx.conf $NGINX_CONF && sudo ln -sf $NGINX_CONF /etc/nginx/sites-enabled/ && sudo rm -f /etc/nginx/sites-enabled/default && sudo nginx -t && sudo systemctl restart nginx"

    print_success "Nginx 配置完成"
}

# ==================== 验证部署 ====================
verify_deployment() {
    echo ""
    print_step "验证部署结果..."
    echo ""

    local all_ok=true

    # 检查前端
    local frontend_status=$(remote_exec "curl -s -o /dev/null -w '%{http_code}' http://localhost/")
    if [ "$frontend_status" = "200" ]; then
        print_success "前端页面: HTTP $frontend_status"
    else
        print_error "前端页面: HTTP $frontend_status"
        all_ok=false
    fi

    # 检查后端
    local backend_status=$(remote_exec "curl -s -o /dev/null -w '%{http_code}' http://localhost:5000/docs")
    if [ "$backend_status" = "200" ]; then
        print_success "后端 API: HTTP $backend_status"
    else
        print_error "后端 API: HTTP $backend_status"
        all_ok=false
    fi

    # 检查 Nginx 代理
    local proxy_status=$(remote_exec "curl -s -o /dev/null -w '%{http_code}' http://localhost/api/v1/status 2>/dev/null || echo '404'")
    print_info "Nginx API 代理: HTTP $proxy_status"

    echo ""
    if [ "$all_ok" = true ]; then
        print_success "============================================"
        print_success "  部署成功！"
        print_success "============================================"
        echo ""
        print_info "访问地址: http://$SERVER_IP"
        print_info "API 文档: http://$SERVER_IP/docs"
        print_info "管理后台: http://$SERVER_IP/HumanVIZ"
    else
        print_warning "部分服务异常，请检查日志"
    fi
}

# ==================== 更新模式 ====================
do_update() {
    echo ""
    print_info "=========================================="
    print_info "  更新部署（代码更新 + 重新构建）"
    print_info "=========================================="
    echo ""

    input_password

    # 丢弃本地改动（避免符号链接等手动修复导致 git pull 冲突）
    print_step "1/4 拉取最新代码..."
    remote_exec "cd $DEPLOY_DIR && git restore . && git pull"
    print_success "代码已更新"

    # 重新构建前端（Vite 插件自动处理 ribbon 数据）
    print_step "2/4 重新构建前端..."
    remote_exec "cd $FRONTEND_DIR && yarn install && NODE_OPTIONS=\"--max-old-space-size=${NODE_MEMORY}\" yarn build"
    print_success "前端构建完成"

    # 更新 Python 依赖（如有新增）
    print_step "3/4 更新 Python 依赖..."
    remote_exec "source $VENV_DIR/bin/activate && export PATH=\$HOME/.local/bin:\$PATH && uv pip install -r $DEPLOY_DIR/requirements.txt"
    print_success "Python 依赖已是最新"

    # 重启后端
    print_step "4/4 重启后端服务..."
    remote_exec "sudo systemctl restart $SYSTEMD_SERVICE"
    sleep 2
    local status=$(remote_exec "sudo systemctl is-active $SYSTEMD_SERVICE")
    if [ "$status" = "active" ]; then
        print_success "后端服务已重启"
    else
        print_error "后端重启失败"
        remote_exec "sudo journalctl -u $SYSTEMD_SERVICE --no-pager -n 20"
        exit 1
    fi

    # 重载 Nginx
    remote_exec "sudo nginx -t && sudo systemctl reload nginx"
    print_success "Nginx 已重载"

    echo ""
    print_success "更新完成！访问: http://$SERVER_IP"
}

# ==================== 查看状态 ====================
do_status() {
    echo ""
    print_info "=========================================="
    print_info "  服务器部署状态"
    print_info "=========================================="
    echo ""

    input_password

    echo "--- systemd 后端服务 ---"
    remote_exec "sudo systemctl status $SYSTEMD_SERVICE --no-pager | head -10"

    echo ""
    echo "--- Nginx 状态 ---"
    remote_exec "sudo systemctl status nginx --no-pager | head -5"

    echo ""
    echo "--- 端口监听 ---"
    remote_exec "sudo ss -tlnp | grep -E ':(80|5000) '"

    echo ""
    echo "--- 磁盘使用 ---"
    remote_exec "df -h / | tail -1"

    echo ""
    echo "--- 内存使用 ---"
    remote_exec "free -h | head -2"

    echo ""
    echo "--- 前端构建产物 ---"
    remote_exec "ls -lh $DIST_DIR/index.html 2>/dev/null || echo 'dist 目录不存在'"

    echo ""
    echo "--- 代码版本 ---"
    remote_exec "cd $DEPLOY_DIR && git log --oneline -1"
}

# ==================== 查看日志 ====================
do_logs() {
    echo ""
    print_info "查看后端日志（Ctrl+C 退出）..."
    echo ""

    input_password

    remote_exec "sudo journalctl -u $SYSTEMD_SERVICE -f --no-pager -n 50"
}

# ==================== 完整部署 ====================
do_full_deploy() {
    echo ""
    echo "============================================"
    echo "  HumanVIZ 腾讯云服务器部署"
    echo "  服务器: $SERVER_IP ($SERVER_USER)"
    echo "============================================"
    echo ""

    input_password

    install_system_deps
    clone_code
    configure_secrets
    install_python_deps
    build_frontend
    configure_backend_service
    configure_nginx

    verify_deployment
}

# ==================== 主入口 ====================
# 统一前置检查：确保远程连接工具已安装
check_sshpass

case "${1:-}" in
    update)
        do_update
        ;;
    status)
        do_status
        ;;
    logs)
        do_logs
        ;;
    *)
        do_full_deploy
        ;;
esac

