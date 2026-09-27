/**
 * 3D 持久缓存共享的 IndexedDB 基建。
 *
 * 两个缓存（模型模板 model-persistent-cache.js / 已准备场景 scene-persistent-cache.js）的
 * **业务**完全是两回事，但**降级与容量这一层是同一条路**：收在这里之前，两边各抄了一份
 * `runWithTimeout`、`openDatabase`、`disabled` 短路与 LRU 剪枝循环，连
 * `MIN_OPEN_TIMEOUT_MS = 1500` 与它的注释都是逐字相同的两份 —— 这种重复的代价不是「多几行」，
 * 而是「改一处漏一处」：降级底线只要有一边漏了一条分支，那一侧就会出现未处理的 Promise 拒绝。
 *
 * 这里只收五条与业务无关的语义：
 *
 *   1. 打不开就整个降级：IndexedDB 不可用（隐私模式 / 被禁用 / 配额满 / 打开超时）时，
 *      所有接口退化成空操作，不抛错、不产生未处理的 Promise 拒绝；
 *   2. 打开失败只标记一次（`disabled`），后续调用直接短路，不再反复敲一个已经打不开的库；
 *   3. 单次操作包一层超时：**「库暂时慢」只降级这一次调用**，不把实例标记成 disabled；
 *   4. 写入走后台上空闲回调，并在一条 Promise 链上串行化（同一个库的多个 readwrite
 *      事务并发会互相阻塞）；
 *   5. LRU 剪枝：按 `created` 从旧到新删，直到条数与总字节都回到上限内。
 *
 * 「存什么、键怎么算、什么算可复用」一概留在各自模块 —— 那是业务，不属于基建。
 *
 * 统计口径也留在调用方：`onFallback` 是这里唯一向外报的口子，它不区分「超时 / 打开失败 /
 * 写入失败」，因为调用方（以及 `?debug=1` 的诊断日志）只需要一个「这次走的是降级路径」的计数。
 */

/**
 * 创建一套 IndexedDB 基建。
 *
 * @param {object} options
 * @param {string} options.name 库名。
 * @param {number} options.version 库版本。
 * @param {(request: IDBOpenDBRequest) => void} options.upgrade 建库 / 升级回调，入参是 open 请求
 *   （`onupgradeneeded` 里拿得到 `request.result` 与 `request.transaction`）。
 * @param {object} [options.env] 运行环境（测试注入替身，需要 `indexedDB` / `setTimeout` /
 *   `clearTimeout`，可选 `requestIdleCallback` 与 `addEventListener`）。
 * @param {() => boolean} [options.extraAvailable] 业务侧的额外可用性前提（例如模型缓存要求
 *   `THREE.ObjectLoader` 在）。抛错按「不可用」处理。
 * @param {number} [options.timeoutMs] 单次 IDB 操作的默认上限。
 * @param {number} [options.openTimeoutMs] 打开库的预算下限：首次建库要跑 `onupgradeneeded`，
 *   比单条读写慢得多，预算必须放宽。
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
   * disabled：私有模式下 `open()` 有时既不 success 也不 error，没有这一层就会永远等下去；
   * 但一次读得慢也不该让整个缓存永久失效（下一次调用可能就正常了）。
   *
   * @param {(settle: (value: any) => void) => void} run 真正发起请求的回调，拿到「结算」函数。
   * @param {number} [duration] 本次的超时预算，缺省用实例的 `timeoutMs`。
   * @param {{timedOut?: boolean}} [state] 传入时会在超时那一刻标记 `timedOut`，供调用方区分
   *   「这次是超时」与「这次真的没命中」（迟到的成功结果据此不再重复记一次命中）。
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
   * 返回的 Promise 永不拒绝（打不开解析为 null）。
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
            // 版本变更（别的标签页升级了库）时必须让出连接，否则那边会一直堵塞。
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

  /** 已建立的连接（尚未建立时为 null）。写路径优先用它，避免空等一次已经定格的 open。 */
  function current() {
    return database;
  }

  function isDisabled() {
    return disabled;
  }

  /**
   * 在 `withinMs` 内拿到连接：已经连上就直接给，否则最多等这一小段（等不到就把加载路径让给
   * 非缓存分支，晚到的连接仍会存下来供下次使用）。
   */
  function handleWithin(withinMs) {
    if (database) {
      return Promise.resolve(database);
    }
    return runWithTimeout(settle => open().then(settle), withinMs);
  }

  /**
   * 把一次写入排到后台上：空闲时执行，并在一条 Promise 链上串行化。
   * `run` 的拒绝会被记成一次降级（它内部通常已经记过，这里只是兜底），且不会打断链。
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
   * 都回到上限内。
   *
   * 为什么要传 `source` 与 `remove` 两个回调而不是「一个仓库名」：模型缓存把轻量元数据与
   * 模板体拆在两个仓库里（剪枝只遍历 metadata，不必把几 MB 的模板拉进内存），删一条要同时动
   * 两边；场景缓存的条目本身就是元数据，删一处即可。两者共用的只有「怎么选出该删的那几条」。
   *
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
