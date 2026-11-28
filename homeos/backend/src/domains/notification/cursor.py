"""通知中心的分页游标（键集分页）。

游标是**不透明串**：前端只负责把它原样带回，不解析、不构造。这一层刻意不暴露结构，
因为「改成按别的列排」时只要换编码实现，前端不用动。

格式：``base64url(<createdAt ISO>|<id>)``。两个字段一起构成排序键：
``notifications.id`` 是 UUID（无序），只靠时间会在同毫秒的多条记录上跳格或重复。
"""

from __future__ import annotations

import base64
from datetime import UTC, datetime
from typing import Any

#: 游标里允许的最大长度（挡住把整篇正文塞进 query 的攻击面）。
MAX_CURSOR_LENGTH = 256


class InvalidCursor(ValueError):
    """游标无法解析（格式、时间、长度任一不合法）。"""


def encode_cursor(created_at: datetime, row_id: str) -> str:
    """把一行 ``(createdAt, id)`` 编成游标。"""
    moment = created_at if created_at.tzinfo is not None else created_at.replace(tzinfo=UTC)
    raw = f"{moment.astimezone(UTC).isoformat()}|{row_id}".encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def decode_cursor(raw: str | None, *, label: str = "before") -> tuple[datetime, str] | None:
    """解析游标；``None``/空串返回 ``None``（= 第一页），不合法抛 :class:`InvalidCursor`。"""
    text = str(raw or "").strip()
    if not text:
        return None
    if len(text) > MAX_CURSOR_LENGTH:
        raise InvalidCursor(f"Invalid history cursor: {label}")
    try:
        padding = "=" * (-len(text) % 4)
        decoded = base64.urlsafe_b64decode(text + padding).decode("utf-8")
    except (ValueError, UnicodeDecodeError):  # fmt: skip
        raise InvalidCursor(f"Invalid history cursor: {label}") from None
    moment_text, separator, row_id = decoded.partition("|")
    if not separator or not row_id:
        raise InvalidCursor(f"Invalid history cursor: {label}")
    try:
        # Python 3.11+ 的 fromisoformat 直接认尾缀 ``Z``，不需要先替换成 ``+00:00``。
        moment = datetime.fromisoformat(moment_text)
    except ValueError:  # fmt: skip
        raise InvalidCursor(f"Invalid history cursor: {label}") from None
    # 统一成 UTC naive：与库里的 ``DateTime`` 列同一口径，直接参与比较。
    naive = moment.astimezone(UTC).replace(tzinfo=None) if moment.tzinfo else moment
    return naive, row_id


def cursor_of_row(row: Any) -> str:
    """从已取出的 ORM 行编码游标（``picked[-1]`` 用）。"""
    return encode_cursor(row.created_at, str(row.id))


__all__ = [
    "MAX_CURSOR_LENGTH",
    "InvalidCursor",
    "cursor_of_row",
    "decode_cursor",
    "encode_cursor",
]
