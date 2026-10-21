/** IndexedDB 持久缓存的公共件：诊断日志 + 带超时的一次性任务。 */

/** URL 上是否带了 `?performance-diagnostics=1`。 */
function cacheDiagnosticsEnabled(env: any) {
  return new URLSearchParams(env.location?.search || "").get("performance-diagnostics") === "1";
}

/** 生成 `log(event)`：仅在诊断开关打开时打印 `[prefix]` 与当前 stats 快照。 */
export function createCacheLogger(env: any, prefix: any, stats: any) {
  const isEnabled = cacheDiagnosticsEnabled(env);
  return (event: any) => {
    isEnabled &&
      env.console?.info(
        prefix,
        JSON.stringify({
          event: event,
          ...stats,
        }),
      );
  };
}

/** 跑一次性任务并加超时：任务用 `settle(result)` 交付结果； */
export function executeTaskWithTimeout(env: any, task: any, { duration, onTimeout }: any) {
  return new Promise((resolve) => {
    let isSettled = false;
    const settle = (result: any) => {
        isSettled || ((isSettled = true), env.clearTimeout(timerId), resolve(result));
      },
      timerId = env.setTimeout(() => {
        (onTimeout?.(), settle(null));
      }, duration);
    try {
      task(settle);
    } catch {
      settle(null);
    }
  });
}

/** 缓存库的固定仓库名：`scenes` 存条目本体，`metadata` 存淘汰所需的占用信息。 */
const CACHE_RECORD_STORE = "scenes";
const CACHE_METADATA_STORE = "metadata";

/**
 * 读回持久缓存并把条目交给 `restore` 还原。
 *
 * 三处缓存的 preload 前置步骤逐句相同：打开库、两次可用性判定、按版本与 TTL 读条目。
 * 两次判定都不能省：第一次挡住库不可用，第二次挡住 await 期间被 dispose 的情况。
 */
export async function preloadCacheEntries({
  openDatabase,
  isAvailable,
  storageKey,
  version,
  maxAgeMs,
  runWithTimeout,
  restore,
}: any): Promise<void> {
  const openedDatabase = await openDatabase();
  if (!openedDatabase || !isAvailable()) return;
  const storedEntries = await readCacheEntries(
    openedDatabase,
    { storageKey, version, maxAgeMs },
    runWithTimeout,
  );
  if (!isAvailable() || !storedEntries) return;
  restore(storedEntries);
}

/**
 * 读取并校验一条持久缓存记录，返回条目数组；不合法返回 null。
 *
 * `maxAgeMs > 0` 时才校验 `created` 的有限性与时效，`0` 表示不设 TTL
 * （几何缓存只按条数/字节淘汰，不按时间过期）。
 */
export function readCacheEntries(
  database: any,
  { storageKey, version, maxAgeMs = 0 }: any,
  runWithTimeout: any,
): Promise<any[] | null> {
  return runWithTimeout((settleRead: any) => {
    const readTransaction = database.transaction(CACHE_RECORD_STORE, "readonly"),
      readRequest = readTransaction.objectStore(CACHE_RECORD_STORE).get(storageKey);
    ((readRequest.onsuccess = () => {
      const storedRecord = readRequest.result;
      const isFresh =
        maxAgeMs > 0
          ? Number.isFinite(storedRecord?.created) &&
            !(Date.now() - storedRecord.created > maxAgeMs)
          : true;
      const isValid =
        !!storedRecord &&
        storedRecord.key === storageKey &&
        storedRecord.version === version &&
        isFresh &&
        Array.isArray(storedRecord.entries);
      settleRead(isValid ? storedRecord.entries : null);
    }),
      (readRequest.onerror = readTransaction.onabort = () => settleRead(null)));
  });
}

/**
 * 选出应被淘汰的记录键：按 `created` 升序，直到条数与总字节都不超限。
 *
 * 纯函数，便于在不依赖 IndexedDB 的情况下断言边界（空表、刚好等于上限、全部超限）。
 */
export function selectEvictions(records: any[], { maxEntries, maxBytes }: any): string[] {
  const sorted = [...records].sort((left, right) => left.created - right.created);
  let persistedBytes = sorted.reduce((byteSum, record) => byteSum + record.bytes, 0),
    persistedCount = sorted.length;
  const evicted: string[] = [];
  for (const record of sorted) {
    if (persistedCount <= maxEntries && persistedBytes <= maxBytes) break;
    evicted.push(record.key);
    persistedBytes -= record.bytes;
    persistedCount--;
  }
  return evicted;
}

/**
 * 写入一条持久缓存记录并在同一事务内按条数/字节上限淘汰最旧记录。
 *
 * 返回 `Promise<boolean>`：事务 complete 为 true，abort/error 为 false。
 */
export function writeCacheRecord(
  database: any,
  { storageKey, version, bytes, entries, maxEntries, maxBytes }: any,
  runWithTimeout: any,
): Promise<boolean> {
  const storedRecord = { key: storageKey, version, created: Date.now(), bytes, entries };
  return runWithTimeout((settleWrite: any) => {
    const writeTransaction = database.transaction([CACHE_RECORD_STORE, CACHE_METADATA_STORE], "readwrite");
    ((writeTransaction.oncomplete = () => settleWrite(true)),
      (writeTransaction.onabort = writeTransaction.onerror = () => settleWrite(false)),
      writeTransaction.objectStore(CACHE_RECORD_STORE).put(storedRecord));
    const metadataStore = writeTransaction.objectStore(CACHE_METADATA_STORE);
    metadataStore.put({
      key: storageKey,
      bytes,
      created: storedRecord.created,
    });
    const getAllRequest = metadataStore.getAll();
    getAllRequest.onsuccess = () => {
      for (const key of selectEvictions(getAllRequest.result, { maxEntries, maxBytes })) {
        writeTransaction.objectStore(CACHE_RECORD_STORE).delete(key);
        metadataStore.delete(key);
      }
    };
  });
}

/**
 * 把读回的条目对 `[key, value]` 还原进内存缓存。
 *
 * 两处（接触阴影 / 地面反射）的还原循环逐句相同：跳过形状不合法与已存在的条目，
 * `store` 返回 false 或抛异常都记一次 fallback。`hasEntry` 由调用方组合
 * 「内存已缓存」与「本批次已入队」两个条件。
 */
export function restoreCacheEntries(
  entries: any[],
  { maxEntries, hasEntry, store, onFallback }: any,
): void {
  for (const entry of entries.slice(0, maxEntries)) {
    if (!Array.isArray(entry) || entry.length !== 2 || hasEntry(entry[0])) continue;
    try {
      if (!store(entry[0], entry[1])) onFallback();
    } catch {
      onFallback();
    }
  }
}
