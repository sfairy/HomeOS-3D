/**
 * 3D 渲染结果的磁盘 / 内存缓存层：按「灯光增量」分层缓存，命中即免一次服务端渲染，
 */
// 版本戳：改渲染口径（光照计算、分块策略等）时自增，用作所有 key 的一部分。
export const RENDER_CACHE_VERSION = "i3d-light-delta-20260923-three-r186-v9";
/**
 * 生成「键序无关」的 JSON 文本。
 */
export function stableCacheJSON(payload) {
  return JSON.stringify(payload, (key, rawValue) =>
    rawValue && typeof rawValue == "object" && !Array.isArray(rawValue)
      ? Object.fromEntries(
          Object.keys(rawValue)
            .sort()
            .map(objectKey => [objectKey, rawValue[objectKey]])
        )
      : rawValue
  );
}
/**
 * 同步实现的 SHA-256。
 */
export function sha256(text) {
  const messageBytes = new TextEncoder().encode(text);
  const byteLength = messageBytes.length;
  // 补位：0x80 + 若干 0，最后 8 字节放比特长度，因此总长向上取整到 64 字节。
  const paddedBytes = new Uint8Array(Math.ceil((byteLength + 9) / 64) * 64);
  paddedBytes.set(messageBytes);
  paddedBytes[byteLength] = 128;
  const dataView = new DataView(paddedBytes.buffer);
  // 长度用两个 32 位字表示：高位是 length / 2^29（即除以 536870912）。
  dataView.setUint32(paddedBytes.length - 8, Math.floor(byteLength / 536870912));
  dataView.setUint32(paddedBytes.length - 4, byteLength * 8);
  // 按标准生成 64 个轮常量（立方根）与 8 个初始向量（平方根）。
  const primes = [];
  const cubeRootConstants = [];
  const squareRootConstants = [];
  for (let candidate = 2; primes.length < 64; candidate++) {
    if (!primes.some(prime => candidate % prime === 0)) {
      primes.push(candidate);
      cubeRootConstants.push(((Math.cbrt(candidate) % 1) * 4294967296) >>> 0);
      if (squareRootConstants.length < 8) {
        squareRootConstants.push(((Math.sqrt(candidate) % 1) * 4294967296) >>> 0);
      }
    }
  }
  const rotateRight = (word, shift) => (word >>> shift) | (word << (32 - shift));
  const messageSchedule = new Uint32Array(64);
  const hashState = squareRootConstants;
  for (let chunkOffset = 0; chunkOffset < paddedBytes.length; chunkOffset += 64) {
    // 前 16 个字直接取原文，其余 48 个用标准递推式扩展。
    for (let scheduleIndex = 0; scheduleIndex < 16; scheduleIndex++) {
      messageSchedule[scheduleIndex] = dataView.getUint32(chunkOffset + scheduleIndex * 4);
    }
    for (let wordIndex = 16; wordIndex < 64; wordIndex++) {
      const word15 = messageSchedule[wordIndex - 15];
      const word2 = messageSchedule[wordIndex - 2];
      messageSchedule[wordIndex] =
        messageSchedule[wordIndex - 16] +
        (rotateRight(word15, 7) ^ rotateRight(word15, 18) ^ (word15 >>> 3)) +
        messageSchedule[wordIndex - 7] +
        (rotateRight(word2, 17) ^ rotateRight(word2, 19) ^ (word2 >>> 10));
    }
    let [stateA, stateB, stateC, stateD, stateE, stateF, stateG, stateH] = hashState;
    // 64 轮压缩函数：temp1 是「Σ1 + Ch + K + W」，temp2 是「Σ0 + Maj」。
    for (let roundIndex = 0; roundIndex < 64; roundIndex++) {
      const temp1 =
        (stateH +
          (rotateRight(stateE, 6) ^ rotateRight(stateE, 11) ^ rotateRight(stateE, 25)) +
          ((stateE & stateF) ^ (~stateE & stateG)) +
          cubeRootConstants[roundIndex] +
          messageSchedule[roundIndex]) >>>
        0;
      const temp2 =
        ((rotateRight(stateA, 2) ^ rotateRight(stateA, 13) ^ rotateRight(stateA, 22)) +
          ((stateA & stateB) ^ (stateA & stateC) ^ (stateB & stateC))) >>>
        0;
      stateH = stateG;
      stateG = stateF;
      stateF = stateE;
      stateE = (stateD + temp1) >>> 0;
      stateD = stateC;
      stateC = stateB;
      stateB = stateA;
      stateA = (temp1 + temp2) >>> 0;
    }
    // 每块算完后把结果累加回全局状态（>>> 0 保证保持 32 位无符号）。
    [stateA, stateB, stateC, stateD, stateE, stateF, stateG, stateH].forEach(
      (stateWord, stateIndex) => {
        hashState[stateIndex] = (hashState[stateIndex] + stateWord) >>> 0;
      }
    );
  }
  return hashState.map(hexWord => hexWord.toString(16).padStart(8, "0")).join("");
}
/**
 * 生成用于计算基础 key 的场景描述。
 */
