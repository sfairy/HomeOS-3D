const MAX_HISTORY_SERIES_CACHE_SIZE = 512;
export const HISTORY_FETCH_TIMEOUT_MS = 12000;
export function historySeriesCacheKey(cacheEntityId, hours) {
  return String(cacheEntityId || "") + ":" + (Number(hours) || 0);
}
export function cacheHistorySeries(cache, entityId, series) {
  if (!!Array.isArray(series?.points) && series.points.length !== 0) {
    // Map 保持插入顺序，取第一个键即最久未更新的条目；循环到容量回到上限为止。
    cache.set(historySeriesCacheKey(entityId, series.hours), series);
    while (cache.size > MAX_HISTORY_SERIES_CACHE_SIZE) {
      const oldestKey = cache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      cache.delete(oldestKey);
    }
  }
}
export class HistoryRefreshCoordinator {
  constructor() {
    this.running = null;
    this.currentKey = null;
    this.pendingKey = null;
    this.pendingRun = null;
  }
  /**
   * 执行 run，必要时排队等当前请求结束：同 key 丢弃待执行项，不同 key 覆盖、只保留最新的，
   */
  request(requestKey, run) {
    if (this.running) {
      // 正在跑的就是它想要的，排队项直接作废。
      if (requestKey === this.currentKey) {
        this.pendingKey = null;
        this.pendingRun = null;
      } else if (requestKey !== this.pendingKey) {
        this.pendingKey = requestKey;
        this.pendingRun = run;
      }
      return this.running;
    }
    // 当前没有请求在跑：把自己的任务登记为待执行项，再启动排空循环。
    this.pendingKey = requestKey;
    this.pendingRun = run;
    // 排空循环：每轮取出待执行项并 await；执行期间新来的请求会写回 pending*，于是自然接续。
    const drainPendingRuns = async () => {
      while (this.pendingRun) {
        const pendingRun = this.pendingRun;
        this.currentKey = this.pendingKey;
        this.pendingKey = null;
        this.pendingRun = null;
        await pendingRun();
      }
    };
    this.running = drainPendingRuns().finally(() => {
      // finally 里清空运行标记：即使某次请求抛错也要让后续请求能重新启动，不能把队列永久卡死。
      this.running = null;
      this.currentKey = null;
    });
    return this.running;
  }
}
/**
 * 画布静态图的有界解码缓存。
 */
