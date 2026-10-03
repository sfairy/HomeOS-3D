import { describe, expect, test } from 'bun:test';
import {
  assertCommandProxyAuthorized,
  assertWebRtcAuthorized,
  type ChildModeGate,
} from '../src/modules/command-proxy/authorization.util';
import { BusinessException } from '../src/common/utils/business-exception';
import { API_ERROR } from '../src/common/errors/api-error-messages';
import type { CallServiceDto } from '../src/modules/command-proxy/dto';

const allowAll: ChildModeGate = { canControl: () => ({ allowed: true }) };

function lightOn(entityId = 'light.living'): CallServiceDto {
  return { domain: 'light', service: 'turn_on', entity_id: entityId };
}

function expectForbidden(err: unknown, message: string) {
  expect(err).toBeInstanceOf(BusinessException);
  const body = (err as BusinessException).getResponse() as { message: string };
  expect(body.message).toBe(message);
}

describe('assertCommandProxyAuthorized', () => {
  test('访客写操作拒绝', async () => {
    try {
      await assertCommandProxyAuthorized(lightOn(), { role: 'guest' }, allowAll);
      throw new Error('expected forbidden');
    } catch (e) {
      expectForbidden(e, API_ERROR.ACCESS_GUEST_DEVICE_DENIED);
    }
  });

  test('管理员放行高危域', async () => {
    await assertCommandProxyAuthorized(
      { domain: 'lock', service: 'unlock', entity_id: 'lock.front' },
      { role: 'admin' },
      allowAll,
    );
  });

  test('儿童无白名单拒绝', async () => {
    try {
      await assertCommandProxyAuthorized(lightOn(), { role: 'child' }, allowAll);
      throw new Error('expected forbidden');
    } catch (e) {
      expectForbidden(e, API_ERROR.ACCESS_CHILD_NO_WHITELIST);
    }
  });

  test('儿童操作 lock 域拒绝', async () => {
    try {
      await assertCommandProxyAuthorized(
        { domain: 'lock', service: 'unlock', entity_id: 'lock.front' },
        { role: 'child', restrictions: ['lock.front'] },
        allowAll,
      );
      throw new Error('expected forbidden');
    } catch (e) {
      expectForbidden(e, API_ERROR.ACCESS_ROLE_DEVICE_DENIED);
    }
  });

  test('儿童白名单内灯光放行', async () => {
    await assertCommandProxyAuthorized(
      lightOn('light.x'),
      { role: 'child', restrictions: ['light.x'] },
      allowAll,
    );
  });
});

describe('assertWebRtcAuthorized', () => {
  test('非 camera 实体拒绝', () => {
    try {
      assertWebRtcAuthorized('light.cam', { role: 'admin' }, allowAll);
      throw new Error('expected forbidden');
    } catch (e) {
      expect(e).toBeInstanceOf(BusinessException);
    }
  });

  test('访客无白名单拒绝摄像头', () => {
    try {
      assertWebRtcAuthorized('camera.door', { role: 'guest' }, allowAll);
      throw new Error('expected forbidden');
    } catch (e) {
      expectForbidden(e, API_ERROR.ACCESS_GUEST_DEVICE_DENIED);
    }
  });
});
