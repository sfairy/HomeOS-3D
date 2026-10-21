/**
 * 持久缓存事务公共件的等价性测试（纯 Node，无 IndexedDB 依赖）。
 *
 * 用一个最小假 IndexedDB 复现真实调用顺序：`put(record)` → `put(metadata)` → `getAll()`
 * → 按 `created` 升序淘汰 → 事务 `complete`/`abort` 决定 `Promise<boolean>`。
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- 测试替身（假 IDB / 假 canvas / 假 three）刻意保持宽松类型。 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  readCacheEntries,
  restoreCacheEntries,
  selectEvictions,
  writeCacheRecord,
} from '../../../../../homeos/frontend/src/studio/app/3d-studio/cache-shared.ts';

/** 极简 IDBRequest：赋值 `onsuccess` 时按微任务异步触发，模拟真实事件时序。 */
class FakeRequest {
  result: any = undefined;
  onerror: any = null;
  private successHandler: any = null;
  private scheduled = false;

  get onsuccess() {
    return this.successHandler;
  }

  set onsuccess(handler: any) {
    this.successHandler = handler;
    if (!handler || this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => handler(this));
  }
}

class FakeObjectStore {
  records = new Map<string, any>();

  put(value: any) {
    this.records.set(value.key, value);
    return new FakeRequest();
  }

  get(key: string) {
    const request = new FakeRequest();
    request.result = this.records.get(key);
    return request;
  }

  getAll() {
    const request = new FakeRequest();
    request.result = [...this.records.values()];
    return request;
  }

  delete(key: string) {
    this.records.delete(key);
  }
}

class FakeDatabase {
  stores: Record<string, FakeObjectStore>;
  transactions: string[][] = [];

  constructor(storeNames: string[]) {
    this.stores = Object.fromEntries(storeNames.map((name) => [name, new FakeObjectStore()]));
  }

  transaction(names: string | string[]) {
    const list = Array.isArray(names) ? names : [names];
    this.transactions.push(list);
    return {
      oncomplete: null as any,
      onabort: null as any,
      onerror: null as any,
      objectStore: (name: string) => {
        const store = this.stores[name];
        assert.ok(store, `unknown store ${name}`);
        return store;
      },
    };
  }
}

/** 立即结算版 runWithTimeout：任务里调用 `settle(value)` 即 resolve。 */
const runWithTimeout = (task: any) =>
  new Promise((resolve) => {
    let settled = false;
    const settle = (value: any) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    task(settle);
  });

/** 事务结束时触发 complete/abort 的版本，用于断言 Promise<boolean>。 */
function runWithTransaction(database: FakeDatabase, outcome: 'complete' | 'abort') {
  return (task: any) =>
    new Promise((resolve) => {
      let settled = false;
      const settle = (value: any) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      task(settle);
      queueMicrotask(() => {
        if (outcome === 'complete') database.lastTransaction().oncomplete?.();
        else database.lastTransaction().onabort?.();
      });
    });
}

class TracingDatabase extends FakeDatabase {
  last: any = null;

  transaction(names: string | string[]) {
    const created = super.transaction(names);
    this.last = created;
    return created;
  }

  lastTransaction() {
    return this.last;
  }
}

test('selectEvictions 保留未超限的全部记录', () => {
  const records = [
    { key: 'a', created: 1, bytes: 10 },
    { key: 'b', created: 2, bytes: 10 },
  ];
  assert.deepEqual(selectEvictions(records, { maxEntries: 2, maxBytes: 20 }), []);
  assert.deepEqual(selectEvictions([], { maxEntries: 0, maxBytes: 0 }), []);
});

test('selectEvictions 按 created 升序淘汰直到同时满足条数与字节上限', () => {
  const records = [
    { key: 'c', created: 3, bytes: 10 },
    { key: 'a', created: 1, bytes: 10 },
    { key: 'b', created: 2, bytes: 10 },
    { key: 'd', created: 4, bytes: 40 },
  ];
  assert.deepEqual(selectEvictions(records, { maxEntries: 3, maxBytes: 100 }), ['a']);
  assert.deepEqual(selectEvictions(records, { maxEntries: 10, maxBytes: 50 }), ['a', 'b']);
  // 不修改入参顺序
  assert.deepEqual(records.map((record) => record.key), ['c', 'a', 'b', 'd']);
});

test('writeCacheRecord 在同一事务写记录与元数据，并淘汰最旧记录', async () => {
  const database = new TracingDatabase(['scenes', 'metadata']);
  database.stores.metadata.records.set('old', { key: 'old', created: 1, bytes: 5 });

  const written = await writeCacheRecord(
    database,
    {
      storageKey: 'next',
      version: 'v1',
      bytes: 10,
      entries: [['k', 1]],
      maxEntries: 1,
      maxBytes: 1024,
    },
    runWithTransaction(database, 'complete'),
  );

  assert.equal(written, true);
  assert.deepEqual(database.transactions, [['scenes', 'metadata']]);
  assert.deepEqual([...database.stores.scenes.records.keys()], ['next']);
  assert.deepEqual([...database.stores.metadata.records.keys()], ['next']);
  const record = database.stores.scenes.records.get('next');
  assert.equal(record.version, 'v1');
  assert.equal(record.bytes, 10);
  assert.deepEqual(record.entries, [['k', 1]]);
});

