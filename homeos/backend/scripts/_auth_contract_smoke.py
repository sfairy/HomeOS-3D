"""认证契约端到端冒烟：在临时数据目录上跑完整 lifespan，验证单用户注册登录契约。

覆盖：未初始化 → 发码 → 注册（建号即登录）→ me → 二次注册 409 → 登出 → 账号/邮箱两种
登录 → 错误密码 401 → 旧方言端点应 404/405。

注册所需的「商店发码/验码」由 ``_smoke_auth_support`` 的进程内假实现顶替，不碰网络。
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

data_dir = Path(tempfile.mkdtemp(prefix="homeos-smoke-"))
os.environ["HOMEOS_DATA_DIR"] = str(data_dir)
os.environ["HOMEOS_DATABASE_URL"] = f"sqlite:///{data_dir / 'homeos.db'}"
os.environ["REDIS_URL"] = ""
os.environ["LICENSE_REQUIRED"] = "0"
os.environ["HA_BASE_URL"] = ""
os.environ["UPDATE_CHECKS_ENABLED"] = "0"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from _smoke_auth_support import (  # noqa: E402
    FAKE_CODE,
    csrf_headers,
    install_fake_verification,
    register_local_user,
)
from fastapi.testclient import TestClient  # noqa: E402

from src.app import create_app  # noqa: E402

USERNAME = "smokeuser"
EMAIL = "smoke@example.com"
PASSWORD = "SmokePass123"

failures: list[str] = []


def check(label: str, condition: bool, detail: object = "") -> None:
    mark = "PASS" if condition else "FAIL"
    print(f"  [{mark}] {label} {detail if not condition else ''}")
    if not condition:
        failures.append(label)


app = create_app()
with TestClient(app) as client:
    install_fake_verification(app)

    print("1) 未初始化状态")
    headers = csrf_headers(client, app)
    check("GET /setup/status 下发 CSRF Cookie", bool(next(iter(headers.values()), "")), headers)
    r = client.get("/api/v1/setup/status")
    check("GET /setup/status 200", r.status_code == 200, r.status_code)
    check("initialized=false（零用户）", r.json().get("initialized") is False, r.text)

    print("2) 未登录访问受保护端点")
    r = client.get("/api/v1/auth/me")
    check("GET /auth/me 未登录 401", r.status_code == 401, r.status_code)

    print("3) 请求注册验证码（商店代发，冒烟走假实现）")
    r = client.post("/api/v1/auth/verification", json={"email": EMAIL}, headers=headers)
    check("POST /auth/verification 200", r.status_code == 200, f"{r.status_code} {r.text}")
    check("回执含 delivered", r.json().get("delivered") is True, r.text)

    print("4) 错误验证码被拒（422）")
    r = register_local_user(
        client, app, username=USERNAME, email=EMAIL, password=PASSWORD, code="000000"
    )
    check("错误验证码 422", r.status_code == 422, f"{r.status_code} {r.text}")

    print("5) 注册本机唯一账号（建号即登录）")
    r = register_local_user(
        client, app, username=USERNAME, email=EMAIL, password=PASSWORD, code=FAKE_CODE
    )
    check("POST /auth/register 201", r.status_code == 201, f"{r.status_code} {r.text}")
    body = r.json() if r.status_code < 300 else {}
    check("返回 UserResponse 形状", set(body) == {"id", "username", "role", "email"}, body)
    check("role=admin", body.get("role") == "admin", body)
    check("回传注册邮箱", body.get("email") == EMAIL, body)
    check("下发会话 Cookie", client.cookies.get("auth_token") is not None, client.cookies)

    print("6) 注册后状态 + /auth/me")
    r = client.get("/api/v1/setup/status")
    check("initialized=true", r.json().get("initialized") is True, r.text)
    r = client.get("/api/v1/auth/me")
    check("GET /auth/me 200", r.status_code == 200, r.status_code)
    check(f"me.username={USERNAME}", r.json().get("username") == USERNAME, r.text)

    print("7) 二次注册被拒（注册入口关闭）")
    r = register_local_user(
        client,
        app,
        username="other",
        email="other@example.com",
        password="OtherPass123",
        headers=headers,
    )
    check("已有用户时再注册 409", r.status_code == 409, f"{r.status_code} {r.text}")

    print("8) 密码不一致 / 弱口令被拒")
    r = client.post(
        "/api/v1/auth/register",
        json={
            "username": "third",
            "email": "third@example.com",
            "code": FAKE_CODE,
            "password": "ThirdPass123",
            "passwordConfirmation": "Mismatch123",
        },
        headers=headers,
    )
    # 校验失败走统一错误信封（400），与 Nest 侧「400 + message」口径一致
    check("两次密码不一致 400/422", r.status_code in (400, 422), r.status_code)
    check("提示两次密码不一致", "两次输入的密码不一致" in r.text, r.text[:200])
    r = register_local_user(
        client,
        app,
        username="weak",
        email="weak@example.com",
        password="short",
        headers=headers,
    )
    check("弱口令 400/422", r.status_code in (400, 422), f"{r.status_code} {r.text[:200]}")

    print("8b) 账号里出现 @ / 空格被拒（登录框「账号或邮箱」不得有歧义）")
    r = register_local_user(
        client,
        app,
        username="bad@name",
        email="bad@example.com",
        password="BadName12345",
        headers=headers,
    )
    check("账号含 @ 400/422", r.status_code in (400, 422), f"{r.status_code} {r.text[:200]}")
    r = register_local_user(
        client,
        app,
        username="bad name",
        email="bad@example.com",
        password="BadName12345",
        headers=headers,
    )
    check("账号含空格 400/422", r.status_code in (400, 422), f"{r.status_code} {r.text[:200]}")

    print("9) 登出")
    r = client.post("/api/v1/auth/logout", headers=headers)
    check("POST /auth/logout 204", r.status_code == 204, f"{r.status_code} {r.text}")
    r = client.get("/api/v1/auth/me")
    check("登出后 /auth/me 401", r.status_code == 401, r.status_code)

    print("10) 用账号登录")
    r = client.post(
        "/api/v1/auth/login", json={"username": USERNAME, "password": PASSWORD}, headers=headers
    )
    check("POST /auth/login 200", r.status_code == 200, f"{r.status_code} {r.text}")
    check("登录取到 username", r.json().get("username") == USERNAME, r.text)

    print("11) 用注册邮箱登录（账号或邮箱任填其一）")
    r = client.post(
        "/api/v1/auth/login", json={"username": EMAIL, "password": PASSWORD}, headers=headers
    )
    check("邮箱登录 200", r.status_code == 200, f"{r.status_code} {r.text}")
    check("邮箱登录取到同一账号", r.json().get("username") == USERNAME, r.text)

    print("11b) 邮箱大小写不敏感（同一个输入框，两种写法都要能进）")
    r = client.post(
        "/api/v1/auth/login",
        json={"username": EMAIL.upper(), "password": PASSWORD},
        headers=headers,
    )
    check("大写邮箱登录 200", r.status_code == 200, f"{r.status_code} {r.text}")
    check("大写邮箱登录取到同一账号", r.json().get("username") == USERNAME, r.text)

    print("12) 错误密码 401，且 detail 为原生文案")
    r = client.post(
        "/api/v1/auth/login", json={"username": USERNAME, "password": "WrongPass123"}, headers=headers
    )
    check("错误密码 401", r.status_code == 401, r.status_code)
    check("detail == 账号或密码错误。", r.json().get("detail") == "账号或密码错误。", r.text)

    print("13) 旧方言端点应不存在（404/405）")
    for path, method in (
        ("/api/v1/setup/admin", "post"),
        ("/api/v1/auth/status", "get"),
        ("/api/v1/auth/setup", "post"),
        ("/api/v1/auth/refresh", "post"),
        ("/api/v1/auth/users", "get"),
        ("/api/v1/auth/preferences", "get"),
        ("/api/v1/auth/mfa/status", "get"),
        ("/api/v1/auth/login-audit", "get"),
        ("/api/v1/auth/guest-login", "post"),
        ("/api/v1/auth/guest-exchange", "post"),
        ("/api/v1/auth/guest-token", "post"),
        ("/api/v1/system/access/passes", "get"),
        ("/api/v1/system/child-mode", "get"),
        ("/api/v1/audit/commands", "get"),
    ):
        r = getattr(client, method)(path, headers=headers)
        check(f"{method.upper()} {path} 已下线", r.status_code in (404, 405, 401, 403), r.status_code)

print()
if failures:
    print(f"SMOKE FAILED ({len(failures)}): {failures}")
    sys.exit(1)
print("SMOKE OK — 全部通过")
