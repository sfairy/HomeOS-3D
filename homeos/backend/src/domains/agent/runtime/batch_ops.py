"""批量操作确认与撤销。

设计目标：
- **确认**：整房间 / 全屋 / 多设备在一次指令里被批量控制时，先暂存调用计划，
  等用户下一句明确确认后再执行，避免「关灯」误关整屋；
- **撤销**：执行批量控制前记录受影响实体的开关 / 亮度 / 窗帘位置快照，
  用户说「撤销刚才的操作」时按快照反向执行；
- **只读路径无感**：单设备控制与查询不会进入这里。

状态放在 :class:`~..state.store.SharedStateStore` 里（默认进程内、可切文件库）：
多 worker 部署时，确认提示与用户的「确认」可能落在不同进程上，计划必须能互相看见，
否则确认会丢、或更糟地在另一个 worker 上被当成「无待确认」而重新走 LLM。
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any

from ..state.store import MemoryStateStore, SharedStateStore

logger = logging.getLogger("homeos.agent.batch_ops")

#: 确认口令：只接受短句，避免「好的，那再打开客厅灯」被误当成确认
CONFIRM_PATTERN = re.compile(
    r"^(确认|确定|执行|好的|好|可以|行|嗯|是的|对|yes|ok|okay|confirm|do it|go ahead)[。.!！]?$",
    re.IGNORECASE,
)
#: 取消口令
CANCEL_PATTERN = re.compile(
    r"^(取消|算了|不用了|不要了|别了|no|cancel|stop)[。.!！]?$",
    re.IGNORECASE,
)
#: 撤销口令：允许「撤销刚才的操作 / 撤回 / 恢复原样」
UNDO_PATTERN = re.compile(
    r"^(撤销|撤回|恢复原样|撤销刚才的(操作|指令)|undo|undo that|revert)[。.!！]?$",
    re.IGNORECASE,
)

#: 待确认计划有效期：1 分钟内的回复才算确认
PENDING_TTL_MS = 60_000
#: 撤销快照有效期：2 分钟内可撤销
UNDO_TTL_MS = 120_000
#: 同时保留的会话数上限（防止长期运行内存膨胀）
MAX_SESSIONS = 100
#: 可撤销的实体域（先覆盖开关 / 亮度 / 窗帘位置）
UNDOABLE_DOMAINS = frozenset(
    {"light", "switch", "fan", "media_player", "water_heater", "cover"}
)
#: 共享状态命名空间
PENDING_NAMESPACE = "agent.batch.pending"
UNDO_NAMESPACE = "agent.batch.undo"


def _now_ms() -> int:
    return int(time.time() * 1000)


@dataclass
class PendingBatch:
    """等待用户确认的一批控制调用。"""

    calls: list[tuple[str, dict[str, Any]]]
    summary: str
    created_at: int = field(default_factory=_now_ms)

    def to_payload(self) -> dict[str, Any]:
        return {
            "calls": [[name, dict(args or {})] for name, args in self.calls],
            "summary": self.summary,
            "createdAt": self.created_at,
        }

    @classmethod
    def from_payload(cls, payload: Any) -> PendingBatch | None:
        if not isinstance(payload, dict):
            return None
        calls: list[tuple[str, dict[str, Any]]] = []
        for item in payload.get("calls") or []:
            if isinstance(item, (list, tuple)) and len(item) == 2:
                name, args = item
                calls.append((str(name), dict(args) if isinstance(args, dict) else {}))
        if not calls:
            return None
        created_at = payload.get("createdAt")
        return cls(
            calls=calls,
            summary=str(payload.get("summary") or ""),
            created_at=int(created_at) if isinstance(created_at, (int, float)) else _now_ms(),
        )


@dataclass
class UndoRecord:
    """最近一次批量操作的执行前快照。"""

    snapshot: list[dict[str, Any]]
    summary: str
    created_at: int = field(default_factory=_now_ms)

    def to_payload(self) -> dict[str, Any]:
        return {
            "snapshot": [dict(item) for item in self.snapshot],
            "summary": self.summary,
            "createdAt": self.created_at,
        }

    @classmethod
    def from_payload(cls, payload: Any) -> UndoRecord | None:
        if not isinstance(payload, dict):
            return None
        snapshot = [dict(item) for item in payload.get("snapshot") or [] if isinstance(item, dict)]
        if not snapshot:
            return None
        created_at = payload.get("createdAt")
        return cls(
            snapshot=snapshot,
            summary=str(payload.get("summary") or ""),
            created_at=int(created_at) if isinstance(created_at, (int, float)) else _now_ms(),
        )


class BatchOperationService:
    """批量操作暂存 / 确认 / 撤销。"""

    def __init__(self, store: SharedStateStore | None = None) -> None:
        self._store = store or MemoryStateStore()

    @property
    def shared(self) -> bool:
        return bool(getattr(self._store, "shared", False))

    # 口令判定
    @staticmethod
    def is_confirm(text: str) -> bool:
        return bool(CONFIRM_PATTERN.match(str(text or "").strip()))

    @staticmethod
    def is_cancel(text: str) -> bool:
        return bool(CANCEL_PATTERN.match(str(text or "").strip()))

    @staticmethod
    def is_undo(text: str) -> bool:
        return bool(UNDO_PATTERN.match(str(text or "").strip()))

    def _make_room(self, namespace: str) -> None:
        if self._store.count(namespace) >= MAX_SESSIONS:
            self._store.prune(namespace, MAX_SESSIONS - 1)

    # 待确认计划
    def stage(self, key: str, calls: list[tuple[str, dict[str, Any]]], summary: str) -> None:
        """暂存一批调用，等下一句确认。超过上限时淘汰最旧会话。"""
        if not key or not calls:
            return
        self._make_room(PENDING_NAMESPACE)
        batch = PendingBatch(calls=list(calls), summary=summary)
        self._store.set(PENDING_NAMESPACE, key, batch.to_payload(), ttl_seconds=PENDING_TTL_MS / 1000)
        logger.info("批量操作待确认: key=%s summary=%s calls=%s", key, summary, len(calls))

    def _load_pending(self, key: str) -> PendingBatch | None:
        batch = PendingBatch.from_payload(self._store.get(PENDING_NAMESPACE, key))
        if batch is None:
            return None
        if _now_ms() - batch.created_at > PENDING_TTL_MS:
            self._store.delete(PENDING_NAMESPACE, key)
            logger.info("批量操作确认超时,已丢弃: key=%s", key)
            return None
        return batch

    def peek_pending(self, key: str) -> PendingBatch | None:
        """读取待确认计划（不删除）；过期自动清理。"""
        return self._load_pending(key)

    def pop_pending(self, key: str) -> PendingBatch | None:
        """取出待确认计划（一次性，跨进程原子）。"""
        payload = self._store.mutate(
            PENDING_NAMESPACE,
            key,
            lambda old: (None, old),
            ttl_seconds=PENDING_TTL_MS / 1000,
        )
        batch = PendingBatch.from_payload(payload)
        if batch is not None and _now_ms() - batch.created_at > PENDING_TTL_MS:
            logger.info("批量操作确认超时,已丢弃: key=%s", key)
            return None
        return batch

    def clear_pending(self, key: str) -> None:
        self._store.delete(PENDING_NAMESPACE, key)

    # 撤销快照
    def remember_undo(
        self,
        key: str,
        snapshot: list[dict[str, Any]],
        summary: str = "",
    ) -> None:
        """记录批量执行前的实体状态快照（只保留可撤销域）。"""
        cleaned = [item for item in snapshot if item.get("domain") in UNDOABLE_DOMAINS]
        if not key or not cleaned:
            return
        self._make_room(UNDO_NAMESPACE)
        record = UndoRecord(snapshot=cleaned, summary=summary)
        self._store.set(UNDO_NAMESPACE, key, record.to_payload(), ttl_seconds=UNDO_TTL_MS / 1000)
        logger.info("已记录撤销快照: key=%s entities=%s", key, len(cleaned))

    def pop_undo(self, key: str) -> UndoRecord | None:
        """取出撤销快照（一次性，跨进程原子）；过期自动清理。"""
        payload = self._store.mutate(
            UNDO_NAMESPACE,
            key,
            lambda old: (None, old),
            ttl_seconds=UNDO_TTL_MS / 1000,
        )
        record = UndoRecord.from_payload(payload)
        if record is None:
            return None
        if _now_ms() - record.created_at > UNDO_TTL_MS:
            logger.info("撤销快照已过期: key=%s", key)
            return None
        return record

    def clear(self, key: str) -> None:
        self._store.delete(PENDING_NAMESPACE, key)
        self._store.delete(UNDO_NAMESPACE, key)


def build_undo_calls(snapshot: list[dict[str, Any]]) -> list[tuple[str, dict[str, Any]]]:
    """把执行前快照转成反向调用列表。

    只恢复「开 / 关 + 灯光亮度 + 窗帘位置」；空调温度 / 媒体音量等暂不撤销，
    避免依赖不完整的属性快照。
    """
    calls: list[tuple[str, dict[str, Any]]] = []
    for item in snapshot:
        entity_id = str(item.get("entity_id") or "")
        domain = str(item.get("domain") or "")
        if not entity_id or domain not in UNDOABLE_DOMAINS:
            continue
        state = str(item.get("state") or "").strip().lower()
        if domain == "cover":
            position = item.get("current_position")
            if isinstance(position, (int, float)) and 0 <= float(position) <= 100:
                calls.append(
                    (
                        "set_cover_position",
                        {"entity_id": entity_id, "position": int(float(position))},
                    )
                )
            continue
        if domain == "light" and state == "on":
            args: dict[str, Any] = {
                "domain": "light",
                "service": "turn_on",
                "entity_id": entity_id,
            }
            brightness = item.get("brightness")
            if isinstance(brightness, (int, float)) and 0 <= float(brightness) <= 255:
                args["service_data"] = {"brightness": int(float(brightness))}
            calls.append(("control_device", args))
            continue
        service = "turn_on" if state == "on" else "turn_off"
        calls.append(
            (
                "control_device",
                {"domain": domain, "service": service, "entity_id": entity_id},
            )
        )
    return calls


__all__ = [
    "CANCEL_PATTERN",
    "CONFIRM_PATTERN",
    "MAX_SESSIONS",
    "PENDING_NAMESPACE",
    "PENDING_TTL_MS",
    "UNDOABLE_DOMAINS",
    "UNDO_NAMESPACE",
    "UNDO_PATTERN",
    "UNDO_TTL_MS",
    "BatchOperationService",
    "PendingBatch",
    "UndoRecord",
    "build_undo_calls",
]
