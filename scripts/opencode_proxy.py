"""
OpenCode Zen Free → Claude Code 翻译代理
将 Anthropic Messages API 格式翻译为 OpenAI Chat Completions 格式
让 Claude Code 可以免费使用 OpenCode Zen 的 DeepSeek V4 Flash / MiniMax M3

修复内容：
1. 响应中的 model 字段改为返回 Claude Code 请求的原始模型名，避免客户端报错
2. tool_result content 为 list 时正确转为字符串，修复工具调用场景
3. 实现 SSE 流式输出，完整支持 Anthropic 流式协议，解决 Claude Code 交互卡顿问题
"""

import json
import time
import uuid
import os
import itertools
from typing import Optional, AsyncGenerator

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse
import uvicorn

# ============ 配置 ============
OPECODE_BASE = "https://opencode.ai/zen/v1"
OPECODE_KEY = "public"
DEFAULT_MODEL = "deepseek-v4-flash-free"
LISTEN_PORT = 8777

# ============ 启动加载配置（每个步骤的最大加载时间，秒）============
LOADING_TIMES = {
    "load_config": 0.8,         # 加载配置参数
    "load_model_map": 0.5,      # 加载模型映射表
    "init_engine": 1.0,         # 初始化翻译引擎
    "init_http_client": 0.8,    # 初始化 HTTP 客户端
    "bind_port": 1.2,           # 绑定代理端口
    "start_server": 1.5,        # 启动代理服务器
}

# 模型映射：Claude Code 请求的模型名 → OpenCode 实际模型
MODEL_MAP = {
    "deepseek-v4-flash-free": "deepseek-v4-flash-free",
    "deepseek-v4-flash": "deepseek-v4-flash-free",
    "minimax-m3-free": "minimax-m3-free",
    "minimax-m3": "minimax-m3-free",
    "claude-sonnet-4-6": "deepseek-v4-flash-free",
    "claude-sonnet-4-5": "deepseek-v4-flash-free",
    "claude-haiku-4-5": "deepseek-v4-flash-free",
    "claude-opus-4-8": "minimax-m3-free",
    "claude-opus-4-7": "minimax-m3-free",
    "claude-opus-4-6": "minimax-m3-free",
    "claude-opus-4-5": "minimax-m3-free",
}

app = FastAPI(title="OpenCode Zen Proxy for Claude Code")
client = httpx.AsyncClient(timeout=httpx.Timeout(300.0))


# ============ 翻译逻辑 ============

