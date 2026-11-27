import { shellConfirm } from '@/studio/platform/shell-chrome'
import { withCsrf } from '@/kernel/http/index'
import { withoutModelRemarks } from '../shared/model-remarks'

/**
 * 按需驱动的渲染帧循环（0.8.2 `frame-loop`，0.8.4 增加截止时间对齐与休眠）。
 *
 * 与 0.8.2 的差别（0.8.4）：
 * - `alignDeadlines`：把下一帧的定时器对齐到「本次推进间隔 - 一帧」的误差带上，
 *   短间隔（≤100ms）时额外留 1ms 余量，避免 setTimeout 抖动导致的跳帧；
 * - `sleep()`：页面不可见时彻底停摆（不清 `pending` 语义之外的唤醒），`setAvailable(true)` 再唤醒；
 * - `stats` / `pending` 保持不变。
 */

const EARLY_FRAME_TOLERANCE_MS = 1.5
const DEADLINE_WINDOW_LIMIT_MS = 100
const DEADLINE_FRAME_SLACK_MS = 1000 / 60
/** 调用方显式传入的上限（高刷屏 A/B 用）；默认仍是 60。 */
const MAX_FPS_LIMIT = 240

export function createDemandFrameLoop({
  step: step,
  onWake: onWake = () => {},
  now: now = () => performance.now(),
  maxFps: maxFps = 60,
  alignDeadlines: alignDeadlines = false,
  requestFrame: requestFrame = (onAnimationFrame: any) => requestAnimationFrame(onAnimationFrame),
  cancelFrame: cancelFrame = (animationFrameHandle: any) => cancelAnimationFrame(animationFrameHandle),
  schedule: schedule = (onTimeout: any, timeoutDelayMs: any) => setTimeout(onTimeout, timeoutDelayMs),
  cancel: cancel = (timeoutHandle: any) => clearTimeout(timeoutHandle),
}: any) {
  let animationFrameId: any = null,
    timeoutId: any = null,
    isAvailable = true,
    isDisposed = false,
    isStepping = false,
    hasPendingWake = false,
    isParked = false,
    nextFrameTimeMs = -Infinity,
    deadlineTargetMs = -Infinity,
    deadlineWindowMs = 0
  const frameIntervalMs =
      maxFps === Infinity ? 0 : 1000 / (Number.isFinite(maxFps) && maxFps > 0 ? Math.min(maxFps, MAX_FPS_LIMIT) : 60),
    frameStats = {
      frames: 0,
      deadlines: 0,
    }
  function clearPendingHandles() {
    animationFrameId !== null && cancelFrame(animationFrameId),
      timeoutId !== null && cancel(timeoutId),
      (animationFrameId = timeoutId = null),
      (deadlineTargetMs = -Infinity)
  }
  /** 只请求下一帧（不清定时器）：截止时间对齐分支里由定时器回调进来。 */
  function requestNextFrame() {
    animationFrameId === null && (onWake(), (animationFrameId = requestFrame(tickFrameLoop)))
  }
  function wakeLoop() {
    if (isDisposed || !isAvailable) return
    // 上一次 `sleep()` 之后再 wake 视为恢复运行。
    isParked = false
    if (isStepping) {
      hasPendingWake = true
      return
    }
    timeoutId !== null && cancel(timeoutId), (timeoutId = null), (deadlineTargetMs = -Infinity), requestNextFrame()
  }
  function tickFrameLoop(frameTimestamp = now()) {
    if (((animationFrameId = null), isDisposed || !isAvailable || isParked)) return
    if (
      frameTimestamp + EARLY_FRAME_TOLERANCE_MS < nextFrameTimeMs ||
      frameTimestamp + deadlineWindowMs < deadlineTargetMs
    ) {
      animationFrameId = requestFrame(tickFrameLoop)
      return
    }
    ;(nextFrameTimeMs =
      frameTimestamp - nextFrameTimeMs >= frameIntervalMs
        ? frameTimestamp + frameIntervalMs
        : nextFrameTimeMs + frameIntervalMs),
      (isStepping = true),
      (hasPendingWake = false),
      frameStats.frames++
    let nextDelayMs = Infinity
    try {
      nextDelayMs = step(frameTimestamp)
    } finally {
      isStepping = false
    }
    if (isDisposed || !isAvailable || isParked) return
    if (hasPendingWake || nextDelayMs <= 0) {
      ;(deadlineTargetMs = -Infinity), (animationFrameId = requestFrame(tickFrameLoop))
      return
    }
    if (!Number.isFinite(nextDelayMs)) return
    if (!alignDeadlines) {
      timeoutId = schedule(() => {
        ;(timeoutId = null), frameStats.deadlines++, wakeLoop()
      }, nextDelayMs)
      return
    }
    // 对齐模式：目标截止时间 = 本次时间戳 + 推进间隔，提前一帧进入下一轮。
    deadlineTargetMs = frameTimestamp + nextDelayMs
    deadlineWindowMs = nextDelayMs <= DEADLINE_WINDOW_LIMIT_MS ? 1 : 0
    const remainingMs = deadlineTargetMs - now() - DEADLINE_FRAME_SLACK_MS
    if (remainingMs <= 0) {
      animationFrameId = requestFrame(tickFrameLoop)
      return
    }
    timeoutId = schedule(() => {
      ;(timeoutId = null), frameStats.deadlines++, requestNextFrame()
    }, remainingMs)
  }
  return {
    wake: wakeLoop,
    stats: frameStats,
    wakeAnimation() {
      isStepping || wakeLoop()
    },
    /** 页面切到后台：停掉所有已排队的帧与定时器，并在 `setAvailable(true)` 前不再自唤醒。 */
    sleep() {
      clearPendingHandles(), (hasPendingWake = false), (isParked = true)
    },
    setAvailable(nextAvailable: any) {
      isDisposed ||
        isAvailable === !!nextAvailable ||
        ((isAvailable = !!nextAvailable),
        isAvailable ? wakeLoop() : (clearPendingHandles(), (nextFrameTimeMs = -Infinity)))
    },
    dispose() {
      ;(isDisposed = true), clearPendingHandles()
    },
    get pending() {
      return animationFrameId !== null || timeoutId !== null
    },
  }
}

function isPerformanceDiagnosticsEnabled(host: typeof globalThis) {
  return new URLSearchParams(host.location?.search || '').get('performance-diagnostics') === '1'
}

export function createLoadTiming(scope: any, host = globalThis) {
  const isDiagnosticsEnabled = isPerformanceDiagnosticsEnabled(host)
  return (phase: any) => {
    if (!isDiagnosticsEnabled) return
    const timestampMs = Math.round(host.performance.now())
    host.console.info(
      '[3D-load]',
      JSON.stringify({
        scope: scope,
        phase: phase,
        at: timestampMs,
      }),
    )
  }
}

