from __future__ import annotations

import json
import os
import secrets
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import delete, select

from .database import Database
from .models import LoginSession, User

ACCOUNT_FILE_SCHEMA_VERSION = 1
EXTERNAL_PASSWORD_SENTINEL = "!external-admin-account-v1!"


@dataclass(frozen=True)
class AdminAccountCredentials:
    user_id: str
    username: str
    password_hash: str


class AdminAccountStore:
    """Own the resettable administrator credential file.

    The users row remains in app.db as a stable identity because projects,
    drafts and display pairing records reference its id. Authentication uses
    only this file after externalization. Deleting the file and restarting the
    service therefore resets login without deleting any business data.
    """

    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self._credentials = None
        self._recovery_user_id = None

    @property
    def initialized(self) -> bool:
        return self._credentials is not None

    @property
    def credentials(self) -> AdminAccountCredentials | None:
        return self._credentials

    @property
    def user_id(self) -> str | None:
        return self._credentials.user_id if self._credentials else None

    @property
    def recovery_user_id(self) -> str | None:
        return self._recovery_user_id

    @property
    def reset_required(self) -> bool:
        return self._recovery_user_id is not None and self._credentials is None

    def _encoded(self, credentials: AdminAccountCredentials) -> bytes:
        return (
            json.dumps(
                {
                    "schemaVersion": ACCOUNT_FILE_SCHEMA_VERSION,
                    "userId": credentials.user_id,
                    "username": credentials.username,
                    "passwordHash": credentials.password_hash,
                },
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
            )
            + "\n"
        ).encode("utf-8")

    def _read(self) -> AdminAccountCredentials:
        try:
            if not self.path.is_file() or self.path.stat().st_size > 16384:
                raise ValueError("invalid file")
            payload = json.loads(self.path.read_text(encoding="utf-8"))
            if (
                not isinstance(payload, dict)
                or payload.get("schemaVersion") != ACCOUNT_FILE_SCHEMA_VERSION
            ):
                raise ValueError("unsupported schema")
            user_id = str(payload.get("userId") or "")
            username = str(payload.get("username") or "")
            password_hash = str(payload.get("passwordHash") or "")
            if not user_id or len(user_id) > 128:
                raise ValueError("invalid user id")
            if len(username) < 3 or len(username) > 64:
                raise ValueError("invalid username")
            if not password_hash or len(password_hash) > 512:
                raise ValueError("invalid password hash")
        except (OSError, UnicodeError, ValueError, TypeError, json.JSONDecodeError) as error:
            raise RuntimeError(
                f"管理员账号文件 {self.path} 无法读取；请修复该文件，或删除它后重启以重新设置账号。"
            ) from error

        try:
            os.chmod(self.path, 0o600)
        except OSError as error:
            raise RuntimeError(f"无法保护管理员账号文件 {self.path} 的访问权限。") from error

        return AdminAccountCredentials(
            user_id=user_id, username=username, password_hash=password_hash
        )

    def _write(self, credentials: AdminAccountCredentials) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self.path.parent, 0o700)
        if self.path.exists():
            raise RuntimeError(f"管理员账号文件 {self.path} 已存在，拒绝覆盖。")
        temporary_path = self.path.with_name(
            f".{self.path.name}.{secrets.token_hex(8)}.tmp"
        )
        final_path_created = False
        try:
            descriptor = os.open(
                temporary_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600
            )
            with os.fdopen(descriptor, "wb") as output:
                output.write(self._encoded(credentials))
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary_path, self.path)
            final_path_created = True
            os.chmod(self.path, 0o600)
            directory_descriptor = os.open(self.path.parent, os.O_RDONLY)
            try:
                os.fsync(directory_descriptor)
            finally:
                os.close(directory_descriptor)
        except Exception:
            if final_path_created:
                self.path.unlink(missing_ok=True)
            raise
        finally:
            temporary_path.unlink(missing_ok=True)

    def _discard(self, credentials: AdminAccountCredentials) -> None:
        try:
            if self.path.is_file() and self.path.read_bytes() == self._encoded(
                credentials
            ):
                self.path.unlink()
        except OSError:
            pass

    @staticmethod
    def _admin_user(database_session) -> User | None:
        return database_session.scalar(
            select(User).where(User.role == "admin").order_by(User.created_at, User.id)
        ) or database_session.scalar(
            select(User).order_by(User.created_at, User.id)
        )

    def initialize(self, database: Database) -> str:
        self._credentials = None
        self._recovery_user_id = None
        with database.session_factory() as session:
            if self.path.exists():
                credentials = self._read()
                user = session.get(User, credentials.user_id)
                if user is None:
                    raise RuntimeError(
                        "管理员账号文件引用的内部账号不存在；请删除账号文件后重新设置。"
                    )
                conflict = session.scalar(
                    select(User).where(
                        User.username == credentials.username,
                        User.id != credentials.user_id,
                    )
                )
                if conflict is not None:
                    raise RuntimeError("管理员账号文件中的账号名与现有内部账号冲突。")
                user.username = credentials.username
                user.password_hash = EXTERNAL_PASSWORD_SENTINEL
                user.auth_externalized = True
                session.commit()
                self._credentials = credentials
                return "ready"
            user = self._admin_user(session)
            if user is None:
                return "empty"
            # 库内还留着管理员、但账号文件不存在：一律按「需要重新设置」处理，
            # 由设置页重建账号文件（不在此处把库内凭据外置为账号文件）。
            session.execute(delete(LoginSession))
            session.commit()
            self._recovery_user_id = user.id
            return "reset_required"

    def stage(self, user: User, password_hash: str) -> AdminAccountCredentials:
        if self.initialized:
            raise RuntimeError("系统已经完成管理员账号设置。")
        credentials = AdminAccountCredentials(
            user_id=user.id, username=user.username, password_hash=password_hash
        )
        self._write(credentials)
        return credentials

    def abort(self, credentials: AdminAccountCredentials) -> None:
        self._discard(credentials)

    def activate(self, credentials: AdminAccountCredentials) -> None:
        self._credentials = credentials
        self._recovery_user_id = None
