import {
  createCacheLogger,
  executeTaskWithTimeout,
  preloadCacheEntries,
  restoreCacheEntries,
  writeCacheRecord,
} from './cache-shared'

/**
 * 「首帧烘焙结果」类持久缓存的公共状态机（接触阴影、地面反射）。
 *
 * 内存里按 LRU 保留快照；`enqueue` 的生产任务要等首帧 `presented()` 之后才在空闲回调里逐个执行，
 * 产出后写入 IndexedDB；`pagehide` 时自动 dispose。
 * 签名可以是字符串，也可以是延迟求值的函数；`done` 在条目结束（写入、作废、被挤出、dispose）时必定调用一次。
 */
export type IdleSnapshotCacheOptions<TSnapshot> = {
  env?: any
  key?: string
  version: string
  databaseName: string
  logPrefix: string
  validate: (snapshot: unknown) => boolean
  snapshotBytes: (snapshot: TSnapshot) => number
  maxPersistedBytes: number
  maxPersistedEntries: number
  /** `stats()` 里内存条目数的字段名（如 floors / receivers）。 */
  sizeStatKey: string
}

type CachedSnapshot<TSnapshot> = { signature: string; data: TSnapshot; bytes: number }
type PendingSnapshot<TSnapshot> = {
  signature: string | (() => string)
  produce: (signature: string) => Promise<TSnapshot | null>
  valid: () => boolean
  done: () => void
}

const MAX_ENTRY_BYTES = 25165824,
  MAX_ENTRY_COUNT = 8,
  MAX_PENDING_ENTRIES = 8,
  MAX_SIGNATURE_LENGTH = 1024 * 1024

