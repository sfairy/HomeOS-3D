/**
 * @file wecom.crypto.ts
 * @module ChannelsModule
 *
 * 企业微信回调消息加解密工具（AES-256-CBC + SHA1 签名）。
 *
 * 职责：
 * - 计算企微回调 URL 验证与消息回调的 msg_signature（SHA1）
 * - 解密企微 AES-256-CBC 回调密文，校验 PKCS7 填充并提取明文与 corpId
 * - 解密失败统一抛 BusinessException（modules 内禁止裸 throw new Error）
 *
 * 依赖：node:crypto（createHash / createDecipheriv）、BusinessException、API_ERROR
 */
import * as crypto from 'crypto';
import { BusinessException, ErrorCode } from '../../../common/utils';
import { API_ERROR } from '../../../common/errors/api-error-messages';

/** 计算字符串的 SHA1 摘要（hex 编码） */
function sha1(text: string): string {
  return crypto.createHash('sha1').update(text).digest('hex');
}

/**
 * 计算企微回调签名：将 token / timestamp / nonce / encrypt 字典序排序后拼接并取 SHA1。
 * @param params.token 企微回调 Token
 * @param params.timestamp 时间戳
 * @param params.nonce 随机串
 * @param params.encrypt 加密密文（echostr 或 Encrypt 字段）
 * @returns 40 字符 hex 签名
 */
export function computeMsgSignature(params: {
  token: string;
  timestamp: string;
  nonce: string;
  encrypt: string;
}): string {
  const arr = [params.token, params.timestamp, params.nonce, params.encrypt]
    .map(String)
    .sort();
  return sha1(arr.join(''));
}

/**
 * 将企微回调配置中的 Base64 AES Key 解码为 32 字节 Buffer。
 * @param aesKey 企微后台 EncodingAESKey（43 字符，不含尾部 `=`）
 * @returns 32 字节 AES 密钥 Buffer
 * @remarks 企微后台返回的 aesKey 不带尾部 `=`，需补齐后再 Base64 解码。
 */
function decodeAesKey(aesKey: string): Buffer {
  const base64 = aesKey.endsWith('=') ? aesKey : `${aesKey}=`;
  return Buffer.from(base64, 'base64');
}

/** 抛解密失败业务异常（modules 内禁止裸 throw new Error） */
function decryptFail(detail: string): never {
  throw new BusinessException(ErrorCode.EXTERNAL_ERROR, API_ERROR.WECOM_DECRYPT_FAILED(detail));
}

/**
 * 去除 PKCS7 填充并校验合法性。
 * @param buf 解密后的带填充 Buffer
 * @returns 去除填充后的明文 Buffer
 * @remarks 校验填充值在 1..32 范围内且所有填充字节一致，防止填充异常被静默放过。
 */
function pkcs7Unpad(buf: Buffer): Buffer {
  if (buf.length === 0) decryptFail('密文为空');
  const pad = buf[buf.length - 1];
  // 校验填充值合法（1..32）且全部填充字节一致，防止填充异常被静默放过
  if (pad < 1 || pad > 32 || pad > buf.length) decryptFail('非法 PKCS7 填充');
  for (let i = buf.length - pad; i < buf.length; i++) {
    if (buf[i] !== pad) decryptFail('PKCS7 填充字节不一致');
  }
  return buf.subarray(0, buf.length - pad);
}

/**
 * 解密企微回调密文，返回明文消息与 corpId。
 *
 * 明文格式：16 字节随机 + 4 字节 big-endian msgLen + 消息正文 + corpId。
 * 解密前 16 字节 AES 密钥的前 16 字节作为 IV；setAutoPadding(false) 由 pkcs7Unpad 自行处理填充。
 *
 * @param params.aesKey 企微回调 EncodingAESKey
 * @param params.cipherTextBase64 Base64 编码的密文
 * @returns { msg, corpId } 解密后的消息正文与 corpId（用于校验来源合法性）
 */
export function decryptWecom(params: {
  aesKey: string;
  cipherTextBase64: string;
}): { msg: string; corpId: string } {
  const key = decodeAesKey(params.aesKey);
  const iv = key.subarray(0, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  decipher.setAutoPadding(false);
  const plain = Buffer.concat([
    decipher.update(Buffer.from(params.cipherTextBase64, 'base64')),
    decipher.final(),
  ]);
  const unpadded = pkcs7Unpad(plain);
  // 明文格式：16 字节随机 + 4 字节 big-endian msgLen + 消息 + corpId
  if (unpadded.length < 20) decryptFail('解密明文长度不足');
  const msgLen = unpadded.readUInt32BE(16);
  const msgStart = 20;
  const msgEnd = msgStart + msgLen;
  // 显式 bounds-check，避免 msgLen 畸形导致 subarray 越界
  if (msgEnd > unpadded.length) decryptFail('消息长度字段超出明文范围');
  const msg = unpadded.subarray(msgStart, msgEnd).toString('utf8');
  const corpId = unpadded.subarray(msgEnd).toString('utf8');
  return { msg, corpId };
}
