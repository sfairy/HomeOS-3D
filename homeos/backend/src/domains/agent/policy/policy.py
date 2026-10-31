"""智能管家「家规」：房间长期无人时的提醒 / 自动关停规则。

对齐 Nest ``AgentPolicyService``：

- 规则按「区域 + 目标域 + 空转阈值」匹配看门狗巡检结果；
- 创建 / 更新前做冲突检测（同区域、目标域有交集且都启用 → 会重复提醒 / 重复关停），
  调用方显式 ``force_override`` 才放行；
- 规则本身不带执行能力：命中后由看门狗调用 ``HomeToolsService.execute``，
  仍然经过实体 ACL、服务白名单与高危 denylist。

数据表见 ``platform.core.models.AgentPolicyRule``。
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select

from ....platform.core.db.db_exec import run_db
from ....platform.core.db.json_field import parse_json_array, read_json_object
from ....platform.core.db.models import AgentPolicyRule

logger = logging.getLogger("homeos.agent.policy")

#: 规则类型（目前只有看门狗空转）
KIND_WATCHDOG = "watchdog"
#: 空转阈值上下限（分钟）
MIN_IDLE_MINUTES = 1
MAX_IDLE_MINUTES = 1_440
#: 单条规则最多覆盖的设备域数量
MAX_TARGET_DOMAINS = 16
#: 规则条数上限：避免 LLM 无限创建把巡检拖慢
MAX_RULES = 100
#: 可被自动关停的低危域（与看门狗保持一致）
AUTO_CLOSE_DOMAINS = frozenset({"light", "switch", "fan", "climate"})


def _clamp_int(raw: Any, default: int, minimum: int, maximum: int) -> int:
    if isinstance(raw, bool):
        return default
    try:
        value = int(float(raw))
    except TypeError, ValueError:
        logger.debug("空转阈值不是数字，回退默认值 %s: %r", default, raw)
        return default
    return max(minimum, min(maximum, value))


def _domain_list(raw: Any) -> list[str]:
    """规范化目标域：只保留可自动关停的低危域，去重并限量。"""
    if isinstance(raw, str):
        raw = raw.replace("，", ",").split(",")
    items = raw if isinstance(raw, list) else []
    out: list[str] = []
    for item in items:
        domain = str(item or "").strip().lower()
        if domain in AUTO_CLOSE_DOMAINS and domain not in out:
            out.append(domain)
    return out[:MAX_TARGET_DOMAINS]


def serialize_rule(row: AgentPolicyRule) -> dict[str, Any]:
    """ORM → camelCase 字典（API / 工具 / 前端共用同一形状）。"""
    return {
        "id": row.id,
        "name": row.name,
        "description": row.description,
        "enabled": bool(row.enabled),
        "kind": row.kind,
        "areaId": row.area_id or "",
        "areaName": row.area_name or "",
        "targetDomains": parse_json_array(row.target_domains),
        "idleMinutes": int(row.idle_minutes or 0),
        "autoClose": bool(row.auto_close),
        "actionTool": row.action_tool or "",
        "actionArgs": read_json_object(row.action_args, {}),
        "updatedBy": read_json_object(getattr(row, "updated_by", None), {}),
        "lastTriggeredAt": (row.last_triggered_at.isoformat() if row.last_triggered_at is not None else None),
        "triggerCount": int(row.trigger_count or 0),
        "createdAt": row.created_at.isoformat() if row.created_at is not None else None,
        "updatedAt": row.updated_at.isoformat() if row.updated_at is not None else None,
    }


class AgentPolicyService:
    """家规 CRUD 与看门狗匹配（DB 不可用时全部降级为空结果）。"""

    def __init__(self, session_factory: Any = None) -> None:
        self._session_factory = session_factory

    # 读取
    def _load_rules(self, enabled_only: bool = False) -> list[AgentPolicyRule]:
        if self._session_factory is None:
            return []
        with self._session_factory() as session:
            query = select(AgentPolicyRule)
            if enabled_only:
                query = query.where(AgentPolicyRule.enabled.is_(True))
            return list(session.execute(query.order_by(AgentPolicyRule.created_at.desc())).scalars())

    async def list_rules(self, enabled_only: bool = False) -> list[dict[str, Any]]:
        """列出规则（最新在前）；数据库未就绪时返回空列表。"""
        try:
            rows = await run_db(self._load_rules, enabled_only)
        except Exception as exc:
            logger.warning("读取家规失败: %s", exc)
            return []
        return [serialize_rule(row) for row in rows]

    # 冲突检测
    @staticmethod
    def _find_conflicts(
        rules: list[AgentPolicyRule],
        *,
        area_id: str,
        domains: list[str],
        exclude_id: str = "",
    ) -> list[dict[str, Any]]:
        conflicts: list[dict[str, Any]] = []
        targets = set(domains)
        for row in rules:
            if not row.enabled or row.id == exclude_id:
                continue
            if (row.area_id or "") != area_id:
                continue
            existing = set(parse_json_array(row.target_domains))
            overlap = sorted(targets & existing)
            if not overlap:
                continue
            conflicts.append(
                {
                    "ruleId": row.id,
                    "ruleName": row.name,
                    "overlapDomains": overlap,
                    "reason": (
                        f"已有启用中的家规「{row.name or row.id}」覆盖同一区域的 "
                        f"{'/'.join(overlap)}，两条规则会重复提醒或重复关停"
                    ),
                }
            )
        return conflicts

    # 写入
    def _create_sync(self, payload: dict[str, Any], actor: Any, force_override: bool) -> dict[str, Any]:
        if self._session_factory is None:
            return {"ok": False, "message": "数据库未就绪，无法创建家规"}
        area_id = str(payload.get("areaId") or "").strip()[:128]
        domains = _domain_list(payload.get("targetDomains"))
        with self._session_factory() as session:
            existing = list(session.execute(select(AgentPolicyRule).where(AgentPolicyRule.enabled.is_(True))).scalars())
            if len(existing) >= MAX_RULES:
                return {"ok": False, "message": f"家规数量已达上限（{MAX_RULES} 条）"}
            conflicts = self._find_conflicts(existing, area_id=area_id, domains=domains)
            if conflicts and not force_override:
                return {
                    "ok": False,
                    "conflicts": conflicts,
                    "message": "家规与已存在的规则冲突，确认后可选择强制覆盖",
                }
            row = AgentPolicyRule(
                name=str(payload.get("name") or "").strip()[:128] or "未命名家规",
                description=str(payload.get("description") or "").strip()[:2000],
                enabled=payload.get("enabled") is not False,
                kind=KIND_WATCHDOG,
                area_id=area_id or None,
                area_name=str(payload.get("areaName") or "").strip()[:128],
                target_domains=_json_dump(domains or sorted(AUTO_CLOSE_DOMAINS)),
                idle_minutes=_clamp_int(payload.get("idleMinutes"), 0, 0, MAX_IDLE_MINUTES),
                auto_close=payload.get("autoClose") is True,
                action_tool=("control_device" if payload.get("autoClose") is True else ""),
                action_args=_json_dump(
                    {
                        "domain": (domains or sorted(AUTO_CLOSE_DOMAINS))[0],
                        "service": "turn_off",
                    }
                ),
                actor=_json_dump(actor_snapshot(actor)),
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            return {"ok": True, "rule": serialize_rule(row)}

    async def create_rule(
        self,
        payload: dict[str, Any],
        actor: Any = None,
        force_override: bool = False,
    ) -> dict[str, Any]:
        """创建家规；冲突且未强制覆盖时返回 ``ok=False`` + ``conflicts``。"""
        try:
            return await run_db(self._create_sync, payload, actor, force_override)
        except Exception as exc:
            logger.warning("创建家规失败: %s", exc)
            return {"ok": False, "message": f"创建家规失败: {exc}"}

    def _conflict_result(
        self,
        session: Any,
        rule_id: str,
        area_id: str,
        domains: list[str],
    ) -> dict[str, Any] | None:
        """更新 / 启用前的冲突查询：命中则返回统一的失败结果。"""
        others = list(session.execute(select(AgentPolicyRule).where(AgentPolicyRule.enabled.is_(True))).scalars())
        conflicts = self._find_conflicts(others, area_id=area_id, domains=domains, exclude_id=rule_id)
        if not conflicts:
            return None
        return {
            "ok": False,
            "conflicts": conflicts,
            "message": "家规与已存在的规则冲突，确认后可选择强制覆盖",
        }

    def _update_sync(
        self,
        rule_id: str,
        payload: dict[str, Any],
        force_override: bool,
        actor: Any = None,
    ) -> dict[str, Any]:
        if self._session_factory is None:
            return {"ok": False, "message": "数据库未就绪"}
        with self._session_factory() as session:
            row = session.execute(select(AgentPolicyRule).where(AgentPolicyRule.id == rule_id)).scalars().first()
            if row is None:
                return {"ok": False, "message": "家规不存在"}
            area_id = str(payload.get("areaId", row.area_id or "")).strip()[:128]
            domains = (
                _domain_list(payload.get("targetDomains"))
                if "targetDomains" in payload
                else parse_json_array(row.target_domains)
            )
            enabled = payload.get("enabled") is not False
            if enabled and not force_override:
                conflict = self._conflict_result(session, rule_id, area_id, domains)
                if conflict is not None:
                    return conflict
            self._apply_fields(row, payload, area_id, domains, enabled)
            touch_editor(row, actor)
            session.commit()
            session.refresh(row)
            return {"ok": True, "rule": serialize_rule(row)}

    @staticmethod
    def _apply_fields(
        row: AgentPolicyRule,
        payload: dict[str, Any],
        area_id: str,
        domains: list[str],
        enabled: bool,
    ) -> None:
        """把 payload 里显式给出的字段写到行上（未给出的保持原值）。"""
        if "name" in payload:
            row.name = str(payload.get("name") or "").strip()[:128] or row.name
        if "description" in payload:
            row.description = str(payload.get("description") or "").strip()[:2000]
        if "enabled" in payload:
            row.enabled = enabled
        if "areaId" in payload:
            row.area_id = area_id or None
            row.area_name = str(payload.get("areaName") or "").strip()[:128]
        if "targetDomains" in payload:
            row.target_domains = _json_dump(domains or sorted(AUTO_CLOSE_DOMAINS))
        if "idleMinutes" in payload:
            row.idle_minutes = _clamp_int(payload.get("idleMinutes"), 0, 0, MAX_IDLE_MINUTES)
        if "autoClose" in payload:
            row.auto_close = payload.get("autoClose") is True
            row.action_tool = "control_device" if row.auto_close else ""

    async def update_rule(
        self,
        rule_id: str,
        payload: dict[str, Any],
        force_override: bool = False,
        actor: Any = None,
    ) -> dict[str, Any]:
        """部分更新家规（只改传入字段）。"""
        try:
            return await run_db(self._update_sync, rule_id, payload, force_override, actor)
        except Exception as exc:
            logger.warning("更新家规失败: %s", exc)
            return {"ok": False, "message": f"更新家规失败: {exc}"}

    def _toggle_sync(self, rule_id: str, enabled: bool | None, actor: Any = None) -> dict[str, Any]:
        if self._session_factory is None:
            return {"ok": False, "message": "数据库未就绪"}
        with self._session_factory() as session:
            row = session.execute(select(AgentPolicyRule).where(AgentPolicyRule.id == rule_id)).scalars().first()
            if row is None:
                return {"ok": False, "message": "家规不存在"}
            row.enabled = (not bool(row.enabled)) if enabled is None else bool(enabled)
            if row.enabled:
                others = list(
                    session.execute(select(AgentPolicyRule).where(AgentPolicyRule.enabled.is_(True))).scalars()
                )
                conflicts = self._find_conflicts(
                    others,
                    area_id=row.area_id or "",
                    domains=parse_json_array(row.target_domains),
                    exclude_id=rule_id,
                )
                if conflicts:
                    # 启用是显式动作：冲突只提示，不阻断（用户已在列表里看到提示）
                    logger.info("启用家规时检测到冲突: %s", conflicts)
            touch_editor(row, actor)
            session.commit()
            session.refresh(row)
            return {"ok": True, "rule": serialize_rule(row)}

    async def toggle_rule(self, rule_id: str, enabled: bool | None = None, actor: Any = None) -> dict[str, Any]:
        """启用 / 停用（``enabled=None`` 表示取反）。"""
        try:
            return await run_db(self._toggle_sync, rule_id, enabled, actor)
        except Exception as exc:
            logger.warning("切换家规状态失败: %s", exc)
            return {"ok": False, "message": f"切换家规状态失败: {exc}"}

    def _delete_sync(self, rule_id: str, actor: Any = None) -> dict[str, Any]:
        if self._session_factory is None:
            return {"ok": False, "message": "数据库未就绪"}
        with self._session_factory() as session:
            row = session.execute(select(AgentPolicyRule).where(AgentPolicyRule.id == rule_id)).scalars().first()
            if row is None:
                return {"ok": False, "message": "家规不存在"}
            name = row.name
            session.delete(row)
            session.commit()
        # 记录已删，只能写日志留痕（表里不会再有这行）
        logger.info("删除家规 %s「%s」，操作者 %s", rule_id, name, actor_label(actor))
        return {"ok": True}

    async def delete_rule(self, rule_id: str, actor: Any = None) -> dict[str, Any]:
        """删除家规。"""
        try:
            return await run_db(self._delete_sync, rule_id, actor)
        except Exception as exc:
            logger.warning("删除家规失败: %s", exc)
            return {"ok": False, "message": f"删除家规失败: {exc}"}

    # 看门狗匹配
    async def match_watchdog_policy(
        self,
        area_id: str,
        domains: list[str] | None = None,
        idle_minutes: int = 0,
    ) -> list[dict[str, Any]]:
        """返回该区域当前命中的家规（目标域交集 + 空转阈值不超过实际无人时长）。"""
        wanted = set(domains or AUTO_CLOSE_DOMAINS)
        rules = await self.list_rules(enabled_only=True)
        matched: list[dict[str, Any]] = []
        for rule in rules:
            if rule.get("kind") != KIND_WATCHDOG:
                continue
            rule_area = str(rule.get("areaId") or "")
            if rule_area and rule_area != area_id:
                continue
            targets = set(rule.get("targetDomains") or [])
            if targets and not (targets & wanted):
                continue
            threshold = int(rule.get("idleMinutes") or 0)
            if threshold and threshold > idle_minutes:
                continue
            matched.append(rule)
        return matched

    async def touch_triggered(self, rule_ids: list[str]) -> None:
        """记录命中：触发次数 +1，最近触发时间刷新。"""
        if not rule_ids or self._session_factory is None:
            return
        try:
            await run_db(self._touch_sync, rule_ids)
        except Exception as exc:
            logger.debug("记录家规命中失败: %s", exc)

    def _touch_sync(self, rule_ids: list[str]) -> None:
        if self._session_factory is None:
            return
        with self._session_factory() as session:
            rows = list(session.execute(select(AgentPolicyRule).where(AgentPolicyRule.id.in_(rule_ids))).scalars())
            now = datetime.now(UTC)
            for row in rows:
                row.trigger_count = int(row.trigger_count or 0) + 1
                row.last_triggered_at = now
            session.commit()


def _json_dump(value: Any) -> str:
    import json

    return json.dumps(value, ensure_ascii=False)


def actor_snapshot(actor: Any) -> dict[str, Any]:
    """保存执行身份快照（创建者），执行期据此还原 ACL。"""
    if actor is None:
        return {}
    return {
        "userId": getattr(actor, "user_id", None),
        "username": getattr(actor, "username", None),
        "restrictions": getattr(actor, "restrictions", None),
    }


def actor_from_snapshot(snapshot: Any) -> Any:
    """从快照还原 ``AgentActor``；空快照返回 None（控制类工具会因此被拒绝）。"""
    from ..runtime.agent_actor import AgentActor

    data = snapshot if isinstance(snapshot, dict) else {}
    if not data.get("userId") and not data.get("username"):
        return None
    restrictions = data.get("restrictions")
    return AgentActor(
        restrictions=restrictions if isinstance(restrictions, list) else None,
        user_id=str(data.get("userId") or "") or None,
        username=str(data.get("username") or "") or None,
    )


def actor_label(actor: Any) -> str:
    """操作者可读标识（日志用）：优先用户名，其次 userId，未绑定身份时标注系统。"""
    if actor is None:
        return "系统"
    name = str(getattr(actor, "username", None) or "").strip()
    if name:
        return name
    return str(getattr(actor, "user_id", None) or "").strip() or "系统"


def touch_editor(row: Any, actor: Any) -> None:
    """写 ``updatedBy`` + ``updatedAt``：只做审计展示，不参与权限判定。

    未传操作者（LLM 工具 / 系统调用）时保留原值，避免把「系统"改成"最后编辑人」。
    """
    if actor is not None:
        row.updated_by = _json_dump(actor_snapshot(actor))
    row.updated_at = datetime.now(UTC)


__all__ = [
    "AUTO_CLOSE_DOMAINS",
    "MAX_RULES",
    "AgentPolicyService",
    "actor_from_snapshot",
    "actor_label",
    "actor_snapshot",
    "serialize_rule",
    "touch_editor",
]
