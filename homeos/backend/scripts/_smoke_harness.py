"""主应用冒烟脚本共用夹具：环境引导、断言收尾、注册/登录契约。

此前每个 ``*_smoke.py`` 各自复制一套「设 HOMEOS_* 环境变量 → 插 sys.path → 定义
``check()`` / ``failures`` → 结尾判失败退出」，5~11 份副本彼此漂移（连 ``check`` 的
语义都有两种）。这里收敛成一份，脚本只保留自己的断言。

用法（环境必须在 import ``src.*`` 之前设好 —— ``Settings`` 在导入期构造）::

    from _smoke_harness import bootstrap_env, check, report

    bootstrap_env(prefix="homeos-p51-")          # 设环境 + 把 backend/ 加入 sys.path

    from fastapi.testclient import TestClient     # 之后的 import 才看得到临时数据目录
    from src.app import create_app

    def main() -> None:
        app = create_app()
        with TestClient(app) as client:
            check("……", True)
        report("HA 服务白名单（HTTP 通道）回归通过")

    if __name__ == "__main__":
        main()

脚本直接以 ``python <script>.py`` 运行时，``sys.path[0]`` 就是脚本目录，因此
``import _smoke_harness`` 无需手动插路径。
"""

from __future__ import annotations

import os
import sys
import tempfile
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

# ── 环境引导 ────────────────────────────────────────────────────────────────


def ensure_backend_on_path() -> None:
    """把 ``homeos/backend``（``src`` 包的 import 根）加入 ``sys.path``。"""
    backend_dir = Path(__file__).resolve().parent.parent
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))


def bootstrap_env(
    *,
    prefix: str = "homeos-smoke-",
    license_required: bool = False,
    ha_base_url: str = "",
    data_dir: Path | None = None,
    extra_env: dict[str, str] | None = None,
) -> Path:
    """在 import ``src.*`` 之前把数据目录/库指向临时目录，并关掉无关的网络行为。

    返回使用的临时数据目录。``extra_env`` 用于脚本专属变量（授权地址、合成硬件标识等）。

    ``UPDATE_CHECKS_ENABLED=0`` 现在真的会被 ``src.config.load_settings`` 读取（此前是
    无人问津的死变量），冒烟因此不再在 lifespan 里真的联网查更新。
    """
    resolved = Path(data_dir) if data_dir is not None else Path(tempfile.mkdtemp(prefix=prefix))
    os.environ["HOMEOS_DATA_DIR"] = str(resolved)
    os.environ["HOMEOS_DATABASE_URL"] = f"sqlite:///{resolved / 'homeos.db'}"
    os.environ["LICENSE_REQUIRED"] = "1" if license_required else "0"
    os.environ["HA_BASE_URL"] = ha_base_url
    os.environ["UPDATE_CHECKS_ENABLED"] = "0"
    if extra_env:
        for key, value in extra_env.items():
            os.environ[key] = value
    ensure_backend_on_path()
    return resolved


# ── 断言与收尾 ──────────────────────────────────────────────────────────────

_checked = 0
_failures: list[str] = []


def check(label: str, condition: object, detail: object = "") -> bool:
    """记录并打印一项断言。失败时把 ``label`` 计入清单，由 :func:`report` 统一判定退出码。"""
    global _checked
    _checked += 1
    passed = bool(condition)
    print(f"  [{'PASS' if passed else 'FAIL'}] {label}{'' if passed else f' {detail}'}")
    if not passed:
        _failures.append(label)
    return passed


def expect(actual: object, wanted: object, what: str) -> None:
    """相等断言：失败信息里同时给出期望与实际。"""
    if actual != wanted:
        raise AssertionError(f"{what}：期望 {wanted!r}，实际 {actual!r}")


def expect_true(condition: object, message: str) -> None:
    """真值断言：失败时只打印这条 message。"""
    if not condition:
        raise AssertionError(message)


def check_calls(label: str, fn) -> None:
    """跑一段**可能抛错**的断言体，并记录一项检查（fn 式 check）。

    存在的理由：``check(label, condition)`` 的第二个参数是**真值**。把函数对象传进去
    （``check("某断言", some_assertion_fn)``）永远为真 —— ``bool(function) is True`` ——
    于是一条「永远 PASS 的假断言」就混进了门禁，而且它比没有断言更糟：报告上它是绿的。
    这个坑本项目真踩过（``_home_mode_validation_smoke.py`` 首版整节都是这么写的，
    因为商店侧夹具恰好是 fn 式 ``check``，照抄过来就静默失效了）。

    所以：断言体要抛错时用本函数；只是比对布尔值时才用 :func:`check`。
    """
    try:
        fn()
    except AssertionError as error:
        check(label, False, str(error))
    except Exception as error:
        check(label, False, f"{type(error).__name__}: {error}")
    else:
        check(label, True)


