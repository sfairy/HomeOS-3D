/**
 * 3D 模型模板的 IndexedDB 持久缓存。
 *
 * 为什么需要：家具 / 家电的 GLB 每次打开都要走一遍网络 + GLTF 解析 + 材质构建，而 `-lite.glb`
 * 是构建产物、内容长期不变 —— 同一份几何在同一个浏览器里被反复解析上百次。这里把「已准备模板」
 * 按 `modelTemplateKey` 存进 IndexedDB，命中时直接还原成 `{source, size}`，跳过下载与解析。
 *
 * 三个仓库各司其职：
 *   - `templates`：主数据 `{key, template, bytes, created}`，template 是 `model-template-codec`
 *     的信封（含 TypedArray，靠结构化克隆原样存取）。
 *   - `metadata`：只有 `{key, bytes, created}`。剪枝（LRU）只需要体积与时间，读 metadata 就不必把
 *     几 MB 的模板 Blob 全拉进内存 —— 这是两个仓库分开的唯一理由。
 *   - 库版本 2：v1 只有 templates，metadata 是后来加的，升级路径里按需补建。
 *
 * **降级底线**：IndexedDB 不可用（隐私模式 / 禁用 / 配额满 / 打开超时）时全部方法退化成空操作，
 * 调用方照常走真实加载器，不抛错、不产生未处理的 Promise 拒绝。任何一次打开失败都会把实例
 * 标记为 disabled，后续调用直接短路，不再反复敲一个已经打不开的库。
 */
import { packModelTemplate, unpackModelTemplate } from "./model-template-codec.js?v=2609252203";
// 生产控制台里的诊断输出统一走 utils/debug-log.js（默认静默，只在 ?debug=1 时输出）。
import { debugLog } from "../utils/debug-log.js?v=2609252203";

