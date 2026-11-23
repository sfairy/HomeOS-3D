"""运维脚本共用的数据库工具（WAL 活动检测、体积格式化）。

三个脚本（修复时序未结束行 / 重建事件统计 / 空间回收）都需要同一套「先确认没有活动写入
再动库」的保护与「人类可读体积」的格式化。抽到这里是为了消掉重复，也保证三处的判断
口径一致 —— 口径一旦分叉，"这次能不能安全执行"就会因脚本而异。
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path


def wal_size(db: Path) -> int:
    """``-wal`` 文件字节数；不存在时为 0。"""
    try:
        return db.with_name(db.name + "-wal").stat().st_size
    except OSError:
        return 0


def assert_no_active_writer(db: Path, force: bool) -> None:
    """确认数据库当前没有活动写入；检测到增长且未 ``force`` 时退出。

    判据是「0.4 秒内 WAL 是否增长」：SQLite 的 WAL 只在真正有事务提交时变化，
    因此这比看文件锁更可靠（幂等写入也可能瞬间完成，看不出锁）。
    """
    first = wal_size(db)
    if first == 0:
        return
    time.sleep(0.4)
    second = wal_size(db)
    if second != first and not force:
        raise SystemExit(
            f"检测到活动写入（-wal 在增长）：请先停掉 dev / 容器，或加 --force 强制继续。\nWAL: {first} → {second} 字节"
        )


def human_bytes(size: int) -> str:
    """把字节数转成 ``1.2 GB`` 这种可读形式。"""
    value = float(size)
    for unit in ("B", "KB", "MB", "GB"):
        if value < 1024 or unit == "GB":
            return f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} GB"


def db_arg_parser(description: str, default_db: Path) -> argparse.ArgumentParser:
    """维护脚本共用的参数解析骨架：``--db`` / ``--apply`` / ``--dry-run`` / ``--force``。

    三个脚本（修未结束行 / 重建汇总 / 压缩 context）的这段脚手架逐字相同，
    抽到这里既消重复，也保证「--db 默认值」「--apply 与 --dry-run 的关系」口径一致。
    """
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--db", default=str(default_db), help="数据库路径（默认 homeos/data/homeos.db）")
    parser.add_argument("--apply", action="store_true", help="真正写库（默认只预览）")
    parser.add_argument("--dry-run", action="store_true", help="只预览（默认行为）")
    parser.add_argument("--force", action="store_true", help="即使检测到活动写入也继续")
    return parser


__all__ = ["assert_no_active_writer", "db_arg_parser", "human_bytes", "wal_size"]