export class RuntimeStaticImageCache {
  /**
   * @param {number} [options.loadTimeout] 单张图的加载超时。
   */
  constructor({
    maxConcurrent: maxConcurrent = 2,
    maxDecoded: maxDecoded = 32,
    idleDelay: idleDelay = 120,
    loadTimeout: loadTimeout = 15000,
    createImage: createImage = () => new Image(),
    setTimer: setTimer = (timerCallback, delayMs) => globalThis.setTimeout(timerCallback, delayMs),
    clearTimer: clearTimer = timerHandle => globalThis.clearTimeout(timerHandle)
  } = {}) {
    this.maxConcurrent = Math.max(1, Number(maxConcurrent) || 1);
    this.maxDecoded = Math.max(1, Number(maxDecoded) || 1);
    this.idleDelay = Math.max(0, Number(idleDelay) || 0);
    this.loadTimeout = Math.max(1000, Number(loadTimeout) || 15000);
    this.createImage = createImage;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    // desiredSources 是「当前文档需要」的全集；prioritySources 是需要优先可见的子集；
    this.desiredSources = new Set();
    this.prioritySources = new Set();
    this.loadedSources = new Set();
    this.decodedImages = new Map();
    this.queue = [];
    this.activeLoads = new Map();
    this.timer = null;
    this.timerDueAt = 0;
    this.sequence = 0;
    this.stopped = false;
  }
  /**
   * 用最新的图片需求整体替换旧集合，并回收不再需要的资源。
   */
  setSources(sources = [], prioritySources = []) {
    if (!this.stopped) {
      this.desiredSources = new Set(
        (sources || []).map(desiredSource => String(desiredSource || "")).filter(Boolean)
      );
      this.prioritySources = new Set(
        (prioritySources || [])
          .map(prioritySource => String(prioritySource || ""))
          .filter(isDesiredSource => this.desiredSources.has(isDesiredSource))
      );
      // 先把排队项里已经不需要的清掉。
      this.queue = this.queue.filter(({ source: removedSource }) =>
        this.desiredSources.has(removedSource)
      );
      // 展开成数组再迭代：循环里会删 activeLoads 的项，直接遍历 Map 会漏掉条目。
      for (const [activeSource, { image: activeImage, cancel: cancelActiveLoad }] of [
        ...this.activeLoads
      ]) {
        if (!this.desiredSources.has(activeSource)) {
          activeImage.removeAttribute?.("src");
          cancelActiveLoad();
        }
      }
      for (const loadedSource of [...this.loadedSources]) {
        if (!this.desiredSources.has(loadedSource)) {
          this.loadedSources.delete(loadedSource);
        }
      }
      for (const decodedSourceKey of [...this.decodedImages.keys()]) {
        if (!this.desiredSources.has(decodedSourceKey)) {
          this.decodedImages.delete(decodedSourceKey);
        }
      }
      // 优先图先入队并标记 active（跳过空闲延迟）；已在解码缓存里的则重插一次，提到 LRU 末尾。
      for (const retainedPrioritySource of this.prioritySources) {
        if (this.decodedImages.has(retainedPrioritySource)) {
          const retainedImage = this.decodedImages.get(retainedPrioritySource);
          this.decodedImages.delete(retainedPrioritySource);
          this.decodedImages.set(retainedPrioritySource, retainedImage);
        } else {
          this.enqueue(retainedPrioritySource, {
            active: true
          });
        }
      }
      // 其余图按普通优先级入队；enqueue 自身会去重，不必先过滤。
      for (const nextDesiredSource of this.desiredSources) {
        this.enqueue(nextDesiredSource);
      }
      this.trimDecodedImages();
    }
  }
  /**
   * 把一张图加入待加载队列。
   */
  enqueue(source, { active: isActive = false } = {}) {
    // 六种「不需要再排队」的情形一次挡掉：已停止、地址为空、当前不需要、已解码、
    const normalizedSource = String(source || "");
    if (
      this.stopped ||
      !normalizedSource ||
      !this.desiredSources.has(normalizedSource) ||
      this.decodedImages.has(normalizedSource) ||
      this.activeLoads.has(normalizedSource) ||
      (this.loadedSources.has(normalizedSource) && !isActive)
    ) {
      return false;
    }
    // 已在队列里时不重复入队，但要把优先级合并进去（后到的优先请求不能被降级）。
    const staticQueuedEntry = this.queue.find(
      staticQueueCandidate => staticQueueCandidate.source === normalizedSource
    );
    if (staticQueuedEntry) {
      staticQueuedEntry.active = staticQueuedEntry.active || !!isActive;
      this.schedule(staticQueuedEntry.active ? 0 : this.idleDelay);
      return false;
    } else {
      this.queue.push({
        source: normalizedSource,
        active: !!isActive,
        sequence: this.sequence++
      });
      this.schedule(isActive ? 0 : this.idleDelay);
      return true;
    }
  }
  /**
   * 安排一次延迟排空；多次调用只保留最早到期的那个定时器。
   */
  schedule(staticScheduleDelayMs = 0) {
    if (this.stopped) {
      return;
    }
    const normalizedDelay = Math.max(0, Number(staticScheduleDelayMs) || 0);
    const dueAt = Date.now() + normalizedDelay;
    if (this.timer === null || !(dueAt >= this.timerDueAt)) {
      if (this.timer !== null) {
        this.clearTimer(this.timer);
      }
      this.timerDueAt = dueAt;
      this.timer = this.setTimer(() => {
        this.timer = null;
        this.timerDueAt = 0;
        this.drain();
      }, normalizedDelay);
    }
  }
  /**
   * 排空队列：优先图先行，其次按入队顺序，直到达到并发上限。
   */
  drain() {
    if (!this.stopped) {
      for (
      // 排序条件：active 降序（true 排前面先出队），同优先级按入队序号升序，保证先进先出。
        this.queue.sort(
          (leftQueuedEntry, rightQueuedEntry) =>
            Number(rightQueuedEntry.active) - Number(leftQueuedEntry.active) ||
            leftQueuedEntry.sequence - rightQueuedEntry.sequence
        );
        this.activeLoads.size < this.maxConcurrent && this.queue.length;
      ) {
        // 出队后要再确认一次：等待期间它可能已被别的路径加载，或已不再需要。
        const drainEntry = this.queue.shift();
        if (
          !!this.desiredSources.has(drainEntry.source) &&
          !this.decodedImages.has(drainEntry.source)
        ) {
          this.start(drainEntry);
        }
      }
    }
  }
  /**
   * 真正发起一张图的加载。
   */
  start({ source: loadingSource, active: activeRequest }) {
    if (this.stopped || !loadingSource) {
      return;
    }
    // isSettled 保证收尾只执行一次：load / error / 超时 / 取消 四条路径都可能触发。
    const image = this.createImage();
    let isSettled = false;
    let hasDecodeStarted = false;
    let timeoutHandle = null;
    const finishStaticLoad = loaded => {
        // 收尾动作：摘监听、从在途表移除，成功时把解码后的 Image 放到 LRU 末尾，最后再尝试排空。
      if (!isSettled) {
        isSettled = true;
        if (timeoutHandle !== null) {
          this.clearTimer(timeoutHandle);
        }
        image.removeEventListener?.("load", handleStaticLoad);
        image.removeEventListener?.("error", handleStaticError);
        this.activeLoads.delete(loadingSource);
        if (loaded && this.desiredSources.has(loadingSource)) {
          this.loadedSources.add(loadingSource);
          this.decodedImages.delete(loadingSource);
          this.decodedImages.set(loadingSource, image);
          this.trimDecodedImages();
        }
        this.drain();
      }
    };
    // 加载成功回调：先尝试 decode() 预热位图，无论 decode 是否可用都按成功收尾。
    const handleStaticLoad = () => {
        // 某些浏览器会在 complete 判断与 load 事件里各触发一次，用标志位防止 decode 走两遍。
      if (hasDecodeStarted) {
        return;
      }
      hasDecodeStarted = true;
      let decodePromise = null;
      try {
        decodePromise = typeof image.decode == "function" ? image.decode() : null;
      } catch {
        decodePromise = null;
      }
      if (decodePromise?.then) {
        Promise.resolve(decodePromise)
          .catch(() => {})
          .finally(() => finishStaticLoad(true));
      } else {
        finishStaticLoad(true);
      }
    };
    // 加载失败回调：这里不做重试，只释放并发位；下次 setSources 需要它时会重新入队。
    const handleStaticError = () => finishStaticLoad(false);
    // decoding=async 让解码离开主线程；fetchPriority 按优先级提示浏览器先取优先图。
    image.decoding = "async";
    image.fetchPriority = activeRequest ? "high" : "low";
    image.addEventListener?.("load", handleStaticLoad, {
      once: true
    });
    image.addEventListener?.("error", handleStaticError, {
      once: true
    });
    this.activeLoads.set(loadingSource, {
      image: image,
      cancel: () => finishStaticLoad(false)
    });
    // 先挂好监听与超时再赋 src：命中缓存时可能在赋值瞬间就同步触发 load。
    image.src = loadingSource;
    timeoutHandle = this.setTimer(() => {
      image.removeAttribute?.("src");
      finishStaticLoad(false);
    }, this.loadTimeout);
      // 已在别处加载完成的图片不会再触发 load，这里补一次，并扔进微任务保持时序一致。
    if (image.complete && Number(image.naturalWidth || 0) > 0) {
      Promise.resolve().then(handleStaticLoad);
    }
  }
  /**
   * 把已解码图片裁到上限。
   */
  trimDecodedImages() {
    while (this.decodedImages.size > this.maxDecoded) {
      const evictedSource =
        [...this.decodedImages.keys()].find(
          candidateDecodedSource => !this.prioritySources.has(candidateDecodedSource)
        ) || this.decodedImages.keys().next().value;
      if (!evictedSource) {
        break;
      }
      this.decodedImages.delete(evictedSource);
    }
  }
  /**
   * 复位为可用状态（保留已加载集合），用于运行时被重新启用。
   */
  reset() {
    this.stopped = false;
  }
  /**
   * 停止一切加载并清空全部状态，离开运行时页面时调用。
   */
  stop() {
    this.stopped = true;
    if (this.timer !== null) {
      this.clearTimer(this.timer);
    }
    this.timer = null;
    this.timerDueAt = 0;
    this.queue.length = 0;
      // 在途的图先移除 src 让浏览器取消请求，再走各自的 cancel 回调把在途账目记平。
    for (const { image: stoppedImage, cancel: cancelLoadedImage } of [
      ...this.activeLoads.values()
    ]) {
      stoppedImage.removeAttribute?.("src");
      cancelLoadedImage();
    }
    this.activeLoads.clear();
    this.desiredSources.clear();
    this.prioritySources.clear();
    this.loadedSources.clear();
    this.decodedImages.clear();
  }
}
/**
 * 特效图片加载器：图片元素是画布上真实存在且要参与渲染的 <img>，加载状态记在 dataset 上
 */