/** 宿主页（展示页 / 编辑器）侧的 3D 挂载阶段：与 display-boot 同用 `[display-load]` 前缀和时间轴。 */
export function hostLoadTiming(phase: string, host = globalThis) {
  if (!isPerformanceDiagnosticsEnabled(host)) return
  host.console.info(
    '[display-load]',
    JSON.stringify({
      phase: phase,
      at: Math.round(host.performance.now()),
    }),
  )
}


export function performanceWarnings(currentProperties: any, nextProperties: any) {
  const warningMessages: any[] = []
  if (
    (nextProperties.renderScale > 1 &&
      nextProperties.renderScale > (currentProperties.renderScale ?? 1) &&
      warningMessages.push('高清渲染需要处理更多画面像素。'),
    nextProperties.motionRenderScale >= 0.8 &&
      nextProperties.motionRenderScale > (currentProperties.motionRenderScale ?? 0) &&
      warningMessages.push('较高的转动分辨率会增加旋转和聚焦过渡时的绘制开销。'),
    nextProperties.groundReflection)
  ) {
    const currentReflection = normalizeGroundReflection(currentProperties.groundReflection),
      nextReflection = normalizeGroundReflection(nextProperties.groundReflection),
      resolveReflectionLevel = (reflectionSettings: any) =>
        reflectionSettings.strength === 0 || reflectionSettings.mode === 'off'
          ? 0
          : reflectionSettings.mode === 'all'
            ? 2
            : 1,
      currentReflectionLevel = resolveReflectionLevel(currentReflection),
      nextReflectionLevel = resolveReflectionLevel(nextReflection)
    nextReflectionLevel > currentReflectionLevel &&
      warningMessages.push(
        nextReflectionLevel === 2 ? '室内和室外同时反射，需要额外绘制两组倒影。' : '地面反射需要额外绘制倒影。',
      ),
      nextReflectionLevel &&
        nextReflection.resolution > 512 &&
        (nextReflection.resolution > currentReflection.resolution || !currentReflectionLevel) &&
        warningMessages.push('高反射清晰度会增加倒影的绘制开销和显存占用。')
  }
  return warningMessages
}

export async function confirmPerformanceWarning(
  warningLines: string[],
  { signal: abortSignal }: { document?: Document; signal?: AbortSignal } = {},
) {
  if (!warningLines.length) return true
  if (abortSignal?.aborted) return false
  const confirmed = await shellConfirm({
    title: '画质与流畅度提示',
    message:
      warningLines.join('\n') +
      '\n\n手机、iPad 或性能较低的设备可能出现掉帧、发热或耗电增加。如果不够流畅，可以降低画质或关闭反射。',
    confirmLabel: '继续应用',
    cancelLabel: '取消',
  })
  return !abortSignal?.aborted && confirmed
}

/** 地面反射参数的归一化，以及「清晰度档 → 反射通道开销策略」的唯一出处。 */

const GROUND_REFLECTION_MODES = ['off', 'inside', 'outside', 'all'] as const
const GROUND_REFLECTION_RESOLUTIONS = [256, 512, 768] as const

type GroundReflectionMode = (typeof GROUND_REFLECTION_MODES)[number]
type GroundReflectionResolution = (typeof GROUND_REFLECTION_RESOLUTIONS)[number]

type GroundReflectionSettings = {
  mode: GroundReflectionMode
  resolution: GroundReflectionResolution
  strength: number
}

const DEFAULT_MODE: GroundReflectionMode = 'off'
const DEFAULT_RESOLUTION: GroundReflectionResolution = 512

const MAX_STRENGTH = 0.45
const DEFAULT_STRENGTH = 0.18

/** 倒影「离地高度截断」阈值（米）。 */
export const GROUND_REFLECTION_FADE_HEIGHT = 0

type GroundReflectionQualityPreset = {
  /** 倒影贴图再走一趟双向高斯模糊。 */
  blur: boolean
  /** 允许使用反射专用简化几何（detail）的清晰度上限（像素宽）。 */
  detailMaxResolution: number
}

/** 清晰度档 → 反射通道开销策略。 */
const GROUND_REFLECTION_QUALITY: Record<GroundReflectionResolution, GroundReflectionQualityPreset> = {
  // 256 是最省的档位（低性能设备 / 平板）：双高斯模糊每条记录要多两次全屏 pass，
  // 而 256 贴图本身的模糊效果肉眼几乎不可见 —— 这一档直接不做 blur。
  256: { blur: false, detailMaxResolution: 256 },
  512: { blur: false, detailMaxResolution: 0 },
  768: { blur: false, detailMaxResolution: 0 },
}

/** 把任意外部输入收敛成合法且完整的反射参数。 */
export function normalizeGroundReflection(settings: unknown = {}): GroundReflectionSettings {
  const source = settings && typeof settings == 'object' ? (settings as Record<string, unknown>) : {}
  return {
    mode: GROUND_REFLECTION_MODES.includes(source.mode as GroundReflectionMode)
      ? (source.mode as GroundReflectionMode)
      : DEFAULT_MODE,
    resolution: GROUND_REFLECTION_RESOLUTIONS.includes(source.resolution as GroundReflectionResolution)
      ? (source.resolution as GroundReflectionResolution)
      : DEFAULT_RESOLUTION,
    strength: Number.isFinite(source.strength)
      ? Math.max(0, Math.min(MAX_STRENGTH, Number(source.strength)))
      : DEFAULT_STRENGTH,
  }
}

/** 取某一清晰度档对应的反射通道开销策略。 */
export function groundReflectionQuality(resolution: GroundReflectionResolution): GroundReflectionQualityPreset {
  return GROUND_REFLECTION_QUALITY[resolution]
}


// 0.8.4 起 SHA-256 由独立模块提供，渲染缓存只做再导出（保持既有 import 路径可用）。

export const RENDER_CACHE_VERSION = 'i3d-light-delta-20260916-warm-refine-v6'
export function stableCacheJSON(payload: any) {
  return JSON.stringify(payload, (_key, rawValue) =>
    rawValue && typeof rawValue == 'object' && !Array.isArray(rawValue)
      ? Object.fromEntries(
          Object.keys(rawValue)
            .sort()
            .map((objectKey) => [objectKey, rawValue[objectKey]]),
        )
      : rawValue,
  )
}
export function cacheSceneDescriptor(floors: any) {
  const omitProperties = (source: any, omittedKeys: any) =>
    Object.fromEntries(Object.entries(source || {}).filter(([propertyName]) => !omittedKeys.includes(propertyName)))
  return floors.map((floor: any) => ({
    ...floor,
    name: undefined as any,
    scene: {
      ...floor.scene,
      settings: omitProperties(floor.scene.settings, [
        'cameraView',
        'cameraMode',
        'cameraFocalLength',
        'cameraTopRotation',
        'fixedCameraView',
        'planViewRotation',
        'livePreviewEnabled',
        'previewPanelRatio',
        'detailsPanelWidthRatio',
      ]),
      lightGroups: floor.scene.lightGroups?.map((lightGroup: any) => omitProperties(lightGroup, ['enabled', 'name'])),
      items: floor.scene.items.map((sceneItem: any) =>
        ['downlight', 'ceilinglight', 'striplight'].includes(sceneItem.type)
          ? omitProperties(sceneItem, ['lightBrightness', 'lightTemperature', 'lightColorRgb'])
          : sceneItem,
      ),
    },
  }))
}
/** report 回调负载：一次缓存统计快照（全部为数值，便于直接 JSON 上报）。 */
type RenderCacheReport = {
  memoryHits: number
  serverHits: number
  misses: number
  generated: number
  uploads: number
  errors: number
  decodedHits: number
  memoryBytes: number
  pendingBytes: number
  decodedBytes: number
  decodedFrames: number
}

