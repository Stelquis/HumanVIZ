"""
京剧剧本分析 LLM Prompt 模板

四个比赛任务的 prompt 封装：
  - Task 1: 角色行当分类
  - Task 2: 角色关系网络提取
  - Task 3: 主题提取
  - Task 4: 叙事结构分析
"""

import json
from typing import Dict, Any, List


def _format_play_data(detail: Dict[str, Any]) -> str:
    """将剧本详情格式化为 LLM prompt 可读的文本"""
    attrs = detail.get("attributes", {})
    if isinstance(attrs, str):
        try:
            attrs = json.loads(attrs)
        except Exception:
            attrs = {}

    title = detail.get("name", "未知剧本")
    plot = attrs.get("情节概要", "")
    roles = attrs.get("主要角色", [])
    dialogue = detail.get("content", "")[:3000]  # 限制长度

    # 格式化角色列表
    if isinstance(roles, list) and roles:
        roles_text = "\n".join(
            f"  - {r.get('name', '?')}: {r.get('role_type', '未知')}"
            for r in roles
        )
    else:
        roles_text = "无角色信息"

    return f"""
【剧本名称】{title}
【情节概要】{plot}
【已知角色与行当】
{roles_text}
【正文对话（节选）】
{dialogue[:3000]}
"""


# ═══════════════════════════════════════════════════════════
# Task 1: 角色行当分类
# ═══════════════════════════════════════════════════════════

ROLE_CLASSIFICATION_PROMPT = """你是一位京剧行当分析专家。根据以下剧本信息，对每位已知角色的行当归属进行验证与细化。

## 行当体系参考

- **生**: 男性角色
  - 老生: 中老年男性，稳重端庄，唱念为主
  - 小生: 青年男性，俊秀文雅
  - 武生: 武将，擅长武打
  - 红生: 红脸关羽等特定角色

- **旦**: 女性角色
  - 青衣: 端庄贤淑的中青年女性
  - 花旦: 活泼开朗的少女
  - 老旦: 老年女性
  - 武旦: 女将，擅长武艺
  - 刀马旦: 女将，扎靠骑马

- **净**: 花脸，性格刚烈或粗犷的男性
  - 铜锤花脸: 以唱为主
  - 架子花脸: 以做功为主
  - 武花脸: 以武打为主

- **丑**: 喜剧角色
  - 文丑: 文人、市民类
  - 武丑: 武艺类

## 任务要求

1. 验证已有行当标注是否正确
2. 如发现标注不当，说明原因
3. 对未标注细分支的角色进行细化分类

## 输出格式

请以 JSON 格式返回：
```json
{
  "roles": [
    {
      "name": "角色名",
      "original_type": "原始标注",
      "verified_type": "验证/细化后的行当",
      "confidence": "high/medium/low",
      "reasoning": "判断依据（基于角色身份、性格、表演提示等）"
    }
  ],
  "summary": "整体行当分布概述"
}
```
"""


def classify_character_roles(llm, detail: Dict[str, Any]) -> Dict[str, Any]:
    """调用 LLM 进行角色行当分类"""
    play_text = _format_play_data(detail)
    prompt = ROLE_CLASSIFICATION_PROMPT + f"\n\n{play_text}"

    response = llm.invoke(prompt)
    content = response.content

    # 尝试解析 JSON 结果
    try:
        # 提取 JSON 部分
        if "```json" in content:
            json_str = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            json_str = content.split("```")[1].split("```")[0].strip()
        else:
            json_str = content

        result = json.loads(json_str)
    except Exception:
        result = {"raw_response": content}

    return {
        "entity_id": detail.get("id"),
        "play_name": detail.get("name"),
        "result": result,
    }


# ═══════════════════════════════════════════════════════════
# Task 2 前置: 剧目分类标注
# ═══════════════════════════════════════════════════════════

