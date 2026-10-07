"""用户备份服务（对齐 ``modules/system/backup/users-backup.service.ts``）。

负责系统用户（admin/adult/child/guest）的导出与导入，是完整备份包的 users 分区提供方。

关键策略：
- 导出附 ``kind=homeos-users``，含 username / role / preferences / tokenVersion / createdAt；
- 导入时角色不合法回退到 adult；
- **凭据唯一权威是** :class:`AdminAccountStore`（凭据外置在账号文件里，``users.password``
  恒为哨兵值）。因此导入新建的用户不写任何可用密码，也不生成临时密码 —— 非管理员用户
  的身份由会话内的 ``role`` 决定，登录只对管理员凭据开放。
- 会话是 ``sessions`` 表里的 DB 记录，导入不做任何 token 版本失效动作（无状态 JWT 概念已退役）。
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, select, update

from ...admin_account import EXTERNAL_PASSWORD_SENTINEL
from ...core.json_field import read_json_object
from ...core.models import User

logger = logging.getLogger("homeos.backup.users")

USERS_BACKUP_KIND = "homeos-users"
USER_ROLES: tuple[str, ...] = ("admin", "adult", "child", "guest")


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

        with self._session_factory() as session:
            for row in users or []:
                if not isinstance(row, dict):
                    continue
                username = str(row.get("username") or "").strip()
                if not username:
                    continue
                existing = session.execute(
                    select(User).where(User.username == username)
                ).scalar_one_or_none()
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
        with self._session_factory() as session:
            with session.begin():
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
                for item in to_create:
                    session.add(
                        User(
                            username=item["username"],
                            password=EXTERNAL_PASSWORD_SENTINEL,
                            role=item["role"],
                            preferences=_dump_json(item["preferences"]),
                            token_version=item["token_version"],
                        )
                    )

        for item in to_create:
            logger.info("备份导入新用户 %s（无登录凭据，登录仅对管理员开放）", item["username"])

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
        with self._session_factory() as session:
            with session.begin():
                for username in created_usernames or []:
                    session.execute(delete(User).where(User.username == username))
                for prior in prior_users or []:
                    if not isinstance(prior, dict):
                        continue
                    username = str(prior.get("username") or "").strip()
                    if not username:
                        continue
                    existing = session.execute(
                        select(User).where(User.username == username)
                    ).scalar_one_or_none()
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
