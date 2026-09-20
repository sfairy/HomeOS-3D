"""跨模块共用的时间口径。

只有一件事：把「可能没有时区」的时间补齐成 UTC aware。

为什么值得单独一个模块：这段判断原先在本包里写了 **6 份**（``dependencies`` / ``api/auth`` /
``display_access`` 各一份具名 ``_aware``，``license/service`` 一份 None 容忍的 ``aware``，
``global_log`` 两处内联），而它是一句**安全相关**的假设 —— 写错方向（把缺失时区理解成本机
时区）会让会话过期判定随部署机器的 TZ 漂移。

**这里做的是「重贴标签」而不是「换算」**：``replace(tzinfo=utc)`` 不改动墙上时间，只声明它
本来就是 UTC。这个语义在本项目是正确的，因为落库时间一律以 UTC 写入（``_utc_now`` 系列），
SQLite 只是把 tzinfo 丢掉了；用 ``astimezone`` 反而会按本机时区把时间搬一次，得到错误结果。

若调用方确实需要「换算到 UTC」（例如要序列化给外部），在拿到结果后自己追加
``.astimezone(timezone.utc)`` —— 本函数刻意只管补齐，不做换算。
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import overload


@overload
def ensure_aware(value: datetime) -> datetime: ...


@overload
def ensure_aware(value: None) -> None: ...


def ensure_aware(value: datetime | None) -> datetime | None:
    """给缺少 tzinfo 的时间补上 UTC；已有 tzinfo 或为 None 时原样返回。

    返回值保持与入参同类型（``None`` 进 ``None`` 出），因此调用方可以把它
    直接套在可空字段上，不必先做非空判断 —— 上面两条 ``overload`` 就是为此，
    让「传 datetime 拿回 datetime」在类型层面也成立。

    已有 tzinfo 时**不做换算**：aware 时间之间比较的是绝对时刻，留着
    ``+05:00`` 也不影响正确性，擅自换算只会让「哪里真的搬过时间」变得难追。
    """
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=timezone.utc)
