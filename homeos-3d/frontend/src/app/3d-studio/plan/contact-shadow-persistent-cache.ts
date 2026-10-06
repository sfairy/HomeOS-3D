import { createCacheLogger, runCacheTask } from "../cache-shared";

/** 接触阴影的持久缓存：把烘焙好的 target/surface 贴图 + 查询纹理 + 参数快照落盘，热启动时直接还原。 */
export const CONTACT_SHADOW_CACHE_VERSION = "20260930-v1";
const MAX_ENTRY_BYTES = 25165824,
  MAX_PERSISTED_BYTES = 100663296,
  MAX_ENTRY_COUNT = 8,
  MAX_PENDING_ENTRIES = 8;

/** 长度为 length 的有限数元组。 */
const isFiniteTuple = (value, tupleLength) =>
  Array.isArray(value) && value.length === tupleLength && value.every(Number.isFinite);
/** 烘焙纹理载荷：尺寸在 4096 内、像素数是宽高乘积的 Uint8 灰度图。 */
const isValidBakedTexture = (bakedTexture) =>
  bakedTexture &&
  Number.isInteger(bakedTexture.width) &&
  Number.isInteger(bakedTexture.height) &&
  bakedTexture.width > 0 &&
  bakedTexture.height > 0 &&
  bakedTexture.width <= 4096 &&
  bakedTexture.height <= 4096 &&
  bakedTexture.pixels instanceof Uint8Array &&
  bakedTexture.pixels.length === bakedTexture.width * bakedTexture.height;
/** 完整的接触阴影快照：target 必填，surface/lookup 要么都没有要么都合法。 */
export function validContactShadowSnapshot(snapshot) {
  return (
    !!snapshot &&
    isValidBakedTexture(snapshot.target) &&
    (!snapshot.surface || isValidBakedTexture(snapshot.surface)) &&
    (!snapshot.surface ||
      (snapshot.lookup instanceof Uint8Array && snapshot.lookup.length === 2048 * 4)) &&
    isFiniteTuple(snapshot.frame, 16) &&
    isFiniteTuple(snapshot.bounds, 4) &&
    snapshot.bounds[2] > 0 &&
    snapshot.bounds[3] > 0 &&
    Number.isFinite(snapshot.y) &&
    isFiniteTuple(snapshot.surfaceBounds, 4) &&
    isFiniteTuple(snapshot.layout, 2) &&
    (!snapshot.surface ||
      (snapshot.surfaceBounds[2] > 0 &&
        snapshot.surfaceBounds[3] > 0 &&
        Number.isInteger(snapshot.layout[0]) &&
        snapshot.layout[0] >= 1 &&
        snapshot.layout[0] <= 6 &&
        snapshot.layout[1] > 0))
  );
}
const snapshotBytes = (snapshot) =>
  snapshot.target.pixels.byteLength +
  (snapshot.surface?.pixels.byteLength || 0) +
  (snapshot.lookup?.byteLength || 0) +
  256;
