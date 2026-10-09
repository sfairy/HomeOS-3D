"""授权门禁端到端冒烟：``LICENSE_REQUIRED=1`` + **真实本地商店** 的 注册 → 登录 → 激活。

与 ``_register_login_activate_smoke.py`` 的分工：

- 那个脚本验证的是**契约面**（未登录 401、参数透传、授权后台不可达时 422 且不误判为已授权），
  故意指向一个连不上的后台，不伪造签名租约；
- 本脚本验证**真实闭环**：把激活打到本地运行的授权商店，由商店用**它自己的私钥**签发租约，
  再断言主应用离线验签通过并放行。这是「授权检测到底通不通」的唯一硬证据。

覆盖：

1. 全新库 + 门禁开启 → 未激活时 ``allowed=false``（门禁确实关着，不是漏检）；
2. 注册 + 登录（验证码走进程内假实现，不碰网络）；
3. ``POST /license/activate`` 打真实商店 → ``status=ACTIVE``、``allowed=true``、功能码下发；
4. **重启后不要求重新激活**：同一个数据目录再起一次 lifespan，租约从库里读回并验签通过
   （启动期会先进入 ``STARTUP_VALIDATION_REQUIRED``，联网确认后转 ``ACTIVE``，脚本按此轮询）；
5. 反例：错误激活码不得把状态推进成已授权。

需要在**本机商店已运行**的前提下执行；商店不可达时打印 SKIP 并以 0 退出，
因此可以安全地挂在任何位置而不会在 CI 里无故变红。

激活码来源（按优先级）：
    ``LICENSE_E2E_CODE`` / ``LICENSE_E2E_EMAIL`` 环境变量；
    否则从 ``LICENSE_E2E_STORE_DB``（默认 ``homeos-store/data/store.db``）里取最近一条 active 授权。
"""

from __future__ import annotations

import hashlib
import os
import sqlite3
import sys
import tempfile
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
KEYS_DIR = REPO_ROOT / "keys"
STORE_URL = os.getenv("LICENSE_E2E_STORE_URL", "http://127.0.0.1:8802").rstrip("/")
STORE_DB = Path(
    os.getenv("LICENSE_E2E_STORE_DB", str(REPO_ROOT / "homeos-store" / "data" / "store.db"))
)

# ── 环境必须在 import src.app / src.config 之前设好（Settings 在导入期构造）──
data_dir = Path(tempfile.mkdtemp(prefix="homeos-license-e2e-"))
os.environ["HOMEOS_DATA_DIR"] = str(data_dir)
os.environ["HOMEOS_DATABASE_URL"] = f"sqlite:///{data_dir / 'homeos.db'}"
os.environ["REDIS_URL"] = ""
os.environ["LICENSE_REQUIRED"] = "1"
os.environ["APP_LICENSE_SERVER_URL"] = STORE_URL
os.environ["STORE_URL"] = STORE_URL
os.environ["HA_BASE_URL"] = ""
os.environ["UPDATE_CHECKS_ENABLED"] = "0"


def _apply_key_env() -> None:
    """按实际公钥文件现算指纹注入——与 ``ops/license_keys.py`` / ``ops/dev.mjs`` 同口径。

    主应用启动期会无条件核对 transport 公钥的 sha256，写死常量必然对不上；
    所以这里读仓库根 ``keys/``（由商店公钥镜像而来），从字节算指纹。
    """
    signing = KEYS_DIR / "license-public.pem"
    transport = KEYS_DIR / "license-transport-public.pem"
    if not signing.is_file() or not transport.is_file():
        raise SystemExit(f"缺少授权公钥：{KEYS_DIR}（先跑一次 bun run dev 或 python -m ops.license_keys dev-env）")
    os.environ["APP_LICENSE_PUBLIC_KEY_FILE"] = str(signing)
    os.environ["APP_LICENSE_TRANSPORT_PUBLIC_KEY_FILE"] = str(transport)
    os.environ["APP_LICENSE_PUBLIC_KEY_SHA256"] = hashlib.sha256(signing.read_bytes()).hexdigest()
    os.environ["APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256"] = hashlib.sha256(
        transport.read_bytes()
    ).hexdigest()


