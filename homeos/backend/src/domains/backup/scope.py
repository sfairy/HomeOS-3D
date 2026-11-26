"""全量备份的**范围**：哪些进包、哪些不进、超限时怎么解释。

从 ``business_backup`` 抽出：那一半是流程（快照 / 打包 / 解包 / 回滚），这一半是**口径**
（目录与表的黑白名单、体积与条数上限、超限文案）。把口径单独放在这里有两个好处：

- 改「备份包含什么」时不必在 1000+ 行的流程文件里翻；
- ``ops/checks/backup_selftest.py`` 可以直接断言口径本身，而不必搭一个可跑的 DB。

口径是「配置 + 实体目录」，不是整机快照 —— 判定依据见各常量的注释。
"""

from __future__ import annotations

from pathlib import PurePosixPath
from typing import Any

DB_NAME = "homeos.db"
DB_SIDECARS = ("-wal", "-shm", "-journal")

#: 日志 / 观测量库。它**整体不进备份**：其中每张表（``event_logs`` /
#: ``event_log_stats_hourly`` / ``agent_context_timeline``）本来就在
#: ``EXCLUDED_DB_TABLES`` 里 —— 备份只保「换机后仍然有意义」的配置与用户数据，
#: 「什么时候什么变成了什么」是本机观测历史。把它当业务文件收集反而会让备份包
#: 多出与库同量级的体积（正是 2026-11-22 那次超限失败的同一类错误）。
LOG_DB_NAME = "homeos-logs.db"

#: 需要从数据文件收集里排除的库文件名（主库 + 日志库；改名时两边一起改）。
DATABASE_FILE_NAMES = (DB_NAME, LOG_DB_NAME)

#: 归档展开后的体积上限。
#:
#: 这个数字不是「业务数据能有多大」，而是「备份包必须能在客户机上生成并在浏览器里下载」：
#: 载荷最终会压成 zip 再加密，上限 512 MB（``MAX_ARCHIVE``），膨胀比通常 3–8 倍。
MAX_EXPANDED = 4 * 1024 * 1024 * 1024
#: 条目数上限（小文件海洋会让 zip 目录与逐条 sha256 变成主要成本）。
MAX_FILES = 50_000

#: 数据目录中不进入备份的顶层目录（运行时产物，与业务数据无关）。
#:
#: ``backups`` 必须在这里：``data_dir/backups`` 是**内部恢复点**目录 ——
#: 默认的迁移前快照就落在 ``backups/schema/*.db``（见 ``homeos_shared.schema_migrate``
#: 的默认 ``backup_dir``），而 ``HOMEOS_BACKUPS_DIR=/data/backups`` 时备份包也在这里。
#: 两者都是「同一份库的副本」，体积与库同量级。漏排它们的后果：
#:
#:   实测 9.9 GB 的库 + 迁移快照保留 10 份 → 收集到 54 GB 数据文件，
#:   自动备份每次都在「展开后 4 GB」处失败，报错还只说「业务数据超过限制」，
#:   看不出是备份在吃自己。
#:
#: 早期只靠 ``settings.backups_dir`` 判定（``backups_prefix_in_data_dir``），但它只覆盖
#: 「用户配置的备份包目录」：源码态默认的 ``homeos/backups`` 根本不在 data_dir 里，
#: 于是 ``data/backups`` 被判成业务数据。这里改为**无条件排除**；恢复侧也用同一份清单
#: 兜底（旧版本的包里可能带着它）。
EXCLUDED_TOP_DIRS = frozenset({"cache", "logs", "backup-work", "backup-recovery", "backups"})
#: 需要整体排除的相对路径前缀。
#:
#: - ``render-cache``：渲染缓存，可按需重算，体积随户型增长；
#: - ``display-images``（0.8.9）：按 ``displaySize`` 派生的图片副本，同样可重算。不排除的话
#:   上限 128 MiB 的缓存会让备份包凭空多出上百 MB，复现「备份吃自己、每次卡在 4 GB」的事故。
EXCLUDED_REL_PREFIXES = (
    "modules/interaction3d/render-cache",
    "modules/interaction3d/display-images",
)