def _tool_result_content_to_str(content) -> str:
    """
    [修复] tool_result 的 content 可能是字符串或 content block 列表
    OpenAI tool role 要求 content 必须是字符串
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "text":
                    parts.append(block.get("text", ""))
                elif block.get("type") == "image":
                    parts.append("[Image]")
                else:
                    # 其他类型尝试 JSON 序列化
                    parts.append(json.dumps(block, ensure_ascii=False))
        return "\n".join(parts)
    # 兜底
    return str(content) if content is not None else ""


def anthropic_to_openai_messages(anthropic_body: dict) -> list[dict]:
    """将 Anthropic messages 翻译为 OpenAI messages"""
    openai_msgs = []

    # Anthropic 的 system prompt → OpenAI system message
    system = anthropic_body.get("system")
    if system:
        if isinstance(system, str):
            openai_msgs.append({"role": "system", "content": system})
        elif isinstance(system, list):
            text_parts = []
            for block in system:
                if isinstance(block, dict) and block.get("type") == "text":
                    text_parts.append(block.get("text", ""))
            if text_parts:
                openai_msgs.append({"role": "system", "content": "\n".join(text_parts)})

    # 翻译 messages
    for msg in anthropic_body.get("messages", []):
        role = msg.get("role", "user")
        content = msg.get("content")

        if isinstance(content, str):
            openai_msgs.append({"role": role, "content": content})
        elif isinstance(content, list):
            text_parts = []
            tool_calls = []
            tool_results = []

            for block in content:
                if not isinstance(block, dict):
                    continue
                block_type = block.get("type")

                if block_type == "text":
                    text_parts.append(block.get("text", ""))
                elif block_type == "tool_use":
                    tool_calls.append({
                        "id": block.get("id", f"call_{uuid.uuid4().hex[:12]}"),
                        "type": "function",
                        "function": {
                            "name": block.get("name", ""),
                            "arguments": json.dumps(block.get("input", {}), ensure_ascii=False)
                        }
                    })
                elif block_type == "tool_result":
                    # [修复] content 可能是 list，需先转字符串
                    tool_results.append({
                        "tool_call_id": block.get("tool_use_id", ""),
                        "role": "tool",
                        "content": _tool_result_content_to_str(block.get("content", ""))
                    })
                elif block_type == "image":
                    text_parts.append("[Image]")
                elif block_type == "thinking":
                    # Claude extended thinking block，保留为文本供参考
                    thinking_text = block.get("thinking", "")
                    if thinking_text:
                        text_parts.append(f"<thinking>{thinking_text}</thinking>")

            if role == "assistant" and tool_calls:
                msg_obj: dict = {"role": "assistant"}
                msg_obj["content"] = "\n".join(text_parts) if text_parts else None
                msg_obj["tool_calls"] = tool_calls
                openai_msgs.append(msg_obj)
            elif tool_results:
                for tr in tool_results:
                    openai_msgs.append(tr)
            elif text_parts:
                openai_msgs.append({"role": role, "content": "\n".join(text_parts)})

    return openai_msgs


def anthropic_to_openai_tools(anthropic_body: dict) -> Optional[list]:
    """翻译 Anthropic tools → OpenAI tools"""
    tools = anthropic_body.get("tools")
    if not tools:
        return None

    openai_tools = []
    for tool in tools:
        openai_tool = {
            "type": "function",
            "function": {
                "name": tool.get("name", ""),
                "description": tool.get("description", ""),
                "parameters": tool.get("input_schema", {})
            }
        }
        openai_tools.append(openai_tool)
    return openai_tools


def openai_to_anthropic_response(openai_resp: dict, anthropic_model: str) -> dict:
    """将 OpenAI 响应翻译回 Anthropic 格式"""
    choice = openai_resp.get("choices", [{}])[0]
    message = choice.get("message", {})
    finish_reason = choice.get("finish_reason", "stop")

    stop_reason_map = {
        "stop": "end_turn",
        "tool_calls": "tool_use",
        "length": "max_tokens",
        "content_filter": "end_turn",
    }
    anthropic_stop = stop_reason_map.get(finish_reason, "end_turn")

    content_blocks = []

    text_content = message.get("content")
    if text_content:
        if isinstance(text_content, str):
            content_blocks.append({"type": "text", "text": text_content})
        elif isinstance(text_content, list):
            for part in text_content:
                if isinstance(part, dict) and part.get("type") == "text":
                    content_blocks.append(part)

    tool_calls = message.get("tool_calls") or []
    for tc in tool_calls:
        func = tc.get("function", {})
        try:
            tool_input = json.loads(func.get("arguments", "{}"))
        except (json.JSONDecodeError, TypeError):
            tool_input = {}

        content_blocks.append({
            "type": "tool_use",
            "id": tc.get("id", f"call_{uuid.uuid4().hex[:12]}"),
            "name": func.get("name", ""),
            "input": tool_input
        })

    if not content_blocks:
        content_blocks.append({"type": "text", "text": ""})

    usage = openai_resp.get("usage", {})
    return {
        "id": f"msg_{uuid.uuid4().hex[:16]}",
        "type": "message",
        "role": "assistant",
        "content": content_blocks,
        # [修复] 返回 Claude Code 请求的原始模型名，而非上游实际模型名
        "model": anthropic_model,
        "stop_reason": anthropic_stop,
        "stop_sequence": None,
        "usage": {
            "input_tokens": usage.get("prompt_tokens", 0),
            "output_tokens": usage.get("completion_tokens", 0),
        }
    }


# ============ 流式响应生成器 ============

async def stream_anthropic_events(
    openai_body: dict,
    anthropic_model: str,
    msg_id: str,
) -> AsyncGenerator[str, None]:
    """
    [新增] 调用上游 OpenAI 流式接口，将 SSE chunks 翻译为 Anthropic SSE 事件流
    Anthropic 流式协议事件序列：
      message_start → content_block_start → content_block_delta* → content_block_stop
      → message_delta(stop_reason) → message_stop
    """

    def sse(event: str, data: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

    # message_start
    yield sse("message_start", {
        "type": "message_start",
        "message": {
            "id": msg_id,
            "type": "message",
            "role": "assistant",
            "content": [],
            "model": anthropic_model,
            "stop_reason": None,
            "stop_sequence": None,
            "usage": {"input_tokens": 0, "output_tokens": 0},
        }
    })

    # 用于跟踪工具调用的缓冲区
    # OpenAI 流式工具调用会分多个 chunk 传输 arguments
    tool_call_buffers: dict[int, dict] = {}  # index → {id, name, arguments}
    text_block_open = False
    text_block_index = 0
    current_block_index = 0
    input_tokens = 0
    output_tokens = 0
    stop_reason = "end_turn"

    try:
        async with client.stream(
            "POST",
            f"{OPECODE_BASE}/chat/completions",
            headers={
                "Authorization": f"Bearer {OPECODE_KEY}",
                "Content-Type": "application/json",
            },
            json={**openai_body, "stream": True},
        ) as resp:
            resp.raise_for_status()

            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                raw = line[6:].strip()
                if raw == "[DONE]":
                    break

                try:
                    chunk = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                # 提取 usage（部分模型在末尾 chunk 带 usage）
                if chunk.get("usage"):
                    u = chunk["usage"]
                    input_tokens = u.get("prompt_tokens", input_tokens)
                    output_tokens = u.get("completion_tokens", output_tokens)

                choices = chunk.get("choices", [])
                if not choices:
                    continue

                choice = choices[0]
                delta = choice.get("delta", {})
                finish_reason = choice.get("finish_reason")

                # --- 处理文本 delta ---
                text = delta.get("content")
                if text:
                    if not text_block_open:
                        # 打开文本 block
                        text_block_index = current_block_index
                        current_block_index += 1
                        yield sse("content_block_start", {
                            "type": "content_block_start",
                            "index": text_block_index,
                            "content_block": {"type": "text", "text": ""},
                        })
                        text_block_open = True

                    yield sse("content_block_delta", {
                        "type": "content_block_delta",
                        "index": text_block_index,
                        "delta": {"type": "text_delta", "text": text},
                    })
                    output_tokens += 1  # 粗略估计（若上游不提供）

                # --- 处理工具调用 delta ---
                tool_calls_delta = delta.get("tool_calls", [])
                for tc_delta in tool_calls_delta:
                    idx = tc_delta.get("index", 0)

                    if idx not in tool_call_buffers:
                        # 初始化工具调用缓冲区，同时打开一个 tool_use block
                        if text_block_open:
                            # 先关闭文本 block
                            yield sse("content_block_stop", {
                                "type": "content_block_stop",
                                "index": text_block_index,
                            })
                            text_block_open = False

                        tc_id = tc_delta.get("id") or f"call_{uuid.uuid4().hex[:12]}"
                        tc_name = (tc_delta.get("function") or {}).get("name", "")
                        tool_call_buffers[idx] = {
                            "block_index": current_block_index,
                            "id": tc_id,
                            "name": tc_name,
                            "arguments": "",
                        }
                        current_block_index += 1

                        yield sse("content_block_start", {
                            "type": "content_block_start",
                            "index": tool_call_buffers[idx]["block_index"],
                            "content_block": {
                                "type": "tool_use",
                                "id": tc_id,
                                "name": tc_name,
                                "input": {},
                            },
                        })

                    # 追加 arguments 字符串
                    args_chunk = (tc_delta.get("function") or {}).get("arguments", "")
                    if args_chunk:
                        tool_call_buffers[idx]["arguments"] += args_chunk
                        yield sse("content_block_delta", {
                            "type": "content_block_delta",
                            "index": tool_call_buffers[idx]["block_index"],
                            "delta": {
                                "type": "input_json_delta",
                                "partial_json": args_chunk,
                            },
                        })

                # --- finish_reason ---
                if finish_reason:
                    stop_reason_map = {
                        "stop": "end_turn",
                        "tool_calls": "tool_use",
                        "length": "max_tokens",
                        "content_filter": "end_turn",
                    }
                    stop_reason = stop_reason_map.get(finish_reason, "end_turn")

    except Exception as e:
        # 流中途出错，发送错误事件后结束
        yield sse("error", {
            "type": "error",
            "error": {"type": "api_error", "message": str(e)},
        })
        return

    # 关闭所有打开的 content block
    if text_block_open:
        yield sse("content_block_stop", {
            "type": "content_block_stop",
            "index": text_block_index,
        })

    for buf in tool_call_buffers.values():
        yield sse("content_block_stop", {
            "type": "content_block_stop",
            "index": buf["block_index"],
        })

    # message_delta（stop_reason）
    yield sse("message_delta", {
        "type": "message_delta",
        "delta": {"stop_reason": stop_reason, "stop_sequence": None},
        "usage": {"output_tokens": output_tokens},
    })

    # message_stop
    yield sse("message_stop", {"type": "message_stop"})


# ============ 路由 ============

@app.post("/v1/messages")
async def messages(request: Request):
    """Anthropic Messages API → OpenAI Chat Completions 翻译"""
    body = await request.json()
    anthropic_model = body.get("model", DEFAULT_MODEL)
    actual_model = MODEL_MAP.get(anthropic_model, DEFAULT_MODEL)
    stream = body.get("stream", False)

    # 构建上游请求体
    openai_body = {
        "model": actual_model,
        "messages": anthropic_to_openai_messages(body),
        "max_tokens": body.get("max_tokens", 4096),
    }

    tools = anthropic_to_openai_tools(body)
    if tools:
        openai_body["tools"] = tools

    if body.get("temperature") is not None:
        openai_body["temperature"] = body["temperature"]
    if body.get("top_p") is not None:
        openai_body["top_p"] = body["top_p"]
    if body.get("stop_sequences"):
        openai_body["stop"] = body["stop_sequences"]

    msg_id = f"msg_{uuid.uuid4().hex[:16]}"
    print(f"[Proxy] {anthropic_model} → {actual_model} | {len(openai_body['messages'])} msgs | stream={stream}")

    # ── 流式响应 ──
    if stream:
        return StreamingResponse(
            stream_anthropic_events(openai_body, anthropic_model, msg_id),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    # ── 非流式响应 ──
    try:
        resp = await client.post(
            f"{OPECODE_BASE}/chat/completions",
            headers={
                "Authorization": f"Bearer {OPECODE_KEY}",
                "Content-Type": "application/json",
            },
            json=openai_body,
        )
        resp.raise_for_status()
        openai_resp = resp.json()
        anthropic_resp = openai_to_anthropic_response(openai_resp, anthropic_model)
        print(
            f"[Proxy] OK | "
            f"{anthropic_resp['usage']['input_tokens']}+{anthropic_resp['usage']['output_tokens']} tokens | "
            f"stop={anthropic_resp['stop_reason']}"
        )
        return JSONResponse(anthropic_resp)

    except httpx.HTTPStatusError as e:
        try:
            err_body = e.response.text[:500]
        except Exception:
            err_body = "(cannot read body)"
        print(f"[Proxy] HTTP Error {e.response.status_code}: {err_body}")
        return JSONResponse(
            {"type": "error", "error": {"type": "api_error", "message": f"Upstream {e.response.status_code}: {err_body}"}},
            status_code=e.response.status_code,
        )
    except httpx.TimeoutException:
        print("[Proxy] Timeout")
        return JSONResponse(
            {"type": "error", "error": {"type": "api_error", "message": "Upstream timeout"}},
            status_code=504,
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(
            {"type": "error", "error": {"type": "api_error", "message": str(e)}},
            status_code=500,
        )


@app.get("/v1/messages")
async def messages_get():
    return JSONResponse({"status": "ok", "message": "Anthropic-compatible endpoint ready"})


@app.get("/health")
async def health():
    return {"status": "ok", "models": list(MODEL_MAP.keys())}


# ============ 启动加载动画 ============

class StartupLoader:
    """
    终端启动加载动画

    在代理启动时依次展示每个组件的加载过程（带进度条和 spinner），
    每个步骤有独立的最大加载时间（超时后自动继续），
    让用户清晰看到代理初始化了哪些模块。
    """

    def __init__(self):
        self.steps = [
            {"key": "load_config",       "icon": "📦", "label": "加载配置参数"},
            {"key": "load_model_map",    "icon": "🗺️", "label": "加载模型映射表"},
            {"key": "init_engine",       "icon": "⚙️", "label": "初始化翻译引擎"},
            {"key": "init_http_client",  "icon": "🌐", "label": "初始化 HTTP 客户端"},
            {"key": "bind_port",         "icon": "🔌", "label": f"绑定代理端口 {LISTEN_PORT}"},
            {"key": "start_server",      "icon": "🚀", "label": "启动代理服务器"},
        ]
        # 使用安全方式获取终端宽度
        try:
            self.term_width = os.get_terminal_size().columns
        except (ValueError, OSError):
            self.term_width = 80

    # ── 公开接口 ──

    def run(self):
        """运行完整加载动画序列"""
        self._clear_screen()
        self._print_header()

        total = len(self.steps)
        for idx, step in enumerate(self.steps, 1):
            max_time = LOADING_TIMES.get(step["key"], 1.0)
            self._animate_step(step, max_time, idx, total)

        self._print_complete()

    # ── 内部方法 ──

    @staticmethod
    def _clear_screen():
        os.system("cls" if os.name == "nt" else "clear")

    def _print_header(self):
        title = "🔧 OpenCode Zen Proxy — 启动加载中"
        print()
        print(f"  {title}")
        print(f"  {'─' * (len(title) - 2)}")
        print()

    def _animate_step(self, step: dict, max_time: float, step_num: int, total: int):
        """
        单个步骤的加载动画

        显示格式：
          📦 加载配置参数       ◐ [████████░░░░░░░░░░░░]  50%

        进度条以 max_time 为基准匀速填充，超时后自动进入下一步。
        """
        bar_fill = "█"
        bar_empty = "░"
        # 进度条宽度根据终端宽度自适应
        bar_width = min(28, max(10, self.term_width - 48))
        label_width = 24

        label = f"  {step['icon']} {step['label']}"
        label_padded = label.ljust(label_width)

        spinner = itertools.cycle(["◐", "◓", "◑", "◒"])
        start = time.time()
        last_draw = -1  # 上次绘制的百分比（整数 0-100）

        while True:
            elapsed = time.time() - start
            progress = min(elapsed / max_time, 1.0)
            pct = int(progress * 100)

            # 百分比未变化则跳过绘制（节省循环开销）
            if pct == last_draw and progress < 1.0:
                time.sleep(0.04)
                continue

            last_draw = pct
            filled = int(bar_width * progress)
            bar = bar_fill * filled + bar_empty * (bar_width - filled)
            spin = next(spinner)

            line = f"     {label_padded} {spin} [{bar}] {pct:3d}%"
            line = line[:self.term_width]

            print(f"\r{line}", end="", flush=True)

            if progress >= 1.0:
                # 步骤完成 → 固定显示 ✓
                bar_done = bar_fill * bar_width
                line_done = f"     {label_padded}  [{bar_done}] 100% ✓"
                line_done = line_done[:self.term_width]
                print(f"\r{line_done}")
                break

    def _print_complete(self):
        print()
        total = len(self.steps)
        print(f"  ✅ 全部 {total}/{total} 个组件加载完成")
        print()


if __name__ == "__main__":
    # ── 启动加载动画 ──
    loader = StartupLoader()
    loader.run()

    # ── 服务 Banner ──
    print(f"""
╔══════════════════════════════════════════════╗
║   OpenCode Zen Proxy for Claude Code        ║
║   DeepSeek V4 Flash + MiniMax M3 → 免费     ║
╠══════════════════════════════════════════════╣
║  代理地址: http://127.0.0.1:{LISTEN_PORT}       ║
║  默认模型: {DEFAULT_MODEL}       ║
╚══════════════════════════════════════════════╝
""")
    uvicorn.run(app, host="0.0.0.0", port=LISTEN_PORT, log_level="warning")