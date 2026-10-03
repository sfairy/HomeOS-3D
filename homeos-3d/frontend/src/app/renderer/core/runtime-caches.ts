export const HISTORY_FETCH_TIMEOUT_MS = 12000;
export function historySeriesCacheKey(cacheEntityId, hours) {
  return String(cacheEntityId || "") + ":" + (Number(hours) || 0);
}
export function cacheHistorySeries(cache, entityId, series) {
  if (Array.isArray(series?.points))
    for (cache.set(historySeriesCacheKey(entityId, series.hours), series); cache.size > 512;) {
      const oldestKey = cache.keys().next().value;
      if (!oldestKey) break;
      cache.delete(oldestKey);
    }
}
// ──────────────────────────────────────────────────────────────────────
// 下面 5 个类沿用原有写法：构造函数里 `this.x = ...` 逐个赋值。
// TS 6 不再据此推断实例属性（共 261 个 TS2339），故集中声明。
// `declare` 保证零产码 —— 注意本工程 target 为 ES2022，裸声明会产码改变行为。
// ──────────────────────────────────────────────────────────────────────

/** 计时器句柄：浏览器是 number，Node 是 Timeout，故保持不透明。 */
type CacheTimerHandle = any;
/** 可注入的定时器（默认落到 globalThis.setTimeout）。 */
type CacheTimerScheduler = (callback: () => void, delayMs: number) => CacheTimerHandle;
/** 可注入的取消定时器。 */
type CacheTimerCanceller = (timerHandle: CacheTimerHandle) => void;
/** 静态图片加载队列条目。 */
type StaticImageQueueEntry = { source: string; active: boolean; sequence: number };
/** 特效图片加载队列条目。 */
type EffectImageQueueEntry = {
  image: any;
  source: string;
  active: boolean;
  sequence: number;
};
/** 进行中的图片加载，cancel 用于中止。 */
type InFlightImageLoad = { image: any; cancel: () => void; [key: string]: any };
/** 实体请求熔断表的条目。 */
type EntityRequestEntry = {
  attempts: number;
  blocked?: boolean;
  nextAt?: number;
  status?: number;
  [key: string]: any;
};

export class HistoryRefreshCoordinator {
  declare running: Promise<void> | null;
  declare currentKey: string | null;
  declare pendingKey: string | null;
  declare pendingRun: (() => any) | null;

  constructor() {
    ((this.running = null),
      (this.currentKey = null),
      (this.pendingKey = null),
      (this.pendingRun = null));
  }
  ["request"](requestKey, run) {
    if (this.running)
      return (
        requestKey === this.currentKey
          ? ((this.pendingKey = null), (this.pendingRun = null))
          : requestKey !== this.pendingKey &&
            ((this.pendingKey = requestKey), (this.pendingRun = run)),
        this.running
      );
    ((this.pendingKey = requestKey), (this.pendingRun = run));
    const drainPendingRuns = async () => {
      for (; this.pendingRun;) {
        const pendingRun = this.pendingRun;
        ((this.currentKey = this.pendingKey),
          (this.pendingKey = null),
          (this.pendingRun = null),
          await pendingRun());
      }
    };
    return (
      (this.running = drainPendingRuns().finally(() => {
        ((this.running = null), (this.currentKey = null));
      })),
      this.running
    );
  }
}
export class RuntimeStaticImageCache {
  declare maxConcurrent: number;
  declare maxDecoded: number;
  declare idleDelay: number;
  declare loadTimeout: number;
  declare createImage: () => HTMLImageElement;
  declare setTimer: CacheTimerScheduler;
  declare clearTimer: CacheTimerCanceller;
  declare desiredSources: Set<string>;
  declare prioritySources: Set<string>;
  declare loadedSources: Set<string>;
  declare decodedImages: Map<string, HTMLImageElement>;
  declare queue: StaticImageQueueEntry[];
  declare activeLoads: Map<string, InFlightImageLoad>;
  declare timer: CacheTimerHandle;
  declare timerDueAt: number;
  declare sequence: number;
  declare stopped: boolean;

