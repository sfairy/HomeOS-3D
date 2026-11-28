"""智能音箱配对授权（对齐参考 ``voice-device.service.js``）。

三条规则决定了这里的实现形状：

1. **凭据只落哈希**。配对码 / 设备凭证 / 访问令牌三把串都只存 sha256：库被读走也换不出
   可用凭据。参考实现同样如此，这不是本项目自创的收紧。
2. **配对码一次性**。消费用条件更新（``UPDATE … WHERE pairingHash = ? AND revokedAt IS NULL``），
   受影响行数不是 1 就拒绝 —— 两个音箱同时用同一码时只有一个能成功。
3. **同设备只留最新授权**。配对成功后吊销同 ``(gatewayId, deviceId)`` 的旧行：音箱重装会换
   新凭证，旧凭证不能继续可用。

时间口径与参考一致：配对码 10 分钟、访问令牌 15 分钟；设备凭证长期有效，直到被吊销或
音箱重新配对。
"""

from __future__ import annotations

import hashlib
import json
import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, select, update

from ...platform.core.db.models import User, VoiceDeviceGrant

logger = logging.getLogger("homeos.voice_device")

#: 配对码有效期（10 分钟）。
PAIRING_TTL = timedelta(minutes=10)
#: 访问令牌有效期（15 分钟）。
ACCESS_TTL = timedelta(minutes=15)
#: 配对码 / 设备凭证 / 访问令牌的明文长度（``token_urlsafe(24)`` = 32 字符）。
SECRET_LENGTH = 32
#: ``gatewayId`` / ``deviceId`` 允许的字符（挡住带路径分隔符的注入式取值）。
_ID_CHARS = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-")
_ID_MAX = 96


class VoiceDeviceError(Exception):
    """带 HTTP 语义的业务错误（``status`` 由 API 层映射成响应码）。"""

    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


def utc_now() -> datetime:
    """UTC naive：与库里的 ``DateTime`` 列（无时区）同一口径。"""
    return datetime.now(UTC).replace(tzinfo=None)


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _secret() -> str:
    # ``token_urlsafe(24)`` 恰好 32 个 URL 安全字符；长度是配对校验的一部分。
    return secrets.token_urlsafe(24)


def _valid_id(value: Any) -> bool:
    text = str(value or "")
    return 0 < len(text) <= _ID_MAX and set(text) <= _ID_CHARS


def parse_notify_member_ids(raw: Any) -> list[str]:
    """解析 ``notifyMemberIds`` 列：只保留非空字符串并去重（保序）。"""
    if not raw:
        return []
    parsed: Any = raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except (TypeError, ValueError):  # fmt: skip
            logger.debug("notifyMemberIds 不是合法 JSON，按空处理: %r", raw)
            return []
    if not isinstance(parsed, list):
        return []
    seen: set[str] = set()
    out: list[str] = []
    for item in parsed:
        text = str(item).strip() if isinstance(item, str) else ""
        if text and text not in seen:
            seen.add(text)
            out.append(text)
    return out


def display_name_of(user: User) -> str:
    """展示名：优先 ``displayName``，空时回退 ``username``。"""
    return str(getattr(user, "display_name", None) or user.username or "").strip()