export function createIdleSnapshotCache<TSnapshot>({
  env = globalThis,
  key = '',
  version,
  databaseName,
  logPrefix,
  validate,
  snapshotBytes,
  maxPersistedBytes,
  maxPersistedEntries,
  sizeStatKey,
}: IdleSnapshotCacheOptions<TSnapshot>) {
  const snapshotByKey = new Map<string, CachedSnapshot<TSnapshot>>(),
    pendingByKey = new Map<string, PendingSnapshot<TSnapshot>>(),
    persistedKeySet = new Set<string>(),
    storageKey = key && JSON.stringify([version, key])
  let cachedConnection: IDBDatabase | null = null,
    openPromise: Promise<IDBDatabase | null> | undefined,
    preloadPromise: Promise<void> | undefined,
    isDisposed = false,
    hasOpenFailed = false,
    hasPresented = false,
    idleHandle: unknown = null,
    isIdleRunning = false,
    idleChain = Promise.resolve(),
    totalBytes = 0
  const stats = {
      hits: 0,
      misses: 0,
      restores: 0,
      writes: 0,
      fallbacks: 0,
    },
    log = createCacheLogger(env, logPrefix, stats)
  function isAvailable() {
    try {
      return !!storageKey && !isDisposed && !hasOpenFailed && !!env.indexedDB
    } catch {
      return false
    }
  }
  function runWithTimeout<TResult>(task: (settle: (result: TResult | null) => void) => void): Promise<TResult | null> {
    return executeTaskWithTimeout(env, task, {
      duration: 1500,
      onTimeout: () => stats.fallbacks++,
    }) as Promise<TResult | null>
  }
  function openDatabase() {
    if (!isAvailable()) return Promise.resolve(null)
    openPromise ||= runWithTimeout<IDBDatabase>((settleOpen) => {
      const openRequest: IDBOpenDBRequest = env.indexedDB.open(databaseName, 1)
      openRequest.onupgradeneeded = () => {
        openRequest.result.createObjectStore('scenes', { keyPath: 'key' })
        openRequest.result.createObjectStore('metadata', { keyPath: 'key' })
      }
      openRequest.onerror = openRequest.onblocked = () => {
        hasOpenFailed = true
        settleOpen(null)
      }
      openRequest.onsuccess = () => {
        if (!isAvailable()) {
          openRequest.result.close()
          settleOpen(null)
          return
        }
        cachedConnection = openRequest.result
        cachedConnection.onversionchange = disposeCache
        settleOpen(cachedConnection)
      }
    })
    return openPromise
  }
  function deleteEntry(cacheKey: string) {
    totalBytes -= snapshotByKey.get(cacheKey)?.bytes || 0
    snapshotByKey.delete(cacheKey)
  }
  function storeSnapshot(cacheKey: unknown, entry: { signature?: unknown; data?: unknown }) {
    if (
      typeof cacheKey != 'string' ||
      typeof entry.signature != 'string' ||
      entry.signature.length > MAX_SIGNATURE_LENGTH ||
      !validate(entry.data)
    )
      return false
    const data = entry.data as TSnapshot
    const entryBytes = snapshotBytes(data) + entry.signature.length * 2
    if (entryBytes > MAX_ENTRY_BYTES) return false
    deleteEntry(cacheKey)
    while (snapshotByKey.size && (snapshotByKey.size >= MAX_ENTRY_COUNT || totalBytes + entryBytes > MAX_ENTRY_BYTES))
      deleteEntry(snapshotByKey.keys().next().value!)
    snapshotByKey.set(cacheKey, { signature: entry.signature, data, bytes: entryBytes })
    totalBytes += entryBytes
    return true
  }
  function preload() {
    if (!isAvailable()) return Promise.resolve()
    preloadPromise ||= preloadCacheEntries({
      openDatabase,
      isAvailable,
      storageKey,
      version,
      maxAgeMs: 7 * 86400000,
      runWithTimeout,
      restore: (storedEntries: unknown[]) => {
        restoreCacheEntries(storedEntries, {
          maxEntries: MAX_ENTRY_COUNT,
          hasEntry: (entryKey: string) => snapshotByKey.has(entryKey) || persistedKeySet.has(entryKey),
          store: storeSnapshot,
          onFallback: () => stats.fallbacks++,
        })
        stats.restores++
        log('restored')
      },
    }).catch(() => {
      stats.fallbacks++
    })
    return preloadPromise
  }
  async function persist() {
    const openedDatabase = await openDatabase()
    if (!openedDatabase || !isAvailable()) return
    const written = await writeCacheRecord(
      openedDatabase,
      {
        storageKey,
        version,
        bytes: totalBytes,
        entries: [...snapshotByKey],
        maxEntries: maxPersistedEntries,
        maxBytes: maxPersistedBytes,
      },
      runWithTimeout,
    )
    if (written) stats.writes++
    else {
      stats.fallbacks++
      hasOpenFailed = true
    }
    log('stored')
  }
  function cancelPendingEntries() {
    for (const pendingEntry of pendingByKey.values()) pendingEntry.done()
    pendingByKey.clear()
  }
  const isStillWanted = (pendingKey: string, pendingEntry: PendingSnapshot<TSnapshot>) =>
    isAvailable() && !persistedKeySet.has(pendingKey) && pendingEntry.valid()
  async function producePending(pendingKey: string, pendingEntry: PendingSnapshot<TSnapshot>) {
    if (!isStillWanted(pendingKey, pendingEntry)) return
    const signature = typeof pendingEntry.signature == 'function' ? pendingEntry.signature() : pendingEntry.signature
    if (!signature || !pendingEntry.valid()) return
    const producedSnapshot = await pendingEntry.produce(signature)
    if (!isAvailable() || !pendingEntry.valid() || !producedSnapshot) return
    if (!storeSnapshot(pendingKey, { signature, data: producedSnapshot })) {
      stats.fallbacks++
      return
    }
    persistedKeySet.add(pendingKey)
    await persist()
  }
  async function flushOne() {
    if (!isAvailable() || !pendingByKey.size) return
    const [pendingKey, pendingEntry] = pendingByKey.entries().next().value!
    pendingByKey.delete(pendingKey)
    try {
      await producePending(pendingKey, pendingEntry)
    } finally {
      pendingEntry.done()
    }
  }
  function scheduleIdleFlush() {
    if (!isAvailable()) {
      cancelPendingEntries()
      return
    }
    if (!hasPresented || isIdleRunning || idleHandle !== null || !pendingByKey.size) return
    const flushPendingEntry = () => {
      idleHandle = null
      isIdleRunning = true
      idleChain = flushOne()
        .catch(() => {
          stats.fallbacks++
        })
        .finally(() => {
          isIdleRunning = false
          scheduleIdleFlush()
        })
    }
    idleHandle = env.requestIdleCallback
      ? env.requestIdleCallback(flushPendingEntry, { timeout: 3000 })
      : env.setTimeout(flushPendingEntry, 250)
  }
  function disposeCache() {
    isDisposed = true
    if (idleHandle !== null) {
      if (typeof env.requestIdleCallback === 'function') env.cancelIdleCallback?.(idleHandle)
      else env.clearTimeout(idleHandle)
      idleHandle = null
    }
    cancelPendingEntries()
    snapshotByKey.clear()
    persistedKeySet.clear()
    totalBytes = 0
    cachedConnection?.close()
  }
  env.addEventListener?.('pagehide', disposeCache, { once: true })
  return {
    preload,
    dispose: disposeCache,
    available: isAvailable,
    has: (cacheKey: string) => isAvailable() && snapshotByKey.has(cacheKey),
    discard(cacheKey: string) {
      deleteEntry(cacheKey)
      persistedKeySet.delete(cacheKey)
      stats.fallbacks++
    },
    peek(cacheKey: string, signature: string | null | undefined): TSnapshot | null {
      if (!isAvailable() || !signature) return null
      const cachedEntry = snapshotByKey.get(cacheKey)
      if (cachedEntry?.signature === signature && validate(cachedEntry.data)) {
        stats.hits++
        persistedKeySet.add(cacheKey)
        log('restored')
        return cachedEntry.data
      }
      stats.misses++
      return null
    },
    enqueue(
      cacheKey: string,
      signature: PendingSnapshot<TSnapshot>['signature'] | null | undefined,
      produce: PendingSnapshot<TSnapshot>['produce'],
      valid: () => boolean,
      done = () => {},
    ) {
      if (
        !isAvailable() ||
        !signature ||
        (typeof signature != 'function' && signature.length > MAX_SIGNATURE_LENGTH) ||
        persistedKeySet.has(cacheKey)
      ) {
        done()
        return
      }
      if (!pendingByKey.has(cacheKey) && pendingByKey.size >= MAX_PENDING_ENTRIES) {
        const oldestPendingKey = pendingByKey.keys().next().value!
        pendingByKey.get(oldestPendingKey)!.done()
        pendingByKey.delete(oldestPendingKey)
      }
      pendingByKey.get(cacheKey)?.done()
      pendingByKey.set(cacheKey, { signature, produce, valid, done })
      scheduleIdleFlush()
    },
    presented() {
      hasPresented = true
      scheduleIdleFlush()
    },
    stats: () => ({
      ...stats,
      bytes: totalBytes,
      [sizeStatKey]: snapshotByKey.size,
    }),
    whenIdle: () => idleChain,
  }
}
