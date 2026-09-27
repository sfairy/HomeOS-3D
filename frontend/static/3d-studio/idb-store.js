/**
 * 3D 持久缓存共享的 IndexedDB 基建。
 */

/**
 * 创建一套 IndexedDB 基建。
 * @param {object} options
 * @param {string} options.name 库名。
 * @param {number} options.version 库版本。
 * @param {(request: IDBOpenDBRequest) => void} options.upgrade 建库 / 升级回调，入参是 open 请求
 * @param {object} [options.env] 运行环境（测试注入替身，需要 `indexedDB` / `setTimeout` /
 * @param {() => boolean} [options.extraAvailable] 业务侧的额外可用性前提（例如模型缓存要求
 * @param {number} [options.timeoutMs] 单次 IDB 操作的默认上限。
 * @param {number} [options.openTimeoutMs] 打开库的预算下限：首次建库要跑 `onupgradeneeded`，
 * @param {() => void} [options.onFallback] 每次走降级路径时调用（超时 / 打开失败 / 事务抛错）。
 * @param {() => void} [options.onPagehide] 页面卸载时的额外清理（例如清空内存层缓存）。
 */
export function createIdbStore({
  name,
  version,
  upgrade,
  env = globalThis,
  extraAvailable = () => true,
  timeoutMs = 1000,
  openTimeoutMs = 1500,
  onFallback = () => {},
  onPagehide = null
}) {
  let openingPromise = null;
  let database = null;
  let disabled = false;
  let writeChain = Promise.resolve();

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
   * @param {(settle: (value: any) => void) => void} run 真正发起请求的回调，拿到「结算」函数。
   * @param {number} [duration] 本次的超时预算，缺省用实例的 `timeoutMs`。
   * @param {{timedOut?: boolean}} [state] 传入时会在超时那一刻标记 `timedOut`，供调用方区分
   */
  function runWithTimeout(run, duration = timeoutMs, state = null) {
    return new Promise(resolve => {
      let settled = false;
      const settle = value => {
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
  function open() {
    if (!isAvailable()) {
      return Promise.resolve(null);
    }
    if (!openingPromise) {
      openingPromise = runWithTimeout(
        settle => {
          const request = env.indexedDB.open(name, version);
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

  function handleWithin(withinMs) {
    if (database) {
      return Promise.resolve(database);
    }
    return runWithTimeout(settle => open().then(settle), withinMs);
  }

  /**
   * 把一次写入排到后台上：空闲时执行，并在一条 Promise 链上串行化。
   */
  function scheduleIdle(run) {
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
   * @param {object} options
   * @param {IDBObjectStore} options.source 枚举条目的仓库。
   * @param {(key: string) => void} options.remove 删除一条记录的键。
   * @param {number} options.maxCount 条数上限。
   * @param {number} options.maxTotalBytes 总字节上限。
   */
  function prune({ source, remove, maxCount, maxTotalBytes }) {
    const allEntries = source.getAll();
    allEntries.onsuccess = () => {
      const entries = allEntries.result.sort((left, right) => left.created - right.created);
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
