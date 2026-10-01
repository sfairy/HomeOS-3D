const l = 512;
export const HISTORY_FETCH_TIMEOUT_MS = 12000;
export function historySeriesCacheKey(arg1, arg2) {
  return String(arg1 || "") + ":" + (Number(arg2) || 0);
}
export function cacheHistorySeries(arg3, arg4, arg5) {
  if (Array.isArray(arg5?.points))
    for (arg3.set(historySeriesCacheKey(arg4, arg5.hours), arg5); arg3.size > 512;) {
      const value1 = arg3.keys().next().value;
      if (!value1) break;
      arg3.delete(value1);
    }
}
export class HistoryRefreshCoordinator {
  constructor() {
    ((this.running = null),
      (this.currentKey = null),
      (this.pendingKey = null),
      (this.pendingRun = null));
  }
  ["request"](arg6, arg7) {
    if (this.running)
      return (
        arg6 === this.currentKey
          ? ((this.pendingKey = null), (this.pendingRun = null))
          : arg6 !== this.pendingKey && ((this.pendingKey = arg6), (this.pendingRun = arg7)),
        this.running
      );
    ((this.pendingKey = arg6), (this.pendingRun = arg7));
    const fn1 = async () => {
      for (; this.pendingRun;) {
        const value2 = this.pendingRun;
        ((this.currentKey = this.pendingKey),
          (this.pendingKey = null),
          (this.pendingRun = null),
          await value2());
      }
    };
    return (
      (this.running = fn1().finally(() => {
        ((this.running = null), (this.currentKey = null));
      })),
      this.running
    );
  }
}
export class RuntimeStaticImageCache {
  constructor({
    maxConcurrent: arg8 = 2,
    maxDecoded: arg9 = 32,
    idleDelay: arg10 = 120,
    loadTimeout: arg11 = 15000,
    createImage: arg12 = () => new Image(),
    setTimer: arg13 = (arg15, arg16) => globalThis.setTimeout(arg15, arg16),
    clearTimer: arg14 = (arg17) => globalThis.clearTimeout(arg17),
  } = {}) {
    ((this.maxConcurrent = Math.max(1, Number(arg8) || 1)),
      (this.maxDecoded = Math.max(1, Number(arg9) || 1)),
      (this.idleDelay = Math.max(0, Number(arg10) || 0)),
      (this.loadTimeout = Math.max(1000, Number(arg11) || 15000)),
      (this.createImage = arg12),
      (this.setTimer = arg13),
      (this.clearTimer = arg14),
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
  ["setSources"](arg18 = [], arg19 = []) {
    if (!this.stopped) {
      ((this.desiredSources = new Set(
        (arg18 || []).map((arg20) => String(arg20 || "")).filter(Boolean),
      )),
        (this.prioritySources = new Set(
          (arg19 || [])
            .map((arg21) => String(arg21 || ""))
            .filter((arg22) => this.desiredSources.has(arg22)),
        )),
        (this.queue = this.queue.filter(({ source: arg23 }) => this.desiredSources.has(arg23))));
      for (const [value3, { image: value4, cancel: value5 }] of [...this.activeLoads])
        this.desiredSources.has(value3) || (value4.removeAttribute?.("src"), value5());
      for (const value6 of [...this.loadedSources])
        this.desiredSources.has(value6) || this.loadedSources.delete(value6);
      for (const value7 of [...this.decodedImages.keys()])
        this.desiredSources.has(value7) || this.decodedImages.delete(value7);
      for (const value8 of this.prioritySources)
        if (this.decodedImages.has(value8)) {
          const value9 = this.decodedImages.get(value8);
          (this.decodedImages.delete(value8), this.decodedImages.set(value8, value9));
        } else
          this.enqueue(value8, {
            active: true,
          });
      for (const value10 of this.desiredSources) this.enqueue(value10);
      this.trimDecodedImages();
    }
  }
  ["enqueue"](arg24, { active: arg25 = false } = {}) {
    const value11 = String(arg24 || "");
    if (
      this.stopped ||
      !value11 ||
      !this.desiredSources.has(value11) ||
      this.decodedImages.has(value11) ||
      this.activeLoads.has(value11) ||
      (this.loadedSources.has(value11) && !arg25)
    )
      return false;
    const value12 = this.queue.find((arg26) => arg26.source === value11);
    return value12
      ? ((value12.active = value12.active || !!arg25),
        this.schedule(value12.active ? 0 : this.idleDelay),
        false)
      : (this.queue.push({
          source: value11,
          active: !!arg25,
          sequence: this.sequence++,
        }),
        this.schedule(arg25 ? 0 : this.idleDelay),
        true);
  }
  ["schedule"](arg27 = 0) {
    if (this.stopped) return;
    const value13 = Math.max(0, Number(arg27) || 0),
      value14 = Date.now() + value13;
    (this.timer !== null && value14 >= this.timerDueAt) ||
      (this.timer !== null && this.clearTimer(this.timer),
      (this.timerDueAt = value14),
      (this.timer = this.setTimer(() => {
        ((this.timer = null), (this.timerDueAt = 0), this.drain());
      }, value13)));
  }
  ["drain"]() {
    if (!this.stopped)
      for (
        this.queue.sort(
          (arg28, arg29) =>
            Number(arg29.active) - Number(arg28.active) || arg28.sequence - arg29.sequence,
        );
        this.activeLoads.size < this.maxConcurrent && this.queue.length;
      ) {
        const value15 = this.queue.shift();
        !this.desiredSources.has(value15.source) ||
          this.decodedImages.has(value15.source) ||
          this.start(value15);
      }
  }
  ["start"]({ source: arg30, active: arg31 }) {
    if (this.stopped || !arg30) return;
    const value16 = this.createImage();
    let value17 = false,
      value18 = false,
      value19 = null;
    const fn2 = (arg32) => {
        value17 ||
          ((value17 = true),
          value19 !== null && this.clearTimer(value19),
          value16.removeEventListener?.("load", fn3),
          value16.removeEventListener?.("error", fn4),
          this.activeLoads.delete(arg30),
          arg32 &&
            this.desiredSources.has(arg30) &&
            (this.loadedSources.add(arg30),
            this.decodedImages.delete(arg30),
            this.decodedImages.set(arg30, value16),
            this.trimDecodedImages()),
          this.drain());
      },
      fn3 = () => {
        if (value18) return;
        value18 = true;
        let value20 = null;
        try {
          value20 = typeof value16.decode == "function" ? value16.decode() : null;
        } catch {
          value20 = null;
        }
        value20?.then
          ? Promise.resolve(value20)
              .catch(() => {})
              .finally(() => fn2(true))
          : fn2(true);
      },
      fn4 = () => fn2(false);
    ((value16.decoding = "async"),
      (value16.fetchPriority = arg31 ? "high" : "low"),
      value16.addEventListener?.("load", fn3, {
        once: true,
      }),
      value16.addEventListener?.("error", fn4, {
        once: true,
      }),
      this.activeLoads.set(arg30, {
        image: value16,
        cancel: () => fn2(false),
      }),
      (value16.src = arg30),
      (value19 = this.setTimer(() => {
        (value16.removeAttribute?.("src"), fn2(false));
      }, this.loadTimeout)),
      value16.complete && Number(value16.naturalWidth || 0) > 0 && Promise.resolve().then(fn3));
  }
  ["trimDecodedImages"]() {
    for (; this.decodedImages.size > this.maxDecoded;) {
      const value21 =
        [...this.decodedImages.keys()].find((arg33) => !this.prioritySources.has(arg33)) ||
        this.decodedImages.keys().next().value;
      if (!value21) break;
      this.decodedImages.delete(value21);
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
    for (const { image: value22, cancel: value23 } of [...this.activeLoads.values()])
      (value22.removeAttribute?.("src"), value23());
    (this.activeLoads.clear(),
      this.desiredSources.clear(),
      this.prioritySources.clear(),
      this.loadedSources.clear(),
      this.decodedImages.clear());
  }
}
export class RuntimeEffectImageLoader {
  constructor({
    maxConcurrent: arg34 = 4,
    idleDelay: arg35 = 160,
    loadTimeout: arg36 = 15000,
    setTimer: arg37 = (arg39, arg40) => globalThis.setTimeout(arg39, arg40),
    clearTimer: arg38 = (arg41) => globalThis.clearTimeout(arg41),
  } = {}) {
    ((this.maxConcurrent = Math.max(1, Number(arg34) || 1)),
      (this.idleDelay = Math.max(0, Number(arg35) || 0)),
      (this.loadTimeout = Math.max(1000, Number(arg36) || 15000)),
      (this.setTimer = arg37),
      (this.clearTimer = arg38),
      (this.queue = []),
      (this.inFlight = 0),
      (this.sequence = 0),
      (this.activeLoads = new Map()),
      (this.timer = null),
      (this.timerDueAt = 0),
      (this.loadedSources = new Set()),
      (this.stopped = false));
  }
  ["enqueue"](arg42, arg43, { active: arg44 = false } = {}) {
    const value24 = String(arg43 || "");
    if (this.stopped || !arg42 || !value24) return;
    if (
      (arg42.dataset || (arg42.dataset = {}),
      (arg42.dataset.effectPendingSource = value24),
      arg42.dataset.effectLoadedSource === value24)
    ) {
      delete arg42.dataset.effectPendingSource;
      return;
    }
    if (this.loadedSources.has(value24)) {
      ((arg42.dataset.effectLoadedSource = value24),
        delete arg42.dataset.effectPendingSource,
        (arg42.src = value24));
      return;
    }
    const value25 = this.queue.find((arg45) => arg45.image === arg42 && arg45.source === value24);
    (value25
      ? (value25.active = value25.active || !!arg44)
      : this.queue.push({
          image: arg42,
          source: value24,
          active: !!arg44,
          sequence: this.sequence++,
        }),
      arg44 ? this.drain(true) : this.schedule(this.idleDelay));
  }
  ["schedule"](arg46 = 0) {
    if (this.stopped) return;
    const value26 = Math.max(0, Number(arg46) || 0),
      value27 = Date.now() + value26;
    (this.timer !== null && value27 >= this.timerDueAt) ||
      (this.timer !== null && this.clearTimer(this.timer),
      (this.timerDueAt = value27),
      (this.timer = this.setTimer(() => {
        ((this.timer = null), (this.timerDueAt = 0), this.drain());
      }, value26)));
  }
  ["drain"](arg47 = false) {
    if (!this.stopped)
      for (
        this.queue.sort(
          (arg48, arg49) =>
            Number(arg49.active) - Number(arg48.active) || arg48.sequence - arg49.sequence,
        );
        this.inFlight < this.maxConcurrent;
      ) {
        const value28 = this.queue.findIndex(
          ({ image: arg50, source: arg51, active: arg52 }) =>
            arg50 &&
            arg50.dataset?.effectPendingSource === arg51 &&
            !arg50.dataset?.effectLoadingSource &&
            (!arg47 || arg52) &&
            (arg50.isConnected === undefined || arg50.isConnected),
        );
        if (value28 < 0) break;
        const [value29] = this.queue.splice(value28, 1);
        this.start(value29);
      }
  }
  ["start"]({ image: arg53, source: arg54 }) {
    if (this.stopped || !arg53 || arg53.dataset?.effectPendingSource !== arg54) return;
    ((this.inFlight += 1), (arg53.dataset.effectLoadingSource = arg54));
    let value30 = false,
      value31 = null;
    const fn5 = (arg55) => {
        value30 ||
          ((value30 = true),
          value31 !== null && this.clearTimer(value31),
          arg53.removeEventListener?.("load", fn6),
          arg53.removeEventListener?.("error", fn7),
          this.activeLoads.delete(arg53),
          arg53.dataset?.effectLoadingSource === arg54 && delete arg53.dataset.effectLoadingSource,
          arg55 &&
            arg53.dataset?.effectPendingSource === arg54 &&
            ((arg53.dataset.effectLoadedSource = arg54),
            delete arg53.dataset.effectPendingSource,
            this.loadedSources.add(arg54)),
          (this.inFlight = Math.max(0, this.inFlight - 1)),
          this.drain());
      },
      fn6 = () => fn5(true),
      fn7 = () => fn5(false);
    (arg53.addEventListener?.("load", fn6, {
      once: true,
    }),
      arg53.addEventListener?.("error", fn7, {
        once: true,
      }),
      this.activeLoads.set(arg53, () => fn5(false)),
      (arg53.src = arg54),
      (value31 = this.setTimer(() => {
        (arg53.removeAttribute?.("src"), fn5(false));
      }, this.loadTimeout)),
      arg53.complete && Number(arg53.naturalWidth || 0) > 0 && Promise.resolve().then(fn6));
  }
  ["promote"](arg56) {
    const value32 = arg56?.dataset?.effectPendingSource || arg56?.dataset?.effectSource || "";
    value32 &&
      this.enqueue(arg56, value32, {
        active: true,
      });
  }
  ["pruneDisconnected"]() {
    this.queue = this.queue.filter(
      ({ image: arg57, source: arg58 }) =>
        arg57 &&
        arg57.dataset?.effectPendingSource === arg58 &&
        (arg57.isConnected === undefined || arg57.isConnected),
    );
    for (const [value33, value34] of [...this.activeLoads])
      value33.isConnected === false && value34();
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
    for (const value35 of [...this.activeLoads.values()]) value35();
    (this.activeLoads.clear(), (this.inFlight = 0), this.loadedSources.clear());
  }
}
export class RuntimeVacuumMapImagePreloader {
  constructor({
    maxConcurrent: arg59 = 1,
    retryDelay: arg60 = 15000,
    createImage: arg61 = () => new Image(),
    now: arg62 = () => Date.now(),
  } = {}) {
    ((this.maxConcurrent = Math.max(1, Number(arg59) || 1)),
      (this.retryDelay = Math.max(1000, Number(arg60) || 15000)),
      (this.createImage = arg61),
      (this.now = arg62),
      (this.queue = []),
      (this.queuedSources = new Set()),
      (this.loadedSources = new Set()),
      (this.loadedSourceByKey = new Map()),
      (this.failedAt = new Map()),
      (this.activeLoads = new Map()),
      (this.stopped = false));
  }
  ["enqueue"](arg63) {
    const value36 = String(arg63 || ""),
      value37 = value36.split("?", 1)[0];
    if (
      this.stopped ||
      !value36 ||
      this.loadedSources.has(value36) ||
      this.queuedSources.has(value36) ||
      this.activeLoads.has(value36)
    )
      return false;
    const value38 = Number(this.failedAt.get(value36) || 0);
    if (value38 && this.now() - value38 < this.retryDelay) return false;
    for (const value40 of this.failedAt.keys())
      value40 !== value36 && value40.split("?", 1)[0] === value37 && this.failedAt.delete(value40);
    const value39 = this.queue.findIndex((arg64) => arg64.key === value37);
    return (
      value39 >= 0
        ? (this.queuedSources.delete(this.queue[value39].source),
          (this.queue[value39] = {
            key: value37,
            source: value36,
          }))
        : this.queue.push({
            key: value37,
            source: value36,
          }),
      this.queuedSources.add(value36),
      this.drain(),
      true
    );
  }
  ["drain"]() {
    if (!this.stopped)
      for (; this.activeLoads.size < this.maxConcurrent && this.queue.length;) {
        const { key: value41, source: value42 } = this.queue.shift();
        (this.queuedSources.delete(value42), this.start(value41, value42));
      }
  }
  ["start"](arg65, arg66) {
    if (this.stopped || !arg66) return;
    const value43 = this.createImage();
    let value44 = false;
    const fn8 = (arg67) => {
        if (!value44) {
          if (
            ((value44 = true),
            value43.removeEventListener?.("load", fn9),
            value43.removeEventListener?.("error", fn10),
            this.activeLoads.delete(arg66),
            arg67)
          ) {
            const value45 = this.loadedSourceByKey.get(arg65);
            (value45 && value45 !== arg66 && this.loadedSources.delete(value45),
              this.loadedSourceByKey.set(arg65, arg66),
              this.loadedSources.add(arg66),
              this.failedAt.delete(arg66));
          } else this.failedAt.set(arg66, this.now());
          this.drain();
        }
      },
      fn9 = () => fn8(true),
      fn10 = () => fn8(false);
    ((value43.decoding = "async"),
      (value43.fetchPriority = "low"),
      value43.addEventListener?.("load", fn9, {
        once: true,
      }),
      value43.addEventListener?.("error", fn10, {
        once: true,
      }),
      this.activeLoads.set(arg66, {
        image: value43,
        cancel: () => fn8(false),
      }),
      (value43.src = arg66),
      value43.complete && Number(value43.naturalWidth || 0) > 0 && Promise.resolve().then(fn9));
  }
  ["reset"]() {
    ((this.queue.length = 0),
      this.queuedSources.clear(),
      this.activeLoads.clear(),
      (this.stopped = false));
  }
  ["stop"]() {
    ((this.stopped = true), (this.queue.length = 0), this.queuedSources.clear());
    for (const { image: value46, cancel: value47 } of [...this.activeLoads.values()])
      (value46.removeAttribute?.("src"), value47());
    (this.activeLoads.clear(),
      this.loadedSources.clear(),
      this.loadedSourceByKey.clear(),
      this.failedAt.clear());
  }
}
export function historyRequestStillRelevant(arg68, arg69) {
  return arg68.documentGeneration !== arg69.documentGeneration
    ? false
    : arg68.shared || (arg68.pagePath !== null && arg68.pagePath === arg69.pagePath)
      ? true
      : arg68.popupId !== null &&
        arg68.popupId === arg69.popupId &&
        arg68.popupGeneration === arg69.popupGeneration;
}
export class EntityRequestPolicy {
  constructor() {
    ((this.entries = new Map()), (this.authBlocked = false));
  }
  ["canRequest"](arg70, arg71 = Date.now()) {
    const value48 = this.entries.get(arg70);
    return !this.authBlocked && (!value48 || (!value48.blocked && arg71 >= value48.nextAt));
  }
  ["success"](arg72) {
    this.entries.delete(arg72);
  }
  ["failure"](arg73, arg74 = 0, arg75 = Date.now()) {
    const value49 = (this.entries.get(arg73)?.attempts || 0) + 1,
      value50 = [401, 403, 404, 410].includes(arg74);
    arg74 === 401 && (this.authBlocked = true);
    const value51 = Math.min(300000, 1000 * 2 ** Math.min(value49 - 1, 9));
    return (
      this.entries.set(arg73, {
        attempts: value49,
        blocked: value50,
        status: arg74,
        nextAt: value50 ? Infinity : arg75 + value51,
      }),
      value50 ? Infinity : value51
    );
  }
  ["resume"]() {
    ((this.authBlocked = false), this.entries.clear());
  }
  ["authenticated"]() {
    this.authBlocked = false;
    for (const [value52, value53] of this.entries)
      value53.status === 401 && this.entries.delete(value52);
  }
  ["retain"](arg76) {
    for (const value54 of this.entries.keys()) arg76.has(value54) || this.entries.delete(value54);
  }
}