/** createRenderCache 的构造选项。 */
/** 离屏 canvas：缓存解码结果时会在上面挂 close()，以便提前释放显存（与 ImageBitmap.close 对齐）。 */
type CacheCanvas = HTMLCanvasElement & { close?: () => void }

type RenderCacheOptions = {
  /** 场景 id，参与服务端缓存分桶。 */
  sceneId?: string | null
  /** 项目 id，缺省时按空串上报。 */
  projectId?: string | null
  /**
   * 取图函数，默认为 **惰性** 解析的 `globalThis.fetch`。
   * 注意：本模块在 chunk 求值期就会被构造（早于 main.ts 的 installFetchCsrf()），
   * 若在此处直接取 `globalThis.fetch` 会永久抓住未包装的原始 fetch，
   * 导致渲染缓存的 PUT 恒定缺少 X-CSRF-Token（实测 403）。
   */
  fetcher?: typeof fetch
  /** 解码函数，默认 createImageBitmap。 */
  decode?: (imageBlob: Blob) => Promise<ImageBitmap>
  /** 单张服务端缓存图的内存上限。 */
  maxBytes?: number
  /** 单次请求超时（毫秒）。 */
  timeoutMs?: number
  /** 时钟，便于测试。 */
  now?: () => number
  /** 统计回调：每次统计变化都会调用一次。 */
  report?: (report: RenderCacheReport) => void
  /** 创建离屏 canvas。 */
  makeCanvas?: () => CacheCanvas
  /** 已解码位图的内存上限。 */
  maxDecodedBytes?: number
  /** 已解码位图的帧数上限。 */
  maxDecodedFrames?: number
}