export class RuntimeEffectImageLoader {
  /**
   * @param {number} [options.loadTimeout] 单张图的加载超时。
   */
  constructor({
    maxConcurrent: effectMaxConcurrent = 4,
    idleDelay: effectIdleDelay = 160,
    loadTimeout: effectLoadTimeout = 15000,
    setTimer: effectSetTimer = (effectTimerCallback, effectDelayMs) =>
      globalThis.setTimeout(effectTimerCallback, effectDelayMs),
    clearTimer: effectClearTimer = effectTimerHandle => globalThis.clearTimeout(effectTimerHandle)
  } = {}) {
    this.maxConcurrent = Math.max(1, Number(effectMaxConcurrent) || 1);
    this.idleDelay = Math.max(0, Number(effectIdleDelay) || 0);
    this.loadTimeout = Math.max(1000, Number(effectLoadTimeout) || 15000);
    this.setTimer = effectSetTimer;
    this.clearTimer = effectClearTimer;
    this.queue = [];
    this.inFlight = 0;
    this.sequence = 0;
    this.activeLoads = new Map();
    this.timer = null;
    this.timerDueAt = 0;
    this.loadedSources = new Set();
    this.stopped = false;
  }
  /**
   * 登记某个 <img> 需要加载的地址。
   */
  enqueue(imageElement, requestedSource, { active: isPriority = false } = {}) {
    const effectSource = String(requestedSource || "");
    if (this.stopped || !imageElement || !effectSource) {
      return;
    }
    // 记下「想要加载的地址」，drain 阶段会拿它与元素当前状态比对，确认此刻仍然需要它。
    imageElement.dataset ||= {};
    imageElement.dataset.effectPendingSource = effectSource;
    if (imageElement.dataset.effectLoadedSource === effectSource) {
      delete imageElement.dataset.effectPendingSource;
      return;
    }
    if (this.loadedSources.has(effectSource)) {
      imageElement.dataset.effectLoadedSource = effectSource;
      delete imageElement.dataset.effectPendingSource;
      imageElement.src = effectSource;
      return;
    }
    // 同一元素 + 同一地址已在队列里时不重复入队，只把优先级合并上去。
    const effectQueuedEntry = this.queue.find(
      effectQueueCandidate =>
        effectQueueCandidate.image === imageElement && effectQueueCandidate.source === effectSource
    );
    if (effectQueuedEntry) {
      effectQueuedEntry.active = effectQueuedEntry.active || !!isPriority;
    } else {
      this.queue.push({
        image: imageElement,
        source: effectSource,
        active: !!isPriority,
        sequence: this.sequence++
      });
    }
    if (isPriority) {
      this.drain(true);
    } else {
      this.schedule(this.idleDelay);
    }
  }
  /**
   * 与 RuntimeStaticImageCache.schedule 同理：多次调用只保留最早到期的定时器。
   */
  schedule(effectScheduleDelayMs = 0) {
    if (this.stopped) {
      return;
    }
    const effectNormalizedDelay = Math.max(0, Number(effectScheduleDelayMs) || 0);
    const effectDueAt = Date.now() + effectNormalizedDelay;
    // 已有更早到期的定时器时保持不变，防止连续入队把加载一直往后推。
    if (this.timer === null || !(effectDueAt >= this.timerDueAt)) {
      if (this.timer !== null) {
        this.clearTimer(this.timer);
      }
      this.timerDueAt = effectDueAt;
      this.timer = this.setTimer(() => {
        this.timer = null;
        this.timerDueAt = 0;
        this.drain();
      }, effectNormalizedDelay);
    }
  }
  /**
   * 排空队列。
   */
  drain(activeOnly = false) {
    if (!this.stopped) {
      for (
        this.queue.sort(
          (leftPendingEntry, rightPendingEntry) =>
            Number(rightPendingEntry.active) - Number(leftPendingEntry.active) ||
            leftPendingEntry.sequence - rightPendingEntry.sequence
        );
        this.inFlight < this.maxConcurrent;
      ) {
        // 出队前逐项确认：地址仍是元素想要的、没有正在加载、可见性正常。
        const queueIndex = this.queue.findIndex(
          ({ image: drainImage, source: entrySource, active: entryActive }) =>
            drainImage &&
            drainImage.dataset?.effectPendingSource === entrySource &&
            !drainImage.dataset?.effectLoadingSource &&
            (!activeOnly || entryActive) &&
            (drainImage.isConnected === undefined || drainImage.isConnected)
        );
        if (queueIndex < 0) {
          break;
        }
        const [queueEntry] = this.queue.splice(queueIndex, 1);
        this.start(queueEntry);
      }
    }
  }
  /**
   * 真正发起一次特效图加载。
   */
  start({ image: pendingImage, source: pendingSource }) {
    if (
      this.stopped ||
      !pendingImage ||
      pendingImage.dataset?.effectPendingSource !== pendingSource
    ) {
      return;
    }
    // inFlight 单独计数：activeLoads 以元素为键，同一元素换地址时不会重复计数。
    this.inFlight += 1;
    pendingImage.dataset.effectLoadingSource = pendingSource;
    let isEffectSettled = false;
    let effectTimeoutHandle = null;
    const finishEffectLoad = effectLoaded => {
        // 收尾：只有「元素当前想要的地址仍是本次这个」时才认领结果，
      if (!isEffectSettled) {
        isEffectSettled = true;
        if (effectTimeoutHandle !== null) {
          this.clearTimer(effectTimeoutHandle);
        }
        pendingImage.removeEventListener?.("load", handleEffectLoad);
        pendingImage.removeEventListener?.("error", handleEffectError);
        this.activeLoads.delete(pendingImage);
        if (pendingImage.dataset?.effectLoadingSource === pendingSource) {
          delete pendingImage.dataset.effectLoadingSource;
        }
        if (effectLoaded && pendingImage.dataset?.effectPendingSource === pendingSource) {
          pendingImage.dataset.effectLoadedSource = pendingSource;
          delete pendingImage.dataset.effectPendingSource;
          this.loadedSources.add(pendingSource);
        }
        this.inFlight = Math.max(0, this.inFlight - 1);
        this.drain();
      }
    };
    // 两个事件回调只把结果转交给统一收尾函数，成功 / 失败由布尔参数区分。
    const handleEffectLoad = () => finishEffectLoad(true);
    // 失败也走同一个收尾：清掉 effectLoadingSource，元素下次入队时才能重新尝试。
    const handleEffectError = () => finishEffectLoad(false);
    pendingImage.addEventListener?.("load", handleEffectLoad, {
      once: true
    });
    pendingImage.addEventListener?.("error", handleEffectError, {
      once: true
    });
    this.activeLoads.set(pendingImage, () => finishEffectLoad(false));
    pendingImage.src = pendingSource;
    effectTimeoutHandle = this.setTimer(() => {
      pendingImage.removeAttribute?.("src");
      finishEffectLoad(false);
    }, this.loadTimeout);
    if (pendingImage.complete && Number(pendingImage.naturalWidth || 0) > 0) {
      Promise.resolve().then(handleEffectLoad);
    }
  }
  /**
   * 把某张图提到最高优先级，用于元素刚进入可见区域时插队。
   */
  promote(promotedImage) {
    const promotedSource =
      promotedImage?.dataset?.effectPendingSource || promotedImage?.dataset?.effectSource || "";
    if (promotedSource) {
      this.enqueue(promotedImage, promotedSource, {
        active: true
      });
    }
  }
  /**
   * 剪掉已离开文档的元素，停止为它们加载。
   */
  pruneDisconnected() {
    this.queue = this.queue.filter(
      ({ image: queuedImage, source: prunedSource }) =>
        queuedImage &&
        queuedImage.dataset?.effectPendingSource === prunedSource &&
        (queuedImage.isConnected === undefined || queuedImage.isConnected)
    );
    for (const [prunedImage, cancelEffectLoad] of [...this.activeLoads]) {
      if (prunedImage.isConnected === false) {
        cancelEffectLoad();
      }
    }
  }
  /**
   * 复位调度状态（保留已加载记录），清空队列后重新接受入队。
   */
  reset() {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
    }
    this.timer = null;
    this.timerDueAt = 0;
    this.queue.length = 0;
    this.activeLoads.clear();
    this.inFlight = 0;
    this.stopped = false;
  }
  /**
   * 停止加载并清空全部在途与已加载记录。
   */
  stop() {
    this.stopped = true;
    if (this.timer !== null) {
      this.clearTimer(this.timer);
    }
    this.timer = null;
    this.timerDueAt = 0;
    this.queue.length = 0;
    for (const cancelStoppedLoad of [...this.activeLoads.values()]) {
      cancelStoppedLoad();
    }
    this.activeLoads.clear();
    this.inFlight = 0;
    this.loadedSources.clear();
  }
}
/**
 * 扫地机地图图片预加载器：以「去掉查询串的地址」为键，地图图片带版本 token，同一张图只保留
 */
