"""首装三连冒烟：注册 → 登录 → 激活契约（``LICENSE_REQUIRED=1``）。

在临时数据目录上跑完整 lifespan，验证**开启授权门禁**时的首装链路：

1. 未激活时 SPA 外壳（``/``、``/login``、``/activate``）仍可下发，前端才能渲染激活页；
2. ``GET /license/availability`` 匿名可读，回 ``required`` / ``allowed``；
3. ``POST /license/activate`` **改为登录态**：未登录 401，登录后把本机账号名（``accountName``）
   一并交给授权服务；
4. 授权服务不可达时激活失败必须是可读的 422（而不是 500），且不误把状态推进成已授权。

不依赖真实商店：验证码走进程内假实现；激活只断言「参数透传到服务层」和错误面，
不伪造签名租约（那属于商店侧的签名契约，由商店自己的测试覆盖）。
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

data_dir = Path(tempfile.mkdtemp(prefix="homeos-activate-smoke-"))
os.environ["HOMEOS_DATA_DIR"] = str(data_dir)
os.environ["HOMEOS_DATABASE_URL"] = f"sqlite:///{data_dir / 'homeos.db'}"
os.environ["REDIS_URL"] = ""
# 本脚本专门验证「门禁开着」的行为，因此保持授权必填。
os.environ["LICENSE_REQUIRED"] = "1"
# 指向一个必然连不上的授权后台：激活必须在网络边界处失败，而不是把状态推进成已授权。
os.environ["LICENSE_SERVER_URL"] = "http://127.0.0.1:1"
os.environ["STORE_URL"] = "http://127.0.0.1:1"
os.environ["HA_BASE_URL"] = ""
os.environ["UPDATE_CHECKS_ENABLED"] = "0"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi.testclient import TestClient  # noqa: E402

from src.app import create_app  # noqa: E402
from src.services.license import LicenseService  # noqa: E402

from _smoke_auth_support import csrf_headers, install_fake_verification, register_local_user  # noqa: E402

USERNAME = "actuser"
EMAIL = "act@example.com"
PASSWORD = "ActivatePass123"

failures: list[str] = []


def check(label: str, condition: bool, detail: object = "") -> None:
    mark = "PASS" if condition else "FAIL"
    print(f"  [{mark}] {label} {detail if not condition else ''}")
    if not condition:
        failures.append(label)


app = create_app()
with TestClient(app) as client:
    install_fake_verification(app)

    print("1) 未激活时 SPA 外壳仍可下发")
    for path in ("/", "/register", "/login", "/activate", "/license"):
        r = client.get(path)
        check(f"GET {path} 200（可渲染注册 / 登录 / 激活页）", r.status_code == 200, r.status_code)

    print("2) 授权可用性匿名可读")
    r = client.get("/api/v1/license/availability")
    check("GET /license/availability 200", r.status_code == 200, f"{r.status_code} {r.text[:160]}")
    payload = r.json() if r.status_code == 200 else {}
    check("required=true", payload.get("required") is True, payload)
    check("allowed=false（未激活）", payload.get("allowed") is False, payload)
    check("editorAllowed=false", payload.get("editorAllowed") is False, payload)

    print("3) 未登录时激活被拒（激活改为登录态）")
    r = client.post(
        "/api/v1/license/activate",
        json={"email": EMAIL, "activationCode": "HOMEOS-XXXX-XXXX-XXXX"},
    )
    check("未登录激活 401", r.status_code == 401, f"{r.status_code} {r.text[:160]}")

    print("4) 注册本机账号（首装入口）")
    r = register_local_user(client, app, username=USERNAME, email=EMAIL, password=PASSWORD)
    check("POST /auth/register 201", r.status_code == 201, f"{r.status_code} {r.text}")
    session_word = "已登录" if client.cookies.get("auth_token") else "未登录"
    check(f"注册后自动登录（{session_word}）", client.cookies.get("auth_token") is not None, client.cookies)

    print("5) 登录后激活：账号名必须透传到服务层")
    headers = csrf_headers(client, app)
    seen: dict[str, object] = {}
    original_activate = LicenseService.activate

    async def spy_activate(self, activation_code, email=None, account_name=None):
        seen["code"] = activation_code
        seen["email"] = email
        seen["account_name"] = account_name
        return await original_activate(self, activation_code, email, account_name)

    LicenseService.activate = spy_activate
    try:
        r = client.post(
            "/api/v1/license/activate",
            json={"email": EMAIL, "activationCode": "HOMEOS-XXXX-XXXX-XXXX"},
            headers=headers,
        )
    finally:
        LicenseService.activate = original_activate

    check("activate 走到服务层", seen.get("code") == "HOMEOS-XXXX-XXXX-XXXX", seen)
    check("email 透传", seen.get("email") == EMAIL, seen)
    check(
        f"accountName 透传为本机账号（{USERNAME}）",
        seen.get("account_name") == USERNAME,
        seen,
    )
    check(
        "授权后台不可达 → 422 可读错误（非 500）",
        r.status_code == 422,
        f"{r.status_code} {r.text[:200]}",
    )

    print("6) 激活失败后不得误判为已授权")
    r = client.get("/api/v1/license/availability")
    payload = r.json() if r.status_code == 200 else {}
    check("allowed 仍为 false", payload.get("allowed") is False, payload)
    r = client.get("/api/v1/license/status")
    check("GET /license/status 已登录 200", r.status_code == 200, f"{r.status_code} {r.text[:160]}")
    check(
        "状态仍为未激活",
        str((r.json() if r.status_code == 200 else {}).get("status")) == "UNACTIVATED",
        r.text[:200],
    )

print()
if failures:
    print(f"SMOKE FAILED ({len(failures)}): {failures}")
    sys.exit(1)
print("SMOKE OK — 注册 → 登录 → 激活契约全部通过")
