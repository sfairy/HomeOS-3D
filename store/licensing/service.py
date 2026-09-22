"""授权服务器业务逻辑：激活、心跳续租、租约恢复。

对应客户端 `backend/license/service.py` 里的 ``/v2/*`` 三个端点。错误语义必须与
客户端约定一致：``401`` 表示会话失效（客户端会尝试 recover）；``403`` 且 detail
命中吊销短语判定为「确认吊销」并清空本地授权；其余 4xx 直接失败，不做端点切换。
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

#: 恢复凭证的轮换阈值：活过这么久之后，下一次 ``recover`` 换新的。不能每次 recover
#: 都换 —— 新凭证若在响应中丢失，客户端手里只剩一枚已作废的凭证，会彻底失联。
RECOVERY_TOKEN_ROTATE_AFTER_SECONDS = 30 * 24 * 3600

#: 被轮换下来的恢复凭证还留多久：旧凭证不是立刻作废，而是在宽限窗口内仍可用，客户端
#: 拿旧凭证再试一次仍能换到新凭证。窗口取 1 天，远大于客户端重试节奏。
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
            # 「激活码不存在」与「邮箱不匹配」必须给出完全相同的回答：分开回答等于
            # 提供枚举激活码/试邮箱的预言机。状态码取 404（403 会暗示凭据存在）。
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
            # 会话必须属于**当前**绑定在该授权上的实例。少了这条，管理员刚做的解绑对
            # 旧设备等于没生效：设备 B 复用同一行 DeviceBinding，A 仍能凭旧 token 续租。
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

            # 轮换会话，恢复凭证默认不变，但活太久的要换新的：轮换太激进会在响应丢失时
            # 把客户端彻底锁在外面。
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
        """该授权**最近一次解绑**的时刻（自助与后台强制解绑都计入）。

        读的是解绑事件表而不是绑定行的 ``released_at``：一条授权可能留下多行绑定，
        而「最近一次解绑」是全授权口径的一件事。
        """
        return session.execute(
            select(DeviceReleaseEvent.created_at)
            .where(DeviceReleaseEvent.license_id == license_id)
            .order_by(DeviceReleaseEvent.created_at.desc())
            .limit(1)
        ).scalar_one_or_none()

    def release_remaining_seconds(
        self, session: Session, license_id: str, now: datetime
    ) -> int:
        """距该授权**下一次可以解绑**还有多少秒（0 = 现在就可以）。

        冷却是「两次解绑之间」的间隔，用它给「换机」这件事减速：解绑后能立刻激活
        （任意设备），但同一张授权在冷却期内不能再解绑一次。所以这个读数只在
        **解绑**那条路径上判定（``store.api.store.release_device``），激活路径
        （``ensure_binding``）刻意不看它 —— 在那里拦会把「解绑后立刻激活回来」也一起
        挡掉，而那不是冷却要管的事。
        """
        last = self.last_release_at(session, license_id)
        if last is None:
            return 0
        cooldown = site_config.effective_device_release_cooldown(session, self.settings)
        allowed = last + timedelta(seconds=cooldown)
        return int(max(0, (allowed - now).total_seconds()))

    def _prune_expired_credentials(self, session: Session, binding_id: str, now: datetime) -> None:
        """删掉这个绑定上**已经过期**的会话与恢复凭证。

        过期的行没有任何用处（心跳与 recover 都会先看 ``expires_at`` 拒掉），但过去
        只增不减：每次激活留下两行，长期反复激活/恢复会攒出一堆死凭证。
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

        传进来的 ``token`` 是明文（库里只存哈希，找不回来），不轮换时原样返回。轮换后
        旧凭证降到宽限窗口、新的按完整 TTL 生效。
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
        # 无 ORDER BY 的 .first() 挑行取决于引擎返回顺序，而同一张授权可能留下多行绑定
        # （解绑只是 active=False）。优先活跃、其次最近激活，否则 409 判定会随机。
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

        # 冷却**不在这里**：它约束的是「下一次解绑」，不是「下一次激活」。解绑后用户
        # 应当能立刻激活回来 —— 账号中心解绑成功的提示本来就叫用户回激活页，而旧实现
        # 在这里挡一道，等于让用户解绑完必须干等一整个冷却周期（默认 8 小时）才能把
        # 自己那台机器重新激活，同机重绑也一并被拦。同机重绑既不是换机也不构成绕过：
        # 反复解绑/重绑同一台机器拿不到任何额外好处，而自助解绑本身受冷却与口令两道
        # 限制（见 store.api.store.release_device），换机则下面这道判定独立负责。
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
        # 换实例等于换设备：把指向这一行的旧会话与旧恢复票据一并作废，否则旧设备的
        # session token 仍能续租。heartbeat 侧的 instanceId 比对是第二道防线。
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
        """开一份新会话（激活路径），并把这份绑定上的旧凭据清干净。

        激活响应就带着新的会话与恢复凭证，旧的继续有效只会多留一枚能续租的 bearer
        token（恢复凭证更敏感）。带上激活码才能走到这里，所以即使响应丢了也能再激活。
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

        同样把该绑定上的**其它**会话删掉：过去只新增不吊销，客户端每恢复一次就多留一枚
        仍能续租的 token。恢复凭证不在这里删，由 ``rotate_recovery_if_stale`` 决定。
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
        """原子地取下一个租约序号。

        必须是 ``UPDATE ... RETURNING``：读-改-写在并发下会给两张不同租约同一个序号，
        客户端的单调性检查会把后到的那张当重放丢掉，用户突然回到「未授权」且无报错。
        用 core 语句是为了绕过内存里的值、直接问库。
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

        ``generation`` 必须与**本次请求所用的传输密钥**同代（由调用方从请求里的 keyId
        解析）：用当前一代固定签发会漏掉重叠窗口，旧客户端拿到新密钥签的租约只会回
        「不受信任的授权公钥」。
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
