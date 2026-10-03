import { describe, expect, test } from 'bun:test';
import { validateEmbedTargetUrl } from '../src/common/embed/proxy.util';
import { BusinessException } from '../src/common/utils/business-exception';
import { API_ERROR } from '../src/common/errors/api-error-messages';

function expectEmbedRejected(url: string, message: string) {
  try {
    validateEmbedTargetUrl(url);
    throw new Error('expected BusinessException');
  } catch (e) {
    expect(e).toBeInstanceOf(BusinessException);
    const body = (e as BusinessException).getResponse() as { message: string };
    expect(body.message).toBe(message);
  }
}

describe('validateEmbedTargetUrl', () => {
  test('局域网 http 通过', () => {
    const parsed = validateEmbedTargetUrl('http://192.168.1.10:8096/');
    expect(parsed.hostname).toBe('192.168.1.10');
    expect(parsed.port).toBe('8096');
  });

  test('localhost 拒绝', () => {
    expectEmbedRejected('http://localhost:8096/', API_ERROR.EMBED_URL_LOCALHOST);
    expectEmbedRejected('http://127.0.0.1:8096/', API_ERROR.EMBED_URL_LOCALHOST);
  });

  test('公网地址拒绝（仅 LAN）', () => {
    expectEmbedRejected('https://example.com/', API_ERROR.EMBED_URL_LAN_ONLY);
  });

  test('非 http(s) 协议拒绝', () => {
    expectEmbedRejected('ftp://192.168.1.10/', API_ERROR.EMBED_URL_PROTOCOL);
  });

  test('空地址拒绝', () => {
    expectEmbedRejected('', API_ERROR.EMBED_URL_MISSING);
  });
});
