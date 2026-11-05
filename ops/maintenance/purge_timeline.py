#!/usr/bin/env python3
"""一次性维护：删掉设备时序里已不再写入的 ``sensor`` 行，并 VACUUM 收回磁盘。

背景
----
``agent_context_timeline`` 过去把**每一次** HA 状态翻转都记一行，其中 98% 是纯数值
``sensor``（路由器上下行速率 / 累计流量、ping、温度…）的小数抖动。写入侧现在已在
``domains/agent/memory/timeline.py`` 的 ``SKIPPED_DOMAINS`` 里跳过 ``sensor`` 域，
全量备份也不再打包这张表 —— 但**已经写进去的旧行不会自己消失**：一台跑满 5 天的机器
上就是 153 万行 / 580 MB（整库的 85%），把「检查备份 → 恢复」拖到几十秒。

本脚本只做一件事：``DELETE FROM agent_context_timeline WHERE domain = 'sensor'``，
然后 ``VACUUM`` 把页真正还给文件系统。不可逆，但删掉的都是「同一个数值传感器抖动了
几万次」这类没有归因价值的数据；``binary_sensor``（门磁 / 人体感应）与所有可控设备域
（light / switch / climate…）一律保留。

必须先停后端
------------
``VACUUM`` 需要独占访问，运行中的后端会让它直接失败；清理与该进程的写入交错也没有
任何好处。脚本开跑前先探一次写锁，拿不到就退出并提示先停服务；``VACUUM`` 因并发
失败时同样给出明确指引，不会留下半成品状态。

用法
----
    node ops/lib/py.mjs ops/maintenance/purge_timeline.py            # 预演（默认，不改数据）
    node ops/lib/py.mjs ops/maintenance/purge_timeline.py --apply    # 执行清理 + VACUUM
    node ops/lib/py.mjs ops/maintenance/purge_timeline.py --vacuum-only

删过一轮但 VACUUM 没跑成（例如忘了停服务）时，用 ``--vacuum-only`` 只回收空闲页。
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / "homeos" / "backend"

TABLE = "agent_context_timeline"
#: 与 ``domains/agent/memory/timeline.py#SKIPPED_DOMAINS`` 同一口径：只清这个域。
PURGED_DOMAIN = "sensor"
#: 单批删除行数：一次万吨级 DELETE 会让 WAL 涨到与表同量级，分批提交更稳。
BATCH_ROWS = 50_000
#: 探锁用的 busy_timeout：服务在跑时应该**立刻**失败并给出提示，而不是干等。
LOCK_PROBE_TIMEOUT_MS = 500


def _human(size: float) -> str:
    if size < 1024:
        return f"{int(size)} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.1f} KB"
    if size < 1024 * 1024 * 1024:
        return f"{size / (1024 * 1024):.1f} MB"
    return f"{size / (1024 * 1024 * 1024):.2f} GB"


def _resolve_database(explicit: str | None) -> Path:
    """遥测库路径：``--db`` 优先，否则复用后端 ``Settings`` 的解析（含 env 覆盖）。

    时序表已拆到 ``homeos-telemetry.db``（见 ``platform.core.db.telemetry``）。旧安装里
    它可能还在主库，所以显式给的路径不存在时会回落到主库 —— 迁移前跑过一次的机器
    不应该只能靠手工找文件。
    """
    if explicit:
        candidate = Path(explicit).expanduser().resolve()
        return candidate
    # 延迟导入：只有这里需要它，而且必须等 env（HOMEOS_DATA_DIR / HOMEOS_DATABASE_URL）
    # 读进来才知道真实路径 —— 与 app 启动时用的是同一个属性，不在此重写一份换算规则。
    sys.path.insert(0, str(BACKEND_ROOT))
    from src.config import load_settings

    settings = load_settings()
    telemetry = settings.telemetry_database_path
    if telemetry.is_file():
        return telemetry
    return settings.database_path


def _on_disk_size(database: Path) -> int:
    """库本体 + WAL 的实际占地：只看主库会低估清理前后的差别（WAL 可能比主库还大）。"""
    return sum(
        path.stat().st_size for path in (database, Path(f"{database}-wal"), Path(f"{database}-shm")) if path.is_file()
    )


def _table_exists(connection: sqlite3.Connection) -> bool:
    row = connection.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (TABLE,)).fetchone()
    return row is not None


def _count_rows(connection: sqlite3.Connection, domain: str | None) -> int:
    # 表名是本模块常量（不接受外部输入），值一律走参数绑定。
    if domain is None:
        sql = f'SELECT COUNT(*) FROM "{TABLE}"'  # noqa: S608 - 表名是常量
        return int(connection.execute(sql).fetchone()[0])
    sql = f'SELECT COUNT(*) FROM "{TABLE}" WHERE domain = ?'  # noqa: S608 - 表名是常量
    return int(connection.execute(sql, (domain,)).fetchone()[0])


def _ensure_write_lock(connection: sqlite3.Connection) -> None:
    """试拿一次写锁。拿不到 = 有进程正在写，这时开始清理只会和它互相干扰。"""
    try:
        connection.execute("BEGIN EXCLUSIVE")
        connection.execute("ROLLBACK")
    except sqlite3.OperationalError as error:
        raise SystemExit(
            f"数据库正被其他进程写入（{error}）。\n"
            "请先停掉后端（结束 `bun run dev` 的终端，或停掉服务进程）再执行本脚本。"
        ) from error


def _purge(connection: sqlite3.Connection, batch: int) -> int:
    """分批删除 ``PURGED_DOMAIN`` 的行，返回删除总数。

    连接是 autocommit（``isolation_level=None``），所以每条 DELETE 本身就是一个事务：
    中途被打断只会停在某个批次边界，重跑接着删剩下的，不会留下回滚不了的巨型事务。
    """
    deleted = 0
    started = time.monotonic()
    # 表名是本模块常量；domain 走参数绑定，batch 已强制成 int。
    sql = f'DELETE FROM "{TABLE}" WHERE id IN (SELECT id FROM "{TABLE}" WHERE domain = ? LIMIT {{limit}})'  # noqa: S608 - 表名是常量
    while True:
        cursor = connection.execute(sql.format(limit=int(batch)), (PURGED_DOMAIN,))
        done = max(0, int(cursor.rowcount or 0))
        deleted += done
        if done < batch:
            break
        # 每批把 WAL 收回去，否则这次删除会先在 WAL 里再长一份同样大的数据。
        connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        print(f"  已删除 {deleted:,} 行（{time.monotonic() - started:.1f}s）", flush=True)
    connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    return deleted


def _vacuum(connection: sqlite3.Connection) -> None:
    try:
        connection.execute("VACUUM")
    except sqlite3.OperationalError as error:
        raise SystemExit(
            f"VACUUM 失败（{error}）：数据库仍被占用，VACUUM 需要独占访问。\n"
            "已删除的行不会回来，但文件体积还没缩小 —— 停掉后端后重跑：\n"
            "  node ops/lib/py.mjs ops/maintenance/purge_timeline.py --vacuum-only"
        ) from error
    connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")


def _verify(connection: sqlite3.Connection) -> None:
    integrity = connection.execute("PRAGMA integrity_check").fetchone()
    if not integrity or integrity[0] != "ok":
        raise SystemExit(f"清理后完整性校验失败：{integrity[0] if integrity else '无结果'}")
    if connection.execute("PRAGMA foreign_key_check").fetchall():
        raise SystemExit("清理后外键校验失败；请从备份恢复，不要再使用该库。")


def _main(args: argparse.Namespace, database: Path) -> int:
    before = _on_disk_size(database)
    connection = sqlite3.connect(database, isolation_level=None, timeout=LOCK_PROBE_TIMEOUT_MS / 1000)
    deleted = 0
    try:
        if not _table_exists(connection):
            print(f"{TABLE} 不存在（这份库还没建这张表），无需清理。")
            return 0
        total = _count_rows(connection, None)
        targets = _count_rows(connection, PURGED_DOMAIN)
        print(f"数据库：{database}")
        print(f"当前占用：{_human(before)}（含 WAL）")
        print(f"{TABLE}：{total:,} 行，其中 {PURGED_DOMAIN} 域 {targets:,} 行")

        if not args.vacuum_only:
            if targets == 0:
                print(f"没有 {PURGED_DOMAIN} 行可删。")
                if not args.apply:
                    return 0
            elif not args.apply:
                share = targets / total if total else 0
                print(
                    f"预演：将删除 {targets:,} 行，粗估释放约 {_human(before * share)}。"
                    "\n未改动任何数据；确认无误、并停掉后端后加 --apply 执行。"
                )
                return 0
            else:
                _ensure_write_lock(connection)
                print(f"开始删除 {PURGED_DOMAIN} 行…", flush=True)
                deleted = _purge(connection, max(1, args.batch))
                print(f"已删除 {deleted:,} 行。")

        if not args.apply and not args.vacuum_only:
            return 0

        free = int(connection.execute("PRAGMA freelist_count").fetchone()[0])
        page_size = int(connection.execute("PRAGMA page_size").fetchone()[0])
        if free == 0:
            print("没有空闲页可回收，跳过 VACUUM。")
        else:
            print(f"空闲页 {free:,}（约 {_human(free * page_size)}），开始 VACUUM…")
            _vacuum(connection)
        _verify(connection)
    finally:
        connection.close()

    after = _on_disk_size(database)
    verify_connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    try:
        remaining = _count_rows(verify_connection, None)
    finally:
        verify_connection.close()
    print(
        f"完成：删除 {deleted:,} 行，{TABLE} 剩余 {remaining:,} 行；"
        f"占用 {_human(before)} → {_human(after)}（释放 {_human(max(0, before - after))}）。"
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="清理设备时序里的 sensor 行并 VACUUM")
    parser.add_argument("--apply", action="store_true", help="真正执行（默认只预演）")
    parser.add_argument("--vacuum-only", action="store_true", help="只 VACUUM 回收空闲页，不删数据")
    parser.add_argument("--db", default=None, help="数据库文件路径（默认取后端配置）")
    parser.add_argument("--batch", type=int, default=BATCH_ROWS, help=f"单批删除行数（默认 {BATCH_ROWS}）")
    args = parser.parse_args()
    if args.vacuum_only:
        args.apply = True

    database = _resolve_database(args.db)
    if not database.is_file():
        raise SystemExit(f"数据库不存在：{database}")
    return _main(args, database)


if __name__ == "__main__":
    sys.exit(main())
