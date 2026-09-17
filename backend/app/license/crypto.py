"""授权链路的密码学原语。

三块职责，共同构成「离线可信」的基础：
1. LeaseVerifier —— 用 Ed25519 公钥校验授权服务签发的「签名租约」，
   这是门禁的信任根：数据库里的状态字段可以被改写，签名伪造不了。
2. LicenseTransportCipher —— 请求侧 X25519 ECDH 协商一次性共享秘密，
   经 HKDF-SHA256 派生 AES-256-GCM 密钥，加密请求体并解密响应体，
   保证激活码、令牌与实例 ID 不以明文经过网络。
3. SecretCipher —— 用本机密钥文件（Fernet）加密落库的会话令牌、恢复令牌与激活码。

全局约定：本模块所有失败都抛 LicenseCryptoError；调用方（service.py）据此把状态
归类为 INVALID / INSTANCE_MISMATCH，而不把底层库异常泄漏到接口层。
"""
from __future__ import annotations
import base64
import hashlib
import hmac
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from collections.abc import Mapping
from typing import Any
from cryptography.exceptions import InvalidSignature
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


class LicenseCryptoError(RuntimeError):
    """授权相关的密码学错误：格式非法、指纹不符、验签失败、解密失败等一律用它表达。"""
    pass


class LicenseTransportCipher:
    """加密一次授权请求，并解密与之配对的响应。

    握手是无状态的一次性 ECDH：每次 encrypt_request 都新生成一把临时 X25519 私钥，
    因此同一个请求重放也不会复用密钥流。返回的对称密钥必须原样交给
    decrypt_response —— AAD 里绑定了方向、路径与 keyId，跨请求复用必然解不开。
    """
    # 协议版本串，同时参与 HKDF 的 info 与 AES-GCM 的 AAD；
    # 改动它等于与授权服务断约，只应随协议升级一起变。
    PROTOCOL = b'homeos-license-transport-v1'

    def __init__(self, public_key_path: Path, key_id: str, expected_sha256: str) -> None:
        """载入并校验授权传输公钥（服务端 X25519 公钥）。

        参数:
            public_key_path: PEM 格式公钥文件路径。
            key_id: 与服务端约定的密钥标识，参与密钥派生与 AAD。
            expected_sha256: 公钥文件内容的 SHA-256 十六进制指纹，钉死在发布版本里。

        异常:
            LicenseCryptoError: keyId 非法、公钥读不到、指纹不符，或公钥不是 X25519。
        """
        # keyId 会被拼进 HKDF 的 info 与 AAD，且必须与授权服务完全一致，
        # 因此限制在安全字符集与长度内，避免控制字符污染派生输入。
        if not key_id or len(key_id) > 64 or not all(character.isalnum() or character in '-_.' for character in key_id):
            raise LicenseCryptoError('授权传输加密 keyId 格式无效。')
        try:
            key_data = public_key_path.read_bytes()
        except OSError as error:
            raise LicenseCryptoError(f'无法读取授权传输公钥：{public_key_path}') from error
        actual_sha256 = hashlib.sha256(key_data).hexdigest()
        # 指纹校验刻意放在解析之前：先确认文件内容就是发布版本里钉死的那份公钥，
        # 防止被换成攻击者公钥后仍然继续协商。用 compare_digest 做常数时间比较，
        # 避免指纹被逐字节试探。
        if not hmac.compare_digest(actual_sha256, expected_sha256):
            raise LicenseCryptoError('授权传输公钥指纹与正式发布版本不匹配。')
        try:
            key = serialization.load_pem_public_key(key_data)
        except ValueError as error:
            raise LicenseCryptoError('授权传输公钥格式无效。') from error
        # 只接受 X25519：验签用的 Ed25519 公钥混进这里，要么 exchange 直接抛错，
        # 要么协商出一把两端都不一致的密钥，提前显式拒绝更容易定位。
        if not isinstance(key, X25519PublicKey):
            raise LicenseCryptoError('授权传输公钥必须是 X25519。')
        self._key = key
        self.key_id = key_id

    @staticmethod
    def _encode(value: bytes) -> str:
        """URL 安全 base64 并去掉尾部 '='，便于放进 JSON 字段且无需转义。"""
        return base64.urlsafe_b64encode(value).rstrip(b'=').decode('ascii')

    @staticmethod
    def _decode(value: str) -> bytes:
        """还原 URL 安全 base64；先补回被 _encode 去掉的填充位再交给 AES-GCM。"""
        try:
            # -len(value) % 4 正好是缺失的 '=' 个数：RFC 4648 允许省略填充，
            # 但标准解码器会因此报错，所以这里补齐。
            return base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))
        except (TypeError, ValueError) as error:
            raise LicenseCryptoError('授权传输响应编码无效。') from error

    def encrypt_request(self, payload: dict[str, Any], path: str) -> tuple[dict[str, str], bytes]:
        """加密一次请求体，返回（信封字段字典，响应解密所需的对称密钥）。

        参数:
            payload: 待发送的请求体，明文只在本机内存里存在。
            path: 请求路径（如 /v2/activate），参与密钥派生与 AAD 绑定。

        返回:
            (envelope, key)：envelope 直接作为 HTTP JSON body 发出；
            key 必须原样保留，用于 decrypt_response 解密配对的响应。
        """
        # 每次请求都换一把临时私钥：即便某次请求密文被录下，也无法反推长期私钥。
        ephemeral = X25519PrivateKey.generate()
        # ECDH 共享秘密；服务端用自己私钥 + 信封里的 ephemeralPublicKey 得到同一个值。
        shared = ephemeral.exchange(self._key)
        # 从共享秘密派生 32 字节 AES-256 密钥。info 里绑定协议版本、keyId 与路径，
        # 使同一对密钥在不同端点/不同协议版本下派生出不同密钥，避免跨端点复用。
        key = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=self.PROTOCOL + b'\x00' + self.key_id.encode('ascii') + b'\x00' + path.encode('ascii')).derive(shared)
        # GCM 推荐 96 位随机 IV；同一密钥下 IV 绝不重复。
        iv = os.urandom(12)
        # AAD 绑定协议、方向（request）与路径：截获者无法把请求密文挪到另一个端点重放。
        aad = self.PROTOCOL + b'\x00request\x00' + path.encode('ascii') + b'\x00' + self.key_id.encode('ascii')
        # 规范化序列化（排序键 + 紧凑分隔符）：同样的内容产出稳定字节，
        # 授权服务侧按字节校验或做摘要时才有确定性。
        plaintext = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
        # AESGCM.encrypt 返回「密文 + 16 字节 tag」拼接，tag 校验在解密侧自动完成。
        ciphertext = AESGCM(key).encrypt(iv, plaintext, aad)
        # 只传 32 字节裸公钥：省掉 PEM 头尾与额外编码，体积最小。
        public_key = ephemeral.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        return ({
            'keyId': self.key_id,
            'ephemeralPublicKey': self._encode(public_key),
            'iv': self._encode(iv),
            'ciphertext': self._encode(ciphertext)}, key)

    def decrypt_response(self, envelope: dict[str, Any], path: str, key: bytes) -> dict[str, Any]:
        """解密与某个请求配对的响应信封。

        参数:
            envelope: 服务端返回的 JSON 字典（含 iv / ciphertext，可能含 keyId）。
            path: 原请求路径，必须与加密时一致，否则 AAD 不匹配。
            key: encrypt_request 返回的对称密钥，一个请求一把，不可跨请求复用。

        返回:
            解密后的响应字典。

        异常:
            LicenseCryptoError: keyId 不符、编码非法、IV 长度异常，或 GCM 校验失败
            （被篡改、密钥不对、AAD 不符都会走到这里）。
        """
        # 先核对 keyId 再解密：keyId 不符说明请求被路由到了别的环境，
        # 此时拿本地密钥去解也必然是垃圾，早一步拒绝能给出更准确的原因。
        if envelope.get('keyId') != self.key_id:
            raise LicenseCryptoError('授权传输响应 keyId 不匹配。')
        iv = self._decode(envelope.get('iv', ''))
        ciphertext = self._decode(envelope.get('ciphertext', ''))
        # 强制 96 位 IV，防止服务端（或中间人）用短 IV 削弱 GCM 的安全性。
        if len(iv) != 12:
            raise LicenseCryptoError('授权传输响应 IV 长度无效。')
        # 方向固定为 response：请求与响应的 AAD 域分离，二者密文不能互换使用。
        aad = self.PROTOCOL + b'\x00response\x00' + path.encode('ascii') + b'\x00' + self.key_id.encode('ascii')
        try:
            # 解密与 JSON 解析放在同一个 try：GCM tag 校验失败、明文不是 JSON、
            # 或不是 UTF-8，全部视为「响应不可信」，对外只给一条中文错误。
            plaintext = AESGCM(key).decrypt(iv, ciphertext, aad)
            payload = json.loads(plaintext)
        except Exception as error:
            raise LicenseCryptoError('授权传输响应无法解密或已被篡改。') from error
        if not isinstance(payload, dict):
            raise LicenseCryptoError('授权传输响应内容无效。')
        return payload