export function createRenderCache({
  sceneId: sceneId,
  projectId: projectId,
  fetcher: fetcher = (input, init) => globalThis.fetch(input, init),
  decode: decode = (imageBlob) => createImageBitmap(imageBlob),
  maxBytes: maxBytes = 32 * 1024 * 1024,
  timeoutMs: timeoutMs = 1800,
  now: now = Date.now,
  report: onReport = () => {},
  makeCanvas: makeCanvas = () => document.createElement('canvas'),
  maxDecodedBytes: maxDecodedBytes = 32 * 1024 * 1024,
  maxDecodedFrames: maxDecodedFrames = 3,
}: RenderCacheOptions = {}) {
  const encodedBlobsByKey = new Map(),
    abortControllerSet = new Set<AbortController>(),
    pendingUploadsByKey = new Map(),
    decodedRecordsByKey = new Map(),
    inFlightReadsByKey = new Map()
  let decodedBytes = 0,
    memoryBytes = 0,
    pendingBytes = 0,
    isUploading = false,
    isClosed = false,
    errorCooldownUntil = 0
  /**
   * 在途 GET 的「是否还需要」监视集合。
   *
   * 共享一个 250ms 定时器，而不是每个请求各起一个 50ms interval：场景加载会并发
   * 几十个瓦片请求，旧实现等于几十个 20Hz 定时器同时抢主线程（3D 启动最吃 CPU 的
   * 那段时间）。250ms 的检测延迟对「切页/换场景后取消旧请求」完全够用。
   */
  const staleWatches = new Set<{ isWanted: () => boolean; controller: AbortController }>()
  let staleWatchTimer: ReturnType<typeof setInterval> | null = null
  const STALE_POLL_MS = 250

  function stopStaleWatchTimer() {
    if (staleWatchTimer !== null) clearInterval(staleWatchTimer)
    staleWatchTimer = null
  }

  function registerStaleWatch(isWanted: () => boolean, controller: AbortController): () => void {
    const entry = { isWanted, controller }
    staleWatches.add(entry)
    if (staleWatchTimer === null) {
      staleWatchTimer = setInterval(() => {
        for (const watch of staleWatches) {
          if (!watch.isWanted()) {
            watch.controller.abort('stale')
            staleWatches.delete(watch)
          }
        }
        if (!staleWatches.size) stopStaleWatchTimer()
      }, STALE_POLL_MS)
    }
    return () => {
      staleWatches.delete(entry)
      if (!staleWatches.size) stopStaleWatchTimer()
    }
  }
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
      })
  function releaseEntry(leaseRecord: any) {
    leaseRecord.refs--, !leaseRecord.retained && leaseRecord.refs === 0 && leaseRecord.image.close()
  }
  function evictDecodedEntry(evictedKey: any) {
    const cachedRecord = decodedRecordsByKey.get(evictedKey)
    cachedRecord &&
      (decodedRecordsByKey.delete(evictedKey),
      (decodedBytes -= cachedRecord.bytes),
      (cachedRecord.retained = false),
      cachedRecord.refs || cachedRecord.image.close())
  }
  function storeDecodedImage(cacheKey: any, sourceImage: any, imageWidth: any, imageHeight: any) {
    evictDecodedEntry(cacheKey)
    const newRecord = {
      image: sourceImage,
      width: imageWidth,
      height: imageHeight,
      bytes: imageWidth * imageHeight * 4,
      refs: 1,
      retained: true,
    }
    for (
      decodedRecordsByKey.set(cacheKey, newRecord), decodedBytes += newRecord.bytes;
      decodedBytes > maxDecodedBytes || decodedRecordsByKey.size > maxDecodedFrames;
    )
      evictDecodedEntry(decodedRecordsByKey.keys().next().value)
    return newRecord
  }
  function createDecodedLease(record: any) {
    record.refs++
    let isReleased = false
    return {
      image: record.image,
      width: record.width,
      height: record.height,
      close() {
        isReleased || ((isReleased = true), releaseEntry(record))
      },
    }
  }
  const buildTileUrl = (tileKey: any) =>
    '/api/v1/modules/interaction3d/scenes/' +
    encodeURIComponent(sceneId || '') +
    '/render-cache/' +
    tileKey +
    '?projectId=' +
    encodeURIComponent(projectId || '')
  function cacheBlob(blobKey: any, blobValue: any) {
    for (
      encodedBlobsByKey.has(blobKey) && (memoryBytes -= encodedBlobsByKey.get(blobKey).size),
        encodedBlobsByKey.delete(blobKey),
        blobValue.size <= maxBytes && (encodedBlobsByKey.set(blobKey, blobValue), (memoryBytes += blobValue.size));
      memoryBytes > maxBytes || encodedBlobsByKey.size > 64;
    ) {
      const oldestKey = encodedBlobsByKey.keys().next().value
      ;(memoryBytes -= encodedBlobsByKey.get(oldestKey).size), encodedBlobsByKey.delete(oldestKey)
    }
  }
  async function requestBlob(
    requestKey: string,
    requestOptions: RequestInit = {},
    isRequestWanted: () => boolean = () => true,
  ) {
    if (isClosed || now() < errorCooldownUntil) return null
    const requestAbortController = new AbortController()
    abortControllerSet.add(requestAbortController)
    const timeoutId = setTimeout(() => requestAbortController.abort(), timeoutMs)
    // 过期检测走**一个共享定时器**：此前每个在途 GET 各起一个 50ms interval，
    // 场景加载会并发几十个瓦片请求，等于几十个 20Hz 定时器在 3D 启动时抢主线程。
    const releaseStaleWatch = requestOptions.method ? null : registerStaleWatch(isRequestWanted, requestAbortController)
    try {
      const response = await fetcher(buildTileUrl(requestKey), {
          ...requestOptions,
          // 变更类请求（PUT 上传瓦片/光照缓存）必须显式带 X-CSRF-Token：
          // 本模块可能在全局包装生效前就发出请求，不能只依赖 installFetchCsrf()。
          headers: withCsrf(requestOptions.headers, requestOptions.method || 'GET'),
          credentials: 'same-origin',
          signal: requestAbortController.signal,
        }),
        isBinaryMiss =
          !requestOptions.method &&
          response.status === 404 &&
          !response.headers?.get('content-type')?.includes('application/json')
      if (!response.ok && !isBinaryMiss) throw new Error('cache unavailable')
      return !requestOptions.method && (response.status === 204 || isBinaryMiss)
        ? null
        : requestOptions.method
          ? response
          : response.ok
            ? await response.blob()
            : null
    } catch {
      return (!isClosed && isRequestWanted() && (stats.errors++, (errorCooldownUntil = now() + 15000)), null)
    } finally {
      clearTimeout(timeoutId), releaseStaleWatch?.(), abortControllerSet.delete(requestAbortController)
    }
  }
  async function flushPendingUploads() {
    if (!(isUploading || isClosed)) {
      isUploading = true
      try {
        for (; pendingUploadsByKey.size && !isClosed; ) {
          const [uploadKey, uploadBlob] = pendingUploadsByKey.entries().next().value!
          pendingUploadsByKey.delete(uploadKey),
            (pendingBytes -= uploadBlob.size),
            (
              (await requestBlob(uploadKey, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'image/png',
                },
                body: uploadBlob,
              })) as Response | null
            )?.ok && stats.uploads++,
            emitStats()
        }
      } finally {
        isUploading = false
      }
    }
  }
  const createTilePlan = (tileHash: any, tileWidth: any, tileHeight: any) => {
      const tiles: any[] = []
      for (let offsetY = 0; offsetY < tileHeight; offsetY += 1024)
        for (let offsetX = 0; offsetX < tileWidth; offsetX += 1024)
          tiles.push({
            x: offsetX,
            y: offsetY,
            width: Math.min(1024, tileWidth - offsetX),
            height: Math.min(1024, tileHeight - offsetY),
            key: sha256(tileHash + ':tile-v1:' + tileWidth + ':' + tileHeight + ':' + offsetX + ':' + offsetY),
          })
      return tiles
    },
    cache = {
      stats: stats,
      get closed() {
        return isClosed
      },
      async acquire(acquireKey: any, acquireWidth: any, acquireHeight: any, isAcquireWanted = () => true) {
        if (isClosed || !acquireKey || !isAcquireWanted()) return null
        const acquireRecordKey = acquireKey + ':' + acquireWidth + ':' + acquireHeight,
          existingRecord = decodedRecordsByKey.get(acquireRecordKey)
        if (existingRecord)
          return (
            decodedRecordsByKey.delete(acquireRecordKey),
            decodedRecordsByKey.set(acquireRecordKey, existingRecord),
            stats.decodedHits++,
            emitStats(),
            createDecodedLease(existingRecord)
          )
        let inFlightEntry = inFlightReadsByKey.get(acquireRecordKey)
        inFlightEntry ||
          ((inFlightEntry = {
            waiters: new Set(),
            entry: null as any,
          }),
          inFlightReadsByKey.set(acquireRecordKey, inFlightEntry))
        const isStillWanted = () => !isClosed && isAcquireWanted()
        inFlightEntry.waiters.add(isStillWanted),
          inFlightEntry.promise ||
            (inFlightEntry.promise = cache
              .read(acquireKey, acquireWidth, acquireHeight, () =>
                [...inFlightEntry.waiters].some((waiterCheck) => waiterCheck()),
              )
              .then((fetchedRecord) =>
                fetchedRecord
                  ? isClosed || ![...inFlightEntry.waiters].some((pendingWaiterCheck) => pendingWaiterCheck())
                    ? (fetchedRecord.close!(), null!)
                    : ((inFlightEntry.entry = storeDecodedImage(
                        acquireRecordKey,
                        fetchedRecord,
                        acquireWidth,
                        acquireHeight,
                      )),
                      emitStats(),
                      inFlightEntry.entry)
                  : null,
              ))
        try {
          const sharedRecord = await inFlightEntry.promise
          return sharedRecord && isStillWanted() ? createDecodedLease(sharedRecord) : null
        } finally {
          inFlightEntry.waiters.delete(isStillWanted),
            inFlightEntry.waiters.size ||
              (inFlightReadsByKey.delete(acquireRecordKey), inFlightEntry.entry && releaseEntry(inFlightEntry.entry))
        }
      },
      async read(readKey: any, readWidth: any, readHeight: any, isReadWanted = () => true) {
        if (isClosed || !readKey || !isReadWanted()) return null
        if (readWidth * readHeight > 2097152) {
          const canvasElement = makeCanvas()
          ;(canvasElement.width = readWidth), (canvasElement.height = readHeight)
          let isComplete = false
          try {
            const readPainter = canvasElement.getContext('2d')
            if (!readPainter) return null
            for (const sourceTile of createTilePlan(readKey, readWidth, readHeight)) {
              const tileImage = await cache.read(sourceTile.key, sourceTile.width, sourceTile.height, isReadWanted)
              if (!tileImage) return null
              try {
                if (isClosed || !isReadWanted()) return null
                readPainter.drawImage(tileImage, sourceTile.x, sourceTile.y)
              } finally {
                tileImage.close!()
              }
            }
            return (
              (canvasElement.close = () => {
                canvasElement.width = canvasElement.height = 0
              }),
              (isComplete = true),
              canvasElement
            )
          } finally {
            isComplete || (canvasElement.width = canvasElement.height = 0)
          }
        }
        let cachedBlob = encodedBlobsByKey.get(readKey),
          statsKey = cachedBlob ? 'memoryHits' : 'serverHits'
        if ((cachedBlob || (cachedBlob = await requestBlob(readKey, {}, isReadWanted)), isClosed || !isReadWanted()))
          return null
        if (!cachedBlob || cachedBlob.size > 10 * 1024 * 1024 || cachedBlob.type !== 'image/png')
          return (stats.misses++, emitStats(), null)
        let decodedImage
        try {
          if (
            ((decodedImage = await decode(cachedBlob)),
            isClosed || !isReadWanted() || decodedImage.width !== readWidth || decodedImage.height !== readHeight)
          )
            throw new Error('stale image')
          return (cacheBlob(readKey, cachedBlob), (stats as any)[statsKey]++, emitStats(), decodedImage)
        } catch {
          return (
            decodedImage?.close?.(),
            encodedBlobsByKey.has(readKey) &&
              ((memoryBytes -= encodedBlobsByKey.get(readKey).size), encodedBlobsByKey.delete(readKey)),
            stats.misses++,
            emitStats(),
            null
          )
        }
      },
      async write(writeKey: any, writeImage: any, isWriteWanted = () => true) {
        if (isClosed || !writeKey || !isWriteWanted()) return
        if (writeImage.width * writeImage.height > 2097152) {
          const tileCanvas = makeCanvas()
          try {
            for (const tile of createTilePlan(writeKey, writeImage.width, writeImage.height)) {
              if (isClosed || !isWriteWanted()) return
              ;(tileCanvas.width = tile.width), (tileCanvas.height = tile.height)
              const tilePainter = tileCanvas.getContext('2d')
              if (!tilePainter) return
              tilePainter.drawImage(writeImage, tile.x, tile.y, tile.width, tile.height, 0, 0, tile.width, tile.height),
                await cache.write(tile.key, tileCanvas, isWriteWanted)
            }
          } finally {
            tileCanvas.width = tileCanvas.height = 0
          }
          return
        }
        let blob: any
        try {
          blob = await new Promise((resolveBlob) => writeImage.toBlob(resolveBlob, 'image/png'))
        } catch {
          stats.errors++, emitStats()
          return
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
            (pendingUploadsByKey.set(writeKey, blob), (pendingBytes += blob.size), flushPendingUploads()),
          emitStats())
      },
      close() {
        isClosed = true
        for (const pendingController of abortControllerSet) pendingController.abort()
        staleWatches.clear()
        stopStaleWatchTimer()
        for (const decodedKey of decodedRecordsByKey.keys()) evictDecodedEntry(decodedKey)
        encodedBlobsByKey.clear(), pendingUploadsByKey.clear(), (memoryBytes = pendingBytes = 0), emitStats()
      },
    }
  return cache
}

