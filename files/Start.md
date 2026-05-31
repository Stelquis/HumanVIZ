# 🚀 快速开始

本项目已配置一键启动脚本，自动完成环境检查、依赖安装和服务启动。

## 🔧 LLM API 配置

本项目使用 OpenAI 兼容格式，支持多种大模型厂商：

### 支持的厂商

| 厂商     | 模型示例       | Base URL                                  |
| -------- | -------------- | ----------------------------------------- |
| DeepSeek | deepseek-chat  | `https://api.deepseek.com/v1`             |
| Moonshot | moonshot-v1-8k | `https://api.moonshot.cn/v1`              |
| 智谱 AI  | glm-4          | `https://open.bigmodel.cn/api/paas/v4`    |
| MiMo     | mimo-v2.5-pro  | `https://token-plan-cn.xiaomimimo.com/v1` |

### 配置方法

编辑 `scripts/init-claude.sh` 文件顶部的配置区域：

DeepSeek 配置示例：

```bash
# API Key: 支持任意兼容 Anthropic API 的提供商
# DeepSeek Platform: https://platform.deepseek.com/
MY_API_KEY="sk-your-api-key"

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
```

运行配置脚本：

```bash
bash /workspace/scripts/init-claude.sh
```

### API 测试工具

项目提供了 `test_api.py` 脚本用于测试 LLM API 连接：

```bash
# 测试 API 连通性
python scripts/test_api.py
```

该脚本会测试：

1. 查询可用模型列表
2. 基本 API 调用
3. 流式响应

## 📋 一键启动

```bash
./start.sh
```

启动脚本会自动完成：

- ✅ 环境检查（Node.js、Yarn、Python、UV）
- ✅ 端口占用清理
- ✅ Python 虚拟环境激活（使用 Dockerfile 预装的 `/opt/venv`）
- ✅ 依赖检查与自动安装（FastAPI + LangChain）
- ✅ 前端依赖检查与自动安装
- ✅ 生成 API 配置文件 (`secrets.json`)
- ✅ 启动后端服务（FastAPI + Uvicorn）
- ✅ 启动前端服务（Vite）

## 🌐 访问地址

> **获取访问链接方法**：
>
> 1. 启动服务后，在终端查看输出日志中的绿色 URL
> 2. 或点击 IDE 顶部「网络」面板，找到对应端口的「打开链接」按钮
> 3. 将链接复制到浏览器新建标签页即可访问（支持 PC/手机端）

## 🛑 停止服务

```bash
./stop.sh
```