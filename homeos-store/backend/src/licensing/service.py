"""授权服务器业务逻辑：激活、心跳续租、租约恢复。
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..config import StoreSettings
from ..core.models import (
    Customer,
    DeviceBinding,
    DeviceReleaseEvent,
    Entitlement,
    License,
    LicenseNonce,
    LicenseSession,
    Product,
    RecoveryToken,
    utcnow,
)
from ..core.serializers import json_list
from ..licensing.crypto import (
    KeyGeneration,
    KeyRegistry,
    LicenseServerError,
)
from ..ops import site_settings as site_config
from ..security.security import (
    iso_z,
    new_token,
    new_uuid,
    token_hash,
)

logger = logging.getLogger("src.license")

RECOVERY_TOKEN_TTL_SECONDS = 180 * 24 * 3600

RECOVERY_TOKEN_ROTATE_AFTER_SECONDS = 30 * 24 * 3600

RECOVERY_TOKEN_GRACE_SECONDS = 24 * 3600

#: 随机数哈希前的域分隔前缀：与令牌哈希共用同一套 sha256，加前缀是为了让「随机数」
#: 与「会话令牌」即使字面相同也不会撞进同一行。
NONCE_HASH_PREFIX = "homeos-license-nonce-v1"

#: 请求随机数的保留时长。它的价值不超过「重放一份请求还能换来什么」，而一份请求最多
#: 撑到对应会话过期（``session_ttl_seconds``，至少 1 小时）；留一整天是给时钟漂移和
#: 客户端重试留余量，到期后由 :meth:`LicenseAuthority.consume_nonce` 顺手清掉。
NONCE_TTL_SECONDS = 24 * 3600

#: 随机数被重放时的文案。**这是线上协议的一部分**：主应用靠「409 + 这句话」识别
#: 「上一次其实已经受理了、只是响应丢了」，改文案会让它把可自愈的重发当成授权失败。
NONCE_REPLAY_DETAIL = "请求随机数已使用，请重新发起请求。"


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
            self.consume_nonce(session, payload, scope="activate", now=now)
            license = session.scalars(
                select(License).where(License.activation_code == code)
            ).first()
            customer = session.get(Customer, license.customer_id) if license is not None else None
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
        """心跳续期。

        会话必须属于当前绑定在该授权上的实例，否则管理员刚做的解绑对老客户端无效。
        但「字段缺失」与「实例不匹配」是两类问题：缺 instanceId 的畸形/旧版客户端回 422
        引导重新激活，绝不能按已吊销（``revoked=True``）处理 —— 那会让客户端清掉本地授权、
        停用功能。
        """
        token = str(payload.get("sessionToken") or "")
        client_version = str(payload.get("clientVersion") or "").strip()
        instance_id = str(payload.get("instanceId") or "").strip()
        if not token:
            raise LicenseServerError("缺少授权会话凭证。", status_code=401)

        with self.database.session() as session:
            now = utcnow()
            row = session.get(LicenseSession, token_hash(token))
            if row is None or row.expires_at <= now:
                raise LicenseServerError("授权会话已失效，请重新激活。", status_code=401)
            binding = session.get(DeviceBinding, row.binding_id)
            license = session.get(License, row.license_id)
            if binding is None or license is None:
                raise LicenseServerError("授权会话对应的绑定已不存在。", status_code=401)
            if not binding.is_live:
                raise LicenseServerError("实例绑定已停用。", status_code=403, revoked=True, code="BINDING_RELEASED")
            if not instance_id:
                raise LicenseServerError(
                    "心跳缺少实例标识（instanceId），请升级客户端或重新激活。",
                    status_code=422,
                )
            if binding.instance_id != instance_id:
                logger.warning(
                    "心跳实例不匹配 license=%s binding=%s 期望=%s 实收=%s：按已吊销处理",
                    license.id,
                    binding.id,
                    binding.instance_id,
                    instance_id,
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
            if not binding.is_live:
                raise LicenseServerError("实例绑定已停用。", status_code=403, revoked=True, code="BINDING_RELEASED")
            self.assert_usable(license, now)

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

    @property
    def session_ttl_seconds(self) -> int:
        return max(3600, int(self.settings.lease_ttl_seconds))

    def consume_nonce(
        self, session: Session, payload: dict, *, scope: str, now: datetime
    ) -> None:
        """受理一个一次性随机数；这个随机数以前出现过就直接拒绝。

        授权请求的信封是自包含的（临时公钥 + 密文 + IV 全在里面），截获之后可以原样重发：
        重发一次 recover 就能再换一份租约。加密只保证「没被篡改」，挡不住「被复制」，
        所以服务端必须记住受理过哪些随机数。

        判重只按哈希，不按明文 —— 这张表看一眼就知道有哪些随机数还没被用掉，
        留明文等于泄一份可重放的凭据清单。

        随机数缺失按 422 硬拒：客户端从引入该字段起就一直在发，收不到说明对端是旧版本，
        此时「放行」等于给旧版本开后门，不如明确让它升级（与 instanceId 同一口径）。
        """
        nonce = str(payload.get("nonce") or "").strip()
        if not nonce:
            raise LicenseServerError(
                "授权请求缺少随机数（nonce），请升级客户端后重试。",
                status_code=422,
                code="NONCE_MISSING",
            )
        key = token_hash(f"{NONCE_HASH_PREFIX}\x00{scope}\x00{nonce}")
        # 惰性清理：每次受理顺手删掉已过期的行，省掉一个定时任务。
        session.execute(delete(LicenseNonce).where(LicenseNonce.expires_at <= now))
        if session.get(LicenseNonce, key) is not None:
            logger.info("授权请求随机数被重放 scope=%s", scope)
            raise LicenseServerError(
                NONCE_REPLAY_DETAIL, status_code=409, code="NONCE_REPLAY"
            )
        session.add(
            LicenseNonce(
                id_hash=key,
                scope=scope,
                expires_at=now + timedelta(seconds=NONCE_TTL_SECONDS),
            )
        )
        session.flush()

    @staticmethod
    def reported_lease_sequence(payload: dict) -> int:
        """客户端自报的租约序号（它手上那份租约的 ``leaseSequence``）。

        与 ``instanceId`` 同一口径：缺字段按 422 引导升级，而不是当成 0 悄悄放行 ——
        序列号是「签发值必须严格递增」的依据，缺了它就退化回「服务端自己数自己的」。
        """
        raw = payload.get("leaseSequence")
        if isinstance(raw, bool) or not isinstance(raw, int):
            raise LicenseServerError(
                "授权请求缺少租约序号（leaseSequence），请升级客户端后重试。",
                status_code=422,
                code="LEASE_SEQUENCE_MISSING",
            )
        if raw < 0:
            raise LicenseServerError(
                "授权请求的租约序号无效。", status_code=422, code="LEASE_SEQUENCE_INVALID"
            )
        return raw

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
        """
        last = self.last_release_at(session, license_id)
        if last is None:
            return 0
        cooldown = site_config.effective_device_release_cooldown(session, self.settings)
        allowed = last + timedelta(seconds=cooldown)
        return int(max(0, (allowed - now).total_seconds()))

    def _prune_expired_credentials(self, session: Session, binding_id: str, now: datetime) -> None:
        """删掉这个绑定上**已经过期**的会话与恢复凭证。
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
        binding = session.scalars(
            select(DeviceBinding)
            .where(DeviceBinding.license_id == license.id)
            .order_by(*DeviceBinding.liveness_order())
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

        already_bound_here = binding.is_live and binding.instance_id == instance_id
        if already_bound_here:
            binding.client_version = client_version or binding.client_version
            binding.last_ip = ip
            binding.last_heartbeat_at = now
            return binding

        if binding.is_live and binding.instance_id != instance_id:
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
        """
        table = License.__table__
        sequence = session.execute(
            table.update()  # type: ignore[reportAttributeAccessIssue]  # SQLAlchemy Table.update()（__table__ 运行期为 Table）
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
            if entitlement.starts_at is not None and entitlement.starts_at > now:
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
