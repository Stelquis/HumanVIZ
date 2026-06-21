#!/usr/bin/env python3
"""
import_enriched_to_db.py — 将增强后的 opera-samples.json 导入 SQLite 数据库

导入内容:
  - datasets: 1 条记录 (peking_opera_samples)
  - entities: 每部剧本 + 每个角色 + 每个场景 作为实体
  - field_defs: 自动注册所有可用字段
  - relations: 角色共现网络关系
  - FTS5 全文索引: 剧本名字 + 情节 + 对白

用法:
    python scripts/import_enriched_to_db.py
    python scripts/import_enriched_to_db.py --rebuild  # 清空后重建
"""

import json
import sys
import sqlite3
import os
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any

PROJECT_ROOT = Path(__file__).parent.parent
SAMPLES_FILE = PROJECT_ROOT / "src" / "data" / "opera-samples.json"
DB_FILE = PROJECT_ROOT / "data" / "humanviz.db"


def main(rebuild: bool = False):
    print("🗄️  导入增强数据到 SQLite")
    print(f"   数据库: {DB_FILE}")
    print()

    # 加载增强数据
    with open(SAMPLES_FILE, 'r', encoding='utf-8') as f:
        samples = json.load(f)

    operas = {k: v for k, v in samples.items() if isinstance(v, dict)}
    print(f"📂 加载 {len(operas)} 部剧本")

    # 连接数据库
    conn = sqlite3.connect(str(DB_FILE))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")

    if rebuild:
        _rebuild_schema(conn)

    # 确保表结构存在
    _ensure_schema(conn)

    # ── 1. 导入数据集元信息 ──
    dataset_id = "peking_opera_samples"
    total_scenes = sum(o.get('num_scenes', 0) for o in operas.values())
    total_chars = sum(o.get('num_characters', 0) for o in operas.values())

    conn.execute("""
        INSERT OR REPLACE INTO datasets (id, name, category, dynasty, description, source_file, record_count, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    """, (
        dataset_id,
        "京剧剧本样本集 (增强版)",
        "京剧剧本",
        "清-民国",
        f"包含 {len(operas)} 部京剧剧本的完整叙事数据，含原文对白、情感分析、主题标注、角色网络。"
        f"共 {total_scenes} 场、{total_chars} 个角色。"
        f"数据增强于 {datetime.now().strftime('%Y-%m-%d')}。",
        "opera-samples.json (enriched)",
        len(operas),
    ))
    print(f"✅ 数据集: {dataset_id}")

    # ── 2. 导入实体 ──
    entities_inserted = 0
    relations_data = []

    for key, opera in operas.items():
        title = opera.get('title', key)
        entity_id = opera.get('source_file', key).replace('.json', '')

        # 2a. 剧本级实体
        opera_attrs = {
            "title": title,
            "author": opera.get('author', ''),
            "year": opera.get('year', ''),
            "type": opera.get('type', ''),
            "genre": opera.get('genre', ''),
            "source_category": opera.get('source_category', ''),
            "num_scenes": opera.get('num_scenes', 0),
            "num_characters": opera.get('num_characters', 0),
            "num_locations": opera.get('num_locations', 0),
            "num_chapters": opera.get('num_chapters', 0),
            "plot_summary": opera.get('plot_summary', ''),
            "performance_notes": opera.get('performance_notes', ''),
            "source_description": opera.get('source_description', ''),
            "theme": opera.get('theme', {}),
        }

        cursor = conn.execute("""
            INSERT INTO entities (dataset_id, name, type, content, attributes)
            VALUES (?, ?, ?, ?, ?)
        """, (
            dataset_id,
            title,
            "opera_script",
            opera.get('plot_summary', ''),
            json.dumps(opera_attrs, ensure_ascii=False),
        ))
        opera_rowid = cursor.lastrowid
        entities_inserted += 1

        # 2b. 角色级实体
        char_rowids = {}
        for char in opera.get('characters', []):
            char_name = char.get('character', '')
            char_attrs = {
                "short": char.get('short', ''),
                "group": char.get('group', ''),
                "role_type": char.get('role_type', ''),
                "quote": char.get('quote', ''),
                "explanation": char.get('explanation', []),
                "network_degree": char.get('network_degree', 0),
                "network_scene_count": char.get('network_scene_count', 0),
                "opera_title": title,
                "opera_entity_id": opera_rowid,
            }

            cursor = conn.execute("""
                INSERT INTO entities (dataset_id, name, type, content, attributes)
                VALUES (?, ?, ?, ?, ?)
            """, (
                dataset_id,
                char_name,
                "character",
                f"{title} 中的角色: {char_name} ({char.get('group', '未知行当')})",
                json.dumps(char_attrs, ensure_ascii=False),
            ))
            char_rowids[char_name] = cursor.lastrowid
            entities_inserted += 1

        # 2c. 场景级实体（含对白）
        for scene in opera.get('scenes', []):
            scene_name = f"{title} — 第{scene.get('number', '?')}场 {scene.get('name', '')}"
            scene_attrs = {
                "opera_title": title,
                "opera_entity_id": opera_rowid,
                "scene_number": scene.get('number', 0),
                "scene_name": scene.get('name', ''),
                "location": scene.get('location', ''),
                "chapter": scene.get('chapter', ''),
                "numLines": scene.get('numLines', 0),
                "ratings": scene.get('ratings', {}),
                "confidence": scene.get('confidence', 0),
                "characters_in_scene": [
                    {"name": c.get('name', ''), "emotion": c.get('emotion', ''),
                     "rating": c.get('rating', 0), "role": c.get('role', ''),
                     "evidence": c.get('evidence', [])}
                    for c in scene.get('characters', [])
                ],
            }

            conn.execute("""
                INSERT INTO entities (dataset_id, name, type, content, attributes)
                VALUES (?, ?, ?, ?, ?)
            """, (
                dataset_id,
                scene_name,
                "scene",
                scene.get('text', '') or scene.get('dialogue', '') or scene.get('summary', ''),
                json.dumps(scene_attrs, ensure_ascii=False),
            ))
            entities_inserted += 1

        # 2d. 收集关系数据（角色共现）
        network = opera.get('character_network', {})
        for edge in network.get('edges', []):
            source_name = edge.get('source', '')
            target_name = edge.get('target', '')
            if source_name in char_rowids and target_name in char_rowids:
                relations_data.append({
                    "source_entity_id": char_rowids[source_name],
                    "target_entity_id": char_rowids[target_name],
                    "relation_type": "共现",
                    "description": f"在《{title}》中共同出场 {edge.get('scenes', 0)} 场",
                    "weight": edge.get('weight', 1.0) / max(network.get('nodes', [{}])[0].get('degree', 1), 1),
                    "source": "original",
                    "metadata": json.dumps({
                        "opera_title": title,
                        "co_scenes": edge.get('scenes', 0),
                    }, ensure_ascii=False),
                })

        print(f"  ✅ 《{title}》: {len(opera.get('characters', []))}角色 + {len(opera.get('scenes', []))}场景 + {len(network.get('edges', []))}关系")

    conn.commit()
    print(f"\n✅ 实体: {entities_inserted} 条")

    # ── 3. 批量导入关系 ──
    if relations_data:
        conn.executemany("""
            INSERT INTO relations
            (source_entity_id, target_entity_id, relation_type, description, weight, source, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, [
            (r['source_entity_id'], r['target_entity_id'], r['relation_type'],
             r['description'], r['weight'], r['source'], r['metadata'])
            for r in relations_data
        ])
        conn.commit()
        print(f"✅ 关系: {len(relations_data)} 条")

    # ── 4. 注册字段定义 ──
    field_defs_data = [
        ("title", "text", "剧本名称", "京剧剧本的名称", True, True, 1),
        ("author", "text", "作者/来源", "剧本出处或作者", True, True, 2),
        ("year", "number", "年代", "剧本产生的年代", True, False, 3),
        ("genre", "category", "剧目类型", "剧本的剧目分类（历史戏/爱情戏等）", True, True, 4),
        ("source_category", "category", "数据来源", "剧本来源分类（民国汇编本/名家剧本选等）", True, True, 5),
        ("num_scenes", "number", "场次数", "剧本包含的场景数量", False, True, 6),
        ("num_characters", "number", "角色数", "剧本中的角色总数", False, True, 7),
        ("plot_summary", "text", "情节概要", "剧本的情节摘要", False, False, 8),
        ("theme", "category", "主题标注", "LLM 分析的主题分类（智谋韬略/忠义报国等）", True, True, 9),
        ("emotion", "category", "角色情感", "角色在场景中的情感标签", True, True, 10),
        ("confidence", "number", "数据置信度", "数据质量置信度评分 0-1", False, False, 11),
    ]

    for fd in field_defs_data:
        conn.execute("""
            INSERT OR IGNORE INTO field_defs
            (dataset_id, field_name, field_type, display_name, description, is_filterable, is_visible, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (dataset_id, fd[0], fd[1], fd[2], fd[3], int(fd[4]), int(fd[5]), fd[6]))
    conn.commit()
    print(f"✅ 字段定义: {len(field_defs_data)} 个")

    # ── 5. FTS5 全文索引 ──
    _rebuild_fts(conn)

    # ── 6. 导入日志 ──
    conn.execute("""
        INSERT INTO import_logs
        (dataset_id, file_name, file_path, status, record_count, import_duration_seconds)
        VALUES (?, ?, ?, 'success', ?, 0)
    """, (dataset_id, "opera-samples.json (enriched)",
          str(SAMPLES_FILE), entities_inserted))
    conn.commit()

    # ── 7. 验证 ──
    print(f"\n🔍 数据库验证:")
    tables = ['datasets', 'entities', 'relations', 'field_defs', 'import_logs']
    for table in tables:
        count = conn.execute(f"SELECT COUNT(*) as cnt FROM {table}").fetchone()['cnt']
        print(f"  {table}: {count} 条")

    # FTS5 验证
    try:
        fts_count = conn.execute("SELECT COUNT(*) as cnt FROM plays_fts").fetchone()['cnt']
        print(f"  plays_fts (FTS5): {fts_count} 条")
    except:
        print(f"  plays_fts (FTS5): 未初始化")

    conn.close()
    print(f"\n🎉 数据库导入完成!")


def _ensure_schema(conn: sqlite3.Connection):
    """确保基本表结构存在"""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS datasets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT,
            dynasty TEXT,
            year_start INTEGER,
            year_end INTEGER,
            description TEXT,
            source_file TEXT,
            record_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS entities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dataset_id TEXT NOT NULL,
            name TEXT,
            type TEXT,
            content TEXT,
            attributes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS field_defs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dataset_id TEXT NOT NULL,
            field_name TEXT NOT NULL,
            field_type TEXT NOT NULL,
            display_name TEXT,
            description TEXT,
            is_filterable BOOLEAN DEFAULT 0,
            is_visible BOOLEAN DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
            UNIQUE(dataset_id, field_name)
        );

        CREATE TABLE IF NOT EXISTS relations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_entity_id INTEGER NOT NULL,
            target_entity_id INTEGER NOT NULL,
            relation_type TEXT,
            description TEXT,
            weight REAL DEFAULT 1.0,
            source TEXT,
            metadata TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (source_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
            FOREIGN KEY (target_entity_id) REFERENCES entities(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS import_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dataset_id TEXT,
            file_name TEXT NOT NULL,
            file_path TEXT,
            file_size INTEGER,
            record_count INTEGER,
            status TEXT NOT NULL DEFAULT 'pending',
            error_message TEXT,
            import_duration_seconds REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()


def _rebuild_schema(conn: sqlite3.Connection):
    """清空并重建所有表"""
    conn.executescript("""
        DROP TABLE IF EXISTS relations;
        DROP TABLE IF EXISTS field_defs;
        DROP TABLE IF EXISTS import_logs;
        DROP TABLE IF EXISTS entities;
        DROP TABLE IF EXISTS datasets;
        DROP TABLE IF EXISTS plays_fts;
    """)
    conn.commit()
    print("🔄 表结构已清空，准备重建")


def _rebuild_fts(conn: sqlite3.Connection):
    """重建 FTS5 全文索引 (含场景对白和角色名)"""
    try:
        # 确保 FTS5 虚拟表存在
        conn.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS plays_fts USING fts5(
                name, plot, dialogue, roles_text,
                tokenize='unicode61 remove_diacritics 0'
            );
        """)

        # 清空旧索引
        conn.execute("DELETE FROM plays_fts")

        # 从 entities 表重建: 聚合每部剧本的所有场景对白
        opera_rows = conn.execute(
            "SELECT id, name, content, attributes FROM entities WHERE type = 'opera_script'"
        ).fetchall()

        inserted = 0
        for opera in opera_rows:
            # 收集该剧本所有场景对白
            scene_rows = conn.execute(
                "SELECT content FROM entities WHERE type = 'scene' AND json_extract(attributes, '$.opera_entity_id') = ?",
                (opera['id'],)
            ).fetchall()

            all_dialogue = opera['content'] or ''
            for sr in scene_rows:
                if sr['content']:
                    all_dialogue += '\n' + sr['content']

            # 收集该剧本所有角色名
            char_rows = conn.execute(
                "SELECT name FROM entities WHERE type = 'character' AND json_extract(attributes, '$.opera_entity_id') = ?",
                (opera['id'],)
            ).fetchall()
            roles_text = ' '.join(c['name'] for c in char_rows)

            conn.execute(
                "INSERT INTO plays_fts(rowid, name, plot, dialogue, roles_text) VALUES (?, ?, ?, ?, ?)",
                (opera['id'], opera['name'], opera['content'] or '', all_dialogue[:500000], roles_text),
            )
            inserted += 1

        conn.commit()
        count = conn.execute("SELECT COUNT(*) FROM plays_fts").fetchone()[0]
        print(f"✅ FTS5 全文索引: {count} 条 (含场景对白+角色名)")
    except Exception as e:
        print(f"⚠️ FTS5 索引构建失败: {e}")


if __name__ == "__main__":
    rebuild = "--rebuild" in sys.argv
    main(rebuild=rebuild)
