/**
 * `createChunkNameAllocator` 的等价性测试：与两份配置里原来的
 * `uniqueChunkBaseName` 逐分支一致（首次占用、同名加 `-2`、跳号、reset 后重用）。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createChunkNameAllocator } from '../../../../vite/build-helpers.ts';

/** 抽取前两份配置里的实现（逐字复制，含共享的 usedNames 集合）。 */
function legacyAllocator() {
  const usedNames = new Set<string>();
  return {
    clear() {
      usedNames.clear();
    },
    unique(base: string) {
      if (!usedNames.has(base)) {
        usedNames.add(base);
        return base;
      }
      let index = 2;
      while (usedNames.has(`${base}-${index}`)) index += 1;
      const name = `${base}-${index}`;
      usedNames.add(name);
      return name;
    },
  };
}

const sequences = [
  ['a'],
  ['a', 'a'],
  ['a', 'a', 'a'],
  ['a', 'a', 'a-2'],
  ['index', 'index', 'index', 'index-2'],
  ['A~B', 'A~B', 'C'],
  ['', '', ''],
];

test('唯一化结果与旧实现逐项一致', () => {
  for (const sequence of sequences) {
    const legacy = legacyAllocator();
    const allocator = createChunkNameAllocator();
    for (const base of sequence) {
      assert.equal(allocator.unique(base), legacy.unique(base), JSON.stringify(sequence));
    }
  }
});

test('reset 后可重用同名，且不影响其他名字', () => {
  const allocator = createChunkNameAllocator();
  assert.equal(allocator.unique('chunk'), 'chunk');
  assert.equal(allocator.unique('chunk'), 'chunk-2');
  allocator.reset();
  assert.equal(allocator.unique('chunk'), 'chunk');
  assert.equal(allocator.unique('other'), 'other');
});
