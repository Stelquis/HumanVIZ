# ===================================================================
# Dockerfile
# ==================================================================='

# -----------------------------------------------------------------------------
# 第一部分: 基础镜像与环境变量
# -----------------------------------------------------------------------------

# 使用 Ubuntu 24.04 LTS 作为基础镜像
# 选择理由: 长期支持版本(LTS)，稳定性好，软件包丰富
FROM ubuntu:24.04

# 环境变量配置
#   DEBIAN_FRONTEND=noninteractive: 禁用交互式提示，避免安装时卡住
#   LANG/LANGUAGE=C.UTF-8:          设置 UTF-8 编码，支持中文显示和输入
#   DOCKER_HOST:                   Docker 守护进程地址
ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LANGUAGE=C.UTF-8 \
    DOCKER_HOST=unix:///var/run/docker.sock

# -----------------------------------------------------------------------------
# 第二部分: 系统源配置
# -----------------------------------------------------------------------------

# 配置阿里云 APT 镜像源（使用 HTTPS，后续会先安装证书）
RUN rm -rf /var/lib/apt/lists/* && \
    echo "deb https://mirrors.aliyun.com/ubuntu/ noble main restricted universe multiverse" > /etc/apt/sources.list && \
    echo "deb https://mirrors.aliyun.com/ubuntu/ noble-updates main restricted universe multiverse" >> /etc/apt/sources.list && \
    echo "deb https://mirrors.aliyun.com/ubuntu/ noble-backports main restricted universe multiverse" >> /etc/apt/sources.list && \
    echo "deb https://mirrors.aliyun.com/ubuntu/ noble-security main restricted universe multiverse" >> /etc/apt/sources.list

# -----------------------------------------------------------------------------
# 第三部分: 系统工具与 Node.js 安装
# -----------------------------------------------------------------------------

# 步骤1: 先安装 ca-certificates 和 curl，更新证书
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl && \
    update-ca-certificates

# 步骤2: 使用 NodeSource 安装 Node.js 22.x（稳定版本）
RUN curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh && \
    bash /tmp/nodesource_setup.sh && \
    rm /tmp/nodesource_setup.sh

# 步骤3: 安装其他系统工具与 Python 环境
# 说明: --no-install-recommends 避免安装不必要的推荐包
#
# 分组说明:
#   基础系统工具:
#     git / curl / wget / procps              版本控制与常用命令行工具
#   Python 环境:
#     python3-full / python3-venv / python3-dev  Python 3.12 解释器与开发环境
#     python-is-python3                       将 python 命令映射到 python3
#     libssl-dev / zlib1g-dev                 Python 包编译依赖
#   网络与安全工具:
#     apt-transport-https / gpg                APT HTTPS 支持与 GPG 密钥管理
#   SSH 与网络诊断:
#     openssh-client                          SSH 客户端，用于连接远程 Linux 服务器
#     iputils-ping / net-tools / iproute2     网络连通性测试与接口查看
#   系统管理工具:
#     sudo / htop / vim / less / lsof / psmisc  系统管理工具
#     build-essential                         GCC/G++ 编译工具
RUN apt-get install -y --no-install-recommends \
        git curl wget procps \
        python3-full python3-venv python3-dev python-is-python3 \
        apt-transport-https gpg \
        openssh-client iputils-ping net-tools iproute2 \
        sudo htop vim less lsof psmisc build-essential \
        libssl-dev zlib1g-dev nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    node --version && \
    npm --version

# 安装前端全局脚手架工具
# 说明: create-vite 用于快速创建基于 Vite 的现代化前端项目
# 优化: 使用国内 npm 镜像(npmmirror)加速下载
RUN npm config set registry https://registry.npmmirror.com && \
    npm install -g yarn create-vite

# -----------------------------------------------------------------------------
# 第四部分: UV 安装与虚拟环境配置
# -----------------------------------------------------------------------------

# 安装 UV - 极速 Python 包管理器（比 pip 快 10-100 倍）
# 官网: https://github.com/astral-sh/uv
# 说明: 安装脚本将二进制文件输出到 /root/.local/bin，此处移动到 /usr/local/bin 以加入 PATH
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    mv /root/.local/bin/uv /usr/local/bin/uv && \
    mv /root/.local/bin/uvx /usr/local/bin/uvx

# 设置 UV 缓存目录
ENV UV_CACHE_DIR=/opt/.uv-cache

# 使用 UV 创建虚拟环境
RUN uv venv /opt/venv --python 3.12

# 设置环境变量，容器启动后自动激活虚拟环境
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# -----------------------------------------------------------------------------
# 第五部分: Python 依赖安装
# -----------------------------------------------------------------------------
# 说明: 预装开发工具及项目依赖到虚拟环境，避免每次启动时重复安装
# 注意: 以下库列表与 /workspace/HumanVIZ/requirements.txt 保持一致
#
# 【开发工具】
#   ipython       - 增强型 Python 交互式解释器
#
# 【后端框架】Web Framework
#   fastapi       - 现代异步 Web 框架，支持自动 API 文档
#   uvicorn       - ASGI 服务器，运行 FastAPI 应用
#   python-multipart - 处理表单数据和多部分上传
#   jinja2        - HTML 模板引擎，用于渲染管理后台页面
#
# 【数据验证】Data Validation
#   pydantic      - 数据模型验证和序列化
#   pydantic-settings - 配置管理，支持环境变量/文件读取
#
# 【LLM 集成】大语言模型调用
#   langchain     - LLM 应用开发框架
#   langchain-openai - OpenAI 接口封装
#   openai        - OpenAI 官方 SDK
#
# 【HTTP 客户端】异步 HTTP 请求
#   aiohttp       - 异步 HTTP 客户端/服务器
#   httpx         - 现代化 HTTP 客户端
#
# 【工具库】Utilities
#   pyyaml        - YAML 配置文件解析
#   python-dotenv - 从 .env 文件加载环境变量

RUN uv pip install --python /opt/venv \
    ipython \
    fastapi>=0.104.0 uvicorn[standard]>=0.24.0 python-multipart>=0.0.6 jinja2>=3.1.2 \
    pydantic>=2.5.0 pydantic-settings>=2.1.0 \
    langchain>=0.1.0 langchain-openai>=0.0.5 openai>=1.6.0 \
    aiohttp>=3.9.0 httpx>=0.25.0 \
    pyyaml>=6.0.1 python-dotenv>=1.0.0

# -----------------------------------------------------------------------------
# 第六部分: code-server 与 VS Code 扩展
# -----------------------------------------------------------------------------

# 安装 code-server - 浏览器版 VS Code
# 说明: 官方 install.sh 自动下载最新版本并安装
#
# 扩展列表（按功能分类）:
#   语言与框架支持:
#     ms-python.python              Python 语言支持（智能提示、调试、Linter）
#     redhat.vscode-yaml            YAML 语法高亮与校验
#     bradlc.vscode-tailwindcss     Tailwind CSS 智能提示与自动补全
#     antfu.vite                    Vite 项目支持
#   代码质量:
#     esbenp.prettier-vscode        代码格式化
#     dbaeumer.vscode-eslint        ESLint 代码检查
#   Git 工具:
#     mhutchie.git-graph            Git 提交图可视化
#   数据库与数据:
#     qwtel.sqlite-viewer           SQLite 数据库可视化浏览
#   文档预览:
#     muhammad-ahmad.xlsx-viewer    Excel 表格可视化浏览
#     cweijan.vscode-office         Office 文档预览（Word / Excel）
#     mathematic.vscode-pdf         PDF 文档预览与阅读
#   编辑器增强:
#     oderwat.indent-rainbow        缩进彩虹，代码层级可视化
#   AI 编程助手:
#     anthropic.claude-code         Claude Code AI 编程助手
#     tencent-cloud.coding-copilot  AI 辅助编程，代码补全和生成
#     openai.chatgpt                OpenAI ChatGPT 官方扩展，支持 GPT-4 代码辅助
#   CNB 平台扩展（内部源，容错安装）:
#     cnbcool.cnb-welcome           CNB 平台欢迎页
RUN curl -fsSL https://code-server.dev/install.sh | sh && \
    code-server --install-extension ms-python.python && \
    code-server --install-extension redhat.vscode-yaml && \
    code-server --install-extension esbenp.prettier-vscode && \
    code-server --install-extension bradlc.vscode-tailwindcss && \
    code-server --install-extension dbaeumer.vscode-eslint && \
    code-server --install-extension mhutchie.git-graph && \
    code-server --install-extension antfu.vite && \
    code-server --install-extension qwtel.sqlite-viewer && \
    code-server --install-extension muhammad-ahmad.xlsx-viewer && \
    code-server --install-extension cweijan.vscode-office && \
    code-server --install-extension mathematic.vscode-pdf && \
    code-server --install-extension oderwat.indent-rainbow && \
    code-server --install-extension anthropic.claude-code && \
    code-server --install-extension tencent-cloud.coding-copilot && \
    code-server --install-extension openai.chatgpt && \
    code-server --install-extension ms-toolsai.vscode-jupyter-powertoys && \
    code-server --install-extension cnbcool.cnb-welcome || true

# ---------------------------------------------------------------------------
# 第七部分: CodeX CLI 配置 - 国内中转站 API
# ---------------------------------------------------------------------------
# 说明: CodeX 是 OpenAI 官方的 CLI 编程助手，需要配置国内中转站 API 才能在国内使用
# 安全设计: 不将 API Key 硬编码在镜像中，而是通过环境变量在容器启动时注入
# 配置文件会在容器启动时通过 init-codex.sh 脚本动态生成
#
# 使用方法:
#   1. 在 CNB 平台或本地设置环境变量: CODEX_API_KEY, CODEX_BASE_URL
#   2. 启动容器时会自动创建 ~/.codex/config.toml 和 ~/.codex/auth.json
#
# 环境变量说明:
#   CODEX_API_KEY    - 你的 API Key (必填)
#   CODEX_BASE_URL   - 中转站 API 地址
#   CODEX_MODEL      - 模型名称 (默认: gpt-5.4)

# 创建 CodeX 配置目录（空目录，内容由启动脚本填充）
RUN mkdir -p /root/.codex /home/admin/.codex

# 复制 CodeX 初始化脚本
COPY scripts/init-codex.sh /usr/local/bin/init-codex.sh
RUN chmod +x /usr/local/bin/init-codex.sh

# -----------------------------------------------------------------------------
# 第八部分: LaTeX 编译环境 (XeLaTeX) 安装
# -----------------------------------------------------------------------------

# 安装 TeX Live 核心包，支持 XeLaTeX 编译 .tex 生成 PDF
# 包说明:
#   texlive-xetex             - XeTeX 引擎，支持 Unicode 和系统字体
#   texlive-latex-recommended - LaTeX 推荐宏包集 (amsmath, booktabs, geometry 等)
#   texlive-fonts-recommended - 推荐字体包 (ec, cm-super，含基础中英文字体)
#   texlive-lang-chinese      - 中文字体支持 (ctex, xeCJK)
#   latexmk                   - 自动化编译工具 (自动处理多次编译、参考文献等)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        texlive-xetex \
        texlive-latex-recommended \
        texlive-fonts-recommended \
        texlive-lang-chinese \
        latexmk && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    xelatex --version && \
    latexmk --version

# -----------------------------------------------------------------------------
# 第九部分: Claude Code CLI 配置 + 汉化包
# -----------------------------------------------------------------------------

# 安装 Claude Code CLI (需要 Node.js 22+)
# 说明: Anthropic 官方 CLI 编程助手，支持 Claude 3.5 Sonnet/Opus 等模型
RUN npm install -g @anthropic-ai/claude-code

# 复制 Claude Code 初始化脚本
COPY scripts/init-claude.sh /usr/local/bin/init-claude.sh
RUN chmod +x /usr/local/bin/init-claude.sh

# 安装 Claude Code 汉化包（非官方社区扩展）
# 说明: 克隆仓库、打包并安装汉化扩展，使用 --allow-star-activation 避免交互确认
RUN node --version && \
    npm --version && \
    git clone --depth 1 https://github.com/zstings/claude-code-zh-cn.git /tmp/claude-code-zh-cn && \
    cd /tmp/claude-code-zh-cn && \
    npm install && \
    npx vsce package --no-dependencies --allow-star-activation && \
    code-server --install-extension ./claude-code-zhcn-*.vsix && \
    rm -rf /tmp/claude-code-zh-cn

# -----------------------------------------------------------------------------
# 第十部分: 环境变量配置
# -----------------------------------------------------------------------------

# Python 运行时环境变量
ENV PYTHONPATH=/workspace
ENV PYTHONUNBUFFERED=1

# 使用虚拟环境（后续通过 uv 在 /opt/venv 创建）
ENV PATH=/opt/venv/bin:$PATH
ENV VIRTUAL_ENV=/opt/venv

# 字符集配置：支持中文输入、输出与文件名显示
ENV LANG=C.UTF-8
ENV LANGUAGE=C.UTF-8

# Node.js 开发环境标识
ENV NODE_ENV=development

# -----------------------------------------------------------------------------
# 第十一部分: 配置文件复制
# -----------------------------------------------------------------------------

# 复制 VS Code 设置到容器
# 路径说明: code-server 的机器级（Machine）设置目录
# 作用: 预配置编辑器主题、字体、Python 解释器路径等，开箱即用
COPY settings.jsonc /root/.local/share/code-server/Machine/settings.json

# ---------------------------------------------------------------------------
# 第十二部分: 工作目录与启动命令
# ---------------------------------------------------------------------------

# 设置容器默认工作目录
# 说明: 与 CNB 平台代码挂载点保持一致，启动后直接进入项目根目录
WORKDIR /workspace

# 容器默认启动命令
# 说明: 启动交互式 bash shell；实际运行时由 .cnb.yml 覆盖，用于启动 code-server 等服务
#
# 端口参考（由平台自动映射，无需手动 EXPOSE）:
#   8080  code-server Web IDE
#   8000  FastAPI 应用服务
CMD ["/bin/bash"]