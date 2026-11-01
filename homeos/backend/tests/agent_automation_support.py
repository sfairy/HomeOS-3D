"""智能管家自动化单测的共享夹具（内存 SQLite / 假工具服务 / 工具名清单）。

放在非 ``test_`` 前缀的模块里，避免被单测收集，同时供
``test_agent_automation`` 与 ``test_agent_automation_diag`` 共用。
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from src.platform.core.db.database import Base

AUTOMATION_TOOLS = [
    "query_device_timeline",
    "run_proactive_patrol",
    "query_system_logs",
    "manage_user_policy",
    "schedule_task",
    "list_scheduled_tasks",
    "cancel_scheduled_task",
    "web_search",
]


def _session_factory() -> Any:
    """内存 SQLite：线程池里的 run_db 与新连接共享同一份库。"""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)


def _bind_engine(factory: Any) -> Any:
    """取出 sessionmaker 绑定的引擎，便于用例结束时 dispose（避免 ResourceWarning）。"""
    return factory.kw["bind"]


class _FakeTools:
    """工具服务替身：记录调用，按工具名返回预设结果。"""

    def __init__(self, states: dict[str, str] | None = None) -> None:
        self.states = states or {}
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def execute(self, name: str, args: dict[str, Any], actor: Any = None) -> dict[str, Any]:
        self.calls.append((name, dict(args)))
        if name == "get_entity_state":
            entity_id = str(args.get("entity_id") or "")
            return {"state": self.states.get(entity_id, "")}
        return {"success": True}

    def control_calls(self) -> list[tuple[str, dict[str, Any]]]:
        return [call for call in self.calls if call[0] != "get_entity_state"]
