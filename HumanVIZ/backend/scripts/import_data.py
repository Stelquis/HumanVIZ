"""
数据导入脚本
支持 CSV、XLSX、JSON、TXT 四种格式

使用方法:
    python scripts/import_data.py --dir /path/to/data --format auto
"""

import sys
import json
import argparse
import pandas as pd
from pathlib import Path
from typing import Optional

# 添加父目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.connection import get_db_connection, init_database
from database.models import (
    insert_dataset, insert_entity, update_dataset_record_count,
    delete_dataset,
    insert_field_def, delete_field_defs_by_dataset
)


# ── 类别映射表 ──────────────────────────────────────────────────
# 从文件名前缀推断数据类别，匹配前端 DIMENSIONS 的 datasetId
CATEGORY_MAP = {
    "02": ("waterway",   "水系"),
    "03": ("climate",    "气候"),
    "04": ("vegetation", "植被"),
    "05": ("disaster",   "灾害"),
    "07": ("admin",      "建制沿革"),
    "09": ("key_building", "重点建筑"),
    "10": ("other_building", "其他建筑"),
    "11": ("population", "人口"),
    "13": ("culture",    "文化"),
    "14": ("commerce",   "商业手工业"),
    "15": ("product",    "物产"),
    "16": ("transport",  "交通"),
    "17": ("event",      "事件"),
    "18": ("war",        "战争"),
    "19": ("figure",     "人物"),
}

# 朝代 Sheet 名 → 标准化朝代名
def extract_dynasty(sheet_name: str) -> Optional[str]:
    """从 sheet 名称提取朝代（如 '01先秦至汉' → '先秦至汉'）"""
    import re
    # 去掉前导数字
    cleaned = re.sub(r'^\d+', '', sheet_name).strip()
    if not cleaned or '总' in cleaned:
        return None
    return cleaned


def _infer_field_type(sample_values: list) -> str:
    """根据采样值推断字段类型"""
    has_number = 0
    has_text = 0
    for v in sample_values:
        if v is None or (isinstance(v, float) and pd.isna(v)):
            continue
        try:
            float(str(v))
            has_number += 1
        except (ValueError, TypeError):
            if isinstance(v, str) and len(v) > 0:
                has_text += 1
    if has_number > has_text:
        return "number"
    return "text"