test('writeCacheRecord 在事务 abort 时返回 false', async () => {
  const database = new TracingDatabase(['scenes', 'metadata']);
  const written = await writeCacheRecord(
    database,
    {
      storageKey: 'k',
      version: 'v1',
      bytes: 1,
      entries: [],
      maxEntries: 8,
      maxBytes: 1024,
    },
    runWithTransaction(database, 'abort'),
  );
  assert.equal(written, false);
});

test('readCacheEntries 校验 key/version/entries 形状', async () => {
  const database = new FakeDatabase(['scenes']);
  database.stores.scenes.records.set('k', {
    key: 'k',
    version: 'v1',
    created: Date.now(),
    entries: [['a', 1]],
  });

  assert.deepEqual(
    await readCacheEntries(database, { storageKey: 'k', version: 'v1' }, runWithTimeout),
    [['a', 1]],
  );
  assert.equal(
    await readCacheEntries(database, { storageKey: 'k', version: 'v2' }, runWithTimeout),
    null,
  );
  assert.equal(
    await readCacheEntries(database, { storageKey: 'other', version: 'v1' }, runWithTimeout),
    null,
  );

  database.stores.scenes.records.set('broken', { key: 'broken', version: 'v1', created: 1 });
  assert.equal(
    await readCacheEntries(database, { storageKey: 'broken', version: 'v1' }, runWithTimeout),
    null,
  );
});

test('readCacheEntries 的 TTL 只在 maxAgeMs > 0 时生效', async () => {
  const database = new FakeDatabase(['scenes']);
  const eightDaysAgo = Date.now() - 8 * 86400000;
  database.stores.scenes.records.set('k', {
    key: 'k',
    version: 'v1',
    created: eightDaysAgo,
    entries: [['a', 1]],
  });

  assert.equal(
    await readCacheEntries(
      database,
      { storageKey: 'k', version: 'v1', maxAgeMs: 7 * 86400000 },
      runWithTimeout,
    ),
    null,
  );
  assert.deepEqual(
    await readCacheEntries(database, { storageKey: 'k', version: 'v1', maxAgeMs: 0 }, runWithTimeout),
    [['a', 1]],
  );

  // created 非有限数：设了 TTL 视为失效；未设 TTL（几何缓存）保持原行为接受该记录。
  database.stores.scenes.records.set('nan', {
    key: 'nan',
    version: 'v1',
    created: Number.NaN,
    entries: [['b', 2]],
  });
  assert.equal(
    await readCacheEntries(
      database,
      { storageKey: 'nan', version: 'v1', maxAgeMs: 7 * 86400000 },
      runWithTimeout,
    ),
    null,
  );
  assert.deepEqual(
    await readCacheEntries(database, { storageKey: 'nan', version: 'v1' }, runWithTimeout),
    [['b', 2]],
  );
});

test('restoreCacheEntries 跳过不合法与已存在的条目，只取前 maxEntries 条', () => {
  const existing = new Set(['dup']);
  const restored: any[] = [];
  let fallbacks = 0;

  restoreCacheEntries(
    [
      ['a', 1],
      ['broken'],
      ['dup', 2],
      'not-a-pair',
      ['b', 3],
      ['c', 4],
    ],
    {
      maxEntries: 5,
      hasEntry: (key: any) => existing.has(key),
      store: (key: any, value: any) => {
        restored.push([key, value]);
        return true;
      },
      onFallback: () => fallbacks++,
    },
  );

  // slice 发生在过滤之前（与旧实现 `storedEntries.slice(0, MAX_ENTRY_COUNT)` 一致），
  // 所以第 6 条 'c' 在被过滤前就已经被截掉。
  assert.deepEqual(restored, [['a', 1], ['b', 3]]);
  assert.equal(fallbacks, 0);

  restored.length = 0;
  restoreCacheEntries(
    [
      ['x', 1],
      ['y', 2],
    ],
    {
      maxEntries: 1,
      hasEntry: () => false,
      store: (key: any, value: any) => {
        restored.push([key, value]);
        return true;
      },
      onFallback: () => fallbacks++,
    },
  );
  assert.deepEqual(restored, [['x', 1]]);
});

test('restoreCacheEntries 在 store 返回 false 或抛异常时各记一次 fallback', () => {
  let fallbacks = 0;
  restoreCacheEntries(
    [
      ['falsy', 1],
      ['throws', 2],
      ['ok', 3],
    ],
    {
      maxEntries: 8,
      hasEntry: () => false,
      store: (key: any) => {
        if (key === 'falsy') return false;
        if (key === 'throws') throw new Error('decode failed');
        return true;
      },
      onFallback: () => fallbacks++,
    },
  );
  assert.equal(fallbacks, 2);
});
