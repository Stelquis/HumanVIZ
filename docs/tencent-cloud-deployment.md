# HumanVIZ 腾讯云部署指南

> 将 HumanVIZ 可视化系统部署到腾讯云轻量应用服务器，实现生产级稳定运行。

## 架构概览

| 组件 | 本地开发（CNB） | 服务器生产 |
|------|----------------|-----------|
| 前端 | `yarn dev`（Vite 开发服务器，端口 5200） | `yarn build` → Nginx 托管静态文件（端口 80） |
| 后端 | `nohup uvicorn`（端口 5000） | systemd 管理 uvicorn（端口 5000，仅本地） |
| 反向代理 | Vite 内置 `proxy` | Nginx 反向代理 |
| 进程管理 | `.pids` 文件 + `stop.sh` | systemd（开机自启 + 崩溃自动重启） |
| CORS | 仅 localhost | 包含服务器 IP |

```
用户浏览器
    │
    ▼
┌─────────────────────────────┐
│  Nginx (端口 80)            │
│  ├─ /            → 前端静态文件│
│  ├─ /api/*       → 后端:5000│
│  ├─ /HumanVIZ    → 后端:5000│
│  └─ /docs        → 后端:5000│
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  FastAPI (uvicorn, :5000)   │
│  ├─ /api/v1/*   REST API    │
│  ├─ /HumanVIZ   管理后台     │
│  └─ LLM → DeepSeek API       │
└─────────────────────────────┘
```

## 服务器信息

| 项目 | 值 |
|------|-----|
| 平台 | 腾讯云轻量应用服务器 |
| 地域 | 广州 |
| IPv4 | `42.194.193.223` |
| 系统 | Ubuntu 24.04 |
| SSH 用户 | `ubuntu`（非 root，但有 sudo 免密） |
| 内存 | 2GB（需限制 Node 构建内存） |

## 防火墙配置

