"""通知偏好解析 Helper（对齐 ``modules/notification/notification-settings.helper.ts``）。

- 全屋级偏好来自 SystemConfig 的 ``notification`` 分区；
- 用户级偏好来自 ``User.preferences.notification``（用户优先覆盖全屋）；
- DND 时段缺省：用户 > 全屋 > ``DEFAULT_DND_*``。
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Callable
from typing import Any

from .config import merge_notification_settings
from ..alerts.dnd import DEFAULT_DND_END, DEFAULT_DND_START, is_dnd_active
from ...core.models import User

logger = logging.getLogger("homeos.notification.settings")

_TOGGLE_KEYS = (
    "globalNotifyEnabled",
    "importantNotifyEnabled",
    "offlineNotifyEnabled",
    "lowBatteryNotifyEnabled",
)


class NotificationSettingsHelper:
    def __init__(
        self,
        *,
        session_factory: Callable[[], Any],
        get_cfg: Callable[[], dict[str, Any]],
        is_dnd_active: Callable[[], bool],
    ) -> None:
        self._session_factory = session_factory
        self._get_cfg = get_cfg
        self._is_dnd_active = is_dnd_active

    # ------------------------------------------------------------------ #
    # 读取
    # ------------------------------------------------------------------ #
    def _get_global_settings(self) -> dict[str, Any]:
        cfg = self._get_cfg()
        return {
            "dndStart": cfg.get("dndStart"),
            "dndEnd": cfg.get("dndEnd"),
            "dndActive": self._is_dnd_active(),
            "globalNotifyEnabled": cfg.get("globalNotifyEnabled") is not False,
            "importantNotifyEnabled": cfg.get("importantNotifyEnabled") is not False,
            "offlineNotifyEnabled": cfg.get("offlineNotifyEnabled") is not False,
            "lowBatteryNotifyEnabled": cfg.get("lowBatteryNotifyEnabled") is not False,
        }

    def _get_user_notification_prefs(self, user_id: str) -> dict[str, Any]:
        try:
            with self._session_factory() as session:
                user = session.get(User, user_id)
                if user is None:
                    return {}
                prefs = _parse_object(user.preferences)
                value = prefs.get("notification")
                return value if isinstance(value, dict) else {}
        except Exception:
            return {}

    def _merge_settings(
        self, global_settings: dict[str, Any], user_prefs: dict[str, Any]
    ) -> dict[str, Any]:
        dnd_start = user_prefs.get("dndStart")
        if dnd_start is None:
            dnd_start = global_settings.get("dndStart")
        if dnd_start is None:
            dnd_start = DEFAULT_DND_START
        dnd_end = user_prefs.get("dndEnd")
        if dnd_end is None:
            dnd_end = global_settings.get("dndEnd")
        if dnd_end is None:
            dnd_end = DEFAULT_DND_END
        from datetime import datetime

        return {
            "dndStart": dnd_start,
            "dndEnd": dnd_end,
            "dndActive": is_dnd_active(datetime.now().hour, int(dnd_start), int(dnd_end)),
            "globalNotifyEnabled": _coalesce(
                user_prefs.get("globalNotifyEnabled"), global_settings.get("globalNotifyEnabled")
            ),
            "importantNotifyEnabled": _coalesce(
                user_prefs.get("importantNotifyEnabled"),
                global_settings.get("importantNotifyEnabled"),
            ),
            "offlineNotifyEnabled": _coalesce(
                user_prefs.get("offlineNotifyEnabled"), global_settings.get("offlineNotifyEnabled")
            ),
            "lowBatteryNotifyEnabled": _coalesce(
                user_prefs.get("lowBatteryNotifyEnabled"),
                global_settings.get("lowBatteryNotifyEnabled"),
            ),
        }

    async def get_settings(
        self,
        user_id: str | None = None,
        preloaded_prefs: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        global_settings = self._get_global_settings()
        if not user_id:
            return global_settings
        user_prefs = (
            preloaded_prefs
            if preloaded_prefs is not None
            else await asyncio.to_thread(self._get_user_notification_prefs, user_id)
        )
        return self._merge_settings(global_settings, user_prefs or {})

    # ------------------------------------------------------------------ #
    # 写入
    # ------------------------------------------------------------------ #
    async def update_settings(
        self,
        settings: dict[str, Any],
        user_id: str | None = None,
        role: str | None = None,
    ) -> dict[str, Any]:
        is_admin = role == "admin"
        has_toggles = any(settings.get(key) is not None for key in _TOGGLE_KEYS)
        touches_global_dnd = settings.get("dndStart") is not None or settings.get("dndEnd") is not None

        # 成人等非 admin：仅个人开关走 prefs，避免误改全屋默认值。
        if not is_admin and user_id and has_toggles and not touches_global_dnd:
            return await self.update_user_preferences(user_id, settings)

        partial: dict[str, Any] = {}
        if settings.get("dndStart") is not None:
            partial["dndStart"] = settings["dndStart"]
        if settings.get("dndEnd") is not None:
            partial["dndEnd"] = settings["dndEnd"]
        for key in _TOGGLE_KEYS:
            if settings.get(key) is not None:
                partial[key] = settings[key]
        if partial:
            await asyncio.to_thread(merge_notification_settings, self._session_factory, partial)
        return await self.get_settings(user_id)

    async def update_user_preferences(
        self, user_id: str, settings: dict[str, Any]
    ) -> dict[str, Any]:
        def _write() -> str | None:
            with self._session_factory() as session:
                user = session.get(User, user_id)
                if user is None:
                    return None
                existing = _parse_object(user.preferences)
                prev = existing.get("notification")
                prev = prev if isinstance(prev, dict) else {}
                next_prefs: dict[str, Any] = {**prev}
                for key in _TOGGLE_KEYS:
                    if settings.get(key) is not None:
                        next_prefs[key] = settings[key]
                if settings.get("dndStart") is not None:
                    next_prefs["dndStart"] = settings["dndStart"]
                if settings.get("dndEnd") is not None:
                    next_prefs["dndEnd"] = settings["dndEnd"]
                user.preferences = json.dumps(
                    {**existing, "notification": next_prefs}, ensure_ascii=False
                )
                session.commit()
                return user_id

        await asyncio.to_thread(_write)
        return await self.get_settings(user_id)


def _coalesce(*values: Any) -> Any:
    for value in values:
        if value is not None:
            return value
    return None


def _parse_object(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


__all__ = ["NotificationSettingsHelper"]
