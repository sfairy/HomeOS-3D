"""管理员账号：把登录凭据从数据库外置到一个可删除的文件。

设计动机：管理员忘记密码时，删掉账号文件重启即可回到设置页重新设置，
而项目、草稿、授权与中控配对数据都不受影响 —— 因此 users 表里的那行
必须保留（它是 project.created_by 等外键的稳定引用），但认证不再看它。

一次性写入靠「临时文件 + fsync + rename」保证：要么完整落盘，要么不存在，
不会出现写到一半的账号文件把系统卡在无法登录也无法初始化的状态。
"""
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
# 写进 users.password_hash 的哨兵值：表示该账号的凭据已外置到账号文件，
# 这个哈希本身不可用于登录，仅作为"已外置"的标记。
EXTERNAL_PASSWORD_SENTINEL = "!external-admin-account-v1!"


@dataclass(frozen=True)
class AdminAccountCredentials:
    """账号文件里的一份凭据快照。"""

    user_id: str
    username: str
    password_hash: str


class AdminAccountStore:
    """管理员凭据文件的读写与状态机。

    users 表里的那一行保留为稳定身份（项目、草稿、中控配对都引用它的 id），
    但认证只认这个文件。因此删除文件并重启就能重置登录，而不会丢任何业务数据。
    """

    def __init__(self, path: Path) -> None:
        """只记录账号文件路径，不在这里读盘。

        参数:
            path: 管理员账号 JSON 文件路径。
        """
        self.path = Path(path)
        # 已加载的凭据；None 表示尚未初始化。
        self._credentials = None
        # 库里有管理员但账号文件缺失时，记下那个用户 id 供设置页复用。
        self._recovery_user_id = None

    @property
    def initialized(self) -> bool:
        """账号文件是否已成功加载（即系统已完成初始化）。"""
        return self._credentials is not None

    @property
    def credentials(self) -> AdminAccountCredentials | None:
        """当前生效的凭据，未初始化时为 None。"""
        return self._credentials

    @property
    def user_id(self) -> str | None:
        """凭据对应的用户 id，未初始化时为 None。"""
        return self._credentials.user_id if self._credentials else None

    @property
    def recovery_user_id(self) -> str | None:
        """待重新设置账号的库内用户 id（仅 reset_required 状态下有值）。"""
        return self._recovery_user_id

    @property
    def reset_required(self) -> bool:
        """是否需要重新设置账号：库里有管理员，但账号文件不存在。"""
        return self._recovery_user_id is not None and self._credentials is None

    def _encoded(self, credentials: AdminAccountCredentials) -> bytes:
        """把凭据序列化成落盘字节（末尾补换行，便于人工查看与 diff）。"""
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
        """读取并严格校验账号文件。

        所有异常统一包成 RuntimeError 并附上可操作的中文提示，
        因为这种情况只能由人工修文件或删文件来解决。
        """
        try:
            # 16384 字节上限：账号文件只有几个字段，超限说明被写脏了，
            # 直接拒绝而不是把大文件读进内存。
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
            # 长度上限与设置页的输入约束一致，防止改文件绕过前端校验。
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
            # 读取后再紧一次权限：文件可能被其它工具复制进来时带了宽松权限。
            os.chmod(self.path, 0o600)
        except OSError as error:
            raise RuntimeError(f"无法保护管理员账号文件 {self.path} 的访问权限。") from error

        return AdminAccountCredentials(
            user_id=user_id, username=username, password_hash=password_hash
        )

    def _write(self, credentials: AdminAccountCredentials) -> None:
        """原子写入账号文件；文件已存在时拒绝覆盖。"""
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self.path.parent, 0o700)
        # 已存在就报错：初始化只能发生一次，避免静默覆盖掉正在使用的凭据。
        if self.path.exists():
            raise RuntimeError(f"管理员账号文件 {self.path} 已存在，拒绝覆盖。")
        # 随机后缀的临时文件，避免并发初始化时互相踩到同一个中间文件名。
        temporary_path = self.path.with_name(
            f".{self.path.name}.{secrets.token_hex(8)}.tmp"
        )
        final_path_created = False
        try:
            # O_EXCL：临时文件也必须新建，防止复用同名残留文件。
            # 0o600：创建瞬间就是私有权限，不留「先生成后 chmod」的窗口。
            descriptor = os.open(
                temporary_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600
            )
            with os.fdopen(descriptor, "wb") as output:
                output.write(self._encoded(credentials))
                output.flush()
                # 先把文件内容刷到磁盘，再 rename，保证断电后不会留下空文件。
                os.fsync(output.fileno())
            os.replace(temporary_path, self.path)
            final_path_created = True
            os.chmod(self.path, 0o600)
            # 再 fsync 一次目录项，确保 rename 本身也落盘。
            # Windows 不允许把目录当文件描述符打开（PermissionError），
            # os.replace 已通过 MoveFileEx 的 WRITE_THROUGH 保证原子性与持久化。
            if os.name != 'nt':
                directory_descriptor = os.open(self.path.parent, os.O_RDONLY)
                try:
                    os.fsync(directory_descriptor)
                finally:
                    os.close(directory_descriptor)
        except Exception:
            # 走到 rename 之后才失败：把已成型的正式文件删掉，
            # 否则下一次启动会认为"账号文件已存在"，卡在拒绝覆盖上。
            if final_path_created:
                self.path.unlink(missing_ok=True)
            raise
        finally:
            temporary_path.unlink(missing_ok=True)

    def _discard(self, credentials: AdminAccountCredentials) -> None:
        """回滚落盘：仅当文件内容与这份凭据一致时才删除。"""
        try:
            # 比对内容再删，避免把别人刚写好的账号文件误删。
            if self.path.is_file() and self.path.read_bytes() == self._encoded(
                credentials
            ):
                self.path.unlink()
        except OSError:
            pass

    @staticmethod
    def _admin_user(database_session) -> User | None:
        """找出库内的管理员账号。

        优先取 role == "admin" 的行；老库可能没有正确设置 role，
        因此退化到「最早创建的那个账号」。
        """
        return database_session.scalar(
            select(User).where(User.role == "admin").order_by(User.created_at, User.id)
        ) or database_session.scalar(
            select(User).order_by(User.created_at, User.id)
        )

    def initialize(self, database: Database) -> str:
        """启动时确定账号状态，返回 "ready" / "empty" / "reset_required"。

        三种分支：
        - 账号文件存在且有效 → 校验库内身份一致后进入 ready；
        - 账号文件不存在且库里也没有账号 → empty（首次安装，去 /setup）；
        - 账号文件不存在但库里有账号 → reset_required（删了文件要重设）。
        """
        self._credentials = None
        self._recovery_user_id = None
        with database.session_factory() as session:
            if self.path.exists():
                credentials = self._read()
                user = session.get(User, credentials.user_id)
                # 文件引用的用户不存在：只能人工介入，报错比静默重建更安全。
                if user is None:
                    raise RuntimeError(
                        "管理员账号文件引用的内部账号不存在；请删除账号文件后重新设置。"
                    )
                # 账号名被别的行占用会让登录查重时产生歧义，直接拒绝启动。
                conflict = session.scalar(
                    select(User).where(
                        User.username == credentials.username,
                        User.id != credentials.user_id,
                    )
                )
                if conflict is not None:
                    raise RuntimeError("管理员账号文件中的账号名与现有内部账号冲突。")
                # 把库内那一行标记为「凭据已外置」：保留 id 供外键引用，
                # 但 password_hash 换成哨兵值，使库内哈希不可用于登录。
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
            # 顺带清空全部登录会话，避免旧会话绕过重设后的新口令。
            session.execute(delete(LoginSession))
            session.commit()
            self._recovery_user_id = user.id
            return "reset_required"

    def stage(self, user: User, password_hash: str) -> AdminAccountCredentials:
        """先落盘新凭据（尚未生效），供后续 activate / abort 二选一。"""
        if self.initialized:
            raise RuntimeError("系统已经完成管理员账号设置。")
        credentials = AdminAccountCredentials(
            user_id=user.id, username=user.username, password_hash=password_hash
        )
        # 先写文件：库事务失败时文件还在，可由 abort 回滚。
        self._write(credentials)
        return credentials

    def abort(self, credentials: AdminAccountCredentials) -> None:
        """初始化事务失败时回滚已落盘的账号文件。"""
        self._discard(credentials)

    def activate(self, credentials: AdminAccountCredentials) -> None:
        """库事务提交成功后让凭据正式生效。"""
        self._credentials = credentials
        self._recovery_user_id = None
