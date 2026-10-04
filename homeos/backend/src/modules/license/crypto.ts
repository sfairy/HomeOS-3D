/**
 * 职责：
 *  - 授权链路的密码学原语（Ed25519 租约验签 + X25519 加密传输 + 本地凭证加密）。
 * 关键依赖：
 *  - Node 内置 crypto（Ed25519 / X25519 / HKDF / AES-256-GCM 均已内置，无需第三方包）。
 * 约定：
 *  - 与授权商店侧 homeos-store/backend/src/licensing/crypto.py 逐字节对齐；
 *  - 所有失败抛 LicenseCryptoError，调用方据此归类 INVALID / INSTANCE_MISMATCH 等状态。
 *
 * 威胁模型：防误用与随手拷贝；不承诺防专业破解。
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
  verify as cryptoVerify,
  type KeyObject,
} from 'crypto';
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from 'fs';
import { dirname } from 'path';

/** 传输协议串：必须与商店侧 PROTOCOL 逐字节一致（参与 HKDF info 与 AES-GCM AAD）。 */
export const LICENSE_PROTOCOL = 'homeos-license-transport-v1';

/** 授权产品标识：租约 product 与激活 payload 都必须等于它。 */
export const LICENSE_PRODUCT = 'homeos';

/** X25519 公钥的 SPKI DER 前缀：用于把 32 字节裸公钥还原成 KeyObject。 */
const X25519_SPKI_PREFIX = Buffer.from('302a300506032b656e032100', 'hex');

/** 授权相关密码学错误。 */
export class LicenseCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LicenseCryptoError';
  }
}

/** base64url 无填充编码（与 Python urlsafe_b64encode().rstrip('=') 对齐）。 */
export function b64urlEncode(value: Buffer): string {
  return value.toString('base64url');
}

/** base64url 无填充解码。 */
export function b64urlDecode(value: unknown): Buffer {
  if (typeof value !== 'string' || !value) {
    throw new LicenseCryptoError('授权编码无效。');
  }
  return Buffer.from(value, 'base64url');
}

/**
 * 规范化 JSON：键递归升序、无空白，等价于 Python
 * ``json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))``。
 */
export function canonicalJson(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(sortValue(value), null, 0), 'utf8');
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) output[key] = sortValue(source[key]);
    return output;
  }
  return value;
}

