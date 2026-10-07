"""升级安装「无凭据老行被注册接管」回归。

守护的故障（本机真实中招，2026-10-07）：存量库里躺着一行删号前的本机管理员账号 ——
``password='!external-admin-account-v1!'``（哨兵，``verify_password`` 对任何输入都 False）、
``email IS NULL``、``authExternalized=1``。结果是：

- 登录：恒 401「账号或密码错误。」（哨兵不是任何哈希算法可产生的格式）；
- 注册：``_has_any_user`` 把这一行算作「本机已有账号」→ 恒 409「本机已有账号，请直接登录。」。

两条路同时封死，升级安装既进不去也注册不了。而修法**不能是删号重建**：这一行的 ``id``
被 ``projects.created_by`` / ``project_drafts.updated_by`` 以 RESTRICT + NOT NULL 引用
（用户那套 3D 仪表盘的归属），实测 ``DELETE FROM users`` 直接报 FOREIGN KEY constraint failed。
所以正确做法是注册时**就地接管这一行**（保留 id）。

本脚本钉住的行为：

1. 只有哨兵口令的独行 → ``/setup/status`` 报未初始化（前端才会把人送去 /register）；
2. 注册接管该行：**id 不变**、username/email/password 换成新的、``authExternalized`` 清掉；
3. 引用它的 project 行外键依旧成立（归属不丢），且新账号能正常登录；
4. 哨兵口令**但有邮箱**的行同样可接管（否则又是一个永久锁死的坑）；
5. 口令是真哈希的行**不可**接管（不能夺走可用账号）→ 仍 409；
6. 多用户库里不做接管（与原先行为一致）→ 仍 409。

只跑进程内假商店（不碰网络）；不需要真实 HA / 授权后台。
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

data_dir = Path(tempfile.mkdtemp(prefix="homeos-claim-smoke-"))
os.environ["HOMEOS_DATA_DIR"] = str(data_dir)
os.environ["HOMEOS_DATABASE_URL"] = f"sqlite:///{data_dir / 'homeos.db'}"
os.environ["REDIS_URL"] = ""
# 本脚本只验账号接管与路由标志，不掺授权门禁（门禁下的注册链路由
# _register_login_activate_smoke.py 覆盖）。
os.environ["LICENSE_REQUIRED"] = "0"
os.environ["LICENSE_SERVER_URL"] = "http://127.0.0.1:1"
os.environ["STORE_URL"] = "http://127.0.0.1:1"
os.environ["HA_BASE_URL"] = ""
os.environ["UPDATE_CHECKS_ENABLED"] = "0"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from _smoke_auth_support import install_fake_verification, register_local_user  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import delete, select  # noqa: E402

from src.app import create_app  # noqa: E402
from src.core.models import LoginSession, Project, User  # noqa: E402
from src.security.passwords import (  # noqa: E402
    EXTERNAL_PASSWORD_SENTINEL,
    LEGACY_ADMIN_PASSWORD_SENTINEL,
    hash_password,
    verify_password,
)

LEGACY_ID = "legacy-admin-row-0000-0000-00000000"
PROJECT_ID = "project-0000-0000-0000-000000000001"
PASSWORD = "ClaimPassw0rd!23"

failures: list[str] = []


def check(label: str, condition: bool, detail: object = "") -> None:
    mark = "PASS" if condition else "FAIL"
    print(f"  [{mark}] {label} {detail if not condition else ''}")
    if not condition:
        failures.append(label)


def _reset_account_tables(session) -> None:
    """清空账号相关表。顺序要紧：projects 引用 users（RESTRICT），必须先删。"""
    session.execute(delete(Project))
    session.execute(delete(LoginSession))
    session.execute(delete(User))


def seed_legacy_user(session, *, password: str, email: str | None) -> None:
    """装一行「无凭据老行」，并把一套 3D 仪表盘挂到它名下（模拟真实存量库）。"""
    _reset_account_tables(session)
    session.add(
        User(
            id=LEGACY_ID,
            username="sfairy",
            email=email,
            password=password,
            role="admin",
            is_active=True,
            auth_externalized=True,
        )
    )
    # 先落用户：Project.created_by 是裸外键（无 relationship），SQLAlchemy 排不出依赖序。
    session.flush()
    session.add(
        Project(id=PROJECT_ID, name="HomeOS", slug="homeos", description="", created_by=LEGACY_ID)
    )
    session.commit()


def seed_plain_user(session) -> None:
    _reset_account_tables(session)
    session.add(
        User(
            id="plain-user-row-0000-0000-0000000001",
            username="someone",
            email="someone@example.com",
            password=hash_password("SomeRealHash123"),
            role="admin",
            is_active=True,
        )
    )
    session.commit()


app = create_app()
with TestClient(app) as client:
    install_fake_verification(app)
    session_factory = app.state.database.session_factory

    print("1) 哨兵口令的独行：报「未初始化」，注册可接管且 id 不变")
    with session_factory() as session:
        seed_legacy_user(session, password=LEGACY_ADMIN_PASSWORD_SENTINEL, email=None)

    status = client.get("/api/v1/setup/status")
    check(
        "GET /setup/status 报 initialized=false（前端才会去 /register）",
        status.status_code == 200 and status.json().get("initialized") is False,
        status.json(),
    )

    response = register_local_user(
        client, app, username="newsfairy", email="new@example.com", password=PASSWORD
    )
    check("注册 201（不再被 409 挡住）", response.status_code == 201, response.text[:200])
    body = response.json() if response.status_code == 201 else {}
    check("返回的 id === 被接管那一行的 id（就地接管，不是插新行）", body.get("id") == LEGACY_ID, body)

    with session_factory() as session:
        row = session.scalar(select(User).where(User.id == LEGACY_ID))
        check("老行还在（被更新，没有被删）", row is not None)
        if row is not None:
            check("username 已换成新账号", row.username == "newsfairy", row.username)
            check("email 已写入", row.email == "new@example.com", row.email)
            check("口令已是可校验的 argon2 哈希", verify_password(PASSWORD, row.password))
            check("authExternalized 已清（不再是外置凭据行）", row.auth_externalized is False)
            check("emailVerifiedAt 已写入", row.email_verified_at is not None)
        project = session.scalar(select(Project).where(Project.id == PROJECT_ID))
        check("3D 仪表盘仍在", project is not None)
        check(
            "仪表盘归属的 created_by 仍指向存在的用户（RESTRICT 外键未断）",
            project is not None
            and project.created_by == LEGACY_ID
            and session.scalar(select(User.id).where(User.id == project.created_by)) is not None,
            project.created_by if project is not None else None,
        )

    check(
        "接管后 /setup/status 报 initialized=true",
        client.get("/api/v1/setup/status").json().get("initialized") is True,
    )

    print("2) 用新凭据能正常登录")
    login = client.post(
        "/api/v1/auth/login", json={"username": "newsfairy", "password": PASSWORD}
    )
    check("POST /auth/login 200", login.status_code == 200, login.text[:200])
    by_email = client.post(
        "/api/v1/auth/login", json={"username": "new@example.com", "password": PASSWORD}
    )
    check("邮箱同样可登录 200", by_email.status_code == 200, by_email.text[:200])

    print("3) 已经有可用账号后再注册 → 仍 409（不可接管）")
    again = register_local_user(
        client, app, username="another", email="another@example.com", password=PASSWORD
    )
    check("重复注册 409", again.status_code == 409, f"{again.status_code} {again.text[:120]}")

    print("4) 口令是真哈希（哪怕邮箱为空）→ 不可接管，仍 409")
    with session_factory() as session:
        seed_plain_user(session)
    forged = register_local_user(
        client, app, username="intruder", email="intruder@example.com", password=PASSWORD
    )
    check("真口令账号不可被接管 409", forged.status_code == 409, f"{forged.status_code}")

    print("5) 哨兵口令 + 有邮箱 → 同样可接管（避免又一个永久锁死）")
    with session_factory() as session:
        seed_legacy_user(session, password=EXTERNAL_PASSWORD_SENTINEL, email="old@example.com")
    exported = register_local_user(
        client, app, username="frombackup", email="frombackup@example.com", password=PASSWORD
    )
    check("备份导入留下的哨兵行可接管 201", exported.status_code == 201, exported.text[:200])
    check("接管后 id 仍未变", (exported.json() or {}).get("id") == LEGACY_ID, exported.json())

    print("6) 多用户库里不做接管 → 409（行为与原先一致）")
    with session_factory() as session:
        seed_legacy_user(session, password=LEGACY_ADMIN_PASSWORD_SENTINEL, email=None)
        session.add(
            User(
                id="second-user-row-0000-0000-000000001",
                username="second",
                email="second@example.com",
                password=hash_password(PASSWORD),
                role="adult",
                is_active=True,
            )
        )
        session.commit()
    multi = register_local_user(
        client, app, username="third", email="third@example.com", password=PASSWORD
    )
    check("多用户时注册 409", multi.status_code == 409, f"{multi.status_code}")

print()
if failures:
    print(f"账号接管回归失败 {len(failures)} 项：")
    for item in failures:
        print(f"  - {item}")
    raise SystemExit(1)
print("账号接管（无凭据老行）回归全部通过。")
