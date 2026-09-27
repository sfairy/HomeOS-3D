/**
 * 3D 模型模板的 IndexedDB 持久缓存。
 *
 * 为什么需要：家具 / 家电的 GLB 每次打开都要走一遍网络 + GLTF 解析 + 材质构建，而 `-lite.glb`
 * 是构建产物、内容长期不变 —— 同一份几何在同一个浏览器里被反复解析上百次。这里把「已准备模板」
 * 按 `modelTemplateKey` 存进 IndexedDB，命中时直接还原成 `{source, size}`，跳过下载与解析。
 *
 * 两个仓库各司其职：
 *   - `templates`：主数据 `{key, template, bytes, created}`，template 是 `model-template-codec`
 *     的信封（含 TypedArray，靠结构化克隆原样存取）。
 *   - `metadata`：只有 `{key, bytes, created}`。剪枝（LRU）只需要体积与时间，读 metadata 就不必把
 *     几 MB 的模板 Blob 全拉进内存 —— 这是两个仓库分开的唯一理由。
 *   - 库版本 2：v1 只有 templates，metadata 是后来加的，升级路径里按需补建。
 *
 * **降级底线**：IndexedDB 不可用（隐私模式 / 禁用 / 配额满 / 打开超时）时全部方法退化成空操作，
 * 调用方照常走真实加载器，不抛错、不产生未处理的 Promise 拒绝。这条底线与「超时只降级这一次
 * 调用」「写入空闲串行化」「LRU 剪枝」都由 `idb-store.js` 统一提供（与场景缓存同一份实现，
 * 不再各抄一遍）；本模块只负责「存什么、键怎么算、模板怎么打包还原」。
 */
import { createIdbStore } from "./idb-store.js?v=2609271208";
import { packModelTemplate, unpackModelTemplate } from "./model-template-codec.js?v=2609271208";
// 生产控制台里的诊断输出统一走 utils/debug-log.js（默认静默，只在 ?debug=1 时输出）。
import { debugLog } from "../utils/debug-log.js?v=2609271208";

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
  /**
   * 「首次 restore 没等到连接」只记一次：记下之后不再为每一次 restore 白等那一小段，
   * 晚到的连接仍会存进 `idb-store`，供后续的 restore / saveTemplate 直接用。
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
      const upgradeTransaction = request.transaction;
      const freshTemplateStore = !request.result.objectStoreNames.contains(TEMPLATE_STORE);
      if (freshTemplateStore) {
        request.result.createObjectStore(TEMPLATE_STORE, { keyPath: "key" });
      }
      const freshMetadataStore = !request.result.objectStoreNames.contains(METADATA_STORE);
      if (freshMetadataStore) {
        request.result.createObjectStore(METADATA_STORE, { keyPath: "key" });
      }
      // v1 只有 templates：升级到 v2 时把旧条目的体积 / 时间补进 metadata。不补的话这些
      // 条目既不计入配额、也永远不会被剪枝（剪枝只遍历 metadata），等于旧缓存永久驻留 ——
      // 文件头的注释承诺了「升级路径里按需补建」，这里兑现它。
      if (freshMetadataStore && !freshTemplateStore) {
        const legacyTemplateStore = upgradeTransaction.objectStore(TEMPLATE_STORE);
        const freshMetadata = upgradeTransaction.objectStore(METADATA_STORE);
        legacyTemplateStore.openCursor().onsuccess = event => {
          const cursor = event.target.result;
          if (!cursor) {
            return;
          }
          const legacyRecord = cursor.value;
          if (legacyRecord?.key) {
            freshMetadata.put({
              key: legacyRecord.key,
              bytes: Number(legacyRecord.bytes) || 0,
              created: Number(legacyRecord.created) || Date.now()
            });
          }
          cursor.continue();
        };
      }
    }
  });

  /**
   * 取回并还原一份模板。命中返回 `{source, size}`，未命中 / 不可用 / 模板坏掉一律返回 null。
   * 「模板坏掉」还会顺手把这条记录删掉：它会在每次启动时重复失败，留着只会一直白读一遍几 MB。
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
    // 与 restore 同口径：优先用已经拿到的连接。open() 的 Promise 只结算一次，首次 open 一旦
    // 超时就被永久定格成 null，此后即使连接已成功（store.current() 已有值）也拿不到 ——
    // 只 await 它会让整个会话的写入静默失效（读还有 current() 这条兜底，写没有）。
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
      // 读和写是两回事，因为写不进去就把能用的读路径一起关掉，反而让缓存彻底失效。
      noteFallback();
    }
  }

  /**
   * 安排把一份已加载模型写进缓存。空闲时执行、串行化（同一个库的多个 readwrite 事务并发会互相
   * 阻塞），失败静默 —— 缓存写不进去不该影响任何可见行为。
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
