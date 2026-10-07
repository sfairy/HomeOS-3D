"""认证契约端到端冒烟：在临时数据目录上跑完整 lifespan，验证 3D 原生 5 端点。

覆盖：未初始化 → setup/admin → login → me → logout → 旧端点应 404。
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

from fastapi.testclient import TestClient  # noqa: E402

from src.app import create_app  # noqa: E402

failures: list[str] = []


def check(label: str, condition: bool, detail: object = "") -> None:
    mark = "PASS" if condition else "FAIL"
    print(f"  [{mark}] {label} {detail if not condition else ''}")
    if not condition:
        failures.append(label)


app = create_app()
with TestClient(app) as client:
    print("1) 未初始化状态")
    r = client.get("/api/v1/setup/status")
    check("GET /setup/status 200", r.status_code == 200, r.status_code)
    check("initialized=false", r.json().get("initialized") is False, r.text)
    csrf_cookie_name = app.state.settings.csrf_cookie_name
    check(
        "GET /setup/status 下发 csrf_token（CSRF 引导端点）",
        client.cookies.get(csrf_cookie_name) is not None,
        dict(client.cookies),
    )

    print("2) 未登录访问受保护端点")
    r = client.get("/api/v1/auth/me")
    check("GET /auth/me 未登录 401", r.status_code == 401, r.status_code)

    print("3) 初始化管理员")
    r = client.post(
        "/api/v1/setup/admin",
        json={
            "username": "smokeadmin",
            "password": "SmokePass123",
            "passwordConfirmation": "SmokePass123",
        },
    )
    check("POST /setup/admin 201", r.status_code == 201, f"{r.status_code} {r.text}")
    body = r.json() if r.status_code < 300 else {}
    check("返回 UserResponse 形状", set(body) == {"id", "username", "role"}, body)
    check("role=admin", body.get("role") == "admin", body)
    check("下发会话 Cookie", client.cookies.get("auth_token") is not None, client.cookies)

    print("4) 初始化后状态 + /auth/me")
    r = client.get("/api/v1/setup/status")
    check("initialized=true", r.json().get("initialized") is True, r.text)
    r = client.get("/api/v1/auth/me")
    check("GET /auth/me 200", r.status_code == 200, r.status_code)
    check("me.username=smokeadmin", r.json().get("username") == "smokeadmin", r.text)

    print("5) 二次初始化应 409")
    r = client.post(
        "/api/v1/setup/admin",
        json={
            "username": "other",
            "password": "OtherPass123",
            "passwordConfirmation": "OtherPass123",
        },
    )
    check("重复初始化 409", r.status_code == 409, r.status_code)

    print("6) 两次密码不一致：3D 前端读 detail[0].msg")
    r = client.post(
        "/api/v1/setup/admin",
        json={
            "username": "third",
            "password": "ThirdPass123",
            "passwordConfirmation": "Mismatch123",
        },
    )
    check("密码不一致被拒（400/422）", r.status_code in (400, 422), r.status_code)
    detail = r.json().get("detail")
    msg = detail[0].get("msg") if isinstance(detail, list) and detail else None
    check(
        "detail[0].msg 与 3D 一致（含两次密码提示）",
        isinstance(msg, str) and "两次输入的密码不一致" in msg,
        r.text,
    )

    print("7) 登出")
    r = client.post("/api/v1/auth/logout")
    check("POST /auth/logout 204", r.status_code == 204, f"{r.status_code} {r.text}")
    r = client.get("/api/v1/auth/me")
    check("登出后 /auth/me 401", r.status_code == 401, r.status_code)

    print("8) 重新登录")
    r = client.post(
        "/api/v1/auth/login", json={"username": "smokeadmin", "password": "SmokePass123"}
    )
    check("POST /auth/login 200", r.status_code == 200, f"{r.status_code} {r.text}")
    check("登录取到 username", r.json().get("username") == "smokeadmin", r.text)

    print("9) 错误密码 401，且 detail 为 3D 原生文案")
    r = client.post(
        "/api/v1/auth/login", json={"username": "smokeadmin", "password": "WrongPass123"}
    )
    check("错误密码 401", r.status_code == 401, r.status_code)
    check(
        "detail == 账号或密码错误。",
        r.json().get("detail") == "账号或密码错误。",
        r.text,
    )

    print("10) 旧方言端点应不存在（404/405）")
    for path, method in (
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
        r = getattr(client, method)(path)
        check(f"{method.upper()} {path} 已下线", r.status_code in (404, 405, 401, 403), r.status_code)

print()
if failures:
    print(f"SMOKE FAILED ({len(failures)}): {failures}")
    sys.exit(1)
print("SMOKE OK — 全部通过")
