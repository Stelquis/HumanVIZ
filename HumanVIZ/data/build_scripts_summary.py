"""
扫描 1,473 个京剧剧本 JSON，提取关键字段，
生成 public/scriptsSummary.json 供 InfinityRiver 组件使用。
"""
import json, os, glob

DATA_DIR = os.path.join(os.path.dirname(__file__), "dataSet")
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "scriptsSummary.json")

# source_folder_name → 五大来源分类
SOURCE_MAP = {
    "《戏考》": "综合剧目集",
    "《京剧汇编》": "综合剧目集",
    "《国剧大成》": "综合剧目集",
    "《京剧丛刊》": "综合剧目集",
    "《传统剧目汇编》": "综合剧目集",
    "《戏典》": "综合剧目集",
    "《京剧流派剧目荟萃》": "综合剧目集",
    "《剧学月刊》": "综合剧目集",
    "《京剧集成》": "综合剧目集",
    "《戏考大全》": "综合剧目集",
    "《中国传统戏曲剧本选集》": "综合剧目集",
    "《传统戏曲剧目资料汇编》": "综合剧目集",
    "《大众戏曲丛书》": "综合剧目集",
    # 名家
    "李洪春剧本选": "名家剧本选",
    "荀慧生剧本选": "名家剧本选",
    "周信芳剧本选": "名家剧本选",
    "汪笑侬剧本选": "名家剧本选",
    "孟小冬剧本选": "名家剧本选",
    "程砚秋剧本选": "名家剧本选",
    "梅兰芳剧本选": "名家剧本选",
    "唐韵笙剧本选": "名家剧本选",
    "马连良剧本选": "名家剧本选",
    "萧长华剧本选": "名家剧本选",
    "郝寿臣剧本选": "名家剧本选",
    "方荣翔剧本选": "名家剧本选",
    "欧阳予倩剧本选": "名家剧本选",
    # 昆曲
    "俞振飞剧本选": "昆曲剧本选",
    "侯玉山剧本选": "昆曲剧本选",
    "马祥麟剧本选": "昆曲剧本选",
    "侯少奎剧本选": "昆曲剧本选",
    # 现代剧作家
    "翁偶虹剧本选": "现代剧作家",
    "田汉剧本选": "现代剧作家",
    "老舍剧本选": "现代剧作家",
    "范钧宏剧本选": "现代剧作家",
    "范钧宏、吕瑞明剧本选": "现代剧作家",
    # 其他
    "录音、唱片本": "其他剧本",
    "名家藏本、演出本": "其他剧本",
    "院团改编本、演出本": "其他剧本",
}

# 从角色行描述中提取主导行当
ROLE_KEYWORDS = ["生", "旦", "净", "丑"]

def extract_role_type(roles_text: str) -> str:
    """取第一个角色的行当类型（生/旦/净/丑）"""
    if not roles_text:
        return "生"
    first_line = roles_text.strip().split("\n")[0]
    # 格式: "诸葛亮：老生" 或 "诸葛亮:老生"
    parts = first_line.replace("：", ":").split(":")
    if len(parts) >= 2:
        role_desc = parts[1].strip()
        for kw in ROLE_KEYWORDS:
            if kw in role_desc:
                return kw
    return "生"


def main():
    scripts = []
    json_files = sorted(glob.glob(os.path.join(DATA_DIR, "**", "*.json"), recursive=True))

    for fpath in json_files:
        with open(fpath, "r", encoding="utf-8") as f:
            data = json.load(f)

        fname = os.path.splitext(os.path.basename(fpath))[0]  # "01001001_空城计"
        title = data.get("剧本名字", fname)
        source_name = data.get("source_folder_name", "")
        source = SOURCE_MAP.get(source_name, "其他剧本")
        roles = data.get("主要角色", "")
        role_type = extract_role_type(roles)

        scripts.append({
            "id": fname,
            "title": title,
            "source": source,
            "roleType": role_type,
            "roles": roles,
        })

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(scripts, f, ensure_ascii=False, separators=(",", ":"))

    print(f"✅ 生成 {len(scripts)} 条记录 → {OUT_PATH}")
    # 统计
    from collections import Counter
    src_cnt = Counter(s["source"] for s in scripts)
    role_cnt = Counter(s["roleType"] for s in scripts)
    print("来源分布:", dict(src_cnt))
    print("行当分布:", dict(role_cnt))


if __name__ == "__main__":
    main()
