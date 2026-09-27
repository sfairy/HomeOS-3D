/**
 * 3D 模型模板的 IndexedDB 持久缓存。
 */
import { createIdbStore } from "./idb-store.js?v=2609271411";
import { packModelTemplate, unpackModelTemplate } from "./model-template-codec.js?v=2609271411";
// 生产控制台里的诊断输出统一走 utils/debug-log.js（默认静默，只在 ?debug=1 时输出）。
import { debugLog } from "../utils/debug-log.js?v=2609271411";

/** 缓存库名。 */
const MODEL_CACHE_DB_NAME = "homeos-3d-templates";
/** 库版本：v2 起含 metadata 仓库。 */
const MODEL_CACHE_DB_VERSION = 2;
/** 主数据仓库。 */
const TEMPLATE_STORE = "templates";
/** 剪枝用的轻量元数据仓库（不含模板体）。 */
const METADATA_STORE = "metadata";
/** 条数上限 80：够覆盖一个户型的全部家具类型，再多就是别的项目残留。 */
const MAX_TEMPLATE_COUNT = 80;
/** 总字节上限 64MB。 */
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
/** 单条上限 8MB：超过就说明这个模型不适合缓存，别让它把配额吃光。 */
const MAX_TEMPLATE_BYTES = 8 * 1024 * 1024;
/** 默认单次操作超时 1000ms。 */
const DEFAULT_TIMEOUT_MS = 1000;
/** 打开数据库至少给 1500ms：首次建库还要跑 onupgradeneeded，比单条读写慢得多。 */
const MIN_OPEN_TIMEOUT_MS = 1500;

/**
 * 创建模型持久缓存。
 * @param {object} options.THREE three.js 命名空间（`ObjectLoader` 来自它）。
 * @param {object} [options.env] 运行环境（测试注入替身）。
 * @param {number} [options.timeoutMs] 单次 IDB 操作上限。
 * @returns {{restore: Function, schedule: Function, stats: Function, whenIdle: Function}}
 */
