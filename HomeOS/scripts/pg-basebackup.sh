#!/bin/sh
# 物理基准备份（配合 WAL archive 做 PITR）。在 Compose 网络内执行：
#   docker compose --profile backup run --rm backup-base
set -e
STAMP=$(date +%Y%m%d-%H%M)
DEST="/backups/base/${STAMP}"
mkdir -p "$DEST"
if [ -z "${PGPASSWORD:-}" ] && [ -s /secrets/postgres_password ]; then
  PGPASSWORD=$(cat /secrets/postgres_password)
  export PGPASSWORD
fi
echo "pg_basebackup → $DEST"
# 注意：不带 -R —— -R 会写入 standby.signal + primary_conninfo，把备份变成
# 持续连主库的从库；PITR 恢复应使用 recovery.signal（见 README「备份与 PITR」）
pg_basebackup -h postgres -U homeos -D "$DEST" -Fp -Xs -P
# 保留最近 7 份基准备份
ls -1dt /backups/base/*/ 2>/dev/null | tail -n +8 | while read -r d; do rm -rf "$d"; done
# 清理早于本次基准备份的 WAL：PITR 只需最近一次 base 之后的 WAL，
# 防止 pg_wal_archive 卷无上限增长（此容器已挂载 wal_archive 卷）
if [ -f "$DEST/backup_label" ]; then
  START_WAL=$(sed -n 's/^START WAL: //p' "$DEST/backup_label" | tr -d '[:space:]')
  if [ -n "$START_WAL" ]; then
    pg_archivecleanup /wal_archive "$START_WAL" >/dev/null 2>&1 || echo "WARN: pg_archivecleanup 失败（WAL 卷可能为空）"
    echo "已按最近基准备份清理早于 $START_WAL 的 WAL 归档"
  fi
fi
echo "Base backup done. WAL archive 卷已按最近 base 自动裁剪。"