export function createRenderLightIndex() {
  let indexedSceneRoot: any = null,
    isDirty = true,
    isDisposed = false,
    observedObjects: any = [],
    spotlightEntries: any = [],
    sortedVisibleLights: any = [],
    visibleLightOrder: any = [],
    visibleLightWeights: any = []
  const visibilityByObject = new Map(),
    indexStats = {
      builds: 0,
      sorts: 0,
      reads: 0,
      checkedLights: 0,
    },
    markIndexDirty = () => {
      isDirty = true
    }
  function detachChildListeners() {
    for (const observedObject of observedObjects)
      observedObject.removeEventListener('childadded', markIndexDirty),
        observedObject.removeEventListener('childremoved', markIndexDirty)
    ;(observedObjects = []), (spotlightEntries = [])
  }
  function rebuildLightIndex() {
    detachChildListeners(),
      (visibleLightOrder = []),
      (visibleLightWeights = []),
      (sortedVisibleLights = []),
      indexedSceneRoot.traverse((sceneNode: any) => {
        if (
          (observedObjects.push(sceneNode),
          sceneNode.addEventListener('childadded', markIndexDirty),
          sceneNode.addEventListener('childremoved', markIndexDirty),
          !sceneNode.isSpotLight)
        )
          return
        const ancestorPath: any[] = []
        for (
          let pathCursor = sceneNode;
          pathCursor && (ancestorPath.push(pathCursor), pathCursor !== indexedSceneRoot);
          pathCursor = pathCursor.parent
        );
        spotlightEntries.push({
          object: sceneNode,
          path: ancestorPath,
        })
      }),
      (isDirty = false),
      indexStats.builds++
  }
  return {
    stats: indexStats,
    read(sceneRoot: any, camera: any) {
      if (isDisposed) return []
      indexedSceneRoot !== sceneRoot && ((indexedSceneRoot = sceneRoot), (isDirty = true)),
        isDirty && rebuildLightIndex(),
        indexStats.reads++,
        visibilityByObject.clear()
      let visibleLightCount = 0,
        isOrderChanged = false
      for (const { object: lightObject, path: entryPath } of spotlightEntries) {
        indexStats.checkedLights++
        let isPathVisible = true
        for (const ancestorNode of entryPath) {
          let cachedVisibility = visibilityByObject.get(ancestorNode)
          if (
            (cachedVisibility === undefined &&
              ((cachedVisibility = ancestorNode.visible !== false),
              visibilityByObject.set(ancestorNode, cachedVisibility)),
            !cachedVisibility)
          ) {
            isPathVisible = false
            break
          }
        }
        if (!isPathVisible || !lightObject.layers.test(camera.layers)) continue
        const lightSortWeight = (lightObject.castShadow ? 2 : 0) + (lightObject.map ? 1 : 0)
        ;(visibleLightOrder[visibleLightCount] !== lightObject ||
          visibleLightWeights[visibleLightCount] !== lightSortWeight) &&
          (isOrderChanged = true),
          (visibleLightOrder[visibleLightCount] = lightObject),
          (visibleLightWeights[visibleLightCount] = lightSortWeight),
          visibleLightCount++
      }
      if (
        (visibleLightOrder.length !== visibleLightCount && (isOrderChanged = true),
        (visibleLightOrder.length = visibleLightWeights.length = visibleLightCount),
        isOrderChanged)
      ) {
        sortedVisibleLights.length = 0
        for (const visibleLight of visibleLightOrder) sortedVisibleLights.push(visibleLight)
        sortedVisibleLights.sort(
          (leftLight: any, rightLight: any) =>
            (rightLight.castShadow ? 2 : 0) +
            (rightLight.map ? 1 : 0) -
            ((leftLight.castShadow ? 2 : 0) + (leftLight.map ? 1 : 0)),
        ),
          indexStats.sorts++
      }
      return sortedVisibleLights
    },
    invalidate: markIndexDirty,
    dispose() {
      ;(isDisposed = true),
        detachChildListeners(),
        visibilityByObject.clear(),
        (indexedSceneRoot = null),
        (sortedVisibleLights = visibleLightOrder = visibleLightWeights = [])
    },
  }
}

