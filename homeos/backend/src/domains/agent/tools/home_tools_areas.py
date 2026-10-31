"""区域工具族：区域清单 / 区域快照 / 环境传感器 / 全屋与单区控制 / 布局读取。"""

from __future__ import annotations

from typing import Any

from .high_risk_denylist import (
    SAFE_BULK_CONTROL_DOMAINS,
    is_high_risk,
)
from .home_tools_base import HomeToolsHost
from .home_tools_primitives import (
    WHOLE_HOME_QUERY,
    _error_message,
    _or,
    _s,
    logger,
)
from ..runtime.agent_actor import AgentActor
from ....platform.core.entity.entity_domain import get_entity_domain
from ....platform.core.ha.ha_service_catalog import agent_service_allowed
from ....platform.security.entity_access import is_entity_allowed


def _allowed_sensor_entry(
    entity_id: str, reading: str, restrictions: Any
) -> dict[str, str] | None:
    """按读路径 ACL 过滤传感器：看不到的传感器不返回，避免间接泄露状态。"""
    if not entity_id or not reading:
        return None
    if restrictions is not None and not is_entity_allowed(entity_id, restrictions):
        return None
    return {"entity_id": entity_id, "value": reading}


class HomeToolsAreasMixin(HomeToolsHost):
    """区域工具族：区域清单 / 区域快照 / 环境传感器 / 全屋与单区控制 / 布局读取。"""

    async def _list_areas(self) -> dict[str, Any]:
        """列出所有房间。"""
        try:
            areas = await self._area_service.find_all()
            return {
                "areas": [
                    {"id": a.id, "name": a.name, "icon": a.icon} for a in (areas or [])
                ]
            }
        except Exception as exc:
            return {"error": f"房间列表加载失败: {_error_message(exc)}"}

    async def _resolve_named_area(
        self, area_id_or_name: str
    ) -> tuple[Any, dict[str, Any] | None]:
        """按 id / 名称解析房间；加载失败返回错误载荷，未命中返回 ``(None, None)``。"""
        try:
            area = await self._area_service.find_one(area_id_or_name)
        except Exception as exc:
            # 不能把「读取失败」当成「房间不存在」：否则磁盘 / 锁错误会被 Agent 讲成
            # 「你房间名写错了」，并给出一份误导性的可用房间列表。
            logger.warning(
                "按 id 解析房间失败，回退名称匹配: %s (%s)", area_id_or_name, _error_message(exc)
            )
            area = None
        # 精确 / 模糊名称匹配兜底
        if area is None:
            try:
                areas = await self._area_service.find_all()
            except Exception as exc:
                return None, {"error": f"房间列表加载失败: {_error_message(exc)}"}
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
                except Exception as exc:  # 区域详情取不到就退回已缓存字段，工具不因单点失败中断
                    logger.debug("房间详情加载失败，退回列表字段: %s (%s)", area.id, _error_message(exc))
        return area, None

    def _collect_area_devices(
        self, area: Any, restrictions: Any
    ) -> list[dict[str, Any]]:
        """采集房间内实体的当前状态快照（按读路径 ACL 过滤）。"""
        devices: list[dict[str, Any]] = []
        for ae in area.entities or []:
            entity_id = str(ae.entity_id)
            if restrictions is not None and not is_entity_allowed(entity_id, restrictions):
                continue
            entity = self._state_store.get(entity_id)
            attributes = (
                entity.get("attributes") if isinstance(entity, dict) and isinstance(entity.get("attributes"), dict) else {}
            )
            devices.append(
                {
                    "entity_id": entity_id,
                    "name": _or((attributes or {}).get("friendly_name"), entity_id),
                    "state": _or(entity.get("state") if entity else None, "unknown"),
                }
            )
        return devices

    async def _layout_room_sensors(
        self, area: Any, restrictions: Any
    ) -> tuple[dict[str, str] | None, dict[str, str] | None]:
        """从布局的 mobileRoomStats 读取温度 / 湿度传感器（含读路径 ACL）。"""
        temp: dict[str, str] | None = None
        humidity: dict[str, str] | None = None
        try:
            layout = await self._read_layout()
            stats = (layout or {}).get("mobileRoomStats") or {}
            room_stats = stats.get(area.id) if isinstance(stats, dict) else None
            if isinstance(room_stats, dict) and room_stats.get("temp"):
                te = self._state_store.get(str(room_stats["temp"]))
                if te:
                    temp = _allowed_sensor_entry(
                        str(room_stats["temp"]), _s(te.get("state")), restrictions
                    )
            if isinstance(room_stats, dict) and room_stats.get("humidity"):
                he = self._state_store.get(str(room_stats["humidity"]))
                if he:
                    humidity = _allowed_sensor_entry(
                        str(room_stats["humidity"]), _s(he.get("state")), restrictions
                    )
        except Exception:  # 温湿度是可选补充信息，缺失不影响区域摘要
            pass
        return temp, humidity

    def _env_sensor_fallback(
        self,
        area: Any,
        restrictions: Any,
        temp: dict[str, str] | None,
        humidity: dict[str, str] | None,
    ) -> tuple[dict[str, str] | None, dict[str, str] | None]:
        """布局缺失时的回退：从 AppConfig 的 envSensorMap 解析（按 area_id / label / 房间名匹配）。"""
        from_env = self._resolve_env_sensors(area.id, area.name)
        if not temp and from_env["temp"]:
            temp = _allowed_sensor_entry(
                str(from_env["temp"].get("entity_id") or ""),
                str(from_env["temp"].get("value") or ""),
                restrictions,
            )
        if not humidity and from_env["humidity"]:
            humidity = _allowed_sensor_entry(
                str(from_env["humidity"].get("entity_id") or ""),
                str(from_env["humidity"].get("value") or ""),
                restrictions,
            )
        return temp, humidity

    async def _get_area_snapshot(
        self, area_id_or_name: str, actor: AgentActor | None = None
    ) -> dict[str, Any]:
        """获取房间内所有设备的当前状态快照。

        温度 / 湿度传感器来源优先级：布局 mobileRoomStats → AppConfig 的 envSensorMap。
        读路径 ACL：受限账号看不到白名单外实体（含温湿度传感器来源实体）。
        """
        denied = self._read_denied(actor)
        if denied is not None:
            return denied
        restrictions = self._read_restrictions(actor)
        area, area_error = await self._resolve_named_area(area_id_or_name)
        if area_error is not None:
            return area_error
        if area is None:
            return {"error": f"未找到房间「{area_id_or_name}」"}

        devices = self._collect_area_devices(area, restrictions)
        temp, humidity = await self._layout_room_sensors(area, restrictions)
        if not temp or not humidity:
            temp, humidity = self._env_sensor_fallback(area, restrictions, temp, humidity)

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
        except Exception:
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
        except Exception as exc:
            return {"error": f"房间列表加载失败: {_error_message(exc)}"}

        if WHOLE_HOME_QUERY.search(room_query):
            rooms: list[dict[str, Any]] = []
            snapshot: list[dict[str, Any]] = []
            affected = 0
            total = 0
            for area in areas:
                result = await self._control_one_area(area, domain, service, service_data, actor)
                affected += int(result.get("affected") or 0)
                total += int(result.get("total") or 0)
                snapshot.extend(result.get("snapshot") or [])
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
                "snapshot": snapshot,
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

    async def _resolve_area_entity_ids(self, area: Any, domain: str) -> list[str]:
        """取房间内要下发的实体 id：缺 entities 时补一次 find_one，再按 domain 过滤。"""
        # 调用方 find_all 已带 entities 时直接用；缺失再补一次 find_one
        entity_ids = [str(ae.entity_id) for ae in (area.entities or [])]
        if not entity_ids:
            try:
                full = await self._area_service.find_one(area.id)
            except Exception as exc:
                logger.warning("控制房间时加载区域失败 %s: %s", area.id, _error_message(exc))
                full = None
            entity_ids = [str(ae.entity_id) for ae in ((full.entities if full else None) or [])]
        if domain:
            return [eid for eid in entity_ids if eid.startswith(f"{domain}.")]
        # 空 domain（“打开书房所有设备”）仅放行安全域，避免误触 switch / cover / 插座等潜在危险设备
        return [
            eid for eid in entity_ids if get_entity_domain(eid) in SAFE_BULK_CONTROL_DOMAINS
        ]

    async def _execute_area_entity(
        self,
        entity_id: str,
        domain: str,
        service: str,
        actor: AgentActor | None,
        command_context: dict[str, Any],
    ) -> dict[str, Any]:
        """对单个实体做白名单 / 高危 / ACL 校验后下发，返回一条结果。"""
        service_data = command_context.get("serviceData")
        scene_voice = command_context.get("sceneVoice")
        entity_domain = get_entity_domain(entity_id)
        # 服务白名单：与 _control_device 同源（domain 可能来自实体本身）
        if not agent_service_allowed(entity_domain, service):
            logger.warning("房间控制中服务不在白名单: %s.%s (%s)", entity_domain, service, entity_id)
            return {
                "entity_id": entity_id,
                "ok": False,
                "blocked": True,
                "message": self._service_whitelist_error(entity_domain, service)["message"],
            }
        risk = is_high_risk(entity_domain, service, entity_id, service_data, scene_voice)
        if risk.get("blocked"):
            logger.warning("房间控制中跳过高危设备: %s (%s)", entity_id, risk.get("reason"))
            return {
                "entity_id": entity_id,
                "ok": False,
                "blocked": True,
                "message": risk.get("reason"),
            }
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
            return {
                "entity_id": entity_id,
                "ok": False,
                "blocked": True,
                "message": auth.get("message"),
            }
        try:
            response = await self._command_proxy.call_service(
                {
                    "domain": entity_domain,
                    "service": service,
                    "entity_id": entity_id,
                    "service_data": service_data,
                }
            )
            return {"entity_id": entity_id, "ok": bool((response or {}).get("success"))}
        except Exception as exc:
            return {"entity_id": entity_id, "ok": False, "message": _error_message(exc, "失败")}

    def _snapshot_entities(self, entity_ids: list[str]) -> list[dict[str, Any]]:
        """批量控制前记录实体状态，供「撤销刚才的操作」反向执行。"""
        snapshot: list[dict[str, Any]] = []
        for entity_id in entity_ids:
            entity = self._state_store.get(entity_id)
            if not isinstance(entity, dict):
                continue
            attributes = entity.get("attributes")
            attrs = attributes if isinstance(attributes, dict) else {}
            snapshot.append(
                {
                    "entity_id": entity_id,
                    "domain": get_entity_domain(entity_id),
                    "state": _s(entity.get("state")),
                    "brightness": attrs.get("brightness"),
                    "current_position": attrs.get("current_position"),
                }
            )
        return snapshot

    async def _control_one_area(
        self,
        area: Any,
        domain: str,
        service: str,
        service_data: dict[str, Any] | None = None,
        actor: AgentActor | None = None,
    ) -> dict[str, Any]:
        """控制单个房间内的设备（按 domain 过滤），逐个下发并收集结果。"""
        entity_ids = await self._resolve_area_entity_ids(area, domain)
        if not entity_ids:
            return {"room": area.name, "affected": 0, "total": 0, "results": [], "snapshot": []}

        snapshot = self._snapshot_entities(entity_ids)
        scene_voice = (
            await self._scene_voice_gate() if domain in ("scene", "script") else None
        )
        command_context = {"serviceData": service_data, "sceneVoice": scene_voice}
        results: list[dict[str, Any]] = [
            await self._execute_area_entity(entity_id, domain, service, actor, command_context)
            for entity_id in entity_ids
        ]

        ok_count = len([entry for entry in results if entry.get("ok")])
        return {
            "room": area.name,
            "domain": domain or "all",
            "service": service,
            "affected": ok_count,
            "total": len(entity_ids),
            "results": results,
            "snapshot": snapshot,
        }

    # 布局

    async def _read_layout(self) -> dict[str, Any]:
        """读取当前激活方案的布局配置并解析 layout 字段。"""
        cfg = self._ui_config.get_config(self._ui_config.resolve_active_project_id())
        layout, _ = self._ui_config.parse_layout_field(cfg.get("layout"))
        return layout

    # 家庭模式
