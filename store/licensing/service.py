"""授权服务器业务逻辑：激活、心跳续租、租约恢复。

对应客户端 `backend/app/license/service.py` 里的 ``/v2/*`` 三个端点。
错误语义必须与客户端约定一致：

- ``401`` 表示会话失效 → 客户端会尝试 ``recover``
- ``403`` 且 detail 命中吊销短语 → 客户端判定为「确认吊销」并清空本地授权
- 其余 4xx 直接失败，不做端点切换
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from store import site_settings as site_config
from store.config import StoreSettings
from store.licensing.crypto import LeaseSigner, LicenseServerError, TransportCipher
from store.models import (
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
from store.security import (
    iso_z,
    new_token,
    new_uuid,
    token_hash,
)
from store.serializers import json_list

logger = logging.getLogger("store.license")

#: 恢复凭证有效期（比会话长，保证会话失效后仍能救回来）
RECOVERY_TOKEN_TTL_SECONDS = 180 * 24 * 3600

class LicenseAuthority:
    """持有签名密钥与传输密钥，负责全部租约签发逻辑。"""

    def __init__(
        self,
        settings: StoreSettings,
        database,
        signer: LeaseSigner,
        transport: TransportCipher,
    ) -> None:
        self.settings = settings
        self.database = database
        self.signer = signer
        self.transport = transport

    # ------------------------------------------------------------------ #
    # 端点
    # ------------------------------------------------------------------ #
    def activate(
        self, payload: dict, *, ip: str | None = None, user_agent: str | None = None
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
            if license is None:
                raise LicenseServerError(
                    "激活码无效或不存在，请核对后重试。", status_code=404
                )
            customer = session.get(Customer, license.customer_id)
            if customer is None or (customer.email or "").strip().lower() != email:
                raise LicenseServerError(
                    "激活码与邮箱不匹配，请填写购买授权时使用的邮箱。", status_code=403
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
            )
            logger.info(
                "激活成功 code=%s instance=%s version=%s", code, instance_id, client_version
            )
            return response

    def heartbeat(
        self, payload: dict, *, ip: str | None = None, user_agent: str | None = None
    ) -> dict:
        token = str(payload.get("sessionToken") or "")
        client_version = str(payload.get("clientVersion") or "").strip()
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
            )

    def recover(
        self, payload: dict, *, ip: str | None = None, user_agent: str | None = None
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

            # 轮换会话，但保持恢复凭证稳定，避免「响应丢失后彻底失联」
            session_token, session_id = self.rotate_session(
                session, license=license, binding=binding, now=now
            )
            binding.last_heartbeat_at = now
            binding.last_ip = ip
            if client_version:
                binding.client_version = client_version

            return self.issue(
                session,
                license=license,
                binding=binding,
                session_id=session_id,
                now=now,
                session_token=session_token,
                recovery_token=token,
            )

    # ------------------------------------------------------------------ #
    # 内部
    # ------------------------------------------------------------------ #
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
            select(DeviceBinding).where(DeviceBinding.license_id == license.id)
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
        session.flush()
        return binding

    def open_session(
        self, session: Session, *, license: License, binding: DeviceBinding, now: datetime
    ) -> tuple[str, str, str]:
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
    ) -> dict:
        sequence = int(license.lease_sequence or 0) + 1
        lease_id = new_uuid()
        license.lease_sequence = sequence
        license.lease_id = lease_id
        session.flush()

        lease_payload = {
            "leaseId": lease_id,
            "sessionId": session_id,
            "activationCodeId": license.id,
            "instanceId": binding.instance_id,
            "product": self.signer.product,
            "keyId": self.signer.key_id,
            "features": self.features_for(session, license, now),
            "leaseSequence": sequence,
            "issuedAt": iso_z(now),
            "expiresAt": iso_z(
                now + timedelta(seconds=max(300, int(self.settings.lease_ttl_seconds)))
            ),
        }
        response = {
            "signedLease": self.signer.sign(lease_payload),
            "heartbeatIn": max(30, int(self.settings.heartbeat_interval_seconds)),
            "sessionToken": session_token,
        }
        if recovery_token:
            response["recoveryToken"] = recovery_token
        return response
