import { describe, expect, test } from 'bun:test';
import { validateCsrf } from '../src/common/http-security/csrf.util';

describe('validateCsrf', () => {
  test('GET 一律放行', () => {
    expect(validateCsrf('GET', '/api/v1/embed-proxy/x', undefined, undefined)).toBe(true);
  });

  test('embed-proxy POST 无 CSRF 拒绝', () => {
    expect(validateCsrf('POST', '/api/v1/embed-proxy/movie-pilot', undefined, undefined)).toBe(
      false,
    );
  });

  test('embed-proxy POST 双提交通过', () => {
    const t = 'a'.repeat(48);
    expect(validateCsrf('POST', '/api/v1/embed-proxy/movie-pilot/api', t, t)).toBe(true);
  });

  test('automation webhook POST 仍豁免（外部 HMAC）', () => {
    expect(
      validateCsrf('POST', '/api/v1/automation/webhook/wh1', undefined, undefined),
    ).toBe(true);
  });
});
