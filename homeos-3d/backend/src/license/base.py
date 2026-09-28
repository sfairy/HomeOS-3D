"""``LicenseService`` 与它的两个混入类之间的宿主契约。

``LicenseTransportMixin``（transport.py）与 ``LicenseHeartbeatMixin``（heartbeat.py）不是
能独立成立的类：它们互相调用对方的方法，并读取 ``LicenseService.__init__`` 建立的状态。
运行期只有 ``LicenseService``（service.py）把三者拼起来才完整；但静态分析是**逐文件**做的 ——
单独看 transport.py 时，那个混入类引用的每个 ``self.xxx`` 在它自己身上都不存在，于是被逐条
报成「属性未知」（打开这个文件就是几十条红）。

这里把这份契约显式声明一次，两个混入类都继承它：

- 各自方法体里的 ``self.xxx`` 都能解析，IDE / CI 不再刷屏；
- 「混入类依赖宿主提供什么」有唯一、可检索的答案，不必翻 service.py 反推；
- 谁再在混入类里用上 ``self.新东西`` 而宿主没提供，会在基线检查时就报出来，
  而不是留到某条分支上运行期 AttributeError。

本模块只在类型检查期导入真正提供这些成员的模块：运行期它不 import 任何东西，
既避开 service.py ↔ transport.py 的循环导入，也不给启动路径增加负担。
"""
from __future__ import annotations

import asyncio
from datetime import datetime
from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    import httpx
    from contextlib import AbstractAsyncContextManager
    from sqlalchemy.orm import Session

    from ..config import Settings
    from ..core.database import Database
    from ..core.models import LicenseState
    from ..observability.global_log import GlobalLogStore
    from .crypto import LeaseVerifier, LicenseTransportCipher, SecretCipher
    from .endpoints import LicenseEndpointPool
    from .process_lock import LicenseProcessLock


class LicenseServiceBase(Protocol):
    """两个混入类共享的宿主契约：**只声明、不实现**，唯一实现是 ``LicenseService``。

    这里的方法都是一层声明（``...`` 空实现），实际行为由 service.py / transport.py /
    heartbeat.py 提供；写成同名同签名是为了让静态分析能接上，也为了在签名漂移时报错。
    用 ``Protocol`` 而不是普通基类，是因为这份声明本来就没有任何实现可继承走 ——
    它描述的是「宿主必须提供什么」，正好是协议语义。
    """

    # ------------------------------------------------------------------ 状态
    # 全部由 LicenseService.__init__ 赋值；两个混入类只读（少数几个会就地更新）。
    settings: Settings
    database: Database
    event_log: GlobalLogStore | None
    verifier: LeaseVerifier
    cipher: SecretCipher
    transport_cipher: LicenseTransportCipher
    _transport: httpx.AsyncBaseTransport | None
    _endpoint_pool: LicenseEndpointPool
    _process_lock: LicenseProcessLock
    _heartbeat_lock: asyncio.Lock
    _schedule_changed: asyncio.Event
    _stop: asyncio.Event
    #: threading.RLock() 是工厂函数而不是类型，无法直接标注，故退到 Any。
    _event_lock: Any
    _event_failures: dict[str, dict[str, Any]]
    _error_code: str | None
    _failures: int
    _success_generation: int

    # ------------------------------------------- transport.py 提供、heartbeat.py 调用
    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]: ...
    def _credential_operation(self) -> AbstractAsyncContextManager[None]: ...
    def _apply_response(
        self,
        response: dict[str, Any],
        *,
        activation_code_hint: str | None = None,
        activation_code: str | None = None,
        email: str | None = None,
    ) -> dict[str, Any]: ...
    def _lease_expired(self, expires_at: datetime, *, now: datetime) -> bool: ...
    def _state(self, database: Session) -> LicenseState: ...
    def _validate_saved_state(self, state: LicenseState, database: Session) -> None: ...

    # ------------------------------------------- heartbeat.py 提供、transport.py 调用
    def _can_retry(self, effective_status: str) -> bool: ...
    def _retry_scheduled(self) -> bool: ...
    def _retry_in_flight(self) -> bool: ...
    def _next_retry_at(self) -> str | None: ...
    def _record_failure(
        self,
        operation: str,
        error: Exception | str,
        *,
        sensitive_values: tuple[str, ...] = (),
    ) -> None: ...

    # ------------------------------------------- service.py 提供、两个混入类都会调用
    def _record_status(self, status: str, reason: str | None = None) -> None: ...
    def _verified_access(self, state: LicenseState, feature: str | None = None) -> bool: ...
    def _mark_revoked(self, message: str) -> None: ...
    async def recover(self) -> dict[str, Any]: ...
    async def _recover_unlocked(self) -> dict[str, Any]: ...
    def status(self) -> dict[str, Any]: ...