def import_excel(file_path: Path, dataset_id: Optional[str] = None) -> bool:
    """
    导入 Excel 文件（支持多 Sheet）

    处理逻辑：
    - 读取所有 sheet，每个 sheet 对应一个朝代/时期
    - 第一个 sheet（通常是"总XX"）记录为 dynasty=None
    - 其他 sheet（如"01先秦至汉"）记录为对应朝代
    - 每个实体的 attributes JSON 中自动附加 __dynasty 字段

    Args:
        file_path: Excel 文件路径
        dataset_id: 数据集 ID，默认为文件名（去除空格和横线）

    Returns:
        bool: 是否导入成功
    """
    if not dataset_id:
        dataset_id = file_path.stem.replace(" ", "_").replace("-", "_")

    try:
        # ── 1. 类别识别 ──
        filename = file_path.stem
        category_id = "other"
        category_name = "其他"
        # 按文件名前两位匹配
        prefix = filename[:2]
        if prefix in CATEGORY_MAP:
            category_id, category_name = CATEGORY_MAP[prefix]
        else:
            # fallback：中文关键字匹配
            for kw, (cid, cname) in {
                "水系": "waterway", "气候": "climate", "植被": "vegetation",
                "灾害": "disaster", "建制": "admin", "重点建筑": "key_building",
                "其他建筑": "other_building", "人口": "population", "文化": "culture",
                "商业": "commerce", "物产": "product", "交通": "transport",
                "事件": "event", "战争": "war", "人物": "figure"
            }.items():
                if kw in filename:
                    category_id = cid
                    category_name = kw
                    break

        # ── 2. 读取所有 Sheet ──
        xl = pd.ExcelFile(file_path)
        sheet_names = xl.sheet_names
        print(f"\n📊 读取 Excel: {file_path.name}")
        print(f"   类别: {category_name} ({category_id})")
        print(f"   Sheets: {sheet_names}")

        all_records = []  # 收集所有 sheet 的数据
        total_rows = 0

        for sheet_name in sheet_names:
            # 读取 sheet（不设 header，手动处理多级表头）
            df = pd.read_excel(file_path, sheet_name=sheet_name, header=None)
            if df.empty or len(df) < 3:
                print(f"   ⏭️  {sheet_name}: 数据行不足，跳过")
                continue

            dynasty = extract_dynasty(sheet_name)
            sheet_label = dynasty or "总览"

            # ── 3. 解析表头 ──
            # Row 0: 大类标题（合并单元格，多列共用）
            # Row 1: 子标题（具体列名）
            # 合并两级标题构建最终列名
            row0 = [str(v) if pd.notna(v) and str(v) != 'nan' else '' for v in df.iloc[0]]
            row1 = [str(v) if pd.notna(v) and str(v) != 'nan' else '' for v in df.iloc[1]]

            columns = []
            for i in range(max(len(row0), len(row1))):
                h0 = row0[i] if i < len(row0) else ''
                h1 = row1[i] if i < len(row1) else ''
                col_name = f"{h0}/{h1}".strip("/")
                if not col_name:
                    col_name = f"Col_{i}"
                columns.append(col_name)

            # ── 4. 解析数据行 ──
            sheet_rows = 0
            for idx in range(2, len(df)):
                row_values = df.iloc[idx]
                # 跳过全空行
                if row_values.isna().all():
                    continue

                # 第一列（通常是"时期"）作为实体名称
                cell0 = row_values.iloc[0]
                name = str(cell0) if pd.notna(cell0) else f"记录_{idx}"

                # 构建属性字典
                row_dict = {"__dynasty": dynasty, "__sheet": sheet_name}
                # 记录所属大类别
                row_dict["__category"] = category_id
                row_dict["__category_name"] = category_name

                for col_idx, col_val in enumerate(row_values):
                    if col_idx >= len(columns):
                        break
                    col_name = columns[col_idx]
                    if pd.isna(col_val):
                        row_dict[col_name] = None
                    elif isinstance(col_val, (int, float)):
                        row_dict[col_name] = col_val
                    else:
                        row_dict[col_name] = str(col_val)

                all_records.append({
                    "name": name,
                    "dynasty": dynasty,
                    "attributes": row_dict
                })
                sheet_rows += 1

            print(f"   ✅ {sheet_name} [{sheet_label}]: {sheet_rows} 条")
            total_rows += sheet_rows

        if not all_records:
            print(f"   ⚠️  无有效数据行")
            return False

        # ── 5. 提取描述 ──
        # 从第一条记录中找长度 > 30 的文本字段作为数据集描述
        description = f"{category_name}历史数据，覆盖"
        text_fields = []
        for rec in all_records[:5]:
            for k, v in rec["attributes"].items():
                if isinstance(v, str) and len(v) > 30 and not k.startswith("__"):
                    text_fields.append(v[:100])
        if text_fields:
            description = text_fields[0][:200]

        # ── 6. 写入数据库 ──
        conn = get_db_connection()
        try:
            # 删除旧数据集（如果存在）
            delete_dataset(conn, dataset_id)

            # 插入数据集元信息
            insert_dataset(
                conn,
                dataset_id=dataset_id,
                name=filename,
                category=category_id,
                description=description,
                source_file=file_path.name,
                record_count=len(all_records)
            )

            # 批量插入实体
            from database.models import batch_insert_entities
            batch_data = []
            for rec in all_records:
                batch_data.append({
                    "name": rec["name"],
                    "type": "record",
                    "attributes": json.dumps(rec["attributes"], ensure_ascii=False)
                })

            batch_insert_entities(conn, dataset_id, batch_data)

            # ── 7. 注册字段定义 ──
            delete_field_defs_by_dataset(conn, dataset_id)

            # 从第一条实体的 attributes 中提取字段
            first_attrs = all_records[0]["attributes"]
            for sort_idx, (field_name, field_val) in enumerate(first_attrs.items()):
                if field_name.startswith("__"):
                    continue  # 内部字段不暴露

                # 推断类型
                sample_values = []
                for rec in all_records[:50]:
                    v = rec["attributes"].get(field_name)
                    if v is not None:
                        sample_values.append(v)
                field_type = _infer_field_type(sample_values)

                display_name = field_name.split("/")[-1] if "/" in field_name else field_name

                insert_field_def(
                    conn,
                    dataset_id=dataset_id,
                    field_name=field_name,
                    field_type=field_type,
                    display_name=display_name,
                    description=f"从 {file_path.name} 自动提取",
                    is_filterable=(field_type in ("text", "category")),
                    is_visible=True,
                    sort_order=sort_idx
                )

            # 更新记录数
            update_dataset_record_count(conn, dataset_id)

            total_dynasties = len(set(r["dynasty"] for r in all_records if r["dynasty"]))
            print(f"   ✅ 导入成功: {dataset_id}")
            print(f"      总记录: {len(all_records)}, 朝代跨度: {total_dynasties} 个时期")
            return True

        finally:
            conn.close()

    except Exception as e:
        print(f"   ❌ 导入失败 {file_path}: {e}")
        import traceback
        traceback.print_exc()
        return False


