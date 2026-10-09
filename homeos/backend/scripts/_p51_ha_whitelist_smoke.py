"""阶段 5.1 端到端复核：HTTP /ha/services/call 的服务白名单仍生效（导入抽取后回归）。"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

data_dir = Path(tempfile.mkdtemp(prefix="homeos-p51-"))
os.environ["HOMEOS_DATA_DIR"] = str(data_dir)
os.environ["HOMEOS_DATABASE_URL"] = f"sqlite:///{data_dir / 'homeos.db'}"
os.environ["REDIS_URL"] = ""
os.environ["LICENSE_REQUIRED"] = "0"
os.environ["HA_BASE_URL"] = ""
os.environ["UPDATE_CHECKS_ENABLED"] = "0"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from _smoke_auth_support import csrf_headers, install_fake_verification, register_local_user
from fastapi.testclient import TestClient
from src.app import create_app

# 冒烟专用固定口令（非真实凭据）。
SMOKE_ADMIN_PASSWORD = "Passw0rd!234"

failures: list[str] = []


def check(label: str, condition: bool, detail: object = "") -> None:
    print(f"  [{'PASS' if condition else 'FAIL'}] {label} {'' if condition else detail}")
    if not condition:
        failures.append(label)


app = create_app()
with TestClient(app) as client:
    install_fake_verification(app)

    # 首装改为单用户注册：注册成功即建立会话，后续写请求带上 CSRF 头部即可。
    r = register_local_user(
        client,
        app,
        username="smokeadmin",
        email="smokeadmin@example.com",
        password=SMOKE_ADMIN_PASSWORD,
    )
    print("register:", r.status_code, str(r.json())[:120])
    check("本机账号注册成功", r.status_code == 201, f"{r.status_code} {r.text[:160]}")

    headers = csrf_headers(client, app)
    csrf_name = app.state.settings.csrf_cookie_name
    check("CSRF Cookie 已下发", bool(client.cookies.get(csrf_name)), dict(client.cookies))

    # 1) 白名单外服务 → 403
    r = client.post(
        "/api/v1/ha/services/call",
        json={"domain": "light", "service": "reload", "entity_id": "light.x", "data": {}},
        headers=headers,
    )
    check("白名单外服务被拒绝(403)", r.status_code == 403 and "不在允许列表" in r.text, f"{r.status_code} {r.text[:160]}")

    # 2) 白名单内服务 + 非法参数 → 422
    r = client.post(
        "/api/v1/ha/services/call",
        json={"domain": "light", "service": "turn_on", "entity_id": "light.x", "data": {"bad_field": 1}},
        headers=headers,
    )
    check("白名单内服务的非法参数被拒绝(422)", r.status_code == 422 and "不允许" in r.text, f"{r.status_code} {r.text[:160]}")

    # 3) 白名单内服务 + 合法参数 → 不是 403/422（HA 未连接会是 409/其他）
    r = client.post(
        "/api/v1/ha/services/call",
        json={"domain": "light", "service": "turn_on", "entity_id": "light.x", "data": {"brightness_pct": 50}},
        headers=headers,
    )
    check(
        "白名单内合法调用未被白名单拦下",
        r.status_code not in (403, 422),
        f"{r.status_code} {r.text[:160]}",
    )

print()
if failures:
    print(f"失败 {len(failures)} 项: {failures}")
    raise SystemExit(1)
print("HA 服务白名单（HTTP 通道）回归通过")