#: 0.8.4 起必须进包的业务根目录（与上游 ``ROOTS`` 对齐，便于对照审查）。
#: 本实现打包**整个** ``data_dir``，这份清单只用来断言「别把它们误加进排除项」：
#: ``modules/interaction3d/cover-memory`` 是窗帘/晾衣架「上次开合位置」记忆，
#: 不是可重建缓存 —— 换机还原后用户看到的开合度必须和备份时一致。
BACKUP_ROOTS = (
    "assets",
    "exports",
    "studio3d",
    "modules/interaction3d/scenes",
    "modules/interaction3d/cover-memory",
    # 0.8.9 装饰模型：用户上传的 GLB，没有它就等于「换机后所有自定义装饰全部消失」，
    # 而且场景会大面积报「此户型快照中的装饰已删除」。必须进包。
    "modules/interaction3d/models",
)

#: 不进全量备份的历史 / 日志 / 时序 / 运行时缓存表：快照后清空其数据（保留表结构）。
#:
#: 三类——
#:   历史事件与日志：实体状态变化、安防审计、通知记录、地震预警、环境与能耗时序；
#:   语义上的「派生数据」：``agent_context_timeline`` 是实体的变化时间线（与
#:     ``event_logs`` 同类）、``agent_task_execution_logs`` 是计划任务的执行历史；
#:   运行时缓存：登录会话（还原后必须重新登录）、可随 HA 连接自动重建的实体/设备/区域目录。
#:
#: 「哪些表该在这里」的判据是 **换机后是否仍然有意义**：配置、用户、设备画像、别名、
#: 场景要留；「什么时候什么变成了什么」不要 —— 那是本机的观测历史，不是家的配置。
EXCLUDED_DB_TABLES: tuple[str, ...] = (
    # 历史事件 / 日志 / 时序
    "event_logs",
    # 事件日志的小时汇总（可由 event_logs 重建；随原始表一起排除，否则「统计留一份」）
    "event_log_stats_hourly",
    "security_events",
    "notifications",
    "earthquake_alert_history",
    "environment_records",
    "energy_usage_daily",
    "energy_usage_monthly",
    "device_usage_stats",
    # 实体变化时间线（实测 2.2M 行 / 0.94 GB：表 + 3 个索引，漏排时备份体积主要靠它撑）
    "agent_context_timeline",
    # 计划任务执行日志（保留 90 天）
    "agent_task_execution_logs",
    # 运行时缓存（会话 / 可重建目录）
    "sessions",
    "ha_entities",
    "ha_devices",
    "ha_areas",
    "ha_sync_state",
)


def is_excluded(relative: str) -> bool:
    """相对 ``data_dir`` 的路径是否不进备份（目录白/黑名单 + 库文件本身）。"""
    parts = PurePosixPath(relative).parts
    if parts and parts[0] in EXCLUDED_TOP_DIRS:
        return True
    if any(relative == prefix or relative.startswith(prefix + "/") for prefix in EXCLUDED_REL_PREFIXES):
        return True
    name = parts[-1] if parts else relative
    if name in DATABASE_FILE_NAMES:
        return True
    return any(name == f"{db}{suffix}" for db in DATABASE_FILE_NAMES for suffix in DB_SIDECARS)


def oversize_message(reason: str, total: int, count: int, biggest: list[tuple[int, str]]) -> str:
    """超限报错：说明是哪一条限制、当前多大、以及占位最多的几项。

    旧文案只有「业务数据超过本版备份限制（展开后 4 GB、最多 50000 个文件）」，既不说触发
    的是哪一条，也不说谁占的 ——「备份把上一批备份也装进去了」这种情况只能靠猜。
    """
    items = "、".join(f"{name} {size / 1024**3:.2f} GB" for size, name in biggest[:5])
    detail = f"；占位最多：{items}" if items else ""
    return (
        f"业务数据超过本版备份限制（{reason}）。当前已收集 {total / 1024**3:.2f} GB / {count} 个文件{detail}。"
        "若占位最大的是 backups/ 或 *.db 副本，请确认这些目录在排除项里（备份不应包含备份自身）。"
    )


def oversize_reason(value: Any) -> str:
    """把上限常量翻成人话，供 ``create_payload`` 拼报错。"""
    return f"展开后上限 {value}"


__all__ = [
    "BACKUP_ROOTS",
    "DB_NAME",
    "DB_SIDECARS",
    "EXCLUDED_DB_TABLES",
    "EXCLUDED_REL_PREFIXES",
    "EXCLUDED_TOP_DIRS",
    "MAX_EXPANDED",
    "MAX_FILES",
    "is_excluded",
    "oversize_message",
    "oversize_reason",
]
