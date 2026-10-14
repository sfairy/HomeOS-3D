"""实体与设备工具族：检索 / 控制 / 灯光 / 窗帘 / 媒体 / 摄像头 / 状态 / 天气 / 日历。"""

from __future__ import annotations

import math
from typing import Any

from .high_risk_denylist import is_high_risk
from .home_tools_base import HomeToolsHost
from .home_tools_primitives import (
    MEDIA_ACTION_SERVICES,
    _error_message,
    _math_round,
    _or,
    _s,
    logger,
    sanitize_entity_attributes,
)
from .tool_args_validator import extract_domain
from ..agent_actor import AgentActor
from ....platform.core.ha_service_catalog import agent_service_allowed
from ....platform.security.entity_access import is_entity_allowed


class HomeToolsEntitiesMixin(HomeToolsHost):
    """实体与设备工具族：检索 / 控制 / 灯光 / 窗帘 / 媒体 / 摄像头 / 状态 / 天气 / 日历。"""

    async def _search_entities(self, query: str, actor: AgentActor | None = None) -> dict[str, Any]:
        """搜索设备：仅在 HomeOS 白名单内匹配（房间映射 + 常用监控列表 favoriteEntities）。"""
        denied = self._read_denied(actor)
        if denied is not None:
            return denied
        lower = query.lower()
        try:
            areas = await self._area_service.find_all()
        except Exception as exc:
            return {"error": f"房间列表加载失败: {_error_message(exc)}"}
        whitelist: dict[str, None] = {}
        entity_room: dict[str, str] = {}

        # find_all 已带 entities，避免逐房 find_one N+1
        for area in areas:
            for ae in area.entities or []:
                entity_id = str(ae.entity_id)
                if entity_id not in whitelist:
                    whitelist[entity_id] = None
                if entity_id not in entity_room:
                    entity_room[entity_id] = area.name

        # 追加常用监控列表 favoriteEntities 到白名单
        favorites: list[str] = []
        try:
            layout = await self._read_layout()
            favorite_entities = (layout or {}).get("favoriteEntities") or {}
            if isinstance(favorite_entities, dict):
                for ids in favorite_entities.values():
                    if not isinstance(ids, list):
                        continue
                    for entity_id in ids:
                        ident = str(entity_id)
                        whitelist[ident] = None
                        favorites.append(ident)
        except Exception:
            pass

        # 在白名单内按关键词匹配
        restrictions = self._read_restrictions(actor)
        matched: list[dict[str, Any]] = []
        for entity in self._state_store.get_all():
            entity_id = str(entity.get("entity_id") or "")
            if entity_id not in whitelist:
                continue
            # 读路径 ACL：受限账号只能搜到自己可见的实体
            if restrictions is not None and not is_entity_allowed(entity_id, restrictions):
                continue
            attributes = entity.get("attributes") if isinstance(entity.get("attributes"), dict) else {}
            friendly = str((attributes or {}).get("friendly_name") or "")
            if lower not in entity_id.lower() and lower not in friendly.lower():
                continue
            matched.append(
                {
                    "entity_id": entity_id,
                    "name": _or((attributes or {}).get("friendly_name"), entity_id),
                    "state": entity.get("state"),
                    "room": entity_room.get(entity_id, ""),
                    "source": "monitored" if entity_id in favorites else "room",
                }
            )
            if len(matched) >= 12:
                break

        result: dict[str, Any] = {
            "count": len(matched),
            "total_whitelisted": len(whitelist),
        }
        if not matched:
            result["hint"] = (
                f'HomeOS 已配置的设备中未找到匹配"{query}"的设备。'
                "请将设备绑定到房间或加入常用监控列表。"
            )
        result["entities"] = matched
        return result

    def _get_entity_state(self, entity_id: str, actor: AgentActor | None = None) -> dict[str, Any]:
        """查询单个设备的当前状态（读路径 ACL：受限账号看不到白名单外实体）。"""
        denied = self._read_denied(actor)
        if denied is not None:
            return denied
        if not self._may_read(entity_id, actor):
            logger.warning("Agent 读 ACL 拒绝: get_entity_state %s", entity_id)
            return {"error": f"当前账号无权查看设备 {entity_id}"}
        entity = self._state_store.get(entity_id)
        if entity is None:
            return {"error": f"未找到设备 {entity_id}"}
        attributes = entity.get("attributes") if isinstance(entity.get("attributes"), dict) else {}
        result: dict[str, Any] = {
            "entity_id": entity.get("entity_id"),
            "name": _or((attributes or {}).get("friendly_name"), entity.get("entity_id")),
            "state": entity.get("state"),
        }
        # 剔除凭证类属性并截断超长值，避免敏感信息外泄 / 上下文膨胀
        sanitized = sanitize_entity_attributes(attributes if isinstance(attributes, dict) else None)
        if sanitized is not None:
            result["attributes"] = sanitized
        return result

    # 控制

    async def _control_device(
        self,
        args: dict[str, Any],
        actor: AgentActor | None = None,
    ) -> dict[str, Any]:
        """控制单个设备。参数校验 → 服务白名单 → 高危 denylist → 实体 ACL → CommandProxy。"""
        domain = _s(args.get("domain"))
        service = _s(args.get("service"))
        entity_id = _s(args.get("entity_id"))
        actual_domain = extract_domain(entity_id) or domain
        # 服务白名单：与 HTTP /ha/services/call 共用 core/ha_service_catalog，防止 LLM
        # 说出任意 domain.service（如 light.reload / shell_command.turn_on）直达 HA。
        if not agent_service_allowed(actual_domain, service):
            logger.warning("服务不在白名单,已拒绝: %s.%s (%s)", actual_domain, service, entity_id)
            return self._service_whitelist_error(actual_domain, service)
        raw_data = args.get("service_data")
        service_data = raw_data if isinstance(raw_data, dict) else None
        # scene / script 内部动作无法静态审计：仅在用户白名单内才放行（automation 永久拦截）
        scene_voice = (
            await self._scene_voice_gate()
            if actual_domain in ("scene", "script")
            else None
        )
        risk = is_high_risk(actual_domain, service, entity_id, service_data, scene_voice)
        if risk.get("blocked"):
            logger.warning(
                "已拦截高危语音控制: %s.%s %s (%s)",
                actual_domain,
                service,
                entity_id,
                risk.get("reason"),
            )
            return {
                "success": False,
                "blocked": True,
                "message": f"出于安全考虑，「{risk.get('reason')}」不支持语音直接控制，请通过手机 App 二次确认。",
            }
        auth = await self._assert_actor_may_control(
            actor,
            {
                "domain": actual_domain,
                "service": service,
                "entity_id": entity_id,
                "service_data": service_data,
            },
        )
        if not auth.get("ok"):
            logger.warning(
                "Agent ACL 拒绝: %s.%s %s (%s)", actual_domain, service, entity_id, auth.get("message")
            )
            return {"success": False, "blocked": True, "message": auth.get("message")}
        try:
            return await self._command_proxy.call_service(
                {
                    "domain": actual_domain,
                    "service": service,
                    "entity_id": entity_id,
                    "service_data": service_data,
                }
            )
        except Exception as exc:
            return {"success": False, "message": _error_message(exc, "控制失败")}

    async def _set_light_brightness(
        self,
        args: dict[str, Any],
        actor: AgentActor | None = None,
    ) -> dict[str, Any]:
        entity_id = _s(args.get("entity_id"))
        raw_brightness = args.get("brightness")
        try:
            brightness = float(raw_brightness) if raw_brightness is not None else float("nan")
        except (TypeError, ValueError):
            brightness = float("nan")
        if not entity_id.startswith("light."):
            return {"error": "entity_id 须为 light.*"}
        if math.isnan(brightness) or brightness < 0 or brightness > 100:  # NaN 判定
            return {"error": "brightness 须为 0-100"}
        return await self._control_device(
            {
                "domain": "light",
                "service": "turn_on",
                "entity_id": entity_id,
                # 对齐 JS Math.round：四舍五入到最近整数
                "service_data": {"brightness_pct": _math_round(brightness)},
            },
            actor,
        )

    async def _set_cover_position(
        self,
        args: dict[str, Any],
        actor: AgentActor | None = None,
    ) -> dict[str, Any]:
        entity_id = _s(args.get("entity_id"))
        raw_position = args.get("position")
        try:
            position = float(raw_position) if raw_position is not None else float("nan")
        except (TypeError, ValueError):
            position = float("nan")
        if not entity_id.startswith("cover."):
            return {"error": "entity_id 须为 cover.*"}
        if math.isnan(position) or position < 0 or position > 100:  # NaN 判定
            return {"error": "position 须为 0-100"}
        return await self._control_device(
            {
                "domain": "cover",
                "service": "set_cover_position",
                "entity_id": entity_id,
                "service_data": {"position": _math_round(position)},
            },
            actor,
        )

    async def _media_control(
        self,
        args: dict[str, Any],
        actor: AgentActor | None = None,
    ) -> dict[str, Any]:
        entity_id = _s(args.get("entity_id"))
        action = _s(args.get("action")).lower()
        if not entity_id.startswith("media_player."):
            return {"error": "entity_id 须为 media_player.*"}
        service = MEDIA_ACTION_SERVICES.get(action)
        if not service:
            return {"error": "action 须为 play/pause/stop/next/previous/volume"}
        service_data: dict[str, Any] | None = None
        if action == "volume":
            raw_volume = args.get("volume")
            try:
                volume = float(raw_volume) if raw_volume is not None else 0.0
            except (TypeError, ValueError):
                volume = 0.0
            if math.isnan(volume):  # NaN → 对齐 JS Number(...) || 0
                volume = 0.0
            service_data = {"volume_level": max(0.0, min(1.0, volume))}
        return await self._control_device(
            {
                "domain": "media_player",
                "service": service,
                "entity_id": entity_id,
                "service_data": service_data,
            },
            actor,
        )

    def _query_camera(self, entity_id: str, actor: AgentActor | None = None) -> dict[str, Any]:
        if not entity_id.startswith("camera."):
            return {"error": "entity_id 须为 camera.*"}
        return self._get_entity_state(entity_id, actor)

    async def _get_home_status(self) -> dict[str, Any]:
        """全屋整体状态概览。"""
        try:
            try:
                active = self._home_mode.get_active()
            except Exception as exc:
                logger.warning("状态概览读取家庭模式失败: %s", _error_message(exc))
                active = None
            return {
                "active_mode": (
                    {"id": active.get("id"), "name": active.get("name")} if active else None
                ),
                "entity_count": len(self._state_store.get_all()),
            }
        except Exception as exc:
            return {"error": f"状态概览获取失败: {_error_message(exc)}"}

    async def _get_weather(self) -> dict[str, Any]:
        """查询室外当前天气：优先 HA weather 实体，未配置时回退 OpenWeather。"""
        circadian = self._app_config.get("circadian") or {}
        ha_id = _s((circadian or {}).get("weatherEntityId") if isinstance(circadian, dict) else "").strip()
        if ha_id:
            entity = self._state_store.get(ha_id)
            if entity:
                attrs = entity.get("attributes") if isinstance(entity.get("attributes"), dict) else {}

                def _num(value: Any) -> float | None:
                    if isinstance(value, bool):
                        return None
                    if isinstance(value, (int, float)):
                        return float(value)
                    if isinstance(value, str):
                        try:
                            return float(value)
                        except ValueError:
                            return None
                    return None

                return {
                    "source": "ha",
                    "condition": _s(entity.get("state")),
                    "temperature": _num((attrs or {}).get("temperature")),
                    "humidity": _num((attrs or {}).get("humidity")),
                }
        return await self._external_api.get_current_weather()

    def _get_calendar(self) -> dict[str, Any]:
        """查询日历外出安排（来自外部日历源）。"""
        try:
            return self._external_api.get_calendar_summary()
        except Exception as exc:
            return {"error": f"日历查询失败: {_error_message(exc)}"}

    # 快捷控制工具
