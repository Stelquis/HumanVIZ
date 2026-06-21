# 京剧剧本 PDF 解析脚本
# 逐一处理指定文件夹中的每一个 PDF，一个 PDF 输出一个 JSON 文件
#
# 用法：
#   python3 /workspace/HumanVIZ/data/extract_opera.py
#
# 配置：
#   FOLDERS: 要处理的文件夹编码和名称列表

import pdfplumber
import json
import re
import os
from tqdm import tqdm

# ============================================================
# 第一步：配置要处理的文件夹列表
# ============================================================
FOLDERS = [
    # 综合剧目集 (1192 PDF)
    ("01000000", "《戏考》"),
    ("02000000", "《国剧大成》"),
    ("03000000", "《京剧汇编》"),
    ("04000000", "《京剧丛刊》"),
    ("05000000", "《传统剧目汇编》"),
    ("07000000", "《中国传统戏曲剧本选集》"),
    ("08000000", "《京剧集成》"),
    ("09000000", "《京剧流派剧目荟萃》"),
    ("10000000", "《戏考大全》"),
    ("11000000", "《传统戏曲剧目资料汇编》"),
    ("13000000", "《剧学月刊》"),
    ("14000000", "《戏典》"),
    ("15000000", "《大众戏曲丛书》"),
    # 京剧名家剧本选 (145 PDF)
    ("70001000", "周信芳剧本选"),
    ("70002000", "马连良剧本选"),
    ("70003000", "李洪春剧本选"),
    ("70004000", "唐韵笙剧本选"),
    ("70005000", "汪笑侬剧本选"),
    ("70006000", "孟小冬剧本选"),
    ("70201000", "梅兰芳剧本选"),
    ("70202000", "程砚秋剧本选"),
    ("70203000", "荀慧生剧本选"),
    ("70204000", "欧阳予倩剧本选"),
    ("70401000", "郝寿臣剧本选"),
    ("70402000", "方荣翔剧本选"),
    ("70601000", "萧长华剧本选"),
    # 现代剧作家剧本选 (14 PDF)
    ("70801000", "田汉剧本选"),
    ("70802000", "老舍剧本选"),
    ("70803000", "范钧宏剧本选"),
    ("70804000", "范钧宏、吕瑞明剧本选"),
    ("70805000", "翁偶虹剧本选"),
    # 昆曲剧本选 (71 PDF)
    ("70901000", "侯玉山剧本选"),
    ("70902000", "俞振飞剧本选"),
    ("70903000", "侯少奎剧本选"),
    ("70904000", "马祥麟剧本选"),
    # 其他剧本 (51 PDF)
    ("80000000", "录音、唱片本"),
    ("90000000", "名家藏本、演出本"),
    ("94000000", "院团改编本、演出本"),
]

BASE_DIR = "/workspace/HumanVIZ/data/raw/dataPDF"

# ============================================================
# 第二步：遍历每个文件夹
# ============================================================
total_pdfs = 0
total_ok = 0
total_skip = 0
total_err = 0

