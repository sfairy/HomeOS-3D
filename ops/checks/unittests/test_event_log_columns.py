"""事件日志历史 / 时间线的**列裁剪**回归测试（stdlib unittest）。

## 为什么需要这条

``query_history`` 与 ``query_timeline_events`` 从「``select(EventLog)`` 整行」改成「只取
``HISTORY_COLUMNS`` 四列」。这类改动有两种静默失效方式：

1. **DTO 缺字段**：``map_history_row`` 从列元组读属性，少选一列就变成 ``AttributeError``
   或 ``None``，而接口契约里那些字段是可空的 —— 前端只会看到空字符串；
2. **``include_full_state`` 路径被顺手裁掉**：那条路径要 ``oldState`` / ``newState``，
   裁剪后变成空值，而它是「点开一条事件看详情」的唯一数据源。

两条都不会在启动或类型检查时暴露。这里用真实 SQLite + 真实 ORM 覆盖两种路径。
"""

from __future__ import annotations

import unittest
from datetime import UTC, datetime, timedelta
from typing import Any

from _support import ensure_repo_on_path

ensure_repo_on_path()

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from homeos.backend.src.db_models import create_all_schemas
from homeos.backend.src.domains.logs.event_log import EventLogService
from homeos.backend.src.platform.core.db.models import EventLog


class _FakeDatabase:
    """事件日志服务只用到 ``session_factory``。"""

    def __init__(self, factory: Any) -> None:
        self.session_factory = factory


def _service() -> tuple[EventLogService, Any]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    create_all_schemas(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    now = datetime.now(UTC).replace(tzinfo=None)
    with factory() as session:
        for index in range(3):
            session.add(
                EventLog(
                    entity_id=f"light.bench_{index}",
                    domain="light",
                    old_state='{"brightness": 10}' if index == 0 else None,
                    new_state='{"brightness": 200}' if index == 0 else None,
                    state_diff="off→on" if index == 0 else "on→off",
                    created_at=now - timedelta(minutes=index),
                )
            )
        session.commit()
    return EventLogService(_FakeDatabase(factory)), engine


class EventLogHistoryColumnsTest(unittest.TestCase):
    def test_history_rows_keep_their_contract_fields(self) -> None:
        """裁剪后 DTO 的七个字段必须仍然齐全，且值来自 ``stateDiff`` 的解析。"""
        service, _engine = _service()
        payload = service.query_history(hours=24, page=1, limit=20)
        self.assertEqual(payload["total"], 3)
        self.assertEqual(len(payload["events"]), 3)
        first = payload["events"][0]
        self.assertEqual(
            set(first.keys()),
            {"id", "entityId", "state", "oldState", "attrText", "stateDiff", "createdAt"},
        )
        # 最新一条是 index=0（created_at 最大）。
        self.assertEqual(first["stateDiff"], "off→on")
        self.assertEqual(first["oldState"], "off")
        self.assertEqual(first["state"], "on")
        self.assertTrue(first["entityId"].startswith("light.bench_"))

    def test_timeline_default_path_is_pruned_but_complete(self) -> None:
        service, _engine = _service()
        payload = service.query_timeline_events(entity_ids=["light.bench_0"], hours=24)
        self.assertEqual(len(payload["events"]), 1)
        # 默认路径与历史列表同形（七个字段）；``newState`` 只在 include_full_state 下出现。
        # 注意 ``oldState`` 在默认路径里也有 —— 它来自 ``stateDiff`` 的解析，与 DB 列无关；
        # 列裁剪省掉的是**数据库**的 oldState / newState 两个 Text 列（见下一条结构断言）。
        event_row = payload["events"][0]
        self.assertNotIn("newState", event_row)
        self.assertEqual(
            set(event_row.keys()),
            {"id", "entityId", "state", "oldState", "attrText", "stateDiff", "createdAt"},
        )
        self.assertEqual(event_row["stateDiff"], "off→on")

    def test_timeline_full_state_keeps_json_columns(self) -> None:
        """``include_full_state`` 必须解析出 oldState / newState 的 JSON 对象。"""
        service, _engine = _service()
        payload = service.query_timeline_events(entity_ids=["light.bench_0"], hours=24, include_full_state=True)
        self.assertEqual(len(payload["events"]), 1)
        event_row = payload["events"][0]
        self.assertEqual(event_row["oldState"], {"brightness": 10})
        self.assertEqual(event_row["newState"], {"brightness": 200})

    def test_pruned_select_really_omits_text_columns(self) -> None:
        """结构断言：历史查询的 SQL 不得出现 ``oldState`` / ``newState``。

        防止有人为了「顺手取个全文」把裁剪改回去 —— 那是每页白读几十 KB 的代价。
        """
        service, engine = _service()
        statements: list[str] = []

        def _record(_conn, _cursor, statement, _params, _ctx, _many) -> None:
            statements.append(statement)

        event.listen(engine, "before_cursor_execute", _record)
        try:
            service.query_history(hours=24, page=1, limit=20)
        finally:
            event.remove(engine, "before_cursor_execute", _record)

        history_sql = [item for item in statements if "FROM event_logs" in item and "count(" not in item]
        self.assertTrue(history_sql, f"没有捕获到历史查询，实际语句：{statements}")
        self.assertNotIn("oldState", history_sql[-1])
        self.assertNotIn("newState", history_sql[-1])


if __name__ == "__main__":
    unittest.main()
