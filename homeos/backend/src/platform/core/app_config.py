"""AppConfig 只读访问器（SystemConfig 单例）。

**通用原语**：读整表（``load_raw_config``）与写/合并分区（``write_raw_config_section`` /
``merge_raw_config_section``）。分区**语义**不在这里 —— 例如 ``auth`` 分区的缺省值与
强类型读法在 ``platform/security/auth_config.py``，否则每个分区都要往这个底层文件里长。

完整的分区校验/写入属 ``domains/app_config``；本模块刻意保持「不认识任何业务字段」。
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from .json_field import object_field
from .models import SystemConfig


def load_raw_config(session: Session) -> dict[str, Any]:
    row = session.get(SystemConfig, "default")
    if row is None or not row.data:
        return {}
    try:
        data = json.loads(row.data)
    except (TypeError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def write_raw_config_section(session_factory, section: str, value: dict[str, Any]) -> None:
    """写入（合并）SystemConfig 单例中的指定分区，供子模块持久化自身配置。"""
    with session_factory() as session:
        row = session.get(SystemConfig, "default")
        if row is None:
            row = SystemConfig(id="default", data="{}")
            session.add(row)
        raw = load_raw_config(session)
        raw[section] = value
        row.data = json.dumps(raw, ensure_ascii=False)
        session.commit()


def merge_raw_config_section(session_factory, section: str, partial: dict[str, Any]) -> None:
    """按字段合并（而非整体替换）SystemConfig 指定分区，供增量更新使用。"""
    with session_factory() as session:
        raw = load_raw_config(session)
    current = object_field(raw, section)
    write_raw_config_section(session_factory, section, {**current, **partial})