  constructor({
    maxConcurrent: maxConcurrent = 2,
    maxDecoded: maxDecoded = 32,
    idleDelay: idleDelay = 120,
    loadTimeout: loadTimeout = 15000,
    createImage: createImage = () => new Image(),
    setTimer: setTimer = (timerCallback, delayMs) => globalThis.setTimeout(timerCallback, delayMs),
    clearTimer: clearTimer = (timerHandle) => globalThis.clearTimeout(timerHandle),
  } = {}) {
    ((this.maxConcurrent = Math.max(1, Number(maxConcurrent) || 1)),
      (this.maxDecoded = Math.max(1, Number(maxDecoded) || 1)),
      (this.idleDelay = Math.max(0, Number(idleDelay) || 0)),
      (this.loadTimeout = Math.max(1000, Number(loadTimeout) || 15000)),
      (this.createImage = createImage),
      (this.setTimer = setTimer),
      (this.clearTimer = clearTimer),
      (this.desiredSources = new Set()),
      (this.prioritySources = new Set()),
      (this.loadedSources = new Set()),
      (this.decodedImages = new Map()),
      (this.queue = []),
      (this.activeLoads = new Map()),
      (this.timer = null),
      (this.timerDueAt = 0),
      (this.sequence = 0),
      (this.stopped = false));
  }
  ["setSources"](sources = [], prioritySources = []) {
    if (!this.stopped) {
      ((this.desiredSources = new Set(
        (sources || []).map((desiredSource) => String(desiredSource || "")).filter(Boolean),
      )),
        (this.prioritySources = new Set(
          (prioritySources || [])
            .map((prioritySource) => String(prioritySource || ""))
            .filter((isDesiredSource) => this.desiredSources.has(isDesiredSource)),
        )),
        (this.queue = this.queue.filter(({ source: removedSource }) =>
          this.desiredSources.has(removedSource),
        )));
      for (const [activeSource, { image: activeImage, cancel: cancelActiveLoad }] of [
        ...this.activeLoads,
      ])
        this.desiredSources.has(activeSource) ||
          (activeImage.removeAttribute?.("src"), cancelActiveLoad());
      for (const loadedSource of [...this.loadedSources])
        this.desiredSources.has(loadedSource) || this.loadedSources.delete(loadedSource);
      for (const decodedSourceKey of [...this.decodedImages.keys()])
        this.desiredSources.has(decodedSourceKey) || this.decodedImages.delete(decodedSourceKey);
      for (const retainedPrioritySource of this.prioritySources)
        if (this.decodedImages.has(retainedPrioritySource)) {
          const retainedImage = this.decodedImages.get(retainedPrioritySource);
          (this.decodedImages.delete(retainedPrioritySource),
            this.decodedImages.set(retainedPrioritySource, retainedImage));
        } else
          this.enqueue(retainedPrioritySource, {
            active: true,
          });
      for (const nextDesiredSource of this.desiredSources) this.enqueue(nextDesiredSource);
      this.trimDecodedImages();
    }
  }
  ["enqueue"](source, { active: isActive = false } = {}) {
    const normalizedSource = String(source || "");
    if (
      this.stopped ||
      !normalizedSource ||
      !this.desiredSources.has(normalizedSource) ||
      this.decodedImages.has(normalizedSource) ||
      this.activeLoads.has(normalizedSource) ||
      (this.loadedSources.has(normalizedSource) && !isActive)
    )
      return false;
    const staticQueuedEntry = this.queue.find(
      (staticQueueCandidate) => staticQueueCandidate.source === normalizedSource,
    );
    return staticQueuedEntry
      ? ((staticQueuedEntry.active = staticQueuedEntry.active || !!isActive),
        this.schedule(staticQueuedEntry.active ? 0 : this.idleDelay),
        false)
      : (this.queue.push({
          source: normalizedSource,
          active: !!isActive,
          sequence: this.sequence++,
        }),
        this.schedule(isActive ? 0 : this.idleDelay),
        true);
  }
  ["schedule"](staticScheduleDelayMs = 0) {
    if (this.stopped) return;
    const normalizedDelay = Math.max(0, Number(staticScheduleDelayMs) || 0),
      dueAt = Date.now() + normalizedDelay;
    (this.timer !== null && dueAt >= this.timerDueAt) ||
      (this.timer !== null && this.clearTimer(this.timer),
      (this.timerDueAt = dueAt),
      (this.timer = this.setTimer(() => {
        ((this.timer = null), (this.timerDueAt = 0), this.drain());
      }, normalizedDelay)));
  }
  ["drain"]() {
    if (!this.stopped)
      for (
        this.queue.sort(
          (leftQueuedEntry, rightQueuedEntry) =>
            Number(rightQueuedEntry.active) - Number(leftQueuedEntry.active) ||
            leftQueuedEntry.sequence - rightQueuedEntry.sequence,
        );
        this.activeLoads.size < this.maxConcurrent && this.queue.length;
      ) {
        const drainEntry = this.queue.shift();
        !this.desiredSources.has(drainEntry.source) ||
          this.decodedImages.has(drainEntry.source) ||
          this.start(drainEntry);
      }
  }
  ["start"]({ source: loadingSource, active: activeRequest }) {
    if (this.stopped || !loadingSource) return;
    const staticImage = this.createImage();
    let isSettled = false,
      hasDecodeStarted = false,
      timeoutHandle = null;
    const finishStaticLoad = (loaded) => {
        isSettled ||
          ((isSettled = true),
          timeoutHandle !== null && this.clearTimer(timeoutHandle),
          staticImage.removeEventListener?.("load", handleStaticLoad),
          staticImage.removeEventListener?.("error", handleStaticError),
          this.activeLoads.delete(loadingSource),
          loaded &&
            this.desiredSources.has(loadingSource) &&
            (this.loadedSources.add(loadingSource),
            this.decodedImages.delete(loadingSource),
            this.decodedImages.set(loadingSource, staticImage),
            this.trimDecodedImages()),
          this.drain());
      },
      handleStaticLoad = () => {
        if (hasDecodeStarted) return;
        hasDecodeStarted = true;
        let decodePromise = null;
        try {
          decodePromise = typeof staticImage.decode == "function" ? staticImage.decode() : null;
        } catch {
          decodePromise = null;
        }
        decodePromise?.then
          ? Promise.resolve(decodePromise)
              .catch(() => {})
              .finally(() => finishStaticLoad(true))
          : finishStaticLoad(true);
      },
      handleStaticError = () => finishStaticLoad(false);
    ((staticImage.decoding = "async"),
      (staticImage.fetchPriority = activeRequest ? "high" : "low"),
      staticImage.addEventListener?.("load", handleStaticLoad, {
        once: true,
      }),
      staticImage.addEventListener?.("error", handleStaticError, {
        once: true,
      }),
      this.activeLoads.set(loadingSource, {
        image: staticImage,
        cancel: () => finishStaticLoad(false),
      }),
      (staticImage.src = loadingSource),
      (timeoutHandle = this.setTimer(() => {
        (staticImage.removeAttribute?.("src"), finishStaticLoad(false));
      }, this.loadTimeout)),
      staticImage.complete &&
        Number(staticImage.naturalWidth || 0) > 0 &&
        Promise.resolve().then(handleStaticLoad));
  }
  ["trimDecodedImages"]() {
    for (; this.decodedImages.size > this.maxDecoded;) {
      const evictedSource =
        [...this.decodedImages.keys()].find(
          (candidateDecodedSource) => !this.prioritySources.has(candidateDecodedSource),
        ) || this.decodedImages.keys().next().value;
      if (!evictedSource) break;
      this.decodedImages.delete(evictedSource);
    }
  }
  ["reset"]() {
    this.stopped = false;
  }
  ["stop"]() {
    ((this.stopped = true),
      this.timer !== null && this.clearTimer(this.timer),
      (this.timer = null),
      (this.timerDueAt = 0),
      (this.queue.length = 0));
    for (const { image: stoppedImage, cancel: cancelLoadedImage } of [...this.activeLoads.values()])
      (stoppedImage.removeAttribute?.("src"), cancelLoadedImage());
    (this.activeLoads.clear(),
      this.desiredSources.clear(),
      this.prioritySources.clear(),
      this.loadedSources.clear(),
      this.decodedImages.clear());
  }
}
export class RuntimeEffectImageLoader {
  declare maxConcurrent: number;
  declare idleDelay: number;
  declare loadTimeout: number;
  declare setTimer: CacheTimerScheduler;
  declare clearTimer: CacheTimerCanceller;
  declare queue: EffectImageQueueEntry[];
  declare inFlight: number;
  declare sequence: number;
  declare activeLoads: Map<any, () => void>;
  declare timer: CacheTimerHandle;
  declare timerDueAt: number;
  declare loadedSources: Set<string>;
  declare stopped: boolean;