PLAY_CLASSIFICATION_PROMPT = """你是一位京剧剧目分类专家。根据以下剧本信息，判断该剧本属于哪一类别。

## 分类体系

共 7 个类别，每部剧本必须归入其中一类：

1. **历史戏**: 以历史事件、朝代更替、战争谋略为主线，角色多为帝王将相。如《空城计》《霸王别姬》《群英会》
2. **家庭戏**: 以家庭伦理、亲情关系、家教训诫为核心，围绕家庭内部矛盾与和解展开。如《三娘教子》《四郎探母》《红鬃烈马》
3. **公案戏**: 以案件侦破、断案审理、冤屈昭雪为主线，通常有官员断案情节。如《窦娥冤》《十五贯》《铡美案》
4. **爱情戏**: 以男女爱情、婚姻追求为核心驱动力，情感纠葛为主要矛盾。如《西厢记》《牡丹亭》《贵妃醉酒》
5. **神话戏**: 涉及神仙、妖魔、鬼魂、法术等超自然元素，或改编自神话传说。如《白蛇传》《天女散花》《闹天宫》
6. **侠义戏**: 以行侠仗义、除暴安良、英雄豪杰的义举为主题。如《打渔杀家》《三岔口》《野猪林》
7. **技法展示戏**: 无完整情节或情节极弱，主要目的是展示演员的唱念做打某项技法，常见于折子戏。如《挑滑车》《雁荡山》《金钱豹》

## 分类原则

- 优先按剧本的**核心矛盾与主线**归类，而非次要元素
- 若剧本同时涉及多个类别，选择**最重要、最突出**的一个
- 历史戏中的爱情线（如《霸王别姬》）仍归入历史戏，因为核心矛盾是历史事件
- 公案戏中的家庭元素（如《铡美案》中的家庭纠纷）仍归公案戏，因为核心是断案
- 技法展示戏的关键判断：情节是否完整、是否有明确矛盾冲突

## 输出格式

请以 JSON 格式返回：
```json
{
  "category": "分类名称（历史戏/家庭戏/公案戏/爱情戏/神话戏/侠义戏/技法展示戏）",
  "confidence": "high/medium/low",
  "reasoning": "分类依据（基于情节概要、角色身份、核心矛盾等）",
  "secondary_category": "次要类别（如有），若无则填 null"
}
```"""


def classify_play_type(llm, detail: Dict[str, Any]) -> Dict[str, Any]:
    """调用 LLM 对剧本进行剧目分类"""
    play_text = _format_play_data(detail)
    prompt = PLAY_CLASSIFICATION_PROMPT + f"\n\n{play_text}"

    response = llm.invoke(prompt)
    content = response.content

    try:
        if "```json" in content:
            json_str = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            json_str = content.split("```")[1].split("```")[0].strip()
        else:
            json_str = content
        result = json.loads(json_str)
    except Exception:
        result = {"raw_response": content}

    return {
        "entity_id": detail.get("id"),
        "play_name": detail.get("name"),
        "result": result,
    }


# ═══════════════════════════════════════════════════════════
# Task 2: 角色关系网络提取
# ═══════════════════════════════════════════════════════════

RELATION_EXTRACTION_PROMPT = """你是一位京剧剧本分析专家。分析以下剧本中主要角色之间的互动关系。

## 关系类型

- 敌对: 冲突、对立、斗争
- 同盟: 合作、结盟、共同行动
- 从属: 上下级、主仆、君臣
- 亲属: 父子、夫妻、兄弟、姐妹
- 情感: 爱情、友情、倾慕
- 对立: 利益冲突但非直接敌对

## 任务要求

1. 识别剧中所有存在互动的角色对
2. 判断他们之间的关系类型
3. 给出关系强度的评分（0.0-1.0）
4. 提供原文依据

## 输出格式

```json
{
  "relations": [
    {
      "source": "角色A",
      "target": "角色B",
      "type": "关系类型",
      "weight": 0.8,
      "evidence": "原文依据（简要摘录）"
    }
  ],
  "network_summary": "整体关系网络特征描述"
}
```
"""


def extract_character_relations(llm, detail: Dict[str, Any]) -> Dict[str, Any]:
    """调用 LLM 提取角色关系"""
    play_text = _format_play_data(detail)
    prompt = RELATION_EXTRACTION_PROMPT + f"\n\n{play_text}"

    response = llm.invoke(prompt)
    content = response.content

    try:
        if "```json" in content:
            json_str = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            json_str = content.split("```")[1].split("```")[0].strip()
        else:
            json_str = content
        result = json.loads(json_str)
    except Exception:
        result = {"raw_response": content}

    return {
        "entity_id": detail.get("id"),
        "play_name": detail.get("name"),
        "result": result,
    }


# ═══════════════════════════════════════════════════════════
# Task 2 V2: 角色关系网络提取（增强版，含子类型体系）
# ═══════════════════════════════════════════════════════════

