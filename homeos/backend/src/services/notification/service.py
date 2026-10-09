"""通知服务（对齐 ``modules/notification/service.ts``）。

职责：通知的创建、持久化、跨实例分发；告警规则的 CRUD 与条件求值；设备健康监控；
全屋 / 用户级通知偏好管理；订阅领域事件并转为通知。
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any, TypeVar

from sqlalchemy import func, or_, select

from .config import (
    load_energy_config,
    load_env_sensor_map,
    load_home_timezone,
    load_iaq_config,
    load_notification_config,
    load_other_config,
    load_security_section,
    load_water_config,
)
from .dispatch import NotificationDispatchHelper
from .event_handlers import NotificationEventHandlersHelper
from .prune import NotificationPruneHelper
from .rules import NotificationRulesHelper
from .settings import NotificationSettingsHelper
from .stats import (
    build_notification_source_conditions,
    build_notification_stats,
    clamp_notification_stats_hours,
    combine_conditions,
    map_notification_row,
    resolve_notification_time_granularity,
)
from ..alerts.dnd import current_hour_in, is_dnd_active
from ..alerts.sources import is_life_safety_notification  # noqa: F401 - 供外部/测试引用
from ..ha_filters import AlertRuleWatchIndex, HaStateChangeRouter
from ..rooms import resolve_room_label_from_ha_areas
from ...core.models import Notification

logger = logging.getLogger("homeos.notification")

#: 配置分区加载器返回类型（``_load`` 的透传泛型，避免把非 dict 分区标成 dict）
_T = TypeVar("_T")

#: 告警规则边沿匹配态的 Redis 键（7 天 TTL）。
ALERT_EDGE_REDIS_KEY = "homeos:alert:rule-edge"
EDGE_PERSIST_DEBOUNCE_MS = 200
EDGE_TTL_SECONDS = 7 * 24 * 3600


class NotificationService:
    def __init__(
        self,
        session_factory: Callable[[], Any],
        *,
        event_bus: Any,
        redis: Any = None,
        cooldown_service: Any = None,
        channels_service: Any = None,
        ha_areas_provider: Callable[[], list[Any]] | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._event_bus = event_bus
        self._redis = redis
        self._cooldown = cooldown_service
        self._channels_service = channels_service
        self._ha_areas_provider = ha_areas_provider or (list)

        self._alert_edge_timer: asyncio.TimerHandle | None = None
        self._watch_index = AlertRuleWatchIndex()
        self._router = HaStateChangeRouter(self._watch_index)

        self._prune_helper = NotificationPruneHelper(session_factory, self._cfg)
        self._settings_helper = NotificationSettingsHelper(
            session_factory=session_factory,
            get_cfg=self._cfg,
            is_dnd_active=self.is_dnd_active,
            get_timezone=self._get_timezone,
        )
        self._rules_helper = NotificationRulesHelper(
            session_factory=session_factory,
            alert_rule_watch_index=self._watch_index,
            is_dnd_active=self.is_dnd_active,
            is_alert_bypass_dnd=self._is_alert_bypass_dnd,
            is_in_cooldown=self.is_in_cooldown,
            set_cooldown=self.set_cooldown,
            notify=self.notify,
            persist_edge_state=self.schedule_persist_alert_edge,
            restore_edge_state=self.restore_alert_edge,
        )
        self._dispatch_helper = NotificationDispatchHelper(
            session_factory=session_factory,
            event_bus=event_bus,
            get_cfg=self._cfg,
            schedule_prune=self._prune_helper.schedule_prune_old_notifications,
            channels_service=channels_service,
            get_timezone=self._get_timezone,
        )
        self._event_handlers = NotificationEventHandlersHelper(
            state_router=self._router,
            notify=self.notify,
            is_in_cooldown=self.is_in_cooldown,
            set_cooldown=self.set_cooldown,
            check_device_offline=self.check_device_offline,
            check_low_battery=self.check_low_battery,
            evaluate_rules=self._rules_helper.evaluate_rules,
            resolve_room_label=self.resolve_notification_room_label,
            get_security_cfg=lambda: self._load(load_security_section),
            get_energy_cfg=lambda: self._load(load_energy_config),
            get_water_cfg=lambda: self._load(load_water_config),
            get_iaq_cfg=lambda: self._load(load_iaq_config),
            get_other_cfg=lambda: self._load(load_other_config),
        )

    # ------------------------------------------------------------------ #
    # 配置 / 冷却辅助
    # ------------------------------------------------------------------ #
    def _load(self, loader: Callable[[Any], _T]) -> _T:
        with self._session_factory() as session:
            return loader(session)

    def _cfg(self) -> dict[str, Any]:
        return self._load(load_notification_config)

    def is_dnd_active(self) -> bool:
        cfg = self._cfg()
        dnd_start = cfg.get("dndStart")
        dnd_end = cfg.get("dndEnd")
        if dnd_start is None or dnd_end is None:
            return False
        # 免打扰窗口按家庭当地时间判定（服务器多为 UTC 容器，直接用本机小时会错 8 小时）。
        return is_dnd_active(current_hour_in(self._get_timezone()), int(dnd_start), int(dnd_end))

    def _get_timezone(self) -> str | None:
        """家庭时区（``ops.homeTimezone``）。"""
        return self._load(load_home_timezone)

    def _is_alert_bypass_dnd(self) -> bool:
        return self._load(load_security_section).get("alertBypassDnd") is True

    def is_in_cooldown(self, key: str) -> bool:
        if self._cooldown is None:
            return False
        return bool(self._cooldown.is_in_cooldown("notify", key))

    def set_cooldown(self, key: str, minutes: float) -> None:
        if self._cooldown is None:
            return
        self._cooldown.set_cooldown("notify", key, minutes)

    # ------------------------------------------------------------------ #
    # 生命周期
    # ------------------------------------------------------------------ #
    async def start(self) -> None:
        logger.info("通知服务已启动 (DB 持久化)")
        await self._rules_helper.refresh_rules_cache()
        await self._rules_helper.load_condition_history()
        await self._rules_helper.load_edge_state()
        self._prune_helper.schedule_prune_old_notifications()

    async def stop(self) -> None:
        if self._alert_edge_timer is not None:
            self._alert_edge_timer.cancel()
            self._alert_edge_timer = None
        self._prune_helper.dispose()

    def bind_events(self) -> None:
        """订阅领域事件（对齐 ``@OnEvent`` 装饰的方法集）。"""
        bus = self._event_bus
        if bus is None:
            return

        async def _alarm(payload: Any) -> None:
            await self._event_handlers.handle_security_alarm(payload)

        async def _emergency(payload: Any) -> None:
            await self._event_handlers.handle_emergency(payload)

        async def _energy_anomaly(payload: Any) -> None:
            await self._event_handlers.handle_energy_anomaly(payload)

        async def _budget(payload: Any) -> None:
            await self._event_handlers.handle_budget_exceeded(payload)

        async def _water(payload: Any) -> None:
            await self._event_handlers.handle_water_anomaly(payload)

        async def _mold(payload: Any) -> None:
            await self._event_handlers.handle_mold_risk(payload)

        async def _iaq(payload: Any) -> None:
            await self._event_handlers.handle_iaq_threshold(payload)

        async def _send(payload: Any) -> None:
            await self._event_handlers.handle_homeos_automation_notify(payload)

        async def _auto_failed(payload: Any) -> None:
            await self._event_handlers.handle_automation_failed(payload)

        async def _auto_dropped(payload: Any) -> None:
            await self._event_handlers.handle_automation_dropped(payload)

        async def _tip(payload: Any) -> None:
            await self._event_handlers.handle_advisor_tip(payload)

        async def _power_low(payload: Any) -> None:
            await self._event_handlers.handle_client_power_low(payload)

        async def _power_charged(payload: Any) -> None:
            await self._event_handlers.handle_client_power_charged(payload)

        async def _eew_alert(payload: Any) -> None:
            await self._event_handlers.handle_earthquake_eew_alert(payload)

        async def _eew_confirmation(payload: Any) -> None:
            await self._event_handlers.handle_earthquake_eew_confirmation(payload)

        bus.on("security.alarm", _alarm)
        bus.on("security.emergency", _emergency)
        bus.on("energy.anomaly", _energy_anomaly)
        bus.on("energy.budgetExceeded", _budget)
        bus.on("water.anomaly", _water)
        bus.on("env.moldRisk", _mold)
        bus.on("env.iaqThreshold", _iaq)
        bus.on("notification.homeos.send", _send)
        bus.on("automation.failed", _auto_failed)
        bus.on("automation.dropped", _auto_dropped)
        bus.on("advisor.tip", _tip)
        bus.on("clientPower.low", _power_low)
        bus.on("clientPower.charged", _power_charged)
        bus.on("earthquake.alert", _eew_alert)
        bus.on("earthquake.confirmation", _eew_confirmation)

    # ------------------------------------------------------------------ #
    # 边沿状态持久化
    # ------------------------------------------------------------------ #
    def schedule_persist_alert_edge(self, keys: list[str]) -> None:
        if self._alert_edge_timer is not None:
            self._alert_edge_timer.cancel()
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        self._alert_edge_timer = loop.call_later(
            EDGE_PERSIST_DEBOUNCE_MS / 1000, self._persist_alert_edge_now, keys
        )

    def _persist_alert_edge_now(self, keys: list[str]) -> None:
        self._alert_edge_timer = None
        if self._redis is None:
            return
        payload = json.dumps(keys, ensure_ascii=False)

        async def _write() -> None:
            try:
                await self._redis.set(ALERT_EDGE_REDIS_KEY, payload, EDGE_TTL_SECONDS)
            except Exception as exc:
                logger.debug("告警边沿状态持久化失败: %s", exc)

        try:
            asyncio.get_running_loop().create_task(_write())
        except RuntimeError:
            return

    async def restore_alert_edge(self) -> list[str]:
        if self._redis is None:
            return []
        try:
            raw = await self._redis.get(ALERT_EDGE_REDIS_KEY)
            if not raw:
                return []
            text = raw.decode("utf-8") if isinstance(raw, bytes) else str(raw)
            parsed = json.loads(text)
            if not isinstance(parsed, list):
                return []
            return [item for item in parsed if isinstance(item, str)]
        except Exception as exc:
            logger.debug("恢复告警边沿状态失败: %s", exc)
            return []

    # ------------------------------------------------------------------ #
    # 通知发送
    # ------------------------------------------------------------------ #
    async def notify(
        self,
        level: str,
        message: str,
        source: str = "system",
        entity_id: str | None = None,
        opts: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        return await self._dispatch_helper.notify(level, message, source, entity_id, opts)

    async def check_device_offline(self, entity_id: str, friendly_name: str) -> None:
        cfg = self._cfg()
        if cfg.get("globalNotifyEnabled") is False or cfg.get("offlineNotifyEnabled") is False:
            return
        cooldown_key = f"offline:{entity_id}"
        if self.is_in_cooldown(cooldown_key):
            return
        name = friendly_name or entity_id
        sent = await self.notify("warn", f"{name} 已离线", "device-monitor", entity_id)
        if not sent:
            return
        self.set_cooldown(cooldown_key, float(cfg.get("offlineCooldownMin") or 30))

    async def check_low_battery(
        self, entity_id: str, friendly_name: str, level: float
    ) -> None:
        cfg = self._cfg()
        if cfg.get("globalNotifyEnabled") is False or cfg.get("lowBatteryNotifyEnabled") is False:
            return
        cooldown_key = f"lowbattery:{entity_id}"
        if self.is_in_cooldown(cooldown_key):
            return
        name = friendly_name or entity_id
        sent = await self.notify("warn", f"{name} 电量低 ({level}%)", "device-monitor", entity_id)
        if not sent:
            return
        self.set_cooldown(cooldown_key, float(cfg.get("lowBatteryCooldownMin") or 120))

    # ------------------------------------------------------------------ #
    # 持久化查询
    # ------------------------------------------------------------------ #
    async def get_notifications(
        self,
        limit: int = 50,
        source: str | None = None,
        restrictions: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        from ...realtime.access import is_entity_allowed_by_restrictions

        def _query() -> list[dict[str, Any]]:
            with self._session_factory() as session:
                conditions: list[Any] = []
                if source:
                    conditions.append(Notification.source == source)
                if restrictions:
                    acl = [Notification.entity_id.is_(None)]
                    for prefix in restrictions:
                        acl.append(Notification.entity_id.startswith(prefix))
                    conditions.append(or_(*acl))
                fetch_limit = min(max(limit, 10) * 10, 2000)
                rows = (
                    session.execute(
                        select(Notification)
                        .where(*conditions)
                        .order_by(Notification.created_at.desc())
                        .limit(fetch_limit)
                    )
                    .scalars()
                    .all()
                )
                return [map_notification_row(row) for row in rows]

        records = await asyncio.to_thread(_query)
        if not restrictions:
            return records[:limit]
        filtered = [
            record
            for record in records
            if not record.get("entityId")
            or is_entity_allowed_by_restrictions(record["entityId"], restrictions)
        ]
        return filtered[:limit]

    async def get_notifications_by_sources(
        self, sources: list[str], limit: int = 30
    ) -> list[dict[str, Any]]:
        if not sources:
            return []

        def _query() -> list[dict[str, Any]]:
            with self._session_factory() as session:
                rows = (
                    session.execute(
                        select(Notification)
                        .where(Notification.source.in_(sources))
                        .order_by(Notification.created_at.desc())
                        .limit(limit)
                    )
                    .scalars()
                    .all()
                )
                return [map_notification_row(row) for row in rows]

        return await asyncio.to_thread(_query)

    async def get_stats(self, hours: Any = None, source: str | None = None) -> dict[str, Any]:
        window_hours = clamp_notification_stats_hours(hours, 24)
        since = datetime.now(UTC).replace(tzinfo=None) - timedelta(hours=window_hours)
        source_filter = (source or "").strip()
        source_condition = build_notification_source_conditions(source_filter) if source_filter else None
        granularity = resolve_notification_time_granularity(window_hours)

        def _query() -> dict[str, Any]:
            from sqlalchemy import func as sa_func

            with self._session_factory() as session:
                base = combine_conditions(Notification.created_at >= since, source_condition)
                base_conditions = [base] if base is not None else []
                total = int(
                    session.execute(
                        select(sa_func.count()).select_from(Notification).where(*base_conditions)
                    ).scalar()
                    or 0
                )
                unread = int(
                    session.execute(
                        select(sa_func.count())
                        .select_from(Notification)
                        .where(*base_conditions, Notification.read.is_(False))
                    ).scalar()
                    or 0
                )
                delivered = int(
                    session.execute(
                        select(sa_func.count())
                        .select_from(Notification)
                        .where(*base_conditions, Notification.delivered_at.is_not(None))
                    ).scalar()
                    or 0
                )
                source_rows = [
                    (str(row[0]), int(row[1]))
                    for row in session.execute(
                        select(Notification.source, sa_func.count())
                        .where(*base_conditions)
                        .group_by(Notification.source)
                    ).all()
                ]
                level_rows = [
                    (str(row[0]), int(row[1]))
                    for row in session.execute(
                        select(Notification.level, sa_func.count())
                        .where(*base_conditions)
                        .group_by(Notification.level)
                    ).all()
                ]
                bucket_expr = sa_func.substr(
                    Notification.created_at, 1, 13 if granularity == "hour" else 10
                )
                time_rows = [
                    (row[0], int(row[1]))
                    for row in session.execute(
                        select(bucket_expr, sa_func.count())
                        .where(*base_conditions)
                        .group_by(bucket_expr)
                        .order_by(bucket_expr.asc())
                    ).all()
                ]
            return build_notification_stats(
                total=total,
                unread=unread,
                delivered=delivered,
                window_hours=window_hours,
                source_rows=source_rows,
                level_rows=level_rows,
                time_rows=time_rows,
            )

        return await asyncio.to_thread(_query)

    async def mark_as_read(self, notification_id: str) -> None:
        def _update() -> None:
            with self._session_factory() as session:
                row = session.get(Notification, notification_id)
                if row is None or row.read:
                    return
                row.read = True
                session.commit()

        await asyncio.to_thread(_update)

    async def mark_all_as_read(self) -> dict[str, Any]:
        def _update() -> int:
            with self._session_factory() as session:
                rows = (
                    session.execute(
                        select(Notification).where(Notification.read.is_(False))
                    )
                    .scalars()
                    .all()
                )
                for row in rows:
                    row.read = True
                session.commit()
                return len(rows)

        count = await asyncio.to_thread(_update)
        return {"updated": count}

    async def clear_all(self) -> dict[str, Any]:
        def _clear() -> int:
            with self._session_factory() as session:
                count = int(
                    session.execute(select(func.count()).select_from(Notification)).scalar() or 0
                )
                session.execute(Notification.__table__.delete())
                session.commit()
                return count

        count = await asyncio.to_thread(_clear)
        logger.info("已清理 %s 条历史通知", count)
        return {"deleted": count}

    async def clear_by_sources(self, sources: list[str]) -> dict[str, Any]:
        if not sources:
            return {"deleted": 0}

        def _clear() -> int:
            with self._session_factory() as session:
                rows = (
                    session.execute(select(Notification).where(Notification.source.in_(sources)))
                    .scalars()
                    .all()
                )
                for row in rows:
                    session.delete(row)
                session.commit()
                return len(rows)

        count = await asyncio.to_thread(_clear)
        if count > 0:
            logger.info("已清理 %s 条来源为 [%s] 的通知", count, ", ".join(sources))
        return {"deleted": count}

    # ------------------------------------------------------------------ #
    # 告警规则
    # ------------------------------------------------------------------ #
    def get_rule_condition_history(self, rule_id: str) -> list[dict[str, str]]:
        return self._rules_helper.get_rule_condition_history(rule_id)

    async def get_rules(self) -> list[dict[str, Any]]:
        return await self._rules_helper.get_rules()

    async def add_rule(self, rule: dict[str, Any]) -> dict[str, Any]:
        return await self._rules_helper.add_rule(rule)

    async def update_rule(
        self, rule_id: str, partial: dict[str, Any]
    ) -> dict[str, Any] | None:
        return await self._rules_helper.update_rule(rule_id, partial)

    def test_condition(
        self, condition: str, state: str, attributes: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        return self._rules_helper.test_condition(condition, state, attributes)

    async def delete_rule(self, rule_id: str) -> dict[str, Any]:
        return await self._rules_helper.delete_rule(rule_id)

    # ------------------------------------------------------------------ #
    # 通知设置
    # ------------------------------------------------------------------ #
    async def get_settings(
        self, user_id: str | None = None, preloaded_prefs: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        return await self._settings_helper.get_settings(user_id, preloaded_prefs)

    async def update_settings(
        self,
        settings: dict[str, Any],
        user_id: str | None = None,
        role: str | None = None,
    ) -> dict[str, Any]:
        return await self._settings_helper.update_settings(settings, user_id, role)

    async def update_user_preferences(
        self, user_id: str, settings: dict[str, Any]
    ) -> dict[str, Any]:
        return await self._settings_helper.update_user_preferences(user_id, settings)

    # ------------------------------------------------------------------ #
    # 状态变更入口（冷路径）
    # ------------------------------------------------------------------ #
    def handle_state_change(self, event: dict[str, Any] | None) -> None:
        self._event_handlers.handle_state_changed(event)

    def handle_alert_rule_state_change(self, event: dict[str, Any] | None) -> None:
        self._event_handlers.handle_alert_rule_state_changed(event)

    # ------------------------------------------------------------------ #
    # 房间标签
    # ------------------------------------------------------------------ #
    def resolve_notification_room_label(self, room_id: str | None) -> str:
        text = (room_id or "").strip()
        if not text:
            return "环境"
        sensor_map = self._load(load_env_sensor_map)
        areas = self._ha_areas_provider() or []
        return resolve_room_label_from_ha_areas(text, sensor_map, areas)


__all__ = ["ALERT_EDGE_REDIS_KEY", "NotificationService"]