def import_csv(file_path: Path, dataset_id: Optional[str] = None) -> bool:
    """导入 CSV 文件"""
    if not dataset_id:
        dataset_id = file_path.stem.replace(" ", "_").replace("-", "_")
    
    try:
        df = pd.read_csv(file_path)
        print(f"📊 读取 CSV: {file_path.name}, 共 {len(df)} 行")
        
        conn = get_db_connection()
        try:
            insert_dataset(
                conn,
                dataset_id=dataset_id,
                name=file_path.stem,
                category="csv",
                source_file=file_path.name,
                record_count=len(df)
            )
            
            for idx, row in df.iterrows():
                name = str(row.iloc[0]) if pd.notna(row.iloc[0]) else f"记录_{idx}"
                row_dict = {col: (None if pd.isna(row[col]) else row[col]) for col in df.columns}
                attributes = json.dumps(row_dict, ensure_ascii=False)
                
                insert_entity(conn, dataset_id, name, "record", attributes=attributes)
            
            print(f"✅ 导入成功: {dataset_id}")
            return True
        finally:
            conn.close()
            
    except Exception as e:
        print(f"❌ 导入失败 {file_path}: {e}")
        return False


def import_json(file_path: Path, dataset_id: Optional[str] = None) -> bool:
    """导入 JSON 文件"""
    if not dataset_id:
        dataset_id = file_path.stem.replace(" ", "_").replace("-", "_")
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # 如果是字典，尝试找到数组
        if isinstance(data, dict):
            records = None
            for key, value in data.items():
                if isinstance(value, list) and len(value) > 0:
                    records = value
                    break
            if records is None:
                records = [data]
        else:
            records = data if isinstance(data, list) else [data]
        
        print(f"📊 读取 JSON: {file_path.name}, 共 {len(records)} 条记录")
        
        conn = get_db_connection()
        try:
            insert_dataset(
                conn,
                dataset_id=dataset_id,
                name=file_path.stem,
                category="json",
                source_file=file_path.name,
                record_count=len(records)
            )
            
            for idx, record in enumerate(records):
                name = record.get("name", record.get("title", f"记录_{idx}"))
                content = None
                if isinstance(record, str):
                    content = record
                    record = {"text": record}
                
                attributes = json.dumps(record, ensure_ascii=False)
                insert_entity(conn, dataset_id, name, "record", content, attributes)
            
            print(f"✅ 导入成功: {dataset_id}")
            return True
        finally:
            conn.close()
            
    except Exception as e:
        print(f"❌ 导入失败 {file_path}: {e}")
        import traceback
        traceback.print_exc()
        return False


