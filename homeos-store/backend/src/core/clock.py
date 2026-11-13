"""时间口径的叶子实现：库里一律 naive UTC，对外一律带 ``Z`` 的 ISO-8601。

为什么单拆出来
--------------
这些函数原先住在 ``security/security.py``，而 ``core.models`` / ``core.deps`` /
``core.schemas`` 都要用它们 —— 于是 ``core`` 反向依赖 ``security``，两者成了包级强连通。
时间不是安全职责：它既不需要密钥，也不会因为「谁调用」而改变语义，放在 ``core`` 之后
依赖方向变成 ``security → core``，环自然消失。

调用点仍可 ``from ..security.security import utcnow``（那里保留 facade），但**新代码**请
直接从 ``core.clock`` 取。
"""

from __future__ import annotations

from datetime import UTC, datetime

__all__ = ["iso", "iso_micro", "iso_z", "naive_utc", "utcnow"]


def utcnow() -> datetime:
    """返回 naive UTC 时间，便于 SQLite 存储与比较。"""
    return datetime.now(UTC).replace(tzinfo=None)


def naive_utc(value: datetime | None) -> datetime | None:
    """时区归一的**唯一**实现：带时区的值先换算到 UTC，再去掉时区。"""
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


def iso(value: datetime | None) -> str | None:
    """序列化为参考站风格的无时区 ISO 字符串。"""
    normalized = naive_utc(value)
    return None if normalized is None else normalized.strftime("%Y-%m-%dT%H:%M:%S")


def iso_micro(value: datetime | None) -> str | None:
    """带微秒的无时区 ISO 字符串。"""
    normalized = naive_utc(value)
    return None if normalized is None else normalized.strftime("%Y-%m-%dT%H:%M:%S.%f")


def iso_z(value: datetime | None) -> str | None:
    """带 Z 后缀的 ISO 字符串，授权协议要求。"""
    text = iso_micro(value)
    return None if text is None else f"{text}Z"
