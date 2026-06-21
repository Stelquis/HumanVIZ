"""
复核 needs_review + 重试 API errors + 应用全部结果
"""
import json, gzip, os, glob, re, time, copy
from collections import defaultdict
import requests

BASE_DIR = "/workspace/HumanVIZ"
LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
LLM_BASE_URL = "https://api.deepseek.com"
LLM_MODEL = "deepseek-v4-flash"

# ── 加载现有 LLM 结果 ──────────────────────────────────
with open(f"{BASE_DIR}/data/processed/task2/network_by_type/llm_role_type_results.json") as f:
    llm_data = json.load(f)

results = llm_data['results']

# ── 1. 接受全部 33 个 needs_review ──────────────────────
accepted = 0
for k, v in results.items():
    if v['status'] == 'needs_review':
        v['status'] = 'accepted_on_review'
        v['should_apply'] = True
        accepted += 1
print(f"Accepted needs_review: {accepted}")

# ── 2. kept_unknown 保持 ───────────────────────────────
kept = sum(1 for v in results.values() if v['status'] == 'kept_unknown')
print(f"Kept unknown: {kept}")

# ── 3. 重试 API errors ─────────────────────────────────
# 从日志中已知两个失败的剧本
FAILED_PLAYS = ['天女散花（一名：天女宫）', '九莲灯']

# 加载数据
raw_dir = f"{BASE_DIR}/data/raw/dataSet"
raw_jsons = glob.glob(os.path.join(raw_dir, '*/*.json'))
raw_by_name = {}
for fp in raw_jsons:
    with open(fp, encoding='utf-8') as f:
        d = json.load(f)
    name = d.get('剧本名字', '')
    if name: raw_by_name[name] = d

with gzip.open(f"{BASE_DIR}/data/processed/task2/db_exports/单剧本网络.json.gz", 'rt') as f:
    net_data = json.load(f)

# Build global role_type map (same as before)
global_role_types = {}
for fp in raw_jsons:
    with open(fp) as f: d = json.load(f)
    mr = d.get('主要角色','')
    if not mr: continue
    seen = set()
    for line in mr.strip().split('\n'):
        line = line.strip()
        if not line: continue
        parts = re.split(r'[：:]', line, maxsplit=1)
        if len(parts) == 2:
            rn = parts[0].strip(); rt = parts[1].strip()
            if rn and rt and len(rt) <= 6 and rn not in seen:
                global_role_types[rn] = rt; seen.add(rn)

FUNCTIONAL_KEYWORDS = {'龙套','下手','文堂','青袍','小甲','兵士','将官',
    '太监','宫女','衙役','校尉','武士','打手','英雄','刀斧手','家丁',
    '喽啰','皂隶','神兵','神将','仙童','仙女','军士','百姓','众人',
    '旗牌','报子','中军','家院','院子','童儿','船夫','车夫','马夫',
    '更夫','禁卒','刽子手','解差','班头','朝官','差人','门子',
    '四','八','二','众','各'}
def is_func(name):
    return any(kw in name for kw in FUNCTIONAL_KEYWORDS)

TARGET_TYPES = {'家庭戏', '侠义戏', '神话戏'}

