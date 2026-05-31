#!/bin/bash
# 一键恢复：从断点继续批量提取 + 完成后自动导出 step 3.5
# 用法: bash scripts/resume_and_export.sh
set -e

cd /workspace/HumanVIZ
LOG="data/task2_relations/batch_run_log.txt"
STEP35_LOG="data/task2_relations/step35_export_log.txt"

echo "[$(date)] 检查当前状态..."
PROCESSED=$(python3 -c "import json; cp=json.load(open('data/task2_relations/extraction_checkpoint.json')); print(cp['total_processed'])")
echo "[$(date)] 已处理: $PROCESSED/1473"

if [ "$PROCESSED" -ge 1473 ]; then
    echo "[$(date)] ✅ 批量提取已完成，直接运行 step 3.5..."
    python3 scripts/batch_extract_relations.py --export 2>&1 | tee "$STEP35_LOG"
    echo "[$(date)] ✅ 全部完成！"
    exit 0
fi

# 检查是否已有进程在运行
if ps aux | grep "batch_extract_relations" | grep -v grep > /dev/null; then
    echo "[$(date)] ⚠️  批量提取进程仍在运行中，请等待或手动 kill"
    ps aux | grep batch_extract_relations | grep -v grep
    exit 1
fi

echo "[$(date)] 从断点恢复批量提取 (剩余 $((1473 - PROCESSED)) 个)..."
nohup python3 scripts/batch_extract_relations.py --all --resume --delay 1.5 --retries 3 >> "$LOG" 2>&1 &
BATCH_PID=$!
echo "[$(date)] 批量进程 PID: $BATCH_PID"

# 等待完成
echo "[$(date)] 等待批量提取完成..."
while kill -0 $BATCH_PID 2>/dev/null; do
    sleep 120
    CUR=$(python3 -c "import json; cp=json.load(open('data/task2_relations/extraction_checkpoint.json')); print(cp['total_processed'])" 2>/dev/null || echo "?")
    echo "[$(date)] 进度: $CUR/1473"
done

# 检查结果
wait $BATCH_PID
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
    echo "[$(date)] ❌ 批量提取异常退出 (code: $EXIT_CODE)，但 checkpoint 已保存"
    echo "[$(date)] 可再次运行本脚本恢复"
fi

echo "[$(date)] 批量提取结束，运行 step 3.5 导出..."
python3 scripts/batch_extract_relations.py --export 2>&1 | tee "$STEP35_LOG"
echo "[$(date)] ✅ 全部完成！"
