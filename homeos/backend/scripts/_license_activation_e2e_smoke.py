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
    否则从 ``LICENSE_E2E_STORE_DB``（默认 ``homeos-store/data/store.db``）里挑一条
    **本冒烟可以安全占用**的授权（见 ``_pick_credentials``）。

设备身份隔离（**这个脚本曾经的坑**）：
    主应用的 instanceId 由**宿主机的硬件指纹**派生（machine-id + 主板 DMI），
    **不受 ``HOMEOS_DATA_DIR`` 影响** —— 所以「用临时数据目录」并不等于「用临时实例」。
    若沿用真实指纹，冒烟就是**以这台开发机的身份**去激活，而商店侧 ``ensure_binding``
    在「同实例重新激活」分支会删掉该绑定上既有的**全部会话与恢复令牌**：正在运行的
    开发实例会被就地踢下线（``RECOVERY_REQUIRED``），门禁随即把它所有业务接口打成
    401 ``LICENSE_INACTIVE``。
    因此这里钉住一组**合成**硬件标识（``APP_HARDWARE_MACHINE_ID`` /
    ``APP_HARDWARE_BOARD_ID``，与主应用同一份 ``hardware_instance_id`` 口径），
    让冒烟在商店眼里就是**另一台设备**；并且只挑「已绑给自己」或「还没人绑」的授权，
    宁可 SKIP 也不抢正在服役的那条。
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
# 冒烟自己的设备身份（见模块 docstring）：合成标识 → 稳定且与开发实例不同。
# 必须在 import src.config 之前设好：Settings 在导入期构造。
os.environ.setdefault("APP_HARDWARE_MACHINE_ID", "homeos-e2e-smoke-machine")
os.environ.setdefault("APP_HARDWARE_BOARD_ID", "homeos-e2e-smoke-board")
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


def _smoke_instance_id() -> str:
    """算出本脚本会使用的 instanceId（与主应用同一份 ``hardware_instance_id`` 口径）。

    复用主应用自己的实现而不是在这里重写哈希公式：公式一改口径就会分叉，
    而分叉的后果正是本脚本要避免的那种「认错设备」。
    """
    from src.services.license.hardware import hardware_instance_id

    return hardware_instance_id(
        machine_override=os.environ["APP_HARDWARE_MACHINE_ID"],
        board_override=os.environ["APP_HARDWARE_BOARD_ID"],
        required=False,
    )


def _pick_credentials(smoke_instance_id: str) -> tuple[str, str, str]:
    """挑一条**本冒烟可以安全使用**的授权，返回 ``(激活码, 邮箱, 说明)``。

    绝不占用「已绑定到别的实例且仍然活着」的授权 —— 那会删掉那条绑定上的会话与恢复
    令牌，等于把正在运行的实例踢下线（正是本脚本踩过的坑）。优先级：

    1. 已经绑定到**本冒烟实例**的授权：重复跑时幂等复用；
    2. 没有任何活绑定的 active 授权：还没人用，安全；
    3. 都不满足：返回空串 + 原因，由调用方 SKIP（宁可跳过，也不抢别人）。
    """
    if not STORE_DB.is_file():
        return "", "", f"商店库不存在：{STORE_DB}"
    try:
        connection = sqlite3.connect(f"file:{STORE_DB}?mode=ro", uri=True)
    except sqlite3.Error as error:
        return "", "", f"商店库打不开：{error}"

    try:
        licenses = connection.execute(
            """
            SELECT l.id, l.activation_code, COALESCE(c.email, a.email, '')
            FROM licenses l
            LEFT JOIN customers c ON c.id = l.customer_id
            LEFT JOIN accounts  a ON a.id = l.account_id
            WHERE l.active = 1 AND l.revoked_at IS NULL
            ORDER BY l.created_at DESC
            """
        ).fetchall()
        try:
            binding_rows = connection.execute(
                "SELECT license_id, instance_id FROM device_bindings"
                " WHERE active = 1 AND released_at IS NULL"
            ).fetchall()
        except sqlite3.Error:
            # 老库/精简库可能没有绑定表：按「没有活绑定」处理会误判成可抢，
            # 因此宁可视作「信息不足」，全部跳过。
            binding_rows = None
    except sqlite3.Error as error:
        return "", "", f"读取商店库失败：{error}"
    finally:
        connection.close()

    if binding_rows is None:
        return "", "", "商店库缺少 device_bindings（无法判断绑定归属），不冒险占用授权"

    live: dict[str, set[str]] = {}
    for license_id, instance_id in binding_rows:
        live.setdefault(str(license_id), set()).add(str(instance_id))

    for license_id, code, email in licenses:
        if code and email and smoke_instance_id in live.get(str(license_id), set()):
            return str(code), str(email), "复用本冒烟实例既有的绑定"
    for license_id, code, email in licenses:
        if code and email and not live.get(str(license_id)):
            return str(code), str(email), "占用尚未绑定的闲置授权"
    return "", "", (
        "商店里没有本冒烟能安全使用的授权：active 授权都已绑定到其他实例。"
        f"请为冒烟单独签发一条（当前合成实例 {smoke_instance_id[:12]}…），"
        "或用 LICENSE_E2E_CODE / LICENSE_E2E_EMAIL 显式指定一条未被占用的授权"
    )


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

    smoke_instance = _smoke_instance_id()
    code = os.getenv("LICENSE_E2E_CODE", "").strip()
    email = os.getenv("LICENSE_E2E_EMAIL", "").strip().lower()
    reason = "来自 LICENSE_E2E_CODE / LICENSE_E2E_EMAIL"
    if not code or not email:
        code, email, reason = _pick_credentials(smoke_instance)
    if not code or not email:
        skip(f"{reason}（商店库：{STORE_DB}）")

    print(f"授权商店：{STORE_URL}")
    print(f"激活邮箱：{email}")
    print(f"激活码提示：…{code[-9:]}")
    print(f"冒烟实例：{smoke_instance[:16]}…（{reason}）")
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