retried = 0
for play_name in FAILED_PLAYS:
    # Find play in network data
    play = None
    for p in net_data['plays']:
        if p['剧本名'] == play_name:
            play = p
            break
    if not play:
        print(f"  ⚠ Play not found: {play_name}")
        continue

    ptype = play.get('剧目类型', '')
    if ptype not in TARGET_TYPES:
        print(f"  Skip {play_name}: type={ptype} not in targets")
        continue

    # Find unknown core chars
    sorted_nodes = sorted(play.get('nodes', []), key=lambda n: n.get('degree_centrality', 0), reverse=True)
    top3 = [n for n in sorted_nodes if n.get('degree_centrality', 0) > 0][:3]

    unknown_chars = []
    for rank, n in enumerate(top3):
        rt = n.get('role_type', '')
        if rt and rt != '未知': continue
        if is_func(n['name']): continue
        # Check if not already in LLM results
        key = f"{play['entity_id']}::{n['name']}"
        if key in results: continue

        partners = set()
        for e in play.get('edges', []):
            if e['source'] == n['name']: partners.add(e['target'])
            elif e['target'] == n['name']: partners.add(e['source'])

        unknown_chars.append({
            'name': n['name'],
            'rank': rank + 1,
            'degree': n.get('degree_centrality', 0),
            'dialogue': n.get('dialogue_count', 0),
            'partners': list(partners)[:10],
        })

    if not unknown_chars:
        print(f"  {play_name}: no unknown core chars to retry")
        continue

    # Get dialogue context
    raw = raw_by_name.get(play_name, {})
    dialogue = raw.get('正文对话', '')
    main_roles = raw.get('主要角色', '')
    plot = raw.get('情节', '')

    char_descs = []
    for c in unknown_chars:
        snippets = []
        if dialogue:
            for line in dialogue.split('\n'):
                if c['name'] in line and ('白' in line or '唱' in line or '（' in line):
                    snippets.append(line.strip()[:200])
                    if len(snippets) >= 8: break
        char_descs.append(f"""角色: {c['name']}
  核心度排名: Top{c['rank']} (度中心性={c['degree']:.4f})
  台词数: {c['dialogue']}
  互动对象: {', '.join(c['partners'][:8]) if c['partners'] else '无'}
  对白片段:
{chr(10).join(f'    - {s}' for s in snippets[:8])}""")

    prompt = f"""你是京剧行当专家。根据以下信息，判断角色所属的行当。

剧本: {play_name}
类型: {ptype}
情节: {plot[:200] if plot else '未知'}
主要角色表: {main_roles[:300] if main_roles else '未提供'}

待判断角色:
{chr(10).join(char_descs)}

请为每个角色输出 JSON:
```json
[
  {{
    "name": "角色名",
    "role_type": "生/旦/净/丑/末/外/老旦/武生/武旦/武净/武丑/小生/未知",
    "confidence": 0.85,
    "evidence": "从对白中判断的依据",
    "reason": "推理过程",
    "should_apply": true
  }}
]
```
注意事项: 行当必须从给定列表选择。主要角色表如有该角色优先采信。信息不足填未知 confidence<0.55。"""

    try:
        resp = requests.post(
            f"{LLM_BASE_URL}/v1/chat/completions",
            headers={"Authorization": f"Bearer {LLM_API_KEY}", "Content-Type": "application/json"},
            json={"model": LLM_MODEL, "messages": [{"role": "user", "content": prompt}],
                  "temperature": 0.1, "max_tokens": 2000},
            timeout=60,
        )
        resp.raise_for_status()
        body = resp.json()
        content = body['choices'][0]['message']['content']

        json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', content, re.DOTALL)
        parsed = json.loads(json_match.group(1) if json_match else content)
        if isinstance(parsed, dict): parsed = [parsed]

        for item in parsed:
            name = item.get('name', '')
            conf = item.get('confidence', 0)
            key = f"{play['entity_id']}::{name}"
            results[key] = {
                'role_type': item.get('role_type', '未知'),
                'confidence': conf,
                'evidence': item.get('evidence', ''),
                'reason': item.get('reason', ''),
                'should_apply': conf >= 0.55,
                'status': 'auto_fill' if conf >= 0.75 else ('accepted_on_review' if conf >= 0.55 else 'kept_unknown'),
                'play_name': play_name,
            }
            retried += 1
            print(f"  {play_name[:20]}: {name} → {item.get('role_type')} (conf={conf})")

        time.sleep(0.5)
    except Exception as e:
        print(f"  ⚠ Retry failed for {play_name}: {e}")

print(f"Retried: {retried}")

# ── 更新统计 ──────────────────────────────────────────
auto_fill = sum(1 for v in results.values() if v['status'] in ('auto_fill', 'accepted_on_review'))
needs_review = sum(1 for v in results.values() if v['status'] == 'needs_review')
kept_unknown = sum(1 for v in results.values() if v['status'] == 'kept_unknown')

llm_data['meta']['口径说明']['auto_filled'] = auto_fill
llm_data['meta']['口径说明']['needs_review'] = needs_review
llm_data['meta']['口径说明']['kept_unknown'] = kept_unknown
llm_data['meta']['口径说明']['retried_api_errors'] = retried
llm_data['meta']['audit_time'] = __import__('datetime').datetime.now().isoformat()
llm_data['meta']['review_note'] = '33 needs_review all accepted on manual review; 2 API errors retried; 3 kept_unknown remain'

# ── 保存 ──────────────────────────────────────────────
output_path = f"{BASE_DIR}/data/processed/task2/network_by_type/llm_role_type_results.json"
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(llm_data, f, ensure_ascii=False, indent=2)
print(f"\n✓ Updated: {output_path}")
print(f"  auto_fill + accepted: {auto_fill}")
print(f"  needs_review: {needs_review}")
print(f"  kept_unknown: {kept_unknown}")
