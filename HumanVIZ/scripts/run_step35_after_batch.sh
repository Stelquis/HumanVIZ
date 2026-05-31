#!/bin/bash
# 监控 batch_extract_relations.py 进程，完成后自动运行 step 3.5
# 用法: bash scripts/run_step35_after_batch.sh

LOG="data/task2_relations/batch_run_log.txt"
STEP35_LOG="data/task2_relations/step35_export_log.txt"

echo "[$(date)] 开始监控批量提取进程..."

# 等待 batch 进程结束
while kill -0 2045 2>/dev/null; do
    # 打印进度
    PROGRESS=$(tail -1 "$LOG" 2>/dev/null | grep -oP '\d+/1251' | tail -1)
    if [ -n "$PROGRESS" ]; then
        echo "[$(date)] 进度: $PROGRESS"
    fi
    sleep 120  # 每 2 分钟检查一次
done

echo "[$(date)] 批量提取进程已结束，检查最终状态..."

# 检查日志末尾确认是否正常完成
if tail -20 "$LOG" | grep -q "步骤 3.2 完成"; then
    echo "[$(date)] ✅ 批量提取正常完成"
else
    echo "[$(date)] ⚠️ 批量提取可能异常结束，请检查日志: $LOG"
fi

# 运行 step 3.5
echo "[$(date)] 开始运行 Step 3.5 全量导出..."
cd /workspace/HumanVIZ
python3 scripts/batch_extract_relations.py --export > "$STEP35_LOG" 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "[$(date)] ✅ Step 3.5 导出完成！"
    echo "[$(date)] 导出日志: $STEP35_LOG"
    # 打印摘要
    tail -60 "$STEP35_LOG"
else
    echo "[$(date)] ❌ Step 3.5 失败 (exit code: $EXIT_CODE)"
    echo "[$(date)] 请检查日志: $STEP35_LOG"
    tail -30 "$STEP35_LOG"
fi
