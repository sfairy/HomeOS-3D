export const RENDER_CACHE_VERSION = "i3d-light-delta-20260916-warm-refine-v6";
export function stableCacheJSON(payload) {
  return JSON.stringify(payload, (_key, rawValue) =>
    rawValue && typeof rawValue == "object" && !Array.isArray(rawValue)
      ? Object.fromEntries(
          Object.keys(rawValue)
            .sort()
            .map((objectKey) => [objectKey, rawValue[objectKey]]),
        )
      : rawValue,
  );
}
export function sha256(text) {
  const messageBytes = new TextEncoder().encode(text),
    byteLength = messageBytes.length,
    paddedBytes = new Uint8Array(Math.ceil((byteLength + 9) / 64) * 64);
  (paddedBytes.set(messageBytes), (paddedBytes[byteLength] = 128));
  const byteView = new DataView(paddedBytes.buffer);
  (byteView.setUint32(paddedBytes.length - 8, Math.floor(byteLength / 536870912)),
    byteView.setUint32(paddedBytes.length - 4, byteLength * 8));
  const primes = [],
    cubeRootConstants = [],
    squareRootConstants = [];
  for (let candidate = 2; primes.length < 64; candidate++)
    primes.some((prime) => candidate % prime === 0) ||
      (primes.push(candidate),
      cubeRootConstants.push(((Math.cbrt(candidate) % 1) * 4294967296) >>> 0),
      squareRootConstants.length < 8 &&
        squareRootConstants.push(((Math.sqrt(candidate) % 1) * 4294967296) >>> 0));
  const rotateRight = (word, shift) => (word >>> shift) | (word << (32 - shift)),
    messageSchedule = new Uint32Array(64),
    hashState = squareRootConstants;
  for (let chunkOffset = 0; chunkOffset < paddedBytes.length; chunkOffset += 64) {
    for (let scheduleIndex = 0; scheduleIndex < 16; scheduleIndex++)
      messageSchedule[scheduleIndex] = byteView.getUint32(chunkOffset + scheduleIndex * 4);
    for (let wordIndex = 16; wordIndex < 64; wordIndex++) {
      const earlierScheduleWord = messageSchedule[wordIndex - 15],
        recentScheduleWord = messageSchedule[wordIndex - 2];
      messageSchedule[wordIndex] =
        messageSchedule[wordIndex - 16] +
        (rotateRight(earlierScheduleWord, 7) ^
          rotateRight(earlierScheduleWord, 18) ^
          (earlierScheduleWord >>> 3)) +
        messageSchedule[wordIndex - 7] +
        (rotateRight(recentScheduleWord, 17) ^
          rotateRight(recentScheduleWord, 19) ^
          (recentScheduleWord >>> 10));
    }
    let [stateA, stateB, stateC, stateD, stateE, stateF, stateG, stateH] = hashState;
    for (let roundIndex = 0; roundIndex < 64; roundIndex++) {
      const roundTermA =
          (stateH +
            (rotateRight(stateE, 6) ^ rotateRight(stateE, 11) ^ rotateRight(stateE, 25)) +
            ((stateE & stateF) ^ (~stateE & stateG)) +
            cubeRootConstants[roundIndex] +
            messageSchedule[roundIndex]) >>>
          0,
        roundTermB =
          ((rotateRight(stateA, 2) ^ rotateRight(stateA, 13) ^ rotateRight(stateA, 22)) +
            ((stateA & stateB) ^ (stateA & stateC) ^ (stateB & stateC))) >>>
          0;
      ((stateH = stateG),
        (stateG = stateF),
        (stateF = stateE),
        (stateE = (stateD + roundTermA) >>> 0),
        (stateD = stateC),
        (stateC = stateB),
        (stateB = stateA),
        (stateA = (roundTermA + roundTermB) >>> 0));
    }
    [stateA, stateB, stateC, stateD, stateE, stateF, stateG, stateH].forEach(
      (stateWord, stateIndex) => {
        hashState[stateIndex] = (hashState[stateIndex] + stateWord) >>> 0;
      },
    );
  }
  return hashState.map((hexWord) => hexWord.toString(16).padStart(8, "0")).join("");
}
export function lightLayerKey(baseKey, layerDescriptor) {
  return sha256(
    stableCacheJSON({
      version: RENDER_CACHE_VERSION,
      base: baseKey,
      lamp: layerDescriptor.item,
      floor: layerDescriptor.floor.id,
    }),
  );
}
export function cacheSceneDescriptor(floors) {
  const omitProperties = (source, omittedKeys) =>
    Object.fromEntries(
      Object.entries(source || {}).filter(([propertyName]) => !omittedKeys.includes(propertyName)),
    );
  return floors.map((floor) => ({
    ...floor,
    name: undefined,
    scene: {
      ...floor.scene,
      settings: omitProperties(floor.scene.settings, [
        "cameraView",
        "cameraMode",
        "cameraFocalLength",
        "cameraTopRotation",
        "fixedCameraView",
        "planViewRotation",
        "livePreviewEnabled",
        "previewPanelRatio",
        "detailsPanelWidthRatio",
      ]),
      lightGroups: floor.scene.lightGroups?.map((lightGroup) =>
        omitProperties(lightGroup, ["enabled", "name"]),
      ),
      items: floor.scene.items.map((sceneItem) =>
        ["downlight", "ceilinglight", "striplight"].includes(sceneItem.type)
          ? omitProperties(sceneItem, ["lightBrightness", "lightTemperature", "lightColorRgb"])
          : sceneItem,
      ),
    },
  }));
}
/** report 回调负载：一次缓存统计快照（全部为数值，便于直接 JSON 上报）。 */
export type RenderCacheReport = {
  memoryHits: number;
  serverHits: number;
  misses: number;
  generated: number;
  uploads: number;
  errors: number;
  decodedHits: number;
  memoryBytes: number;
  pendingBytes: number;
  decodedBytes: number;
  decodedFrames: number;
};