def section(title: str) -> None:
    print(f"\n{title}")


def skip(reason: str) -> None:
    """显式 SKIP（退出码 0）。用于依赖运行中商店这类可选集成场景。

    刻意打得醒目：SKIP 意味着**什么都没验证**，在长日志里被当成 PASS 是最危险的误读
    （CI 里这条脚本常常整条被跳过）。用框线 + 大写字把「未验证」钉在眼前。
    """
    bar = "=" * 72
    print(f"\n{bar}\nSKIP（未验证任何断言）— {reason}\n{bar}\n")
    raise SystemExit(0)


def report(success_message: str = "SMOKE OK — 全部通过") -> None:
    """打印收尾；有失败项即以非零码退出，可直接当门禁用。"""
    print()
    if _failures:
        print(f"SMOKE FAILED ({len(_failures)}): {_failures}")
        raise SystemExit(1)
    print(f"{success_message}（{_checked} 项）")


def failed() -> bool:
    """是否已有失败项（供需要提前收尾的脚本判断）。"""
    return bool(_failures)


@contextmanager
def running_app(*, install_fake_auth: bool = True) -> Generator[tuple[Any, Any]]:
    """构造 ``create_app()`` 并跑完 lifespan，产出 ``(client, app)``。

    调用前必须先 ``bootstrap_env()``（``src.app`` 是延迟到此时才 import 的）。
    """
    from fastapi.testclient import TestClient
    from src.app import create_app

    app = create_app()
    with TestClient(app) as client:
        if install_fake_auth:
            install_fake_verification(app)
        yield client, app


# ── 注册 / 登录 / 激活契约夹具 ──────────────────────────────────────────────
#
# 首装流程改为单用户注册后，冒烟不再能用 ``/api/v1/setup/admin`` 建号，而注册又需要
# 商店下发/校验邮箱验证码。这里把那条通道换成进程内的假实现（不碰网络）。

#: 假商店认可的验证码；所有冒烟脚本共用同一个值，便于断言。
FAKE_CODE = "246810"


class FakeStoreVerificationClient:
    """``StoreVerificationClient`` 的进程内替身：只认 :data:`FAKE_CODE`。"""

    def __init__(self, code: str = FAKE_CODE) -> None:
        self._code = code

    @property
    def configured(self) -> bool:
        return True

    async def send_code(self, email: str) -> dict:
        return {"delivered": True, "resendAfter": 120, "deliveryMode": "smtp"}

    async def verify_code(self, email: str, code: str) -> dict:
        from src.domains.store import StoreVerificationError

        if code != self._code:
            raise StoreVerificationError("验证码不正确或已过期。", status_code=422)
        return {"email": email, "verified": True}


def install_fake_verification(app, code: str = FAKE_CODE) -> None:
    """把 ``api.auth`` 的商店验证码客户端换成假实现。

    直接改模块属性：``_verification_client()`` 每次请求都会重新取一次工厂函数，
    因此这里替换后所有后续发码/验码都走假实现。
    """
    from src.api import auth as auth_api

    fake = FakeStoreVerificationClient(code)
    auth_api.verification_client_from_settings = lambda _settings: fake


def csrf_headers(client, app) -> dict:
    """引导 CSRF（``GET /setup/status`` 兼任引导）并返回写请求要带的头部。"""
    settings = app.state.settings
    client.get("/api/v1/setup/status")
    token = client.cookies.get(settings.csrf_cookie_name)
    return {settings.csrf_header_name: token or ""}


def register_local_user(
    client,
    app,
    *,
    username: str,
    email: str,
    password: str,
    code: str = FAKE_CODE,
    headers: dict | None = None,
):
    """注册本机唯一账号（成功后服务端已下发会话 Cookie）。"""
    if headers is None:
        headers = csrf_headers(client, app)
    return client.post(
        "/api/v1/auth/register",
        json={
            "username": username,
            "email": email,
            "code": code,
            "password": password,
            "passwordConfirmation": password,
        },
        headers=headers,
    )


__all__ = [
    "FAKE_CODE",
    "FakeStoreVerificationClient",
    "bootstrap_env",
    "check",
    "check_calls",
    "csrf_headers",
    "ensure_backend_on_path",
    "expect",
    "expect_true",
    "failed",
    "install_fake_verification",
    "register_local_user",
    "report",
    "running_app",
    "section",
    "skip",
]