/**
 * 场景内容指纹（`sceneContentKey`）。
 *
 * 独立成模块的原因：它是**纯函数**（不碰 three、不碰 DOM），而预览作用域
 * （`studio-preview-scope`）要复用它来比较两次编辑的内容。放在 `scene-update.ts` 里会让
 * 预览作用域连带拖进 three 的整套依赖，单测就跑不起来 —— 而「改一个标签不该白刷整屏」
 * 正是最该被测试钉住的判定。
 *
 * 两个刻意的口径：
 *
 * - 先剔掉模型备注（`withoutModelRemarks`）：备注是注释，不该触发重绘；
 * - 键**排序后再序列化**：上游 0.8.0 直接 `JSON.stringify`，键顺序不同就会被判成
 *   「内容变了」，导致编辑端白刷一次整屏。排序后同一份内容只有唯一指纹。
 */

/** 键排序后的深拷贝：只用于生成内容指纹，不参与任何业务逻辑。 */
export function canonicalizeContent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeContent)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalizeContent(record[key])]),
    )
  }
  return value
}

/** 两份场景的「内容」是否相同：预览作用域与历史对比都靠它。 */
export const sceneContentKey = (sceneContent: unknown) =>
  JSON.stringify(canonicalizeContent(withoutModelRemarks(sceneContent)))

/** 像素/米是所有偏移换算的除数：0 / NaN 会把相机位置算成 Infinity，只能看到画面全空。 */
function resolvePixelsPerMeter(raw: unknown): number {
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : 1
}

/** 居中包围盒的采样点（墙体端点是平面坐标，家具项自带 x/y）。 */
type PlanPoint = { x?: number; y?: number }

/** computeFloorPlacement 需要读到的场景字段（旧草稿可能整段缺失）。 */
type PlanScene = {
  walls?: Array<{ start?: PlanPoint; end?: PlanPoint }>
  items?: Array<PlanPoint & { type?: string }>
  background?: { width?: number; height?: number }
}

/** 「只有庭院平面、没有墙体」的场景：用原点 + 像素/米直接定位，不做包围盒居中。 */
function isCourtyardOnlyScene(scene: PlanScene): boolean {
  const courtyardTypes = ['courtyard-area', 'courtyard-path', 'courtyard-fence']
  return (
    !scene.walls?.length && scene.items?.some((sceneItem) => courtyardTypes.includes(String(sceneItem.type))) === true
  )
}

/** 计算居中包围盒用的采样点：墙体端点 → 家具 → 背景矩形 → 缺省 1200×800。 */
function resolvePlanPoints(scene: PlanScene): PlanPoint[] {
  if (scene.walls?.length) {
    return scene.walls.flatMap((wall) => [wall.start ?? { x: 0, y: 0 }, wall.end ?? { x: 0, y: 0 }])
  }
  if (scene.items?.length) return scene.items
  if (scene.background?.width && scene.background?.height) {
    return [
      { x: 0, y: 0 },
      { x: scene.background.width, y: scene.background.height },
    ]
  }
  return [
    { x: 0, y: 0 },
    { x: 1200, y: 800 },
  ]
}

function computeFloorPlacement(project: any, floorId: any, activeFloorId: any) {
  const floors = project.floors || [],
    floor = floors.find((floorEntry: any) => floorEntry.id === (floorId === 'all' ? activeFloorId : floorId))
  if (!floor) return null
  // ``floor.scene`` 可能缺失（旧草稿 / 只建了一半楼层）：旧实现在这里直接取
  // ``scene.calibration``，``?.`` 只保护了 calibration 本身，scene 为 undefined 时
  // 抛 TypeError —— 一次相机迁移就把整个「全部楼层」视图打断。
  const scene = floor.scene ?? {},
    pixelsPerMeter = resolvePixelsPerMeter(scene.calibration?.pixelsPerMeter)
  if (floorId === 'all' && floors.length > 1) {
    const rotationRad = (-(floor.rotation || 0) * Math.PI) / 180,
      cosRotation = Math.cos(rotationRad),
      sinRotation = Math.sin(rotationRad)
    return {
      ppm: pixelsPerMeter,
      c: cosRotation,
      s: sinRotation,
      x:
        (floor.offsetX || 0) -
        (cosRotation * (floor.originX || 0) + sinRotation * (floor.originY || 0)) / pixelsPerMeter,
      z:
        (floor.offsetZ || 0) -
        (-sinRotation * (floor.originX || 0) + cosRotation * (floor.originY || 0)) / pixelsPerMeter,
      y:
        [...floors].sort((floorA, floorB) => floorA.elevation - floorB.elevation).indexOf(floor) *
        project.previewFloorGap,
    }
  }
  if (isCourtyardOnlyScene(scene))
    return {
      ppm: pixelsPerMeter,
      c: 1,
      s: 0,
      x: -(floor.originX || 0) / pixelsPerMeter,
      z: -(floor.originY || 0) / pixelsPerMeter,
      y: 0,
    }
  let floorPlanPoints = resolvePlanPoints(scene)
  if (
    ((floorPlanPoints = floorPlanPoints.filter((point: any) => Number.isFinite(point?.x) && Number.isFinite(point?.y))),
    !floorPlanPoints.length)
  )
    return null
  const minX = Math.min(...floorPlanPoints.map((minXPoint: any) => minXPoint.x)),
    minY = Math.min(...floorPlanPoints.map((minYPoint: any) => minYPoint.y)),
    maxX = Math.max(minX + 1, ...floorPlanPoints.map((maxXPoint: any) => maxXPoint.x)),
    maxY = Math.max(minY + 1, ...floorPlanPoints.map((maxYPoint: any) => maxYPoint.y))
  return {
    ppm: pixelsPerMeter,
    c: 1,
    s: 0,
    x: -(minX + maxX) / 2 / pixelsPerMeter,
    z: -(minY + maxY) / 2 / pixelsPerMeter,
    y: 0,
  }
}
export function transformSceneCamera(
  cameraState: any,
  sourceProject: any,
  targetProject: any,
  requestedFloorId: any,
  shouldSwap = false,
) {
  if (!cameraState) return cameraState
  const sharedFloorId = sourceProject.floors?.find((sourceFloor: any) =>
    targetProject.floors?.some((targetFloor: any) => targetFloor.id === sourceFloor.id),
  )?.id
  let sourcePlacement = computeFloorPlacement(sourceProject, requestedFloorId, sharedFloorId),
    targetPlacement = computeFloorPlacement(targetProject, requestedFloorId, sharedFloorId)
  if (!sourcePlacement || !targetPlacement) return structuredClone(cameraState)
  shouldSwap && ([sourcePlacement, targetPlacement] = [targetPlacement, sourcePlacement])
  const scale = sourcePlacement.ppm / targetPlacement.ppm,
    cosDelta = targetPlacement.c * sourcePlacement.c + targetPlacement.s * sourcePlacement.s,
    sinDelta = targetPlacement.s * sourcePlacement.c - targetPlacement.c * sourcePlacement.s,
    rotatePoint = ([sourceX, sourceY, sourceZ]: any) => [
      cosDelta * sourceX + sinDelta * sourceZ,
      sourceY,
      -sinDelta * sourceX + cosDelta * sourceZ,
    ],
    transformPoint = ([pointX, pointY, pointZ]: any) => {
      const rotatedPoint = rotatePoint([
        pointX - sourcePlacement.x,
        pointY - sourcePlacement.y,
        pointZ - sourcePlacement.z,
      ])
      return [
        rotatedPoint[0] * scale + targetPlacement.x,
        rotatedPoint[1] * scale + targetPlacement.y,
        rotatedPoint[2] * scale + targetPlacement.z,
      ]
    }
  return {
    ...structuredClone(cameraState),
    position: transformPoint(cameraState.position),
    target: transformPoint(cameraState.target),
    ...(cameraState.up
      ? {
          up: rotatePoint(cameraState.up),
        }
      : {}),
    ...(cameraState.frameSize
      ? {
          frameSize: cameraState.frameSize * scale,
        }
      : {}),
  }
}

