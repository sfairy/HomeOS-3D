"""学习配置存储：别名与房间默认设备。

所有写操作都在**一个事务**里完成「CAS 更新 + 审计追加」：

- 更新用 ``WHERE id = ? AND revision = ?``，``rowcount == 0`` 视为并发冲突；
- 审计记录 ``fromRevision / toRevision / fromEntityId / toEntityId``，
  回滚时按 ``expectedRevision`` 精确回放，绝不覆盖用户后续的人工修改。

读取（``resolve_alias`` / ``expand_aliases``）走进程内短 TTL 缓存：
快路径每轮都要展开别名，直接查 SQLite 会把一次对话变成十几次磁盘读。
"""

from __future__ import annotations

import json
import logging
import threading
import time
from typing import Any

from sqlalchemy import select, update

from .schema import (
    ACTION_CREATE,
    ACTION_DELETE,
    ACTION_PAUSE,
    ACTION_RESUME,
    ACTION_REVERT,
    ACTION_UPDATE,
    KIND_ALIAS,
    KIND_AREA_DEFAULT,
    AgentLearningAudit,
    AgentLearningConfig,
)

logger = logging.getLogger("homeos.agent.learning")

#: 别名 / 房间默认的读取缓存 TTL（秒）。写入会显式失效，因此这里只影响跨进程场景。
CACHE_TTL_SECONDS = 30
#: 单次展开最多替换的别名条数（防御超长文本）。
MAX_EXPAND_ALIASES = 200


def _iso_now() -> str:
    from datetime import UTC, datetime

    return datetime.now(UTC).isoformat()