class VoiceDeviceService:
    """音箱配对授权服务。

    ``session_factory`` 由装配层注入（与其它域一致）；每个方法自开一次短会话，不与
    请求级会话共享 —— 配对发生在音箱侧，没有登录 Cookie，不能依赖请求上下文。
    """

    def __init__(self, session_factory: Any) -> None:
        self._session_factory = session_factory

    # ── 配对码 ────────────────────────────────────────────────
    def create_pairing(self, member_id: str | None = None) -> dict[str, Any]:
        """生成一次性配对码（10 分钟）。未指定成员时用唯一管理员。"""
        code = _secret()
        now = utc_now()
        expires = now + PAIRING_TTL
        with self._session_factory() as session:
            member = self._resolve_member(session, member_id)
            # 过期未消费的配对码**整行删除**，不要只把 pairingHash 置 NULL。
            #
            # 置 NULL 看着更"温和"，实际会留下一堆永远无法再被使用的死行：既没有凭证
            # （不在设备列表里）、也没有配对码（不可能被消费），只是把表撑大；而且它们
            # 和「设备已吊销」在数据上无从区分，排查时会误导。
            session.execute(
                delete(VoiceDeviceGrant).where(
                    VoiceDeviceGrant.pairing_hash.is_not(None),
                    VoiceDeviceGrant.credential_hash.is_(None),
                    VoiceDeviceGrant.pairing_expires < now,
                )
            )
            grant = VoiceDeviceGrant(
                member_id=member.id,
                pairing_hash=_hash(code),
                pairing_expires=expires,
                created_at=now,
            )
            session.add(grant)
            session.commit()
            return {"id": grant.id, "pairingCode": code, "expiresAt": _iso(expires)}

    def _resolve_member(self, session: Any, member_id: str | None) -> User:
        """解析要授权的账号。

        - 显式 ``member_id``：必须存在且启用，否则明确报错（不猜）；
        - 未指定：单账号部署恒为本机账号。**优先启用中的 ADMIN**，再退到最早创建的启用账号 ——
          备份导入的库里可能先有一条无凭据的占位行（``is_active`` 可能为真但没有口令），
          单纯按 ``createdAt`` 取第一条会把音箱授权绑到一个登不进来的账号上。
        """
        if member_id:
            member = session.get(User, str(member_id))
            if member is None or not bool(getattr(member, "is_active", True)):
                raise VoiceDeviceError("请选择已启用的账号", 409)
            return member
        active = session.scalars(
            select(User).where(User.is_active.is_(True)).order_by(User.created_at.asc()).limit(8)
        ).all()
        if not active:
            raise VoiceDeviceError("尚未创建任何可用账号", 409)
        for row in active:
            if str(getattr(row, "role", "") or "").upper() == "ADMIN":
                return row
        return active[0]

    # ── 列表 / 授权开关 ────────────────────────────────────────
    def list_devices(self) -> list[dict[str, Any]]:
        """已配对（有设备凭证且未吊销）的音箱列表。"""
        with self._session_factory() as session:
            rows = session.scalars(
                select(VoiceDeviceGrant)
                .where(
                    VoiceDeviceGrant.credential_hash.is_not(None),
                    VoiceDeviceGrant.revoked_at.is_(None),
                )
                .order_by(VoiceDeviceGrant.created_at.desc())
            ).all()
            members = {
                row.id: row
                for row in session.scalars(select(User).where(User.id.in_([r.member_id for r in rows] or [""]))).all()
            }
            out: list[dict[str, Any]] = []
            for row in rows:
                member = members.get(row.member_id)
                out.append(
                    {
                        "id": row.id,
                        "memberId": row.member_id,
                        "memberName": display_name_of(member) if member is not None else "",
                        "voiceGatewayId": row.voice_gateway_id,
                        "voiceDeviceId": row.voice_device_id,
                        "allowVoiceWakeWordAdd": bool(row.allow_voice_wake_word_add),
                        "notifyMemberIds": parse_notify_member_ids(row.notify_member_ids),
                        "lastUsedAt": _iso(row.last_used_at),
                        "revokedAt": _iso(row.revoked_at),
                        "createdAt": _iso(row.created_at),
                    }
                )
            return out

    def set_wake_word_permission(self, grant_id: str, allowed: Any) -> dict[str, Any]:
        if not isinstance(allowed, bool):
            raise VoiceDeviceError("权限设置必须是布尔值")
        with self._session_factory() as session:
            updated = session.execute(
                update(VoiceDeviceGrant)
                .where(
                    VoiceDeviceGrant.id == grant_id,
                    VoiceDeviceGrant.revoked_at.is_(None),
                    VoiceDeviceGrant.credential_hash.is_not(None),
                )
                .values(allow_voice_wake_word_add=allowed)
            )
            session.commit()
            if updated.rowcount != 1:
                raise VoiceDeviceError("未找到有效的音箱配对授权", 404)
        return {"allowVoiceWakeWordAdd": allowed}

    def set_notify_members(self, grant_id: str, member_ids: Any) -> dict[str, Any]:
        """设置「发到手机」未点名时的默认接收人。

        空数组合法（= 回退发言人本人）。非空时必须每个 id 都存在且启用 ——
        静默丢弃无效 id 会让用户以为已经配好了。
        """
        if not isinstance(member_ids, list) or any(
            not isinstance(item, str) or not item.strip() for item in member_ids
        ):
            raise VoiceDeviceError("默认推送成员名单必须是有效的成员 ID 列表")
        unique = list(dict.fromkeys(item.strip() for item in member_ids))
        with self._session_factory() as session:
            if unique:
                found = session.scalars(select(User.id).where(User.id.in_(unique), User.is_active.is_(True))).all()
                if len(found) != len(unique):
                    raise VoiceDeviceError("默认推送名单中包含无效或已停用的账号", 409)
            updated = session.execute(
                update(VoiceDeviceGrant)
                .where(
                    VoiceDeviceGrant.id == grant_id,
                    VoiceDeviceGrant.revoked_at.is_(None),
                    VoiceDeviceGrant.credential_hash.is_not(None),
                )
                .values(notify_member_ids=json.dumps(unique, ensure_ascii=False) if unique else None)
            )
            session.commit()
            if updated.rowcount != 1:
                raise VoiceDeviceError("未找到有效的音箱配对授权", 404)
        return {"notifyMemberIds": unique}

    def get_notify_member_ids(self, grant_id: str) -> list[str]:
        with self._session_factory() as session:
            row = session.scalars(
                select(VoiceDeviceGrant).where(
                    VoiceDeviceGrant.id == grant_id,
                    VoiceDeviceGrant.revoked_at.is_(None),
                )
            ).first()
            return parse_notify_member_ids(row.notify_member_ids) if row is not None else []

    # ── 配对 / 续期 / 吊销 ────────────────────────────────────
    def pair(self, code: Any, gateway_id: Any, device_id: Any) -> dict[str, Any]:
        """用配对码换设备凭证；同设备旧授权一并吊销。"""
        if (
            not isinstance(code, str)
            or len(code) != SECRET_LENGTH
            or not _valid_id(gateway_id)
            or not _valid_id(device_id)
        ):
            raise VoiceDeviceError("配对信息无效", 401)
        pairing_hash = _hash(code)
        now = utc_now()
        device_credential = _secret()
        with self._session_factory() as session:
            grant = session.scalars(
                select(VoiceDeviceGrant).where(VoiceDeviceGrant.pairing_hash == pairing_hash)
            ).first()
            if grant is None or grant.revoked_at is not None:
                raise VoiceDeviceError("配对码已失效", 401)
            if grant.pairing_expires is None or grant.pairing_expires <= now:
                raise VoiceDeviceError("配对码已失效", 401)
            member = session.get(User, grant.member_id)
            if member is None or not bool(getattr(member, "is_active", True)):
                raise VoiceDeviceError("成员已停用", 401)
            consumed = session.execute(
                update(VoiceDeviceGrant)
                .where(
                    VoiceDeviceGrant.id == grant.id,
                    VoiceDeviceGrant.pairing_hash == pairing_hash,
                    VoiceDeviceGrant.revoked_at.is_(None),
                    VoiceDeviceGrant.pairing_expires > now,
                )
                .values(
                    voice_gateway_id=str(gateway_id),
                    voice_device_id=str(device_id),
                    pairing_hash=None,
                    pairing_expires=None,
                    credential_hash=_hash(device_credential),
                    last_used_at=now,
                )
            )
            if consumed.rowcount != 1:
                session.rollback()
                raise VoiceDeviceError("配对码已失效", 401)
            # 同一台音箱重新配对：旧凭证必须立刻不可用（否则重装后两份凭证并存）。
            session.execute(
                update(VoiceDeviceGrant)
                .where(
                    VoiceDeviceGrant.voice_gateway_id == str(gateway_id),
                    VoiceDeviceGrant.voice_device_id == str(device_id),
                    VoiceDeviceGrant.id != grant.id,
                    VoiceDeviceGrant.revoked_at.is_(None),
                )
                .values(revoked_at=now, access_hash=None, access_expires=None)
            )
            session.commit()
            return {
                "deviceCredential": device_credential,
                "voiceGatewayId": str(gateway_id),
                "voiceDeviceId": str(device_id),
                "memberId": member.id,
                "memberName": display_name_of(member),
            }

    def renew(self, token: Any) -> dict[str, Any]:
        """设备凭证换 15 分钟访问令牌。"""
        grant = self.authorize("credentialHash", token)
        access_token = _secret()
        expires = utc_now() + ACCESS_TTL
        with self._session_factory() as session:
            updated = session.execute(
                update(VoiceDeviceGrant)
                .where(VoiceDeviceGrant.id == grant["id"], VoiceDeviceGrant.revoked_at.is_(None))
                .values(
                    access_hash=_hash(access_token),
                    access_expires=expires,
                    last_used_at=utc_now(),
                )
            )
            session.commit()
            if updated.rowcount != 1:
                raise VoiceDeviceError("设备授权已撤销", 401)
        return {"accessToken": access_token, "expiresIn": int(ACCESS_TTL.total_seconds())}

    def authorize(self, kind: str, token: Any) -> dict[str, Any]:
        """按凭证类型解析授权行；``kind`` ∈ ``credentialHash`` / ``accessHash``。"""
        if kind not in ("credentialHash", "accessHash"):  # pragma: no cover - 内部调用约束
            raise VoiceDeviceError("设备授权无效", 401)
        match = token if isinstance(token, str) else ""
        if len(match) != SECRET_LENGTH:
            raise VoiceDeviceError("设备授权无效", 401)
        column = VoiceDeviceGrant.credential_hash if kind == "credentialHash" else VoiceDeviceGrant.access_hash
        now = utc_now()
        with self._session_factory() as session:
            grant = session.scalars(
                select(VoiceDeviceGrant).where(
                    column == _hash(match),
                    VoiceDeviceGrant.revoked_at.is_(None),
                    VoiceDeviceGrant.voice_gateway_id.is_not(None),
                    VoiceDeviceGrant.voice_device_id.is_not(None),
                )
            ).first()
            if grant is None:
                raise VoiceDeviceError("设备授权无效", 401)
            if kind == "accessHash" and (grant.access_expires is None or grant.access_expires <= now):
                raise VoiceDeviceError("设备授权已失效", 401)
            member = session.get(User, grant.member_id)
            if member is None or not bool(getattr(member, "is_active", True)):
                raise VoiceDeviceError("成员已停用", 401)
            return {
                "id": grant.id,
                "memberId": grant.member_id,
                "memberName": display_name_of(member),
                "voiceGatewayId": grant.voice_gateway_id,
                "voiceDeviceId": grant.voice_device_id,
                "allowVoiceWakeWordAdd": bool(grant.allow_voice_wake_word_add),
                "role": str(getattr(member, "role", "") or "ADMIN"),
            }

    def require_wake_word_permission(self, grant_id: str) -> None:
        """语音端加词前的闸门：授权行必须开着「允许语音添加唤醒词」且账号有效。"""
        with self._session_factory() as session:
            grant = session.scalars(
                select(VoiceDeviceGrant).where(
                    VoiceDeviceGrant.id == grant_id,
                    VoiceDeviceGrant.revoked_at.is_(None),
                    VoiceDeviceGrant.credential_hash.is_not(None),
                    VoiceDeviceGrant.allow_voice_wake_word_add.is_(True),
                )
            ).first()
            member = session.get(User, grant.member_id) if grant is not None else None
            if member is None or not bool(getattr(member, "is_active", True)):
                raise VoiceDeviceError("这台音箱未获得通过语音添加唤醒词的权限。", 403)

    def revoke(self, grant_id: str) -> dict[str, Any]:
        with self._session_factory() as session:
            session.execute(
                update(VoiceDeviceGrant)
                .where(VoiceDeviceGrant.id == grant_id, VoiceDeviceGrant.revoked_at.is_(None))
                .values(
                    revoked_at=utc_now(),
                    pairing_hash=None,
                    pairing_expires=None,
                    access_hash=None,
                    access_expires=None,
                )
            )
            session.commit()
        return {"ok": True}

    def unlink(self, token: Any) -> dict[str, Any]:
        """音箱自己解绑（设备凭证鉴权）。"""
        grant = self.authorize("credentialHash", token)
        return self.revoke(grant["id"])

    # ── 给工具层用的收件人解析 ────────────────────────────────
    def find_member_by_name(self, needle: str) -> tuple[dict[str, Any] | None, str | None]:
        """按显示名 / 用户名找成员：精确优先，再退到包含匹配。

        返回 ``(member, error)``：``error`` 非空时给用户看的文案（0 命中 / 多命中）。
        只认启用账号 —— 停用账号点不到名下设备，匹配上也没有意义。
        """
        text = str(needle or "").strip().lower()
        if not text:
            return None, "请说明要发送给哪位成员。"
        with self._session_factory() as session:
            rows = session.scalars(select(User).where(User.is_active.is_(True))).all()

        def _hit(user: User) -> tuple[str, str]:
            return (
                str(getattr(user, "display_name", None) or "").strip().lower(),
                str(user.username or "").strip().lower(),
            )

        exact = [row for row in rows if text in _hit(row)]
        candidates = exact or [row for row in rows if any(text in name for name in _hit(row) if name)]
        if not candidates:
            return None, f"未找到名为「{needle}」的家庭成员，无法推送到手机。"
        if len(candidates) > 1:
            names = "、".join(display_name_of(row) for row in candidates)
            return None, f"「{needle}」匹配到多位成员（{names}），请明确说明要发送给哪一位。"
        member = candidates[0]
        return {"id": member.id, "name": display_name_of(member)}, None

    def resolve_notify_recipients(self, grant_id: str, speaker_user_id: str | None) -> dict[str, Any]:
        """「发到手机」未点名时的收件人：音箱默认名单，未配置时回退发言人本人。

        返回 ``{"userIds": [...], "names": [...], "source": "configured"|"self"}``。
        调用方负责判断这些账号有没有推送设备 —— 那要看订阅表，不属于本服务。
        """
        configured = self.get_notify_member_ids(grant_id)
        with self._session_factory() as session:
            if configured:
                members = session.scalars(select(User).where(User.id.in_(configured), User.is_active.is_(True))).all()
                if members:
                    return {
                        "userIds": [m.id for m in members],
                        "names": [display_name_of(m) for m in members],
                        "source": "configured",
                    }
            if speaker_user_id:
                member = session.get(User, speaker_user_id)
                if member is not None and bool(getattr(member, "is_active", True)):
                    return {
                        "userIds": [member.id],
                        "names": [display_name_of(member)],
                        "source": "self",
                    }
        return {"userIds": [], "names": [], "source": "none"}


def _iso(value: Any) -> str | None:
    """``datetime`` → ISO 字符串；空值保持 ``None``（前端按缺失渲染）。"""
    if value is None:
        return None
    try:
        return value.replace(tzinfo=UTC).isoformat()
    except AttributeError:  # pragma: no cover - 非 datetime 防御
        return str(value)