def parse_timestamp(value: str) -> datetime:
    """解析租约里的 ISO-8601 时间戳，统一成 UTC 时区感知对象。

    参数:
        value: 授权服务返回的时间字符串，可能带 'Z' 后缀也可能不带时区。

    返回:
        UTC 时区的 datetime，可直接与 datetime.now(timezone.utc) 比较。

    异常:
        LicenseCryptoError: 字符串无法解析为 ISO-8601 时间。
    """
    try:
        # 兼容 'Z' 后缀：fromisoformat 在 Python 3.11 之前不认识 'Z'，
        # 统一替换成 '+00:00' 才能解析。
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except (TypeError, ValueError) as error:
        raise LicenseCryptoError('租约时间格式无效。') from error
    # 没有时区信息时按 UTC 解释：服务端始终以 UTC 签发，
    # 缺失时区不能理解成本机时区，否则跨时区部署会误判租约到期。
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    # 统一折算到 UTC，保证后续所有比较都在同一时区上进行。
    return parsed.astimezone(timezone.utc)


def _decode(value: str) -> bytes:
    """租约的 URL 安全 base64 解码（同样要先补回填充位）。"""
    try:
        return base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))
    except (ValueError, TypeError) as error:
        raise LicenseCryptoError('租约编码无效。') from error