class LearningStore:
    """学习配置的读写入口（同步；调用方按需 ``asyncio.to_thread``）。"""

    def __init__(self, session_factory: Any) -> None:
        self._session_factory = session_factory
        self._cache: dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    # ------------------------------------------------------------------ 读取
    def resolve_alias(self, alias: str, scope: str = "household") -> str | None:
        key = str(alias or "").strip().lower()
        if not key:
            return None
        rows = self._alias_rows(scope)
        return rows.get(key)

    def resolve_area_default(self, area_id: str, domain: str, scope: str | None = None) -> str | None:
        area = str(area_id or "").strip()
        domain_key = str(domain or "").strip()
        if not area or not domain_key:
            return None
        config_key = f"{area}:{domain_key}".lower()
        row = self._area_rows(scope or "household").get(config_key)
        return row

    def expand_aliases(self, text: str, scope: str = "household") -> str:
        """把文本里的别名替换成实体 ID（长别名优先，避免「客厅灯」吃掉「客厅灯带」）。"""
        source = str(text or "")
        rows = self._alias_rows(scope)
        if not source or not rows:
            return source
        expanded = source
        for alias in sorted(rows, key=len, reverse=True)[:MAX_EXPAND_ALIASES]:
            if alias and alias in expanded.lower():
                # 大小写不敏感替换：用正则转义，避免别名里的字符被当成元字符。
                import re

                expanded = re.sub(re.escape(alias), rows[alias], expanded, flags=re.IGNORECASE)
        return expanded

    def list_configs(self, scope: str | None = None) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            query = select(AgentLearningConfig).order_by(AgentLearningConfig.updated_at.desc())
            if scope:
                query = query.where(AgentLearningConfig.scope_key == scope)
            rows = session.scalars(query).all()
            return [_row(row) for row in rows]

    def audit(self, config_id: str, limit: int = 50) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            rows = session.scalars(
                select(AgentLearningAudit)
                .where(AgentLearningAudit.config_id == config_id)
                .order_by(AgentLearningAudit.created_at.desc())
                .limit(max(1, min(int(limit or 50), 200)))
            ).all()
            return [
                {
                    "id": row.id,
                    "action": row.action,
                    "fromRevision": row.from_revision,
                    "toRevision": row.to_revision,
                    "fromEntityId": row.from_entity_id,
                    "toEntityId": row.to_entity_id,
                    "executionId": row.execution_id,
                    "actor": row.actor,
                    "createdAt": row.created_at.isoformat() if row.created_at else None,
                }
                for row in rows
            ]

    # ------------------------------------------------------------------ 写入
    def teach_alias(
        self,
        alias: str,
        entity_id: str,
        *,
        scope: str = "household",
        actor: str | None = None,
        execution_id: str | None = None,
    ) -> dict[str, Any]:
        key = str(alias or "").strip().lower()
        target = str(entity_id or "").strip()
        if not key or not target:
            return {"success": False, "message": "别名与实体都不能为空。"}
        if len(key) > 60:
            return {"success": False, "message": "别名过长（最多 60 字）。"}
        return self._upsert(KIND_ALIAS, key, target, scope=scope, actor=actor, execution_id=execution_id)

    def teach_area_default(
        self,
        area_id: str,
        domain: str,
        entity_id: str,
        *,
        scope: str | None = None,
        actor: str | None = None,
        execution_id: str | None = None,
    ) -> dict[str, Any]:
        area = str(area_id or "").strip()
        domain_key = str(domain or "").strip().lower()
        target = str(entity_id or "").strip()
        if not area or not domain_key or not target:
            return {"success": False, "message": "房间、域与实体都不能为空。"}
        return self._upsert(
            KIND_AREA_DEFAULT,
            f"{area}:{domain_key}".lower(),
            target,
            scope=scope or "household",
            actor=actor,
            execution_id=execution_id,
            value={"areaId": area, "domain": domain_key},
        )

    def set_active(self, config_id: str, active: bool, *, actor: str | None = None) -> dict[str, Any]:
        return self._mutate_active(config_id, active, actor=actor)

    def delete(self, config_id: str, *, actor: str | None = None) -> dict[str, Any]:
        with self._session_factory() as session:
            row = session.get(AgentLearningConfig, config_id)
            if row is None:
                return {"success": False, "message": "没有找到这条学习配置。"}
            session.add(
                AgentLearningAudit(
                    config_id=config_id,
                    action=ACTION_DELETE,
                    from_revision=row.revision,
                    to_revision=row.revision,
                    from_entity_id=row.entity_id,
                    to_entity_id=None,
                    actor=actor,
                )
            )
            session.delete(row)
            session.commit()
        self._invalidate()
        return {"success": True, "deleted": config_id}

    def revert(
        self, config_id: str, expected_revision: int | None = None, *, actor: str | None = None
    ) -> dict[str, Any]:
        """回滚到上一条 CREATE/UPDATE 审计记录。"""
        with self._session_factory() as session:
            row = session.get(AgentLearningConfig, config_id)
            if row is None:
                return {"success": False, "message": "没有找到这条学习配置。"}
            if expected_revision is not None and int(expected_revision) != int(row.revision):
                return {
                    "success": False,
                    "conflict": True,
                    "message": "配置已被其他操作修改，请刷新后再试。",
                    "revision": row.revision,
                }
            previous = session.scalars(
                select(AgentLearningAudit)
                .where(
                    AgentLearningAudit.config_id == config_id,
                    AgentLearningAudit.action.in_((ACTION_CREATE, ACTION_UPDATE, ACTION_REVERT)),
                )
                .order_by(AgentLearningAudit.created_at.desc())
                .limit(1)
            ).first()
            if previous is None or not previous.from_entity_id:
                # 没有任何历史版本时**不能**把记录删掉：用户点「回滚」期望的是
                # 恢复到上一版，不是删数据。首次创建的记录没有上一版，直接拒绝。
                return {
                    "success": False,
                    "message": "这条学习没有可回滚的历史版本（首次创建）。",
                    "revision": row.revision,
                }
            from_revision = int(row.revision)
            old_entity = row.entity_id
            row.entity_id = previous.from_entity_id
            row.revision = from_revision + 1
            session.add(
                AgentLearningAudit(
                    config_id=config_id,
                    action=ACTION_REVERT,
                    from_revision=from_revision,
                    to_revision=row.revision,
                    from_entity_id=old_entity,
                    to_entity_id=row.entity_id,
                    actor=actor,
                )
            )
            session.commit()
            result = _row(row)
        self._invalidate()
        return {"success": True, "reverted": "updated", "config": result}

    # ------------------------------------------------------------------ 内部
    def _upsert(
        self,
        kind: str,
        config_key: str,
        entity_id: str,
        *,
        scope: str,
        actor: str | None,
        execution_id: str | None,
        value: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        value_json = json.dumps(value, ensure_ascii=False) if value else None
        with self._session_factory() as session:
            existing = session.scalars(
                select(AgentLearningConfig).where(
                    AgentLearningConfig.scope_key == scope,
                    AgentLearningConfig.kind == kind,
                    AgentLearningConfig.config_key == config_key,
                )
            ).first()
            if existing is None:
                row = AgentLearningConfig(
                    scope_key=scope,
                    kind=kind,
                    config_key=config_key,
                    entity_id=entity_id,
                    value_json=value_json,
                    revision=1,
                )
                session.add(row)
                session.flush()
                session.add(
                    AgentLearningAudit(
                        config_id=row.id,
                        action=ACTION_CREATE,
                        from_revision=0,
                        to_revision=1,
                        from_entity_id=None,
                        to_entity_id=entity_id,
                        execution_id=execution_id,
                        actor=actor,
                    )
                )
                session.commit()
                result = _row(row)
                self._invalidate()
                return {"success": True, "created": True, "config": result}
            from_revision = int(existing.revision)
            from_entity = existing.entity_id
            result = session.execute(
                update(AgentLearningConfig)
                .where(
                    AgentLearningConfig.id == existing.id,
                    AgentLearningConfig.revision == from_revision,
                )
                .values(
                    entity_id=entity_id,
                    value_json=value_json,
                    is_active=True,
                    revision=from_revision + 1,
                    updated_at=_naive_now(),
                )
            )
            if result.rowcount == 0:
                session.rollback()
                return {"success": False, "conflict": True, "message": "并发修改冲突，请重试。"}
            session.add(
                AgentLearningAudit(
                    config_id=existing.id,
                    action=ACTION_UPDATE,
                    from_revision=from_revision,
                    to_revision=from_revision + 1,
                    from_entity_id=from_entity,
                    to_entity_id=entity_id,
                    execution_id=execution_id,
                    actor=actor,
                )
            )
            session.commit()
            session.refresh(existing)
            result_row = _row(existing)
        self._invalidate()
        return {"success": True, "created": False, "config": result_row}

    def _mutate_active(self, config_id: str, active: bool, *, actor: str | None) -> dict[str, Any]:
        with self._session_factory() as session:
            row = session.get(AgentLearningConfig, config_id)
            if row is None:
                return {"success": False, "message": "没有找到这条学习配置。"}
            from_revision = int(row.revision)
            result = session.execute(
                update(AgentLearningConfig)
                .where(
                    AgentLearningConfig.id == config_id,
                    AgentLearningConfig.revision == from_revision,
                )
                .values(
                    is_active=bool(active),
                    revision=from_revision + 1,
                    updated_at=_naive_now(),
                )
            )
            if result.rowcount == 0:
                session.rollback()
                return {"success": False, "conflict": True, "message": "并发修改冲突，请重试。"}
            session.add(
                AgentLearningAudit(
                    config_id=config_id,
                    action=ACTION_RESUME if active else ACTION_PAUSE,
                    from_revision=from_revision,
                    to_revision=from_revision + 1,
                    from_entity_id=row.entity_id,
                    to_entity_id=row.entity_id,
                    actor=actor,
                )
            )
            session.commit()
            session.refresh(row)
            payload = _row(row)
        self._invalidate()
        return {"success": True, "config": payload}

    def _alias_rows(self, scope: str) -> dict[str, str]:
        cached = self._cached(f"alias:{scope}")
        if cached is not None:
            return cached
        with self._session_factory() as session:
            rows = session.scalars(
                select(AgentLearningConfig).where(
                    AgentLearningConfig.kind == KIND_ALIAS,
                    AgentLearningConfig.is_active.is_(True),
                    AgentLearningConfig.scope_key.in_((scope, "household")),
                )
            ).all()
            mapping = {row.config_key: row.entity_id for row in rows}
        self._store_cache(f"alias:{scope}", mapping)
        return mapping

    def _area_rows(self, scope: str) -> dict[str, str]:
        cached = self._cached(f"area:{scope}")
        if cached is not None:
            return cached
        with self._session_factory() as session:
            rows = session.scalars(
                select(AgentLearningConfig).where(
                    AgentLearningConfig.kind == KIND_AREA_DEFAULT,
                    AgentLearningConfig.is_active.is_(True),
                    AgentLearningConfig.scope_key.in_((scope, "household")),
                )
            ).all()
            mapping = {row.config_key: row.entity_id for row in rows}
        self._store_cache(f"area:{scope}", mapping)
        return mapping

    def _cached(self, key: str) -> Any | None:
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                return None
            expires_at, value = entry
            if expires_at <= time.monotonic():
                self._cache.pop(key, None)
                return None
            return value

    def _store_cache(self, key: str, value: Any) -> None:
        with self._lock:
            self._cache[key] = (time.monotonic() + CACHE_TTL_SECONDS, value)

    def _invalidate(self) -> None:
        with self._lock:
            self._cache.clear()


def _naive_now():
    from datetime import UTC, datetime

    return datetime.now(UTC).replace(tzinfo=None)


def _row(row: AgentLearningConfig) -> dict[str, Any]:
    value: Any = None
    if row.value_json:
        try:
            value = json.loads(row.value_json)
        except (TypeError, ValueError):  # fmt: skip
            value = None
    return {
        "id": row.id,
        "scope": row.scope_key,
        "kind": row.kind,
        "key": row.config_key,
        "entityId": row.entity_id,
        "value": value,
        "isActive": bool(row.is_active),
        "revision": int(row.revision),
        "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
    }


__all__ = ["CACHE_TTL_SECONDS", "LearningStore"]