for FOLDER_CODE, FOLDER_NAME in FOLDERS:
    INPUT_DIR = os.path.join(BASE_DIR, FOLDER_CODE)
    OUTPUT_DIR = os.path.join("/workspace/HumanVIZ/data/raw/dataSet", FOLDER_CODE)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # ---- 获取所有 PDF 文件列表 ----
    all_files = sorted(os.listdir(INPUT_DIR))
    pdf_files = [f for f in all_files if f.endswith(".pdf")]

    print(f"\n{'='*60}")
    print(f"文件夹: {FOLDER_CODE}  {FOLDER_NAME}")
    print(f"输入: {INPUT_DIR}")
    print(f"输出: {OUTPUT_DIR}")
    print(f"共 {len(pdf_files)} 个 PDF")
    print(f"{'='*60}")

    folder_ok = 0
    folder_skip = 0
    folder_err = 0

    # ============================================================
    # 第三步：逐文件处理
    # ============================================================
    pbar = tqdm(pdf_files, desc=f"  {FOLDER_NAME}", unit="pdf", ncols=100)
    for pdf_name in pbar:
        pdf_path = os.path.join(INPUT_DIR, pdf_name)
        json_name = pdf_name.replace(".pdf", ".json")
        json_path = os.path.join(OUTPUT_DIR, json_name)

        try:
            # ---- 3.1 用 pdfplumber 打开 PDF，提取所有页的文本 ----
            with pdfplumber.open(pdf_path) as pdf:
                all_pages = []
                for page in pdf.pages:
                    text = page.extract_text()
                    if text:
                        all_pages.append(text)

            # 如果一页都没提取到，跳过
            if not all_pages:
                pbar.write(f"  跳过(空页): {pdf_name}")
                total_skip += 1
                folder_skip += 1
                continue

            full_text = "\n".join(all_pages)

            # ---- 3.2 拆成行，过滤掉页眉页脚和无关行 ----
            raw_lines = full_text.split("\n")
            clean_lines = []
            for line in raw_lines:
                line = line.strip()
                if not line:
                    continue
                # 过滤 "中国京剧戏考 《剧名》 页码" 这种页眉
                if re.match(r'^中国京剧戏考\s+《', line):
                    continue
                # 过滤纯 URL
                if line.startswith("http://") or line.startswith("Powered by"):
                    continue
                clean_lines.append(line)

            # ---- 3.3 定位各个元数据区块的位置 ----
            role_idx = -1       # "主要角色" 所在行
            plot_idx = -1       # "情节" 所在行
            anno_idx = -1       # "注释" 所在行
            source_idx = -1     # "根据……" 所在行
            scene_idx = -1      # 第一个场景标记 "【" 所在行

            for i, line in enumerate(clean_lines):
                if line == "主要角色" and role_idx == -1:
                    role_idx = i
                elif line == "情节" and plot_idx == -1:
                    plot_idx = i
                elif line == "注释" and anno_idx == -1:
                    anno_idx = i
                elif line.startswith("根据") and source_idx == -1:
                    source_idx = i
                elif re.match(r'^【', line) and scene_idx == -1:
                    scene_idx = i

            # ---- 3.4 提取标题（第一个 《》 中的内容） ----
            title = ""
            search_range = clean_lines[:20]
            if role_idx > 0 and role_idx < 20:
                search_range = clean_lines[:role_idx + 1]
            for line in search_range:
                m = re.search(r'《([^》]+)》', line)
                if m:
                    t = m.group(1)
                    # 跳过 "中国京剧戏考" 这类前缀中的书名号
                    if "戏考" not in t or len(t) > 3:
                        title = t
                        break

            # ---- 3.5 提取又名，合并入标题（"一名：《xxx》" 或 "一名：xxx"） ----
            for line in clean_lines[:30]:
                m = re.search(r'[一又]名[：:]\s*《?([^》\n]+)》?', line)
                if m:
                    alt_name = m.group(1).strip()
                    if title and alt_name:
                        title = f"{title}（一名：{alt_name}）"
                    break

            # ---- 3.6 提取主要角色 ----
            characters = ""
            if role_idx >= 0:
                possible_ends = []
                if plot_idx > role_idx:
                    possible_ends.append(plot_idx)
                if anno_idx > role_idx:
                    possible_ends.append(anno_idx)
                if source_idx > role_idx:
                    possible_ends.append(source_idx)
                if scene_idx > role_idx:
                    possible_ends.append(scene_idx)
                end_idx = min(possible_ends) if possible_ends else len(clean_lines)
                characters = "\n".join(clean_lines[role_idx + 1:end_idx]).strip()

            # ---- 3.7 提取情节 ----
            synopsis = ""
            if plot_idx >= 0:
                possible_ends = []
                if anno_idx > plot_idx:
                    possible_ends.append(anno_idx)
                if source_idx > plot_idx:
                    possible_ends.append(source_idx)
                if scene_idx > plot_idx:
                    possible_ends.append(scene_idx)
                end_idx = min(possible_ends) if possible_ends else len(clean_lines)
                synopsis = "\n".join(clean_lines[plot_idx + 1:end_idx]).strip()

            # ---- 3.8 提取注释 ----
            annotation = ""
            if anno_idx >= 0:
                possible_ends = []
                if source_idx > anno_idx:
                    possible_ends.append(source_idx)
                if scene_idx > anno_idx:
                    possible_ends.append(scene_idx)
                end_idx = min(possible_ends) if possible_ends else len(clean_lines)
                annotation = "\n".join(clean_lines[anno_idx + 1:end_idx]).strip()

            # ---- 3.9 提取说明（"根据……" 到正文之间） ----
            source_note = ""
            if source_idx >= 0:
                end_idx = scene_idx if scene_idx > source_idx else len(clean_lines)
                source_note = "\n".join(clean_lines[source_idx:end_idx]).strip()

            # ---- 3.10 提取正文对话（从第一个场景标记开始） ----
            dialogue = ""
            if scene_idx >= 0:
                dialogue = "\n".join(clean_lines[scene_idx:]).strip()
            else:
                # 如果没有场景标记，从最后一个元数据块之后提取
                after_idx = max(role_idx, plot_idx, anno_idx, source_idx)
                if after_idx >= 0:
                    dialogue = "\n".join(clean_lines[after_idx + 1:]).strip()
                else:
                    # 没有任何元数据标记，整篇都是正文
                    dialogue = "\n".join(clean_lines).strip()

            # ---- 3.11 组装 JSON ----
            result = {}
            result["source_folder"] = FOLDER_CODE
            result["source_folder_name"] = FOLDER_NAME
            result["file_name"] = pdf_name
            result["剧本名字"] = title
            result["主要角色"] = characters
            result["情节"] = synopsis
            result["注释"] = annotation
            result["说明"] = source_note
            result["正文对话"] = dialogue

            # ---- 3.12 写出 JSON 文件 ----
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)

            total_ok += 1
            folder_ok += 1

        except Exception as e:
            pbar.write(f"  错误: {pdf_name} - {e}")
            total_err += 1
            folder_err += 1

    total_pdfs += len(pdf_files)
    print(f"\n文件夹 {FOLDER_CODE} 完成: 成功 {folder_ok} / 跳过 {folder_skip} / 错误 {folder_err} / 共 {len(pdf_files)}")

# ============================================================
# 第四步：最终汇总
# ============================================================
print(f"\n{'#'*60}")
print(f"全部完成！")
print(f"  处理文件夹: {len(FOLDERS)} 个")
print(f"  总 PDF 数:  {total_pdfs}")
print(f"  成功:       {total_ok}")
print(f"  跳过(空页): {total_skip}")
print(f"  错误:       {total_err}")
print(f"  输出根目录:  /workspace/HumanVIZ/data/raw/dataSet/")
print(f"{'#'*60}")