/** 解析租约里的 ISO-8601 时间戳；缺时区按 UTC 解释。失败抛 LicenseCryptoError。 */
export function parseTimestamp(value: unknown): Date {
  if (typeof value !== 'string' || !value) {
    throw new LicenseCryptoError('租约时间格式无效。');
  }
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  const parsed = new Date(hasZone ? value : `${value}Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new LicenseCryptoError('租约时间格式无效。');
  }
  return parsed;
}

/** 公钥文件字节的 sha256（十六进制小写）。 */
export function publicKeySha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** 由公钥文件字节派生 keyId：``hb-<sha256 前 16 位>``（口径同商店侧 key_id_from_public）。 */
export function deriveKeyId(path: string): string {
  return `hb-${publicKeySha256(path).slice(0, 16)}`;
}

function loadPublicKey(path: string): KeyObject {
  if (!existsSync(path)) {
    throw new LicenseCryptoError(`无法读取授权公钥：${path}`);
  }
  try {
    return createPublicKey(readFileSync(path));
  } catch {
    throw new LicenseCryptoError(`授权公钥格式无效：${path}`);
  }
}

/** 已解析（并做过指纹校验）的可信签名公钥。 */
export type TrustedSigningKey = { path: string; sha256?: string | null };

/**
 * LeaseVerifier：用 Ed25519 公钥校验授权商店签发的签名租约。
 *
 * ``trustedKeys``（keyId → 公钥路径/指纹）是白名单：不在其中的 keyId 一律拒绝，
 * 绝不尝试用未知公钥验签。
 */
export class LeaseVerifier {
  private readonly keys: Map<string, TrustedSigningKey>;
  private readonly cache = new Map<string, KeyObject>();

  constructor(
    trustedKeys: Map<string, TrustedSigningKey>,
    private readonly product: string = LICENSE_PRODUCT,
  ) {
    if (trustedKeys.size === 0) {
      throw new LicenseCryptoError('可信授权公钥集合不能为空。');
    }
    this.keys = trustedKeys;
  }

  /**
   * 校验签名租约并返回其载荷。
   *
   * 租约形如 ``<base64url(payload)>.<base64url(signature)>``；载荷里的 instanceId
   * 必须与 ``instanceId`` 一致，且先验签再比对业务字段。
   */
  verify(signedLease: string, instanceId: string): Record<string, unknown> {
    if (typeof signedLease !== 'string' || !signedLease) {
      throw new LicenseCryptoError('签名租约格式无效。');
    }
    const separator = signedLease.indexOf('.');
    if (separator < 0) {
      throw new LicenseCryptoError('签名租约格式无效。');
    }
    const payloadBytes = b64urlDecode(signedLease.slice(0, separator));
    const signature = b64urlDecode(signedLease.slice(separator + 1));

    let payload: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(payloadBytes.toString('utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new LicenseCryptoError('租约内容无效。');
      }
      payload = parsed as Record<string, unknown>;
    } catch (error) {
      if (error instanceof LicenseCryptoError) throw error;
      throw new LicenseCryptoError('租约内容无效。');
    }

    const keyId = payload.keyId;
    if (typeof keyId !== 'string' || !keyId) {
      throw new LicenseCryptoError('租约缺少 keyId（旧版租约），需要重新激活授权。');
    }
    const trusted = this.keys.get(keyId);
    if (!trusted) {
      throw new LicenseCryptoError(`租约使用了不受信任的授权公钥：${keyId}`);
    }
    const key = this.resolveKey(keyId, trusted);
    if (key.asymmetricKeyType !== 'ed25519') {
      throw new LicenseCryptoError('授权公钥必须是 Ed25519。');
    }
    if (!cryptoVerify(null, payloadBytes, key, signature)) {
      throw new LicenseCryptoError('租约签名无效。');
    }
    if (payload.product !== this.product) {
      throw new LicenseCryptoError('租约产品标识不匹配。');
    }
    if (payload.instanceId !== instanceId) {
      throw new LicenseCryptoError('租约不属于当前实例。');
    }
    const required = [
      'leaseId',
      'features',
      'issuedAt',
      'expiresAt',
      'sessionId',
      'leaseSequence',
      'activationCodeId',
    ];
    if (!required.every((field) => field in payload)) {
      throw new LicenseCryptoError('租约缺少必要字段。');
    }
    const sequence = payload.leaseSequence;
    if (typeof sequence !== 'number' || !Number.isInteger(sequence) || sequence < 1) {
      throw new LicenseCryptoError('租约序号无效。');
    }
    parseTimestamp(payload.issuedAt);
    parseTimestamp(payload.expiresAt);
    return payload;
  }

  private resolveKey(keyId: string, trusted: TrustedSigningKey): KeyObject {
    const cached = this.cache.get(keyId);
    if (cached) return cached;
    if (trusted.sha256) {
      const actual = publicKeySha256(trusted.path);
      const expected = trusted.sha256.toLowerCase();
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
      ) {
        throw new LicenseCryptoError(
          `授权公钥指纹与正式发布版本不匹配（keyId=${keyId}）。`,
        );
      }
    }
    const key = loadPublicKey(trusted.path);
    this.cache.set(keyId, key);
    return key;
  }
}

/**
 * LicenseTransportCipher：加密一次授权请求，并解密与之配对的响应。
 *
 * 握手为无状态一次性 ECDH：每次 ``encryptRequest`` 都新生成一把临时 X25519 私钥，
 * 返回的对称密钥必须原样交给 ``decryptResponse``（AAD 绑定了方向、路径与 keyId，
 * 跨请求复用必然解不开）。
 */
export class LicenseTransportCipher {
  private readonly publicKey: KeyObject;

  constructor(
    publicKeyPath: string,
    public readonly keyId: string,
    expectedSha256: string,
  ) {
    if (!keyId || keyId.length > 64 || !/^[A-Za-z0-9._-]+$/.test(keyId)) {
      throw new LicenseCryptoError('授权传输加密 keyId 格式无效。');
    }
    const bytes = readFileSync(publicKeyPath);
    const actual = createHash('sha256').update(bytes).digest('hex');
    const expected = expectedSha256.toLowerCase();
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
    ) {
      throw new LicenseCryptoError('授权传输公钥指纹与正式发布版本不匹配。');
    }
    const key = createPublicKey(bytes);
    if (key.asymmetricKeyType !== 'x25519') {
      throw new LicenseCryptoError('授权传输公钥必须是 X25519。');
    }
    this.publicKey = key;
  }

  private derive(shared: Buffer, path: string): Buffer {
    const info = Buffer.concat([
      Buffer.from(LICENSE_PROTOCOL, 'ascii'),
      Buffer.from([0]),
      Buffer.from(this.keyId, 'ascii'),
      Buffer.from([0]),
      Buffer.from(path, 'ascii'),
    ]);
    return Buffer.from(hkdfSync('sha256', shared, Buffer.alloc(0), info, 32));
  }

  /** 加密一次请求体，返回信封字段与响应解密所需的对称密钥。 */
  encryptRequest(
    payload: Record<string, unknown>,
    path: string,
  ): { envelope: Record<string, string>; key: Buffer } {
    const ephemeral = generateKeyPairSync('x25519');
    const shared = diffieHellman({
      privateKey: ephemeral.privateKey,
      publicKey: this.publicKey,
    });
    const key = this.derive(shared, path);
    const iv = randomBytes(12);
    const aad = Buffer.concat([
      Buffer.from(LICENSE_PROTOCOL, 'ascii'),
      Buffer.from([0]),
      Buffer.from('request', 'ascii'),
      Buffer.from([0]),
      Buffer.from(path, 'ascii'),
      Buffer.from([0]),
      Buffer.from(this.keyId, 'ascii'),
    ]);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad);
    const plaintext = canonicalJson(payload);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
    const publicBytes = ephemeral.publicKey.export({ format: 'der', type: 'spki' });
    const rawPublic = Buffer.from(publicBytes).subarray(Buffer.from(publicBytes).length - 32);
    return {
      envelope: {
        keyId: this.keyId,
        ephemeralPublicKey: b64urlEncode(rawPublic),
        iv: b64urlEncode(iv),
        ciphertext: b64urlEncode(ciphertext),
      },
      key,
    };
  }

  /** 解密与某个请求配对的响应信封（path 与 key 必须与加密时一致）。 */
  decryptResponse(
    envelope: Record<string, unknown>,
    path: string,
    key: Buffer,
  ): Record<string, unknown> {
    if (!envelope || envelope.keyId !== this.keyId) {
      throw new LicenseCryptoError('授权传输响应 keyId 不匹配。');
    }
    const iv = b64urlDecode(envelope.iv);
    const ciphertext = b64urlDecode(envelope.ciphertext);
    if (iv.length !== 12) {
      throw new LicenseCryptoError('授权传输响应 IV 长度无效。');
    }
    const aad = Buffer.concat([
      Buffer.from(LICENSE_PROTOCOL, 'ascii'),
      Buffer.from([0]),
      Buffer.from('response', 'ascii'),
      Buffer.from([0]),
      Buffer.from(path, 'ascii'),
      Buffer.from([0]),
      Buffer.from(this.keyId, 'ascii'),
    ]);
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(aad);
      const tagStart = ciphertext.length - 16;
      if (tagStart < 0) throw new LicenseCryptoError('授权传输响应内容无效。');
      decipher.setAuthTag(ciphertext.subarray(tagStart));
      const plaintext = Buffer.concat([decipher.update(ciphertext.subarray(0, tagStart)), decipher.final()]);
      const parsed: unknown = JSON.parse(plaintext.toString('utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new LicenseCryptoError('授权传输响应内容无效。');
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      if (error instanceof LicenseCryptoError) throw error;
      throw new LicenseCryptoError('授权传输响应无法解密或已被篡改。');
    }
  }
}

/**
 * SecretCipher：落盘凭证的对称加密（AES-256-GCM，密钥文件独立存放且 0600）。
 * 数据库/状态文件里只存密文，密钥与数据分离。
 */
export class SecretCipher {
  constructor(private readonly keyPath: string) {}

  private key(): Buffer {
    if (existsSync(this.keyPath)) {
      const value = readFileSync(this.keyPath);
      if (value.length === 0) throw new LicenseCryptoError('授权凭证密钥为空。');
      return value;
    }
    mkdirSync(dirname(this.keyPath), { recursive: true, mode: 0o700 });
    const key = randomBytes(32);
    const descriptor = openSync(this.keyPath, 'wx', 0o600);
    try {
      writeSync(descriptor, key);
    } finally {
      closeSync(descriptor);
    }
    chmodSync(this.keyPath, 0o600);
    return key;
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(value, 'utf8')),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    return b64urlEncode(Buffer.concat([iv, ciphertext]));
  }

  decrypt(value: string): string {
    try {
      const raw = b64urlDecode(value);
      if (raw.length < 12 + 16) throw new LicenseCryptoError('无法解密授权凭证。');
      const iv = raw.subarray(0, 12);
      const body = raw.subarray(12);
      const decipher = createDecipheriv('aes-256-gcm', this.key(), iv);
      decipher.setAuthTag(body.subarray(body.length - 16));
      const plaintext = Buffer.concat([
        decipher.update(body.subarray(0, body.length - 16)),
        decipher.final(),
      ]);
      return plaintext.toString('utf8');
    } catch (error) {
      if (error instanceof LicenseCryptoError) throw error;
      throw new LicenseCryptoError('无法解密授权凭证。');
    }
  }
}

/** 由 32 字节裸 X25519 公钥构造 KeyObject（商店响应里的 ephemeralPublicKey 用得上）。 */
export function x25519PublicKeyFromRaw(raw: Buffer): KeyObject {
  if (raw.length !== 32) {
    throw new LicenseCryptoError('授权传输临时公钥长度无效。');
  }
  return createPublicKey({
    key: Buffer.concat([X25519_SPKI_PREFIX, raw]),
    format: 'der',
    type: 'spki',
  });
}