export function createModelPersistentCache({
  THREE: THREE,
  env: env = globalThis,
  timeoutMs: timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  /**
   * 「首次 restore 没等到连接」只记一次：记下之后不再为每一次 restore 白等那一小段，
   */
  let openAttempted = false;
  const stats = { hits: 0, misses: 0, writes: 0, fallbacks: 0 };

  const log = event => {
    debugLog("info", "[3D-model-cache]", JSON.stringify({ event, ...stats }));
  };
  const noteFallback = () => {
    stats.fallbacks += 1;
    log("fallback");
  };

  const store = createIdbStore({
    env: env,
    name: MODEL_CACHE_DB_NAME,
    version: MODEL_CACHE_DB_VERSION,
    timeoutMs: timeoutMs,
    openTimeoutMs: MIN_OPEN_TIMEOUT_MS,
    // 没有 ObjectLoader 就没有还原能力（unpackModelTemplate 要用它），此时整个缓存不参与。
    extraAvailable: () => !!THREE.ObjectLoader,
    onFallback: noteFallback,
    upgrade: request => {
      if (!request.result.objectStoreNames.contains(TEMPLATE_STORE)) {
        request.result.createObjectStore(TEMPLATE_STORE, { keyPath: "key" });
      }
      if (!request.result.objectStoreNames.contains(METADATA_STORE)) {
        request.result.createObjectStore(METADATA_STORE, { keyPath: "key" });
      }
    }
  });

  /**
   * 取回并还原一份模板。命中返回 `{source, size}`，未命中 / 不可用 / 模板坏掉一律返回 null。
   */
  async function restore(key) {
    if (!store.isAvailable() || (openAttempted && !store.current())) {
      return null;
    }
    // 打开尚未完成时只等一小段（min(timeoutMs, 150)），换成加载器继续，晚到的连接留着给下一次用。
    const handle = await store.handleWithin(Math.min(timeoutMs, 150));
    if (!handle) {
      // 这一次没等到连接（首次打开还没完成）：记下「试过了」，后续 restore 不再重复等这一小段。
      openAttempted = true;
    }
    if (!handle || store.isDisabled()) {
      return null;
    }
    const record = await store.runWithTimeout(settle => {
      const transaction = handle.transaction(TEMPLATE_STORE, "readonly");
      const request = transaction.objectStore(TEMPLATE_STORE).get(key);
      request.onsuccess = () => settle(request.result);
      request.onerror = transaction.onabort = () => settle(null);
    });
    if (!record) {
      stats.misses += 1;
      log("miss");
      return null;
    }
    try {
      const restored = unpackModelTemplate(THREE, record.template);
      stats.hits += 1;
      log("hit");
      return restored;
    } catch {
      noteFallback();
      try {
        const cleanup = handle.transaction([TEMPLATE_STORE, METADATA_STORE], "readwrite");
        cleanup.onerror = () => {};
        cleanup.objectStore(TEMPLATE_STORE).delete(key);
        cleanup.objectStore(METADATA_STORE).delete(key);
      } catch {
        // 清理失败无所谓，下一次 restore 会再试一遍。
      }
      return null;
    }
  }

  /** 写入一份模板并做 LRU 剪枝（条数 80 / 总量 64MB，按 created 从旧到新删）。 */
  async function saveTemplate(key, modelDefinition) {
    // 与 restore 同口径：优先用已经拿到的连接。open() 的 Promise 只结算一次，首次 open 一旦
    const handle = store.current() || (await store.open());
    if (!handle || store.isDisabled()) {
      return;
    }
    let template;
    try {
      template = packModelTemplate(THREE, modelDefinition);
    } catch {
      // 非静态模板（贴图 / 动画 / morph / 蒙皮）本来就进不了缓存：这不是故障，只是不缓存。
      noteFallback();
      return;
    }
    if (template.bytes > MAX_TEMPLATE_BYTES) {
      return;
    }
    const stored = await store.runWithTimeout(settle => {
      const transaction = handle.transaction([TEMPLATE_STORE, METADATA_STORE], "readwrite");
      const templateStore = transaction.objectStore(TEMPLATE_STORE);
      const metadataStore = transaction.objectStore(METADATA_STORE);
      transaction.oncomplete = () => settle(true);
      transaction.onabort = transaction.onerror = () => settle(false);
      templateStore.put({ key, template, bytes: template.bytes, created: Date.now() });
      metadataStore.put({ key, bytes: template.bytes, created: Date.now() });
      // 剪枝读的是 metadata（轻量仓库）：命中/未命中只看体积与时间，不必把模板体拉进内存。
      store.prune({
        source: metadataStore,
        remove: pruneKey => {
          templateStore.delete(pruneKey);
          metadataStore.delete(pruneKey);
        },
        maxCount: MAX_TEMPLATE_COUNT,
        maxTotalBytes: MAX_TOTAL_BYTES
      });
    });
    if (stored) {
      stats.writes += 1;
      log("stored");
    } else {
      // 写失败只影响这一次写入（配额满 / 事务被中止）：不把实例标记成 disabled ——
      noteFallback();
    }
  }

  /**
   * 安排把一份已加载模型写进缓存。空闲时执行、串行化（同一个库的多个 readwrite 事务并发会互相
   */
  function schedule(key, modelDefinition) {
    if (!store.isAvailable()) {
      return;
    }
    store.scheduleIdle(() => saveTemplate(key, modelDefinition));
  }

  log(store.isAvailable() ? "enabled" : "unavailable");
  if (store.isAvailable()) {
    // 提前打开：首次加载时 restore 就能立刻拿到连接，省掉一次 open 的往返。
    store.open();
  }

  return {
    restore,
    schedule,
    stats: () => ({ ...stats }),
    whenIdle: () => store.whenIdle()
  };
}