export function cacheSceneDescriptor(floors) {
  // 按名单剔除字段：只保留「会影响基础画面像素」的部分，供上层组合出稳定 key。
  const omitProperties = (source, omittedKeys) =>
    Object.fromEntries(
      Object.entries(source || {}).filter(([propertyName]) => !omittedKeys.includes(propertyName))
    );
  return floors.map(floor => ({
    // name 置 undefined 而不是删除：保持对象形状一致，让 stableCacheJSON 结果更稳定。
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
        "detailsPanelWidthRatio"
      ]),
      lightGroups: floor.scene.lightGroups?.map(lightGroup =>
        omitProperties(lightGroup, ["enabled", "name"])
      ),
      items: floor.scene.items.map(sceneItem =>
        ["downlight", "ceilinglight", "striplight"].includes(sceneItem.type)
          ? omitProperties(sceneItem, ["lightBrightness", "lightTemperature"])
          : sceneItem
      )
    }
  }));
}
export function createRenderCache({
  sceneId: sceneId,
  projectId: projectId,
  fetcher: fetcher = globalThis.fetch,
  decode: decode = imageBlob => createImageBitmap(imageBlob),
  maxBytes: maxBytes = 33554432,
  timeoutMs: timeoutMs = 1800,
  now: now = Date.now,
  report: onReport = () => {},
  makeCanvas: makeCanvas = () => document.createElement("canvas"),
  maxDecodedBytes: maxDecodedBytes = 33554432,
  maxDecodedFrames: maxDecodedFrames = 3
} = {}) {
  const encodedBlobsByKey = new Map();
  const abortControllers = new Set();
  const pendingUploadsByKey = new Map();
  const decodedRecordsByKey = new Map();
  // 同一个 key 的并发读取合并表：waiters 记录调用方的「还需要吗」判定，
  const inFlightReadsByKey = new Map();
  let decodedBytes = 0;
  let memoryBytes = 0;
  let pendingBytes = 0;
  let isUploading = false;
  let isClosed = false;
  // 出错后的冷却截止时间：后端故障时若不断重试，会把本该用于渲染的带宽全耗在重试上。
  let errorCooldownUntil = 0;
  const stats = {
    memoryHits: 0,
    serverHits: 0,
    misses: 0,
    generated: 0,
    uploads: 0,
    errors: 0,
    decodedHits: 0
  };
  // 统计随用随报：解码 / 命中 / 上传等每个关键节点都会触发一次，供性能面板实时展示。
  const emitStats = () =>
    onReport({
      ...stats,
      memoryBytes: memoryBytes,
      pendingBytes: pendingBytes,
      decodedBytes: decodedBytes,
      decodedFrames: decodedRecordsByKey.size
    });
  // 归还一份引用；只有「不再被缓存持有」且「所有租约都已归还」时才真正 close。
  function releaseEntry(leaseRecord) {
    leaseRecord.refs--;
    if (!leaseRecord.retained && leaseRecord.refs === 0) {
      leaseRecord.image.close();
    }
  }
  // 淘汰一帧解码缓存：先摘出账，再按是否有活跃租约决定是否 close。
  function evictDecodedEntry(evictedKey) {
    const cachedRecord = decodedRecordsByKey.get(evictedKey);
    if (cachedRecord) {
      decodedRecordsByKey.delete(evictedKey);
      decodedBytes -= cachedRecord.bytes;
      cachedRecord.retained = false;
      if (!cachedRecord.refs) {
        cachedRecord.image.close();
      }
    }
  }
  // 存入新解码的位图并立即执行容量淘汰。
  function storeDecodedImage(cacheKey, sourceImage, imageWidth, imageHeight) {
    evictDecodedEntry(cacheKey);
    const newRecord = {
      image: sourceImage,
      width: imageWidth,
      height: imageHeight,
      bytes: imageWidth * imageHeight * 4,
      refs: 1,
      retained: true
    };
    decodedRecordsByKey.set(cacheKey, newRecord);
    decodedBytes += newRecord.bytes;
    while (decodedBytes > maxDecodedBytes || decodedRecordsByKey.size > maxDecodedFrames) {
      evictDecodedEntry(decodedRecordsByKey.keys().next().value);
    }
    return newRecord;
  }
  // 为调用方创建一份租约：调用方必须在用完后 close()，
  function createDecodedLease(record) {
    record.refs++;
    let isReleased = false;
    return {
      image: record.image,
      width: record.width,
      height: record.height,
      close() {
        if (!isReleased) {
          isReleased = true;
          releaseEntry(record);
        }
      }
    };
  }
  // 分块 URL 的拼装口径与服务端路由约定死；tileKey 已经过 sha256，无需再转义。
  const buildTileUrl = tileKey =>
    "/api/v1/modules/interaction3d/scenes/" +
    encodeURIComponent(sceneId) +
    "/render-cache/" +
    tileKey +
    "?projectId=" +
    encodeURIComponent(projectId || "");
  // 写入编码缓存（重写同一 key 时先扣掉旧账），随后按「字节上限 + 64 条」两个维度做 LRU 淘汰。
  function cacheBlob(blobKey, blobValue) {
    if (encodedBlobsByKey.has(blobKey)) {
      memoryBytes -= encodedBlobsByKey.get(blobKey).size;
    }
    encodedBlobsByKey.delete(blobKey);
    if (blobValue.size <= maxBytes) {
      encodedBlobsByKey.set(blobKey, blobValue);
      memoryBytes += blobValue.size;
    }
    while (memoryBytes > maxBytes || encodedBlobsByKey.size > 64) {
      const oldestKey = encodedBlobsByKey.keys().next().value;
      memoryBytes -= encodedBlobsByKey.get(oldestKey).size;
      encodedBlobsByKey.delete(oldestKey);
    }
  }
  /**
   * 发起一次缓存请求（GET 下载 / PUT 回写共用）。
   */
  async function requestBlob(requestKey, requestOptions = {}, isRequestWanted = () => true) {
    // 关闭中或处于错误冷却期时直接放弃，不产生任何请求。
    if (isClosed || now() < errorCooldownUntil) {
      return null;
    }
    const requestAbortController = new AbortController();
    abortControllers.add(requestAbortController);
    // 单次请求硬超时：后端渲染偶发卡顿时不能让调用方一直等。
    const timeoutId = setTimeout(() => requestAbortController.abort(), timeoutMs);
    // 读请求还要额外轮询「调用方是否仍然需要」：画面已经切走时立刻中断下载，省流量也省后端算力。
    const stalePollId = requestOptions.method
      ? null
      : setInterval(() => {
          if (!isRequestWanted()) {
            requestAbortController.abort("stale");
          }
        }, 50);
    try {
      const response = await fetcher(buildTileUrl(requestKey), {
        ...requestOptions,
        credentials: "same-origin",
        signal: requestAbortController.signal
      });
      // 404 且不是 JSON，说明「服务端还没生成这张缓存」，属于正常的未命中而不是故障。
      const isBinaryMiss =
        !requestOptions.method &&
        response.status === 404 &&
        !response.headers?.get("content-type")?.includes("application/json");
      if (!response.ok && !isBinaryMiss) {
        throw new Error("cache unavailable");
      }
      // 204 与服务端未生成：明确没有缓存，返回 null 让上层走「需要渲染」的分支。
      if (!requestOptions.method && (response.status === 204 || isBinaryMiss)) {
        return null;
      } else if (requestOptions.method) {
        return response;
      } else if (response.ok) {
        return await response.blob();
      } else {
        return null;
      }
    } catch {
      // 只有「调用方仍然需要」的失败才计入错误并进入冷却；
      if (!isClosed && isRequestWanted()) {
        stats.errors++;
        errorCooldownUntil = now() + 15000;
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
      clearInterval(stalePollId);
      abortControllers.delete(requestAbortController);
    }
  }
  // 串行回写本地新生成的缓存：一次只 PUT 一张，且每次都重取队首 —— 上传过程中可能又有新图入队。
  async function flushPendingUploads() {
    if (!isUploading && !isClosed) {
      isUploading = true;
      try {
        while (pendingUploadsByKey.size && !isClosed) {
          const [uploadKey, uploadBlob] = pendingUploadsByKey.entries().next().value;
          pendingUploadsByKey.delete(uploadKey);
          // 出队即先减账：无论上传成功与否，这张图都不再占用待传配额。
          pendingBytes -= uploadBlob.size;
          // PUT 失败不计入错误：回写只影响下次的命中率，不该打断当前渲染或触发冷却。
          if (
            (
              await requestBlob(uploadKey, {
                method: "PUT",
                headers: {
                  "Content-Type": "image/png"
                },
                body: uploadBlob
              })
            )?.ok
          ) {
            stats.uploads++;
          }
          emitStats();
        }
      } finally {
        isUploading = false;
      }
    }
  }
  // 把超过阈值的大图切成 1024 × 1024 的分块：单张巨图会让服务端与浏览器同时出现内存峰值，
  const createTilePlan = (tileHash, tileWidth, tileHeight) => {
    const tiles = [];
    for (let offsetY = 0; offsetY < tileHeight; offsetY += 1024) {
      for (let offsetX = 0; offsetX < tileWidth; offsetX += 1024) {
        tiles.push({
          x: offsetX,
          y: offsetY,
          width: Math.min(1024, tileWidth - offsetX),
          height: Math.min(1024, tileHeight - offsetY),
          key: sha256(
            tileHash + ":tile-v1:" + tileWidth + ":" + tileHeight + ":" + offsetX + ":" + offsetY
          )
        });
      }
    }
    return tiles;
  };
  const cache = {
    stats: stats,
    get closed() {
      return isClosed;
    },
    /**
     * 取一张已解码的位图，返回带引用计数的租约。
     */
    async acquire(acquireKey, acquireWidth, acquireHeight, isAcquireWanted = () => true) {
      // 关闭、无 key、调用方已不需要：三种情况都直接不做事。
      if (isClosed || !acquireKey || !isAcquireWanted()) {
        return null;
      }
      // 解码缓存按「key + 目标尺寸」索引：同一张图在不同尺寸下是两份独立位图。
      const acquireRecordKey = acquireKey + ":" + acquireWidth + ":" + acquireHeight;
      const existingRecord = decodedRecordsByKey.get(acquireRecordKey);
      if (existingRecord) {
        // 命中后把记录移到 Map 末尾（LRU 热端）：淘汰按插入顺序从头部开始，越靠后越安全。
        decodedRecordsByKey.delete(acquireRecordKey);
        decodedRecordsByKey.set(acquireRecordKey, existingRecord);
        stats.decodedHits++;
        emitStats();
        return createDecodedLease(existingRecord);
      }
      // 合并同一 key 的并发读取：多个调用方共享一次下载 / 解码。
      let inFlightEntry = inFlightReadsByKey.get(acquireRecordKey);
      if (!inFlightEntry) {
        inFlightEntry = {
          waiters: new Set(),
          entry: null
        };
        inFlightReadsByKey.set(acquireRecordKey, inFlightEntry);
      }
      // 本调用方的需求判定：一旦缓存关闭或调用方改了口径，就不再认领共享结果。
      const isStillWanted = () => !isClosed && isAcquireWanted();
      inFlightEntry.waiters.add(isStillWanted);
      // 共享的读取 promise：所有等待者都放弃时结果会被丢弃，不会白占一份解码内存。
      inFlightEntry.promise ||= cache
        .read(acquireKey, acquireWidth, acquireHeight, () =>
          [...inFlightEntry.waiters].some(waiterCheck => waiterCheck())
        )
        .then(fetchedRecord =>
          fetchedRecord
            ? isClosed ||
              ![...inFlightEntry.waiters].some(pendingWaiterCheck => pendingWaiterCheck())
              ? (fetchedRecord.close(), null)
              : ((inFlightEntry.entry = storeDecodedImage(
                  acquireRecordKey,
                  fetchedRecord,
                  acquireWidth,
                  acquireHeight
                )),
                emitStats(),
                inFlightEntry.entry)
            : null
        );
      try {
        // 等共享结果；期间若本调用方已不再需要（换了场景 / 换了尺寸），就不能把结果交回去。
        const sharedRecord = await inFlightEntry.promise;
        if (sharedRecord && isStillWanted()) {
          return createDecodedLease(sharedRecord);
        } else {
          return null;
        }
      } finally {
        inFlightEntry.waiters.delete(isStillWanted);
        // 最后一个等待者离开时删表并归还「缓存持有的那一份引用」：
        if (!inFlightEntry.waiters.size) {
          inFlightReadsByKey.delete(acquireRecordKey);
          if (inFlightEntry.entry) {
            releaseEntry(inFlightEntry.entry);
          }
        }
      }
    },
    /**
     * 读取一张缓存图并解码成位图（不进入解码缓存，供 acquire 与本模块内部使用）。
     */
    async read(readKey, readWidth, readHeight, isReadWanted = () => true) {
      if (isClosed || !readKey || !isReadWanted()) {
        return null;
      }
      if (readWidth * readHeight > 2097152) {
        const canvasElement = makeCanvas();
        canvasElement.width = readWidth;
        canvasElement.height = readHeight;
        let isComplete = false;
        try {
          const readContext = canvasElement.getContext("2d");
          if (!readContext) {
            return null;
          }
          for (const sourceTile of createTilePlan(readKey, readWidth, readHeight)) {
            // 递归读取分块：单块尺寸都小于阈值，因此走的是下面的直接请求分支。
            const tileImage = await cache.read(
              sourceTile.key,
              sourceTile.width,
              sourceTile.height,
              isReadWanted
            );
            if (!tileImage) {
              return null;
            }
            try {
              if (isClosed || !isReadWanted()) {
                return null;
              }
              readContext.drawImage(tileImage, sourceTile.x, sourceTile.y);
            } finally {
              tileImage.close();
            }
          }
          // 拼装结果伪装成 ImageBitmap：调用方统一用 close() 释放，
          canvasElement.close = () => {
            canvasElement.width = canvasElement.height = 0;
          };
          isComplete = true;
          return canvasElement;
        } finally {
          if (!isComplete) {
            canvasElement.width = canvasElement.height = 0;
          }
        }
      }
      // 先查内存缓存；命中与需要走网络的统计分开记，便于评估缓存命中率。
      let cachedBlob = encodedBlobsByKey.get(readKey);
      let statsKey = cachedBlob ? "memoryHits" : "serverHits";
      cachedBlob ||= await requestBlob(readKey, {}, isReadWanted);
      if (isClosed || !isReadWanted()) {
        return null;
      }
      // 超过 10MB 或类型不是 PNG 一律视为未命中：超大图解码会长时间占用主线程；
      if (!cachedBlob || cachedBlob.size > 10485760 || cachedBlob.type !== "image/png") {
        stats.misses++;
        emitStats();
        return null;
      }
      let decodedImage;
      // 解码后必须复核尺寸：解码期间场景可能已经切换，尺寸不符说明这是过期结果，宁可丢弃。
      try {
        decodedImage = await decode(cachedBlob);
        if (
          isClosed ||
          !isReadWanted() ||
          decodedImage.width !== readWidth ||
          decodedImage.height !== readHeight
        ) {
          throw new Error("stale image");
        }
        // 确认可用之后才写入内存缓存：不把过期 / 坏数据留在缓存里。
        cacheBlob(readKey, cachedBlob);
        stats[statsKey]++;
        emitStats();
        return decodedImage;
      } catch {
        // 解码失败或尺寸不符：释放半成品位图，并把可能已写入的编码缓存清掉，
        decodedImage?.close?.();
        if (encodedBlobsByKey.has(readKey)) {
          memoryBytes -= encodedBlobsByKey.get(readKey).size;
          encodedBlobsByKey.delete(readKey);
        }
        stats.misses++;
        emitStats();
        return null;
      }
    },
    /**
     * 写回一张渲染结果：先存内存，再后台排队上传到服务端。
     */
    async write(writeKey, writeImage, isWriteWanted = () => true) {
      if (isClosed || !writeKey || !isWriteWanted()) {
        return;
      }
      if (writeImage.width * writeImage.height > 2097152) {
        const tileCanvas = makeCanvas();
        try {
          for (const tile of createTilePlan(writeKey, writeImage.width, writeImage.height)) {
            if (isClosed || !isWriteWanted()) {
              return;
            }
            tileCanvas.width = tile.width;
            tileCanvas.height = tile.height;
            const tileContext = tileCanvas.getContext("2d");
            if (!tileContext) {
              return;
            }
            tileContext.drawImage(
              writeImage,
              tile.x,
              tile.y,
              tile.width,
              tile.height,
              0,
              0,
              tile.width,
              tile.height
            );
            // 递归写回每个分块；tileCanvas 被复用，因此每轮都要重设尺寸。
            await cache.write(tile.key, tileCanvas, isWriteWanted);
          }
        } finally {
          tileCanvas.width = tileCanvas.height = 0;
        }
        return;
      }
      let blob;
      // toBlob 是异步的（编码可能发生在别的线程），因此包成 Promise 等待。
      try {
        blob = await new Promise(resolveBlob => writeImage.toBlob(resolveBlob, "image/png"));
      } catch {
        stats.errors++;
        emitStats();
        return;
      }
      if (!isClosed && !!isWriteWanted() && !!blob && !(blob.size > 10485760)) {
        cacheBlob(writeKey, blob);
        stats.generated++;
        // 入队条件（待传总量 <= 16MB、队列 <= 32 条、不在错误冷却期、同 key 未排队）：
        if (
          pendingBytes + blob.size <= 16777216 &&
          pendingUploadsByKey.size < 32 &&
          now() >= errorCooldownUntil &&
          !pendingUploadsByKey.has(writeKey)
        ) {
          pendingUploadsByKey.set(writeKey, blob);
          pendingBytes += blob.size;
          flushPendingUploads();
        }
        emitStats();
      }
    },
    close() {
      isClosed = true;
      for (const pendingController of abortControllers) {
        pendingController.abort();
      }
      for (const decodedKey of decodedRecordsByKey.keys()) {
        evictDecodedEntry(decodedKey);
      }
      encodedBlobsByKey.clear();
      pendingUploadsByKey.clear();
      memoryBytes = pendingBytes = 0;
      emitStats();
    }
  };
  return cache;
}
