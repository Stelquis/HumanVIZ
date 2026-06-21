#!/bin/bash
# 实时监控批量提取进度，每完成一个剧本输出一行
# 用法: bash scripts/watch_progress.sh
# Ctrl+C 退出，不影响后台进程

CHECKPOINT="/workspace/HumanVIZ/data/processed/task2/extracted_relations/extraction_checkpoint.json"
LAST_COUNT=0

# 获取初始进度
INITIAL=$(python3 -c "import json; print(json.load(open('$CHECKPOINT'))['total_processed'])" 2>/dev/null || echo 0)
LAST_COUNT=$INITIAL
echo "📋 当前进度: $INITIAL/1473"
echo "⏳ 监控中... (Ctrl+C 退出)"
echo ""

while true; do
    sleep 10
    CUR=$(python3 -c "
import json
try:
    cp = json.load(open('$CHECKPOINT'))
    proc = cp['processed']
    # 获取最新完成的条目
    last = list(proc.values())[-1] if proc else {}
    total = cp['total_processed']
    success = cp['success_count']
    # 统计失败数
    failed = sum(1 for v in proc.values() if v.get('status') != 'success')
    print(f'{total}|{success}|{failed}|{last.get(\"剧本名\",\"?\")}|{last.get(\"relations_count\",0)}|{last.get(\"elapsed_seconds\",0):.1f}|{last.get(\"status\",\"?\")}')
except:
    print('error')
" 2>/dev/null)

    if [ "$CUR" = "error" ]; then
        continue
    fi

    TOTAL=$(echo "$CUR" | cut -d'|' -f1)
    SUCCESS=$(echo "$CUR" | cut -d'|' -f2)
    FAILED=$(echo "$CUR" | cut -d'|' -f3)
    NAME=$(echo "$CUR" | cut -d'|' -f4)
    RELS=$(echo "$CUR" | cut -d'|' -f5)
    ELAPSED=$(echo "$CUR" | cut -d'|' -f6)
    STATUS=$(echo "$CUR" | cut -d'|' -f7)

    if [ "$TOTAL" -gt "$LAST_COUNT" ]; then
        # 计算新增
        NEW=$((TOTAL - LAST_COUNT))
        LAST_COUNT=$TOTAL
        PCT=$(python3 -c "print(f'{$TOTAL/1473*100:.1f}')")

        if [ "$STATUS" = "success" ]; then
            echo "✅ [$TOTAL/1473 ${PCT}%] $NAME  (${RELS}条关系, ${ELAPSED}s)"
        else
            echo "❌ [$TOTAL/1473 ${PCT}%] $NAME  (失败)"
        fi

        # 如果一次完成多个（批量恢复时）
        if [ "$NEW" -gt 1 ]; then
            echo "   ⏩ 跳过了 $((NEW - 1)) 个（断点恢复）"
        fi
    fi
done
