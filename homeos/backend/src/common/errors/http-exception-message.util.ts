/**
 * 职责：
 *  - HTTP 异常中文消息格式化；
 * 关键依赖：
 *  - @nestjs/common HttpException；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { HttpStatus } from '@nestjs/common';
import { HTTP_MESSAGE_PATTERNS, HTTP_MESSAGE_TEXTS } from '@homeos/shared';

/** 展平 ValidationPipe 等返回的 message（string | string[]） */
export function flattenHttpExceptionMessage(raw: unknown, fallback: string): string {
  if (Array.isArray(raw)) {
    const parts = raw.map((x) => String(x ?? '').trim()).filter(Boolean);
    return parts.length ? parts.join('；') : fallback;
  }
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (raw != null && typeof raw !== 'object') {
    const s = String(raw).trim();
    if (s) return s;
  }
  return fallback;
}

/**
 * 去掉 `ThrottlerException: ` 等前缀后，将常见英文 HTTP 文案映射为中文。
 * 已含中文则原样返回。
 */
export function localizeHttpExceptionMessage(
  message: string,
  status: number,
  errorName = '',
): string {
  const combined = `${errorName} ${message}`.trim();
  let m = message.trim();
  // Nest 偶尔把类名塞进 message：`XxxException: Foo`
  m = m.replace(/^[A-Za-z][A-Za-z0-9]*Exception:\s*/i, '').trim() || m;

  if (/[\u4e00-\u9fff]/.test(m)) return m;

  if (
    status === HttpStatus.TOO_MANY_REQUESTS ||
    HTTP_MESSAGE_PATTERNS.throttler.test(combined)
  ) {
    return HTTP_MESSAGE_TEXTS.rateLimited;
  }
  if (status === HttpStatus.UNAUTHORIZED || /^unauthorized$/i.test(m)) {
    // 后端口径：未登录与登录过期统一提示（与前端「登录已过期」口径不同，保持不变）
    return '未登录或登录已过期';
  }
  if (
    status === HttpStatus.FORBIDDEN ||
    HTTP_MESSAGE_PATTERNS.forbidden.test(m) ||
    HTTP_MESSAGE_PATTERNS.forbiddenResource.test(m)
  ) {
    return HTTP_MESSAGE_TEXTS.forbidden;
  }
  if (status === HttpStatus.NOT_FOUND || HTTP_MESSAGE_PATTERNS.notFound.test(m)) {
    return HTTP_MESSAGE_TEXTS.notFound;
  }
  // 400：仅笼统 Bad Request 映射；ValidationPipe 细节文案保留
  if (HTTP_MESSAGE_PATTERNS.badRequest.test(m)) {
    return HTTP_MESSAGE_TEXTS.badRequest;
  }
  if (status === HttpStatus.CONFLICT || HTTP_MESSAGE_PATTERNS.conflict.test(m)) {
    return HTTP_MESSAGE_TEXTS.conflict;
  }
  if (
    status === HttpStatus.REQUEST_TIMEOUT ||
    HTTP_MESSAGE_PATTERNS.timeout.test(m)
  ) {
    return HTTP_MESSAGE_TEXTS.timeout;
  }
  if (
    status >= 500 ||
    HTTP_MESSAGE_PATTERNS.internalServerError.test(m) ||
    /^internal error$/i.test(m)
  ) {
    return HTTP_MESSAGE_TEXTS.internalServerError;
  }
  if (HTTP_MESSAGE_PATTERNS.csrf.test(m)) {
    return HTTP_MESSAGE_TEXTS.csrf;
  }
  if (HTTP_MESSAGE_PATTERNS.tokenExpired.test(m)) {
    return HTTP_MESSAGE_TEXTS.tokenExpired;
  }

  return m;
}
