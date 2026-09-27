"""心跳与重试：等多久、什么时候可以重试、失败怎么记账

从 license/service.py 的 LicenseService 里搬出来的方法组（mixin）：只移动方法本身，
私有属性仍由 LicenseService.__init__ 建立 —— 因此这里只依赖 self 上的协议，不反向依赖那个模块。
"""
from __future__ import annotations

import asyncio
import logging
import secrets
import time
from datetime import datetime, timedelta, timezone


from ..core.models import LicenseState
from ..core.time_utils import ensure_aware
from .crypto import LicenseCryptoError

logger = logging.getLogger(__name__)


from .contracts import (
    EXPIRED_LEASE_RETRY_SECONDS,
    LicenseClientError,
    MANUAL_RETRY_THROTTLE_SECONDS,
    REAUTH_REQUIRED,
    RETRY_DELAYS,
    TERMINAL_STATES,
)

class LicenseHeartbeatMixin:
    """心跳与重试：等多久、什么时候可以重试、失败怎么记账"""

    def _rate_limit_remaining(self) -> float:
        """冷却还剩多少秒（单调时钟）；不在冷却里返回 0。"""
        return max(0.0, self._rate_limited_until - time.monotonic())
    def _note_rate_limit(self, error: LicenseClientError) -> None:
        """记下这次 429 的冷却。

        服务端没回 ``Retry-After`` 时兜底 120 秒：限流器是小时窗口，但不必等满一小时 ——
        只要不再持续重打，窗口自己会滑动。
        """
        seconds = error.retry_after_seconds
        self._rate_limited_until = time.monotonic() + (seconds if seconds else 120.0)
    def _log_event(self, level: str, message: str) -> None:
        """写一条授权事件日志。

        日志失败绝不能影响授权主流程（例如磁盘写满），因此整体兜底吞掉异常。
        """
        if self.event_log is None:
            return
        try:
            # 分类固定为「授权」，前端事件列表按此过滤。
            self.event_log.append(level, '授权服务', '授权', message)
        except Exception:
            # 有意静默：日志是旁路，不能反向影响授权判定。
            pass
    def _record_failure(self, operation: str, error: Exception | str, *, sensitive_values: tuple[str, ...] = ()) -> None:
        """记录一次失败，并按「同因去重」策略决定是否写日志。"""
        reason = str(error)
        # 按长度降序替换：短值可能是长值的子串，先长后短才不会把长值截断成残留片段。
        for value in sorted(set(sensitive_values), key=len, reverse=True):
            if not value:
                continue
            reason = reason.replace(value, '***')
        with self._event_lock:
            # 用单调时钟计去重窗口：系统时间回拨也不会让窗口失灵。
            now = time.monotonic()
            failure = self._event_failures.setdefault(operation, {
                'count': 0,
                'logged_at': None,
                'reason': None})
            # 累计次数即使不写日志也要加，供恢复成功时汇报。
            failure['count'] += 1
            # 同一原因 300 秒内只记一次：离线部署会持续失败，逐次记录会淹没日志。
            if failure['reason'] == reason and failure['logged_at'] is not None and now - failure['logged_at'] < 300:
                return
            failure.update(logged_at=now, reason=reason)
            # 异常可能是字符串，用 getattr 兼容没有 status_code 的情况。
            status_code = getattr(error, 'status_code', None)
            suffix = f'''，HTTP {status_code}''' if status_code else ''
            # 激活与本地校验失败直接影响可用性，定为 error；心跳/恢复失败只算 warning。
            self._log_event('error' if operation in frozenset({'激活', '本地校验'}) else 'warning', f'''授权{operation}失败（累计 {failure['count']} 次{suffix}）：{reason}''')
    def _record_online_success(self, operation: str) -> None:
        """联网成功：汇报此前累计的心跳/恢复失败次数，并清掉对应的失败计数。"""
        # 联网通了，限流冷却即失效；留着它会让心跳循环多睡一轮、confirm_binding 少确认一次。
        self._rate_limited_until = 0.0
        # 重试计划一并归零：失败计数、错误码、计划时刻描述的都只是「上一次失败」，
        # 成功后还留着，下一次偶发失败就会从一个很高的退避档开始。
        self._failures = 0
        self._error_code = None
        self._next_attempt = None
        # 成功代数自增：正在飞行的手动重试据此得知「本轮期间已经成功了，不必再来一轮」。
        self._success_generation += 1
        with self._event_lock:
            # 只汇报并清理这两类：本地校验与激活各自有独立的成功路径。
            failures = [(name, self._event_failures.pop(name)) for name in ('心跳', '租约恢复') if name in self._event_failures]
            if failures:
                counts = '、'.join(f'''{name}失败 {failure['count']} 次''' for name, failure in failures)
                self._log_event('success', f'''授权连接已恢复，{operation}成功；此前{counts}。''')
            if operation == '激活':
                # 激活成功额外清掉激活失败计数，并单独记一条成功日志。
                self._event_failures.pop('激活', None)
                self._log_event('success', '授权激活成功。')
    def _record_local_success(self) -> None:
        """本地校验恢复成功：清计数并写一条恢复日志。"""
        with self._event_lock:
            failure = self._event_failures.pop('本地校验', None)
            if failure:
                self._log_event('success', f'''授权本地校验已恢复；此前校验失败 {failure['count']} 次。''')
    def _next_retry_delay(self, http_status: int | None) -> float:
        """按失败次数取退避间隔（秒）。

        401 固定 2 秒：它多半是会话/恢复令牌轮换的瞬时竞态，重试越快恢复越快；
        其余按 RETRY_DELAYS 递增，次数超出阶梯长度就停在最后一档。
        """
        if http_status == 401:
            return 2.0
        return float(RETRY_DELAYS[min(self._failures - 1, len(RETRY_DELAYS) - 1)])
    def _heartbeat_credentials(self) -> tuple[str | None, int, str]:
        """取心跳要用的本地凭证（同步，供 ``_heartbeat_unlocked`` 放线程池）。

        返回: (加密的会话令牌, 本地租约序号, 实例 ID)。实例 ID 必须回传：服务端靠它
        识别「同一张授权已被另一台设备重新激活」，少了它解绑对旧设备等于没生效。
        """
        with self.database.session_factory() as database:
            state = self._state(database)
            return (state.encrypted_session_token, state.lease_sequence, state.instance_id)
    async def heartbeat(self) -> dict:
        """对外的心跳入口：串行化，避免与恢复流程并发续租。"""
        # 走凭证临界区而不是只取 _heartbeat_lock：续租会写凭证，必须在「本进程唯一写入者」
        # 的保护下进行（生产里 start() 已持有进程锁，这里只是复用同一把临界区）。
        async with self._credential_operation():
            return await self._heartbeat_unlocked()
    async def _heartbeat_unlocked(self) -> dict:
        """心跳的实际实现（调用方须已持有 _heartbeat_lock）。

        优先用会话令牌续租，无令牌或 401 时回落到恢复令牌；确认吊销清空本地授权，
        429 只记冷却不改状态，其余失败只降级状态并保留租约等重试。
        """
        # 同步查库放线程池：心跳也会被请求路径 await，不能让读写占着事件循环。
        (encrypted, lease_sequence, instance_id) = await asyncio.to_thread(self._heartbeat_credentials)
        # 没有会话令牌说明从未激活成功或刚被清空，直接走恢复流程。
        if not encrypted:
            return await self._recover_unlocked()
        # 先赋空串：解密失败时错误路径仍能安全地把 session_token 当作敏感值抹除。
        session_token = ''
        try:
            session_token = self.cipher.decrypt(encrypted)
            response = await self._post('/v2/heartbeat', {
                'sessionToken': session_token,
                # 回传本地序号：服务端据此判断客户端是否落后于最新租约。
                'leaseSequence': lease_sequence,
                # 回传本机实例 ID：服务端据此拒绝不属于当前实例的旧会话。少了它，
                # 管理员刚做的解绑对旧设备等于没生效，旧会话仍能一直续租下去。
                'instanceId': instance_id,
                'clientVersion': self.settings.version,
                'nonce': secrets.token_urlsafe(24)})
            result = await asyncio.to_thread(self._apply_response, response)
            self._record_online_success('心跳')
            return result
        except (LicenseClientError, LicenseCryptoError) as error:
            self._record_failure('心跳', error, sensitive_values=(session_token, encrypted))
            # 401 视为会话过期：立刻用恢复令牌换新会话，对调用方透明。
            if isinstance(error, LicenseClientError) and error.status_code == 401:
                return await self._recover_unlocked()
            # 确认吊销：清空本地授权后原样上抛（保留状态码与 code，reactivate 据此判定不可自愈）。
            if isinstance(error, LicenseClientError) and error.is_confirmed_revocation:
                await asyncio.to_thread(self._mark_revoked, str(error))
                raise LicenseClientError(str(error), status_code=error.status_code, code=error.code) from error
            # 被限流（429）：只记冷却，**不降级本地状态** —— 429 对绑定是否有效一个字都
            # 没说，按普通失败处理会把过期租约翻成 LEASE_EXPIRED、把编辑器锁死。
            # 也不在这里转 recover：那只会对同一个桶再打一次。
            if isinstance(error, LicenseClientError) and error.is_rate_limited:
                self._note_rate_limit(error)
                raise LicenseClientError(
                    str(error),
                    status_code=error.status_code,
                    code=error.code,
                    retry_after_seconds=error.retry_after_seconds,
                ) from error
            # 其它失败按租约剩余有效期降级为 CONNECTION_WARNING 或 LEASE_EXPIRED，等下一轮重试。
            await asyncio.to_thread(self._mark_failure, error)
            # 错误码必须取 _mark_failure 归一化后的值：直接透传异常自身的 code 会丢掉
            # NETWORK_UNAVAILABLE / RECOVERY_TOKEN_INVALID 等判定，前端据此把终态当成可重试。
            raise LicenseClientError(str(error), status_code=getattr(error, 'status_code', None), code=self._error_code) from error
    async def retry_now(self) -> dict:
        '''用户 / 展示端显式触发的「立刻重试」，返回最新状态。

        与后台心跳的差别就是本方法存在的理由：它**当场**发起一轮恢复，并清掉端点黑名单，
        所以手动点击不会被上一轮失败留下的冷却直接挡回（否则点了等于没点）。

        并发语义（三个细节都是有意的）：
        - 同一时刻只跑一个重试任务：多个页面同时点就共用它，而不是排队做多轮令牌轮换；
        - 节流窗口内直接返回当前状态、不发请求 —— 连点不该变成对授权服务的压测；
        - ``shield`` 保证等待方被取消时不会把共享任务一起取消（否则先点的那台设备一刷新，
          后点的那台就永远等不到结果）。
        '''
        if self._retry_task is not None and not self._retry_task.done():
            await asyncio.shield(self._retry_task)
            return await asyncio.to_thread(self.status)
        if time.monotonic() < self._manual_retry_after:
            return await asyncio.to_thread(self.status)
        # 先占住节流窗口再建任务：窗口要在请求之前占住，否则并发点击会一起通过判定。
        self._manual_retry_after = time.monotonic() + MANUAL_RETRY_THROTTLE_SECONDS
        self._retry_task = asyncio.create_task(self._manual_retry(), name='license-manual-retry')
        await asyncio.shield(self._retry_task)
        return await asyncio.to_thread(self.status)
    async def _manual_retry(self) -> None:
        """手动重试的实现（在凭证临界区里执行）。

        异常:
            LicenseClientError: 本机已进入终态、联网重试没有意义时抛 REAUTH_REQUIRED，
                由路由层转成 409，前端据此隐藏重试按钮、引导去激活页。
        """
        generation = self._success_generation
        async with self._credential_operation():
            # 本轮开始后已经有别的路径成功了：直接返回，不必再用旧租约发一轮请求。
            if generation != self._success_generation:
                return
            with self.database.session_factory() as database:
                state = self._state(database)
                # 时钟异常是本机时间的问题：重试前按当前时间重新校验一次，
                # 已校准时间的用户点一下就能自己恢复，不必走激活流程。
                if state.status == 'CLOCK_ROLLBACK':
                    state.status = 'ACTIVE'
                    self._validate_saved_state(state, database)
                if state.status in frozenset({'ACTIVE', 'LEASE_EXPIRED', 'CONNECTION_WARNING'}):
                    self._validate_saved_state(state, database)
                if state.status in TERMINAL_STATES - {'RECOVERY_REQUIRED', 'REMOTE_REJECTED'} or not state.license_id:
                    # 终态或压根未激活：联网也不会有结果，只能让人来处理。
                    raise LicenseClientError(
                        state.last_error or '当前授权需要重新激活。',
                        status_code=409,
                        code=REAUTH_REQUIRED)
            # 清黑名单：用户明确要求「现在就再试」，沿用上一轮的冷却会让这一下必然无效。
            self._endpoint_pool.retry_failed()
            try:
                await self._recover_unlocked()
            except LicenseClientError:
                # 失败已在底层记好状态与重试计划，这里不再上抛：手动重试的返回值统一走
                # status()，让前端看到真实状态与倒计时，而不是一个错误页。
                pass
    def _mark_failure(self, error: Exception) -> None:
        """非吊销类失败：分类记录状态、定下错误码，并排下一次自动重试。

        分三档处置：
        - **终局**（本地凭证解不开 / 缺凭证 / 4xx 明确拒绝）→ 不再自动重试，
          前端要引导人工介入（重新激活、检查授权）；
        - **会话失效**（401）→ 先记 RECOVERY_RETRY（下轮重试），连续失败才升成 RECOVERY_REQUIRED；
        - **网络类** → 按租约剩余有效期降级为 CONNECTION_WARNING（仍可用）或 LEASE_EXPIRED（拦截）。
        """
        message = str(error)
        http_status = getattr(error, 'status_code', None)
        code = getattr(error, 'code', None)
        self._failures += 1
        retry = True
        with self.database.session_factory() as database:
            state = self._state(database)
            if state.status in TERMINAL_STATES - {'RECOVERY_REQUIRED', 'REMOTE_REJECTED'}:
                # 已经是终态：保留原状态与原因为准，不因为一次新的失败改写成别的说法。
                retry = False
                code = code or state.status
            elif isinstance(error, LicenseCryptoError) or code == 'CREDENTIAL_MISSING':
                # 凭证本身坏了，重试不会变好：本机已无法证明身份，必须人工重新激活。
                state.status = 'INVALID' if isinstance(error, LicenseCryptoError) else 'RECOVERY_REQUIRED'
                code = code or 'CREDENTIAL_INVALID'
                retry = False
            elif http_status == 401:
                # 会话与恢复令牌都失效（调用方先试过恢复才走到这里）：第一次按「重试中」，
                # 再失败一次就认为自动恢复无望，转人工。
                retry = state.status not in frozenset({'RECOVERY_RETRY', 'RECOVERY_REQUIRED'})
                state.status = 'RECOVERY_RETRY' if retry else 'RECOVERY_REQUIRED'
                code = code or 'RECOVERY_TOKEN_INVALID'
            elif http_status is not None and 400 <= http_status < 500 and http_status not in frozenset({408, 429}):
                # 4xx 是业务拒绝（除超时/限流）：换地址、换时间都不会变，直接判终局。
                state.status = 'REMOTE_REJECTED'
                code = code or 'LICENSE_REMOTE_REJECTED'
                retry = False
            elif state.status in frozenset({'RECOVERY_RETRY', 'REMOTE_REJECTED', 'RECOVERY_REQUIRED'}):
                # 已经处在恢复流程里：保持该状态语义，只更新错误码与重试计划。
                code = code or 'NETWORK_UNAVAILABLE'
                retry = state.status == 'RECOVERY_RETRY'
            else:
                expires = ensure_aware(state.lease_expires_at)
                # 租约未到期只是联系不上服务器，功能继续可用；已到期则必须拦截等恢复。
                state.status = 'CONNECTION_WARNING' if expires and expires > datetime.now(timezone.utc) else 'LEASE_EXPIRED'
                code = code or 'NETWORK_UNAVAILABLE'
            # 同样截断，避免超长错误进库。
            state.last_error = message[:1000]
            database.commit()
            self._record_status(state.status)
        self._error_code = code
        # 一次失败就交回离线验签判定：联网确认不成功不等于授权无效，把门禁锁在
        # 「等待启动联网验证」会让持有有效租约的离线用户永远进不去（放行与否仍由
        # _verified_access 按签名租约现算）。
        self._startup_validation_pending = False
        # 只有「可重试」才排计划时刻；终态排了会让后台对着一个注定失败的状态无限重试。
        self._next_attempt = time.monotonic() + self._next_retry_delay(http_status) if retry else None
        # 计划可能变了，唤醒心跳循环立刻重算等待时间（否则要等当前这一觉睡完）。
        self._schedule_changed.set()
    @staticmethod
    def _heartbeat_wait_seconds(state: LicenseState, now: datetime | None = None) -> float | None:
        """算出心跳循环下一次该等多久；未激活时返回 None（调用方据此跳过本轮）。

        租约已到期 → 固定 30 秒重试；否则取 min(心跳间隔, 距到期剩余时间)，
        保证租约一到点就被处理。
        """
        if not state.license_id:
            # 未激活无需心跳。
            return None
        if state.status == 'LEASE_EXPIRED':
            return float(EXPIRED_LEASE_RETRY_SECONDS)
        # 再兜一次 30 秒下限：库里的值可能被手工改小。
        interval = float(max(30, state.heartbeat_interval_seconds))
        expires = ensure_aware(state.lease_expires_at)
        if expires is None:
            return interval
        remaining = (expires - (now or datetime.now(timezone.utc))).total_seconds()
        # 不允许负等待；到期时间比间隔更近时提前唤醒。
        return max(0, min(interval, remaining))
    def _scheduled_wait_seconds(self, state: LicenseState) -> float | None:
        """算出本轮该等多久：优先听「计划重试时刻」，没有计划才按常规心跳节奏。

        计划时刻存在意味着上一轮失败已经算好了退避（见 :meth:`_mark_failure`）；此时必须
        以它为准，否则「失败退避」和「心跳间隔」会各走各的，退避形同虚设。
        未激活或已进入终态时返回 None，调用方据此一直等到有变更为止。
        """
        if not state.license_id or state.status in TERMINAL_STATES:
            return None
        if self._next_attempt is not None:
            # 已过计划时刻就返回 0（立刻试），而不是再等一个完整的心跳间隔。
            return max(0.0, self._next_attempt - time.monotonic())
        return self._heartbeat_wait_seconds(state)
    def _heartbeat_wait(self) -> float | None:
        """读库算出本轮该等多久（同步，供心跳循环放线程池）。"""
        with self.database.session_factory() as database:
            wait_seconds = self._scheduled_wait_seconds(self._state(database))
        if wait_seconds is None:
            # 未激活 / 终态无需联网，冷却不改变这一点（调用方据此一直等到有变更为止）。
            return None
        # 冷却期内不再重打：等待至少覆盖冷却剩余，否则每次撞 429 都在把窗口重新填满。
        return max(wait_seconds, self._rate_limit_remaining())
    def _due_state(self) -> tuple[bool, str, bool]:
        """超时醒来后重新读一次状态（同步，供心跳循环放线程池）。

        返回: (是否仍有授权, 状态, 租约是否已到期)。
        """
        with self.database.session_factory() as database:
            state = self._state(database)
            expires = ensure_aware(state.lease_expires_at)
            now = datetime.now(timezone.utc)
            # 到期用同一个带容差判据：这里决定续租还是走恢复令牌，硬比会在时钟稍快时多走恢复分支。
            return (bool(state.license_id), state.status, bool(expires and self._lease_expired(expires, now=now)))
    async def _heartbeat_loop(self) -> None:
        """心跳主循环：等一个「计划变更」或超时，然后续租或恢复。

        每轮都重新读库计算等待时间，因此激活、停用、租约变化都能立刻生效。
        """
        while not self._stop.is_set():
            # 先清后等：清掉上一轮遗留的信号，避免本轮空转。
            self._schedule_changed.clear()
            # 每轮读库也放线程池：常驻任务占住事件循环就是让所有请求为它让路。
            wait_seconds = await asyncio.to_thread(self._heartbeat_wait)
            try:
                # 用事件等待代替 sleep：激活成功后能立刻打断长等待。
                # wait_seconds 为 None 表示一直等到有变更为止。
                await asyncio.wait_for(self._schedule_changed.wait(), timeout=wait_seconds)
            except TimeoutError:
                # 超时才是「该续租了」；被事件唤醒则说明计划已变，直接进入下一轮重算。
                (has_license, status, lease_expired) = await asyncio.to_thread(self._due_state)
                # 状态可能在等待期间被清空（吊销 / 重新激活），此时无需联网。
                if not has_license:
                    continue
                try:
                    if status == 'LEASE_EXPIRED' or lease_expired:
                        # 租约已到期：会话很可能也失效了，直接用恢复令牌更稳。
                        await self.recover()
                    else:
                        await self.heartbeat()
                except LicenseClientError:
                    # 失败已在 *_unlocked 内部记录并降级状态，这里只等下一轮重试。
                    continue
                except Exception as error:
                    # 非授权异常不再吞掉：记日志并让任务结束，否则会变成无声死循环一直刷错误日志。
                    self._log_event('error', f'''授权自动续租任务意外停止（{type(error).__name__}）。''')
                    raise
                if self._stop.is_set():
                    break
    def _retry_in_flight(self) -> bool:
        """是否有手动重试正在执行（前端据此显示「正在验证」而不是倒计时）。"""
        return self._retry_task is not None and not self._retry_task.done()
    def _retry_scheduled(self) -> bool:
        """是否已排好下一轮自动重试（前端据此决定要不要显示倒计时）。"""
        return self._next_attempt is not None
    def _next_retry_at(self) -> str | None:
        """下一轮计划重试的墙钟时刻（ISO 串）；没排重试则为 None。

        返回绝对时刻而不是「还剩几秒」：前端自己算倒计时，才不会因为一次网络往返
        把剩余时间算少、显示成「0 秒后重试」却迟迟不动。
        """
        if self._next_attempt is None:
            return None
        remaining = max(0.0, self._next_attempt - time.monotonic())
        return (datetime.now(timezone.utc) + timedelta(seconds=remaining)).isoformat()
    def _can_retry(self, effective_status: str) -> bool:
        """现在点「重试」是否有意义。

        终态返回 False，前端据此隐藏按钮：留一个必然失败的按钮，用户只会反复点，
        而真正该做的是去激活页。
        """
        if not self.settings.license_required:
            return False
        if effective_status in TERMINAL_STATES or effective_status == 'UNACTIVATED':
            return False
        return bool(effective_status)
