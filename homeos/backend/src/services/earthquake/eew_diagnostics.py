"""EEW 诊断环形缓冲器（对齐 ``earthquake/eew-diagnostics.util.ts``）。"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

FILTER_RING_MAX = 30

SOURCE_IDS = ("wolfx", "sc_eew", "cenc_eew", "usgs")
SOURCE_LABELS = {
    "wolfx": "Wolfx WebSocket",
    "sc_eew": "SC EEW 速报",
    "cenc_eew": "CENC 台网 EEW",
    "usgs": "USGS 兜底",
}


def _now_ms() -> float:
    return datetime.now(UTC).timestamp() * 1000


class EewDiagnosticsBuffer:
    """EEW 诊断状态：各源轮询时间与最近过滤原因 ring buffer。"""

    def __init__(self) -> None:
        self._filters: list[dict[str, Any]] = []
        self._sources: dict[str, dict[str, Any]] = {
            source_id: {"lastPollAt": None, "lastSuccessAt": None, "lastError": None}
            for source_id in SOURCE_IDS
        }

    def record_filter(self, entry: dict[str, Any]) -> None:
        self._filters.append(
            {
                "at": entry.get("at") if entry.get("at") is not None else _now_ms(),
                "source": entry.get("source"),
                "reason": entry.get("reason"),
                "eventId": entry.get("eventId"),
            }
        )
        while len(self._filters) > FILTER_RING_MAX:
            self._filters.pop(0)

    def record_poll(self, source_id: str, result: dict[str, Any]) -> None:
        row = self._sources.get(source_id)
        if row is None:
            return
        now = _now_ms()
        row["lastPollAt"] = now
        if result.get("ok"):
            if result.get("touchedSuccess") is not False:
                row["lastSuccessAt"] = now
            row["lastError"] = None
        else:
            row["lastError"] = result.get("error") or "unknown"

    def touch_wolfx_activity(self, connected: bool) -> None:
        now = _now_ms()
        row = self._sources["wolfx"]
        row["lastPollAt"] = now
        if connected:
            row["lastSuccessAt"] = now
            row["lastError"] = None

    def sync_wolfx_from_connection(self, status: dict[str, Any]) -> None:
        """用 WS 客户端真实时间戳回填 Wolfx（即使尚未收到 EEW 报文）。"""
        row = self._sources["wolfx"]
        if status.get("connectedAt"):
            row["lastSuccessAt"] = status["connectedAt"]
        if status.get("lastActivityAt"):
            row["lastPollAt"] = status["lastActivityAt"]
            if status.get("connected"):
                row["lastSuccessAt"] = status["lastActivityAt"]
        if status.get("connected"):
            row["lastError"] = None
            if not row["lastSuccessAt"]:
                row["lastSuccessAt"] = _now_ms()
            if not row["lastPollAt"]:
                row["lastPollAt"] = row["lastSuccessAt"]
        elif status.get("state") and status["state"] != "open":
            if not row["lastError"]:
                row["lastError"] = f"WS {status['state']}"

    def snapshot(self, opts: dict[str, Any]) -> dict[str, Any]:
        active_map = {
            "wolfx": bool(opts.get("wolfxConnected")),
            "sc_eew": bool(opts.get("scActive")),
            "cenc_eew": bool(opts.get("cencActive")),
            "usgs": bool(opts.get("usgsActive")),
        }
        sources = []
        for source_id in SOURCE_IDS:
            row = self._sources[source_id]
            sources.append(
                {
                    "id": source_id,
                    "label": SOURCE_LABELS[source_id],
                    "active": active_map[source_id],
                    "lastPollAt": row["lastPollAt"],
                    "lastSuccessAt": row["lastSuccessAt"],
                    "lastError": row["lastError"],
                }
            )
        return {"sources": sources, "recentFilters": list(reversed(self._filters))}


__all__ = ["EewDiagnosticsBuffer"]