RELATION_EXTRACTION_V2_PROMPT = """你是一位京剧剧本分析专家。分析以下剧本中主要角色之间的语义关系。

## 剧本信息

- **剧目类型**: {剧目类型}
- **剧本名称**: {剧本名}

## 角色列表（限定范围，不要输出此列表外的角色）

{角色列表文本}

## 已知同场共现关系（这些角色对确实有互动，你只需判断语义关系类型）

{共现边文本}

## 关系类型体系

请严格按照以下分类体系输出关系，每个大类均设有"其他"兜底选项：

| 宏观大类 (macro_type) | 典型子类 (micro_type) | 说明 |
|---|---|---|
| **亲属 Kinship** | 父子、母子、夫妻、兄弟、姐妹、婆媳、翁婿、**其他亲属** | 家庭戏核心，分析传统伦理秩序 |
| **从属 Hierarchy** | 君臣、主仆、师徒、将卒、官民、**其他从属** | 历史/公案戏骨架，强单向权力属性 |
| **同盟 Alliance** | 结拜、恩人、知己、同僚、利益结盟、**其他同盟** | 侠义戏核心，反映江湖道义或朝堂党争 |
| **敌对 Hostility** | 宿敌、政敌、仇人、情敌、阵营对立、**其他敌对** | 所有剧目核心冲突引擎 |
| **情感 Romance** | 恋人、暗恋、政治联姻、**其他情感** | 爱情戏核心，可与亲属/敌对发生演变 |
| **中立 Neutral** | 萍水相逢、路人、交易、**其他中立** | 兜底选项，过滤弱共现边 |

### 分类规则

1. **优先选择具体子类**：如"父子"而非"其他亲属"
2. **无法归入具体子类时**：使用对应的"其他*"兜底（如叔侄→"其他亲属"，郎舅→"其他亲属"）
3. **方向性判断**：
   - `bidirectional`（双向）：夫妻、兄弟、盟友、敌对等
   - `unidirectional`（单向）：君臣、主仆、师徒、将卒等
4. **剧目类型参考**：
   - 历史戏：侧重君臣、将卒、阵营对立
   - 家庭戏：侧重父子、夫妻、婆媳等亲属关系
   - 公案戏：侧重官民、冤仇、断案关系
   - 爱情戏：侧重恋人、暗恋、情感纠葛
   - 侠义戏：侧重结拜、恩人、江湖义气

## 输出格式

请严格以 JSON 格式返回，不要添加额外说明：

```json
{{
  "relations": [
    {{
      "source": "角色A",
      "target": "角色B",
      "macro_type": "宏观大类（亲属/从属/同盟/敌对/情感/中立）",
      "micro_type": "具体子类",
      "direction": "bidirectional 或 unidirectional",
      "confidence": 0.85,
      "evidence": "原文对话或情节中的具体引用（简要摘录关键台词或情节）",
      "context_scene": "所在场次（如有）"
    }}
  ],
  "network_summary": "整体关系网络特征描述（100-200字，概括核心冲突、主要关系模式、权力结构等）"
}}
```

## 注意事项

1. **只输出角色列表中存在的角色**，不要虚构角色
2. **每条关系必须有证据**，引用原文对话或情节
3. **confidence 取值 0-1**，表示关系判断的置信度
4. **共现边中 count 越高，互动越频繁**，可据此判断关系强度
5. 如果两个角色仅有弱共现且无明显语义关系，可不输出（或标记为"中立"且 confidence 较低）

现在请分析上述剧本的角色关系。"""


def _format_play_data_v2(play_data: Dict[str, Any]) -> Dict[str, str]:
    """
    将统一数据结构格式化为 V2 prompt 的输入参数。

    Args:
        play_data: 统一数据结构中的单个剧本对象

    Returns:
        格式化后的字典，包含 prompt 所需的所有字段
    """
    # 角色列表文本（排除 crowd 角色）
    char_list = play_data.get("角色列表", [])
    角色列表文本 = "\n".join(f"- {name}" for name in char_list)

    # 共现边文本
    edges = play_data.get("共现边列表", [])
    if edges:
        共现边_lines = []
        for e in edges[:30]:  # 限制最多30条边，避免prompt过长
            共现边_lines.append(
                f"- {e['character_a']} ↔ {e['character_b']}  "
                f"(共现次数: {e['count']}, 场景: {', '.join(e.get('scenes', [])[:3])})"
            )
        共现边文本 = "\n".join(共现边_lines)
    else:
        共现边文本 = "（无共现边数据）"

    return {
        "剧目类型": play_data.get("剧目类型", "未知"),
        "剧本名": play_data.get("剧本名", "未知"),
        "角色列表文本": 角色列表文本,
        "共现边文本": 共现边文本,
    }


