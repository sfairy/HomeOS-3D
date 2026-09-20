"""授权服务器业务逻辑：激活、心跳续租、租约恢复。

对应客户端 `backend/license/service.py` 里的 ``/v2/*`` 三个端点。
错误语义必须与客户端约定一致：

- ``401`` 表示会话失效 → 客户端会尝试 ``recover``
- ``403`` 且 detail 命中吊销短语 → 客户端判定为「确认吊销」并清空本地授权
- 其余 4xx 直接失败，不做端点切换
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from store.ops import site_settings as site_config
from store.config import StoreSettings
from store.licensing.crypto import (
    KeyGeneration,
    KeyRegistry,
    LeaseSigner,
    LicenseServerError,
    TransportCipher,
)
from store.core.models import (
    Customer,
    DeviceBinding,
    DeviceReleaseEvent,
    Entitlement,
    License,
    LicenseSession,
    Product,
    RecoveryToken,
    utcnow,
)
from store.security.security import (
    iso_z,
    new_token,
    new_uuid,
    token_hash,
)
from store.core.serializers import json_list

logger = logging.getLogger("store.license")

#: 恢复凭证有效期（比会话长，保证会话失效后仍能救回来）
RECOVERY_TOKEN_TTL_SECONDS = 180 * 24 * 3600

#: 恢复凭证的轮换阈值（S33）：一枚凭证活过这么久之后，下一次 ``recover`` 就换新的。
#: 为什么不是「每次 recover 都换」：客户端只在响应里带回 ``recoveryToken`` 时才更新
#: 本地存储，而它恰恰是在「会话已经失效」时才走 recover —— 如果换了新凭证而响应
#: 在路上丢了，客户端手里只剩一枚**已经作废**的凭证，就彻底失联了。所以轮换要保守：
#: 绝大多数会话失效发生在几周内，轮换由「这枚凭证已经用了很久」触发，而不是每次触发。
RECOVERY_TOKEN_ROTATE_AFTER_SECONDS = 30 * 24 * 3600

#: 被轮换下来的恢复凭证还留多久（S33）。这就是上面那个「响应丢失」问题的兜底：
#: 旧凭证不是立刻作废，而是在宽限窗口内仍然可用 —— 客户端拿着旧凭证再试一次仍然能
#: 换到新凭证，而一旦它成功换过（或窗口过去），旧凭证就彻底失效。窗口取 1 天，
#: 远大于客户端的重试节奏，同时把「一枚凭证的有效期」从 180 天收敛到 30 天 + 1 天。
RECOVERY_TOKEN_GRACE_SECONDS = 24 * 3600

class LicenseAuthority:
    """持有密钥环，负责全部租约签发逻辑。"""

    def __init__(
        self,
        settings: StoreSettings,
        database,
        keyring: KeyRegistry,
    ) -> None:
        self.settings = settings
        self.database = database
        self.keyring = keyring

    @property
    def signer(self) -> LeaseSigner:
        """当前一代签名器。只应在「不确定请求用哪一代」的内部路径上使用。"""
        return self.keyring.active.signer

    @property
    def transport(self) -> TransportCipher:
        """当前一代传输密钥。同上；请求路径应按 keyId 选代。"""
        return self.keyring.active.transport

        # 端点
    def activate(
        self,
        payload: dict,
        *,
        ip: str | None = None,
        user_agent: str | None = None,
        generation: KeyGeneration | None = None,
    ) -> dict:
        code = str(payload.get("activationCode") or "").strip().upper()
        instance_id = str(payload.get("instanceId") or "").strip()
        email = str(payload.get("email") or "").strip().lower()
        client_version = str(payload.get("clientVersion") or "").strip()
        product = str(payload.get("product") or "homeos").strip()

        if not code:
            raise LicenseServerError("缺少激活码，请输入购买后获得的激活码。", status_code=422)
        if not email:
            raise LicenseServerError("请输入购买授权时使用的邮箱。", status_code=422)
        if not (16 <= len(instance_id) <= 64):
            raise LicenseServerError("客户端实例标识无效，请重启客户端后重试。", status_code=422)
        if product != "homeos":
            raise LicenseServerError("产品标识不匹配。", status_code=422)

        with self.database.session() as session:
            now = utcnow()
            license = session.scalars(
                select(License).where(License.activation_code == code)
            ).first()
            customer = session.get(Customer, license.customer_id) if license is not None else None
            # S22：**「激活码不存在」与「激活码存在但邮箱不匹配」必须给出完全相同的
            # 回答**。分开回答等于对外提供两台现成的预言机：先用 404 枚举出真实存在的
            # 激活码（它就是产品的授权凭据），再拿 403 把邮箱一位位试出来。两段并成
            # 一个分支之后，攻击者从响应里只能得到「这组组合不对」。
            #
            # 状态码取 404 而不是 403：403 在语义上暗示「凭据存在但你没权限」，
            # 那本身就是泄漏。
            if license is None or customer is None or (customer.email or "").strip().lower() != email:
                raise LicenseServerError(
                    "激活码或邮箱不正确，请核对购买授权时收到的信息后重试。",
                    status_code=404,
                )
            self.assert_usable(license, now)

            binding = self.ensure_binding(
                session,
                license=license,
                instance_id=instance_id,
                client_version=client_version,
                ip=ip,
                now=now,
            )

            session_token, recovery_token, session_id = self.open_session(
                session, license=license, binding=binding, now=now
            )
            response = self.issue(
                session,
                license=license,
                binding=binding,
                session_id=session_id,
                now=now,
                session_token=session_token,
                recovery_token=recovery_token,
                generation=generation,
            )
            logger.info(
                "激活成功 code=%s instance=%s version=%s", code, instance_id, client_version
            )
            return response

    def heartbeat(
        self,
        payload: dict,
        *,
        ip: str | None = None,
        user_agent: str | None = None,
        generation: KeyGeneration | None = None,
    ) -> dict:
        token = str(payload.get("sessionToken") or "")
        client_version = str(payload.get("clientVersion") or "").strip()
        instance_id = str(payload.get("instanceId") or "").strip()
        if not token:
            raise LicenseServerError("缺少授权会话凭证。", status_code=401)

        with self.database.session() as session:
            now = utcnow()
            row = session.get(LicenseSession, token_hash(token))
            if row is None or row.expires_at <= now:
                # 401 会让客户端自动转到 recover
                raise LicenseServerError("授权会话已失效，请重新激活。", status_code=401)
            binding = session.get(DeviceBinding, row.binding_id)
            license = session.get(License, row.license_id)
            if binding is None or license is None:
                raise LicenseServerError("授权会话对应的绑定已不存在。", status_code=401)
            if not binding.active or binding.released_at is not None:
                raise LicenseServerError("实例绑定已停用。", status_code=403, revoked=True)
            # 会话必须属于**当前**绑定在这张授权上的实例。
            #
            # 少了这一条，管理员刚做的解绑对旧设备等于没生效：设备 A 解绑后，设备 B
            # 重新激活会复用同一行 DeviceBinding（ensure_binding 里就地改写
            # instance_id），而 A 手里的 session token 仍指向该行，于是 A 能一直续租。
            # recover 早就比对 instanceId，heartbeat 却漏了 —— 而心跳才是常态路径。
            if not instance_id or binding.instance_id != instance_id:
                logger.warning(
                    "心跳实例不匹配 license=%s binding=%s 期望=%s 实收=%s：按已吊销处理",
                    license.id,
                    binding.id,
                    binding.instance_id,
                    instance_id or "(缺省)",
                )
                raise LicenseServerError(
                    "授权会话不属于当前实例，请重新激活。", status_code=403, revoked=True
                )
            self.assert_usable(license, now)

            row.expires_at = now + timedelta(seconds=self.session_ttl_seconds)
            row.last_used_at = now
            binding.last_heartbeat_at = now
            binding.last_ip = ip
            if client_version:
                binding.client_version = client_version

            return self.issue(
                session,
                license=license,
                binding=binding,
                session_id=row.session_id,
                now=now,
                session_token=token,
                recovery_token="",
                generation=generation,
            )

    def recover(
        self,
        payload: dict,
        *,
        ip: str | None = None,
        user_agent: str | None = None,
        generation: KeyGeneration | None = None,
    ) -> dict:
        token = str(payload.get("recoveryToken") or "")
        instance_id = str(payload.get("instanceId") or "").strip()
        client_version = str(payload.get("clientVersion") or "").strip()
        if not token:
            raise LicenseServerError("缺少租约恢复凭证。", status_code=401)

        with self.database.session() as session:
            now = utcnow()
            record = session.get(RecoveryToken, token_hash(token))
            if record is None or record.expires_at <= now:
                raise LicenseServerError(
                    "租约恢复凭证已失效，请重新激活。", status_code=401
                )
            binding = session.get(DeviceBinding, record.binding_id)
            license = session.get(License, record.license_id)
            if binding is None or license is None:
                raise LicenseServerError("租约恢复凭证对应的绑定已不存在。", status_code=401)
            if binding.instance_id != instance_id:
                raise LicenseServerError("租约不属于当前实例。", status_code=403)
            if not binding.active or binding.released_at is not None:
                raise LicenseServerError("实例绑定已停用。", status_code=403, revoked=True)
            self.assert_usable(license, now)

            # 轮换会话，恢复凭证默认保持不变 —— 但活太久的要换新的（S33，见
            # RECOVERY_TOKEN_ROTATE_AFTER_SECONDS：轮换太激进会在响应丢失时把客户端
            # 彻底锁在外面，所以只在凭证「已经用了很久」时才换）。
            recovery_token, rotated = self.rotate_recovery_if_stale(
                session,
                token=token,
                record=record,
                binding=binding,
                license=license,
                now=now,
            )
            session_token, session_id = self.rotate_session(
                session, license=license, binding=binding, now=now
            )
            binding.last_heartbeat_at = now
            binding.last_ip = ip
            if client_version:
                binding.client_version = client_version
            if rotated:
                logger.info(
                    "恢复凭证已轮换 license=%s binding=%s（旧的留 %d 秒宽限）",
                    license.id,
                    binding.id,
                    RECOVERY_TOKEN_GRACE_SECONDS,
                )

            return self.issue(
                session,
                license=license,
                binding=binding,
                session_id=session_id,
                now=now,
                session_token=session_token,
                recovery_token=recovery_token,
                generation=generation,
            )

        # 内部
    @property
    def session_ttl_seconds(self) -> int:
        return max(3600, int(self.settings.lease_ttl_seconds))

    def assert_usable(self, license: License, now: datetime) -> None:
        """授权是否可继续使用。detail 命中客户端吊销短语以使吊销立即生效。"""
        if not license.active or license.revoked_at is not None:
            raise LicenseServerError(
                "客户授权或激活码已停用。", status_code=403, revoked=True
            )
        if license.access_expires_at is not None and license.access_expires_at <= now:
            raise LicenseServerError(
                "商品授权有效期已结束。", status_code=403, revoked=True
            )

    def last_release_at(self, session: Session, license_id: str) -> datetime | None:
        return session.execute(
            select(DeviceReleaseEvent.created_at)
            .where(DeviceReleaseEvent.license_id == license_id)
            .order_by(DeviceReleaseEvent.created_at.desc())
            .limit(1)
        ).scalar_one_or_none()

    def release_remaining_seconds(
        self, session: Session, license_id: str, now: datetime
    ) -> int:
        last = self.last_release_at(session, license_id)
        if last is None:
            return 0
        cooldown = site_config.effective_device_release_cooldown(session, self.settings)
        allowed = last + timedelta(seconds=cooldown)
        return int(max(0, (allowed - now).total_seconds()))

    def _prune_expired_credentials(self, session: Session, binding_id: str, now: datetime) -> None:
        """删掉这个绑定上**已经过期**的会话与恢复凭证（S33）。

        为什么要主动删：过期的行在库里没有任何用处 —— 心跳与 recover 都会先看
        ``expires_at`` 直接拒掉，后台列表默认也只列未过期的。可它们过去只增不减：
        每次激活都会留下两行，一台长期在用的客户端反复激活/恢复几个月就能攒出一堆
        死凭证，既让备份越来越胖，也让「这张库里到底有几枚还能用的凭据」越来越难看清。
        """
        session.execute(
            delete(LicenseSession).where(
                LicenseSession.binding_id == binding_id, LicenseSession.expires_at <= now
            )
        )
        session.execute(
            delete(RecoveryToken).where(
                RecoveryToken.binding_id == binding_id, RecoveryToken.expires_at <= now
            )
        )

    def rotate_recovery_if_stale(
        self,
        session: Session,
        *,
        token: str,
        record: RecoveryToken,
        binding: DeviceBinding,
        license: License,
        now: datetime,
    ) -> tuple[str, bool]:
        """必要时换一枚恢复凭证，返回 ``(要发给客户端的凭证, 是否轮换过)``。

        传进来的 ``token`` 是客户端这枚凭证的**明文**（``record`` 是按它的哈希查出来的
        行）—— 不轮换时原样返回，调用方就不必再想办法把明文找回来（库里只存哈希，
        找不回来）。

        轮换规则与理由见 ``RECOVERY_TOKEN_ROTATE_AFTER_SECONDS`` /
        ``RECOVERY_TOKEN_GRACE_SECONDS``：旧凭证降到宽限窗口，新的按完整 TTL 生效，
        这样「响应丢失」只是重试一次，而「一枚凭证用到天荒地老」不再可能。
        """
        self._prune_expired_credentials(session, binding.id, now)
        age = (now - (record.created_at or now)).total_seconds()
        if age < RECOVERY_TOKEN_ROTATE_AFTER_SECONDS:
            return token, False
        fresh = new_token(32)
        record.expires_at = now + timedelta(seconds=RECOVERY_TOKEN_GRACE_SECONDS)
        session.add(
            RecoveryToken(
                id_hash=token_hash(fresh),
                binding_id=binding.id,
                license_id=license.id,
                expires_at=now + timedelta(seconds=RECOVERY_TOKEN_TTL_SECONDS),
            )
        )
        session.flush()
        return fresh, True

    def ensure_binding(
        self,
        session: Session,
        *,
        license: License,
        instance_id: str,
        client_version: str,
        ip: str | None,
        now: datetime,
    ) -> DeviceBinding:
        # 无 ORDER BY 的 .first() 挑行取决于引擎返回顺序，而同一张授权可能留下多行
        # 绑定（解绑只是 active=False，行会保留）。优先活跃、其次最近激活，结果才是
        # 确定的；否则下面「已绑定其他设备」的 409 判定会建立在一个随机结果上。
        binding = session.scalars(
            select(DeviceBinding)
            .where(DeviceBinding.license_id == license.id)
            .order_by(DeviceBinding.active.desc(), DeviceBinding.activated_at.desc())
        ).first()

        if binding is None:
            binding = DeviceBinding(
                license_id=license.id,
                instance_id=instance_id,
                client_version=client_version,
                last_ip=ip,
                active=True,
                activated_at=now,
                last_heartbeat_at=now,
            )
            session.add(binding)
            session.flush()
            return binding

        already_bound_here = binding.active and binding.instance_id == instance_id
        if already_bound_here:
            binding.client_version = client_version or binding.client_version
            binding.last_ip = ip
            binding.last_heartbeat_at = now
            return binding

        remaining = self.release_remaining_seconds(session, license.id, now)
        if remaining > 0:
            raise LicenseServerError(
                f"该授权刚刚解绑，冷却中，请 {remaining} 秒后再试。", status_code=409
            )
        if binding.active and binding.instance_id != instance_id:
            raise LicenseServerError(
                "该授权已绑定其他设备，请先在账号中心解除绑定。", status_code=409
            )

        binding.instance_id = instance_id
        binding.client_version = client_version
        binding.last_ip = ip
        binding.active = True
        binding.activated_at = now
        binding.released_at = None
        binding.last_heartbeat_at = now
        # 换了实例就等于换了设备：把指向这一行的旧会话与旧恢复票据一并作废。
        # 否则旧设备手里的 session token 仍然有效，可以继续心跳续租 —— 管理员刚刚
        # 做的解绑对它等于没发生。heartbeat 侧的 instanceId 比对是第二道防线，
        # 这里是第一道：让旧凭证在库里直接失效，而不是每台旧设备都靠一次请求才发现。
        stale_sessions = session.scalars(
            select(LicenseSession).where(LicenseSession.binding_id == binding.id)
        ).all()
        for stale in stale_sessions:
            session.delete(stale)
        stale_recoveries = session.scalars(
            select(RecoveryToken).where(RecoveryToken.binding_id == binding.id)
        ).all()
        for stale in stale_recoveries:
            session.delete(stale)
        if stale_sessions or stale_recoveries:
            logger.info(
                "实例变更，已作废旧会话 license=%s binding=%s 会话=%d 恢复票据=%d",
                license.id,
                binding.id,
                len(stale_sessions),
                len(stale_recoveries),
            )
        session.flush()
        return binding

    def open_session(
        self, session: Session, *, license: License, binding: DeviceBinding, now: datetime
    ) -> tuple[str, str, str]:
        """开一份新会话（激活路径），并把这份绑定上的旧凭据清干净（S33）。

        为什么激活时可以把旧的直接删掉：激活的响应里就带着新的会话与恢复凭证，
        客户端会用新的那两份；旧会话若继续有效，等于同一台设备上多留一枚没人再用、
        却仍然能续租的 bearers token —— 而恢复凭证更敏感（它是「另开一份会话」的
        凭证，180 天有效）。带上激活码才可能走到这里，而激活码客户端自己存着，
        所以即使这枚新恢复凭证的响应丢在路上，客户端也能再激活一次。
        """
        self._prune_expired_credentials(session, binding.id, now)
        session.execute(delete(LicenseSession).where(LicenseSession.binding_id == binding.id))
        session.execute(delete(RecoveryToken).where(RecoveryToken.binding_id == binding.id))
        session_token = new_token(32)
        recovery_token = new_token(32)
        session_id = new_uuid()
        session.add(
            LicenseSession(
                id_hash=token_hash(session_token),
                session_id=session_id,
                binding_id=binding.id,
                license_id=license.id,
                expires_at=now + timedelta(seconds=self.session_ttl_seconds),
            )
        )
        session.add(
            RecoveryToken(
                id_hash=token_hash(recovery_token),
                binding_id=binding.id,
                license_id=license.id,
                expires_at=now + timedelta(seconds=RECOVERY_TOKEN_TTL_SECONDS),
            )
        )
        session.flush()
        return session_token, recovery_token, session_id

    def rotate_session(
        self, session: Session, *, license: License, binding: DeviceBinding, now: datetime
    ) -> tuple[str, str]:
        """恢复路径的换会话。

        同样把该绑定上的**其它**会话删掉（S33）：过去这里只新增不吊销，于是客户端
        每恢复一次就多留下一枚仍在有效期内的会话 token —— 客户端早就不再持有它，
        但它照样能调心跳续租。恢复的语义本来就是「原会话已经不可用，重新拿一份」，
        留下旧的那份不是在保护谁，只是多开了一扇门。恢复凭证不在这里删：它由
        ``rotate_recovery_if_stale`` 决定是沿用还是轮换。
        """
        self._prune_expired_credentials(session, binding.id, now)
        session.execute(delete(LicenseSession).where(LicenseSession.binding_id == binding.id))
        session_token = new_token(32)
        session_id = new_uuid()
        session.add(
            LicenseSession(
                id_hash=token_hash(session_token),
                session_id=session_id,
                binding_id=binding.id,
                license_id=license.id,
                expires_at=now + timedelta(seconds=self.session_ttl_seconds),
            )
        )
        session.flush()
        return session_token, session_id

    def next_lease_sequence(self, session: Session, license: License) -> int:
        """原子地取下一个租约序号（S34）。

        过去是「读 ``license.lease_sequence`` → 加一 → 写回」。这在并发下会漏：两个
        请求各自读到同一个值，于是**两张不同的租约带着同一个序号**发出去。客户端的
        单调性检查（``leaseSequence <= state.lease_sequence`` 且内容不同即判为重放）
        会把后到的那张丢掉 —— 用户突然回到「未授权」，而服务端日志里什么都看不到：
        这不是崩溃，是静默的重复。

        改成一条 ``UPDATE ... SET lease_sequence = lease_sequence + 1 RETURNING ...``：
        读与写在同一条语句里，由数据库保证互斥，并发请求拿到的一定是不同的值。
        用表级（core）语句而不是 ORM 的批量 update，是为了把 ORM 的「同步 session」
        语义摘掉 —— 这里要的就是「绕过内存里的那个值，直接问库」。

        拿到序号后写回 ORM 对象，是为了让随后 flush 出去的 ``UPDATE licenses``
        （带着 ``lease_id``）与库里保持一致，而不是把过期值再盖回去。
        """
        table = License.__table__
        sequence = session.execute(
            table.update()
            .where(table.c.id == license.id)
            .values(lease_sequence=func.coalesce(table.c.lease_sequence, 0) + 1)
            .returning(table.c.lease_sequence)
        ).scalar_one()
        license.lease_sequence = int(sequence)
        return int(sequence)

    def features_for(self, session: Session, license: License, now: datetime) -> list[str]:
        """汇总商品功能码与权益；两者皆空时拒绝签发（fail-closed）。"""
        features: set[str] = set()
        if license.product_id:
            product = session.get(Product, license.product_id)
            if product is not None:
                features.update(str(code) for code in json_list(product.feature_codes_json))
        for entitlement in session.scalars(
            select(Entitlement).where(Entitlement.license_id == license.id)
        ):
            if not entitlement.active:
                continue
            if entitlement.expires_at is not None and entitlement.expires_at <= now:
                continue
            features.add(entitlement.feature_code)
        if not features:
            raise LicenseServerError(
                "该授权未配置任何功能码，请联系商店管理员检查商品功能配置。",
                status_code=422,
            )
        return sorted(features)

    def issue(
        self,
        session: Session,
        *,
        license: License,
        binding: DeviceBinding,
        session_id: str,
        now: datetime,
        session_token: str,
        recovery_token: str,
        generation: KeyGeneration | None = None,
    ) -> dict:
        """签一张租约。

        ``generation`` 必须与**本次请求所用的传输密钥**是同一代（由调用方从请求
        里的 keyId 解析，见 ``store/api/license.py``）。用当前一代固定签发会漏掉
        重叠窗口：旧客户端的可信表里只有旧公钥，拿到新密钥签的租约只会回
        「不受信任的授权公钥」—— 明明窗口开着，旧客户端却全部失联。
        """
        active = generation or self.keyring.active
        signer = active.signer
        sequence = self.next_lease_sequence(session, license)
        lease_id = new_uuid()
        license.lease_id = lease_id
        session.flush()

        lease_payload = {
            "leaseId": lease_id,
            "sessionId": session_id,
            "activationCodeId": license.id,
            "instanceId": binding.instance_id,
            "product": signer.product,
            "keyId": signer.key_id,
            "features": self.features_for(session, license, now),
            "leaseSequence": sequence,
            "issuedAt": iso_z(now),
            "expiresAt": iso_z(
                now + timedelta(seconds=max(300, int(self.settings.lease_ttl_seconds)))
            ),
        }
        response = {
            "signedLease": signer.sign(lease_payload),
            "heartbeatIn": max(30, int(self.settings.heartbeat_interval_seconds)),
            "sessionToken": session_token,
        }
        if recovery_token:
            response["recoveryToken"] = recovery_token
        return response
