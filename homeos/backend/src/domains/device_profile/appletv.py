"""Apple TV / 电视的应用唤起与待机（从 :mod:`service` 拆出，控制文件规模）。

关键约束（踩过的坑）：

- 唤醒只能走 ``media_player.turn_on``：``remote.*`` 服务与 media_player 实体域不匹配，
  命令通道会以「服务域与实体域不匹配」直接拒绝 —— 旧实现因此从未真正唤醒过；
- 待机是 ``media_player.turn_off``（Apple TV 集成的语义就是待机），同样不能用 ``remote.*``；
- 应用名比较统一 NFKC + 去空白 + 小写，且回填 ``source_list`` 里的原始写法
  （用户说 netflix、列表里是 Netflix，下发时要给列表里那一个）。
"""

from __future__ import annotations

import logging
import time
import unicodedata
from typing import Any

from .classify import AVAILABLE_CONFIDENCE, attr_map, text

logger = logging.getLogger("homeos.device_profile")


def normalize_app(value: str) -> str:
    """应用名归一：NFKC + 去空白 + 小写。"""
    return unicodedata.normalize("NFKC", str(value or "")).replace(" ", "").strip().lower()


class AppleTvMixin:
    """宿主需提供 ``_entity_of`` / ``_profile_of`` / ``_call`` / ``_sleep``。"""

    #: 允许「打开应用」的画像类型：Apple TV 与支持切换来源的电视
    APP_CAPABLE_KINDS = ("apple_tv", "tv")

    _entity_of: Any = None
    _profile_of: Any = None
    _call: Any = None
    _sleep: Any = None

    async def open_tv_app(self, entity_id: str, app: str) -> dict[str, Any]:
        """打开电视上的应用：``source_list`` 校验 + 关机时先唤醒。"""
        name = text(app)
        if not name or len(name) > 80:
            return {"success": False, "message": "应用名不能为空。" if not name else "应用名过长。"}
        entity, error = self._tv_app_target(entity_id)
        if error is not None or entity is None:
            return error or {"success": False, "message": "设备当前不可用。"}
        matched, sources = self._tv_source_match(entity, name)
        if sources and matched is None:
            return {
                "success": False,
                "reason": "app_not_listed",
                "message": f"应用 {name} 不在该 Apple TV 的来源列表里。",
                "candidates": sources[:5],
            }
        state = text(entity.get("state")).lower()
        if state in ("unavailable", "unknown"):
            return {"success": False, "message": "设备当前不可用。"}
        if state in ("off", "standby"):
            wake_error = await self._wake_tv(entity_id, name)
            if wake_error is not None:
                return wake_error
        result = await self._call("media_player", "select_source", entity_id, {"source": matched or name})
        if result.get("success") is False:
            return {
                "success": False,
                "reason": "select_source_failed",
                "message": str(result.get("message") or "切换应用失败。"),
                "entityId": entity_id,
                "app": matched or name,
            }
        return {
            "success": True,
            "accepted": True,
            **({"phase": "sent_unconfirmed"} if not result.get("verified") else {}),
            "entityId": entity_id,
            "app": matched or name,
        }

    async def suspend_tv(self, entity_id: str) -> dict[str, Any]:
        """Apple TV 待机；非 Apple TV 一律拒绝（普通电视被「待机」等于断电）。"""
        entity = self._entity_of(entity_id)
        if entity is None:
            return {"success": False, "message": "设备当前不可用。"}
        row = self._profile_of(entity_id)
        if row is None or row.kind != "apple_tv":
            return {"success": False, "message": "这台设备不是 Apple TV，不支持待机指令。"}
        result = await self._call("media_player", "turn_off", entity_id, {})
        if result.get("success") is False:
            return {"success": False, "message": str(result.get("message") or "待机指令下发失败。")}
        return {"success": True, "accepted": True, "entityId": entity_id, "verified": bool(result.get("verified"))}

    def _tv_app_target(self, entity_id: str) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
        """返回 ``(实体, 错误)``：目标必须存在、画像已确认，且确实具备切换来源的能力。"""
        entity = self._entity_of(entity_id)
        if entity is None:
            return None, {"success": False, "message": "设备当前不可用。"}
        row = self._profile_of(entity_id)
        if row is None or row.kind not in self.APP_CAPABLE_KINDS:
            return None, {"success": False, "message": "这台设备不是电视（先在设备画像里确认类型）。"}
        if not (row.confirmed or row.confidence >= AVAILABLE_CONFIDENCE):
            return None, {"success": False, "message": "这台电视的类型还没确认（设备画像 → 确认）。"}
        return entity, None

    @staticmethod
    def _tv_source_match(entity: dict[str, Any], name: str) -> tuple[str | None, list[str]]:
        """在 ``source_list`` 里找与用户说法等价的那一项（NFKC + 去空白 + 小写）。"""
        raw_sources = attr_map(entity).get("source_list")
        sources = [str(item) for item in raw_sources] if isinstance(raw_sources, list) else []
        target = normalize_app(name)
        return next((item for item in sources if normalize_app(item) == target), None), sources

    async def _wake_tv(self, entity_id: str, name: str) -> dict[str, Any] | None:
        """唤醒 + 等就绪；返回错误载荷或 ``None``。"""
        wake = await self._call("media_player", "turn_on", entity_id, {})
        if wake.get("success") is False:
            return {
                "success": False,
                "reason": "wake_failed",
                "message": str(wake.get("message") or "唤醒 Apple TV 失败。"),
            }
        if await self._wait_until_ready(entity_id):
            return None
        return {
            "success": False,
            "reason": "startup_unconfirmed",
            "message": f"等待电视就绪超时，未能打开「{name}」。",
            "entityId": entity_id,
        }

    async def _wait_until_ready(self, entity_id: str, timeout: float = 8.0) -> bool:
        """轮询到实体离开 off / standby（Apple TV 冷启动通常 2–5 秒）。"""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            current = self._entity_of(entity_id)
            state = text((current or {}).get("state")).lower()
            if state and state not in ("off", "standby"):
                return True
            await self._sleep(0.35)
        return False


__all__ = ["AppleTvMixin", "normalize_app"]