_apply_key_env()

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx
from _smoke_auth_support import csrf_headers, install_fake_verification, register_local_user
from fastapi.testclient import TestClient
from src.app import create_app
from src.services.license import features as feature_codes

#: 目录里全部增量模块码：featureAccess 必须逐个下发，前端才能按标志显隐入口。
MODULE_FEATURE_CODES = sorted(feature_codes.MODULE_FEATURES)

USERNAME = "e2euser"
EMAIL = "e2e@example.com"
PASSWORD = "LicenseE2ePass123"

failures: list[str] = []


def check(label: str, condition: bool, detail: object = "") -> None:
    mark = "PASS" if condition else "FAIL"
    print(f"  [{mark}] {label} {detail if not condition else ''}")
    if not condition:
        failures.append(label)


def skip(reason: str) -> None:
    print(f"SKIP — {reason}")
    raise SystemExit(0)


def _store_reachable() -> bool:
    try:
        httpx.get(f"{STORE_URL}/healthz", timeout=2.0)
        return True
    except httpx.HTTPError:
        return False


def _credentials_from_store_db() -> tuple[str, str]:
    """取最近一条 active 授权作为激活凭据（本地开发免手工复制激活码）。"""
    if not STORE_DB.is_file():
        return "", ""
    try:
        connection = sqlite3.connect(f"file:{STORE_DB}?mode=ro", uri=True)
    except sqlite3.Error:
        return "", ""
    try:
        row = connection.execute(
            """
            SELECT l.activation_code, COALESCE(c.email, a.email, '')
            FROM licenses l
            LEFT JOIN customers c ON c.id = l.customer_id
            LEFT JOIN accounts  a ON a.id = l.account_id
            WHERE l.active = 1
            ORDER BY l.created_at DESC
            LIMIT 1
            """
        ).fetchone()
    except sqlite3.Error:
        return "", ""
    finally:
        connection.close()
    if not row:
        return "", ""
    return str(row[0] or ""), str(row[1] or "")


def _wait_for_active(client, timeout_seconds: float = 20.0) -> dict:
    """轮询直到状态落到 ACTIVE（启动期会先报 STARTUP_VALIDATION_REQUIRED，等联网确认）。"""
    deadline = time.monotonic() + timeout_seconds
    payload: dict = {}
    while time.monotonic() < deadline:
        response = client.get("/api/v1/license/status")
        if response.status_code == 200:
            payload = response.json()
            if str(payload.get("status")) == "ACTIVE":
                return payload
        time.sleep(0.4)
    return payload


def _wait_for_active_public(client, timeout_seconds: float = 20.0) -> dict:
    """同上，但走**公开**的 ``/license/availability``（无需登录会话）。

    重启后的新 client 没有会话 Cookie，而 ``/license/status`` 要求登录态；
    ``availability`` 同样下发 ``status`` / ``allowed``，足以断言「租约读回并通过验签」。
    """
    deadline = time.monotonic() + timeout_seconds
    payload: dict = {}
    while time.monotonic() < deadline:
        response = client.get("/api/v1/license/availability")
        if response.status_code == 200:
            payload = response.json()
            if str(payload.get("status")) == "ACTIVE":
                return payload
        time.sleep(0.4)
    return payload