const patchedObjectSet = new WeakSet()
export function cacheObjectTransforms(root: any, reference: any) {
  let patchedCount = 0
  return (
    root?.traverse((object: any) => {
      if (patchedObjectSet.has(object) || object.updateMatrix !== reference.prototype.updateMatrix) return
      const originalUpdateMatrix = object.updateMatrix
      let lastPosX: any,
        lastPosY: any,
        lastPosZ: any,
        lastQuatX: any,
        lastQuatY: any,
        lastQuatZ: any,
        lastQuatW: any,
        lastScaleX: any,
        lastScaleY: any,
        lastScaleZ: any,
        lastParent: any
      ;(object.updateMatrix = function () {
        const position = this.position,
          quaternion = this.quaternion,
          scale = this.scale
        if (
          position.x === lastPosX &&
          position.y === lastPosY &&
          position.z === lastPosZ &&
          quaternion.x === lastQuatX &&
          quaternion.y === lastQuatY &&
          quaternion.z === lastQuatZ &&
          quaternion.w === lastQuatW &&
          scale.x === lastScaleX &&
          scale.y === lastScaleY &&
          scale.z === lastScaleZ
        ) {
          this.parent !== lastParent && (this.matrixWorldNeedsUpdate = true), (lastParent = this.parent)
          return
        }
        originalUpdateMatrix.call(this),
          (lastParent = this.parent),
          (lastPosX = position.x),
          (lastPosY = position.y),
          (lastPosZ = position.z),
          (lastQuatX = quaternion.x),
          (lastQuatY = quaternion.y),
          (lastQuatZ = quaternion.z),
          (lastQuatW = quaternion.w),
          (lastScaleX = scale.x),
          (lastScaleY = scale.y),
          (lastScaleZ = scale.z)
      }),
        patchedObjectSet.add(object),
        patchedCount++
    }),
    patchedCount
  )
}



const VIEW_SETTING_KEYS = [
    'planViewRotation',
    'cameraView',
    'cameraTopRotation',
    'cameraMode',
    'cameraFocalLength',
    'fixedCameraView',
    'livePreviewEnabled',
    'backgroundVisible',
    'snapEnabled',
    'snapEndpoints',
    'snapIntersections',
    'snapSegments',
    'snapOrthogonal',
    'snapAngles',
    'snapGrid',
    'snapTolerance',
    'previewPanelRatio',
    'detailsPanelWidthRatio',
  ],
  FLOOR_SHARED_KEYS = [
    'activeFloorId',
    'previewFloorMode',
    'combinedCameraSettings',
    'combinedFixedCameraView',
    'exportFloorGap',
    'exportPresets',
    'activeExportPresetSlot',
  ]
function omitKeys(source: any, excludedKeys: any) {
  const result = {
    ...source,
  }
  for (const key of excludedKeys) delete result[key]
  return result
}
/**
 * 结构化相等（键无序）：等价于「``JSON.stringify(sortDeep(x))`` 后比字符串」，
 * 但**不构建字符串**、不做中间对象克隆，且在第一个不同处提前返回。
 *
 * 直接遍历比较，不构建字符串、不做中间对象克隆，且在第一个不同处提前返回。
 *
 * 口径刻意**保守**（任何拿不准的情况都判为「不相等」），即最多多报一次变更，
 * 绝不会漏报：值为 ``undefined`` / 函数 / ``NaN`` 的字段，以及数组里的 ``undefined``
 * 元素都判为不同。
 */
function stableEquals(left: any, right: any): boolean {
  if (left === right) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    for (let index = 0; index < left.length; index += 1) {
      if (!stableEquals(left[index], right[index])) return false
    }
    return true
  }
  const leftIsObject = !!left && typeof left === 'object',
    rightIsObject = !!right && typeof right === 'object'
  if (leftIsObject || rightIsObject) {
    if (!leftIsObject || !rightIsObject) return false
    // 非普通对象（Date / Map / 类实例）只看自有可枚举键
    const leftKeys = Object.keys(left).sort(),
      rightKeys = Object.keys(right).sort()
    if (leftKeys.length !== rightKeys.length) return false
    for (let index = 0; index < leftKeys.length; index += 1) {
      if (leftKeys[index] !== rightKeys[index]) return false
      if (!stableEquals(left[leftKeys[index]], right[rightKeys[index]])) return false
    }
    return true
  }
  return Number.isNaN(left) && Number.isNaN(right)
}
const floorComparisonShape = (floor: any) => ({
    ...withoutModelRemarks(floor.scene),
    settings: omitKeys(floor.scene?.settings, VIEW_SETTING_KEYS),
  }),
  floorIdentityShape = (sourceFloor: any) => omitKeys(sourceFloor, ['scene', 'name', 'aligned', 'alignmentPending'])

export function sceneUpdatePlan(previousScene: any, nextScene: any) {
  const previousFloorsById = new Map(previousScene.floors.map((listedFloor: any) => [listedFloor.id, listedFloor])),
    sharedSceneShape = (scene: any) => omitKeys(scene, [...FLOOR_SHARED_KEYS, 'floors', 'baseLighting']),
    isSceneChanged =
      !stableEquals(sharedSceneShape(previousScene), sharedSceneShape(nextScene)) ||
      !stableEquals(previousScene.floors.map(floorIdentityShape), nextScene.floors.map(floorIdentityShape)),
    changedFloorIds = nextScene.floors
      .filter(
        (candidateFloor: any) =>
          !previousFloorsById.has(candidateFloor.id) ||
          !stableEquals(
            floorComparisonShape(previousFloorsById.get(candidateFloor.id)),
            floorComparisonShape(candidateFloor),
          ),
      )
      .map((changedFloor: any) => changedFloor.id),
    isLightingChanged = !stableEquals(previousScene.baseLighting, nextScene.baseLighting)
  return {
    full: isSceneChanged,
    floors: changedFloorIds,
    lighting: isLightingChanged,
    visual: isSceneChanged || changedFloorIds.length > 0 || isLightingChanged,
  }
}

