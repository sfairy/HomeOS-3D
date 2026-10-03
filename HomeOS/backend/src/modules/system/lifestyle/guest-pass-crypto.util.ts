/**
 * 所属模块：backend/modules/system/lifestyle
 * 职责：
 *  - 访客通行证 AES-256-GCM 加解密；
 * 关键依赖：
 *  - crypto；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'crypto';
import { API_ERROR } from '../../../common/errors/api-error-messages';
import { BusinessException, ErrorCode } from '../../../common/utils';

type GuestPassCipherPayload = {
  cipher: string;
  iv: string;
  tag: string;
};

let cachedKey: Buffer | null = null;

function keyFromGuestPassSecret(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

function keyFromJwtSecret(jwt: string): Buffer {
  return scryptSync(jwt, 'homeos-guest-pass-v1', 32);
}

function resolvePrimaryKey(): Buffer {
  if (cachedKey) return cachedKey;
  const dedicated = String(process.env.GUEST_PASS_SECRET || '').trim();
  if (dedicated) {
    cachedKey = keyFromGuestPassSecret(dedicated);
    return cachedKey;
  }
  const jwt = String(process.env.JWT_SECRET || '').trim();
  if (!jwt) {
    throw new BusinessException(ErrorCode.CONFIG_ERROR, API_ERROR.GUEST_PASS_CRYPTO_SECRET_MISSING);
  }
  // 极少数未跑 bootstrap 自动生成的场景：临时用 JWT 派生（新密文仍可解密）
  cachedKey = keyFromJwtSecret(jwt);
  return cachedKey;
}

/** 预热主密钥 */
export function ensureGuestPassCryptoKey(): void {
  resolvePrimaryKey();
}

/**
 * encryptGuestPassCode：函数。
 * @param args - 参见类型签名；传入 undefined 时通常按 fallback 分支或返回空值
 * @returns 见类型签名；空场景通常返回 null / [] / {} 或 undefined
 * @throws 依赖不可用或输入非法时抛出 Error 子类
 */
export function encryptGuestPassCode(plain: string): GuestPassCipherPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', resolvePrimaryKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    cipher: enc.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/**
 * decryptGuestPassCode：函数。
 * @param args - 参见类型签名；传入 undefined 时通常按 fallback 分支或返回空值
 * @returns 见类型签名；空场景通常返回 null / [] / {} 或 undefined
 * @throws 依赖不可用或输入非法时抛出 Error 子类
 */
export function decryptGuestPassCode(payload: GuestPassCipherPayload): string {
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      resolvePrimaryKey(),
      Buffer.from(payload.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(payload.cipher, 'base64')),
      decipher.final(),
    ]);
    return dec.toString('utf8');
  } catch {
    throw new BusinessException(ErrorCode.UNKNOWN, API_ERROR.GUEST_PASS_CRYPTO_DECRYPT_FAILED);
  }
}
