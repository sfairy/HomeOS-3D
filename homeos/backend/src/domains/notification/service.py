"""通知服务（对齐 ``modules/notification/service.ts``）。"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any, TypeVar

from sqlalchemy import delete, func, or_, select

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
from ..alerts.sources import is_life_safety_notification  # noqa: F401  # pyright: ignore[reportUnusedImport] - 供外部/测试引用
from ..app_config.rooms import resolve_room_label_from_ha_areas
from ..ha.config.ha_config import ha_connection_configured
from ..ha.config.ha_filters import AlertRuleWatchIndex, HaStateChangeRouter
from ...platform.core.db.models import Notification
from ...platform.core.runtime.background import spawn_background

logger = logging.getLogger("homeos.notification")

#: 设备离线告警的确认宽限期（秒）：窗口内自行恢复则不告警，避免 HA 重启 / 集成重载
#: 造成的「所有实体同时离线」刷屏。
OFFLINE_GRACE_SECONDS = 90.0

#: HA（中枢）失联的确认宽限期（秒）：容器升级、路由器重拨、ISP 瞬断通常几分钟内自愈，
#: 短于此不告警。中枢一断，自动化 / 场景 / 安防联动全停，且设备离线告警会被抑制，
#: 所以这条必须让用户知道 —— 但也不能一抖动就报，否则又会变成被静音的那种噪音。
HA_OUTAGE_GRACE_SECONDS = 300.0

#: HA 重连后的**静置期**（秒）：中枢刚起来时各集成（Zigbee / Z-Wave / 云集成）要花几分钟
#: 才把实体逐个报上来，这期间成批实体是 ``unavailable`` 却并非真离线。
#: 静置期内到期的离线确认**顺延**到静置期结束（而不是跳过）：真离线仍会告警，
#: 只是等中枢自己先站稳。
HA_RECONNECT_SETTLE_SECONDS = 180.0

#: HA 失联 / 恢复的通知来源。见 ``alerts.sources``：该类不参与设备离线静音，
#: 也顺带说明为什么它的文案里不能出现「离线」二字（会被前端按设备离线归并）。
HA_SOURCE = "ha-connection"

#: 配置分区加载器返回类型（``_load`` 的透传泛型，避免把非 dict 分区标成 dict）
_T = TypeVar("_T")


class NotificationService:
    def __init__(
        self,
        session_factory: Callable[[], Any],
        *,
        event_bus: Any,
        cooldown_service: Any = None,
        channels_service: Any = None,
        ha_areas_provider: Callable[[], list[Any]] | None = None,
        state_store: Any = None,
    ) -> None:
        self._session_factory = session_factory
        self._event_bus = event_bus
        self._cooldown = cooldown_service
        self._channels_service = channels_service
        self._ha_areas_provider = ha_areas_provider or (list)
        self._state_store = state_store
        #: 正在等待宽限期的实体（同一实体只挂一个计时器）。
        self._offline_grace_inflight: set[str] = set()
        #: HA 失联宽限期只允许挂一个计时器：重连风暴里 connected/disconnected 会反复到达。
        self._ha_outage_inflight = False
        #: 本轮失联是否已告警：用于恢复时配对一条恢复通知，也避免重复告警。
        self._ha_outage_alarmed = False
        #: 最近一次 HA 连接成功的时刻（``monotonic``），用于重连静置期判定。
        self._ha_reconnected_at: float | None = None

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
            ha_states_trustworthy=self._ha_states_trustworthy,
        )

    # 配置 / 冷却辅助
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

    # 生命周期
    async def start(self) -> None:
        logger.info("通知服务已启动 (DB 持久化)")
        # 连接器在 3D 平面安装阶段就可能已经连上 HA：状态是随进程重建的，同样给一段静置期，
        # 免得刚起来就为一批「还没报上来」的实体报离线。
        store = self._state_store
        if store is not None:
            try:
                if store.is_ha_connected():
                    self._ha_reconnected_at = time.monotonic()
            except Exception:
                logger.debug("启动时读取 HA 连接状态失败", exc_info=True)
        await self._rules_helper.refresh_rules_cache()
        await self._rules_helper.load_condition_history()
        self._prune_helper.schedule_prune_old_notifications()

    async def stop(self) -> None:
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

        async def _ha_connected(_payload: Any = None) -> None:
            # 失联确认要等满宽限期（分钟级），绝不能挂在这个 await 上：总线是**串行** awaiting
            # 处理器的，而发事件的是连接器自己的连接循环（``_notify_connection``），挂住它等于
            # 把重连与停机一起卡死。恢复通知同理（要落库 + 外部投递）。仓库既有约定见
            # ``event_handlers._fire_and_forget(self._check_device_offline(...))``。
            spawn_background(self._run_ha_restored())

        async def _ha_disconnected(_payload: Any = None) -> None:
            spawn_background(self._run_ha_outage_watch())

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
        bus.on("ha.connected", _ha_connected)
        bus.on("ha.disconnected", _ha_disconnected)

    # 通知发送
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
        # HA 断连 / 重启 / 集成重载期间「所有实体同时 unavailable」不是设备故障。逐实体
        # 立刻推送（默认通道还会展开成邮件 + WebPush + 企微）意味着一次重启就是几十条告警，
        # 用户很快就会静音告警 —— 真正的告警反而收不到。
        if not self._ha_states_trustworthy():
            # HA 断连时所有实体都会短暂 unavailable；逐实体打一行 INFO 会瞬间刷满控制台，
            # 而这里的结论是「不告警」——留在 DEBUG 供排查即可。
            logger.debug("HA 连接未就绪，跳过设备离线告警: %s", entity_id)
            return
        # 同一实体只允许有一个宽限期计时器：属性抖动会让同一状态反复触发本方法，否则
        # 会为一堆注定被冷却拦下的检查各挂一个 90 秒的休眠任务。
        if entity_id in self._offline_grace_inflight:
            return
        self._offline_grace_inflight.add(entity_id)
        try:
            # 宽限期：先等一段时间再确认实体**仍然**离线。短暂抖动（集成重载、网络瞬断）
            # 在窗口内自行恢复就不告警。刚重连过的 HA 会顺延（见 ``_offline_grace_delay``）。
            await asyncio.sleep(self._offline_grace_delay())
            if self.is_in_cooldown(cooldown_key):
                return
            if not self._ha_states_trustworthy() or not self._is_still_offline(entity_id):
                return
            name = friendly_name or entity_id
            sent = await self.notify("warn", f"{name} 已离线", "device-monitor", entity_id)
            if not sent:
                return
            self.set_cooldown(cooldown_key, float(cfg.get("offlineCooldownMin") or 30))
        finally:
            self._offline_grace_inflight.discard(entity_id)

    def _offline_grace_delay(self) -> float:
        """离线确认前要等多久：基础宽限期，必要时顺延过 HA 重连静置期。

        中枢刚恢复时它的各集成还在启动，实体在几分钟内成批 ``unavailable``（并非真离线）。
        这里**顺延而不是跳过**：真离线的设备仍会告警，只是等中枢先站稳；跳过的话，那些在
        静置期内触发过一次的事件后续不会再触发，真离线反而永远不报。
        """
        reconnected_at = self._ha_reconnected_at
        if reconnected_at is None:
            return OFFLINE_GRACE_SECONDS
        settle_left = HA_RECONNECT_SETTLE_SECONDS - (time.monotonic() - reconnected_at)
        return max(OFFLINE_GRACE_SECONDS, settle_left) if settle_left > 0 else OFFLINE_GRACE_SECONDS

    # HA（中枢）连接监控
    async def _run_ha_outage_watch(self) -> None:
        """后台执行 HA 失联监控；异常自吞（旁路告警不该炸掉连接器的连接循环）。"""
        try:
            await self._handle_ha_disconnected()
        except Exception:
            logger.warning("HA 失联监控失败", exc_info=True)

    async def _run_ha_restored(self) -> None:
        """后台执行 HA 恢复处理；异常自吞（同上）。"""
        try:
            await self._handle_ha_connected()
        except Exception:
            logger.warning("HA 恢复处理失败", exc_info=True)

    async def _handle_ha_connected(self) -> None:
        """HA 连接成功：开启静置期；若本轮**确实告过警**，配对一条恢复通知。"""
        self._ha_reconnected_at = time.monotonic()
        if not self._ha_outage_alarmed:
            return
        self._ha_outage_alarmed = False
        # 恢复通知与失联告警成对：用户被「HA 已中断」通知过，就必须知道它回来了，
        # 否则通知列表里只会留一个悬而未决的故障。与告警同一口径（免打扰也放行）。
        await self.notify(
            "info",
            "HA 连接已恢复，自动化、告警与安防联动恢复正常",
            HA_SOURCE,
            opts={"bypassDnd": True},
        )

    async def _handle_ha_disconnected(self) -> None:
        """HA 断连：宽限期后仍在断连态才告警（重连风暴里只会挂一个计时器）。"""
        if self._ha_outage_inflight:
            return
        # 「压根没配 HA」的环境先挡在休眠之外：否则连接器每个重连周期都会挂一个 5 分钟的
        # 休眠任务（虽然最终不告警，但白占任务）。配置在宽限期内被补上也没关系 ——
        # 连接器会重新走一轮连接，那时再判断。
        if not self._ha_configured():
            logger.debug("HA 未配置连接，跳过中枢失联告警")
            return
        self._ha_outage_inflight = True
        try:
            await asyncio.sleep(HA_OUTAGE_GRACE_SECONDS)
            if self._ha_states_trustworthy():
                # 宽限期内已自行恢复：连不上的是 HA 升级 / 路由器重拨，不该打扰用户。
                return
            if self._ha_outage_alarmed:
                return  # 已告过警，等恢复事件来配对
            self._ha_outage_alarmed = True
            sent = await self.notify(
                "warn",
                f"HA 连接已中断超过 {int(HA_OUTAGE_GRACE_SECONDS // 60)} 分钟，"
                "自动化、告警与安防联动当前不可用",
                HA_SOURCE,
                opts={"bypassDnd": True},
            )
            if not sent:
                # 被全局开关拦下：不算已告警，恢复时也就不需要配对恢复通知。
                self._ha_outage_alarmed = False
        finally:
            self._ha_outage_inflight = False

    def _ha_configured(self) -> bool:
        """HA 是否配过连接（区分「本来连着现在断了」与「压根没配 HA」）。"""
        try:
            return bool(self._load(ha_connection_configured))
        except Exception:
            logger.debug("读取 HA 连接配置失败", exc_info=True)
            # 读不出来保守放行：宁可多一条告警，也不要静默丢掉中枢失联。
            return True

    def _ha_states_trustworthy(self) -> bool:
        """HA 连接状态是否可信（无 state store 时按旧行为放行）。"""
        store = self._state_store
        if store is None:
            return True
        return bool(store.is_ha_connected())

    def _is_still_offline(self, entity_id: str) -> bool:
        """宽限期结束后复查实体状态：仍在（或确已不在）离线才算真离线。"""
        store = self._state_store
        if store is None:
            return True
        entity = store.get(entity_id)
        if entity is None:
            # 实体整个消失：可能是重载后改名 / 移除，不宜报「已离线」。
            return False
        return str(entity.get("state")) in ("unavailable", "unknown")

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

    # 持久化查询
    async def get_notifications(
        self,
        limit: int = 50,
        source: str | None = None,
        restrictions: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        from ...platform.security.entity_access import is_entity_allowed_by_restrictions

        def _query() -> list[dict[str, Any]]:
            with self._session_factory() as session:
                conditions: list[Any] = []
                if source:
                    conditions.append(Notification.source == source)
                if restrictions:
                    acl: list[Any] = [Notification.entity_id.is_(None)]
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
                session.execute(delete(Notification))
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

    # 告警规则
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

    # 通知设置
    async def get_settings(
        self, user_id: str | None = None, preloaded_prefs: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        return await self._settings_helper.get_settings(user_id, preloaded_prefs)

    async def update_settings(
        self,
        settings: dict[str, Any],
        user_id: str | None = None,
    ) -> dict[str, Any]:
        return await self._settings_helper.update_settings(settings, user_id)

    async def update_user_preferences(
        self, user_id: str, settings: dict[str, Any]
    ) -> dict[str, Any]:
        return await self._settings_helper.update_user_preferences(user_id, settings)

    # 状态变更入口（冷路径）
    def handle_state_change(self, event: dict[str, Any] | None) -> None:
        self._event_handlers.handle_state_changed(event)

    def handle_alert_rule_state_change(self, event: dict[str, Any] | None) -> None:
        self._event_handlers.handle_alert_rule_state_changed(event)

    # 房间标签
    def resolve_notification_room_label(self, room_id: str | None) -> str:
        text = (room_id or "").strip()
        if not text:
            return "环境"
        sensor_map = self._load(load_env_sensor_map)
        areas = self._ha_areas_provider() or []
        return resolve_room_label_from_ha_areas(text, sensor_map, areas)


__all__ = ["NotificationService"]
