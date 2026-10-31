"""智能管家工具集服务：宿主类（构造 / ACL 闸门 / schema / execute 分发）。

工具族见 ``home_tools_entities.py`` / ``home_tools_areas.py`` / ``home_tools_scenes.py``，
模块级原语见 ``home_tools_primitives.py``，宿主契约见 ``home_tools_base.py``。
"""

from __future__ import annotations

from typing import Any

from .high_risk_denylist import SceneVoiceControlGate
from .home_tools_areas import HomeToolsAreasMixin
from .home_tools_automation import AUTOMATION_TOOL_NAMES, HomeToolsAutomationMixin
from .home_tools_base import HomeToolsHost
from .home_tools_entities import HomeToolsEntitiesMixin
from .home_tools_insights import HomeToolsInsightsMixin
from .home_tools_primitives import (
    MAX_ATTRIBUTE_VALUE_LENGTH,
    SENSITIVE_ATTRIBUTE_KEYS,
    _error_message,
    _s,
    logger,
    sanitize_entity_attributes,
)
from .home_tools_scenes import HomeToolsScenesMixin
from .home_tools_schemas import build_home_tool_schemas
from .tool_args_validator import (
    extract_domain,
    sanitize_service_data,
    validate_entity_id,
)
from ..runtime.agent_actor import (
    AGENT_CONTROL_TOOLS,
    AgentActor,
)
from ..runtime.config_service import AgentConfigService
from ...proxy.command_proxy_auth import assert_command_proxy_authorized
from ....platform.core.json_field import object_field
from ....platform.security.entity_access import (
    is_entity_allowed,
    resolve_entity_restrictions,
)


