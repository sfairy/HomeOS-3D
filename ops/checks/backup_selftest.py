#!/usr/bin/env python3
"""备份域自检：把「备份把自己装进去」「历史表撑爆体积」这两类回归钉死。

背景（2026-11-22 的线上失败）：自动备份连续报
``业务数据超过本版备份限制（展开后 4 GB、最多 50000 个文件）``。真实原因不是业务数据大，
而是：

- 迁移前快照默认落在 ``data_dir/backups/schema/*.db``，每份都是整库的 ``VACUUM INTO`` 副本；
- 备份收集只按 ``settings.backups_dir`` 排除（源码态该目录指向仓库根 ``backups/``），
  于是 ``data/backups`` 被判成业务数据 —— 实测收集到 54 GB，而库本身只有 9.9 GB；
- 报错文案又只说了限制、没说谁占的，排查全靠猜。

同时暴露两处设计缺口：``agent_context_timeline`` 是实体变化历史却没进排除表（0.94 GB，
备份体积主要就是它），迁移快照只按「份数」保留（10 份 × 整库 = 灾难）。

本自检覆盖：排除项的语义、超限报错的可用性、按字节预算清理快照、以及
「回收站式目录永不被当作业务数据」。

用法：
    node ops/lib/py.mjs ops/checks/backup_selftest.py
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from homeos.backend.src.domains.backup.business_backup import _data_files
from homeos.backend.src.domains.backup.scope import (
    EXCLUDED_DB_TABLES,
    EXCLUDED_TOP_DIRS,
    MAX_EXPANDED,
    MAX_FILES,
    is_excluded,
    oversize_message,
)
from homeos_shared.schema_migrate import prune_backups

CHECKS: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if not condition:
        raise AssertionError(f"{name} 失败{('：' + detail) if detail else ''}")
    CHECKS.append(name)


class FakeSettings:
    """只给 ``_data_files`` 需要的三样东西。"""

    def __init__(self, data_dir: Path, backups_dir: Path) -> None:
        self.data_dir = data_dir
        self.backups_dir = backups_dir


def write(path: Path, size: int) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\0" * size)
    return path


def test_exclusions() -> None:
    for name in ("backups", "cache", "logs", "backup-work", "backup-recovery"):
        check(f"排除项含 {name}", name in EXCLUDED_TOP_DIRS)
        check(f"排除判断 {name}/x", is_excluded(f"{name}/x"))
    check("不误排 secrets", not is_excluded("secrets/ha_credentials.key"))
    check("不误排 studio3d", not is_excluded("studio3d/a.json"))
    for table in ("event_logs", "agent_context_timeline", "agent_task_execution_logs", "sessions"):
        check(f"清表含 {table}", table in EXCLUDED_DB_TABLES)


def test_data_files_skip_backups() -> None:
    """核心回归：data_dir/backups 即使不在 backups_dir 下，也不能被收集。"""
    with tempfile.TemporaryDirectory() as tmp:
        data = Path(tmp) / "data"
        write(data / "homeos.db", 16)
        write(data / "studio3d" / "scene.json", 8)
        # 迁移快照目录：与库同量级的大副本
        write(data / "backups" / "schema" / "homeos-before-migrate-1.db", 4096)
        write(data / "backups" / "homeos-auto-1.habackup", 2048)
        # 备份包目录刻意指向 data_dir 之外（源码态默认就是这样）
        settings = FakeSettings(data, Path(tmp) / "backups")

        collected = [relative for _path, relative in _data_files(settings)]
        check("收集到业务文件", "studio3d/scene.json" in collected, str(collected))
        check(
            "不收集 data/backups",
            not any(item.startswith("backups/") for item in collected),
            str(collected),
        )
        total = sum(path.stat().st_size for path, _relative in _data_files(settings))
        check("收集体积只剩业务数据", total < 1024, f"{total} 字节")


def testoversize_message() -> None:
    message = oversize_message("展开后上限 4 GB", 54 * 1024**3, 37, [(53, "backups/schema/a.db")])
    check("报错说明触发的是哪条限制", "展开后上限" in message, message)
    check("报错给出当前体积", "GB" in message and "37" in message, message)
    check("报错点名占位最大项", "backups/schema/a.db" in message, message)
    check("报错给出可行动提示", "排除项" in message, message)
    check("限制常量仍在", MAX_EXPANDED > 0 and MAX_FILES > 0)


def test_prune_by_budget() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        directory = Path(tmp)
        sizes = [100, 200, 300, 400]
        for index, size in enumerate(sizes, start=1):
            write(directory / f"homeos-before-migrate-2026010{index}-000000.db", size)
        # 预算 750：从最旧的开始删，直到总量（300+400=700）进预算；最新那份永远保留
        prune_backups(directory, "homeos", keep=10, budget_bytes=750)
        left = sorted(item.stat().st_size for item in directory.glob("*.db"))
        check("按预算删掉最旧的", left == [300, 400], str(left))
        check("最新一份保留", 400 in left)

        # 预算比最新一份还小：仍然留 1 份（不能一份不剩）
        prune_backups(directory, "homeos", keep=10, budget_bytes=1)
        remaining = list(directory.glob("*.db"))
        check("预算再小也留一份", len(remaining) == 1, str(remaining))
        check("留下的是最新的", remaining[0].stat().st_size == 400)

        # 份数上限独立生效
        for index in range(5, 9):
            write(directory / f"homeos-before-migrate-2026010{index}-000000.db", 10)
        prune_backups(directory, "homeos", keep=2, budget_bytes=10**9)
        check("份数上限生效", len(list(directory.glob("*.db"))) == 2)


def main() -> int:
    test_exclusions()
    test_data_files_skip_backups()
    testoversize_message()
    test_prune_by_budget()
    print(f"备份域自检通过：{len(CHECKS)} 项")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
