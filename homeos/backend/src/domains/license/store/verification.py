"""主应用调用商店「邮箱验证码」接口的客户端。

首装注册与找回本机密码的邮箱验证码由**商店服务器**发送与校验（主应用不自带 SMTP）。
本模块只做「HTTP 适配」：把发码与验码封成两个方法，并把商店的错误信封翻译成
``StoreVerificationError``，由路由层映射成统一的 422/429。

用途（``purpose``）只有两个取值，且必须与商店侧白名单一致：
- ``homeos_register`` —— 首装注册；
- ``homeos_reset``    —— 找回本机管理员密码。
两者独立发码、独立消费，注册码不能拿来重置密码（反之亦然）。

商店端点（相对商店后端根地址）：
- ``POST /store/v1/verifications``          发码（公开、按 IP/邮箱限流）
- ``POST /store/v1/verifications/verify``   验码并消费（公开）

基地址取 ``settings.license_server_url``（服务端出站优先授权服务器地址），缺省回退
``settings.store_url``（对外商店地址）—— 两者的区别见下方
:func:`verification_client_from_settings` 的注释。
"""

from __future__ import annotations

from typing import Literal

import httpx

#: 商店侧认的两个主应用验证码用途。
VerificationPurpose = Literal["homeos_register", "homeos_reset"]


class StoreVerificationError(RuntimeError):
    """商店发码 / 验码失败。

    ``status_code`` 透传商店返回的状态码（无响应时为 ``None``），``retry_after``
    透传商店在 429 上给出的 ``Retry-After`` 秒数（供 API 层原样回给浏览器）。
    """

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        retry_after: int | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.retry_after = retry_after

    @property
    def unavailable(self) -> bool:
        """商店本身不可用（未配置 / 连不上 / 5xx），**不是**验证码错误。

        API 层据此返回 503 ``STORE_UNAVAILABLE``，而不是伪装成 422 的
        「验证码错误」——后者会让用户反复重输一个其实没问题的验证码。
        """
        return self.status_code is None or self.status_code >= 500


class StoreVerificationClient:
    def __init__(
        self,
        base_url: str,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 10.0,
    ) -> None:
        self._base_url = (base_url or "").strip().rstrip("/")
        self._transport = transport
        self._timeout = max(1.0, float(timeout))

    @property
    def configured(self) -> bool:
        return bool(self._base_url)

    def _url(self, path: str) -> str:
        return f"{self._base_url}/store/v1{path}"

    async def _post(self, path: str, payload: dict) -> dict:
        if not self.configured:
            raise StoreVerificationError("尚未配置商店服务器地址，无法发送验证码。")
        try:
            async with httpx.AsyncClient(
                transport=self._transport, timeout=self._timeout
            ) as client:
                response = await client.post(self._url(path), json=payload)
        except httpx.HTTPError as error:
            raise StoreVerificationError("无法连接商店服务器，请稍后重试。") from error
        if response.status_code >= 400:
            detail = "商店拒绝了本次请求。"
            try:
                parsed = response.json()
                if isinstance(parsed, dict) and isinstance(parsed.get("detail"), str):
                    detail = parsed["detail"]
            except ValueError:
                pass
            raise StoreVerificationError(
                detail,
                status_code=response.status_code,
                retry_after=_parse_retry_after(response.headers.get("Retry-After")),
            )
        if not response.content:
            return {}
        try:
            parsed = response.json()
        except ValueError:
            return {}
        return parsed if isinstance(parsed, dict) else {}

    async def send_code(
        self, email: str, purpose: VerificationPurpose = "homeos_register"
    ) -> dict:
        """请求商店向 ``email`` 发送指定用途的验证码（默认首装注册）。"""
        return await self._post("/verifications", {"email": email, "purpose": purpose})

    async def verify_code(
        self, email: str, code: str, purpose: VerificationPurpose = "homeos_register"
    ) -> dict:
        """请求商店校验并消费 ``email`` 的指定用途验证码；用途必须与发码时一致。"""
        return await self._post(
            "/verifications/verify",
            {"email": email, "purpose": purpose, "code": code},
        )


def _parse_retry_after(raw: str | None) -> int | None:
    """解析 ``Retry-After``（商店只给秒数；HTTP-date 形式忽略，退化为默认退避）。"""
    if not raw:
        return None
    try:
        seconds = int(raw.strip())
    except ValueError:
        return None
    return seconds if seconds > 0 else None


def verification_client_from_settings(settings) -> StoreVerificationClient:
    """按 ``settings`` 构造客户端：服务端出站**优先授权服务器地址**（那是容器能连到商店的
    地址），缺省才退回对外商店地址。"""
    # 服务端出站优先 license 服务器地址；浏览器商店链接才用 store_url。
    base = (getattr(settings, "license_server_url", "") or "").strip()
    if not base:
        base = (getattr(settings, "store_url", "") or "").strip()
    return StoreVerificationClient(
        base, timeout=getattr(settings, "license_request_timeout_seconds", 10.0)
    )


__all__ = [
    "StoreVerificationClient",
    "StoreVerificationError",
    "VerificationPurpose",
    "verification_client_from_settings",
]