class HomeToolsService(
    HomeToolsEntitiesMixin,
    HomeToolsAreasMixin,
    HomeToolsScenesMixin,
    HomeToolsInsightsMixin,
    HomeToolsAutomationMixin,
    HomeToolsHost,
):
    """家居工具集服务：get_tool_schemas 供 LLM 选择，execute 为统一执行入口。"""

    def __init__(
        self,
        state_store: Any,
        command_proxy: Any,
        area_service: Any,
        ui_config: Any,
        app_config: Any,
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
        self._ha_connector = ha_connector
        self._home_mode = home_mode
        self._session_factory = session_factory
        self._external_api = external_api
        self._agent_config = agent_config

    # 自动化族延迟绑定

    def bind_automation(
        self,
        *,
        scheduler: Any = None,
        policy: Any = None,
        timeline: Any = None,
        diagnostics: Any = None,
        web_search: Any = None,
        watchdog: Any = None,
    ) -> None:
        """注入自动化族依赖（装配层两阶段构造，避免与调度器 / 看门狗循环依赖）。"""
        self._scheduler = scheduler
        self._policy = policy
        self._timeline = timeline
        self._diagnostics = diagnostics
        self._web_search_service = web_search
        self._watchdog = watchdog

    def _mark_manual_control(self, entity_id: str, actor: Any = None) -> None:
        """记录本进程刚下发的控制命令，供时序服务把随后的翻转归因为手动操作。"""
        timeline = self._timeline
        if timeline is None or not entity_id:
            return
        try:
            timeline.mark_local_control(entity_id, actor)
        except Exception:
            logger.debug("记录本地控制标记失败: %s", entity_id, exc_info=True)

    # 场景语音白名单闸门 / ACL

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
        except Exception as exc:
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
                    and predicate(object_field(entity, "attributes"))
                ]

        return _Resolver()

    async def _assert_actor_may_control(
        self,
        actor: AgentActor | None,
        dto: dict[str, Any],
    ) -> dict[str, Any]:
        """与 HTTP /services/call 对齐的实体 ACL；无执行身份时拒绝控制类工具。"""
        if actor is None:
            return {
                "ok": False,
                "message": "未绑定执行身份，禁止通过智能管家控制设备。请在通道配置中绑定 HomeOS 用户。",
            }
        try:
            await assert_command_proxy_authorized(
                dto,
                actor.to_auth_user(),
                self._command_proxy_target_resolver(),
            )
            return {"ok": True}
        except Exception as exc:
            return {"ok": False, "message": _error_message(exc) or "无权控制该设备"}

    def snapshot_entities(self, entity_ids: list[str]) -> list[dict[str, Any]]:
        """记录实体当前状态（批量控制前调用，供撤销）。"""
        return self._snapshot_entities(entity_ids)

    # 读路径 ACL / 服务白名单
    @staticmethod
    def _read_restrictions(actor: AgentActor | None) -> list[str] | None:
        """读路径实体可见性（与 WS 推送 / HTTP 读接口同一模型）。

        - ``None``：不限制（未绑定身份，或白名单为空）；
        - ``[]``：看不到任何实体（白名单不匹配任何实体）；
        - ``[...]``：白名单前缀 / 精确 id / domain 列表。
        """
        return resolve_entity_restrictions(actor.to_auth_user() if actor is not None else None)

    def _read_denied(self, actor: AgentActor | None) -> dict[str, Any] | None:
        """整账号无任何可见实体时，直接给出明确拒绝结果（而不是空列表）。"""
        restrictions = self._read_restrictions(actor)
        if restrictions is not None and len(restrictions) == 0:
            return {"error": "当前账号没有可查看设备的权限，请联系管理员配置可见范围。"}
        return None

    def _may_read(self, entity_id: str, actor: AgentActor | None) -> bool:
        restrictions = self._read_restrictions(actor)
        if restrictions is None:
            return True
        return is_entity_allowed(entity_id, restrictions)

    def may_read_entity(self, entity_id: str, actor: AgentActor | None = None) -> bool:
        """读路径可见性判定（供 API / 诊断日志复用同一份 ACL 口径）。"""
        return self._may_read(entity_id, actor)

    @staticmethod
    def _service_whitelist_error(domain: str, service: str) -> dict[str, Any]:
        """服务白名单拒绝结果（与 HTTP /ha/services/call 同一份目录）。"""
        return {
            "success": False,
            "blocked": True,
            "message": (
                f"出于安全考虑，服务 {domain}.{service} 不在允许列表中，已拒绝执行。"
                "请改用受支持的动作（如 turn_on / turn_off / set_temperature）。"
            ),
        }

    # schema / 执行入口

    @staticmethod
    def _service_data_domain(name: str, args: dict[str, Any]) -> str:
        """推断 service_data 所属 domain（用于按域放行 ``code`` 等专属字段）。

        以实体 ID 的 domain 为准（与 ``_control_device`` 的高危判定同源），避免 LLM
        用伪造的 ``domain`` 参数把凭证字段带进其它域。
        """
        if name == "control_device":
            return extract_domain(_s(args.get("entity_id"))) or _s(args.get("domain"))
        if name == "control_room":
            return _s(args.get("domain"))
        return ""

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
                    "service_data": sanitize_service_data(
                        args.get("service_data"),
                        self._service_data_domain(name, args),
                    ),
                }

        if name == "search_entities":
            return await self._search_entities(_s(args.get("query")), actor)
        if name == "get_entity_state":
            return self._get_entity_state(_s(args.get("entity_id")), actor)
        if name == "control_device":
            return await self._control_device(args, actor)
        if name == "list_areas":
            return await self._list_areas()
        if name == "get_area_snapshot":
            return await self._get_area_snapshot(_s(args.get("area_id")), actor)
        if name == "control_room":
            return await self._control_room(args, actor)
        if name == "activate_scene":
            return await self._activate_scene(args, actor)
        if name == "activate_home_mode":
            return await self._activate_home_mode(_s(args.get("name")), actor)
        if name == "get_home_status":
            return await self._get_home_status(actor)
        if name == "get_weather":
            return await self._get_weather()
        if name == "get_weather_forecast":
            return await self._get_weather_forecast(args, actor)
        if name == "get_energy_usage":
            return await self._get_energy_usage(args, actor)
        if name == "query_events":
            return await self._query_events(args, actor)
        if name == "get_notifications":
            return await self._get_notifications(args, actor)
        if name == "get_calendar":
            return self._get_calendar()
        if name == "list_scenes":
            return await self._list_scenes_detailed(actor)
        if name == "list_home_modes":
            return {"modes": await self._list_mode_names()}
        device_ops = {
            "set_light_brightness": self._set_light_brightness,
            "set_cover_position": self._set_cover_position,
            "media_control": self._media_control,
        }
        device_op = device_ops.get(name)
        if device_op is not None:
            return await device_op(args, actor)
        if name == "query_camera":
            return self._query_camera(_s(args.get("entity_id")), actor)
        if name in AUTOMATION_TOOL_NAMES:
            return await self._automation_dispatch(name, args, actor)
        return {"error": f"未知工具: {name}"}

    # 搜索 / 查询


__all__ = [
    "MAX_ATTRIBUTE_VALUE_LENGTH",
    "SENSITIVE_ATTRIBUTE_KEYS",
    "HomeToolsService",
    "sanitize_entity_attributes",
]
