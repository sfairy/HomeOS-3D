"""首装向导服务（对齐 ``modules/system/setup/wizard.service.ts``）。

- ``get_status``：各步骤完成度（connection / security / energy / environment / dashboard / complete）
- ``validate_entities``：批量校验 entity（state-store 未命中再查 HA 实时状态）
- ``complete_wizard``：完成向导（幂等）
- ``reduce_security_sensitivity``：误报反馈时延长传感器告警冷却
- ``get_post_setup_checklist``：首装后引导任务清单（户型图 / 常用设备 / 语音）
- ``get_binding_gaps`` / ``get_config_health_score``：集成绑定缺口与配置健康评分
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select

from .bindings_gaps import collect_binding_gaps
from ..client_power.energy_meter import (
    describe_energy_entity,
    describe_meter_scope,
    normalize_meter_scope,
    suggest_meter_scope,
)
from ...platform.core.db.db_exec import run_db
from ...platform.core.db.json_field import object_field, read_json_object
from ...platform.core.db.models import Project, ProjectConfig, SecurityEvent
from ...platform.core.http.errors import api_error, bad_request

logger = logging.getLogger("homeos.setup.wizard")

#: 环境步骤达标所需的最少已绑定房间数（与前端 useSetupWizardEnvStep 口径一致）
ENV_ROOM_MIN = 3
#: 计入「房间已绑定」的环境传感器字段（与前端 SENSOR_KEYS 一致，含 tvoc）
ENV_SENSOR_KEYS = ("temperature", "humidity", "pm25", "co2", "tvoc")

#: 首装后引导任务清单项 ID
CHECKLIST_ITEM_IDS = ("studio3d", "favorites", "voice")

#: 配置健康评分缓存 TTL（毫秒）
HEALTH_CACHE_TTL_MS = 60_000
#: 引导清单短缓存 TTL（毫秒）
CHECKLIST_CACHE_TTL_MS = 15_000


def _grain_source(grain: str, scope: str, scope_direct: list[str], day_id: str, month_id: str) -> str:
    """某一粒度由谁提供：``meter`` 主表直接读、``aux`` 佐证表直接读、``derived`` 只能差分。

    优先级固定为「主表口径 → 佐证表 → 差分」，与 ``_SCOPE_DIRECT_GRAINS`` 保持同一份规则；
    新增口径时只改那张表，这里不需要再判断 ``scope == "..."``。
    """
    if grain in scope_direct:
        return "meter"
    if grain == "day" and day_id:
        return "aux"
    if grain == "month" and month_id:
        return "aux"
    return "derived"


def _remember_energy_entity(
    entity_id: str,
    attributes: Any,
    entities: dict[str, dict[str, Any]],
    friendly_names: dict[str, str],
) -> None:
    """把单实体的能源类型与友好名记进校验结果（attributes 可能缺失/脏类型）。"""
    resolved = attributes if isinstance(attributes, dict) else None
    entities[entity_id] = describe_energy_entity(resolved)
    name = (resolved or {}).get("friendly_name")
    if isinstance(name, str) and name.strip():
        friendly_names[entity_id] = name.strip()


class SetupWizardService:
    def __init__(
        self,
        app_config: Any,
        session_factory: Callable[[], Any],
        ha_connector: Any,
        state_store: Any,
    ) -> None:
        self._app_config = app_config
        self._session_factory = session_factory
        self._ha_connector = ha_connector
        self._state_store = state_store
        self._health_cache: dict[str, Any] | None = None
        self._checklist_cache: dict[str, Any] | None = None

    # 内部工具
    def resolve_active_project_id(self) -> str:
        profiles = self._app_config.get("profiles") or {}
        return str(profiles.get("activeProfileId") or "").strip() or "default"

    def _get_project_layout(self) -> dict[str, Any] | None:
        try:
            with self._session_factory() as session:
                row = session.execute(
                    select(ProjectConfig).where(ProjectConfig.project_id == self.resolve_active_project_id())
                ).scalar_one_or_none()
            if row is None or not row.layout:
                return None
            return read_json_object(row.layout, {})
        except Exception as err:
            logger.debug("读取项目布局失败: %s", err)
            return None

    def get_ha_config_snapshot(self) -> dict[str, Any]:
        layout = self._get_project_layout() or {}
        ha_config = layout.get("haConfig")
        return ha_config if isinstance(ha_config, dict) else {}

    def _get_configured_doorbell_count(self) -> int:
        ha = self.get_ha_config_snapshot()
        doorbells = ha.get("doorbells")
        if not isinstance(doorbells, list):
            return 0
        return sum(1 for item in doorbells if isinstance(item, dict) and str(item.get("triggerEntityId") or "").strip())

    def _get_configured_motion_sensor(self) -> bool:
        ha = self.get_ha_config_snapshot()
        return bool(str(ha.get("motionSensorEntityId") or "").strip())

    @staticmethod
    def _count_favorite_entities(layout: dict[str, Any] | None) -> int:
        favorites = (layout or {}).get("favoriteEntities")
        if not isinstance(favorites, dict):
            return 0
        total = 0
        for ids in favorites.values():
            if isinstance(ids, list):
                total += sum(1 for item in ids if item)
        return total

    def _has_studio_project(self) -> bool:
        """是否已存在 3D 户型项目（旧 2D 楼层底图判定已退役）。"""
        try:
            with self._session_factory() as session:
                return bool(session.scalar(select(func.count()).select_from(Project)))
        except Exception:
            logger.debug("_has_studio_project 忽略异常", exc_info=True)
            return False

    @staticmethod
    def _count_env_rooms(env_map: Any) -> int:
        if not isinstance(env_map, dict):
            return 0
        count = 0
        for entry in env_map.values():
            if not isinstance(entry, dict) or entry.get("_hidden"):
                continue
            if any(str(entry.get(key) or "").strip() for key in ENV_SENSOR_KEYS):
                count += 1
        return count

    # 向导状态
    async def get_status(self) -> dict[str, Any]:
        ha_status = await self._ha_connector.get_status()
        entity_count = self._state_store.get_count()
        energy = self._app_config.get("energy") or {}
        env_map = self._app_config.get("envSensorMap")
        doorbell_count = self._get_configured_doorbell_count()
        motion_configured = self._get_configured_motion_sensor()
        env_room_count = self._count_env_rooms(env_map)

        layout = self._get_project_layout()
        favorite_count = self._count_favorite_entities(layout)
        has_studio_project = await asyncio.to_thread(self._has_studio_project)
        dashboard_done = has_studio_project or favorite_count >= 1

        connection_done = bool(ha_status.get("connected")) and entity_count > 0
        energy_done = bool(str(energy.get("meterEntityId") or "").strip())

        steps = {
            "connection": {
                "done": connection_done,
                "hint": None if connection_done else "请确认 HA 地址与 Token，并保持 HA 在线",
            },
            "security": {
                "done": doorbell_count > 0 or motion_configured,
                "hint": "至少配置一路门铃触发实体或移动传感器",
            },
            "energy": {
                "done": energy_done,
                "hint": "请绑定主电表，并选择它的清零口径（终身/年/月/日累计）",
            },
            "environment": {
                "done": env_room_count >= ENV_ROOM_MIN,
                "hint": f"在 HA 配置区域后，至少为 {ENV_ROOM_MIN} 个区域绑定环境传感器",
            },
            "dashboard": {
                "done": dashboard_done,
                "hint": (None if dashboard_done else "可选：绘制 3D 户型图，或在常用设备中收藏至少 1 个实体"),
            },
            "complete": {
                "done": bool(energy.get("learningStartedAt")),
                "hint": "完成向导以启用能源学习期",
            },
        }
        # 未完成步骤不返回 hint=None 的冗余字段（Nest 侧 undefined 会被 JSON 丢弃）
        for step in steps.values():
            if step["hint"] is None:
                del step["hint"]

        completed = sum(1 for step in steps.values() if step["done"])
        circuit_ids = energy.get("circuitEntityIds")
        circuit_ids = circuit_ids if isinstance(circuit_ids, list) else []
        retention = self._app_config.get("retention") or {}
        other = self._app_config.get("other") or {}
        return {
            "steps": steps,
            "progress": round(completed / len(steps) * 100),
            "ha": {"connected": bool(ha_status.get("connected")), "entityCount": entity_count},
            "retentionDays": retention.get("eventLog")
            if retention.get("eventLog") is not None
            else (other.get("eventlogRetentionDays") if other.get("eventlogRetentionDays") is not None else 7),
            "circuitCount": sum(1 for cid in circuit_ids if str(cid or "").strip()),
            "learningPeriodDays": energy.get("learningPeriodDays", 7),
            "learningStartedAt": energy.get("learningStartedAt") or None,
            "energy": self._build_energy_binding_status(energy),
        }

    def _build_energy_binding_status(self, energy: dict[str, Any]) -> dict[str, Any]:
        """能源绑定现状：口径、覆盖的粒度与缺什么。

        只绑一个「累计电量」并不等于三档曲线都有数：日/月/年哪一档能直接读表，
        取决于该表的清零周期；没有的粒度要么靠差分（可能因离线丢读数），
        要么根本算不出来。这里把结论算好，前端只负责展示，不再各自猜规则。
        """
        meter_id = str(energy.get("meterEntityId") or "").strip()
        scope = normalize_meter_scope(energy.get("meterScope"))
        scope_info = describe_meter_scope(scope)
        scope_direct = scope_info["directGrains"]
        direct = set(scope_direct)
        month_id = str(energy.get("monthMeterEntityId") or "").strip()
        day_id = str(energy.get("dayMeterEntityId") or "").strip()
        power_id = str(energy.get("mainPowerEntityId") or "").strip()
        circuit_ids = [str(cid).strip() for cid in (energy.get("circuitEntityIds") or []) if str(cid or "").strip()]
        # 佐证口径同样能「直接读表」：绑了日累计表，当日用量就不必靠差分。
        # 「哪些粒度能直接读」的规则只在 client_power.energy_meter 里写一份
        # （_SCOPE_DIRECT_GRAINS），这里只做「主表 ∪ 佐证表」的合并，不再按 scope 分支判断。
        if day_id:
            direct.add("day")
        if month_id:
            direct.add("month")
        grains = {
            grain: {
                "available": grain in direct,
                "source": _grain_source(grain, scope, scope_direct, day_id, month_id),
            }
            for grain in ("day", "month", "year")
        }
        # 缺粒度时的具体建议：优先补最细的日累计，其次月累计。
        advice: str | None = None
        if meter_id:
            if not grains["day"]["available"]:
                advice = "尚未绑定日累计表：今日用量靠读数差分，跨零点离线会缺当天数据"
            elif not grains["month"]["available"]:
                advice = "月总量由日行求和，若想要账单级精度可补绑月累计表"
        return {
            "meterEntityId": meter_id,
            "meterScope": scope,
            "scopeResetLabel": scope_info["resetLabel"],
            "directGrains": sorted(direct),
            "grains": grains,
            "mainPowerEntityId": power_id,
            "monthMeterEntityId": month_id,
            "dayMeterEntityId": day_id,
            "circuitCount": len(circuit_ids),
            "hasRealtimePower": bool(power_id),
            "advice": advice,
        }

    @staticmethod
    def suggest_energy_scope(entity_ids: list[str], names: dict[str, str] | None = None) -> dict[str, str]:
        """按 entity_id + friendly_name 猜口径，供向导在用户选完电表后预填（可手动改）。"""
        resolved_names = names or {}
        out: dict[str, str] = {}
        for raw in entity_ids or []:
            eid = str(raw or "").strip()
            if eid:
                out[eid] = suggest_meter_scope(eid, resolved_names.get(eid))
        return out

    async def validate_entities(self, entity_ids: list[str]) -> dict[str, Any]:
        """批量校验 entity_id 是否可用，并返回能源类型（energy / power / other）。

        ``entities`` 里的类型依据 state-store / HA 实时状态的 ``attributes`` 判定，
        state-store 未命中时才去 HA 取一次；取不到 attributes 的实体归为 ``other``，
        不在这里直接拒绝 —— 让前端把「绑定到哪个槽位」的语义错误显式提示给用户。
        """
        missing: list[str] = []
        entities: dict[str, dict[str, Any]] = {}
        friendly_names: dict[str, str] = {}
        need_ha: list[str] = []
        for raw in entity_ids or []:
            eid = str(raw or "").strip()
            if not eid:
                continue
            state = self._state_store.get(eid)
            if state:
                _remember_energy_entity(eid, state.get("attributes"), entities, friendly_names)
            else:
                need_ha.append(eid)
        for eid in need_ha:
            live = await self._fetch_live_entity(eid)
            if live is None:
                missing.append(eid)
            else:
                _remember_energy_entity(eid, live.get("attributes"), entities, friendly_names)
        # 口径建议按 entity_id + friendly_name 关键词猜（「日/月/年/累计」），
        # 猜错用户也能手动改，但省掉让普通用户理解「清零周期」的成本。
        hints = self.suggest_energy_scope(list(entities), friendly_names)
        for eid, info in entities.items():
            info["suggestedScope"] = hints.get(eid, "total")
        return {
            "valid": list(entities),
            "missing": missing,
            "allOk": not missing,
            "entities": entities,
        }

    async def _fetch_live_entity(self, entity_id: str) -> dict[str, Any] | None:
        """回源 HA 取单实体状态；不可达或状态为空时返回 None（由调用方记为缺失）。"""
        try:
            live = await self._ha_connector.fetch_entity_state(entity_id)
        except Exception as error:  # HA 单实体失败不该让整批校验报错
            logger.debug("能源实体回源失败 %s: %s", entity_id, error)
            return None
        return live if isinstance(live, dict) and live.get("entity_id") else None

    async def complete_wizard(self, opts: dict[str, Any] | None = None) -> dict[str, Any]:
        """完成首装向导（幂等）。"""
        status = await self.get_status()
        # 与前端一致：安防 / 户型收藏可稍后补齐，不阻断完成向导
        required = ("connection", "energy", "environment")
        pending = [step for step in required if not status["steps"].get(step, {}).get("done")]
        if pending:
            bad_request(api_error("SETUP_WIZARD_STEPS_PENDING", "、".join(pending)))
        energy = self._app_config.get("energy") or {}
        days = (opts or {}).get("learningPeriodDays")
        if days is None:
            days = energy.get("learningPeriodDays", 7)
        # 幂等：已完成则保留首次 learningStartedAt，避免重复调用重置能源学习期
        update: dict[str, Any] = {"learningPeriodDays": days}
        if not energy.get("learningStartedAt"):
            update["learningStartedAt"] = datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        self._app_config.update({"energy": update})
        return {"success": True, "learningPeriodDays": days}

    async def reduce_security_sensitivity(self, opts: dict[str, Any] | None = None) -> dict[str, Any]:
        """降低安防传感器告警灵敏度（误报反馈时调用）。"""
        options = opts or {}
        sec = self._app_config.get("security") or {}
        next_value = min(600, int(sec.get("sensorAlertCooldownSec") or 60) + 120)
        self._app_config.update({"security": {"sensorAlertCooldownSec": next_value}})

        if options.get("recordFeedback"):
            source = options.get("source") or "unknown"
            detail = f"用户误报反馈，冷却延长至 {next_value}s（来源: {source}）"
            try:
                await run_db(self._record_false_alarm_feedback, detail)
            except Exception as err:
                logger.warning("写入误报反馈事件失败: %s", err)

        return {"sensorAlertCooldownSec": next_value}

    def _record_false_alarm_feedback(self, detail: str) -> None:
        with self._session_factory() as session, session.begin():
            session.add(
                SecurityEvent(
                    type="false_alarm_feedback",
                    mode="disarmed",
                    detail=detail,
                    zones="[]",
                )
            )

    # 首装后引导清单
    async def get_post_setup_checklist(self) -> dict[str, Any]:
        now = time.monotonic() * 1000
        if self._checklist_cache and now - self._checklist_cache["at"] < CHECKLIST_CACHE_TTL_MS:
            return self._checklist_cache["data"]
        data = await self._build_post_setup_checklist()
        self._checklist_cache = {"at": now, "data": data}
        return data

    async def _build_post_setup_checklist(self) -> dict[str, Any]:
        voice = self._app_config.get("voice") or {}
        external = self._app_config.get("external") or {}
        other = self._app_config.get("other") or {}
        layout = self._get_project_layout()
        favorite_count = self._count_favorite_entities(layout)
        tts_ids = external.get("ttsMediaPlayerIds")
        voice_ready = bool(
            (isinstance(tts_ids, list) and any(str(item or "").strip() for item in tts_ids))
            or voice.get("dailyAdvisorSpeak")
        )

        items = [
            {
                "id": "studio3d",
                "label": "绘制 3D 户型图",
                "done": await asyncio.to_thread(self._has_studio_project),
                "hint": "设置 → 布局 → 3D 户型图绘制",
                "route": "/settings?tab=layout",
            },
            {
                "id": "favorites",
                "label": "配置 3 个常用设备",
                "done": favorite_count >= 3,
                "hint": f"已配置 {favorite_count}/3 个",
                "route": "/settings?tab=favorites",
            },
            {
                "id": "voice",
                "label": "测试语音播报",
                "done": voice_ready,
                "hint": "设置 → 语音 → 播报输出",
                "route": "/settings?tab=voice&section=output",
            },
        ]

        completed = sum(1 for item in items if item["done"])
        dismissed = bool(other.get("setupChecklistDismissedAt"))
        status = await self.get_status()
        wizard_complete = bool(status["steps"]["complete"]["done"])

        return {
            "items": items,
            "completed": completed,
            "total": len(items),
            "dismissed": dismissed,
            "dismissedAt": other.get("setupChecklistDismissedAt") or None,
            # 仅在向导完成 + 未 dismissed + 还有未完成项时显示
            "visible": wizard_complete and not dismissed and completed < len(items),
        }

    async def dismiss_post_setup_checklist(self) -> dict[str, Any]:
        at = datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        self._app_config.update({"other": {"setupChecklistDismissedAt": at}})
        self._checklist_cache = None
        return {"dismissedAt": at}

    # 绑定缺口 / 健康评分
    async def get_binding_gaps(self) -> dict[str, Any]:
        layout = self._get_project_layout() or {}
        ha_config = object_field(layout, "haConfig")
        stats = object_field(layout, "statsSensors")
        env_map = self._app_config.get("envSensorMap")
        footer = layout.get("dashboardFooter")
        footer_items = footer.get("items") if isinstance(footer, dict) else None
        gaps = collect_binding_gaps(
            {
                "haConfig": ha_config,
                "statsSensors": stats,
                # envSensorMap 持久化在 appConfig（非 layout），与前端 useBindingsRecommend 口径一致
                "envSensorMap": env_map,
                "dashboardFooterItems": footer_items if isinstance(footer_items, list) else None,
            }
        )
        return {"gaps": gaps}

    async def get_config_health_score(self) -> dict[str, Any]:
        now = time.monotonic() * 1000
        if self._health_cache and now - self._health_cache["at"] < HEALTH_CACHE_TTL_MS:
            return self._health_cache["data"]
        data = await self._compute_config_health_score()
        self._health_cache = {"at": now, "data": data}
        return data

    async def _compute_config_health_score(self) -> dict[str, Any]:
        gaps = (await self.get_binding_gaps())["gaps"]
        score = 100
        for gap in gaps:
            score -= 8 if gap.get("severity") == "warn" else 4
        ha_ok = bool(self._ha_connector.get_status_snapshot().get("connected"))
        if not ha_ok:
            score -= 15
        score = max(0, min(100, score))
        return {
            "score": score,
            "haConnected": ha_ok,
            "bindingGapCount": len(gaps),
            "gaps": gaps,
        }


__all__ = [
    "CHECKLIST_CACHE_TTL_MS",
    "CHECKLIST_ITEM_IDS",
    "ENV_ROOM_MIN",
    "ENV_SENSOR_KEYS",
    "HEALTH_CACHE_TTL_MS",
    "SetupWizardService",
]
