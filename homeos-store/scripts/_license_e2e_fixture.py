"""授权激活端到端冒烟的**自足夹具**：现造一个临时商店，再驱动主应用侧的 e2e。

为什么需要它：``homeos/backend/scripts/_license_activation_e2e_smoke.py``（主应用侧）此前
要求「本机商店已运行，且商店库里能挑到一条可安全占用的授权」。CI 里这两条都不成立 ——
于是那条脚本整条 SKIP，而 **SKIP 不是覆盖**：「授权闭环到底通不通」这个全仓最关键的
业务假设，在 CI 里从未被执行过一次（这正是 P1 覆盖补齐要堵的洞）。

本夹具把前置条件**现造**出来，并且全部隔离在临时目录里：

1. 临时 data 目录 + 临时密钥目录（``STORE_LICENSE_KEYS_DIR`` 指向非默认目录，商店启动
   时会自己生成一对密钥，也不会去核对仓库根 ``keys/`` 的公钥镜像）+ 随机空闲端口；
2. 先在自己进程里跑一遍商店 lifespan（建库 / 生成密钥 / 写默认商品），再补一条
   **已知明文**的邮箱验证码 —— 正常注册路径只把随机码发给邮件，夹具拿不到它；
3. 起真实 uvicorn 子进程（``python -m src.run``）并等 ``/healthz`` —— 主应用激活走的是
   HTTP，进程内 TestClient 顶替不了这一步；
4. 全程走 HTTP 造出「可激活的授权」：``/store/v1/setup/admin`` 建管理员 → 顾客注册 →
   后台人工签发授权（特意挑**功能码最全**的商品，因为 e2e 会断言 ``module.*`` 真的下发；
   挑基础版会让那句断言变成空真）；
5. 以子进程方式跑主应用 e2e，把商店地址 / 激活码 / 邮箱 / 公钥目录用环境变量注入；
6. 断言 e2e 退出码为 0 **且日志里没有 SKIP** —— 夹具存在的全部意义就是不许再静默跳过。

退出码语义与其它冒烟一致：任何一项失败 → 非 0。
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time

from _smoke_harness import (
    BACKEND,
    STORE_ROOT,
    bootstrap_env,
    check,
    expect,
    expect_true,
    report,
    temp_dir,
)

REPO_ROOT = STORE_ROOT.parent
E2E_SCRIPT = REPO_ROOT / "homeos" / "backend" / "scripts" / "_license_activation_e2e_smoke.py"

SETUP_TOKEN = "license-e2e-fixture-setup-token"
ADMIN_EMAIL = "fixture-admin@example.test"
ADMIN_PASSWORD = "FixtureAdminPass123"
CUSTOMER_EMAIL = "fixture-customer@example.test"
CUSTOMER_USERNAME = "fixture-customer"
CUSTOMER_PASSWORD = "FixtureCustomerPass123"
REGISTER_CODE = "135790"

#: 商店冷启动（导入 + 建库 + 生成密钥）在本机约 2~4s，CI 慢一档；给足但不无限等。
STORE_START_TIMEOUT_SECONDS = 120.0
E2E_TIMEOUT_SECONDS = 300.0


def _free_port() -> int:
    """借内核要一个空闲端口：绑 0 取端口后立刻释放（不监听，故不跨进程传递 fd）。"""
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


DATA_DIR = temp_dir("homeos-store-license-e2e-data-")
KEYS_DIR = temp_dir("homeos-store-license-e2e-keys-")
# `create_app()` 按 `static_dir` mount `StaticFiles` / `fonts`，目录不存在就硬报错
# （生产上这是对的：构建缺失必须响亮）。本 e2e 验的是授权激活闭环，不是静态文件服务，
# 不该顺带要求先构建一次商店前端 —— 干净检出（CI）上 `dist/static` 本来就不存在。
# 把两个挂载点指到临时目录：in-process 的 lifespan 与子进程都读同一份 env。
STATIC_DIR = temp_dir("homeos-store-license-e2e-static-")
SHELL_DIR = temp_dir("homeos-store-license-e2e-shell-")
(STATIC_DIR / "fonts").mkdir(parents=True, exist_ok=True)
PORT = _free_port()
ORIGIN = f"http://127.0.0.1:{PORT}"
STORE_API = "/store/v1"
ADMIN_API = "/store-admin/v1"

# ── 环境必须在 import src.* 之前落位（StoreSettings 在导入期构造）────────────────
DATA_DIR = bootstrap_env(
    prefix="homeos-store-license-e2e-",
    data_dir=DATA_DIR,
    extra_env={
        "STORE_HOST": "127.0.0.1",
        "STORE_PORT": str(PORT),
        "STORE_SETUP_TOKEN": SETUP_TOKEN,
        "STORE_LICENSE_KEYS_DIR": str(KEYS_DIR),
        # 静态/外壳挂载点指向临时目录（见上方 STATIC_DIR 的说明）：本 e2e 不依赖前端构建产物。
        "STORE_STATIC_DIR": str(STATIC_DIR),
        "STORE_SHELL_DIR": str(SHELL_DIR),
        "STORE_MAIL_MODE": "log",
        "STORE_PAYMENT_PROVIDER": "",
        # 关掉热重载：开发机 shell 里若开着 STORE_RELOAD，uvicorn 会 fork 一个 reloader，
        # 夹具的 terminate() 就只能杀掉父进程，留下孤儿占着端口。
        "STORE_RELOAD": "",
        # 0 = 关闭定时拉取 GitHub Releases：夹具要离线自足，不许联网。
        "STORE_RELEASE_SYNC_INTERVAL_SECONDS": "0",
    },
)

import httpx
from fastapi.testclient import TestClient
from src.app import create_app
from src.core.models import EmailVerification
from src.security.security import code_hash, new_code_salt, utcnow

# 夹具在步骤之间传递的产物（激活码 / 商品 id）。
_STATE: dict[str, str] = {}
_STORE_LOG = DATA_DIR.parent / "store.log"
_LOG_HANDLE = None


def _prepare_database() -> None:
    """在夹具进程里跑一遍商店 lifespan：建库、生成密钥、写默认商品。

    这样做的另一个好处是**失败面清晰**：如果商店连库都建不起来，报错出现在夹具自己
    的断言里，而不是子进程日志深处。子进程随后复用同一份库与密钥。
    """
    from datetime import timedelta

    app = create_app()
    with TestClient(app):
        salt = new_code_salt()
        with app.state.database.session() as session:
            session.add(
                EmailVerification(
                    email=CUSTOMER_EMAIL,
                    purpose="register",
                    code_hash=code_hash(REGISTER_CODE, salt),
                    code_salt=salt,
                    expires_at=utcnow() + timedelta(minutes=30),
                )
            )


def _start_store() -> subprocess.Popen:
    """起商店子进程；日志落到文件，失败时打印尾部（否则一屏 traceback 没人看）。

    ``_LOG_HANDLE`` 是模块级的：只要 Popen 活着就不能让文件对象被 GC 回收，否则子进程
    写日志会撞上「已关闭的文件描述符」。
    """
    global _LOG_HANDLE
    _LOG_HANDLE = _STORE_LOG.open("w", encoding="utf-8")
    return subprocess.Popen(
        [sys.executable, "-m", "src.run"],
        cwd=str(BACKEND),
        env=os.environ.copy(),
        stdout=_LOG_HANDLE,
        stderr=subprocess.STDOUT,
    )


def _store_log_tail(lines: int = 40) -> str:
    try:
        text = _STORE_LOG.read_text(encoding="utf-8", errors="replace")
    except OSError as error:
        return f"（读不到商店日志：{error}）"
    return "\n".join(text.splitlines()[-lines:])


def _wait_for_healthz(process: subprocess.Popen) -> None:
    deadline = time.monotonic() + STORE_START_TIMEOUT_SECONDS
    while True:
        if process.poll() is not None:
            raise AssertionError(
                f"商店子进程提前退出（退出码 {process.returncode}）。日志尾部：\n{_store_log_tail()}"
            )
        try:
            response = httpx.get(f"{ORIGIN}/healthz", timeout=2.0)
        except httpx.HTTPError:
            response = None
        if response is not None and response.status_code == 200:
            return
        if time.monotonic() >= deadline:
            raise AssertionError(
                f"商店在 {STORE_START_TIMEOUT_SECONDS:.0f}s 内没起来（GET {ORIGIN}/healthz）。"
                f"日志尾部：\n{_store_log_tail()}"
            )
        time.sleep(0.2)


def _setup_admin(client: httpx.Client) -> None:
    response = client.post(
        f"{STORE_API}/setup/admin",
        json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "confirm_password": ADMIN_PASSWORD,
            "setup_token": SETUP_TOKEN,
        },
    )
    expect(response.status_code, 201, f"{response.status_code} {response.text[:200]}")
    expect_true(
        client.cookies.get("homeos_store_session") is not None,
        "初始化后没拿到管理员会话 Cookie",
    )


def _pick_richest_product(client: httpx.Client) -> None:
    """挑功能码最多的商品：e2e 会断言租约里真的下发 ``module.*``，基础版不满足。"""
    response = client.get(f"{ADMIN_API}/products", params={"limit": 200})
    expect(response.status_code, 200, f"{response.status_code} {response.text[:200]}")
    items = response.json().get("items") or []
    expect_true(bool(items), "后台商品列表为空：默认商品没写进库？")

    def score(item: dict) -> int:
        return len(item.get("featureCodes") or [])

    best = max(items, key=score)
    codes = [str(code) for code in (best.get("featureCodes") or [])]
    expect_true(
        any(code.startswith("module.") for code in codes),
        f"功能码最全的商品也只有 {codes} —— 没有 module.* 码，e2e 的模块断言会退化成空真",
    )
    _STATE["product_id"] = str(best.get("id"))
    _STATE["product_codes"] = ",".join(codes)


def _register_customer() -> None:
    """注册顾客（用夹具预置的明文验证码）。单独一个 client 是为了拿顾客会话。"""
    with httpx.Client(base_url=ORIGIN, headers={"Origin": ORIGIN}, timeout=15.0) as customer:
        response = customer.post(
            f"{STORE_API}/auth/register",
            json={
                "username": CUSTOMER_USERNAME,
                "email": CUSTOMER_EMAIL,
                "code": REGISTER_CODE,
                "password": CUSTOMER_PASSWORD,
            },
        )
        expect(response.status_code, 200, f"{response.status_code} {response.text[:200]}")
        expect_true(
            customer.cookies.get("homeos_store_session") is not None,
            "注册后没拿到顾客会话 Cookie",
        )


def _issue_license(client: httpx.Client) -> None:
    response = client.post(
        f"{ADMIN_API}/licenses",
        json={"email": CUSTOMER_EMAIL, "productId": _STATE["product_id"]},
    )
    expect(response.status_code, 200, f"{response.status_code} {response.text[:200]}")
    payload = response.json()
    code = str(payload.get("activationCode") or "")
    expect_true(bool(code), f"后台签发没回激活码：{str(payload)[:200]}")
    _STATE["activation_code"] = code


def _run_main_app_e2e() -> None:
    """跑主应用 e2e；把夹具造出来的商店坐标注入给它。

    ``LICENSE_E2E_KEYS_DIR`` 指向夹具的临时密钥目录：商店刚才在那里生成密钥，主应用必须
    用**同一对公钥**验签，否则验签失败会把「闭环通」误判成「不通」。
    """
    env = os.environ.copy()
    env["LICENSE_E2E_STORE_URL"] = ORIGIN
    env["LICENSE_E2E_CODE"] = _STATE["activation_code"]
    env["LICENSE_E2E_EMAIL"] = CUSTOMER_EMAIL
    env["LICENSE_E2E_KEYS_DIR"] = str(KEYS_DIR)
    # 夹具已经把商店库锁死在临时目录，显式清掉「从库里挑一条」的入口变量，避免误读真库。
    env.pop("LICENSE_E2E_STORE_DB", None)

    result = subprocess.run(
        [sys.executable, str(E2E_SCRIPT)],
        check=False,
        cwd=str(REPO_ROOT),
        env=env,
        capture_output=True,
        text=True,
        timeout=E2E_TIMEOUT_SECONDS,
    )
    output = f"{result.stdout}\n{result.stderr}".strip()
    print(output)
    expect(result.returncode, 0, f"主应用 e2e 退出码 {result.returncode}；输出见上")
    expect_true(
        "SKIP" not in output,
        "主应用 e2e 报 SKIP —— 夹具的职责就是把它变成真跑（SKIP 等于什么都没验证）",
    )


def main() -> None:
    print(f"夹具数据目录：{DATA_DIR}")
    print(f"夹具密钥目录：{KEYS_DIR}")
    print(f"夹具商店地址：{ORIGIN}")
    print()

    check("商店库与密钥落位（在自己的进程里先跑一遍 lifespan）", _prepare_database)

    process = _start_store()
    try:
        check("商店子进程起来并响应 /healthz", lambda: _wait_for_healthz(process))

        with httpx.Client(base_url=ORIGIN, headers={"Origin": ORIGIN}, timeout=20.0) as admin:
            check(
                "首次初始化：管理员会话（201 + Cookie）",
                lambda: _setup_admin(admin),
            )
            check(
                "挑到功能码最全的商品（含 module.*）",
                lambda: _pick_richest_product(admin),
            )
            check("顾客注册（夹具预置验证码）", _register_customer)
            check(
                "后台人工签发授权 → 拿到激活码",
                lambda: _issue_license(admin),
            )

        print()
        print("—— 交给主应用侧 e2e ——")
        check("主应用 e2e 真跑（不许 SKIP）并通过", _run_main_app_e2e)
    finally:
        process.terminate()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=15)
        if _LOG_HANDLE is not None:
            _LOG_HANDLE.close()

    report("SMOKE OK — 授权 e2e 夹具：临时商店签发 → 主应用激活闭环跑通")


if __name__ == "__main__":
    main()
