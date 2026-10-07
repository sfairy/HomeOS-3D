"""主应用调用商店「邮箱验证码」接口的客户端。

首装注册的邮箱验证码由**商店服务器**发送与校验（主应用不自带 SMTP）。本模块只做
「HTTP 适配」：把注册/找回场景的发码与验码封成两个方法，并把商店的错误信封翻译成
``StoreVerificationError``，由路由层映射成统一的 422/429。

商店端点（相对商店后端根地址）：
- ``POST /store/v1/verifications``          发码（公开、按 IP/邮箱限流）
- ``POST /store/v1/verifications/verify``   验码并消费（公开）

基地址取 ``settings.store_url``（对外商店地址），缺省回退 ``license_server_url``
（授权/商店同一台服务器）。
"""

from __future__ import annotations

import httpx


class StoreVerificationError(RuntimeError):
    """商店发码 / 验码失败。``status_code`` 透传商店返回的状态码（若有）。"""

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


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
            raise StoreVerificationError(detail, status_code=response.status_code)
        if not response.content:
            return {}
        try:
            parsed = response.json()
        except ValueError:
            return {}
        return parsed if isinstance(parsed, dict) else {}

    async def send_code(self, email: str) -> dict:
        """请求商店向 ``email`` 发送注册验证码。"""
        return await self._post(
            "/verifications", {"email": email, "purpose": "homeos_register"}
        )

    async def verify_code(self, email: str, code: str) -> dict:
        """请求商店校验并消费 ``email`` 的注册验证码。"""
        return await self._post(
            "/verifications/verify",
            {"email": email, "purpose": "homeos_register", "code": code},
        )


def verification_client_from_settings(settings) -> StoreVerificationClient:
    """按 ``settings`` 构造客户端：优先对外商店地址，回退授权服务器地址。"""
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
    "verification_client_from_settings",
]
