import { createCacheLogger, runCacheTask } from "../cache-shared";

/** 地面反射的持久缓存：把第一帧反射的浮点贴图（半精度）落盘，热启动时先还原再逐帧校正。 */
export const REFLECTION_CACHE_VERSION = "20260930-v1";
const MAX_ENTRY_BYTES = 25165824,
  MAX_PERSISTED_BYTES = 67108864,
  MAX_ENTRY_COUNT = 8,
  MAX_PERSISTED_ENTRIES = 4,
  MAX_PENDING_ENTRIES = 8;
/** 反射快照：分辨率 128..1024 的方形，像素为 size*size*4 的半精度 RGBA，矩阵 16 个有限数。 */
export function validReflectionSnapshot(snapshot: any) {
  return (
    !!snapshot &&
    Number.isInteger(snapshot.size) &&
    snapshot.size >= 128 &&
    snapshot.size <= 1024 &&
    snapshot.pixels instanceof Uint16Array &&
    snapshot.pixels.length === snapshot.size * snapshot.size * 4 &&
    Array.isArray(snapshot.matrix) &&
    snapshot.matrix.length === 16 &&
    snapshot.matrix.every(Number.isFinite)
  );
}
const snapshotBytes = (snapshot: any) => snapshot.pixels.byteLength + 128;
export function createReflectionPersistentCache({ env: env = globalThis, key: key = "" } = {}) {
  const snapshotByKey = new Map(),
    pendingByKey = new Map(),
    persistedKeySet = new Set(),
    storageKey = key && JSON.stringify([REFLECTION_CACHE_VERSION, key]);
  let cachedConnection: any,
    openPromise,
    preloadPromise,
    isDisposed = false,
    hasOpenFailed = false,
    hasPresented = false,
    idleHandle: any = null,
    isIdleRunning = false,
    idleChain = Promise.resolve(),
    totalBytes = 0;
  const stats = {
      hits: 0,
      misses: 0,
      restores: 0,
      writes: 0,
      fallbacks: 0,
    },
    log = createCacheLogger(env, "[3D-reflection-cache]", stats);
  function isAvailable() {
    try {
      return !!storageKey && !isDisposed && !hasOpenFailed && !!env.indexedDB;
    } catch {
      return false;
    }
  }
  function runWithTimeout(task: any): Promise<any> {
    return runCacheTask(env, task, {
      duration: 1500,
      onTimeout: () => stats.fallbacks++,
    });
  }
  function openDatabase() {
    return isAvailable()
      ? ((openPromise ||= runWithTimeout((settleOpen: any) => {
          const openRequest = env.indexedDB.open("homeos-first-reflections", 1);
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
              if (!isAvailable()) {
                (openRequest.result.close(), settleOpen(null));
                return;
              }
              ((cachedConnection = openRequest.result),
                (cachedConnection.onversionchange = disposeCache),
                settleOpen(cachedConnection));
            }));
        })),
        openPromise)
      : Promise.resolve(null);
  }
  function deleteEntry(cacheKey: any) {
    ((totalBytes -= snapshotByKey.get(cacheKey)?.bytes || 0), snapshotByKey.delete(cacheKey));
  }
  function storeSnapshot(cacheKey: any, entry: any) {
    if (
      typeof cacheKey != "string" ||
      typeof entry.signature != "string" ||
      entry.signature.length > 1024 * 1024 ||
      !validReflectionSnapshot(entry.data)
    )
      return false;
    const entryBytes = snapshotBytes(entry.data) + entry.signature.length * 2;
    if (entryBytes > MAX_ENTRY_BYTES) return false;
    for (deleteEntry(cacheKey); snapshotByKey.size && (snapshotByKey.size >= MAX_ENTRY_COUNT || totalBytes + entryBytes > MAX_ENTRY_BYTES);)
      deleteEntry(snapshotByKey.keys().next().value);
    return (
      snapshotByKey.set(cacheKey, {
        ...entry,
        bytes: entryBytes,
      }),
      (totalBytes += entryBytes),
      true
    );
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
            storedRecord?.key !== storageKey ||
            storedRecord.version !== REFLECTION_CACHE_VERSION ||
            !Number.isFinite(storedRecord.created) ||
            Date.now() - storedRecord.created > 7 * 86400000 ||
            !Array.isArray(storedRecord.entries)
          )
            return;
          for (const storedEntry of storedRecord.entries.slice(0, MAX_ENTRY_COUNT))
            if (
              !Array.isArray(storedEntry) ||
              storedEntry.length !== 2 ||
              snapshotByKey.has(storedEntry[0]) ||
              persistedKeySet.has(storedEntry[0])
            )
              continue;
            else
              try {
                storeSnapshot(storedEntry[0], storedEntry[1]) || stats.fallbacks++;
              } catch {
                stats.fallbacks++;
              }
          (stats.restores++, log("restored"));
        })().catch(() => {
          stats.fallbacks++;
        })),
        preloadPromise)
      : Promise.resolve();
  }
  async function persist() {
    const openedDatabase = await openDatabase();
    if (!openedDatabase || !isAvailable()) return;
    const storedRecord = {
      key: storageKey,
      version: REFLECTION_CACHE_VERSION,
      created: Date.now(),
      bytes: totalBytes,
      entries: [...snapshotByKey],
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
          if (persistedBytes <= MAX_PERSISTED_BYTES && persistedCount <= MAX_PERSISTED_ENTRIES)
            break;
          (writeTransaction.objectStore("scenes").delete(metadataRecord.key),
            metadataStore.delete(metadataRecord.key),
            (persistedBytes -= metadataRecord.bytes),
            persistedCount--);
        }
      };
    }))
      ? stats.writes++
      : (stats.fallbacks++, (hasOpenFailed = true)),
      log("stored"));
  }
  function cancelPendingEntries() {
    for (const pendingEntry of pendingByKey.values()) pendingEntry.done();
    pendingByKey.clear();
  }
  function scheduleIdleFlush() {
    if (!isAvailable()) {
      cancelPendingEntries();
      return;
    }
    if (!hasPresented || isIdleRunning || idleHandle !== null || !pendingByKey.size) return;
    const flushPendingEntry = () => {
      ((idleHandle = null),
        (isIdleRunning = true),
        (idleChain = (async () => {
          if (!isAvailable() || !pendingByKey.size) return;
          const [pendingKey, pendingEntry] = pendingByKey.entries().next().value!;
          pendingByKey.delete(pendingKey);
          try {
            if (!isAvailable() || persistedKeySet.has(pendingKey) || !pendingEntry.valid()) return;
            const signature =
              typeof pendingEntry.signature == "function"
                ? pendingEntry.signature()
                : pendingEntry.signature;
            if (!signature || !pendingEntry.valid()) return;
            const producedSnapshot = await pendingEntry.produce(signature);
            if (!isAvailable() || !pendingEntry.valid() || !producedSnapshot) return;
            if (
              !storeSnapshot(pendingKey, {
                signature: signature,
                data: producedSnapshot,
              })
            ) {
              stats.fallbacks++;
              return;
            }
            (persistedKeySet.add(pendingKey), await persist());
          } finally {
            pendingEntry.done();
          }
        })()
          .catch(() => {
            stats.fallbacks++;
          })
          .finally(() => {
            ((isIdleRunning = false), scheduleIdleFlush());
          })));
    };
    idleHandle = env.requestIdleCallback
      ? env.requestIdleCallback(flushPendingEntry, {
          timeout: 3000,
        })
      : env.setTimeout(flushPendingEntry, 250);
  }
  function disposeCache() {
    ((isDisposed = true),
      idleHandle !== null &&
        (typeof env.requestIdleCallback === "function"
          ? env.cancelIdleCallback?.(idleHandle)
          : env.clearTimeout(idleHandle),
        (idleHandle = null)),
      cancelPendingEntries(),
      snapshotByKey.clear(),
      persistedKeySet.clear(),
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
      available: isAvailable,
      has: (cacheKey: any) => isAvailable() && snapshotByKey.has(cacheKey),
      discard(cacheKey: any) {
        (deleteEntry(cacheKey), persistedKeySet.delete(cacheKey), stats.fallbacks++);
      },
      peek(cacheKey: any, signature: any) {
        if (!isAvailable() || !signature) return null;
        const cachedEntry = snapshotByKey.get(cacheKey);
        return cachedEntry?.signature === signature && validReflectionSnapshot(cachedEntry.data)
          ? (stats.hits++, persistedKeySet.add(cacheKey), log("restored"), cachedEntry.data)
          : (stats.misses++, null);
      },
      enqueue(cacheKey: any, signature: any, produce: any, valid: any, done = () => {}) {
        if (
          !isAvailable() ||
          !signature ||
          (typeof signature != "function" && signature.length > 1024 * 1024) ||
          persistedKeySet.has(cacheKey)
        ) {
          done();
          return;
        }
        if (!pendingByKey.has(cacheKey) && pendingByKey.size >= MAX_PENDING_ENTRIES) {
          const oldestPendingKey = pendingByKey.keys().next().value;
          (pendingByKey.get(oldestPendingKey).done(), pendingByKey.delete(oldestPendingKey));
        }
        (pendingByKey.get(cacheKey)?.done(),
          pendingByKey.set(cacheKey, {
            signature: signature,
            produce: produce,
            valid: valid,
            done: done,
          }),
          scheduleIdleFlush());
      },
      presented() {
        ((hasPresented = true), scheduleIdleFlush());
      },
      stats: () => ({
        ...stats,
        bytes: totalBytes,
        receivers: snapshotByKey.size,
      }),
      whenIdle: () => idleChain,
    }
  );
}
/** 抓取当前反射贴图为半精度快照（要求 EXT_color_buffer_float，尺寸为 2 的幂且 128..1024）。 */
export async function captureReflectionSnapshot(three: any, renderer: any, source: any, canCapture: any) {
  if (
    !renderer.readRenderTargetPixelsAsync ||
    !canCapture() ||
    (renderer.extensions?.has && !renderer.extensions.has("EXT_color_buffer_float"))
  )
    return null;
  const size = source.map.width;
  if (size < 128 || size > 1024 || source.map.height !== size) return null;
  const matrixArray = source.matrix.toArray(),
    renderTarget = new three.WebGLRenderTarget(size, size, {
      type: three.FloatType,
      depthBuffer: false,
    }),
    captureScene = new three.Scene(),
    captureCamera = new three.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    copyMaterial = new three.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        source: {
          value: source.map.texture,
        },
      },
      vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
      fragmentShader: "uniform sampler2D source;varying vec2 vUv;void main(){gl_FragColor=texture2D(source,vUv);}",
    }),
    copyMesh = new three.Mesh(new three.PlaneGeometry(2, 2), copyMaterial);
  ((copyMesh.frustumCulled = false), captureScene.add(copyMesh));
  const floatPixels = new Float32Array(size * size * 4),
    rendererState = {
      target: renderer.getRenderTarget(),
      face: renderer.getActiveCubeFace(),
      mip: renderer.getActiveMipmapLevel(),
      viewport: renderer.getViewport(new three.Vector4()),
      scissor: renderer.getScissor(new three.Vector4()),
      scissorTest: renderer.getScissorTest(),
      autoClear: renderer.autoClear,
      xr: renderer.xr.enabled,
      shadow: renderer.shadowMap.enabled,
    };
  try {
    let readPromise;
    try {
      ((renderer.xr.enabled = renderer.shadowMap.enabled = false),
        (renderer.autoClear = false),
        renderer.setScissorTest(false),
        renderer.setRenderTarget(renderTarget),
        renderer.render(captureScene, captureCamera),
        (readPromise = renderer.readRenderTargetPixelsAsync(
          renderTarget,
          0,
          0,
          size,
          size,
          floatPixels,
        )));
    } finally {
      (renderer.setViewport(rendererState.viewport),
        renderer.setScissor(rendererState.scissor),
        renderer.setScissorTest(rendererState.scissorTest),
        renderer.setRenderTarget(rendererState.target, rendererState.face, rendererState.mip),
        (renderer.autoClear = rendererState.autoClear),
        (renderer.xr.enabled = rendererState.xr),
        (renderer.shadowMap.enabled = rendererState.shadow));
    }
    if ((await readPromise, !canCapture())) return null;
    const halfFloatPixels = new Uint16Array(floatPixels.length);
    for (let pixelIndex = 0; pixelIndex < floatPixels.length; pixelIndex++) {
      if (!Number.isFinite(floatPixels[pixelIndex]) || Math.abs(floatPixels[pixelIndex]) > 65504)
        return null;
      halfFloatPixels[pixelIndex] = three.DataUtils.toHalfFloat(floatPixels[pixelIndex]);
    }
    return {
      size: size,
      pixels: halfFloatPixels,
      matrix: matrixArray,
    };
  } finally {
    (renderTarget.dispose(), copyMesh.geometry.dispose(), copyMaterial.dispose());
  }
}
/** 用快照重建可贴回地面的半精度 DataTexture。 */
export function restoreReflectionSnapshot(three: any, snapshot: any) {
  if (!validReflectionSnapshot(snapshot)) return null;
  const dataTexture = new three.DataTexture(
    snapshot.pixels.slice(),
    snapshot.size,
    snapshot.size,
    three.RGBAFormat,
    three.HalfFloatType,
  );
  return (
    (dataTexture.minFilter = dataTexture.magFilter = three.LinearFilter),
    (dataTexture.generateMipmaps = false),
    (dataTexture.needsUpdate = true),
    dataTexture
  );
}
