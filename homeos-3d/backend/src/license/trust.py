# [补充说明] 授权信任锚启动自检：公钥文件存在，且字节指纹与配置里的常量一致。
#
# 为什么要在启动期查而不是等到第一次激活：指纹不匹配时，激活会以一个看不出原因
# 的「签名无效」收场，用户会去怀疑激活码或网络。提前失败能把矛头直接指向打包 /
# 部署环节（公钥文件没带上、被替换、或者与授权商店那套不是同一代密钥）。
from __future__ import annotations

import hashlib
import hmac
from pathlib import Path

from ..config import Settings

KEY_PREPARATION_HINT = (
    '请确认 keys/ 下的 license-public.pem 与 license-transport-public.pem 是**授权商店'
    '当前那一代**公钥的镜像（把 homeos-store/keys/local 下的同名公钥同步过来即可），'
    '两个文件的 sha256 必须与 backend/src/config.py 里的 DEFAULT_LICENSE_PUBLIC_KEY_SHA256 / '
    'DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256 一致；也可用启动器按公钥文件字节注入 '
    'APP_LICENSE_PUBLIC_KEY_SHA256 / APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256 覆盖。'
)


def _file_sha256(path: Path) -> str:
    # 直接对文件字节算指纹：换行或空格的差异也会被算进去，避免「看着一样其实不是同一份」。
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_license_trust_anchors(settings: Settings) -> None:
    # [补充说明] 校验签名公钥与传输公钥的文件存在性与指纹。
    #
    # 签名公钥按 keyId 逐条查（可信表可能同时留着上一代密钥），传输公钥只有一份。
    # 异常直接抛 RuntimeError：这是配置 / 打包错误，属于快速失败，不该被吞掉。
    for key_id, (path, expected) in settings.license_trusted_public_keys.items():
        if not path.exists():
            raise RuntimeError(f'''授权签名公钥缺失：{path}。{KEY_PREPARATION_HINT}''')
        if expected:
            actual = _file_sha256(path)
            if not hmac.compare_digest(actual, expected):
                raise RuntimeError(
                    f'''授权签名公钥指纹不匹配（keyId={key_id}）：'''
                    f'''期望 {expected}，实际 {actual}。{KEY_PREPARATION_HINT}''')
    transport_path = settings.license_transport_public_key_path
    if not transport_path.exists():
        raise RuntimeError(f'''授权传输公钥缺失：{transport_path}。{KEY_PREPARATION_HINT}''')
    actual = _file_sha256(transport_path)
    expected = settings.license_transport_public_key_sha256
    if not hmac.compare_digest(actual, expected):
        raise RuntimeError(
            f'''授权传输公钥指纹不匹配：期望 {expected}，实际 {actual}。{KEY_PREPARATION_HINT}''')