/** createRenderCache 的构造选项。 */
/**
 * 离屏 canvas：缓存解码结果时会在上面挂 close()，
 * 以便提前释放显存（与 ImageBitmap.close 对齐）。
 */
export type CacheCanvas = HTMLCanvasElement & { close?: () => void };

export type RenderCacheOptions = {
  /** 场景 id，参与服务端缓存分桶。 */
  sceneId?: string | null;
  /** 项目 id，缺省时按空串上报。 */
  projectId?: string | null;
  /** 取图函数，默认 globalThis.fetch。 */
  fetcher?: typeof fetch;
  /** 解码函数，默认 createImageBitmap。 */
  decode?: (imageBlob: Blob) => Promise<ImageBitmap>;
  /** 单张服务端缓存图的内存上限。 */
  maxBytes?: number;
  /** 单次请求超时（毫秒）。 */
  timeoutMs?: number;
  /** 时钟，便于测试。 */
  now?: () => number;
  /** 统计回调：每次统计变化都会调用一次。 */
  report?: (report: RenderCacheReport) => void;
  /** 创建离屏 canvas。 */
  makeCanvas?: () => CacheCanvas;
  /** 已解码位图的内存上限。 */
  maxDecodedBytes?: number;
  /** 已解码位图的帧数上限。 */
  maxDecodedFrames?: number;
};

