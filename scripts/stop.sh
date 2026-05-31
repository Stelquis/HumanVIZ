# ===================================================================
# HumanViz 停止脚本
# ===================================================================
# 功能: 安全停止所有相关服务（前端 + 后端）
# 配置路径: /workspace/HumanVIZ/
# 端口: 前端 5200, 后端 5000
#
# 一键运行:
#   bash /workspace/scripts/stop.sh
# ===================================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 停止进程
kill_process() {
    local pid=$1
    local name=$2
    
    if [ -n "$pid" ] && [ "$pid" != "" ]; then
        if kill -0 $pid 2>/dev/null; then
            print_info "正在停止 $name (PID: $pid)..."
            kill $pid 2>/dev/null || true
            sleep 1
            # 强制终止如果还在运行
            if kill -0 $pid 2>/dev/null; then
                kill -9 $pid 2>/dev/null || true
                sleep 1
            fi
            if ! kill -0 $pid 2>/dev/null; then
                print_success "$name 已停止"
                return 0
            else
                print_error "$name 停止失败"
                return 1
            fi
        else
            print_warning "$name (PID: $pid) 未在运行"
            return 0
        fi
    fi
    return 0
}

# 清理端口占用
cleanup_port() {
    local port=$1
    local name=$2
    
    local pid=$(lsof -Pi :$port -sTCP:LISTEN -t 2>/dev/null || echo "")
    if [ -n "$pid" ]; then
        print_warning "端口 $port ($name) 被进程 PID $pid 占用"
        kill_process $pid "$name"
    fi
}

# 主函数
main() {
    echo ""
    echo "=========================="
    echo "🛑 HumanViz 停止脚本"
    echo "=========================="
    echo ""
    
    # 获取脚本所在目录
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    cd "$SCRIPT_DIR/../HumanVIZ"
    
    # 停止已记录的进程
    if [ -f ".pids" ]; then
        local pids=$(cat .pids)
        local frontend_pid=$(echo $pids | awk '{print $1}')
        local backend_pid=$(echo $pids | awk '{print $2}')
        
        kill_process $frontend_pid "前端服务"
        kill_process $backend_pid "后端服务"
        
        rm -f .pids
        print_success "进程记录已清理"
    fi
    
    # 清理端口占用
    cleanup_port 5200 "前端服务"
    cleanup_port 5000 "后端服务"
    
    # 清理残留进程
    local vite_pids=$(pgrep -f "vite" 2>/dev/null || true)
    local uvicorn_pids=$(pgrep -f "uvicorn" 2>/dev/null || true)
    
    for pid in $vite_pids; do
        kill_process $pid "Vite 进程"
    done
    
    for pid in $uvicorn_pids; do
        kill_process $pid "Uvicorn (FastAPI) 进程"
    done
    
    echo ""
    print_success "=========================="
    print_success "✅ HumanViz 已停止"
    print_success "=========================="
    echo ""
}

# 运行主函数
main