class LeaseVerifier:
    """用 Ed25519 公钥校验授权服务签发的签名租约。

    这是离线门禁的信任根：即使数据库里的 status 被改成 ACTIVE，
    也必须先通过这里对 signedLease 的验签才会被放行。

    多公钥支持（trusted_keys）是为了密钥轮换：新公钥上线时旧公钥仍可验签，
    等所有安装都续租过一轮后再撤下。
    """

    def __init__(self, public_key_path: Path | None = None, product: str = 'homeos', expected_sha256: str | None = None, *, trusted_keys: Mapping[str, tuple[Path, str | None]] | None = None, default_key_id: str = 'default') -> None:
        """配置可信公钥集合。

        参数:
            public_key_path: 单公钥模式下的 PEM 路径，会登记到 default_key_id 名下。
            product: 期望的租约产品标识，验签后比对，防止跨产品串用租约。
            expected_sha256: 单公钥模式下的 SHA-256 指纹。
            trusted_keys: 多公钥模式：{keyId: (公钥路径, 指纹或 None)}。
            default_key_id: 单公钥模式下登记用的 keyId。

        异常:
            ValueError: 可信公钥集合为空（配置错误，启动期就该失败）。
        """
        self.product = product
        self.default_key_id = default_key_id
        # 显式传入的集合优先于单公钥参数，两者都给时以 trusted_keys 为准。
        if trusted_keys is not None:
            self.trusted_keys = dict(trusted_keys)
        elif public_key_path is not None:
            self.trusted_keys = {default_key_id: (public_key_path, expected_sha256)}
        else:
            raise ValueError('至少需要配置一个可信授权公钥。')
        # 空集合意味着任何租约都验不过，属于配置失误：在启动期直接报错，
        # 而不是运行期静默把每个请求都判成「校验无效」。
        if not self.trusted_keys:
            raise ValueError('可信授权公钥集合不能为空。')

    def verify(self, signed_lease: str, instance_id: str) -> dict[str, Any]:
        """校验签名租约并返回其载荷。

        参数:
            signed_lease: 形如 <base64url(payload)>.<base64url(signature)> 的字符串。
            instance_id: 当前安装实例 ID，载荷里的 instanceId 必须与之一致。

        返回:
            已通过签名与全部字段校验的载荷字典。

        异常:
            LicenseCryptoError: 格式、编码、keyId、指纹、签名、产品或实例任一不符，
            以及缺少必要字段或序号非法。
        """
        try:
            # 只切第一个点：payload 段不含点，但用 maxsplit=1 更稳，
            # 万一签名段里出现点也不会把内容截断。
            encoded_payload, encoded_signature = signed_lease.split('.', 1)
        except ValueError as error:
            raise LicenseCryptoError('签名租约格式无效。') from error
        payload_bytes = _decode(encoded_payload)
        try:
            payload = json.loads(payload_bytes)
        except (UnicodeError, json.JSONDecodeError) as error:
            raise LicenseCryptoError('租约内容无效。') from error
        key_id = payload.get('keyId')
        if not isinstance(key_id, str) or not key_id:
            raise LicenseCryptoError('租约 keyId 无效。')
        # 白名单式查找：不在 trusted_keys 里的 keyId 一律拒绝，
        # 绝不会尝试用未知公钥验签。
        trusted_key = self.trusted_keys.get(key_id)
        if trusted_key is None:
            raise LicenseCryptoError(f'租约使用了不受信任的授权公钥：{key_id}')
        public_key_path, expected_fingerprint = trusted_key
        try:
            key_data = public_key_path.read_bytes()
        except OSError as error:
            raise LicenseCryptoError(f'无法读取授权公钥：{public_key_path}') from error
        # 指纹可空：多公钥模式允许只按 keyId 选择公钥，但配了指纹就必须核对。
        if expected_fingerprint:
            actual_sha256 = hashlib.sha256(key_data).hexdigest()
            if not hmac.compare_digest(actual_sha256, expected_fingerprint):
                raise LicenseCryptoError('授权公钥指纹与正式发布版本不匹配。')
        # 这里不捕获解析异常：公钥是随发行版一起打包的，
        # 格式错属于发布事故，应在启动/首次校验时立刻暴露。
        key = serialization.load_pem_public_key(key_data)
        # 只接受 Ed25519：公钥类型决定了签名算法，必须显式拒绝而不是尝试兼容。
        if not isinstance(key, Ed25519PublicKey):
            raise LicenseCryptoError('授权公钥必须是 Ed25519。')
        try:
            # 先验签再比对业务字段：确认载荷确实出自授权服务，再谈内容是否可用。
            key.verify(_decode(encoded_signature), payload_bytes)
        except InvalidSignature as error:
            raise LicenseCryptoError('租约签名无效。') from error
        # 产品标识写死比对，防止把其它产品的租约挪到 homeos 上使用。
        if payload.get('product') != self.product:
            raise LicenseCryptoError('租约产品标识不匹配。')
        # 实例绑定：租约只能用在签发时那台安装上，换机即失效。
        if payload.get('instanceId') != instance_id:
            raise LicenseCryptoError('租约不属于当前实例。')
        # 必要字段清单与 service.py 读取的字段一一对应：缺任何一个都说明
        # 服务端版本与本客户端不匹配，宁可整体拒绝也不要半残状态。
        required = {'leaseId', 'features', 'issuedAt', 'expiresAt', 'sessionId', 'leaseSequence', 'activationCodeId'}
        if not required.issubset(payload):
            raise LicenseCryptoError('租约缺少必要字段。')
        sequence = payload['leaseSequence']
        # 显式排除 bool：Python 里 True 也是 int，不排除的话 True >= 1 会让非法序号通过。
        if isinstance(sequence, bool) or not isinstance(sequence, int) or sequence < 1:
            raise LicenseCryptoError('租约序号无效。')
        # 时间字段只做可解析性校验（校验失败会抛 LicenseCryptoError），
        # 到期判断由调用方结合本机时钟与时钟容差来完成。
        parse_timestamp(payload['issuedAt'])
        parse_timestamp(payload['expiresAt'])
        return payload