  constructor({
    maxConcurrent: effectMaxConcurrent = 4,
    idleDelay: effectIdleDelay = 160,
    loadTimeout: effectLoadTimeout = 15000,
    setTimer: effectSetTimer = (effectTimerCallback, effectDelayMs) =>
      globalThis.setTimeout(effectTimerCallback, effectDelayMs),
    clearTimer: effectClearTimer = (effectTimerHandle) =>
      globalThis.clearTimeout(effectTimerHandle),
  } = {}) {
    ((this.maxConcurrent = Math.max(1, Number(effectMaxConcurrent) || 1)),
      (this.idleDelay = Math.max(0, Number(effectIdleDelay) || 0)),
      (this.loadTimeout = Math.max(1000, Number(effectLoadTimeout) || 15000)),
      (this.setTimer = effectSetTimer),
      (this.clearTimer = effectClearTimer),
      (this.queue = []),
      (this.inFlight = 0),
      (this.sequence = 0),
      (this.activeLoads = new Map()),
      (this.timer = null),
      (this.timerDueAt = 0),
      (this.loadedSources = new Set()),
      (this.stopped = false));
  }
  ["enqueue"](imageElement, requestedSource, { active: isPriority = false } = {}) {
    const effectSource = String(requestedSource || "");
    if (this.stopped || !imageElement || !effectSource) return;
    if (
      (imageElement.dataset || (imageElement.dataset = {}),
      (imageElement.dataset.effectPendingSource = effectSource),
      imageElement.dataset.effectLoadedSource === effectSource)
    ) {
      delete imageElement.dataset.effectPendingSource;
      return;
    }
    if (this.loadedSources.has(effectSource)) {
      ((imageElement.dataset.effectLoadedSource = effectSource),
        delete imageElement.dataset.effectPendingSource,
        (imageElement.src = effectSource));
      return;
    }
    const effectQueuedEntry = this.queue.find(
      (effectQueueCandidate) =>
        effectQueueCandidate.image === imageElement && effectQueueCandidate.source === effectSource,
    );
    (effectQueuedEntry
      ? (effectQueuedEntry.active = effectQueuedEntry.active || !!isPriority)
      : this.queue.push({
          image: imageElement,
          source: effectSource,
          active: !!isPriority,
          sequence: this.sequence++,
        }),
      isPriority ? this.drain(true) : this.schedule(this.idleDelay));
  }
  ["schedule"](effectScheduleDelayMs = 0) {
    if (this.stopped) return;
    const effectNormalizedDelay = Math.max(0, Number(effectScheduleDelayMs) || 0),
      effectDueAt = Date.now() + effectNormalizedDelay;
    (this.timer !== null && effectDueAt >= this.timerDueAt) ||
      (this.timer !== null && this.clearTimer(this.timer),
      (this.timerDueAt = effectDueAt),
      (this.timer = this.setTimer(() => {
        ((this.timer = null), (this.timerDueAt = 0), this.drain());
      }, effectNormalizedDelay)));
  }
  ["drain"](activeOnly = false) {
    if (!this.stopped)
      for (
        this.queue.sort(
          (leftPendingEntry, rightPendingEntry) =>
            Number(rightPendingEntry.active) - Number(leftPendingEntry.active) ||
            leftPendingEntry.sequence - rightPendingEntry.sequence,
        );
        this.inFlight < this.maxConcurrent;
      ) {
        const queueIndex = this.queue.findIndex(
          ({ image: drainImage, source: entrySource, active: entryActive }) =>
            drainImage &&
            drainImage.dataset?.effectPendingSource === entrySource &&
            !drainImage.dataset?.effectLoadingSource &&
            (!activeOnly || entryActive) &&
            (drainImage.isConnected === undefined || drainImage.isConnected),
        );
        if (queueIndex < 0) break;
        const [queueEntry] = this.queue.splice(queueIndex, 1);
        this.start(queueEntry);
      }
  }
  ["start"]({ image: pendingImage, source: pendingSource }) {
    if (
      this.stopped ||
      !pendingImage ||
      pendingImage.dataset?.effectPendingSource !== pendingSource
    )
      return;
    ((this.inFlight += 1), (pendingImage.dataset.effectLoadingSource = pendingSource));
    let isEffectSettled = false,
      effectTimeoutHandle = null;
    const finishEffectLoad = (effectLoaded) => {
        isEffectSettled ||
          ((isEffectSettled = true),
          effectTimeoutHandle !== null && this.clearTimer(effectTimeoutHandle),
          pendingImage.removeEventListener?.("load", handleEffectLoad),
          pendingImage.removeEventListener?.("error", handleEffectError),
          this.activeLoads.delete(pendingImage),
          pendingImage.dataset?.effectLoadingSource === pendingSource &&
            delete pendingImage.dataset.effectLoadingSource,
          effectLoaded &&
            pendingImage.dataset?.effectPendingSource === pendingSource &&
            ((pendingImage.dataset.effectLoadedSource = pendingSource),
            delete pendingImage.dataset.effectPendingSource,
            this.loadedSources.add(pendingSource)),
          (this.inFlight = Math.max(0, this.inFlight - 1)),
          this.drain());
      },
      handleEffectLoad = () => finishEffectLoad(true),
      handleEffectError = () => finishEffectLoad(false);
    (pendingImage.addEventListener?.("load", handleEffectLoad, {
      once: true,
    }),
      pendingImage.addEventListener?.("error", handleEffectError, {
        once: true,
      }),
      this.activeLoads.set(pendingImage, () => finishEffectLoad(false)),
      (pendingImage.src = pendingSource),
      (effectTimeoutHandle = this.setTimer(() => {
        (pendingImage.removeAttribute?.("src"), finishEffectLoad(false));
      }, this.loadTimeout)),
      pendingImage.complete &&
        Number(pendingImage.naturalWidth || 0) > 0 &&
        Promise.resolve().then(handleEffectLoad));
  }
  ["promote"](promotedImage) {
    const promotedSource =
      promotedImage?.dataset?.effectPendingSource || promotedImage?.dataset?.effectSource || "";
    promotedSource &&
      this.enqueue(promotedImage, promotedSource, {
        active: true,
      });
  }
  ["pruneDisconnected"]() {
    this.queue = this.queue.filter(
      ({ image: queuedImage, source: prunedSource }) =>
        queuedImage &&
        queuedImage.dataset?.effectPendingSource === prunedSource &&
        (queuedImage.isConnected === undefined || queuedImage.isConnected),
    );
    for (const [prunedImage, cancelEffectLoad] of [...this.activeLoads])
      prunedImage.isConnected === false && cancelEffectLoad();
  }
  ["reset"]() {
    (this.timer !== null && this.clearTimer(this.timer),
      (this.timer = null),
      (this.timerDueAt = 0),
      (this.queue.length = 0),
      this.activeLoads.clear(),
      (this.inFlight = 0),
      (this.stopped = false));
  }
  ["stop"]() {
    ((this.stopped = true),
      this.timer !== null && this.clearTimer(this.timer),
      (this.timer = null),
      (this.timerDueAt = 0),
      (this.queue.length = 0));
    for (const cancelStoppedLoad of [...this.activeLoads.values()]) cancelStoppedLoad();
    (this.activeLoads.clear(), (this.inFlight = 0), this.loadedSources.clear());
  }
}
export class RuntimeVacuumMapImagePreloader {
  declare maxConcurrent: number;
  declare retryDelay: number;
  declare createImage: () => HTMLImageElement;
  declare now: () => number;
  declare queue: { key: string; source: string }[];
  declare queuedSources: Set<string>;
  declare loadedSources: Set<string>;
  declare loadedSourceByKey: Map<string, any>;
  declare failedAt: Map<string, number>;
  declare activeLoads: Map<string, InFlightImageLoad>;
  declare stopped: boolean;

