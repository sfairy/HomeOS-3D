/**
 * `createCachedCanvasTexture` 的等价性测试：验证抽取前后逐句一致的四个行为。
 *
 * 1. 同一样式第二次调用直接返回缓存对象，不再创建 canvas / 不再绘制；
 * 2. 拿不到 2d 上下文时返回 null，且**不写缓存**（下次仍会重试）；
 * 3. 各向异性取 `min(maxAnisotropy || 1, 8)`；
 * 4. 绘制函数收到 canvas 的宽高。
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- 测试替身（假 IDB / 假 canvas / 假 three）刻意保持宽松类型。 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createCachedCanvasTexture } from '../../../../../homeos/frontend/src/studio/app/3d-studio/materials/texture-cache.ts';

class FakeTexture {
  options: any;
  colorSpace: any = null;
  anisotropy = 1;
  needsUpdate = false;

  constructor(options: any) {
    this.options = options;
  }
}

function installDocument(context: any, size: { width: number; height: number }) {
  const created: any[] = [];
  (globalThis as any).document = {
    createElement(tag: string) {
      assert.equal(tag, 'canvas');
      const canvas: any = {
        width: 300,
        height: 150,
        getContext(kind: string) {
          assert.equal(kind, '2d');
          return context;
        },
        ...size,
      };
      created.push(canvas);
      return canvas;
    },
  };
  return created;
}

const threeApi = { CanvasTexture: FakeTexture, SRGBColorSpace: 'srgb' };

test('同一样式命中缓存且只绘制一次', () => {
  const canvases = installDocument({}, {});
  const cache = new Map<any, any>();
  const paints: any[] = [];

  const first = createCachedCanvasTexture(cache, threeApi, 'mural', {
    width: 768,
    height: 512,
    maxAnisotropy: 4,
    paint: (context: any, width: number, height: number) => paints.push([context, width, height]),
  });
  const second = createCachedCanvasTexture(cache, threeApi, 'mural', {
    width: 768,
    height: 512,
    maxAnisotropy: 4,
    paint: () => assert.fail('命中缓存后不得再次绘制'),
  });

  assert.equal(first, second);
  assert.equal(canvases.length, 1);
  assert.equal(paints.length, 1);
  assert.deepEqual(paints[0].slice(1), [768, 512]);
  assert.equal(first.colorSpace, 'srgb');
  assert.equal(first.anisotropy, 4);
  assert.equal(first.needsUpdate, true);
  assert.equal(cache.get('mural'), first);
});

test('拿不到 2d 上下文时返回 null 且不写缓存', () => {
  installDocument(null, {});
  const cache = new Map<any, any>();
  const result = createCachedCanvasTexture(cache, threeApi, 'wall', {
    width: 1024,
    height: 768,
    maxAnisotropy: 2,
    paint: () => assert.fail('没有上下文时不得绘制'),
  });
  assert.equal(result, null);
  assert.equal(cache.size, 0);
});

test('各向异性钳到 [1, 8]，与 maxAnisotropy=0 的取 1 行为一致', () => {
  installDocument({}, {});
  const cases: Array<[number | undefined, number]> = [
    [undefined, 1],
    [0, 1],
    [1, 1],
    [4, 4],
    [8, 8],
    [16, 8],
  ];
  for (const [maxAnisotropy, expected] of cases) {
    const cache = new Map<any, any>();
    const texture = createCachedCanvasTexture(cache, threeApi, `style-${maxAnisotropy}`, {
      width: 16,
      height: 16,
      maxAnisotropy,
      paint: () => undefined,
    });
    assert.equal(texture.anisotropy, expected, String(maxAnisotropy));
  }
});
