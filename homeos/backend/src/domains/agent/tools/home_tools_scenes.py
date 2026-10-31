"""场景与模式工具族：家庭模式激活 / 模式名解析 / 场景清单 / 场景激活 / 实体匹配。"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select

from .high_risk_denylist import is_scene_voice_allowed
from .home_tools_base import HomeToolsHost
from .home_tools_primitives import (
    SCENE_QUERY_ACTION_PREFIX,
    SCENE_QUERY_CATEGORY_SUFFIX,
    _error_message,
    _or,
    _s,
    logger,
)
from ..runtime.agent_actor import AgentActor
from ....platform.core.db.db_exec import run_db
from ....platform.core.db.json_field import object_field
from ....platform.core.db.models import HomeMode
from ....platform.core.entity.entity_domain import get_entity_domain


class HomeToolsScenesMixin(HomeToolsHost):
    """场景与模式工具族：家庭模式激活 / 模式名解析 / 场景清单 / 场景激活 / 实体匹配。"""

    async def _activate_home_mode(
        self,
        name_or_id: str,
        actor: AgentActor | None = None,
    ) -> dict[str, Any]:
        """切换家庭模式工具。支持按名称（模糊）或 ID 解析模式。"""
        if not name_or_id or not name_or_id.strip():
            return {"error": "activate_home_mode 需要模式名称或 ID"}
        if actor is None:
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
            # meta.actor 必须是 dict：activate_home_mode 会用它做实体级 ACL
            # （entity_execute_acl.assert_entity_targets_execute_authorized 调 actor.get(...)）。
            # 传 AgentActor 数据类会 AttributeError，导致模式切换必然失败。
            await self._home_mode.activate(
                mode["id"],
                {
                    "source": "agent",
                    "reason": f"智能管家指令: {name_or_id.strip()}",
                    "actor": actor.to_auth_user(),
                },
            )
            return {"success": True, "mode": {"id": mode["id"], "name": mode["name"]}}
        except Exception as exc:
            return {"success": False, "message": _error_message(exc, "模式切换失败")}

    async def _resolve_mode_by_name_or_id(
        self, name_or_id: str
    ) -> dict[str, str] | None:
        """按名称（精确 / 包含）或 ID 解析家庭模式。"""
        try:
            direct = await run_db(self._home_mode.find_one, name_or_id)
        except Exception:
            direct = None
        if direct:
            return {
                "id": _s(direct.get("id")),
                "name": _s(direct.get("name")) or name_or_id,
            }
        lower = name_or_id.lower()
        rows = await run_db(self._query_modes_by_name, name_or_id)
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
        except Exception as exc:
            logger.warning("按名称查询家庭模式失败: %s", exc)
            return []

    async def _list_mode_names(self) -> list[str]:
        try:
            return await run_db(self._query_mode_names)
        except Exception as exc:
            logger.warning("读取家庭模式列表失败: %s", exc)
            return []

    def _query_mode_names(self) -> list[str]:
        with self._session_factory() as session:
            names = (
                session.execute(
                    select(HomeMode.name).order_by(HomeMode.sort_order.asc()).limit(20)
                )
                .scalars()
                .all()
            )
        return [str(name) for name in names]

    # 场景 / 脚本

    async def _list_scenes_detailed(self, actor: AgentActor | None = None) -> dict[str, Any]:
        """list_scenes 工具实现：列出 HA 侧 scene.* / script.* 清单（走读 ACL）。"""
        denied = self._read_denied(actor)
        if denied is not None:
            return denied
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
            and self._may_read(str(e.get("entity_id") or ""), actor)
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
        if actor is None:
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
            attributes = object_field(hit, "attributes")
            return {
                "success": True,
                "entity_id": entity_id,
                "name": str(_or((attributes or {}).get("friendly_name"), entity_id)),
                "type": domain,
                "result": result,
            }
        except Exception as exc:
            return {"success": False, "message": _error_message(exc, "场景执行失败")}

    @staticmethod

    def _match_scene_entity(
        candidates: list[dict[str, Any]],
        query: str,
        explicit_id: str,
    ) -> dict[str, Any] | None:
        """在候选场景 / 脚本实体中解析用户意图，逐级放宽匹配条件。"""

        def name_of(entity: dict[str, Any]) -> str:
            attributes = object_field(entity, "attributes")
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

    # 状态 / 天气 / 日历
