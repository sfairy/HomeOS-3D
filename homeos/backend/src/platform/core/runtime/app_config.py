"""AppConfig 只读访问器（SystemConfig 单例）。

**通用原语**：读整表（``load_raw_config``）与写/合并分区（``write_raw_config_section`` /
``merge_raw_config_section``）。分区**语义**不在这里 —— 各分区的缺省值与强类型读法属于
对应的 ``domains/*`` 模块，否则每个分区都要往这个底层文件里长。

完整的分区校验/写入属 ``domains/app_config``；本模块刻意保持「不认识任何业务字段」。
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from ..db.json_field import object_field
from ..db.models import SystemConfig


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
        _write_raw(session, {**load_raw_config(session), section: value})


def _write_raw(session: Session, raw: dict[str, Any]) -> None:
    """把整份配置写回单例行并提交（调用方负责组织 ``raw``）。"""
    row = session.get(SystemConfig, "default")
    if row is None:
        row = SystemConfig(id="default", data="{}")
        session.add(row)
    row.data = json.dumps(raw, ensure_ascii=False)
    # 必须推进版本号：``AppConfigService._persist`` 用 ``expected_updated_at`` 做 CAS，
    # 外部写者不推进的话并发检测恒通过 —— 它会把这次写入整表盖掉还返回成功。
    row.updated_at = datetime.now(UTC)
    session.commit()


def merge_raw_config_section(session_factory, section: str, partial: dict[str, Any]) -> None:
    """按字段合并（而非整体替换）SystemConfig 指定分区，供增量更新使用。

    只开一个会话、只读一次整份配置：旧实现先读一次取当前分区，再进
    ``write_raw_config_section`` 重读一次并重写 —— 一次字段更新要解析两遍整表 JSON
    （配置是所有分区挤在一行的单例，解析成本随分区数增长）。
    """
    with session_factory() as session:
        raw = load_raw_config(session)
        current = object_field(raw, section)
        raw[section] = {**current, **partial}
        _write_raw(session, raw)
