"""授权侧的共享契约：能力码全集、终态与重试常量、吊销码表，以及 LicenseClientError。

从 license/service.py 拆出来：这些名字被 LicenseService、心跳 mixin、传输 mixin 与其它模块一起用，
留在 service.py 里就会让 mixin 反向 import 那个模块（模块级环）。放在这里之后依赖是单向的：
service.py 与两个 mixin 都只从本模块取常量与异常类。
"""
from __future__ import annotations

import logging



logger = logging.getLogger(__name__)


#: 服务端结构化吊销码；仅凭 ``code`` / ``revoked`` 判定「确认吊销」。
CONFIRMED_REVOCATION_CODES = frozenset({'REVOKED', 'LICENSE_REVOKED'})
#: 服务端只发中文文案、不发结构化 code 时的吊销文案。仅作 ``code`` 之外的兜底：
#: 有的部署版本（或前置网关）会把 ``code`` 吃掉，只留 detail，漏掉这几句会让已吊销的
#: 安装被当成「网络故障」一直重试，用户看到「正在重试」但永远不会恢复。
CONFIRMED_REVOCATION_MESSAGES = (
    '实例绑定已停用',
    '客户授权或激活码已停用',
    '客户、激活码或实例绑定已停用',
    '商品授权有效期已结束')
# 自动重试的退避阶梯（秒）：失败次数越多等得越久，第 5 次之后固定 300 秒。
# 阶梯而不是固定间隔，是因为「刚断网」和「服务端长时间故障」要区分对待：
# 前者几秒内就能恢复，等 5 分钟会让用户以为程序坏了；后者密集重打只会把限流窗口填满。
RETRY_DELAYS = (2, 5, 10, 30, 60, 300)
#: 终态集合：落到这些状态就不再自动重试，必须有人介入（重新激活 / 校准时间 / 检查安装数据）。
#: 判定用「集合」而不是逐处 if，是因为「哪些状态该停」会被多处引用，漏一处就会出现
#: 「明明要人工处理，后台还在无限重试」的静默错配。
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
# 令牌轮换，没有任何间隔的话，用户因为着急而连点会把授权服务的限流窗口直接填满。
# 注意窗口内**不抛错**：retry_now() 直接返回当前状态，所以没有对应的错误码。
MANUAL_RETRY_THROTTLE_SECONDS = 2.0
class LicenseClientError(RuntimeError):
    """授权客户端对外抛出的统一错误。

    中文文案可直接展示给用户；status_code 与 code 供调用方（路由层 / 前端）
    区分「临时失败」「需要人工重新激活」等情形。
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
            code: 业务错误码，前端据此切换界面（如 REVOKED / MANUAL_ACTIVATION_REQUIRED）。
            retry_after_seconds: 仅 429 上有值，来自 ``Retry-After`` 的剩余秒数，调用方据此冷却。
        """
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.retry_after_seconds = retry_after_seconds

    @property
    def is_rate_limited(self) -> bool:
        """是否被授权服务的限流挡下（429）。

        429 不能像其它失败那样降级本地状态：它只说明「这一小时打多了」，对绑定是否
        有效一个字都没说，按普通失败处理会把过期租约翻成 LEASE_EXPIRED 并锁死编辑器。
        """
        return self.status_code == 429

    @property
    def is_confirmed_revocation(self) -> bool:
        """仅在授权服务「确认吊销」时返回 True。

        401/403 也可能是会话过期或同步竞态，此时必须保留本地授权以便自动重试恢复。
        判据两条，任一命中即算确认吊销：
        - 结构化 ``code``（``REVOKED`` / ``LICENSE_REVOKED``），最可靠；
        - 中文 detail 命中吊销文案（``CONFIRMED_REVOCATION_MESSAGES``），
          兜住服务端没带 ``code`` 的版本 —— 漏掉它会把已吊销当成网络故障无限重试。
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
