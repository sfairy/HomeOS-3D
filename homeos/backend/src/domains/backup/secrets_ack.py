"""备份恢复前的 secrets 风险确认。"""

from __future__ import annotations


def require_secrets_acknowledgment(has_secrets: bool, *, acknowledged: bool) -> None:
    """无 secrets 的包必须显式风险确认；未勾选则拒绝恢复（避免一键半恢复）。"""
    if has_secrets or acknowledged:
        return
    from .business_backup import BackupError

    raise BackupError(
        "该备份不含连接密钥（secrets）。恢复后 HA 令牌与授权凭证将无法解密；"
        "请勾选风险确认后再恢复，或改用包含密钥的完整备份。"
    )
