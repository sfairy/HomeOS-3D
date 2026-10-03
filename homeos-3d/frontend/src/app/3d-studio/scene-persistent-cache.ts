import { createCacheLogger, runCacheTask } from "./cache-shared";
const SCENE_PREPARATION_VERSION = "20260923-v1";
const SCENE_STORE = "scenes";
export function scenePreparationKey(lightHistoryScope, projectId, sceneId, source = "") {
  return lightHistoryScope && projectId && sceneId
    ? JSON.stringify([SCENE_PREPARATION_VERSION, lightHistoryScope, projectId, sceneId, source])
    : "";
}
function isUsablePreparedDocument(preparedDocument) {
  return (
    preparedDocument?.schemaVersion === 7 &&
    Array.isArray(preparedDocument.floors) &&
    preparedDocument.floors.length > 0 &&
    preparedDocument.floors.some((floor) => floor.id === preparedDocument.activeFloorId) &&
    preparedDocument.baseLighting &&
    preparedDocument.combinedCameraSettings &&
    preparedDocument.floors.every(
      (floorEntry) =>
        floorEntry.id &&
        floorEntry.scene?.settings &&
        ["walls", "items", "doors", "windows", "railings"].every((part) =>
          Array.isArray(floorEntry.scene[part]),
        ),
    )
  );
}
function reusableScenePreparation(preparedEntry, options) {
  return (
    !!preparedEntry &&
    preparedEntry.version === SCENE_PREPARATION_VERSION &&
    typeof options?.syncKey == "string" &&
    !!options.syncKey &&
    preparedEntry.syncKey === options.syncKey &&
    isUsablePreparedDocument(preparedEntry.document)
  );
}
export function createScenePersistentCache({
  env: env = globalThis,
  timeoutMs: timeoutMs = 120,
} = {}) {
  let openPromise,
    currentDatabase,
    isDisabled = false,
    idleChain = Promise.resolve();
  const entryByKey = new Map(),
    preloadByKey = new Map(),
    stats = {
      hits: 0,
      writes: 0,
      fallbacks: 0,
    },
    log = createCacheLogger(env, "[3D-scene-cache]", stats);
  function runWithTimeout(task, operationTimeoutMs = timeoutMs) {
    return runCacheTask(env, task, {
      duration: operationTimeoutMs,
      onTimeout: () => stats.fallbacks++,
    });
  }
  function open() {
    return isDisabled
      ? Promise.resolve(null)
      : ((openPromise ||= runWithTimeout((settleOpen) => {
          if (!env.indexedDB) {
            settleOpen(null);
            return;
          }
          const openRequest = env.indexedDB.open("homeos-3d-scenes", 1);
          let hasOpenFailed = false;
          ((openRequest.onupgradeneeded = () =>
            openRequest.result.createObjectStore(SCENE_STORE, {
              keyPath: "key",
            })),
            (openRequest.onerror = openRequest.onblocked =
              () => {
                ((hasOpenFailed = true), settleOpen(null));
              }),
            (openRequest.onsuccess = () => {
              const database = openRequest.result;
              if (isDisabled || hasOpenFailed) {
                (database.close(), settleOpen(null));
                return;
              }
              ((currentDatabase = database),
                (database.onversionchange = () => {
                  ((isDisabled = true), database.close());
                }),
                settleOpen(database));
            }));
        }, 1500)),
        openPromise);
  }
  function preload(preloadKey) {
    return !preloadKey || isDisabled
      ? Promise.resolve(null)
      : (entryByKey.has(preloadKey) ||
          entryByKey.set(
            preloadKey,
            runWithTimeout((settleRead) => {
              open()
                .then((opened) => {
                  if (!opened || isDisabled) {
                    settleRead(null);
                    return;
                  }
                  try {
                    const readTransaction = opened.transaction(SCENE_STORE, "readonly"),
                      readRequest = readTransaction.objectStore(SCENE_STORE).get(preloadKey);
                    ((readRequest.onerror = readTransaction.onabort = () => settleRead(null)),
                      (readRequest.onsuccess = () => {
                        const loadedEntry = readRequest.result;
                        !isDisabled &&
                        loadedEntry?.version === SCENE_PREPARATION_VERSION &&
                        Date.now() - loadedEntry.created < 7 * 86400000
                          ? (preloadByKey.set(preloadKey, loadedEntry),
                            stats.hits++,
                            log("restored"),
                            settleRead(loadedEntry))
                          : settleRead(null);
                      }));
                  } catch {
                    settleRead(null);
                  }
                })
                .catch(() => settleRead(null));
            }),
          ),
        entryByKey.get(preloadKey));
  }
  function schedule(scheduleKey, record, document) {
    if (!scheduleKey || isDisabled || !record?.syncKey || !isUsablePreparedDocument(document))
      return;
    let entry;
    try {
      entry = {
        key: scheduleKey,
        version: SCENE_PREPARATION_VERSION,
        syncKey: record.syncKey,
        document: env.structuredClone(document),
        created: Date.now(),
      };
    } catch {
      return;
    }
    idleChain = idleChain.then(
      () =>
        new Promise((resolveIdle) => {
          const flushEntry = async () => {
            try {
              const openedDatabase = currentDatabase || (await open());
              if (
                !openedDatabase ||
                isDisabled ||
                ((entry.bytes = JSON.stringify(entry).length * 2), entry.bytes > 8388608)
              )
                return;
              (await runWithTimeout((settleWrite) => {
                const writeTransaction = openedDatabase.transaction(SCENE_STORE, "readwrite"),
                  objectStore = writeTransaction.objectStore(SCENE_STORE);
                ((writeTransaction.oncomplete = () => settleWrite(true)),
                  (writeTransaction.onerror = writeTransaction.onabort = () => settleWrite(false)),
                  objectStore.put(entry));
                const getAllRequest = objectStore.getAll();
                getAllRequest.onsuccess = () => {
                  const existingEntries = getAllRequest.result.sort(
                    (entryA, entryB) => entryA.created - entryB.created,
                  );
                  let totalBytes = existingEntries.reduce(
                      (byteSum, storedEntry) => byteSum + (storedEntry.bytes || 0),
                      0,
                    ),
                    remainingCount = existingEntries.length;
                  for (const candidateEntry of existingEntries) {
                    if (remainingCount <= 8 && totalBytes <= 33554432) break;
                    (objectStore.delete(candidateEntry.key),
                      remainingCount--,
                      (totalBytes -= candidateEntry.bytes || 0));
                  }
                };
              }, 1500)) && (stats.writes++, log("stored"));
            } catch {
              stats.fallbacks++;
            } finally {
              resolveIdle();
            }
          };
          env.requestIdleCallback
            ? env.requestIdleCallback(flushEntry, {
                timeout: 3000,
              })
            : env.setTimeout(flushEntry, 250);
        }),
    );
  }
  return (
    env.addEventListener?.(
      "pagehide",
      () => {
        ((isDisabled = true), preloadByKey.clear(), currentDatabase?.close());
      },
      {
        once: true,
      },
    ),
    {
      preload: preload,
      peek: (peekKey) => preloadByKey.get(peekKey) || null,
      schedule: schedule,
      whenIdle: () => idleChain,
      stats: () => ({
        ...stats,
      }),
    }
  );
}
export function prepareSceneDocument(sceneRecord, cachedEntry, generate) {
  const reused = reusableScenePreparation(cachedEntry, sceneRecord);
  return {
    document: reused ? cachedEntry.document : generate(sceneRecord.scene),
    reused: reused,
  };
}
