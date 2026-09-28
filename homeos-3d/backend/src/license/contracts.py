"""授权侧的共享契约：能力码全集、终态与重试常量、吊销码表，以及 LicenseClientError。
"""
from __future__ import annotations

#: 服务端结构化吊销码；仅凭 ``code`` / ``revoked`` 判定「确认吊销」。
CONFIRMED_REVOCATION_CODES = frozenset({'REVOKED', 'LICENSE_REVOKED'})
#: 服务端只发中文文案、不发结构化 code 时的吊销文案。仅作 ``code`` 之外的兜底：
CONFIRMED_REVOCATION_MESSAGES = (
    '实例绑定已停用',
    '客户授权或激活码已停用',
    '客户、激活码或实例绑定已停用',
    '商品授权有效期已结束')
# 自动重试的退避阶梯（秒）：失败次数越多等得越久，第 5 次之后固定 300 秒。
RETRY_DELAYS = (2, 5, 10, 30, 60, 300)
#: 终态集合：落到这些状态就不再自动重试，必须有人介入（重新激活 / 校准时间 / 检查安装数据）。
TERMINAL_STATES = frozenset({
    'INVALID',
    'REVOKED',
    'DEACTIVATED',
    'CLOCK_ROLLBACK',
    'REMOTE_REJECTED',
    'INSTANCE_MISMATCH',
    'RECOVERY_REQUIRED'})
#: 会要求用户手动重新激活的错误码（前端据此隐藏「重试」并引导去激活页）。
REAUTH_REQUIRED = 'LICENSE_REAUTH_REQUIRED'
# 手动重试的最小间隔（秒）。存在的理由是「连点」：按钮每点一次都会触发一轮真实的
MANUAL_RETRY_THROTTLE_SECONDS = 2.0
class LicenseClientError(RuntimeError):
    """授权客户端对外抛出的统一错误。
    """

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        code: str | None = None,
        retry_after_seconds: float | None = None,
    ) -> None:
        """参数:
        """
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.retry_after_seconds = retry_after_seconds

    @property
    def is_rate_limited(self) -> bool:
        """是否被授权服务的限流挡下（429）。
        """
        return self.status_code == 429

    @property
    def is_confirmed_revocation(self) -> bool:
        """仅在授权服务「确认吊销」时返回 True。
        """
        # 只有 401/403 才可能是吊销；网络错误、5xx 一律不算。
        if self.status_code not in frozenset({401, 403}):
            return False
        if self.code in CONFIRMED_REVOCATION_CODES:
            return True
        detail = str(self)
        return any(message in detail for message in CONFIRMED_REVOCATION_MESSAGES)
# 租约已到期时的重试间隔：比常规心跳更密，尽量缩短功能不可用的窗口。
EXPIRED_LEASE_RETRY_SECONDS = 30
# 基础权益集合：租约 features 里出现 'all' 时按此展开（'all' 只是服务端的合集简写）。
BASE_FEATURES = {
    'api',
    'assets',
    'editor',
    'display',
    'ha.sync',
    'ha.control',
    'ha.configure',
    'projects.write',
    'runtime.websocket'}
