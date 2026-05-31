# ===================================================================
# HumanVIZ 启动脚本
# ===================================================================
# 功能: 环境检查、自动清理、服务启动（前端 + 后端）
# 配置路径: /workspace/HumanVIZ/
# 端口: 前端 5200, 后端 5000
#
# 一键运行:
#   bash /workspace/scripts/start.sh
# ===================================================================

set -e

# ==================== 服务端口配置 ====================
FRONTEND_PORT=5200
BACKEND_PORT=5000

# ==================== LLM API 配置 ====================
# 统一使用 OpenAI 兼容格式，只需配置以下四项：
#   API_KEY    - 你的 API 密钥
#   MODEL      - 模型名称 (如: glm-4.7, gpt-4o-mini, gemini-pro)
#   BASE_URL   - API 基础地址 (OpenAI 兼容格式)
#   PROVIDER   - 厂商标识 (仅用于日志显示)
# =====================================================

API_KEY="ab4b658d80fda2ac5a6b30bd4fe74de9.YOWE1nAL6kFN8Ivc"
MODEL="glm-4.7"
BASE_URL="https://open.bigmodel.cn/api/paas/v4"
PROVIDER="Zhipu"

# ==================== 配置结束 ====================

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[OK]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 || netstat -tlnp 2>/dev/null | grep -q ":$port "; then
        echo "occupied"
    else
        echo "free"
    fi
}

get_port_pid() {
    lsof -Pi :$1 -sTCP:LISTEN -t 2>/dev/null || echo ""
}

kill_process() {
    local pid=$1
    local name=$2
    if [ -n "$pid" ] && kill -0 $pid 2>/dev/null; then
        print_info "正在停止 $name (PID: $pid)..."
        kill $pid 2>/dev/null || true
        sleep 1
        if kill -0 $pid 2>/dev/null; then
            kill -9 $pid 2>/dev/null || true
            sleep 1
        fi
        if ! kill -0 $pid 2>/dev/null; then
            print_success "$name 已停止"
        fi
    fi
}

cleanup_port() {
    local port=$1
    local name=$2
    local pid=$(get_port_pid $port)
    if [ -n "$pid" ]; then
        print_warning "端口 $port ($name) 被进程 PID $pid 占用"
        kill_process $pid $name
    fi
}

check_environment() {
    print_info "============================"
    print_info "🔍 开始环境检查..."
    print_info "============================"
    echo ""
    
    local has_error=0
    
    # 检查 Node.js
    print_info "检查 Node.js..."
    if command -v node &> /dev/null; then
        print_success "Node.js 版本: $(node --version)"
    else
        print_error "未找到 Node.js"
        has_error=1
    fi
    
    # 检查 Yarn
    print_info "检查 Yarn..."
    if command -v yarn &> /dev/null; then
        print_success "Yarn 版本: $(yarn --version)"
    else
        print_error "未找到 Yarn"
        has_error=1
    fi
    
    # 检查 Python
    print_info "检查 Python..."
    if command -v python3 &> /dev/null; then
        print_success "$(python3 --version)"
    else
        print_error "未找到 Python3"
        has_error=1
    fi
    
    # 检查 UV
    print_info "检查 UV..."
    if command -v uv &> /dev/null; then
        print_success "UV 已安装"
    else
        print_error "未找到 UV，请先安装: pip install uv"
        has_error=1
    fi
    
    # 检查端口
    print_info "检查端口占用..."
    if [ "$(check_port $FRONTEND_PORT)" == "occupied" ]; then
        cleanup_port $FRONTEND_PORT "前端服务"
    else
        print_success "端口 $FRONTEND_PORT 可用"
    fi
    
    if [ "$(check_port $BACKEND_PORT)" == "occupied" ]; then
        cleanup_port $BACKEND_PORT "后端服务"
    else
        print_success "端口 $BACKEND_PORT 可用"
    fi
    
    # 清理旧进程
    print_info "检查旧进程..."
    if [ -f ".pids" ]; then
        for pid in $(cat .pids); do
            if [ -n "$pid" ] && kill -0 $pid 2>/dev/null; then
                print_warning "发现旧进程 PID: $pid"
                kill_process $pid "旧服务进程"
            fi
        done
        rm -f .pids
        print_success "旧进程已清理"
    else
        print_success "未发现旧进程"
    fi
    
    echo ""
    if [ $has_error -eq 0 ]; then
        print_success "环境检查通过"
        return 0
    else
        print_error "环境检查失败"
        exit 1
    fi
}

check_python_module() {
    python -c "import $1" 2>/dev/null
}

prepare_python_env() {
    print_info "准备 Python 环境..."
    
    # 使用 Dockerfile 预装的虚拟环境 /opt/venv
    source /opt/venv/bin/activate
    print_success "虚拟环境已激活 (/opt/venv)"
    
    print_info "检查 Python 依赖..."
    
    # 定义项目所需依赖 (FastAPI 后端)
    local deps=("fastapi" "uvicorn" "langchain_openai" "pydantic")
    local missing_deps=""
    
    # 检查每个依赖
    for dep in "${deps[@]}"; do
        if ! python -c "import $dep" 2>/dev/null; then
            missing_deps="$missing_deps ${dep//_/-}"
        fi
    done
    
    # 安装缺失的依赖
    if [ -n "$missing_deps" ]; then
        print_warning "检测到缺失依赖:$missing_deps"
        print_info "正在安装缺失依赖..."
        uv pip install$missing_deps
        print_success "依赖安装完成"
    else
        print_success "所有依赖已安装"
    fi
    
    print_success "Python 环境准备完成"
}

