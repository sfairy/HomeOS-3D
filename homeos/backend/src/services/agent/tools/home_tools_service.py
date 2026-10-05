"""智能管家工具集服务。

职责：实现 LLM 可调用的全部家居工具（search_entities / get_entity_state / control_device /
 list_areas / get_area_snapshot / control_room / activate_scene …），并统一执行入口。
 - 仅在 HomeOS 白名单（房间映射 + 常用监控列表）内搜索设备
 - 控制前用 is_high_risk 做安全校验，高危设备（门锁 / 安防 / 燃气阀 / 车库门）拦截
 - HA 的 scene.* / script.* 走「场景语音控制」允许清单闸门，默认全禁（fail-closed）
 - control_room 支持“全屋”语义，自动遍历所有房间
依赖：StateStore（状态）、CommandProxyService（下发 HA 调用）、AgentAreaService（房间）、
 UiConfigService（布局）、AppConfigService（环境传感器映射）。
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from sqlalchemy import select

from src.core.entity_domain import get_entity_domain
from src.core.errors import BusinessException
from src.core.models import HomeMode

from ...command_proxy_auth import assert_command_proxy_authorized
from ..agent_actor import AGENT_CONTROL_TOOLS, AgentActor
from ..config_service import AgentConfigService
from .high_risk_denylist import (
    SAFE_BULK_CONTROL_DOMAINS,
    SceneVoiceControlGate,
    is_high_risk,
    is_scene_voice_allowed,
)
from .home_tools_schemas import build_home_tool_schemas
from .tool_args_validator import (
    extract_domain,
    sanitize_service_data,
    validate_entity_id,
)

logger = logging.getLogger("homeos.agent.home_tools")

#: 实体属性中含凭证/密钥特征的字段：返回给 LLM 前剔除，避免敏感信息外泄。
#: HA 部分集成（媒体播放器 / 摄像头等）会在 attributes 暴露 access_token 等字段。
SENSITIVE_ATTRIBUTE_KEYS = frozenset(
    {
        "access_token",
        "refresh_token",
        "auth_token",
        "api_token",
        "api_key",
        "apikey",
        "token",
        "secret",
        "password",
        "passwd",
        "private_key",
        "certificate",
        "credentials",
    }
)

#: 单个属性值序列化后允许的最大长度：超出截断，防止大列表属性撑爆 LLM 上下文
MAX_ATTRIBUTE_VALUE_LENGTH = 500

#: control_room 的“全屋”语义判定
WHOLE_HOME_QUERY = re.compile(
    r"全屋|整屋|全家|所有房间|全部房间|整个家|全部区域|所有区域|"
    r"whole house|whole home|all rooms|everywhere|entire house|entire home",
    re.I,
)

#: 场景 / 脚本名称解析：剥离动作词与类别后缀
SCENE_QUERY_ACTION_PREFIX = re.compile(
    r"^(执行|激活|启动|运行|开启|打开|触发|触发一下|run|activate|start|execute|turn on)\s*"
)
SCENE_QUERY_CATEGORY_SUFFIX = re.compile(r"(场景|模式|脚本|scene|script|mode)\s*$")

#: media_control 的 action → HA 服务映射
MEDIA_ACTION_SERVICES: dict[str, str] = {
    "play": "media_play",
    "pause": "media_pause",
    "stop": "media_stop",
    "next": "media_next_track",
    "previous": "media_previous_track",
    "volume": "volume_set",
}


def _s(value: Any) -> str:
    """对齐 JS ``String(value ?? '')``：None → 空串，其余转字符串。"""
    return "" if value is None else str(value)


def _or(value: Any, default: Any) -> Any:
    """对齐 JS ``value ?? default``：仅 None / 缺失时回退。"""
    return default if value is None else value


def _math_round(value: float) -> int:
    """对齐 JS ``Math.round``（.5 向 +∞ 取整，非 Python 的银行家舍入）。"""
    import math

    return math.floor(value + 0.5)


def _js_stringify(value: Any) -> str | None:
    """对齐 JS ``JSON.stringify``（序列化失败返回 None，等价 undefined）。"""
    try:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    except (TypeError, ValueError):
        return None


def _error_message(exc: BaseException, fallback: str = "") -> str:
    """对齐 Nest ``getErrorMessage``：取异常 message，空则用兜底文案。"""
    text = str(exc or "").strip()
    if not text and isinstance(exc, BusinessException):
        text = str(exc.message or "").strip()
    return text or fallback


def sanitize_entity_attributes(
    attrs: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """清理实体属性：剔除凭证字段，截断超长值。"""
    if attrs is None:
        return attrs
    out: dict[str, Any] = {}
    for key, value in attrs.items():
        if key in SENSITIVE_ATTRIBUTE_KEYS:
            continue
        serialized = _js_stringify(value)
        if serialized and len(serialized) > MAX_ATTRIBUTE_VALUE_LENGTH:
            out[key] = f"{serialized[:MAX_ATTRIBUTE_VALUE_LENGTH]}…(截断)"
        else:
            out[key] = value
    return out


class HomeToolsService:
    """家居工具集服务：暴露 get_tool_schemas（供 LLM 选择工具）与 execute（统一执行入口）。"""

    def __init__(
        self,
        state_store: Any,
        command_proxy: Any,
        area_service: Any,
        ui_config: Any,
        app_config: Any,
        child_mode: Any,
        ha_connector: Any,
        home_mode: Any,
        session_factory: Any,
        external_api: Any,
        agent_config: AgentConfigService,
    ) -> None:
        self._state_store = state_store
        self._command_proxy = command_proxy
        self._area_service = area_service
        self._ui_config = ui_config
        self._app_config = app_config
        self._child_mode = child_mode
        self._ha_connector = ha_connector
        self._home_mode = home_mode
        self._session_factory = session_factory
        self._external_api = external_api
        self._agent_config = agent_config

    # ------------------------------------------------------------------ #
    # 场景语音白名单闸门 / ACL
    # ------------------------------------------------------------------ #
    async def _scene_voice_gate(self) -> SceneVoiceControlGate | None:
        """构造场景 / 脚本语音控制白名单闸门。

        配置读取失败时返回 None，调用方据此按全禁处理（fail-closed）。
        """
        try:
            cfg = await self._agent_config.get_scene_voice_control()
            if not cfg.enabled:
                return SceneVoiceControlGate(enabled=False, allow=frozenset())
            allow = frozenset(
                ident for ident in (str(i or "").strip().lower() for i in cfg.allow) if ident
            )
            return SceneVoiceControlGate(enabled=True, allow=allow)
        except Exception as exc:  # noqa: BLE001
            logger.warning("读取场景语音控制配置失败,按全禁处理: %s", exc)
            return None

    def _command_proxy_target_resolver(self) -> Any:
        state_store = self._state_store
        ha_connector = self._ha_connector

        class _Resolver:
            async def get_registry(self) -> list[dict[str, Any]]:
                return await ha_connector.fetch_entity_registry()

            def find_entity_ids(self, predicate: Any) -> list[str]:
                return [
                    str(entity.get("entity_id"))
                    for entity in state_store.get_all()
                    if entity.get("entity_id")
                    and predicate(entity.get("attributes") if isinstance(entity.get("attributes"), dict) else {})
                ]

        return _Resolver()

    async def _assert_actor_may_control(
        self,
        actor: AgentActor | None,
        dto: dict[str, Any],
    ) -> dict[str, Any]:
        """与 HTTP /services/call 对齐的实体 ACL；无执行身份时拒绝控制类工具。"""
        if actor is None or not actor.role:
            return {
                "ok": False,
                "message": "未绑定执行身份，禁止通过智能管家控制设备。请在通道配置中绑定 HomeOS 用户。",
            }
        try:
            await assert_command_proxy_authorized(
                dto,
                actor.to_auth_user(),
                self._child_mode,
                self._command_proxy_target_resolver(),
            )
            return {"ok": True}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "message": _error_message(exc) or "无权控制该设备"}

    # ------------------------------------------------------------------ #
    # schema / 执行入口
    # ------------------------------------------------------------------ #
    def get_tool_schemas(self) -> list[Any]:
        """返回暴露给 LLM 的工具 schema 列表（定义见 home_tools_schemas.py）。"""
        return build_home_tool_schemas()

    async def execute(
        self,
        name: str,
        args: dict[str, Any],
        actor: AgentActor | None = None,
    ) -> dict[str, Any]:
        """统一工具执行入口，按 name 分发到对应方法。

        对控制类工具（control_device / control_room / …）先做参数安全校验与实体 ACL。
        """
        if name in AGENT_CONTROL_TOOLS:
            if name == "control_device":
                id_check = validate_entity_id(_s(args.get("entity_id")))
                if not id_check["valid"]:
                    logger.warning("工具参数校验失败: %s", id_check.get("error"))
                    return {"success": False, "error": id_check.get("error")}
            # activate_scene 可选用 entity_id 精确指定；显式给出时必须格式合法，
            # 避免把「scene 名称」误当实体 ID 拼进 service 调用
            if name == "activate_scene" and args.get("entity_id") is not None and _s(
                args.get("entity_id")
            ).strip():
                id_check = validate_entity_id(_s(args.get("entity_id")))
                if not id_check["valid"]:
                    logger.warning("工具参数校验失败: %s", id_check.get("error"))
                    return {"success": False, "error": id_check.get("error")}
            if args.get("service_data"):
                args = {
                    **args,
                    "service_data": sanitize_service_data(args.get("service_data")),
                }

        if name == "search_entities":
            return await self._search_entities(_s(args.get("query")))
        if name == "get_entity_state":
            return self._get_entity_state(_s(args.get("entity_id")))
        if name == "control_device":
            return await self._control_device(args, actor)
        if name == "list_areas":
            return await self._list_areas()
        if name == "get_area_snapshot":
            return await self._get_area_snapshot(_s(args.get("area_id")))
        if name == "control_room":
            return await self._control_room(args, actor)
        if name == "activate_scene":
            return await self._activate_scene(args, actor)
        if name == "activate_home_mode":
            return await self._activate_home_mode(_s(args.get("name")), actor)
        if name == "get_home_status":
            return await self._get_home_status()
        if name == "get_weather":
            return await self._get_weather()
        if name == "get_calendar":
            return self._get_calendar()
        if name == "list_scenes":
            return await self._list_scenes_detailed()
        if name == "list_home_modes":
            return {"modes": await self._list_mode_names()}
        if name == "set_light_brightness":
            return await self._set_light_brightness(args, actor)
        if name == "set_cover_position":
            return await self._set_cover_position(args, actor)
        if name == "media_control":
            return await self._media_control(args, actor)
        if name == "query_camera":
            return self._query_camera(_s(args.get("entity_id")))
        return {"error": f"未知工具: {name}"}

    # ------------------------------------------------------------------ #
    # 搜索 / 查询
    # ------------------------------------------------------------------ #
    async def _search_entities(self, query: str) -> dict[str, Any]:
        """搜索设备：仅在 HomeOS 白名单内匹配（房间映射 + 常用监控列表 favoriteEntities）。"""
        lower = query.lower()
        try:
            areas = await self._area_service.find_all()
        except Exception as exc:  # noqa: BLE001
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
        except Exception:  # noqa: BLE001 - 布局读取失败不影响主流程
            pass

        # 在白名单内按关键词匹配
        matched: list[dict[str, Any]] = []
        for entity in self._state_store.get_all():
            entity_id = str(entity.get("entity_id") or "")
            if entity_id not in whitelist:
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

    def _get_entity_state(self, entity_id: str) -> dict[str, Any]:
        """查询单个设备的当前状态。"""
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

    # ------------------------------------------------------------------ #
    # 控制
    # ------------------------------------------------------------------ #
    async def _control_device(
        self,
        args: dict[str, Any],
        actor: AgentActor | None = None,
    ) -> dict[str, Any]:
        """控制单个设备。高危 denylist → 实体 ACL → CommandProxy。"""
        domain = _s(args.get("domain"))
        service = _s(args.get("service"))
        entity_id = _s(args.get("entity_id"))
        actual_domain = extract_domain(entity_id) or domain
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
        except Exception as exc:  # noqa: BLE001
            return {"success": False, "message": _error_message(exc, "控制失败")}

    async def _list_areas(self) -> dict[str, Any]:
        """列出所有房间。"""
        try:
            areas = await self._area_service.find_all()
            return {
                "areas": [
                    {"id": a.id, "name": a.name, "icon": a.icon} for a in (areas or [])
                ]
            }
        except Exception as exc:  # noqa: BLE001
            return {"error": f"房间列表加载失败: {_error_message(exc)}"}

    async def _get_area_snapshot(self, area_id_or_name: str) -> dict[str, Any]:
        """获取房间内所有设备的当前状态快照。

        温度 / 湿度传感器来源优先级：布局 mobileRoomStats → AppConfig 的 envSensorMap。
        """
        try:
            area = await self._area_service.find_one(area_id_or_name)
        except Exception:  # noqa: BLE001
            area = None
        # 精确 / 模糊名称匹配兜底
        if area is None:
            try:
                areas = await self._area_service.find_all()
            except Exception as exc:  # noqa: BLE001
                return {"error": f"房间列表加载失败: {_error_message(exc)}"}
            lower = area_id_or_name.lower().strip()
            area = next(
                (
                    a
                    for a in areas
                    if str(a.name).lower() == lower or lower in str(a.name).lower()
                ),
                None,
            )
            if area is not None:
                try:
                    area = await self._area_service.find_one(area.id)
                except Exception:  # noqa: BLE001 - 取不到时保留列表中的摘要
                    pass
        if area is None:
            return {"error": f"未找到房间「{area_id_or_name}」"}

        devices: list[dict[str, Any]] = []
        for ae in area.entities or []:
            entity = self._state_store.get(str(ae.entity_id))
            attributes = (
                entity.get("attributes") if isinstance(entity, dict) and isinstance(entity.get("attributes"), dict) else {}
            )
            devices.append(
                {
                    "entity_id": str(ae.entity_id),
                    "name": _or((attributes or {}).get("friendly_name"), str(ae.entity_id)),
                    "state": _or(entity.get("state") if entity else None, "unknown"),
                }
            )

        # 1) 先读布局里的 mobileRoomStats 配置的温度 / 湿度传感器
        temp: dict[str, str] | None = None
        humidity: dict[str, str] | None = None
        try:
            layout = await self._read_layout()
            stats = (layout or {}).get("mobileRoomStats") or {}
            room_stats = stats.get(area.id) if isinstance(stats, dict) else None
            if isinstance(room_stats, dict) and room_stats.get("temp"):
                te = self._state_store.get(str(room_stats["temp"]))
                if te:
                    temp = {"entity_id": str(room_stats["temp"]), "value": _s(te.get("state"))}
            if isinstance(room_stats, dict) and room_stats.get("humidity"):
                he = self._state_store.get(str(room_stats["humidity"]))
                if he:
                    humidity = {
                        "entity_id": str(room_stats["humidity"]),
                        "value": _s(he.get("state")),
                    }
        except Exception:  # noqa: BLE001
            pass

        # 2) 缺失时回退到 AppConfig 的 envSensorMap（按 area_id / label / 房间名匹配）
        if not temp or not humidity:
            from_env = self._resolve_env_sensors(area.id, area.name)
            if not temp and from_env["temp"]:
                temp = from_env["temp"]
            if not humidity and from_env["humidity"]:
                humidity = from_env["humidity"]

        return {
            "area": {"id": area.id, "name": area.name},
            "devices": devices,
            "sensors": {"temperature": temp, "humidity": humidity},
        }

    def _resolve_env_sensors(
        self, area_id: str, area_name: str
    ) -> dict[str, dict[str, str] | None]:
        """从 AppConfig 的 envSensorMap 解析房间的温湿度传感器（area_id → label → key）。"""
        try:
            mapping = self._app_config.get("envSensorMap") or {}
            if not isinstance(mapping, dict):
                return {"temp": None, "humidity": None}
            lower_name = str(area_name or "").lower().strip()
            entries = list(mapping.items())
            by_id = mapping.get(area_id)
            by_label = None
            for _, row in entries:
                if not isinstance(row, dict):
                    continue
                label = str(row.get("label") or "").lower().strip()
                if label and (label == lower_name or lower_name in label or label in lower_name):
                    by_label = row
                    break
            by_key = next(
                (row for key, row in entries if str(key).lower() == lower_name), None
            )
            entry = by_id if isinstance(by_id, dict) else (by_label or by_key)
            if not isinstance(entry, dict):
                return {"temp": None, "humidity": None}

            temp: dict[str, str] | None = None
            humidity: dict[str, str] | None = None
            if entry.get("temperature"):
                te = self._state_store.get(str(entry["temperature"]))
                if te:
                    temp = {"entity_id": str(entry["temperature"]), "value": _s(te.get("state"))}
            if entry.get("humidity"):
                he = self._state_store.get(str(entry["humidity"]))
                if he:
                    humidity = {
                        "entity_id": str(entry["humidity"]),
                        "value": _s(he.get("state")),
                    }
            return {"temp": temp, "humidity": humidity}
        except Exception:  # noqa: BLE001
            return {"temp": None, "humidity": None}

    async def _control_room(
        self,
        args: dict[str, Any],
        actor: AgentActor | None = None,
    ) -> dict[str, Any]:
        """按房间批量控制设备。支持“全屋”语义（遍历所有房间），单房间按名称 / ID 匹配。"""
        room_query = _s(args.get("room")).strip()
        domain = _s(args.get("domain")) if args.get("domain") else ""
        service = _s(args.get("service"))
        raw_data = args.get("service_data")
        service_data = raw_data if isinstance(raw_data, dict) else None

        if not room_query or not service:
            return {"error": "control_room 需要 room 和 service 参数"}

        try:
            areas = await self._area_service.find_all()
        except Exception as exc:  # noqa: BLE001
            return {"error": f"房间列表加载失败: {_error_message(exc)}"}

        if WHOLE_HOME_QUERY.search(room_query):
            rooms: list[dict[str, Any]] = []
            affected = 0
            total = 0
            for area in areas:
                result = await self._control_one_area(area, domain, service, service_data, actor)
                affected += int(result.get("affected") or 0)
                total += int(result.get("total") or 0)
                if int(result.get("total") or 0) > 0:
                    rooms.append(
                        {
                            "room": area.name,
                            "affected": int(result.get("affected") or 0),
                            "total": int(result.get("total") or 0),
                        }
                    )
            return {
                "scope": "全屋",
                "domain": domain or "all",
                "service": service,
                "affected": affected,
                "total": total,
                "rooms": rooms,
            }

        lower = room_query.lower()
        area = next((a for a in areas if a.id == room_query), None)
        if area is None:
            area = next((a for a in areas if str(a.name).lower() == lower), None)
        if area is None:
            area = next(
                (
                    a
                    for a in areas
                    if lower in str(a.name).lower() or str(a.name).lower() in lower
                ),
                None,
            )

        if area is None:
            return {
                "error": f"未找到房间「{room_query}」",
                "available_rooms": [a.name for a in areas],
            }
        return await self._control_one_area(area, domain, service, service_data, actor)

    async def _control_one_area(
        self,
        area: Any,
        domain: str,
        service: str,
        service_data: dict[str, Any] | None = None,
        actor: AgentActor | None = None,
    ) -> dict[str, Any]:
        """控制单个房间内的设备（按 domain 过滤），逐个下发并收集结果。"""
        # 调用方 find_all 已带 entities 时直接用；缺失再补一次 find_one
        entity_ids = [str(ae.entity_id) for ae in (area.entities or [])]
        if not entity_ids:
            try:
                full = await self._area_service.find_one(area.id)
            except Exception as exc:  # noqa: BLE001
                logger.warning("控制房间时加载区域失败 %s: %s", area.id, _error_message(exc))
                full = None
            entity_ids = [str(ae.entity_id) for ae in ((full.entities if full else None) or [])]
        if domain:
            entity_ids = [eid for eid in entity_ids if eid.startswith(f"{domain}.")]
        else:
            # 空 domain（“打开书房所有设备”）仅放行安全域，避免误触 switch / cover / 插座等潜在危险设备
            entity_ids = [
                eid for eid in entity_ids if get_entity_domain(eid) in SAFE_BULK_CONTROL_DOMAINS
            ]
        if not entity_ids:
            return {"room": area.name, "affected": 0, "total": 0, "results": []}

        results: list[dict[str, Any]] = []
        scene_voice = (
            await self._scene_voice_gate() if domain in ("scene", "script") else None
        )
        for entity_id in entity_ids:
            entity_domain = get_entity_domain(entity_id)
            risk = is_high_risk(entity_domain, service, entity_id, service_data, scene_voice)
            if risk.get("blocked"):
                logger.warning("房间控制中跳过高危设备: %s (%s)", entity_id, risk.get("reason"))
                results.append(
                    {
                        "entity_id": entity_id,
                        "ok": False,
                        "blocked": True,
                        "message": risk.get("reason"),
                    }
                )
                continue
            auth = await self._assert_actor_may_control(
                actor,
                {
                    "domain": entity_domain,
                    "service": service,
                    "entity_id": entity_id,
                    "service_data": service_data,
                },
            )
            if not auth.get("ok"):
                results.append(
                    {
                        "entity_id": entity_id,
                        "ok": False,
                        "blocked": True,
                        "message": auth.get("message"),
                    }
                )
                continue
            try:
                response = await self._command_proxy.call_service(
                    {
                        "domain": entity_domain,
                        "service": service,
                        "entity_id": entity_id,
                        "service_data": service_data,
                    }
                )
                results.append(
                    {"entity_id": entity_id, "ok": bool((response or {}).get("success"))}
                )
            except Exception as exc:  # noqa: BLE001
                results.append(
                    {"entity_id": entity_id, "ok": False, "message": _error_message(exc, "失败")}
                )

        ok_count = len([r for r in results if r.get("ok")])
        return {
            "room": area.name,
            "domain": domain or "all",
            "service": service,
            "affected": ok_count,
            "total": len(entity_ids),
            "results": results,
        }

    # ------------------------------------------------------------------ #
    # 布局
    # ------------------------------------------------------------------ #
    async def _read_layout(self) -> dict[str, Any]:
        """读取当前激活方案的布局配置并解析 layout 字段。"""
        cfg = self._ui_config.get_config(self._ui_config.resolve_active_project_id())
        layout, _ = self._ui_config.parse_layout_field(cfg.get("layout"))
        return layout

    # ------------------------------------------------------------------ #
    # 家庭模式
    # ------------------------------------------------------------------ #
    async def _activate_home_mode(
        self,
        name_or_id: str,
        actor: AgentActor | None = None,
    ) -> dict[str, Any]:
        """切换家庭模式工具。支持按名称（模糊）或 ID 解析模式。"""
        if not name_or_id or not name_or_id.strip():
            return {"error": "activate_home_mode 需要模式名称或 ID"}
        if actor is None or not actor.role:
            return {
                "success": False,
                "blocked": True,
                "message": "未绑定执行身份，禁止通过智能管家切换家庭模式。",
            }
        mode = await self._resolve_mode_by_name_or_id(name_or_id.strip())
        if mode is None:
            return {
                "error": f"未找到家庭模式「{name_or_id}」",
                "available_modes": await self._list_mode_names(),
            }
        try:
            await self._home_mode.activate(
                mode["id"],
                {
                    "source": "agent",
                    "reason": f"智能管家指令: {name_or_id.strip()}",
                    "actor": actor,
                },
            )
            return {"success": True, "mode": {"id": mode["id"], "name": mode["name"]}}
        except Exception as exc:  # noqa: BLE001
            return {"success": False, "message": _error_message(exc, "模式切换失败")}

    async def _resolve_mode_by_name_or_id(
        self, name_or_id: str
    ) -> dict[str, str] | None:
        """按名称（精确 / 包含）或 ID 解析家庭模式。"""
        try:
            direct = self._home_mode.find_one(name_or_id)
        except Exception:  # noqa: BLE001
            direct = None
        if direct:
            return {
                "id": _s(direct.get("id")),
                "name": _s(direct.get("name")) or name_or_id,
            }
        lower = name_or_id.lower()
        rows = self._query_modes_by_name(name_or_id)
        hit = next((r for r in rows if r["name"].lower() == lower), None)
        if hit is None:
            hit = next((r for r in rows if lower in r["name"].lower()), None)
        return hit

    def _query_modes_by_name(self, query: str) -> list[dict[str, str]]:
        """按名称模糊查询家庭模式（最多 5 条，对齐 Prisma contains insensitive）。"""
        try:
            with self._session_factory() as session:
                rows = session.execute(
                    select(HomeMode.id, HomeMode.name)
                    .where(HomeMode.name.ilike(f"%{query}%"))
                    .limit(5)
                ).all()
            return [{"id": str(row[0]), "name": str(row[1])} for row in rows]
        except Exception as exc:  # noqa: BLE001
            logger.warning("按名称查询家庭模式失败: %s", exc)
            return []

    async def _list_mode_names(self) -> list[str]:
        try:
            with self._session_factory() as session:
                names = (
                    session.execute(
                        select(HomeMode.name).order_by(HomeMode.sort_order.asc()).limit(20)
                    )
                    .scalars()
                    .all()
                )
            return [str(name) for name in names]
        except Exception as exc:  # noqa: BLE001
            logger.warning("读取家庭模式列表失败: %s", exc)
            return []

    # ------------------------------------------------------------------ #
    # 场景 / 脚本
    # ------------------------------------------------------------------ #
    async def _list_scenes_detailed(self) -> dict[str, Any]:
        """list_scenes 工具实现：列出 HA 侧 scene.* / script.* 清单。"""
        gate = await self._scene_voice_gate()
        ha_scenes = [
            {
                "entity_id": str(e.get("entity_id") or ""),
                "name": str(
                    _or(
                        (
                            (e.get("attributes") or {})
                            if isinstance(e.get("attributes"), dict)
                            else {}
                        ).get("friendly_name"),
                        e.get("entity_id"),
                    )
                ),
                "type": "script" if str(e.get("entity_id") or "").startswith("script.") else "scene",
                "allowed": is_scene_voice_allowed(
                    "script" if str(e.get("entity_id") or "").startswith("script.") else "scene",
                    str(e.get("entity_id") or ""),
                    gate,
                ),
            }
            for e in self._state_store.get_all()
            if str(e.get("entity_id") or "").startswith(("scene.", "script."))
        ]
        ha_scenes.sort(key=lambda item: item["name"])
        return {"ha_scenes": ha_scenes}

    async def _activate_scene(
        self,
        args: dict[str, Any],
        actor: AgentActor | None = None,
    ) -> dict[str, Any]:
        """activate_scene 工具实现：触发 HA 的 scene.* / script.*（白名单闸门 fail-closed）。"""
        query = _s(args.get("scene")).strip()
        explicit_id = _s(args.get("entity_id")).strip()
        if not query and not explicit_id:
            return {"success": False, "error": "activate_scene 需要 scene（名称）或 entity_id 参数"}
        if actor is None or not actor.role:
            return {
                "success": False,
                "blocked": True,
                "message": "未绑定执行身份，禁止通过智能管家执行场景。请在通道配置中绑定 HomeOS 用户。",
            }

        candidates = [
            e
            for e in self._state_store.get_all()
            if str(e.get("entity_id") or "").startswith(("scene.", "script."))
        ]

        hit = self._match_scene_entity(candidates, query, explicit_id)
        if hit is None:
            return {
                "success": False,
                "error": f"未找到场景「{query or explicit_id}」",
                "available_scenes": [
                    str(
                        _or(
                            (
                                (e.get("attributes") or {})
                                if isinstance(e.get("attributes"), dict)
                                else {}
                            ).get("friendly_name"),
                            e.get("entity_id"),
                        )
                    )
                    for e in candidates[:10]
                ],
            }

        entity_id = str(hit.get("entity_id") or "")
        domain = get_entity_domain(entity_id) or "scene"
        gate = await self._scene_voice_gate()
        if not is_scene_voice_allowed(domain, entity_id, gate):
            logger.warning("场景未在允许清单中,已拦截: %s", entity_id)
            return {
                "success": False,
                "blocked": True,
                "entity_id": entity_id,
                "message": (
                    "该场景未在「场景语音控制」允许清单中，出于安全考虑不能通过语音执行。"
                    "请到「设置 → 智能管家 → 场景语音」中启用并勾选该场景。"
                ),
            }

        auth = await self._assert_actor_may_control(
            actor, {"domain": domain, "service": "turn_on", "entity_id": entity_id}
        )
        if not auth.get("ok"):
            logger.warning("Agent ACL 拒绝: activate_scene %s (%s)", entity_id, auth.get("message"))
            return {"success": False, "blocked": True, "message": auth.get("message")}

        try:
            result = await self._command_proxy.call_service(
                {"domain": domain, "service": "turn_on", "entity_id": entity_id}
            )
            attributes = hit.get("attributes") if isinstance(hit.get("attributes"), dict) else {}
            return {
                "success": True,
                "entity_id": entity_id,
                "name": str(_or((attributes or {}).get("friendly_name"), entity_id)),
                "type": domain,
                "result": result,
            }
        except Exception as exc:  # noqa: BLE001
            return {"success": False, "message": _error_message(exc, "场景执行失败")}

    @staticmethod
    def _match_scene_entity(
        candidates: list[dict[str, Any]],
        query: str,
        explicit_id: str,
    ) -> dict[str, Any] | None:
        """在候选场景 / 脚本实体中解析用户意图，逐级放宽匹配条件。"""

        def name_of(entity: dict[str, Any]) -> str:
            attributes = entity.get("attributes") if isinstance(entity.get("attributes"), dict) else {}
            return str(
                _or((attributes or {}).get("friendly_name"), entity.get("entity_id"))
            ).lower()

        if explicit_id:
            exact = next(
                (
                    e
                    for e in candidates
                    if str(e.get("entity_id") or "").lower() == explicit_id.lower()
                ),
                None,
            )
            if exact is not None:
                return exact
        if not query:
            return None
        lower = query.lower()
        # 1) 实体 ID / friendly_name 精确匹配
        exact = next(
            (e for e in candidates if str(e.get("entity_id") or "").lower() == lower), None
        )
        if exact is None:
            exact = next((e for e in candidates if name_of(e) == lower), None)
        if exact is not None:
            return exact
        # 2) 剥离动作词与「场景 / 模式 / 脚本」后缀得到词干，再做包含匹配
        stem = SCENE_QUERY_ACTION_PREFIX.sub("", lower)
        stem = SCENE_QUERY_CATEGORY_SUFFIX.sub("", stem).strip()
        if stem:
            by_stem = next((e for e in candidates if name_of(e).endswith(stem)), None)
            if by_stem is None:
                by_stem = next((e for e in candidates if stem in name_of(e)), None)
            if by_stem is not None:
                return by_stem
        # 3) 原始关键词包含匹配
        return next((e for e in candidates if lower in name_of(e)), None)

    # ------------------------------------------------------------------ #
    # 状态 / 天气 / 日历
    # ------------------------------------------------------------------ #
    async def _get_home_status(self) -> dict[str, Any]:
        """全屋整体状态概览。"""
        try:
            try:
                active = self._home_mode.get_active()
            except Exception as exc:  # noqa: BLE001
                logger.warning("状态概览读取家庭模式失败: %s", _error_message(exc))
                active = None
            return {
                "active_mode": (
                    {"id": active.get("id"), "name": active.get("name")} if active else None
                ),
                "entity_count": len(self._state_store.get_all()),
            }
        except Exception as exc:  # noqa: BLE001
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
        except Exception as exc:  # noqa: BLE001
            return {"error": f"日历查询失败: {_error_message(exc)}"}

    # ------------------------------------------------------------------ #
    # 快捷控制工具
    # ------------------------------------------------------------------ #
    async def _set_light_brightness(
        self,
        args: dict[str, Any],
        actor: AgentActor | None = None,
    ) -> dict[str, Any]:
        entity_id = _s(args.get("entity_id"))
        try:
            brightness = float(args.get("brightness"))
        except (TypeError, ValueError):
            brightness = float("nan")
        if not entity_id.startswith("light."):
            return {"error": "entity_id 须为 light.*"}
        if brightness != brightness or brightness < 0 or brightness > 100:  # NaN 判定
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
        try:
            position = float(args.get("position"))
        except (TypeError, ValueError):
            position = float("nan")
        if not entity_id.startswith("cover."):
            return {"error": "entity_id 须为 cover.*"}
        if position != position or position < 0 or position > 100:  # NaN 判定
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
            try:
                volume = float(args.get("volume"))
            except (TypeError, ValueError):
                volume = 0.0
            if volume != volume:  # NaN → 对齐 JS Number(...) || 0
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

    def _query_camera(self, entity_id: str) -> dict[str, Any]:
        if not entity_id.startswith("camera."):
            return {"error": "entity_id 须为 camera.*"}
        return self._get_entity_state(entity_id)


__all__ = [
    "HomeToolsService",
    "MAX_ATTRIBUTE_VALUE_LENGTH",
    "SENSITIVE_ATTRIBUTE_KEYS",
    "sanitize_entity_attributes",
]
