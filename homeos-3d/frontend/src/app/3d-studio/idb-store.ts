/**
 * 3D 持久缓存共享的 IndexedDB 基建。
 */

type IdbEnv = {
  indexedDB?: IDBFactory;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions
  ) => number;
  addEventListener?: (
    type: string,
    listener: () => void,
    options?: { once?: boolean }
  ) => void;
};

type PruneEntry = {
  key: string;
  created: number;
  bytes?: number;
};

type CreateIdbStoreOptions = {
  name: string;
  version: number;
  upgrade: (request: IDBOpenDBRequest) => void;
  env?: IdbEnv;
  extraAvailable?: () => boolean;
  timeoutMs?: number;
  openTimeoutMs?: number;
  onFallback?: () => void;
  onPagehide?: (() => void) | null;
};

/**
 * 创建一套 IndexedDB 基建。
 */
export function createIdbStore({
  name,
  version,
  upgrade,
  env = globalThis as unknown as IdbEnv,
  extraAvailable = () => true,
  timeoutMs = 1000,
  openTimeoutMs = 1500,
  onFallback = () => {},
  onPagehide = null
}: CreateIdbStoreOptions) {
  let openingPromise: Promise<IDBDatabase | null> | null = null;
  let database: IDBDatabase | null = null;
  let disabled = false;
  let writeChain: Promise<void> = Promise.resolve();

  /** 统计回调不该反过来影响降级路径：它自己抛错就咽掉，绝不让降级变成故障源。 */
  function noteFallback() {
    try {
      onFallback();
    } catch {
      // 统计回调的异常与缓存本身无关，忽略。
    }
  }

  /** 静态可用性判断：已标记 disabled、没有 indexedDB、或业务侧前提不成立时一律不参与。 */
  function isAvailable() {
    try {
      return !disabled && !!env.indexedDB && !!extraAvailable();
    } catch {
      return false;
    }
  }

  /**
   * 把一次 IDB 操作包进超时：超时或抛错都解析为 null —— 只把这一次调用降级掉，不把实例标记成
   */
  function runWithTimeout<T = unknown>(
    run: (settle: (value: T | null) => void) => void,
    duration = timeoutMs,
    state: { timedOut?: boolean } | null = null
  ): Promise<T | null> {
    return new Promise(resolve => {
      let settled = false;
      const settle = (value: T | null) => {
        if (settled) {
          return;
        }
        settled = true;
        env.clearTimeout(timerId);
        resolve(value);
      };
      const timerId = env.setTimeout(() => {
        if (state) {
          state.timedOut = true;
        }
        noteFallback();
        settle(null);
      }, duration);
      try {
        run(settle);
      } catch {
        settle(null);
      }
    });
  }

  /**
   * 打开数据库：懒加载且只打开一次；打不开就标记 `disabled`，后续调用不再反复敲它。
   */
  function open(): Promise<IDBDatabase | null> {
    if (!isAvailable()) {
      return Promise.resolve(null);
    }
    if (!openingPromise) {
      openingPromise = runWithTimeout<IDBDatabase>(
        settle => {
          const request = env.indexedDB!.open(name, version);
          request.onupgradeneeded = () => upgrade(request);
          request.onerror = request.onblocked = () => {
            disabled = true;
            noteFallback();
            settle(null);
          };
          request.onsuccess = () => {
            const opened = request.result;
            if (disabled) {
              opened.close();
              settle(null);
              return;
            }
            opened.onversionchange = () => {
              disabled = true;
              opened.close();
            };
            database = opened;
            settle(opened);
          };
        },
        Math.max(timeoutMs, openTimeoutMs)
      );
    }
    return openingPromise;
  }

  function current() {
    return database;
  }

  function isDisabled() {
    return disabled;
  }

  function handleWithin(withinMs: number) {
    if (database) {
      return Promise.resolve(database);
    }
    return runWithTimeout<IDBDatabase>(settle => {
      void open().then(settle);
    }, withinMs);
  }

  /**
   * 把一次写入排到后台上：空闲时执行，并在一条 Promise 链上串行化。
   */
  function scheduleIdle(run: () => unknown) {
    writeChain = writeChain.then(
      () =>
        new Promise(resolve => {
          const execute = () => {
            Promise.resolve()
              .then(run)
              .catch(noteFallback)
              .finally(resolve);
          };
          if (env.requestIdleCallback) {
            env.requestIdleCallback(execute, { timeout: 3000 });
          } else {
            env.setTimeout(execute, 250);
          }
        })
    );
  }

  /**
   * 在**调用方已经开好的事务里**做一次 LRU 剪枝：按 `created` 从旧到新删，直到条数与总字节
   */
  function prune({
    source,
    remove,
    maxCount,
    maxTotalBytes
  }: {
    source: IDBObjectStore;
    remove: (key: string) => void;
    maxCount: number;
    maxTotalBytes: number;
  }) {
    const allEntries = source.getAll();
    allEntries.onsuccess = () => {
      const entries = (allEntries.result as PruneEntry[]).sort(
        (left, right) => left.created - right.created
      );
      let totalBytes = entries.reduce((sum, entry) => sum + (entry.bytes || 0), 0);
      let count = entries.length;
      for (const entry of entries) {
        if (count <= maxCount && totalBytes <= maxTotalBytes) {
          break;
        }
        remove(entry.key);
        count -= 1;
        totalBytes -= entry.bytes || 0;
      }
    };
  }

  try {
    env.addEventListener?.(
      "pagehide",
      () => {
        disabled = true;
        if (onPagehide) {
          onPagehide();
        }
        database?.close();
      },
      { once: true }
    );
  } catch {
    // 测试替身没有 addEventListener：忽略。
  }

  return {
    isAvailable,
    isDisabled,
    open,
    current,
    handleWithin,
    runWithTimeout,
    scheduleIdle,
    prune,
    whenIdle: () => writeChain
  };
}