export function createRenderCache({
  sceneId: sceneId,
  projectId: projectId,
  fetcher: fetcher = globalThis.fetch,
  decode: decode = (imageBlob) => createImageBitmap(imageBlob),
  maxBytes: maxBytes = 32 * 1024 * 1024,
  timeoutMs: timeoutMs = 1800,
  now: now = Date.now,
  report: onReport = () => {},
  makeCanvas: makeCanvas = () => document.createElement("canvas"),
  maxDecodedBytes: maxDecodedBytes = 32 * 1024 * 1024,
  maxDecodedFrames: maxDecodedFrames = 3,
}: RenderCacheOptions = {}) {
  const encodedBlobsByKey = new Map(),
    abortControllerSet = new Set<AbortController>(),
    pendingUploadsByKey = new Map(),
    decodedRecordsByKey = new Map(),
    inFlightReadsByKey = new Map();
  let decodedBytes = 0,
    memoryBytes = 0,
    pendingBytes = 0,
    isUploading = false,
    isClosed = false,
    errorCooldownUntil = 0;
  const stats = {
      memoryHits: 0,
      serverHits: 0,
      misses: 0,
      generated: 0,
      uploads: 0,
      errors: 0,
      decodedHits: 0,
    },
    emitStats = () =>
      onReport({
        ...stats,
        memoryBytes: memoryBytes,
        pendingBytes: pendingBytes,
        decodedBytes: decodedBytes,
        decodedFrames: decodedRecordsByKey.size,
      });
  function releaseEntry(leaseRecord) {
    (leaseRecord.refs--,
      !leaseRecord.retained && leaseRecord.refs === 0 && leaseRecord.image.close());
  }
  function evictDecodedEntry(evictedKey) {
    const cachedRecord = decodedRecordsByKey.get(evictedKey);
    cachedRecord &&
      (decodedRecordsByKey.delete(evictedKey),
      (decodedBytes -= cachedRecord.bytes),
      (cachedRecord.retained = false),
      cachedRecord.refs || cachedRecord.image.close());
  }
  function storeDecodedImage(cacheKey, sourceImage, imageWidth, imageHeight) {
    evictDecodedEntry(cacheKey);
    const newRecord = {
      image: sourceImage,
      width: imageWidth,
      height: imageHeight,
      bytes: imageWidth * imageHeight * 4,
      refs: 1,
      retained: true,
    };
    for (
      decodedRecordsByKey.set(cacheKey, newRecord), decodedBytes += newRecord.bytes;
      decodedBytes > maxDecodedBytes || decodedRecordsByKey.size > maxDecodedFrames;
    )
      evictDecodedEntry(decodedRecordsByKey.keys().next().value);
    return newRecord;
  }
  function createDecodedLease(record) {
    record.refs++;
    let isReleased = false;
    return {
      image: record.image,
      width: record.width,
      height: record.height,
      close() {
        isReleased || ((isReleased = true), releaseEntry(record));
      },
    };
  }
  const buildTileUrl = (tileKey) =>
    "/api/v1/modules/interaction3d/scenes/" +
    encodeURIComponent(sceneId) +
    "/render-cache/" +
    tileKey +
    "?projectId=" +
    encodeURIComponent(projectId || "");
  function cacheBlob(blobKey, blobValue) {
    for (
      encodedBlobsByKey.has(blobKey) && (memoryBytes -= encodedBlobsByKey.get(blobKey).size),
        encodedBlobsByKey.delete(blobKey),
        blobValue.size <= maxBytes &&
          (encodedBlobsByKey.set(blobKey, blobValue), (memoryBytes += blobValue.size));
      memoryBytes > maxBytes || encodedBlobsByKey.size > 64;
    ) {
      const oldestKey = encodedBlobsByKey.keys().next().value;
      ((memoryBytes -= encodedBlobsByKey.get(oldestKey).size), encodedBlobsByKey.delete(oldestKey));
    }
  }
  async function requestBlob(
    requestKey: string,
    requestOptions: RequestInit = {},
    isRequestWanted: () => boolean = () => true,
  ) {
    if (isClosed || now() < errorCooldownUntil) return null;
    const requestAbortController = new AbortController();
    abortControllerSet.add(requestAbortController);
    const timeoutId = setTimeout(() => requestAbortController.abort(), timeoutMs),
      stalePollId = requestOptions.method
        ? null
        : setInterval(() => {
            isRequestWanted() || requestAbortController.abort("stale");
          }, 50);
    try {
      const response = await fetcher(buildTileUrl(requestKey), {
          ...requestOptions,
          credentials: "same-origin",
          signal: requestAbortController.signal,
        }),
        isBinaryMiss =
          !requestOptions.method &&
          response.status === 404 &&
          !response.headers?.get("content-type")?.includes("application/json");
      if (!response.ok && !isBinaryMiss) throw new Error("cache unavailable");
      return !requestOptions.method && (response.status === 204 || isBinaryMiss)
        ? null
        : requestOptions.method
          ? response
          : response.ok
            ? await response.blob()
            : null;
    } catch {
      return (
        !isClosed && isRequestWanted() && (stats.errors++, (errorCooldownUntil = now() + 15000)),
        null
      );
    } finally {
      (clearTimeout(timeoutId),
        clearInterval(stalePollId),
        abortControllerSet.delete(requestAbortController));
    }
  }
  async function flushPendingUploads() {
    if (!(isUploading || isClosed)) {
      isUploading = true;
      try {
        for (; pendingUploadsByKey.size && !isClosed;) {
          const [uploadKey, uploadBlob] = pendingUploadsByKey.entries().next().value;
          (pendingUploadsByKey.delete(uploadKey),
            (pendingBytes -= uploadBlob.size),
            ((await requestBlob(uploadKey, {
              method: "PUT",
              headers: {
                "Content-Type": "image/png",
              },
              body: uploadBlob,
            })) as Response | null)?.ok && stats.uploads++,
            emitStats());
        }
      } finally {
        isUploading = false;
      }
    }
  }
  const createTilePlan = (tileHash, tileWidth, tileHeight) => {
      const tiles = [];
      for (let offsetY = 0; offsetY < tileHeight; offsetY += 1024)
        for (let offsetX = 0; offsetX < tileWidth; offsetX += 1024)
          tiles.push({
            x: offsetX,
            y: offsetY,
            width: Math.min(1024, tileWidth - offsetX),
            height: Math.min(1024, tileHeight - offsetY),
            key: sha256(
              tileHash + ":tile-v1:" + tileWidth + ":" + tileHeight + ":" + offsetX + ":" + offsetY,
            ),
          });
      return tiles;
    },
    cache = {
      stats: stats,
      get closed() {
        return isClosed;
      },
      async acquire(acquireKey, acquireWidth, acquireHeight, isAcquireWanted = () => true) {
        if (isClosed || !acquireKey || !isAcquireWanted()) return null;
        const acquireRecordKey = acquireKey + ":" + acquireWidth + ":" + acquireHeight,
          existingRecord = decodedRecordsByKey.get(acquireRecordKey);
        if (existingRecord)
          return (
            decodedRecordsByKey.delete(acquireRecordKey),
            decodedRecordsByKey.set(acquireRecordKey, existingRecord),
            stats.decodedHits++,
            emitStats(),
            createDecodedLease(existingRecord)
          );
        let inFlightEntry = inFlightReadsByKey.get(acquireRecordKey);
        inFlightEntry ||
          ((inFlightEntry = {
            waiters: new Set(),
            entry: null,
          }),
          inFlightReadsByKey.set(acquireRecordKey, inFlightEntry));
        const isStillWanted = () => !isClosed && isAcquireWanted();
        (inFlightEntry.waiters.add(isStillWanted),
          inFlightEntry.promise ||
            (inFlightEntry.promise = cache
              .read(acquireKey, acquireWidth, acquireHeight, () =>
                [...inFlightEntry.waiters].some((waiterCheck) => waiterCheck()),
              )
              .then((fetchedRecord) =>
                fetchedRecord
                  ? isClosed ||
                    ![...inFlightEntry.waiters].some((pendingWaiterCheck) => pendingWaiterCheck())
                    ? (fetchedRecord.close(), null)
                    : ((inFlightEntry.entry = storeDecodedImage(
                        acquireRecordKey,
                        fetchedRecord,
                        acquireWidth,
                        acquireHeight,
                      )),
                      emitStats(),
                      inFlightEntry.entry)
                  : null,
              )));
        try {
          const sharedRecord = await inFlightEntry.promise;
          return sharedRecord && isStillWanted() ? createDecodedLease(sharedRecord) : null;
        } finally {
          (inFlightEntry.waiters.delete(isStillWanted),
            inFlightEntry.waiters.size ||
              (inFlightReadsByKey.delete(acquireRecordKey),
              inFlightEntry.entry && releaseEntry(inFlightEntry.entry)));
        }
      },
      async read(readKey, readWidth, readHeight, isReadWanted = () => true) {
        if (isClosed || !readKey || !isReadWanted()) return null;
        if (readWidth * readHeight > 2097152) {
          const canvasElement = makeCanvas();
          ((canvasElement.width = readWidth), (canvasElement.height = readHeight));
          let isComplete = false;
          try {
            const readPainter = canvasElement.getContext("2d");
            if (!readPainter) return null;
            for (const sourceTile of createTilePlan(readKey, readWidth, readHeight)) {
              const tileImage = await cache.read(
                sourceTile.key,
                sourceTile.width,
                sourceTile.height,
                isReadWanted,
              );
              if (!tileImage) return null;
              try {
                if (isClosed || !isReadWanted()) return null;
                readPainter.drawImage(tileImage, sourceTile.x, sourceTile.y);
              } finally {
                tileImage.close();
              }
            }
            return (
              (canvasElement.close = () => {
                canvasElement.width = canvasElement.height = 0;
              }),
              (isComplete = true),
              canvasElement
            );
          } finally {
            isComplete || (canvasElement.width = canvasElement.height = 0);
          }
        }
        let cachedBlob = encodedBlobsByKey.get(readKey),
          statsKey = cachedBlob ? "memoryHits" : "serverHits";
        if (
          (cachedBlob || (cachedBlob = await requestBlob(readKey, {}, isReadWanted)),
          isClosed || !isReadWanted())
        )
          return null;
        if (!cachedBlob || cachedBlob.size > 10 * 1024 * 1024 || cachedBlob.type !== "image/png")
          return (stats.misses++, emitStats(), null);
        let decodedImage;
        try {
          if (
            ((decodedImage = await decode(cachedBlob)),
            isClosed ||
              !isReadWanted() ||
              decodedImage.width !== readWidth ||
              decodedImage.height !== readHeight)
          )
            throw new Error("stale image");
          return (cacheBlob(readKey, cachedBlob), stats[statsKey]++, emitStats(), decodedImage);
        } catch {
          return (
            decodedImage?.close?.(),
            encodedBlobsByKey.has(readKey) &&
              ((memoryBytes -= encodedBlobsByKey.get(readKey).size),
              encodedBlobsByKey.delete(readKey)),
            stats.misses++,
            emitStats(),
            null
          );
        }
      },
      async write(writeKey, writeImage, isWriteWanted = () => true) {
        if (isClosed || !writeKey || !isWriteWanted()) return;
        if (writeImage.width * writeImage.height > 2097152) {
          const tileCanvas = makeCanvas();
          try {
            for (const tile of createTilePlan(writeKey, writeImage.width, writeImage.height)) {
              if (isClosed || !isWriteWanted()) return;
              ((tileCanvas.width = tile.width), (tileCanvas.height = tile.height));
              const tilePainter = tileCanvas.getContext("2d");
              if (!tilePainter) return;
              (tilePainter.drawImage(
                writeImage,
                tile.x,
                tile.y,
                tile.width,
                tile.height,
                0,
                0,
                tile.width,
                tile.height,
              ),
                await cache.write(tile.key, tileCanvas, isWriteWanted));
            }
          } finally {
            tileCanvas.width = tileCanvas.height = 0;
          }
          return;
        }
        let blob;
        try {
          blob = await new Promise((resolveBlob) => writeImage.toBlob(resolveBlob, "image/png"));
        } catch {
          (stats.errors++, emitStats());
          return;
        }
        isClosed ||
          !isWriteWanted() ||
          !blob ||
          blob.size > 10 * 1024 * 1024 ||
          (cacheBlob(writeKey, blob),
          stats.generated++,
          pendingBytes + blob.size <= 16 * 1024 * 1024 &&
            pendingUploadsByKey.size < 32 &&
            now() >= errorCooldownUntil &&
            !pendingUploadsByKey.has(writeKey) &&
            (pendingUploadsByKey.set(writeKey, blob),
            (pendingBytes += blob.size),
            flushPendingUploads()),
          emitStats());
      },
      close() {
        isClosed = true;
        for (const pendingController of abortControllerSet) pendingController.abort();
        for (const decodedKey of decodedRecordsByKey.keys()) evictDecodedEntry(decodedKey);
        (encodedBlobsByKey.clear(),
          pendingUploadsByKey.clear(),
          (memoryBytes = pendingBytes = 0),
          emitStats());
      },
    };
  return cache;
}