def import_txt(file_path: Path, dataset_id: Optional[str] = None) -> bool:
    """导入 TXT 文件（按章节分割）"""
    if not dataset_id:
        dataset_id = file_path.stem.replace(" ", "_").replace("-", "_")
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 简单按章节分割（可以根据实际需要调整）
        chapters = content.split("\n\n")
        chapters = [c.strip() for c in chapters if c.strip()]
        
        print(f"📄 读取 TXT: {file_path.name}, 共 {len(chapters)} 段")
        
        conn = get_db_connection()
        try:
            insert_dataset(
                conn,
                dataset_id=dataset_id,
                name=file_path.stem,
                category="text",
                source_file=file_path.name,
                record_count=len(chapters)
            )
            
            for idx, chapter in enumerate(chapters):
                # 第一行作为标题
                lines = chapter.split("\n")
                name = lines[0][:50] if lines else f"章节_{idx}"
                insert_entity(
                    conn, 
                    dataset_id, 
                    name=name, 
                    entity_type="chapter",
                    content=chapter,
                    attributes=json.dumps({"index": idx, "length": len(chapter)})
                )
            
            print(f"✅ 导入成功: {dataset_id}")
            return True
        finally:
            conn.close()
            
    except Exception as e:
        print(f"❌ 导入失败 {file_path}: {e}")
        return False


def auto_import_directory(data_dir: Path, pattern: str = "*"):
    """
    自动导入目录下的所有支持格式的文件
    
    Args:
        data_dir: 数据目录
        pattern: 文件名匹配模式
    """
    if not data_dir.exists():
        print(f"❌ 目录不存在: {data_dir}")
        return
    
    print(f"📂 扫描目录: {data_dir}")
    print("=" * 60)
    
    supported_extensions = ['.xlsx', '.xls', '.csv', '.json', '.txt']
    files = []
    
    for ext in supported_extensions:
        files.extend(data_dir.glob(f"{pattern}{ext}"))
    
    if not files:
        print("⚠️ 未找到支持格式的文件")
        return
    
    print(f"发现 {len(files)} 个文件")
    print("-" * 60)
    
    success_count = 0
    for file_path in sorted(files):
        print(f"\n📝 处理: {file_path.name}")
        
        ext = file_path.suffix.lower()
        if ext in ['.xlsx', '.xls']:
            if import_excel(file_path):
                success_count += 1
        elif ext == '.csv':
            if import_csv(file_path):
                success_count += 1
        elif ext == '.json':
            if import_json(file_path):
                success_count += 1
        elif ext == '.txt':
            if import_txt(file_path):
                success_count += 1
    
    print("\n" + "=" * 60)
    print(f"✅ 导入完成: {success_count}/{len(files)} 个文件成功")


def main():
    parser = argparse.ArgumentParser(description="HumanVIZ 数据导入工具")
    parser.add_argument(
        "--dir", "-d",
        type=str,
        default=str(Path(__file__).parent.parent.parent / "ChinaVis2025-1-I"),
        help="数据目录路径"
    )
    parser.add_argument(
        "--file", "-f",
        type=str,
        help="单个文件路径"
    )
    parser.add_argument(
        "--init",
        action="store_true",
        help="初始化数据库（创建表结构）"
    )
    parser.add_argument(
        "--pattern",
        type=str,
        default="*",
        help="文件名匹配模式，如 '02*' 只导入 02 开头的文件"
    )
    
    args = parser.parse_args()
    
    # 初始化数据库
    if args.init:
        print("🔧 初始化数据库...")
        init_database()
        return
    
    # 导入单个文件
    if args.file:
        file_path = Path(args.file)
        if not file_path.exists():
            print(f"❌ 文件不存在: {file_path}")
            return
        
        ext = file_path.suffix.lower()
        if ext in ['.xlsx', '.xls']:
            import_excel(file_path)
        elif ext == '.csv':
            import_csv(file_path)
        elif ext == '.json':
            import_json(file_path)
        elif ext == '.txt':
            import_txt(file_path)
        else:
            print(f"❌ 不支持的文件格式: {ext}")
        return
    
    # 自动导入目录
    data_dir = Path(args.dir)
    auto_import_directory(data_dir, args.pattern)


if __name__ == "__main__":
    main()