在[腾讯云轻量服务器控制台](https://console.cloud.tencent.com/lighthouse/instance) → 防火墙中放通：

| 协议 | 端口 | 用途 |
|------|------|------|
| TCP | 22 | SSH |
| TCP | 80 | HTTP |
| TCP | 443 | HTTPS（可选，配证书后） |

## 快速部署

### 一键部署脚本

```bash
# 在 CNB 终端执行（完整部署，首次使用）
bash /workspace/scripts/deploy-to-tencent.sh

# 仅更新代码并重新部署（已有环境时）
bash /workspace/scripts/deploy-to-tencent.sh update

# 查看服务器状态
bash /workspace/scripts/deploy-to-tencent.sh status

# 查看后端日志
bash /workspace/scripts/deploy-to-tencent.sh logs
```

### 手动部署步骤

如果需要手动操作或排查问题，按以下步骤执行：

#### 1. SSH 登录服务器

```bash
ssh ubuntu@42.194.193.223
```

#### 2. 安装系统依赖

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl wget python3 python3-pip python3-venv nginx

# Node.js 22.x
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g yarn

# UV（参考 Dockerfile 第四部分，极速 Python 包管理器）
curl -LsSf https://astral.sh/uv/install.sh | sh
```

#### 3. 拉取代码

```bash
sudo mkdir -p /app && sudo chown ubuntu:ubuntu /app
cd /app
# 从 CNB 仓库拉取（国内速度快，优于 GitHub）
git clone https://cnb.cool/OrionDawn/HumanVIZ.git
```

#### 4. 配置 LLM 密钥

```bash
cat > /app/HumanVIZ/secrets.json << 'EOF'
{
  "api_key": "你的API_KEY",
  "model": "deepseek-chat",
  "base_url": "https://api.deepseek.com/v1",
  "provider": "DeepSeek"
}
EOF
```

#### 5. 安装 Python 依赖

```bash
# 创建虚拟环境
python3 -m venv /app/venv
source /app/venv/bin/activate

# 使用 UV 安装（参考 Dockerfile 第五部分）
export PATH="$HOME/.local/bin:$PATH"
uv pip install -r /app/HumanVIZ/requirements.txt
```

#### 6. 构建前端

```bash
cd /app/HumanVIZ/HumanVIZ
yarn install

# 限制 Node.js 内存，防止 2GB 服务器 OOM
# 1473 个 ribbon JSON 文件需要约 1900MB，2GB 服务器必须接近上限
NODE_OPTIONS="--max-old-space-size=1900" yarn build
# 构建产物在 dist/ 目录
```

> **重要**：
> - Vite 插件 `operaRibbonPlugin` 自动从 `data/processed/opera_ribbon_data` 复制 ribbon JSON 到 `dist/data/opera_ribbon/`，无需手动处理符号链接。
> - 生产环境使用 `yarn build` 构建静态文件，由 Nginx 托管。不要使用 `yarn dev`（开发服务器），它存在内存泄漏风险且性能差。

#### 7. 配置后端 systemd 服务

```bash
sudo tee /etc/systemd/system/humanviz-backend.service > /dev/null << 'EOF'
[Unit]
Description=HumanVIZ Backend (FastAPI)
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/app/HumanVIZ/HumanVIZ/backend
Environment="PYTHONPATH=/app/HumanVIZ/HumanVIZ/backend"
ExecStart=/app/venv/bin/uvicorn main:app --host 0.0.0.0 --port 5000
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable humanviz-backend
sudo systemctl start humanviz-backend
```

#### 8. 配置 Nginx 反向代理

Nginx 配置文件位于 `/etc/nginx/sites-available/humanviz`：

```nginx
server {
    listen 80;
    server_name _;
    client_max_body_size 100m;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 256;

    root /app/HumanVIZ/HumanVIZ/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /HumanVIZ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /docs { proxy_pass http://127.0.0.1:5000; proxy_set_header Host $host; }
    location /openapi.json { proxy_pass http://127.0.0.1:5000; proxy_set_header Host $host; }
    location /redoc { proxy_pass http://127.0.0.1:5000; proxy_set_header Host $host; }

    location / { try_files $uri $uri/ /index.html; }
}
```

启用配置：

```bash
sudo ln -sf /etc/nginx/sites-available/humanviz /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
```

#### 9. 修改 CORS 配置

编辑 `/app/HumanVIZ/HumanVIZ/backend/core/config.py`，在 `CORS_ORIGINS` 中加入服务器 IP：

```python
CORS_ORIGINS: list = [
    "http://localhost:5200",
    "http://127.0.0.1:5200",
    "http://42.194.193.223",  # ← 新增
]
```

然后重启后端：`sudo systemctl restart humanviz-backend`

#### 10. 验证

浏览器访问 **http://42.194.193.223** 即可看到前端页面。

## 日常运维

### 更新代码并重新部署

```bash
# 方式一：使用部署脚本（推荐，密码 Niu1001!）
bash /workspace/scripts/deploy-to-tencent.sh update

# 方式二：手动操作
ssh ubuntu@42.194.193.223
cd /app/HumanVIZ && git restore . && git pull
cd HumanVIZ && NODE_OPTIONS="--max-old-space-size=1900" yarn build
sudo systemctl restart humanviz-backend
sudo nginx -t && sudo systemctl reload nginx
```

### 常用命令

```bash
# 查看后端状态
sudo systemctl status humanviz-backend

# 查看后端日志（实时）
sudo journalctl -u humanviz-backend -f

# 重启后端
sudo systemctl restart humanviz-backend

# 查看 Nginx 日志
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# 重启 Nginx
sudo systemctl restart nginx
```

## 配置 HTTPS（可选）

如果有域名并已解析到服务器 IP：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名.com
# 证书自动续期测试
sudo certbot renew --dry-run
```

## CNB 环境与服务器的关系

```
CNB 云原生开发环境（本地开发）          腾讯云服务器（生产部署）
─────────────────────────          ─────────────────────────
start.sh → yarn dev + nohup    →   Nginx + systemd + yarn build
vite.config.ts proxy           →   Nginx reverse proxy
.pids 进程管理                 →   systemd 服务管理
secrets.json                   →   secrets.json（相同）
localhost:5200                 →   http://42.194.193.223
```

**关键区别**：

1. **前端运行方式**：CNB 用 `yarn dev`（Vite 开发服务器），服务器用 `yarn build` → Nginx 托管静态文件
2. **进程管理**：CNB 用 `nohup` + `.pids` 文件，服务器用 systemd（开机自启 + 崩溃自动重启）
3. **反向代理**：CNB 用 Vite 内置 proxy，服务器用 Nginx
4. **CORS**：服务器需额外加入 IP 地址

## 故障排查

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| 页面空白 | 前端构建失败 | 检查 `yarn build` 输出，确认 `dist/` 存在 |
| API 502 | 后端未启动 | `sudo systemctl status humanviz-backend`，查看日志 |
| API 404 | Nginx 代理配置错误 | 检查 `/etc/nginx/sites-available/humanviz` |
| CORS 错误 | 未添加服务器 IP | 修改 `config.py` 中的 `CORS_ORIGINS` |
| OOM 崩溃 | 服务器内存不足 | 使用 `NODE_OPTIONS="--max-old-space-size=1900"`（2GB 极限） |
| git pull 冲突 | 服务器上有手动修改 | `git restore . && git pull`（丢弃本地改动后重拉） |
| git clone 超时 | GitHub 被墙 | 使用 CNB 仓库地址 `cnb.cool/OrionDawn/HumanVIZ.git` |
