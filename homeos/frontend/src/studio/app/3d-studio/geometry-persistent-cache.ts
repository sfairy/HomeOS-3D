import { createCacheLogger, runCacheTask } from "./cache-shared";

/** 几何/中间结果持久缓存：把可复用的几何（墙 union、楼板开洞、家具批量网格等）落盘，热启动时直接取回。 */
export const GEOMETRY_CACHE_VERSION = "20260930-v1";
const MAX_ENTRY_BYTES = 8388608,
  MAX_ENTRY_COUNT = 256,
  MAX_PERSISTED_BYTES = 33554432,
  MAX_PERSISTED_ENTRIES = 8,
  MAX_KEY_LENGTH = 131072;

/** 点是有限数、环至少 3 个点，才算合法的几何轮廓。 */
export function validGeometryLoops(loops: any) {
  return (
    Array.isArray(loops) &&
    loops.every(
      (loop) =>
        Array.isArray(loop) &&
        loop.length >= 3 &&
        loop.every((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y)),
    )
  );
}
function packGeometry(geometry: any) {
  if (geometry.isInstancedBufferGeometry || Object.keys(geometry.morphAttributes).length)
    throw Error("Unsupported geometry");
  const packAttribute = (attribute: any) => {
    if (
      attribute.isInterleavedBufferAttribute ||
      attribute.isInstancedBufferAttribute ||
      attribute.isFloat16BufferAttribute
    )
      throw Error("Unsupported attribute");
    return {
      array: attribute.array.slice(),
      itemSize: attribute.itemSize,
      normalized: attribute.normalized,
      name: attribute.name,
      usage: attribute.usage,
    };
  };
  return {
    attributes: Object.fromEntries(
      Object.entries(geometry.attributes).map(([name, attribute]) => [name, packAttribute(attribute)]),
    ),
    index: geometry.index ? packAttribute(geometry.index) : null,
    groups: geometry.groups.map((group: any) => ({
      ...group,
    })),
    drawRange: {
      ...geometry.drawRange,
    },
    box: geometry.boundingBox
      ? [geometry.boundingBox.min.toArray(), geometry.boundingBox.max.toArray()]
      : null,
    sphere: geometry.boundingSphere
      ? [geometry.boundingSphere.center.toArray(), geometry.boundingSphere.radius]
      : null,
  };
}
function packedGeometryBytes(packedGeometry: any) {
  return Object.values(packedGeometry.attributes as Record<string, any>).reduce(
    (byteSum, attribute) => byteSum + attribute.array.byteLength,
    packedGeometry.index?.array.byteLength || 0,
  );
}
function unpackGeometry(three: any, packedGeometry: any) {
  const geometry = new three.BufferGeometry(),
    unpackAttribute = (packedAttribute: any) => {
      if (
        !ArrayBuffer.isView(packedAttribute.array) ||
        packedAttribute.array instanceof DataView ||
        !Number.isInteger(packedAttribute.itemSize) ||
        packedAttribute.itemSize < 1 ||
        packedAttribute.itemSize > 4 ||
        packedAttribute.array.length % packedAttribute.itemSize
      )
        throw Error("Invalid geometry");
      const attribute = new three.BufferAttribute(
        packedAttribute.array.slice(),
        packedAttribute.itemSize,
        packedAttribute.normalized,
      );
      return (
        (attribute.name = packedAttribute.name || ""),
        attribute.setUsage(packedAttribute.usage),
        attribute
      );
    };
  try {
    for (const [attributeName, packedAttribute] of Object.entries(packedGeometry.attributes))
      geometry.setAttribute(attributeName, unpackAttribute(packedAttribute));
    if (!geometry.attributes.position) throw Error("Missing positions");
    packedGeometry.index && geometry.setIndex(unpackAttribute(packedGeometry.index));
    for (const group of packedGeometry.groups)
      geometry.addGroup(group.start, group.count, group.materialIndex);
    return (
      geometry.setDrawRange(packedGeometry.drawRange.start, packedGeometry.drawRange.count),
      packedGeometry.box &&
        (geometry.boundingBox = new three.Box3(
          new three.Vector3().fromArray(packedGeometry.box[0]),
          new three.Vector3().fromArray(packedGeometry.box[1]),
        )),
      packedGeometry.sphere &&
        (geometry.boundingSphere = new three.Sphere(
          new three.Vector3().fromArray(packedGeometry.sphere[0]),
          packedGeometry.sphere[1],
        )),
      geometry
    );
  } catch (unpackError: any) {
    throw (geometry.dispose(), unpackError);
  }
}
export function createGeometryPersistentCache({ env: env = globalThis, key: key = "" } = {}) {
  const entryByKey = new Map(),
    storageKey = key ? JSON.stringify([GEOMETRY_CACHE_VERSION, key]) : "";
  let openPromise,
    cachedConnection: any,
    isDisposed = false,
    hasOpenFailed = false,
    totalBytes = 0,
    hasDirtyEntries = false,
    hasPresented = false,
    idleHandle: any = null,
    preloadPromise,
    idleChain = Promise.resolve();
  const stats = {
      hits: 0,
      misses: 0,
      restores: 0,
      writes: 0,
      fallbacks: 0,
    },
    log = createCacheLogger(env, "[3D-geometry-cache]", stats),
    cloneValue = (value: any) => env.structuredClone(value),
    isAvailable = () => {
      try {
        return !!storageKey && !isDisposed && !hasOpenFailed && !!env.indexedDB && !!env.structuredClone;
      } catch {
        return false;
      }
    };
  function runWithTimeout(task: any, durationMs = 1500): Promise<any> {
    return runCacheTask(env, task, {
      duration: durationMs,
      onTimeout: () => stats.fallbacks++,
    });
  }
  function openDatabase() {
    return isAvailable()
      ? ((openPromise ||= runWithTimeout((settleOpen: any) => {
          const openRequest = env.indexedDB.open("homeos-architecture-geometry", 1);
          ((openRequest.onupgradeneeded = () => {
            (openRequest.result.createObjectStore("scenes", {
              keyPath: "key",
            }),
              openRequest.result.createObjectStore("metadata", {
                keyPath: "key",
              }));
          }),
            (openRequest.onerror = openRequest.onblocked =
              () => {
                ((hasOpenFailed = true), settleOpen(null));
              }),
            (openRequest.onsuccess = () => {
              if (isDisposed || hasOpenFailed) {
                (openRequest.result.close(), settleOpen(null));
                return;
              }
              ((cachedConnection = openRequest.result),
                (cachedConnection.onversionchange = disposeCache),
                settleOpen(cachedConnection));
            }));
        }, 1500)),
        openPromise)
      : Promise.resolve(null);
  }
  function deleteEntry(cacheKey: any) {
    const cachedEntry = entryByKey.get(cacheKey);
    (cachedEntry && (totalBytes -= cachedEntry.bytes), entryByKey.delete(cacheKey));
  }
  function storeEntry(cacheKey: any, entry: any) {
    if (
      !(
        !Number.isFinite(entry.bytes) ||
        entry.bytes < 0 ||
        entry.bytes > MAX_ENTRY_BYTES ||
        cacheKey.length > MAX_KEY_LENGTH
      )
    ) {
      for (deleteEntry(cacheKey); entryByKey.size && (entryByKey.size >= MAX_ENTRY_COUNT || totalBytes + entry.bytes > MAX_ENTRY_BYTES);)
        deleteEntry(entryByKey.keys().next().value);
      (entryByKey.set(cacheKey, entry), (totalBytes += entry.bytes));
    }
  }
  function preload() {
    return isAvailable()
      ? ((preloadPromise ||= (async () => {
          const openedDatabase = await openDatabase();
          if (!openedDatabase || !isAvailable()) return;
          const storedRecord = await runWithTimeout((settleRead: any) => {
            const readTransaction = openedDatabase.transaction("scenes", "readonly"),
              readRequest = readTransaction.objectStore("scenes").get(storageKey);
            ((readRequest.onsuccess = () => settleRead(readRequest.result)),
              (readRequest.onerror = readTransaction.onabort = () => settleRead(null)));
          });
          if (
            !isAvailable() ||
            !storedRecord ||
            storedRecord.version !== GEOMETRY_CACHE_VERSION ||
            storedRecord.key !== storageKey ||
            Date.now() - storedRecord.created > 7 * 86400000 ||
            !Array.isArray(storedRecord.entries)
          )
            return;
          for (const [entryKey, entryData] of storedRecord.entries.slice(0, MAX_ENTRY_COUNT))
            if (!(typeof entryKey != "string" || entryByKey.has(entryKey)))
              try {
                const entryBytes =
                  entryKey.length * 2 +
                  (entryData.kind === "geometry"
                    ? packedGeometryBytes(entryData.data)
                    : JSON.stringify(entryData.data).length * 2);
                storeEntry(entryKey, {
                  ...entryData,
                  bytes: entryBytes,
                });
              } catch {
                stats.fallbacks++;
              }
          stats.restores++;
        })().catch(() => {
          stats.fallbacks++;
        })),
        preloadPromise)
      : Promise.resolve();
  }
  function schedulePersist() {
    if (!hasPresented || !hasDirtyEntries || !isAvailable() || idleHandle !== null) return;
    const flushEntries = () => {
      ((idleHandle = null),
        (idleChain = idleChain
          .then(async () => {
            const openedDatabase = await openDatabase();
            if (!openedDatabase || !isAvailable() || !hasDirtyEntries) return;
            hasDirtyEntries = false;
            const storedRecord = {
              key: storageKey,
              version: GEOMETRY_CACHE_VERSION,
              created: Date.now(),
              bytes: totalBytes,
              entries: [...entryByKey],
            };
            ((await runWithTimeout((settleWrite: any) => {
              const writeTransaction = openedDatabase.transaction(["scenes", "metadata"], "readwrite");
              ((writeTransaction.oncomplete = () => settleWrite(true)),
                (writeTransaction.onabort = writeTransaction.onerror = () => settleWrite(false)),
                writeTransaction.objectStore("scenes").put(storedRecord));
              const metadataStore = writeTransaction.objectStore("metadata");
              metadataStore.put({
                key: storageKey,
                bytes: totalBytes,
                created: storedRecord.created,
              });
              const getAllRequest = metadataStore.getAll();
              getAllRequest.onsuccess = () => {
                const metadataRecords = getAllRequest.result.sort(
                  (left: any, right: any) => left.created - right.created,
                );
                let persistedBytes = metadataRecords.reduce(
                    (byteSum: any, metadataRecord: any) => byteSum + metadataRecord.bytes,
                    0,
                  ),
                  persistedCount = metadataRecords.length;
                for (const metadataRecord of metadataRecords) {
                  if (persistedCount <= MAX_PERSISTED_ENTRIES && persistedBytes <= MAX_PERSISTED_BYTES)
                    break;
                  (writeTransaction.objectStore("scenes").delete(metadataRecord.key),
                    metadataStore.delete(metadataRecord.key),
                    (persistedBytes -= metadataRecord.bytes),
                    persistedCount--);
                }
              };
            }))
              ? stats.writes++
              : ((hasOpenFailed = true), stats.fallbacks++),
              log("stored"));
          })
          .catch(() => {
            ((hasOpenFailed = true), stats.fallbacks++);
          })));
    };
    idleHandle = env.requestIdleCallback
      ? env.requestIdleCallback(flushEntries, {
          timeout: 3000,
        })
      : env.setTimeout(flushEntries, 250);
  }
  function resolveCachedValue(kind: any, primaryKey: any, secondaryKey: any, produce: any, serialize: any, deserialize: any) {
    if (!isAvailable()) return produce();
    let cacheKey;
    try {
      cacheKey = JSON.stringify([kind, primaryKey, secondaryKey]);
    } catch {
      return produce();
    }
    const cachedEntry = entryByKey.get(cacheKey);
    if (cachedEntry)
      try {
        const restoredValue = deserialize(cachedEntry.data);
        return (stats.hits++, restoredValue);
      } catch {
        (deleteEntry(cacheKey), stats.fallbacks++);
      }
    stats.misses++;
    const producedValue = produce();
    try {
      const serializedValue = serialize(producedValue);
      (storeEntry(cacheKey, {
        kind: kind,
        data: serializedValue,
        bytes:
          cacheKey.length * 2 +
          (kind === "geometry"
            ? packedGeometryBytes(serializedValue)
            : JSON.stringify(serializedValue).length * 2),
      }),
        (hasDirtyEntries = true),
        schedulePersist());
    } catch {
      stats.fallbacks++;
    }
    return producedValue;
  }
  function disposeCache() {
    ((isDisposed = true),
      idleHandle !== null &&
        (typeof env.requestIdleCallback === "function"
          ? env.cancelIdleCallback?.(idleHandle)
          : env.clearTimeout(idleHandle),
        (idleHandle = null)),
      entryByKey.clear(),
      (totalBytes = 0),
      cachedConnection?.close());
  }
  return (
    env.addEventListener?.("pagehide", disposeCache, {
      once: true,
    }),
    {
      preload: preload,
      dispose: disposeCache,
      value: (primaryKey: any, secondaryKey: any, produce: any, valid: any = () => true) =>
        resolveCachedValue("value", primaryKey, secondaryKey, produce, cloneValue, (restoredValue: any) => {
          if (!valid(restoredValue)) throw Error("Invalid geometry preparation");
          return cloneValue(restoredValue);
        }),
      geometry: (three: any, primaryKey: any, secondaryKey: any, produce: any) =>
        resolveCachedValue(
          "geometry",
          primaryKey,
          [three.REVISION, secondaryKey],
          produce,
          packGeometry,
          (packedGeometry: any) => unpackGeometry(three, packedGeometry),
        ),
      presented() {
        ((hasPresented = true), log("presented"), schedulePersist());
      },
      stats: () => ({
        ...stats,
        bytes: totalBytes,
        entries: entryByKey.size,
      }),
      whenIdle: () => idleChain,
    }
  );
}
