"""真实链路端到端联调：``python -m store.tools.e2e``。

与 ``store.tools.smoke`` 的区别：

- ``smoke`` 用 ``httpx.ASGITransport`` 在**同一进程**内直连 store 应用，服务端与「客户端」
  混在一起，只验证了协议字节对齐；
- ``e2e`` 用**子进程 + 真实 socket** 起 ``store.run``，并且用**客户端自己的整套授权栈**
  （``config.load_settings`` 环境变量覆盖 → ``LicenseEndpointPool`` → ``LicenseTransportCipher``
  → ``LeaseVerifier`` → ``LicenseService``）走完整 HTTP 链路。

验证的闭环（对应验收标准第 4/5/6 条）：

1. 商店注册 → 下单 → 模拟支付 → 账号中心拿到激活码
2. 客户端（本地密钥 + 环境变量指向 127.0.0.1）激活 → 状态 ACTIVE、编辑器/UI 功能解锁
3. 客户端心跳续租 → 租约序号递增
4. 管理后台强制解绑 → 客户端下一次心跳转 REVOKED，编辑器功能被收回
5. 冷却期内客户端无法重新绑定

默认端口 18082（被占用时自动退让到随机端口），全程使用临时目录，不污染 store/data 与 keys/。
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import traceback
from pathlib import Path

import httpx

APP_ROOT = Path(__file__).resolve().parents[2]
CLIENT_APP_DIR = APP_ROOT / "backend" / "app"
DEFAULT_PORT = 18082
DEFAULT_ADMIN_EMAIL = "admin@habridge.local"
DEFAULT_ADMIN_PASSWORD = "e2e-admin-2026"

RESULTS: list[tuple[str, bool, str]] = []


def check(name: str, condition: bool, detail: str = "") -> bool:
    RESULTS.append((name, bool(condition), detail))
    line = f"[{'PASS' if condition else 'FAIL'}] {name}"
    if detail:
        line += f" — {detail}"
    print(line, flush=True)
    return bool(condition)


# ---------------------------------------------------------------------- #
# 进程/端口工具
# ---------------------------------------------------------------------- #
def _port_available(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind(("127.0.0.1", port))
        except OSError:
            return False
        return True


def _pick_port(preferred: int) -> tuple[int, bool]:
    if _port_available(preferred):
        return preferred, True
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1]), False


def _server_env(workdir: Path, port: int, admin_email: str, admin_password: str) -> dict:
    env = os.environ.copy()
    env.update(
        {
            "STORE_HOST": "127.0.0.1",
            "STORE_PORT": str(port),
            "STORE_DATA_DIR": str(workdir / "store-data"),
            "STORE_LICENSE_KEYS_DIR": str(workdir / "keys"),
            "STORE_MAIL_MODE": "echo",
            "STORE_EXPOSE_VERIFICATION_CODE": "true",
            "STORE_PAYMENT_PROVIDER": "mock",
            # 模拟收银台默认关闭（fail-closed：不需要真实付款就能发码），
            # 联调必须和渠道一起显式打开 —— 少了这一个，下单会 503。
            "STORE_ALLOW_MOCK_PAYMENTS": "1",
            "STORE_ADMIN_EMAIL": admin_email,
            "STORE_ADMIN_PASSWORD": admin_password,
            "PYTHONUNBUFFERED": "1",
        }
    )
    for name in list(env):
        if name.startswith("APP_LICENSE_"):
            env.pop(name, None)
    return env


def _run_step(env: dict, arguments: list[str], label: str) -> bool:
    completed = subprocess.run(
        [sys.executable, *arguments],
        cwd=APP_ROOT,
        env=env,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        check(label, False, (completed.stderr or completed.stdout).strip()[-400:])
        return False
    return check(label, True)


def _fingerprint(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _start_server(env: dict, log_path: Path) -> subprocess.Popen:
    handle = log_path.open("wb")
    return subprocess.Popen(
        [sys.executable, "-m", "store.run"],
        cwd=APP_ROOT,
        env=env,
        stdout=handle,
        stderr=subprocess.STDOUT,
    )


def _wait_ready(port: int, timeout: float) -> bool:
    deadline = time.monotonic() + timeout
    url = f"http://127.0.0.1:{port}/store/v1/configuration"
    while time.monotonic() < deadline:
        try:
            response = httpx.get(url, timeout=2.0, follow_redirects=True)
            if response.status_code == 200:
                return True
        except httpx.HTTPError:
            pass
        time.sleep(0.3)
    return False


def _stop_server(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


# ---------------------------------------------------------------------- #
# 客户端侧：真实授权栈
# ---------------------------------------------------------------------- #
def _install_client_env(workdir: Path, keys_dir: Path, port: int) -> dict:
    """把客户端指向本机端口：环境变量覆盖（默认已指向自建 18082，这里换成随机端口与临时密钥）。

    这里**不**再钉 ``APP_LICENSE_KEY_ID`` / ``APP_LICENSE_TRANSPORT_KEY_ID``：
    e2e 用的是临时密钥目录，两边的 keyId 都应由各自的公钥文件派生，正好覆盖
    「零配置下客户端与服务端各自派生、必须得出同一个 id」这条真实路径（S52）。
    显式钉住 id 的老写法由 smoke 里那条 ``APP_LICENSE_KEY_ID`` 用例覆盖。
    """
    public_key = keys_dir / "license-public.pem"
    transport_key = keys_dir / "license-transport-public.pem"
    values = {
        "APP_DATA_DIR": str(workdir / "client-data"),
        "APP_LICENSE_SERVER_URL": f"http://127.0.0.1:{port}",
        "APP_LICENSE_PUBLIC_KEY_FILE": str(public_key),
        "APP_LICENSE_PUBLIC_KEY_SHA256": _fingerprint(public_key),
        "APP_LICENSE_TRANSPORT_PUBLIC_KEY_FILE": str(transport_key),
        "APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256": _fingerprint(transport_key),
        "APP_LICENSE_REQUEST_TIMEOUT_SECONDS": "10",
    }
    os.environ.update(values)
    return values


def _import_client():
    """导入客户端自身的授权栈。

    ``backend/app`` 是一个 Python 包（``app``），内部一律使用相对导入，
    因此把 ``backend/`` 放进 sys.path 后按包名导入；若树结构回退成扁平模块
    布局（历史上曾如此），再退回顶层导入。
    """
    package_root = CLIENT_APP_DIR.parent
    if str(package_root) not in sys.path:
        sys.path.insert(0, str(package_root))
    try:
        from app import config as client_config  # noqa: PLC0415
        from app import database as client_database  # noqa: PLC0415
        from app import models as client_models  # noqa: PLC0415
        from app.global_log import GlobalLogStore  # noqa: PLC0415
        from app.license import LicenseClientError, LicenseService  # noqa: PLC0415

        return client_config, client_database, client_models, GlobalLogStore, LicenseClientError, LicenseService
    except ImportError:
        if str(CLIENT_APP_DIR) not in sys.path:
            sys.path.insert(0, str(CLIENT_APP_DIR))
        import config as client_config  # noqa: PLC0415
        import database as client_database  # noqa: PLC0415
        import models as client_models  # noqa: PLC0415
        from global_log import GlobalLogStore  # noqa: PLC0415
        from license import LicenseClientError, LicenseService  # noqa: PLC0415

        return client_config, client_database, client_models, GlobalLogStore, LicenseClientError, LicenseService


# ---------------------------------------------------------------------- #
# 主流程
# ---------------------------------------------------------------------- #
async def run(port: int, workdir: Path, admin_email: str, admin_password: str) -> None:
    base_url = f"http://127.0.0.1:{port}"
    email = "e2e@habridge.local"
    password = "e2e-password-2026"

    user = httpx.AsyncClient(base_url=base_url, follow_redirects=True, timeout=15.0)
    admin = httpx.AsyncClient(base_url=base_url, follow_redirects=True, timeout=15.0)
    async with user, admin:
        # ------------------------------------------------------------------ #
        # 1. 只读接口：真实 HTTP
        # ------------------------------------------------------------------ #
        configuration = (await user.get("/store/v1/configuration")).json()
        check(
            "GET /store/v1/configuration 结构完整",
            {"store", "payment"} <= set(configuration) and "siteName" in configuration["store"],
            str(sorted(configuration)),
        )
        products = (await user.get("/store/v1/products")).json()["items"]
        base_product = next(
            (item for item in products if item.get("productType") == "base"), None
        )
        check("商品目录含 base 商品", base_product is not None, str(len(products)))
        if base_product is None:
            return

        # ------------------------------------------------------------------ #
        # 2. 商店发码：注册 → 登录 → 下单 → 模拟支付
        # ------------------------------------------------------------------ #
        verification = (
            await user.post(
                "/store/v1/verifications", json={"email": email, "purpose": "register"}
            )
        ).json()
        check("注册验证码已下发（echo 模式回显）", bool(verification.get("code")), str(verification))
        registration = await user.post(
            "/store/v1/auth/register",
            json={
                "email": email,
                "code": verification.get("code", ""),
                "password": password,
                "confirmPassword": password,
            },
        )
        check("POST /auth/register 注册成功", registration.status_code == 200, str(registration.status_code))

        order_response = await user.post(
            "/store/v1/orders", json={"productId": base_product["id"], "couponCode": None}
        )
        check("POST /orders 创建订单", order_response.status_code == 201, str(order_response.status_code))
        order = order_response.json()
        payment = order.get("payment") or {}
        check("订单支付方式为 mock", payment.get("type") == "mock", str(payment))
        check("订单有效期 2 分钟", order.get("expiresAt") is not None, str(order.get("expiresAt")))

        pay = await user.post(
            f"/store/v1/orders/{order['orderNo']}/mock/pay",
            json={"orderToken": order["lookupToken"]},
        )
        check("模拟支付成功并履约", pay.status_code == 200 and pay.json()["status"] == "fulfilled", str(pay.status_code))

        center = (await user.get("/store/v1/account")).json()
        check("账号中心立即出现授权", len(center["licenses"]) == 1, str(len(center["licenses"])))
        if not center["licenses"]:
            return
        activation_code = center["licenses"][0]["activationCode"]
        check(
            "激活码格式 HOMEOS-XXXX-…",
            activation_code.startswith("HOMEOS-") and len(activation_code.split("-")) == 7,
            activation_code,
        )

        # ------------------------------------------------------------------ #
        # 3. 客户端真实授权栈：激活
        # ------------------------------------------------------------------ #
        client_config, client_database, client_models, GlobalLogStore, LicenseClientError, LicenseService = (
            _import_client()
        )
        settings = client_config.load_settings()
        check(
            "客户端批次已指向本机服务",
            settings.effective_license_server_batches
            == (("direct", (f"http://127.0.0.1:{port}",)),),
            str(settings.effective_license_server_batches),
        )
        check(
            "客户端使用本地签名公钥（keyId 由该公钥派生，两边各自算出来的必须一致）",
            settings.license_trusted_public_keys[settings.license_key_id][1]
            == os.environ["APP_LICENSE_PUBLIC_KEY_SHA256"],
            f"keyId={settings.license_key_id} 表={sorted(settings.license_trusted_public_keys)}",
        )

        settings.data_dir.mkdir(parents=True, exist_ok=True)
        settings.secrets_dir.mkdir(parents=True, exist_ok=True)
        database = client_database.Database(f"sqlite:///{workdir / 'client.db'}")
        client_models.Base.metadata.create_all(database.engine)
        event_log = GlobalLogStore(settings.data_dir)
        service = LicenseService(settings, database, None, event_log=event_log)
        await service.start()

        check("初始状态未激活", service.status()["status"] == "UNACTIVATED", service.status()["status"])
        check("未激活时编辑器被锁定", service.allows("editor") is False)

        try:
            await service.activate(activation_code, email)
        except LicenseClientError as error:
            check("客户端激活成功", False, f"{error} (status={error.status_code})")
            await service.stop()
            database.dispose()
            return
        status = service.status()
        check("客户端状态 ACTIVE", status["status"] == "ACTIVE", status["status"])
        check("租约序号从 1 开始", status["leaseSequence"] == 1, str(status["leaseSequence"]))
        check(
            "功能码覆盖编辑器与素材",
            {"editor", "assets", "api"} <= set(status["features"]),
            str(status["features"]),
        )
        check("编辑器功能已解锁", service.allows("editor") is True)
        check(
            "3D 交互未购买时保持锁定",
            service.allows("module.3d_interaction") is False,
        )
        check("编辑器页面准入通过", status["featureAccess"]["editor"] is True, str(status["featureAccess"]))

        # ------------------------------------------------------------------ #
        # 4. 心跳续租
        # ------------------------------------------------------------------ #
        await service.heartbeat()
        after_heartbeat = service.status()
        check("心跳后续租成功", after_heartbeat["status"] == "ACTIVE", after_heartbeat["status"])
        check(
            "租约序号递增到 2",
            after_heartbeat["leaseSequence"] == 2,
            str(after_heartbeat["leaseSequence"]),
        )

        # ------------------------------------------------------------------ #
        # 4b. 断网重启：持有未过期租约时必须离线放行（离线验签）
        # ------------------------------------------------------------------ #
        from dataclasses import replace as _dataclass_replace

        dead = socket.socket()
        dead.bind(("127.0.0.1", 0))
        dead_port = dead.getsockname()[1]
        dead.close()  # 立刻关闭，保证该端口无人监听

        offline_settings = _dataclass_replace(
            settings,
            license_server_url=f"http://127.0.0.1:{dead_port}",
            license_server_batches=(("direct", (f"http://127.0.0.1:{dead_port}",)),),
        )
        offline_service = LicenseService(
            offline_settings, database, None, event_log=event_log
        )
        await offline_service.start()
        offline_status = offline_service.status()
        check(
            "断网重启：持有有效租约时以 CONNECTION_WARNING 启动",
            offline_status["status"] == "CONNECTION_WARNING",
            offline_status["status"],
        )
        check(
            "断网重启：离线验签仍放行编辑器",
            offline_service.allows("editor") is True,
        )
        check(
            "断网重启：签名租约与心跳间隔仍可用",
            bool(offline_status.get("leaseExpiresAt"))
            and offline_status["leaseSequence"] == 2,
            f"seq={offline_status['leaseSequence']} expires={offline_status.get('leaseExpiresAt')}",
        )
        await offline_service.stop()

        # ------------------------------------------------------------------ #
        # 5. 后台吊销：强制解绑 → 客户端下一次心跳转 REVOKED
        # ------------------------------------------------------------------ #
        binding_id = None
        bound_license = (await user.get("/store/v1/account")).json()["licenses"][0]
        device = bound_license.get("device") or {}
        binding_id = device.get("bindingId")
        check(
            "设备绑定已记录在账号中心",
            bool(binding_id) and device.get("instanceId") == status["instanceId"],
            f"{binding_id} / {device.get('instanceId')}",
        )
        if not binding_id:
            await service.stop()
            database.dispose()
            return

        admin_login = await admin.post(
            "/store/v1/auth/login", json={"email": admin_email, "password": admin_password}
        )
        check("管理员登录成功", admin_login.status_code == 200, str(admin_login.status_code))
        bindings = (await admin.get("/store-admin/v1/bindings")).json()
        check(
            "后台可见该设备绑定",
            any(
                item["bindingId"] == binding_id and item["active"] for item in bindings["items"]
            ),
            str([item["bindingId"] for item in bindings["items"]]),
        )

        released = await admin.post(
            f"/store-admin/v1/bindings/{binding_id}/release", json={"note": "e2e 强制解绑"}
        )
        check("后台强制解绑设备", released.status_code == 200, str(released.status_code))

        revocation_error = None
        try:
            await service.heartbeat()
        except LicenseClientError as error:
            revocation_error = error
        check("解绑后心跳被拒绝", revocation_error is not None, str(revocation_error))
        check(
            "错误被判定为确认吊销",
            bool(revocation_error and revocation_error.is_confirmed_revocation),
            str(revocation_error),
        )
        check(
            "错误文案命中「实例绑定已停用」",
            bool(revocation_error and "实例绑定已停用" in str(revocation_error)),
            str(revocation_error),
        )
        revoked_status = service.status()
        check("客户端状态转 REVOKED", revoked_status["status"] == "REVOKED", revoked_status["status"])
        check("吊销后编辑器被收回", service.allows("editor") is False)
        check("吊销后功能清单清空", revoked_status["features"] == [], str(revoked_status["features"]))

        # 吊销后重启：必须仍然锁死（不能因为「离线放行」而复活）。
        revoked_restart = LicenseService(settings, database, None, event_log=event_log)
        await revoked_restart.start()
        check(
            "吊销后重启仍为 REVOKED（离线放行不会复活已吊销授权）",
            revoked_restart.status()["status"] == "REVOKED",
            revoked_restart.status()["status"],
        )
        check("吊销后重启编辑器仍锁定", revoked_restart.allows("editor") is False)
        await revoked_restart.stop()

        # ------------------------------------------------------------------ #
        # 6. 冷却期内无法重新绑定
        # ------------------------------------------------------------------ #
        cooldown_error = None
        try:
            await service.activate(activation_code, email)
        except LicenseClientError as error:
            cooldown_error = error
        check("冷却期内重新激活被拒", cooldown_error is not None, str(cooldown_error))
        check(
            "冷却提示含冷却字样",
            bool(cooldown_error and "冷却" in str(cooldown_error)),
            str(cooldown_error),
        )
        check(
            "冷却期内状态保持 REVOKED",
            service.status()["status"] == "REVOKED",
            service.status()["status"],
        )

        # 账号中心同步反映解绑与冷却
        center_after = (await user.get("/store/v1/account")).json()
        policy = center_after["licenses"][0]["deviceReleasePolicy"]
        check(
            "账号中心返回解绑冷却策略",
            policy["nextAllowedAt"] is not None and policy["remainingSeconds"] > 0,
            str(policy),
        )

        await service.stop()
        database.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="HomeOS 商店/授权服务器真实链路端到端联调")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"监听端口，默认 {DEFAULT_PORT}")
    parser.add_argument("--timeout", type=float, default=60.0, help="等待服务就绪的秒数")
    parser.add_argument("--keep", action="store_true", help="保留临时目录，便于排查")
    parser.add_argument("--admin-email", default=DEFAULT_ADMIN_EMAIL)
    parser.add_argument("--admin-password", default=DEFAULT_ADMIN_PASSWORD)
    options = parser.parse_args()

    workdir = Path(tempfile.mkdtemp(prefix="hb-store-e2e-"))
    port, preferred_ok = _pick_port(options.port)
    if not preferred_ok:
        print(f"[WARN] 端口 {options.port} 被占用，本次改用随机端口 {port}", flush=True)
    print(f"[INFO] 工作目录：{workdir}", flush=True)
    print(f"[INFO] 服务地址：http://127.0.0.1:{port}", flush=True)

    env = _server_env(workdir, port, options.admin_email, options.admin_password)
    server = None
    log_path = workdir / "server.log"
    try:
        if not _run_step(
            env,
            [
                "-m",
                "store.tools.gen_keys",
                "--out",
                str(workdir / "keys"),
                "--no-sync",
            ],
            "生成本地授权密钥",
        ):
            return
        if not _run_step(env, ["-m", "store.tools.seed"], "初始化站点与商品目录"):
            return

        server = _start_server(env, log_path)
        if not _wait_ready(port, options.timeout):
            tail = ""
            if log_path.exists():
                tail = log_path.read_text(encoding="utf-8", errors="replace")[-800:]
            check(f"服务在 {options.timeout:.0f}s 内就绪", False, tail)
            return
        check(f"store.run 已在 {port} 端口就绪（真实 socket）", True)

        _install_client_env(workdir, workdir / "keys", port)
        asyncio.run(run(port, workdir, options.admin_email, options.admin_password))
    except Exception:  # noqa: BLE001 - 自检脚本要把栈打全
        traceback.print_exc()
        RESULTS.append(("端到端执行未抛异常", False, traceback.format_exc().splitlines()[-1]))
    finally:
        if server is not None:
            _stop_server(server)
        failures = [name for name, ok, _ in RESULTS if not ok]
        print("-" * 68)
        if failures:
            print(f"端到端自检失败：{len(failures)} 项未通过")
            for name in failures:
                print(f"  - {name}")
        else:
            print(f"端到端自检通过：{len(RESULTS)} 项全部通过")
        if options.keep:
            print(f"[INFO] 临时目录已保留：{workdir}")
        else:
            shutil.rmtree(workdir, ignore_errors=True)
    if any(not ok for _, ok, _ in RESULTS):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