  constructor({
    maxConcurrent: vacuumMaxConcurrent = 1,
    retryDelay: retryDelay = 15000,
    createImage: vacuumCreateImage = () => new Image(),
    now: now = () => Date.now(),
  } = {}) {
    ((this.maxConcurrent = Math.max(1, Number(vacuumMaxConcurrent) || 1)),
      (this.retryDelay = Math.max(1000, Number(retryDelay) || 15000)),
      (this.createImage = vacuumCreateImage),
      (this.now = now),
      (this.queue = []),
      (this.queuedSources = new Set()),
      (this.loadedSources = new Set()),
      (this.loadedSourceByKey = new Map()),
      (this.failedAt = new Map()),
      (this.activeLoads = new Map()),
      (this.stopped = false));
  }
  ["enqueue"](candidateSource) {
    const vacuumSource = String(candidateSource || ""),
      sourceKey = vacuumSource.split("?", 1)[0];
    if (
      this.stopped ||
      !vacuumSource ||
      this.loadedSources.has(vacuumSource) ||
      this.queuedSources.has(vacuumSource) ||
      this.activeLoads.has(vacuumSource)
    )
      return false;
    const failedAt = Number(this.failedAt.get(vacuumSource) || 0);
    if (failedAt && this.now() - failedAt < this.retryDelay) return false;
    for (const failedSource of this.failedAt.keys())
      failedSource !== vacuumSource &&
        failedSource.split("?", 1)[0] === sourceKey &&
        this.failedAt.delete(failedSource);
    const queuedIndex = this.queue.findIndex((queuedEntry) => queuedEntry.key === sourceKey);
    return (
      queuedIndex >= 0
        ? (this.queuedSources.delete(this.queue[queuedIndex].source),
          (this.queue[queuedIndex] = {
            key: sourceKey,
            source: vacuumSource,
          }))
        : this.queue.push({
            key: sourceKey,
            source: vacuumSource,
          }),
      this.queuedSources.add(vacuumSource),
      this.drain(),
      true
    );
  }
  ["drain"]() {
    if (!this.stopped)
      for (; this.activeLoads.size < this.maxConcurrent && this.queue.length;) {
        const { key: entryKey, source: drainSource } = this.queue.shift();
        (this.queuedSources.delete(drainSource), this.start(entryKey, drainSource));
      }
  }
  ["start"](loadKey, preloadSource) {
    if (this.stopped || !preloadSource) return;
    const preloaderImage = this.createImage();
    let isVacuumSettled = false;
    const finishVacuumLoad = (vacuumLoaded) => {
        if (!isVacuumSettled) {
          if (
            ((isVacuumSettled = true),
            preloaderImage.removeEventListener?.("load", handleVacuumLoad),
            preloaderImage.removeEventListener?.("error", handleVacuumError),
            this.activeLoads.delete(preloadSource),
            vacuumLoaded)
          ) {
            const previousSource = this.loadedSourceByKey.get(loadKey);
            (previousSource &&
              previousSource !== preloadSource &&
              this.loadedSources.delete(previousSource),
              this.loadedSourceByKey.set(loadKey, preloadSource),
              this.loadedSources.add(preloadSource),
              this.failedAt.delete(preloadSource));
          } else this.failedAt.set(preloadSource, this.now());
          this.drain();
        }
      },
      handleVacuumLoad = () => finishVacuumLoad(true),
      handleVacuumError = () => finishVacuumLoad(false);
    ((preloaderImage.decoding = "async"),
      (preloaderImage.fetchPriority = "low"),
      preloaderImage.addEventListener?.("load", handleVacuumLoad, {
        once: true,
      }),
      preloaderImage.addEventListener?.("error", handleVacuumError, {
        once: true,
      }),
      this.activeLoads.set(preloadSource, {
        image: preloaderImage,
        cancel: () => finishVacuumLoad(false),
      }),
      (preloaderImage.src = preloadSource),
      preloaderImage.complete &&
        Number(preloaderImage.naturalWidth || 0) > 0 &&
        Promise.resolve().then(handleVacuumLoad));
  }
  ["reset"]() {
    ((this.queue.length = 0),
      this.queuedSources.clear(),
      this.activeLoads.clear(),
      (this.stopped = false));
  }
  ["stop"]() {
    ((this.stopped = true), (this.queue.length = 0), this.queuedSources.clear());
    for (const { image: loadingImage, cancel: cancelVacuumLoad } of [...this.activeLoads.values()])
      (loadingImage.removeAttribute?.("src"), cancelVacuumLoad());
    (this.activeLoads.clear(),
      this.loadedSources.clear(),
      this.loadedSourceByKey.clear(),
      this.failedAt.clear());
  }
}
export function historyRequestStillRelevant(requestOptions, currentOptions) {
  return requestOptions.documentGeneration !== currentOptions.documentGeneration
    ? false
    : requestOptions.shared ||
        (requestOptions.pagePath !== null && requestOptions.pagePath === currentOptions.pagePath)
      ? true
      : requestOptions.popupId !== null &&
        requestOptions.popupId === currentOptions.popupId &&
        requestOptions.popupGeneration === currentOptions.popupGeneration;
}
export class EntityRequestPolicy {
  declare entries: Map<string, EntityRequestEntry>;
  declare authBlocked: boolean;