def main() -> int:
    if not _store_reachable():
        skip(f"本地授权商店不可达（{STORE_URL}），本脚本需要真实商店签发租约")

    code = os.getenv("LICENSE_E2E_CODE", "").strip()
    email = os.getenv("LICENSE_E2E_EMAIL", "").strip().lower()
    if not code or not email:
        code, email = _credentials_from_store_db()
    if not code or not email:
        skip(f"商店里没有可用授权（{STORE_DB}）；先跑 tools/issue_dev_license.py 签发一条")

    print(f"授权商店：{STORE_URL}")
    print(f"激活邮箱：{email}")
    print(f"激活码提示：…{code[-9:]}")
    print()

    print("1) 全新库 + 门禁开启：未激活时必须是「不放行」")
    app = create_app()
    with TestClient(app) as client:
        install_fake_verification(app)
        response = client.get("/api/v1/license/availability")
        check("GET /license/availability 200", response.status_code == 200, response.status_code)
        payload = response.json() if response.status_code == 200 else {}
        check("required=true（门禁确实开着）", payload.get("required") is True, payload)
        check("allowed=false（未激活不放过）", payload.get("allowed") is False, payload)

        print("2) 注册 + 登录（首装入口）")
        response = register_local_user(client, app, username=USERNAME, email=EMAIL, password=PASSWORD)
        check("POST /auth/register 201", response.status_code == 201, f"{response.status_code} {response.text[:200]}")
        check("注册后自动登录", client.cookies.get("auth_token") is not None, client.cookies)

        print("3) 反例：错误激活码不得放行")
        headers = csrf_headers(client, app)
        response = client.post(
            "/api/v1/license/activate",
            json={"email": email, "activationCode": "HOMEOS-0000-0000-0000-0000-0000-0000"},
            headers=headers,
        )
        check("错误激活码被商店拒绝（422）", response.status_code == 422, f"{response.status_code} {response.text[:200]}")
        payload = client.get("/api/v1/license/availability").json()
        check("错误码之后仍 allowed=false", payload.get("allowed") is False, payload)

        print("4) 真激活：打本地商店，等它用自己私钥签发租约")
        response = client.post(
            "/api/v1/license/activate",
            json={"email": email, "activationCode": code},
            headers=headers,
        )
        check(
            "POST /license/activate 成功（Nest 风格 201）",
            response.status_code in (200, 201),
            f"{response.status_code} {response.text[:300]}",
        )
        status = _wait_for_active(client)
        check("状态落到 ACTIVE（离线验签通过）", str(status.get("status")) == "ACTIVE", status.get("status"))
        features = status.get("features") or []
        check("功能码已下发（editor）", "editor" in features, features[:12])
        check("功能码含模块（module.*）", any(str(f).startswith("module.") for f in features), features[:12])
        access = status.get("featureAccess") or {}
        check("featureAccess.editor=true", access.get("editor") is True, access)
        # 「面板清单」与「门禁明细」必须同源：租约里签了的模块码，featureAccess 里也必须放行，
        # 否则界面按未开通收起入口、接口却 403 放行 —— 这类分叉曾反复出现，这里钉死。
        ungated = [str(code) for code in features if str(code).startswith("module.") and access.get(str(code)) is not True]
        check("租约的每个模块码都在 featureAccess 里放行", not ungated, ungated or access)
        check(
            "featureAccess 的模块键覆盖全部目录模块码",
            all(str(code) in access for code in MODULE_FEATURE_CODES),
            sorted(set(MODULE_FEATURE_CODES) - set(access)),
        )
        check("activationEmail 回显为本机邮箱", str(status.get("activationEmail") or "") != "", status.get("activationEmail"))

        payload = client.get("/api/v1/license/availability").json()
        check("门禁转为放行 allowed=true", payload.get("allowed") is True, payload)
        check("editorAllowed=true", payload.get("editorAllowed") is True, payload)

    print("5) 重启不要求重新激活：同数据目录再起一次 lifespan")
    restarted = create_app()
    with TestClient(restarted) as client:
        status = _wait_for_active_public(client)
        check(
            "重启后仍为 ACTIVE（租约从库里读回并验签）",
            str(status.get("status")) == "ACTIVE",
            status.get("status"),
        )
        check("重启后门禁放行 allowed=true", status.get("allowed") is True, status)

    print()
    if failures:
        print(f"SMOKE FAILED ({len(failures)}): {failures}")
        return 1
    print("SMOKE OK — 真商店授权闭环：未激活拦截 → 激活放行 → 重启免重激活")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
