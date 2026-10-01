import {
  packModelTemplate,
  unpackModelTemplate,
} from "./model-template-codec.js?v=20260923-prepared-v2";
const MODEL_CACHE_DB_NAME = "ha-bridge-3d-templates",
  TEMPLATE_STORE = "templates",
  METADATA_STORE = "metadata",
  MAX_TEMPLATE_COUNT = 80,
  MAX_TOTAL_BYTES = 64 * 1024 * 1024,
  MAX_TEMPLATE_BYTES = 8 * 1024 * 1024;
export function createModelPersistentCache({
  THREE: THREE,
  env: env = globalThis,
  timeoutMs: timeoutMs = 1000,
} = {}) {
  let openPromise,
    cachedConnection,
    hasOpenAttempted = false,
    isDisabled = false,
    idleQueue = Promise.resolve();
  const stats = {
      hits: 0,
      misses: 0,
      writes: 0,
      fallbacks: 0,
    },
    isDiagnosticsEnabled =
      new URLSearchParams(env.location?.search || "").get("performance-diagnostics") === "1",
    log = (event) => {
      isDiagnosticsEnabled &&
        env.console?.info(
          "[3D-model-cache]",
          JSON.stringify({
            event: event,
            ...stats,
          }),
        );
    };
  function noteFallback() {
    (stats.fallbacks++, log("fallback"));
  }
  function isAvailable() {
    try {
      return !isDisabled && !!env.indexedDB && !!THREE.ObjectLoader;
    } catch {
      return false;
    }
  }
  function runWithTimeout(
    task,
    { duration: durationMs = timeoutMs, disable: disableOnTimeout = true } = {},
  ) {
    return new Promise((resolve) => {
      let isSettled = false;
      const settle = (result) => {
          isSettled || ((isSettled = true), env.clearTimeout(timerId), resolve(result));
        },
        timerId = env.setTimeout(() => {
          (disableOnTimeout && (isDisabled = true), noteFallback(), settle(null));
        }, durationMs);
      try {
        task(settle);
      } catch {
        settle(null);
      }
    });
  }
  function openDatabase() {
    return isAvailable()
      ? ((openPromise ||= runWithTimeout(
          (resolveOpen) => {
            const openRequest = env.indexedDB.open(MODEL_CACHE_DB_NAME, 2);
            ((openRequest.onupgradeneeded = () => {
              (openRequest.result.objectStoreNames.contains(TEMPLATE_STORE) ||
                openRequest.result.createObjectStore(TEMPLATE_STORE, {
                  keyPath: "key",
                }),
                openRequest.result.objectStoreNames.contains(METADATA_STORE) ||
                  openRequest.result.createObjectStore(METADATA_STORE, {
                    keyPath: "key",
                  }));
            }),
              (openRequest.onerror = openRequest.onblocked =
                () => {
                  ((isDisabled = true), noteFallback(), resolveOpen(null));
                }),
              (openRequest.onsuccess = () => {
                const connection = openRequest.result;
                if (isDisabled) {
                  (connection.close(), resolveOpen(null));
                  return;
                }
                ((connection.onversionchange = () => {
                  ((isDisabled = true), connection.close());
                }),
                  (cachedConnection = connection),
                  resolveOpen(connection));
              }));
          },
          {
            duration: Math.max(timeoutMs, 1500),
          },
        )),
        openPromise)
      : Promise.resolve(null);
  }
  async function restore(restoreKey) {
    if (!isAvailable() || (hasOpenAttempted && !cachedConnection)) return null;
    const restoreConnection =
      cachedConnection ||
      (await runWithTimeout(
        (settleConnection) => {
          openDatabase().then(settleConnection);
        },
        {
          disable: false,
          duration: Math.min(timeoutMs, 150),
        },
      ));
    if ((restoreConnection || (hasOpenAttempted = true), !restoreConnection || isDisabled))
      return null;
    const record = await runWithTimeout((settleRead) => {
      const readTransaction = restoreConnection.transaction(TEMPLATE_STORE, "readonly"),
        request = readTransaction.objectStore(TEMPLATE_STORE).get(restoreKey);
      ((request.onsuccess = () => settleRead(request.result)),
        (request.onerror = readTransaction.onabort = () => settleRead(null)));
    });
    if (!record) return (stats.misses++, log("miss"), null);
    try {
      const restored = unpackModelTemplate(THREE, record.template);
      return (stats.hits++, log("hit"), restored);
    } catch {
      noteFallback();
      try {
        const cleanup = restoreConnection.transaction(
          [TEMPLATE_STORE, METADATA_STORE],
          "readwrite",
        );
        ((cleanup.onerror = () => {}),
          cleanup.objectStore(TEMPLATE_STORE).delete(restoreKey),
          cleanup.objectStore(METADATA_STORE).delete(restoreKey));
      } catch {}
      return null;
    }
  }
  async function saveTemplate(saveKey, modelDefinition) {
    const saveConnection = await openDatabase();
    if (!saveConnection || isDisabled) return;
    let template;
    try {
      template = packModelTemplate(THREE, modelDefinition);
    } catch {
      noteFallback();
      return;
    }
    if (template.bytes > MAX_TEMPLATE_BYTES) return;
    (await runWithTimeout((settleWrite) => {
      const writeTransaction = saveConnection.transaction(
          [TEMPLATE_STORE, METADATA_STORE],
          "readwrite",
        ),
        templateStore = writeTransaction.objectStore(TEMPLATE_STORE),
        metadataStore = writeTransaction.objectStore(METADATA_STORE);
      ((writeTransaction.oncomplete = () => settleWrite(true)),
        (writeTransaction.onabort = writeTransaction.onerror = () => settleWrite(false)),
        templateStore.put({
          key: saveKey,
          template: template,
          bytes: template.bytes,
          created: Date.now(),
        }),
        metadataStore.put({
          key: saveKey,
          bytes: template.bytes,
          created: Date.now(),
        }));
      const getAllRequest = metadataStore.getAll();
      getAllRequest.onsuccess = () => {
        const metadataRecords = getAllRequest.result;
        metadataRecords.sort((left, right) => left.created - right.created);
        let totalBytes = metadataRecords.reduce(
            (accumulatedBytes, metadataRecord) => accumulatedBytes + (metadataRecord.bytes || 0),
            0,
          ),
          recordCount = metadataRecords.length;
        for (const metadataEntry of metadataRecords) {
          if (recordCount <= MAX_TEMPLATE_COUNT && totalBytes <= MAX_TOTAL_BYTES) break;
          (templateStore.delete(metadataEntry.key),
            metadataStore.delete(metadataEntry.key),
            recordCount--,
            (totalBytes -= metadataEntry.bytes || 0));
        }
      };
    }))
      ? (stats.writes++, log("stored"))
      : ((isDisabled = true), noteFallback());
  }
  function schedule(scheduleKey, scheduledModel) {
    isAvailable() &&
      (idleQueue = idleQueue.then(
        () =>
          new Promise((resolveIdle) => {
            const runSave = () => {
              saveTemplate(scheduleKey, scheduledModel).catch(noteFallback).finally(resolveIdle);
            };
            env.requestIdleCallback
              ? env.requestIdleCallback(runSave, {
                  timeout: 3000,
                })
              : env.setTimeout(runSave, 250);
          }),
      ));
  }
  return (
    log(isAvailable() ? "enabled" : "unavailable"),
    isAvailable() && openDatabase(),
    env.addEventListener?.(
      "pagehide",
      () => {
        ((isDisabled = true), cachedConnection?.close());
      },
      {
        once: true,
      },
    ),
    {
      restore: restore,
      schedule: schedule,
      stats: () => ({
        ...stats,
      }),
      whenIdle: () => idleQueue,
    }
  );
}