export function createContactShadowPersistentCache({ env: env = globalThis, key: key = "" } = {}) {
  const snapshotByKey = new Map(),
    pendingByKey = new Map(),
    persistedKeySet = new Set(),
    storageKey = key && JSON.stringify([CONTACT_SHADOW_CACHE_VERSION, key]);
  let cachedConnection,
    openPromise,
    preloadPromise,
    isDisposed = false,
    hasOpenFailed = false,
    hasPresented = false,
    idleHandle = null,
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
    log = createCacheLogger(env, "[3D-shadow-cache]", stats);
  function isAvailable() {
    try {
      return !!storageKey && !isDisposed && !hasOpenFailed && !!env.indexedDB;
    } catch {
      return false;
    }
  }
  function runWithTimeout(task): Promise<any> {
    return runCacheTask(env, task, {
      duration: 1500,
      onTimeout: () => stats.fallbacks++,
    });
  }
  function openDatabase() {
    return isAvailable()
      ? ((openPromise ||= runWithTimeout((settleOpen) => {
          const openRequest = env.indexedDB.open("homeos-3d-contact-shadows", 1);
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
  function deleteEntry(cacheKey) {
    ((totalBytes -= snapshotByKey.get(cacheKey)?.bytes || 0), snapshotByKey.delete(cacheKey));
  }
  function storeSnapshot(cacheKey, entry) {
    if (
      typeof cacheKey != "string" ||
      typeof entry.signature != "string" ||
      entry.signature.length > 1024 * 1024 ||
      !validContactShadowSnapshot(entry.data)
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
          const storedRecord = await runWithTimeout((settleRead) => {
            const readTransaction = openedDatabase.transaction("scenes", "readonly"),
              readRequest = readTransaction.objectStore("scenes").get(storageKey);
            ((readRequest.onsuccess = () => settleRead(readRequest.result)),
              (readRequest.onerror = readTransaction.onabort = () => settleRead(null)));
          });
          if (
            !isAvailable() ||
            storedRecord?.key !== storageKey ||
            storedRecord.version !== CONTACT_SHADOW_CACHE_VERSION ||
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
      version: CONTACT_SHADOW_CACHE_VERSION,
      created: Date.now(),
      bytes: totalBytes,
      entries: [...snapshotByKey],
    };
    ((await runWithTimeout((settleWrite) => {
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
          (left, right) => left.created - right.created,
        );
        let persistedBytes = metadataRecords.reduce(
            (byteSum, metadataRecord) => byteSum + metadataRecord.bytes,
            0,
          ),
          persistedCount = metadataRecords.length;
        for (const metadataRecord of metadataRecords) {
          if (persistedBytes <= MAX_PERSISTED_BYTES && persistedCount <= MAX_ENTRY_COUNT) break;
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
  function scheduleIdleFlush() {
    if (!isAvailable() || !hasPresented || isIdleRunning || idleHandle !== null || !pendingByKey.size)
      return;
    const flushPendingEntry = () => {
      ((idleHandle = null),
        (isIdleRunning = true),
        (idleChain = (async () => {
          if (!isAvailable() || !pendingByKey.size) return;
          const [pendingKey, pendingEntry] = pendingByKey.entries().next().value;
          if (
            (pendingByKey.delete(pendingKey),
            !isAvailable() || persistedKeySet.has(pendingKey) || !pendingEntry.valid())
          )
            return;
          const producedSnapshot = await pendingEntry.produce();
          if (!(!isAvailable() || !pendingEntry.valid() || !producedSnapshot)) {
            if (
              !storeSnapshot(pendingKey, {
                signature: pendingEntry.signature,
                data: producedSnapshot,
              })
            ) {
              stats.fallbacks++;
              return;
            }
            (persistedKeySet.add(pendingKey), await persist());
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
        (env.requestIdleCallback ? env.cancelIdleCallback?.(idleHandle) : env.clearTimeout(idleHandle),
        (idleHandle = null)),
      pendingByKey.clear(),
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
      peek(cacheKey, signature) {
        if (!isAvailable() || !signature) return null;
        const cachedEntry = snapshotByKey.get(cacheKey);
        return cachedEntry?.signature === signature && validContactShadowSnapshot(cachedEntry.data)
          ? (stats.hits++, persistedKeySet.add(cacheKey), log("restored"), cachedEntry.data)
          : (stats.misses++, null);
      },
      enqueue(cacheKey, signature, produce, valid) {
        !isAvailable() ||
          !signature ||
          signature.length > 1024 * 1024 ||
          persistedKeySet.has(cacheKey) ||
          (!pendingByKey.has(cacheKey) &&
            pendingByKey.size >= MAX_PENDING_ENTRIES &&
            pendingByKey.delete(pendingByKey.keys().next().value),
          pendingByKey.set(cacheKey, {
            signature: signature,
            produce: produce,
            valid: valid,
          }),
          scheduleIdleFlush());
      },
      presented() {
        ((hasPresented = true), scheduleIdleFlush());
      },
      stats: () => ({
        ...stats,
        bytes: totalBytes,
        floors: snapshotByKey.size,
      }),
      whenIdle: () => idleChain,
    }
  );
}
/** 把当前接触阴影的贴图与 uniform 参数抓成可落盘的快照（读回像素用 red 通道）。 */
export async function captureContactShadowSnapshot(three, renderer, source, canCapture) {
  if (!renderer.readRenderTargetPixelsAsync || !canCapture()) return null;
  const snapshot = {
      frame: source.bakedFrame.toArray(),
      bounds: source.uniforms.plan2ContactBounds.value.toArray(),
      y: source.uniforms.plan2ContactY.value,
      surfaceBounds: source.uniforms.plan2SurfaceBounds.value.toArray(),
      layout: source.uniforms.plan2SurfaceLayout.value.toArray(),
      lookup: source.lookup?.image.data.slice() || null,
    },
    captureScene = new three.Scene(),
    captureCamera = new three.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    copyMaterial = new three.ShaderMaterial({
      uniforms: {
        source: {
          value: null,
        },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
      fragmentShader:
        "uniform sampler2D source;varying vec2 vUv;void main(){gl_FragColor=vec4(texture2D(source,vUv).r,0.,0.,1.);}",
    }),
    copyMesh = new three.Mesh(new three.PlaneGeometry(2, 2), copyMaterial);
  ((copyMesh.frustumCulled = false), captureScene.add(copyMesh));
  try {
    for (const channelName of ["target", "surface"]) {
      const sourceTarget = source[channelName];
      if (!sourceTarget) {
        snapshot[channelName] = null;
        continue;
      }
      if (!canCapture() || sourceTarget.width > 4096 || sourceTarget.height > 4096) return null;
      const renderTarget = new three.WebGLRenderTarget(sourceTarget.width, sourceTarget.height, {
          depthBuffer: false,
          generateMipmaps: false,
        }),
        pixelBuffer = new Uint8Array(sourceTarget.width * sourceTarget.height * 4),
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
            (copyMaterial.uniforms.source.value = sourceTarget.texture),
            renderer.render(captureScene, captureCamera),
            (readPromise = renderer.readRenderTargetPixelsAsync(
              renderTarget,
              0,
              0,
              sourceTarget.width,
              sourceTarget.height,
              pixelBuffer,
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
        const redChannelPixels = new Uint8Array(sourceTarget.width * sourceTarget.height);
        for (let pixelIndex = 0; pixelIndex < redChannelPixels.length; pixelIndex++)
          redChannelPixels[pixelIndex] = pixelBuffer[pixelIndex * 4];
        snapshot[channelName] = {
          width: sourceTarget.width,
          height: sourceTarget.height,
          pixels: redChannelPixels,
        };
      } finally {
        renderTarget.dispose();
      }
    }
    return validContactShadowSnapshot(snapshot) ? snapshot : null;
  } finally {
    (copyMesh.geometry.dispose(), copyMaterial.dispose());
  }
}
/** 把快照还原成可直接挂回 uniform 的贴图与参数（失败时释放已建纹理并返回 null）。 */
export function restoreContactShadowSnapshot(three, snapshot) {
  if (!validContactShadowSnapshot(snapshot)) return null;
  const createdTextures = [];
  try {
    const restoreBakedTexture = (bakedTexture) => {
        if (!bakedTexture) return null;
        const dataTexture = new three.DataTexture(
          bakedTexture.pixels.slice(),
          bakedTexture.width,
          bakedTexture.height,
          three.RedFormat,
        );
        return (
          createdTextures.push(dataTexture),
          (dataTexture.minFilter = dataTexture.magFilter = three.LinearFilter),
          (dataTexture.needsUpdate = true),
          {
            width: bakedTexture.width,
            height: bakedTexture.height,
            texture: dataTexture,
            restored: true,
            dispose: () => dataTexture.dispose(),
          }
        );
      },
      restoredSnapshot: any = {
        target: restoreBakedTexture(snapshot.target),
        surface: restoreBakedTexture(snapshot.surface),
        lookup: null,
      };
    return (
      snapshot.surface &&
        ((restoredSnapshot.lookup = new three.DataTexture(snapshot.lookup.slice(), 2048, 1)),
        createdTextures.push(restoredSnapshot.lookup),
        (restoredSnapshot.lookup.needsUpdate = true)),
      (restoredSnapshot.bakedFrame = new three.Matrix4().fromArray(snapshot.frame)),
      (restoredSnapshot.values = {
        plan2ContactBounds: new three.Vector4().fromArray(snapshot.bounds),
        plan2ContactY: snapshot.y,
        plan2SurfaceBounds: new three.Vector4().fromArray(snapshot.surfaceBounds),
        plan2SurfaceLayout: new three.Vector2().fromArray(snapshot.layout),
      }),
      restoredSnapshot
    );
  } catch {
    for (const createdTexture of createdTextures) createdTexture.dispose();
    return null;
  }
}