def extract_character_relations_v2(llm, play_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    调用 LLM 提取角色关系（V2 增强版，含子类型体系）

    Args:
        llm: LLM 实例（支持 .invoke() 方法）
        play_data: 统一数据结构中的单个剧本对象（来自 batch_extract_relations.py）

    Returns:
        包含 entity_id、剧本名和 LLM 提取结果的字典
    """
    # 格式化输入
    formatted = _format_play_data_v2(play_data)

    # 构建完整 prompt
    prompt = RELATION_EXTRACTION_V2_PROMPT.format(**formatted)

    # 调用 LLM
    response = llm.invoke(prompt)
    content = response.content

    # 解析 JSON 结果
    try:
        if not content or not content.strip():
            raise ValueError("LLM 返回空内容")

        # 1. 提取 JSON 字符串（去除代码块标记）
        if "```json" in content:
            json_str = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            json_str = content.split("```")[1].split("```")[0].strip()
        else:
            json_str = content.strip()

        # 2. 预处理
        import re as _re
        json_str = json_str.replace("“", '\\"')  # 中文左双引号
        json_str = json_str.replace("”", '\\"')  # 中文右双引号
        json_str = json_str.replace("‘", "'")    # 中文左单引号 → ASCII
        json_str = json_str.replace("’", "'")    # 中文右单引号 → ASCII
        json_str = _re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', json_str)
        json_str = json_str.rstrip().rstrip(",")  # 移除尾部逗号

        # 3. 尝试直接解析
        try:
            result = json.loads(json_str)
        except json.JSONDecodeError:
            # 4. 提取第一个完整的顶层 JSON 对象（处理 Extra data / 截断 / 无效字符）
            depth = 0
            end_pos = 0
            in_string = False
            escape_next = False
            for i, ch in enumerate(json_str):
                if escape_next:
                    escape_next = False
                    continue
                if ch == '\\' and in_string:
                    escape_next = True
                    continue
                if ch == '"' and not escape_next:
                    in_string = not in_string
                    continue
                if in_string:
                    continue
                if ch == '{':
                    depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        end_pos = i + 1
                        break
            if end_pos > 0:
                result = json.loads(json_str[:end_pos])
            else:
                # 5. 尝试补全不完整的 JSON（截断情况）
                open_braces = json_str.count("{") - json_str.count("}")
                open_brackets = json_str.count("[") - json_str.count("]")
                if open_braces > 0 or open_brackets > 0:
                    last_complete = max(json_str.rfind("},"), json_str.rfind("]"))
                    if last_complete > 0:
                        json_str = json_str[:last_complete + 1]
                    json_str += "]" * open_brackets + "}" * open_braces
                    result = json.loads(json_str)
                else:
                    raise

    except Exception as e:
        result = {
            "raw_response": content,
            "parse_error": str(e),
        }

    return {
        "entity_id": play_data.get("entity_id"),
        "剧本名": play_data.get("剧本名"),
        "剧目类型": play_data.get("剧目类型"),
        "result": result,
    }


# ═══════════════════════════════════════════════════════════
# Task 3: 主题提取
# ═══════════════════════════════════════════════════════════

THEME_EXTRACTION_PROMPT = """你是一位京剧主题分析专家。从以下剧本中提取核心主题。

## 主题类别参考

- 忠义: 忠诚、信义、节操
- 孝道: 孝顺、家庭伦理
- 爱情: 恋爱、婚姻
- 复仇: 报仇、雪恨
- 军事谋略: 战争策略、用兵之道
- 官场斗争: 权谋、政治斗争
- 家庭伦理: 亲情、家族关系
- 神话传说: 神怪、仙道
- 历史演义: 历史事件演绎
- 公案断狱: 司法断案
- 侠义: 行侠仗义
- 讽刺幽默: 喜剧、讽刺

## 任务要求

1. 提取 2-5 个核心主题标签
2. 按重要性排序
3. 说明每个主题的原文依据

## 输出格式

```json
{
  "themes": [
    {
      "label": "主题标签",
      "importance": 0.9,
      "description": "该主题在剧本中的具体体现",
      "evidence": "原文依据片段"
    }
  ],
  "primary_theme": "最核心的主题",
  "theme_combination": "主题组合特征描述"
}
```
"""


def extract_play_themes(llm, detail: Dict[str, Any]) -> Dict[str, Any]:
    """调用 LLM 提取剧本主题"""
    play_text = _format_play_data(detail)
    prompt = THEME_EXTRACTION_PROMPT + f"\n\n{play_text}"

    response = llm.invoke(prompt)
    content = response.content

    try:
        if "```json" in content:
            json_str = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            json_str = content.split("```")[1].split("```")[0].strip()
        else:
            json_str = content
        result = json.loads(json_str)
    except Exception:
        result = {"raw_response": content}

    return {
        "entity_id": detail.get("id"),
        "play_name": detail.get("name"),
        "result": result,
    }


# ═══════════════════════════════════════════════════════════
# Task 4: 叙事结构分析
# ═══════════════════════════════════════════════════════════

NARRATIVE_ANALYSIS_PROMPT = """你是一位京剧叙事结构分析专家。分析以下剧本的叙事结构。

## 叙事阶段定义

1. **开端**: 介绍人物、背景、初始情境
2. **发展**: 矛盾显露、情节推进
3. **高潮**: 冲突顶点、关键转折
4. **结局**: 矛盾解决、结果呈现
5. **尾声**: 收束、总结

## 叙事模式参考

- 线性递进型: 开端→发展→高潮→结局，顺时序推进
- 危机-化解型: 危机开始→升级→化解
- 回环型: 首尾呼应，回到起点
- 双线交织型: 两条故事线交汇
- 对比型: 两条故事线形成对比
- 递进-升华型: 层层推进至最高点

## 任务要求

1. 划分叙事阶段，标注每个阶段对应的对话内容起止
2. 判断剧本的叙事模式
3. 分析剧情节奏变化（紧张/舒缓）

## 输出格式

```json
{
  "narrative_mode": "叙事模式类型",
  "phases": [
    {
      "phase": "开端",
      "description": "阶段内容简述",
      "start_indicator": "起始标志台词或场景",
      "end_indicator": "结束标志台词或场景"
    }
  ],
  "rhythm_analysis": "节奏变化描述（哪里紧张、哪里舒缓）",
  "structure_summary": "叙事结构整体特征"
}
```
"""


def analyze_narrative_structure(llm, detail: Dict[str, Any]) -> Dict[str, Any]:
    """调用 LLM 分析叙事结构"""
    play_text = _format_play_data(detail)
    prompt = NARRATIVE_ANALYSIS_PROMPT + f"\n\n{play_text}"

    response = llm.invoke(prompt)
    content = response.content

    try:
        if "```json" in content:
            json_str = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            json_str = content.split("```")[1].split("```")[0].strip()
        else:
            json_str = content
        result = json.loads(json_str)
    except Exception:
        result = {"raw_response": content}

    return {
        "entity_id": detail.get("id"),
        "play_name": detail.get("name"),
        "result": result,
    }


# ═══════════════════════════════════════════════════════════
# Task 2 子步骤 2.3: 角色别名消歧
# ═══════════════════════════════════════════════════════════

ALIAS_RESOLUTION_PROMPT = """你是一位京剧角色别名分析专家。在京剧剧本中，同一角色常被用不同的名字称呼。

## 别名的常见类型

1. **字/号**：诸葛亮=孔明=卧龙，关羽=云长=关公，赵云=子龙
2. **尊称/官称**：诸葛亮=丞相/武侯，曹操=丞相/魏王，佘太君=太君
3. **简称**：佘太君=太君，穆桂英=桂英
4. **封号/谥号**：项羽=霸王/西楚霸王，岳飞=岳元帅

## 以下角色名对可能为同一人

{pairs_text}

## 任务要求

1. 判断每对名字是否指同一角色
2. 若为同一人，确定哪个是更常用的标准名
3. 给出置信度判断

## 输出格式

```json
{{
  "aliases": [
    {{
      "alias": "较短或较不常用的名字",
      "standard": "标准名（较长或更正式的名字）",
      "confidence": "high/medium/low",
      "reasoning": "判断依据"
    }}
  ]
}}
```

注意：仅输出确实为同一人的别名对，不确定的不要输出。"""


def resolve_character_aliases(
    llm, detail: Dict[str, Any], suspicious_pairs: list
) -> Dict[str, Any]:
    """
    调用 LLM 判断角色别名对

    Args:
        llm: LLM 实例
        detail: 剧本详情
        suspicious_pairs: 可疑别名对列表 [(name_a, name_b), ...]

    Returns:
        LLM 判断结果
    """
    pairs_text = "\n".join(
        f"- {a} 与 {b}" for a, b in suspicious_pairs
    )

    prompt = ALIAS_RESOLUTION_PROMPT.format(pairs_text=pairs_text)
    play_text = _format_play_data(detail)
    prompt += f"\n\n{play_text}"

    response = llm.invoke(prompt)
    content = response.content

    try:
        if "```json" in content:
            json_str = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            json_str = content.split("```")[1].split("```")[0].strip()
        else:
            json_str = content
        result = json.loads(json_str)
    except Exception:
        result = {"raw_response": content}

    return result
