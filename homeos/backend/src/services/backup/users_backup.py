"""用户备份服务（对齐 ``modules/system/backup/users-backup.service.ts``）。

负责系统用户（admin/adult/child/guest）的导出与导入，是完整备份包的 users 分区提供方。

关键策略：
- 导出附 ``kind=homeos-users``，含 username / role / preferences / tokenVersion / createdAt；
- 导入时角色不合法回退到 adult；
- **登录凭据唯一权威是** ``users.password`` 的 argon2 哈希（首装单用户注册写入）。
  导入新建的用户不写任何可用密码（写入不可校验的哨兵值），也不生成临时密码 ——
  它们只作为实体访问上下文里的 ``role`` 存在，登录只对本机注册账号开放。
- 会话是 ``sessions`` 表里的 DB 记录，导入不做任何 token 版本失效动作（无状态 JWT 概念已退役）。
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, select, update

from ...core.json_field import read_json_object
from ...core.models import User
from ...security.passwords import EXTERNAL_PASSWORD_SENTINEL

logger = logging.getLogger("homeos.backup.users")

USERS_BACKUP_KIND = "homeos-users"
USER_ROLES: tuple[str, ...] = ("admin", "adult", "child", "guest")

# 哨兵口令（``!no-local-credential-v1!``）的定义已收敛到 ``security.passwords``：
# 那里同时收录历史哨兵与 ``is_credentialless()`` 判定，注册流程靠它识别「无凭据老行」。
# 本模块导入即用，不再自带一份字面量。


def parse_user_role(value: object, fallback: str = "adult") -> str:
    text = str(value or "").strip()
    return text if text in USER_ROLES else fallback


def _dump_json(value: Any) -> str:
    """将任意值序列化为可写入 TEXT 列的 JSON 字符串（非法输入降级为 {}）。"""
    if isinstance(value, str):
        text = value.strip()
        if text:
            try:
                json.loads(text)
                return text
            except (TypeError, ValueError):
                pass
    try:
        return json.dumps(value if value is not None else {}, ensure_ascii=False)
    except (TypeError, ValueError):
        return "{}"


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class UsersBackupService:
    """Nest ``UsersBackupService`` 等价实现（Users 表读写 + tokenVersion 缓存同步）。"""

    def __init__(self, session_factory: Callable[[], Any]) -> None:
        self._session_factory = session_factory

    # ------------------------------------------------------------------ #
    # 导出
    # ------------------------------------------------------------------ #
    def export_users(self) -> dict[str, Any]:
        with self._session_factory() as session:
            rows = (
                session.execute(select(User).order_by(User.created_at.asc()).limit(500))
                .scalars()
                .all()
            )
        return {
            "kind": USERS_BACKUP_KIND,
            "exportedAt": datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "users": [
                {
                    "username": row.username,
                    "role": row.role,
                    "preferences": read_json_object(row.preferences, {}) or None,
                    "tokenVersion": row.token_version,
                    "createdAt": _iso(row.created_at),
                }
                for row in rows
            ],
        }

    # ------------------------------------------------------------------ #
    # 导入
    # ------------------------------------------------------------------ #
    def import_users(
        self,
        users: list[dict[str, Any]],
        opts: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        options = opts or {}
        skip_existing = bool(options.get("skip_existing", options.get("skipExisting", False)))

        # 阶段一（事务外）：分类 + 预先 bcrypt 哈希，避免昂贵哈希阻塞事务导致超时
        to_update: list[dict[str, Any]] = []
        to_create: list[dict[str, Any]] = []
        skipped = 0

        prepared: list[tuple[str, dict[str, Any]]] = []
        for row in users or []:
            if not isinstance(row, dict):
                continue
            username = str(row.get("username") or "").strip()
            if not username:
                continue
            prepared.append((username, row))

        # 一次 IN 查询取回全部同名用户：原实现对每条导入记录各查一次库（导入 N 条就是
        # N 次往返），而这里只需要「存在与否」和一个用于继承的 role/偏好快照。
        existing_by_username: dict[str, User] = {}
        if prepared:
            with self._session_factory() as session:
                existing_by_username = {
                    row.username: row
                    for row in session.execute(
                        select(User).where(User.username.in_([name for name, _ in prepared]))
                    ).scalars()
                }

        for username, row in prepared:
            existing = existing_by_username.get(username)
            if existing is not None:
                if skip_existing:
                    skipped += 1
                    continue
                preferences = row.get("preferences")
                to_update.append(
                    {
                        "id": existing.id,
                        "role": parse_user_role(row.get("role"), existing.role),
                        "preferences": (
                            preferences
                            if preferences is not None
                            else read_json_object(existing.preferences, {})
                        ),
                    }
                )
                continue
            to_create.append(
                {
                    "username": username,
                    "role": parse_user_role(row.get("role")),
                    "preferences": row.get("preferences") or {},
                    "token_version": int(row.get("tokenVersion") or 0),
                }
            )

        # 阶段二（单事务）：所有写入原子化，任一失败整体回滚
        with self._session_factory() as session, session.begin():
            for item in to_update:
                session.execute(
                    update(User)
                    .where(User.id == item["id"])
                    .values(
                        role=item["role"],
                        preferences=_dump_json(item["preferences"]),
                        token_version=User.token_version + 1,
                    )
                )
            # 多行哨兵口令会让 ``_claimable_legacy_user`` 失效（要求恰好 1 行），
            # 从而锁死注册+登录。仅保留一名可接管 admin；其余导入行跳过。
            claimable = [
                item
                for item in to_create
                if item["role"] == "admin"
            ] or to_create[:1]
            skipped_extra = 0
            for item in to_create:
                if item not in claimable[:1]:
                    skipped_extra += 1
                    logger.warning(
                        "备份导入跳过多余无凭据用户 %s（角色 %s）："
                        "避免多哨兵行锁死首装注册接管。",
                        item["username"],
                        item["role"],
                    )
                    continue
                session.add(
                    User(
                        username=item["username"],
                        password=EXTERNAL_PASSWORD_SENTINEL,
                        role=item["role"],
                        preferences=_dump_json(item["preferences"]),
                        token_version=item["token_version"],
                    )
                )
            if skipped_extra:
                skipped += skipped_extra
                to_create[:] = claimable[:1]

        for item in to_create:
            logger.info(
                "备份导入新用户 %s（无登录凭据：口令为哨兵值，无法登录）。"
                "本机尚无可用账号时，首装注册会就地接管该行并写入新凭据。",
                item["username"],
            )

        return {
            "created": len(to_create),
            "skipped": skipped,
            "updated": len(to_update),
            "createdUsernames": [item["username"] for item in to_create],
        }

    def rollback_users_import(
        self,
        prior_users: list[dict[str, Any]],
        created_usernames: list[str],
    ) -> None:
        """回滚用户导入：删除本次新建账号，并尽量恢复导入前已有用户的 role/preferences。"""
        with self._session_factory() as session, session.begin():
            for username in created_usernames or []:
                session.execute(delete(User).where(User.username == username))
            # 与 :meth:`import_users` 同款批量化：一次 IN 查询取快照，避免逐行查库。
            prior_names = [
                str(prior.get("username") or "").strip()
                for prior in prior_users or []
                if isinstance(prior, dict)
            ]
            prior_names = [name for name in prior_names if name]
            existing_by_username: dict[str, User] = {}
            if prior_names:
                existing_by_username = {
                    row.username: row
                    for row in session.execute(
                        select(User).where(User.username.in_(prior_names))
                    ).scalars()
                }
            for prior in prior_users or []:
                if not isinstance(prior, dict):
                    continue
                username = str(prior.get("username") or "").strip()
                if not username:
                    continue
                existing = existing_by_username.get(username)
                if existing is None:
                    continue
                session.execute(
                    update(User)
                    .where(User.id == existing.id)
                    .values(
                        role=parse_user_role(prior.get("role"), existing.role),
                        preferences=_dump_json(
                            prior.get("preferences")
                            if prior.get("preferences") is not None
                            else read_json_object(existing.preferences, {})
                        ),
                        token_version=User.token_version + 1,
                    )
                )

        logger.warning(
            "已回滚用户导入:删除 %s 个新建账号,恢复 %s 个既有账号元数据",
            len(created_usernames or []),
            len(prior_users or []),
        )
__all__ = [
    "USERS_BACKUP_KIND",
    "USER_ROLES",
    "UsersBackupService",
    "parse_user_role",
]
