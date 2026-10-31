"""``runtime_kv`` 读写工具（对齐 shared/prisma/runtime-kv.util.ts）。

以 JSON 文本存放运行时缓冲数据（家庭模式运行日志等），键为业务标识。
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select

from .models import RuntimeKv


def load_runtime_kv(session, key: str) -> Any:
    row = session.execute(select(RuntimeKv).where(RuntimeKv.id == key)).scalar_one_or_none()
    if row is None or not row.data:
        return None
    try:
        return json.loads(row.data)
    except (TypeError, ValueError):
        return None


def persist_runtime_kv(session_factory, key: str, value: Any) -> None:
    data = json.dumps(value, ensure_ascii=False, default=str)
    with session_factory() as session:
        row = session.execute(select(RuntimeKv).where(RuntimeKv.id == key)).scalar_one_or_none()
        if row is None:
            row = RuntimeKv(id=key, data=data)
            session.add(row)
        else:
            row.data = data
        session.commit()
