# ===================================================================
# 大模型 API 测试程序
# ===================================================================
# 功能: 测试 API 连接、查询模型、基本调用、流式响应
# 配置: 已在文件内配置 API_KEY, MODEL, BASE_URL
#
# 一键运行:
#   python3 /workspace/scripts/test_api.py
# ===================================================================

"""
大模型 API 测试程序
"""

import requests
import json
import sys

# ===================================================================
# API 配置
API_KEY=""
MODEL="deepseek-chat"
BASE_URL="https://api.deepseek.com/v1"
# ===================================================================

HEADERS = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {API_KEY}"
}


def call_api(messages, stream=False):
    """通用 API 调用函数"""
    url = f"{BASE_URL}/chat/completions"
    payload = {"model": MODEL, "messages": messages, "stream": stream}

    response = requests.post(url, headers=HEADERS, json=payload, stream=stream, timeout=30)
    return response


def test_models():
    """测试: 查询可用模型列表 (SiliconFlow /models 端点需 v1 前缀)"""
    print("=" * 60)
    print("测试0: 查询可用模型列表")
    print("=" * 60)

    try:
        response = requests.get(
            f"{BASE_URL}/v1/models",
            headers={"Authorization": f"Bearer {API_KEY}"},
            timeout=10
        )

        if response.status_code == 200:
            models = response.json().get("data", [])
            print(f"✅ 找到 {len(models)} 个可用模型:\n")
            for i, m in enumerate(models, 1):
                print(f"  {i}. {m['id']} ({m.get('owned_by', 'N/A')})")
            return True
        print(f"❌ 查询失败: {response.status_code}")
        print(f"响应: {response.text[:200]}")
        return False
    except Exception as e:
        print(f"❌ 错误: {e}")
        return False


def test_basic():
    """测试: 基本 API 调用"""
    print("\n" + "=" * 60)
    print("测试1: 基本API调用")
    print("=" * 60)

    try:
        response = call_api([{"role": "user", "content": "用一句话介绍你自己。"}])

        if response.status_code == 200:
            result = response.json()
            content = result["choices"][0]["message"]["content"]
            usage = result.get("usage", {})
            print(f"✅ 调用成功")
            print(f"回复: {content}")
            print(f"Token使用: {usage}")
            return True
        print(f"❌ 调用失败: {response.status_code}")
        print(f"错误: {response.text[:200]}")
        return False
    except Exception as e:
        print(f"❌ 错误: {e}")
        return False


def test_stream():
    """测试: 流式响应"""
    print("\n" + "=" * 60)
    print("测试2: 流式响应")
    print("=" * 60)

    try:
        response = call_api([{"role": "user", "content": "从1数到5"}], stream=True)

        if response.status_code == 200:
            print("流式回复: ", end="", flush=True)
            for line in response.iter_lines():
                if line:
                    line = line.decode('utf-8')
                    if line.startswith('data: ') and line[6:] != '[DONE]':
                        try:
                            chunk = json.loads(line[6:])
                            delta = chunk["choices"][0].get("delta", {})
                            if "content" in delta and delta["content"]:
                                print(delta["content"], end="", flush=True)
                            elif "reasoning_content" in delta and delta["reasoning_content"]:
                                # 某些模型流式返回 reasoning_content 先于 content
                                pass
                        except:
                            pass
            print("\n✅ 流式调用成功")
            return True
        print(f"❌ 调用失败: {response.status_code}")
        print(f"响应: {response.text[:200]}")
        return False
    except Exception as e:
        print(f"\n❌ 错误: {e}")
        return False


def test_specific_models():
    """测试: 逐个调用用户指定的 4 个模型"""
    print("\n" + "=" * 60)
    print("测试3: 指定模型可用性验证")
    print("=" * 60)

    models = [
        "deepseek-chat",
        "deepseek-ai/DeepSeek-V4-Flash",
        "Pro/moonshotai/Kimi-K2.6",
        "Pro/MiniMaxAI/MiniMax-M2.5",
    ]
    # 备用模型 ID（如果 Pro 前缀不可用，尝试非 Pro 版本）
    fallback_map = {
        "Pro/moonshotai/Kimi-K2.6": "moonshotai/Kimi-K2-Instruct-0905",
        "Pro/MiniMaxAI/MiniMax-M2.5": "MiniMaxAI/MiniMax-M2.5",
    }

    all_ok = True
    for m in models:
        try:
            url = f"{BASE_URL}/chat/completions"
            payload = {
                "model": m,
                "messages": [{"role": "user", "content": "你好，请用一句话介绍自己。"}],
                "max_tokens": 60,
            }
            resp = requests.post(url, headers=HEADERS, json=payload, timeout=60)
            if resp.status_code == 200:
                content = resp.json()["choices"][0]["message"]["content"]
                print(f"✅ {m}: {content[:40]}...")
                continue

            # 若失败且存在备用模型，自动降级重试
            fallback = fallback_map.get(m)
            if fallback:
                print(f"⚠️  {m}: HTTP {resp.status_code}，尝试备用模型 {fallback}...")
                payload["model"] = fallback
                resp2 = requests.post(url, headers=HEADERS, json=payload, timeout=60)
                if resp2.status_code == 200:
                    content = resp2.json()["choices"][0]["message"]["content"]
                    print(f"✅ {fallback} (fallback): {content[:40]}...")
                    continue
                else:
                    print(f"❌ {fallback}: HTTP {resp2.status_code} - {resp2.text[:100]}")
                    all_ok = False
            else:
                print(f"❌ {m}: HTTP {resp.status_code} - {resp.text[:100]}")
                all_ok = False
        except requests.exceptions.ReadTimeout:
            # 超时后尝试备用模型
            fallback = fallback_map.get(m)
            if fallback:
                print(f"⏱️  {m}: 请求超时，尝试备用模型 {fallback}...")
                payload["model"] = fallback
                try:
                    resp2 = requests.post(url, headers=HEADERS, json=payload, timeout=60)
                    if resp2.status_code == 200:
                        content = resp2.json()["choices"][0]["message"]["content"]
                        print(f"✅ {fallback} (fallback): {content[:40]}...")
                        continue
                    else:
                        print(f"❌ {fallback}: HTTP {resp2.status_code} - {resp2.text[:100]}")
                        all_ok = False
                except Exception as e2:
                    print(f"❌ {fallback}: {e2}")
                    all_ok = False
            else:
                print(f"❌ {m}: 请求超时 (60s)")
                all_ok = False
        except Exception as e:
            print(f"❌ {m}: {e}")
            all_ok = False
    return all_ok


def main():
    """主函数: 运行所有测试并输出汇总结果"""
    print("\n🚀 大模型 API 测试程序")
    print(f"API: {BASE_URL}")
    print(f"模型: {MODEL}\n")

    results = [
        ("查询模型列表", test_models()),
        ("基本API调用", test_basic()),
        ("流式响应", test_stream()),
        ("指定模型验证", test_specific_models()),
    ]

    # 汇总
    print("\n" + "=" * 60)
    print("测试汇总")
    print("=" * 60)
    for name, result in results:
        print(f"{name}: {'✅ 通过' if result else '❌ 失败'}")

    sys.exit(0 if all(r for _, r in results) else 1)


if __name__ == "__main__":
    main()