generate_config() {
    print_info "生成配置文件..."
    
    cat > secrets.json << EOF
{
  "api_key": "${API_KEY}",
  "model": "${MODEL}",
  "base_url": "${BASE_URL}",
  "provider": "${PROVIDER}"
}
EOF
    
    print_success "配置文件已生成: secrets.json"
}

wait_for_backend() {
    local max_attempts=12
    local wait_seconds=2
    local attempt=1
    
    print_info "等待后端服务启动..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s http://localhost:$BACKEND_PORT/api/v1/status >/dev/null 2>&1; then
            print_success "后端服务响应正常 (尝试 $attempt/$max_attempts)"
            return 0
        fi
        print_info "后端服务尚未就绪，${wait_seconds}秒后重试... ($attempt/$max_attempts)"
        sleep $wait_seconds
        ((attempt++))
    done
    
    print_error "后端服务启动失败，请检查 backend.log"
    if [ -f "backend.log" ]; then
        print_info "后端日志最后20行:"
        tail -20 backend.log
    fi
    return 1
}

start_services() {
    print_info "============================"
    print_info "🚀 启动服务..."
    print_info "============================"
    echo ""
    
    local IP_ADDRESS=$(hostname -I | awk '{print $1}')
    
    # 切换到项目根目录（统一工作目录）
    cd /workspace/HumanVIZ
    
    # 启动后端 (FastAPI)
    print_info "启动后端服务 (FastAPI)..."
    
    # 使用绝对路径作为日志位置
    local LOG_FILE="/workspace/HumanVIZ/backend.log"
    
    # 进入 backend 目录，确保模块导入路径正确
    cd /workspace/HumanVIZ/backend
    
    # 使用 Dockerfile 预装的虚拟环境
    source /opt/venv/bin/activate
    
    # 添加 backend 目录到 PYTHONPATH
    export PYTHONPATH="/workspace/HumanVIZ/backend:${PYTHONPATH}"
    
    nohup python -m uvicorn main:app --host 0.0.0.0 --port $BACKEND_PORT > "$LOG_FILE" 2>&1 &
    # 注意：容器环境中不使用 --reload，避免文件监控问题
    local BACKEND_PID=$!
    cd /workspace/HumanVIZ
    
    print_success "后端服务已启动 (PID: $BACKEND_PID)"
    print_info "  - 本地地址: http://localhost:$BACKEND_PORT"
    print_info "  - 内网地址: http://$IP_ADDRESS:$BACKEND_PORT"
    print_info "  - API 文档: http://localhost:$BACKEND_PORT/docs"
    print_info "  - 管理后台: http://localhost:$BACKEND_PORT/HumanVIZ"
    print_info "  - 日志文件: $LOG_FILE"
    
    echo ""
    
    # 使用重试机制等待后端服务
    if ! wait_for_backend; then
        exit 1
    fi
    
    echo ""
    
    # 检查前端依赖
    print_info "检查前端依赖..."
    if [ ! -d "node_modules" ]; then
        print_warning "未找到 node_modules，正在安装前端依赖..."
        yarn install
        print_success "前端依赖安装完成"
    else
        print_success "前端依赖已安装"
    fi
    
    # 启动前端
    print_info "启动前端服务 (Vite)..."
    nohup yarn dev > frontend.log 2>&1 &
    local FRONTEND_PID=$!
    
    print_success "前端服务已启动 (PID: $FRONTEND_PID)"
    print_info "  - 本地地址: http://localhost:$FRONTEND_PORT"
    print_info "  - 内网地址: http://$IP_ADDRESS:$FRONTEND_PORT"
    print_info "  - 日志文件: frontend.log"
    
    # 等待前端服务启动
    print_info "等待前端服务启动..."
    local max_attempts=12
    local wait_seconds=2
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s http://localhost:$FRONTEND_PORT >/dev/null 2>&1; then
            print_success "前端服务响应正常 (尝试 $attempt/$max_attempts)"
            break
        fi
        print_info "前端服务尚未就绪，${wait_seconds}秒后重试... ($attempt/$max_attempts)"
        sleep $wait_seconds
        ((attempt++))
        
        if [ $attempt -gt $max_attempts ]; then
            print_error "前端服务启动失败，请检查 frontend.log"
            tail -20 frontend.log
            exit 1
        fi
    done
    
    # 保存 PID
    echo "$FRONTEND_PID $BACKEND_PID" > .pids
    
    echo ""
    print_success "============================"
    print_success "✅ HumanVIZ 启动成功!"
    print_success "============================"
    echo ""
    print_info "📱 手机访问: http://$IP_ADDRESS:$FRONTEND_PORT"
    print_info "💻 浏览器访问: http://localhost:$FRONTEND_PORT"
    print_info "🔗 API 服务: http://localhost:$BACKEND_PORT"
    print_info "📚 API 文档: http://localhost:$BACKEND_PORT/docs"
    print_info "🎛️  管理后台: http://localhost:$BACKEND_PORT/HumanVIZ"
    echo ""
    print_info "📝 日志文件:"
    print_info "   后端: backend.log"
    print_info "   前端: frontend.log"
    echo ""
    print_info "🛑 停止服务: ./stop.sh"
}

main() {
    echo ""
    echo "=============================="
    echo "🎭 HumanVIZ 启动脚本"
    echo "=============================="
    echo ""
    
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    cd "$SCRIPT_DIR/../HumanVIZ"
    
    check_environment
    prepare_python_env
    generate_config
    start_services
}

main