/**
 * 把「场景同步」失败响应翻译成可排障的文案。
 *
 * 调用方（render loop）原先只抛一句「户型同步暂时不可用」：HTTP 状态、服务端错误信封里的
 * `message` 与 `traceId` 全被丢掉，于是控制台里既看不出是 409（草稿没保存）、403（授权）
 * 还是 500（服务端异常），也无从在后端日志里按 traceId 定位那条堆栈 —— 每次排障只能靠猜。
 *
 * 只读响应体里**已有**的字段（后端统一错误信封），不做推断：读不出 JSON 时退回纯状态码
 * 文案，诊断代码本身不会因抛错而掩盖原始失败。
 *
 * 放在本模块而不是 render loop：那个文件已经很大，继续变长只会让职责更混杂；
 * 这里用 unknown + 显式收窄，不引入新的隐式类型。
 */
export async function sceneSyncFailureMessage(response: Response): Promise<string> {
  const statusText = `户型同步暂时不可用（HTTP ${response.status}）`
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    return statusText
  }
  const envelope = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const detail = typeof envelope.message === 'string' ? envelope.message.trim() : ''
  const traceId = typeof envelope.traceId === 'string' ? envelope.traceId.trim() : ''
  // 文案只取前 120 字：错误信封里的 message 可能是长句，控制台一行读得完才有人看。
  const parts = [detail.slice(0, 120), traceId && `traceId=${traceId}`].filter(Boolean)
  return parts.length ? `${statusText}：${parts.join(' · ')}` : statusText
}

/**
 * 轻量 SHA-256 实现（同步、无 WebCrypto 依赖）。
 *
 * 0.8.4 把原先内联在 `render-cache.js` 里的实现抽成独立模块 `utils/sha256.js`，
 * 由 `render-cache.js` 再导出、`editor-history.js` 直接 import。此处保持同样的
 * 单一实现来源，避免出现第二份哈希代码。
 */
export function sha256(text: any) {
  const messageBytes = new TextEncoder().encode(text),
    byteLength = messageBytes.length,
    paddedBytes = new Uint8Array(Math.ceil((byteLength + 9) / 64) * 64)
  paddedBytes.set(messageBytes), (paddedBytes[byteLength] = 128)
  const byteView = new DataView(paddedBytes.buffer)
  byteView.setUint32(paddedBytes.length - 8, Math.floor(byteLength / 536870912)),
    byteView.setUint32(paddedBytes.length - 4, byteLength * 8)
  const primes: any = [],
    cubeRootConstants: any[] = [],
    squareRootConstants: any[] = []
  for (let candidate = 2; primes.length < 64; candidate++)
    primes.some((prime: any) => candidate % prime === 0) ||
      (primes.push(candidate),
      cubeRootConstants.push(((Math.cbrt(candidate) % 1) * 4294967296) >>> 0),
      squareRootConstants.length < 8 && squareRootConstants.push(((Math.sqrt(candidate) % 1) * 4294967296) >>> 0))
  const rotateRight = (word: any, shift: any) => (word >>> shift) | (word << (32 - shift)),
    messageSchedule = new Uint32Array(64),
    hashState = squareRootConstants
  for (let chunkOffset = 0; chunkOffset < paddedBytes.length; chunkOffset += 64) {
    for (let scheduleIndex = 0; scheduleIndex < 16; scheduleIndex++)
      messageSchedule[scheduleIndex] = byteView.getUint32(chunkOffset + scheduleIndex * 4)
    for (let wordIndex = 16; wordIndex < 64; wordIndex++) {
      const earlierScheduleWord = messageSchedule[wordIndex - 15],
        recentScheduleWord = messageSchedule[wordIndex - 2]
      messageSchedule[wordIndex] =
        messageSchedule[wordIndex - 16] +
        (rotateRight(earlierScheduleWord, 7) ^ rotateRight(earlierScheduleWord, 18) ^ (earlierScheduleWord >>> 3)) +
        messageSchedule[wordIndex - 7] +
        (rotateRight(recentScheduleWord, 17) ^ rotateRight(recentScheduleWord, 19) ^ (recentScheduleWord >>> 10))
    }
    let [stateA, stateB, stateC, stateD, stateE, stateF, stateG, stateH] = hashState
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
          0
      ;(stateH = stateG),
        (stateG = stateF),
        (stateF = stateE),
        (stateE = (stateD + roundTermA) >>> 0),
        (stateD = stateC),
        (stateC = stateB),
        (stateB = stateA),
        (stateA = (roundTermA + roundTermB) >>> 0)
    }
    ;[stateA, stateB, stateC, stateD, stateE, stateF, stateG, stateH].forEach((stateWord, stateIndex) => {
      hashState[stateIndex] = (hashState[stateIndex] + stateWord) >>> 0
    })
  }
  return hashState.map((hexWord) => hexWord.toString(16).padStart(8, '0')).join('')
}

/**
 * 宿主页 → 舞台 iframe 透传的 URL 开关白名单。
 *
 * 舞台 URL 由宿主重新拼装，未列入白名单的查询参数不会到达 iframe；
 * 诊断开关与运行时回退开关（A/B 对比用）都必须登记在这里，值也按白名单收窄。
 */

const FORWARDED_STAGE_FLAGS: ReadonlyArray<readonly [name: string, allowed: readonly string[]]> = [
  ['furniture-runtime', ['compact']],
  ['reflection-detail', ['low']],
  // 回退开关：计划 0.9 移除。
  ['texture-quality', ['legacy']],
  ['reflection-motion-resolution', ['cap']],
  ['marker-position', ['legacy']],
  ['dpr-cap', ['legacy', '1.5', '1.6', '2']],
  ['max-fps', ['90', '120']],
]

const DIAGNOSTIC_STAGE_FLAGS: ReadonlyArray<readonly [name: string, allowed: readonly string[]]> = [
  ['reflection-work', ['baseline']],
]

/** 从宿主页查询串挑出允许透传给舞台的开关；诊断子开关仅在 `performance-diagnostics=1` 时透传。 */
export function forwardedStageFlags(pageQuery: URLSearchParams): Record<string, string> {
  const forwarded: Record<string, string> = {}
  const pick = (flags: typeof FORWARDED_STAGE_FLAGS) => {
    for (const [name, allowed] of flags) {
      const value = pageQuery.get(name)
      if (value !== null && allowed.includes(value)) forwarded[name] = value
    }
  }
  pick(FORWARDED_STAGE_FLAGS)
  if (pageQuery.get('performance-diagnostics') === '1') {
    forwarded['performance-diagnostics'] = '1'
    pick(DIAGNOSTIC_STAGE_FLAGS)
  }
  return forwarded
}
