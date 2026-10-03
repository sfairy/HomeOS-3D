import { describe, expect, test } from 'bun:test';
import { evaluateGuestWriteAccess } from '../src/modules/auth/guest-write.util';
import {
  extractJwtFromBearer,
  extractJwtFromCookie,
  extractJwtFromRequest,
} from '../src/modules/auth/jwt-extract.util';
import type { Request } from 'express';

describe('evaluateGuestWriteAccess', () => {
  test('非访客放行写操作', () => {
    expect(
      evaluateGuestWriteAccess({ method: 'POST', path: '/api/v1/services/call', role: 'admin' }),
    ).toBe('allow');
  });

  test('访客 GET 放行', () => {
    expect(
      evaluateGuestWriteAccess({ method: 'GET', path: '/api/v1/entities', role: 'guest' }),
    ).toBe('allow');
  });

  test('访客 POST 服务调用拒绝', () => {
    expect(
      evaluateGuestWriteAccess({ method: 'POST', path: '/api/v1/services/call', role: 'guest' }),
    ).toBe('deny');
  });

  test('访客可关闭地震预警', () => {
    expect(
      evaluateGuestWriteAccess({
        method: 'POST',
        path: '/api/v1/earthquake/dismiss',
        role: 'guest',
      }),
    ).toBe('allow');
  });

  test('访客仅可执行白名单场景', () => {
    expect(
      evaluateGuestWriteAccess({
        method: 'POST',
        path: '/api/v1/scene/abc/execute',
        role: 'guest',
        allowedSceneIds: ['abc'],
      }),
    ).toBe('allow');
    expect(
      evaluateGuestWriteAccess({
        method: 'POST',
        path: '/api/v1/scene/abc/execute',
        role: 'guest',
        allowedSceneIds: ['other'],
      }),
    ).toBe('deny');
  });
});

describe('extractJwtFromRequest', () => {
  test('Cookie 优先于 Bearer', () => {
    const req = {
      cookies: { auth_token: 'cookie-jwt' },
      headers: { authorization: 'Bearer header-jwt' },
    } as unknown as Request;
    expect(extractJwtFromCookie(req)).toBe('cookie-jwt');
    expect(extractJwtFromBearer(req)).toBe('header-jwt');
    expect(extractJwtFromRequest(req)).toBe('cookie-jwt');
  });

  test('仅 Bearer 时也能提取（访客写守卫与 JwtStrategy 对齐）', () => {
    const req = {
      cookies: {},
      headers: { authorization: 'Bearer guest-token' },
    } as unknown as Request;
    expect(extractJwtFromRequest(req)).toBe('guest-token');
  });
});