/** 缓存库名。 */
const MODEL_CACHE_DB_NAME = "ha-bridge-3d-templates";
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
  let openingPromise = null;
  let database = null;
  let openAttempted = false;
  let disabled = false;
  let writeChain = Promise.resolve();
  const stats = { hits: 0, misses: 0, writes: 0, fallbacks: 0 };

  const log = event => {
    debugLog("info", "[3D-model-cache]", JSON.stringify({ event, ...stats }));
  };
  const noteFallback = () => {
    stats.fallbacks += 1;
    log("fallback");
  };

  /** 静态可用性判断：显式关掉、没有 indexedDB、或 three 没带 ObjectLoader 时一律不参与。 */
  function isAvailable() {
    try {
      return !disabled && !!env.indexedDB && !!THREE.ObjectLoader;
    } catch {
      return false;
    }
  }

  /**
   * 把一次 IDB 操作包进超时。超时或抛错都解析为 null —— 只把这一次调用降级掉，不把实例标记成
   * disabled：私有模式下 `open()` 有时既不 success 也不 error，没有这一层就会永远等下去；
   * 但一次读得慢也不该让整个缓存永久失效（下一次调用可能就正常了）。
   */
  function runWithTimeout(run, duration = timeoutMs) {
    return new Promise(resolve => {
      let settled = false;
      const settle = value => {
        if (settled) {
          return;
        }
        settled = true;
        env.clearTimeout(timerId);
        resolve(value);
      };
      const timerId = env.setTimeout(() => {
        noteFallback();
        settle(null);
      }, duration);
      try {
        run(settle);
      } catch {
        settle(null);
      }
    });
  }

  /** 打开数据库（懒加载且只打开一次）；打不开就标记 disabled，后续调用不再反复敲它。 */
  function openDatabase() {
    if (!isAvailable()) {
      return Promise.resolve(null);
    }
    if (!openingPromise) {
      openingPromise = runWithTimeout(
        settle => {
          const request = env.indexedDB.open(MODEL_CACHE_DB_NAME, MODEL_CACHE_DB_VERSION);
          request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(TEMPLATE_STORE)) {
              request.result.createObjectStore(TEMPLATE_STORE, { keyPath: "key" });
            }
            if (!request.result.objectStoreNames.contains(METADATA_STORE)) {
              request.result.createObjectStore(METADATA_STORE, { keyPath: "key" });
            }
          };
          request.onerror = request.onblocked = () => {
            disabled = true;
            noteFallback();
            settle(null);
          };
          request.onsuccess = () => {
            const opened = request.result;
            if (disabled) {
              opened.close();
              settle(null);
              return;
            }
            // 版本变更（别的标签页升级了库）时必须让出连接，否则那边会一直堵塞。
            opened.onversionchange = () => {
              disabled = true;
              opened.close();
            };
            database = opened;
            settle(opened);
          };
        },
        Math.max(timeoutMs, MIN_OPEN_TIMEOUT_MS)
      );
    }
    return openingPromise;
  }

  /**
   * 取回并还原一份模板。命中返回 `{source, size}`，未命中 / 不可用 / 模板坏掉一律返回 null。
   * 「模板坏掉」还会顺手把这条记录删掉：它会在每次启动时重复失败，留着只会一直白读一遍几 MB。
   */
  async function restore(key) {
    if (!isAvailable() || (openAttempted && !database)) {
      return null;
    }
    // 打开尚未完成时只等一小段（min(timeoutMs, 150)），换成加载器继续，晚到的连接留着给下一次用。
    const handle =
      database || (await runWithTimeout(settle => openDatabase().then(settle), Math.min(timeoutMs, 150)));
    if (!handle) {
      // 这一次没等到连接（首次打开还没完成）：记下「试过了」，后续 restore 不再重复等这一小段。
      openAttempted = true;
    }
    if (!handle || disabled) {
      return null;
    }
    const record = await runWithTimeout(settle => {
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
      // 删掉坏记录：解不开的模板还会在下次启动重复踩坑。
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
    const handle = await openDatabase();
    if (!handle || disabled) {
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
    const stored = await runWithTimeout(settle => {
      const transaction = handle.transaction([TEMPLATE_STORE, METADATA_STORE], "readwrite");
      const templateStore = transaction.objectStore(TEMPLATE_STORE);
      const metadataStore = transaction.objectStore(METADATA_STORE);
      transaction.oncomplete = () => settle(true);
      transaction.onabort = transaction.onerror = () => settle(false);
      templateStore.put({ key, template, bytes: template.bytes, created: Date.now() });
      metadataStore.put({ key, bytes: template.bytes, created: Date.now() });
      const allMetadata = metadataStore.getAll();
      allMetadata.onsuccess = () => {
        const entries = allMetadata.result.sort((a, b) => a.created - b.created);
        let totalBytes = entries.reduce((sum, entry) => sum + (entry.bytes || 0), 0);
        let count = entries.length;
        for (const entry of entries) {
          if (count <= MAX_TEMPLATE_COUNT && totalBytes <= MAX_TOTAL_BYTES) {
            break;
          }
          templateStore.delete(entry.key);
          metadataStore.delete(entry.key);
          count -= 1;
          totalBytes -= entry.bytes || 0;
        }
      };
    });
    if (stored) {
      stats.writes += 1;
      log("stored");
    } else {
      // 写失败只影响这一次写入（配额满 / 事务被中止）：不把实例标记成 disabled ——
      // 读和写是两回事，因为写不进去就把能用的读路径一起关掉，反而让缓存彻底失效。
      noteFallback();
    }
  }

  /**
   * 安排把一份已加载模型写进缓存。空闲时执行、串行化（同一个库的多个 readwrite 事务并发会互相
   * 阻塞），失败静默 —— 缓存写不进去不该影响任何可见行为。
   */
  function schedule(key, modelDefinition) {
    if (!isAvailable()) {
      return;
    }
    writeChain = writeChain.then(
      () =>
        new Promise(resolve => {
          const run = () => {
            saveTemplate(key, modelDefinition)
              .catch(noteFallback)
              .finally(resolve);
          };
          if (env.requestIdleCallback) {
            env.requestIdleCallback(run, { timeout: 3000 });
          } else {
            env.setTimeout(run, 250);
          }
        })
    );
  }

  log(isAvailable() ? "enabled" : "unavailable");
  if (isAvailable()) {
    // 提前打开：首次加载时 restore 就能立刻拿到连接，省掉一次 open 的往返。
    openDatabase();
  }
  try {
    env.addEventListener?.(
      "pagehide",
      () => {
        disabled = true;
        database?.close();
      },
      { once: true }
    );
  } catch {
    // 测试替身没有 addEventListener：忽略。
  }

  return {
    restore,
    schedule,
    stats: () => ({ ...stats }),
    whenIdle: () => writeChain
  };
}