  constructor() {
    ((this.entries = new Map()), (this.authBlocked = false));
  }
  ["canRequest"](requestEntityId, nowMs = Date.now()) {
    const entityEntry = this.entries.get(requestEntityId);
    return (
      !this.authBlocked && (!entityEntry || (!entityEntry.blocked && nowMs >= entityEntry.nextAt))
    );
  }
  ["success"](succeededEntityId) {
    this.entries.delete(succeededEntityId);
  }
  ["failure"](failedEntityId, statusCode = 0, timestampMs = Date.now()) {
    const attempts = (this.entries.get(failedEntityId)?.attempts || 0) + 1,
      isBlocked = [401, 403, 404, 410].includes(statusCode);
    statusCode === 401 && (this.authBlocked = true);
    const retryDelayMs = Math.min(300000, 1000 * 2 ** Math.min(attempts - 1, 9));
    return (
      this.entries.set(failedEntityId, {
        attempts: attempts,
        blocked: isBlocked,
        status: statusCode,
        nextAt: isBlocked ? Infinity : timestampMs + retryDelayMs,
      }),
      isBlocked ? Infinity : retryDelayMs
    );
  }
  ["resume"]() {
    ((this.authBlocked = false), this.entries.clear());
  }
  ["authenticated"]() {
    this.authBlocked = false;
    for (const [expiredEntityId, expiredEntry] of this.entries)
      expiredEntry.status === 401 && this.entries.delete(expiredEntityId);
  }
  ["retain"](retainedEntityIdSet) {
    for (const retainedEntityId of this.entries.keys())
      retainedEntityIdSet.has(retainedEntityId) || this.entries.delete(retainedEntityId);
  }
}