class SecretCipher:
    """落库凭证的对称加密（Fernet：AES-128-CBC + HMAC-SHA256 认证）。

    数据库里只存密文：会话令牌、恢复令牌与激活码即使被拖库也无法直接复用。
    密钥单独存放在 key_path（0600 权限），与数据库分离 ——
    备份/导出数据库不会连带泄漏密钥，删库也不能解密历史备份。
    """

    def __init__(self, key_path: Path) -> None:
        """只记住密钥文件路径；真正的密钥在首次加解密时惰性生成。"""
        self.key_path = key_path

    def _key(self) -> bytes:
        """读取或首次生成 Fernet 密钥。

        返回:
            32 字节 urlsafe base64 的 Fernet 密钥。

        异常:
            LicenseCryptoError: 密钥文件已存在但内容为空。
        """
        # 目录权限 0700：密钥只允许运行账号本身读写。
        self.key_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if self.key_path.exists():
            value = self.key_path.read_bytes().strip()
            # 空文件视为损坏而不是「未生成」：静默重新生成会让已落库的密文
            # 全部无法解密，宁可显式报错让人来确认。
            if not value:
                raise LicenseCryptoError('授权凭证密钥为空。')
            return value
        # 冗余的局部导入，保留原写法：与模块顶部的 import os 等价（历史遗留）。
        import os
        key = Fernet.generate_key()
        # O_EXCL + 0600 原子独占创建：并发启动时只有一个进程能写入，
        # 避免两个进程各写一把密钥导致后写的那把覆盖前者、已加密数据解不开。
        descriptor = os.open(self.key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'wb') as output:
            # 末尾补换行便于人工 cat 查看，Fernet 读取时会 strip 掉。
            output.write(key + b'\n')
        return key

    def encrypt(self, value: str) -> str:
        """加密字符串，返回可直接入库的 ASCII 密文。"""
        return Fernet(self._key()).encrypt(value.encode('utf-8')).decode('ascii')

    def decrypt(self, value: str) -> str:
        """解密库里取出的密文。

        异常:
            LicenseCryptoError: 密钥不匹配、密文被改动（HMAC 校验失败）或内容损坏。
        """
        try:
            return Fernet(self._key()).decrypt(value.encode('ascii')).decode('utf-8')
        except (InvalidToken, UnicodeError, ValueError) as error:
            raise LicenseCryptoError('无法解密授权凭证。') from error
