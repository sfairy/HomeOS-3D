import { describe, expect, test } from 'bun:test';
import type { ExecutionContext } from '@nestjs/common';
import { isHttpContext } from '../src/common/http-security/http-guard.util';
import { JwtAuthGuard } from '../src/modules/auth/jwt-auth.guard';
import { GuestWriteGuard } from '../src/modules/auth/guest-write.guard';
import { RolesGuard } from '../src/modules/auth/roles.guard';
import { LicenseGuard } from '../src/modules/license/license.guard';

/**
 * HTTP 专用全局守卫在非 HTTP 上下文（WebSocket 等）必须放行。
 *
 * 回归背景：通过 APP_GUARD 注册的全局守卫同样会在 WS 消息处理的上下文执行，
 * 而这些守卫依赖 HTTP 请求/响应对象。缺少该跳过逻辑时，每条 WS 消息都会抛
 * TypeError 并被 WsExceptionsHandler 反复打印（NestJS 12 起全局守卫在 WS 生效）。
 *
 * 这些守卫的跳过判断位于 canActivate 首行，因此构造函数依赖不会被触碰，
 * 传入最小桩对象即可。
 */

/** 构造一个指定类型的执行上下文桩，仅实现 getType */
function contextOfType(type: string): ExecutionContext {
  return { getType: () => type } as unknown as ExecutionContext;
}

/** 各 HTTP 专用全局守卫（构造函数依赖不会被访问，传最小桩） */
const httpOnlyGuards: Array<{ name: string; create: () => { canActivate: (c: ExecutionContext) => unknown } }> = [
  { name: 'JwtAuthGuard', create: () => new JwtAuthGuard({} as never) },
  { name: 'GuestWriteGuard', create: () => new GuestWriteGuard({} as never) },
  { name: 'RolesGuard', create: () => new RolesGuard({} as never) },
  { name: 'LicenseGuard', create: () => new LicenseGuard({} as never) },
];

describe('http-guard.util isHttpContext', () => {
  test('http 上下文返回 true', () => {
    expect(isHttpContext(contextOfType('http'))).toBe(true);
  });

  test('ws / rpc / 未知上下文返回 false', () => {
    expect(isHttpContext(contextOfType('ws'))).toBe(false);
    expect(isHttpContext(contextOfType('rpc'))).toBe(false);
    expect(isHttpContext(contextOfType('unknown'))).toBe(false);
  });
});

describe('HTTP 专用全局守卫跳过非 HTTP 上下文', () => {
  for (const { name, create } of httpOnlyGuards) {
    test(`${name} 在 ws 上下文放行且不抛错`, async () => {
      const guard = create();
      await expect(Promise.resolve(guard.canActivate(contextOfType('ws')))).resolves.toBe(true);
    });
  }
});
