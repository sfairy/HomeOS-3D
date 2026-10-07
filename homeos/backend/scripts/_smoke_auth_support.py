"""冒烟脚本共用的「注册 → 登录 → 激活契约」夹具。

首装流程改为单用户注册后，冒烟脚本不再能用 ``/api/v1/setup/admin`` 建号，而注册又需要
商店下发/校验邮箱验证码。这里把那条通道换成进程内的假实现（不碰网络），并封装 CSRF 引导
与注册调用，供各冒烟脚本复用。

用法（必须**先**设好 ``HOMEOS_*`` 环境变量再 ``import src.app``）::

    from _smoke_auth_support import install_fake_verification, register_local_user

    app = create_app()
    with TestClient(app) as client:
        install_fake_verification(app)
        r = register_local_user(client, app, username="smoke", email="a@b.c", password="Passw0rd!234")
"""

from __future__ import annotations

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
        from src.services.store import StoreVerificationError

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
    "csrf_headers",
    "install_fake_verification",
    "register_local_user",
]