export class RuntimeVacuumMapImagePreloader {
  /**
   * @param {number} [options.retryDelay] 失败后的重试间隔（毫秒）。
   */
  constructor({
    maxConcurrent: vacuumMaxConcurrent = 1,
    retryDelay: retryDelay = 15000,
    createImage: vacuumCreateImage = () => new Image(),
    now: now = () => Date.now()
  } = {}) {
    this.maxConcurrent = Math.max(1, Number(vacuumMaxConcurrent) || 1);
    this.retryDelay = Math.max(1000, Number(retryDelay) || 15000);
    this.createImage = vacuumCreateImage;
    this.now = now;
    this.queue = [];
    this.queuedSources = new Set();
    this.loadedSources = new Set();
    this.loadedSourceByKey = new Map();
    this.failedAt = new Map();
    this.activeLoads = new Map();
    this.stopped = false;
  }
  /**
   * 登记一张待预加载的地图。
   */
  enqueue(candidateSource) {
    const vacuumSource = String(candidateSource || "");
    // 键取问号之前的部分：地址里的版本 token 变化时应视为同一张图，只保留最新地址。
    const sourceKey = vacuumSource.split("?", 1)[0];
    if (
      this.stopped ||
      !vacuumSource ||
      this.loadedSources.has(vacuumSource) ||
      this.queuedSources.has(vacuumSource) ||
      this.activeLoads.has(vacuumSource)
    ) {
      return false;
    }
    // 退避判断按完整地址做：换过 token 的地址算新地址，可以立即重试。
    const failedAt = Number(this.failedAt.get(vacuumSource) || 0);
    if (failedAt && this.now() - failedAt < this.retryDelay) {
      return false;
    }
    for (const failedSource of this.failedAt.keys()) {
      if (failedSource !== vacuumSource && failedSource.split("?", 1)[0] === sourceKey) {
        this.failedAt.delete(failedSource);
      }
    }
    // 同键已在队列里时原地替换成新地址，保留原有排队位置。
    const queuedIndex = this.queue.findIndex(queuedEntry => queuedEntry.key === sourceKey);
    if (queuedIndex >= 0) {
      this.queuedSources.delete(this.queue[queuedIndex].source);
      this.queue[queuedIndex] = {
        key: sourceKey,
        source: vacuumSource
      };
    } else {
      this.queue.push({
        key: sourceKey,
        source: vacuumSource
      });
    }
    this.queuedSources.add(vacuumSource);
    this.drain();
    return true;
  }
  drain() {
    if (!this.stopped) {
      while (this.activeLoads.size < this.maxConcurrent && this.queue.length) {
        const { key: entryKey, source: drainSource } = this.queue.shift();
        this.queuedSources.delete(drainSource);
        this.start(entryKey, drainSource);
      }
    }
  }
  start(loadKey, preloadSource) {
    if (this.stopped || !preloadSource) {
      return;
    }
    // 与静态图缓存不同，预加载器不做超时：地图服务慢，总比中途取消再重来要好。
    const preloaderImage = this.createImage();
    let isVacuumSettled = false;
    // 扫地机地图预加载的唯一收尾出口（load / error / 被取消），isVacuumSettled 保证
    const finishVacuumLoad = vacuumLoaded => {
      if (!isVacuumSettled) {
        isVacuumSettled = true;
        preloaderImage.removeEventListener?.("load", handleVacuumLoad);
        preloaderImage.removeEventListener?.("error", handleVacuumError);
        // 成功时把同键的旧地址从已加载集合里摘掉，保证 loadedSourceByKey 与 loadedSources 一致。
        this.activeLoads.delete(preloadSource);
        if (vacuumLoaded) {
          const previousSource = this.loadedSourceByKey.get(loadKey);
          if (previousSource && previousSource !== preloadSource) {
            this.loadedSources.delete(previousSource);
          }
          this.loadedSourceByKey.set(loadKey, preloadSource);
          this.loadedSources.add(preloadSource);
          this.failedAt.delete(preloadSource);
        } else {
          this.failedAt.set(preloadSource, this.now());
        }
        this.drain();
      }
    };
    // 预加载成功：收尾时把地址写入已加载集合，并清掉同键旧地址。
    const handleVacuumLoad = () => finishVacuumLoad(true);
    // 预加载失败：只记录失败时间戳做退避，重试交给下一次 enqueue 的 retryDelay 判断。
    const handleVacuumError = () => finishVacuumLoad(false);
    preloaderImage.decoding = "async";
    preloaderImage.fetchPriority = "low";
    preloaderImage.addEventListener?.("load", handleVacuumLoad, {
      once: true
    });
    preloaderImage.addEventListener?.("error", handleVacuumError, {
      once: true
    });
    this.activeLoads.set(preloadSource, {
      image: preloaderImage,
      cancel: () => finishVacuumLoad(false)
    });
    preloaderImage.src = preloadSource;
    if (preloaderImage.complete && Number(preloaderImage.naturalWidth || 0) > 0) {
      Promise.resolve().then(handleVacuumLoad);
    }
  }
  /**
   * 清空队列与在途记录（保留已加载与失败退避表），用于运行时重启。
   */
  reset() {
    this.queue.length = 0;
    this.queuedSources.clear();
    this.activeLoads.clear();
    this.stopped = false;
  }
  /**
   * 停止预加载并清空全部记录。
   */
  stop() {
    this.stopped = true;
    this.queue.length = 0;
    this.queuedSources.clear();
    for (const { image: loadingImage, cancel: cancelVacuumLoad } of [
      ...this.activeLoads.values()
    ]) {
      loadingImage.removeAttribute?.("src");
      cancelVacuumLoad();
    }
    this.activeLoads.clear();
    this.loadedSources.clear();
    this.loadedSourceByKey.clear();
    this.failedAt.clear();
  }
}
export function historyRequestStillRelevant(requestContext, currentContext) {
  if (requestContext.documentGeneration !== currentContext.documentGeneration) {
    return false;
  } else if (
    requestContext.shared ||
    (requestContext.pagePath !== null && requestContext.pagePath === currentContext.pagePath)
  ) {
    return true;
  } else {
    return (
      requestContext.popupId !== null &&
      requestContext.popupId === currentContext.popupId &&
      requestContext.popupGeneration === currentContext.popupGeneration
    );
  }
}
