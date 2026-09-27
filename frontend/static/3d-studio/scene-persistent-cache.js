/**
 * 3D 户型「已准备场景」的 IndexedDB 持久缓存。
 */
import { createIdbStore } from "./idb-store.js?v=2609271226";
import { debugLog } from "../utils/debug-log.js?v=2609271226";

/** 场景准备格式版本。归一逻辑或缓存信封一改就动它，旧条目会自动因版本不符而失效。 */
export const SCENE_PREPARATION_VERSION = "20260923-v1";

/** 缓存库名。 */
const SCENE_CACHE_DB_NAME = "ha-bridge-3d-scenes";
/** 库版本：初版即 v1。 */
const SCENE_CACHE_DB_VERSION = 1;
/** 场景仓库：主键 key。 */
const SCENE_STORE = "scenes";
/** 条目 TTL：7 天（毫秒）。过期即未命中 —— 宁可重建一次，也不读一份可能过时的几何。 */
const SCENE_CACHE_TTL_MS = 7 * 86400000;
/** 条数上限 8：键里已经带了变更令牌，条数不需要多。 */
const MAX_SCENE_COUNT = 8;
/** 总字节上限 32MB。 */
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
/** 单条上限 8MB：超过说明不是正常户型，直接不缓存，别把配额写满。 */
const MAX_SCENE_BYTES = 8 * 1024 * 1024;
/** 写入的事务预算：后台动作、没人等它，但要跑完 `put` 与剪枝用的 `getAll`，给足以免把成功记成降级。 */
const SCENE_WRITE_TIMEOUT_MS = 3000;
/** 默认单次操作超时 120ms：场景缓存属于「有则更快、没有也能跑」，不值得让加载路径为它多等。 */
const DEFAULT_TIMEOUT_MS = 120;
/** 打开数据库至少给 1500ms：首次建库要跑 onupgradeneeded，比单条读写慢得多。 */
const MIN_OPEN_TIMEOUT_MS = 1500;

export function scenePreparationKey(lightHistoryScope, projectId, sceneId, source = "") {
  if (!lightHistoryScope || !projectId || !sceneId) {
    return "";
  }
  return JSON.stringify([SCENE_PREPARATION_VERSION, lightHistoryScope, projectId, sceneId, source]);
}

/**
 * 判断一份归一后的场景文档是否完整到可以复用。
 */
function isUsablePreparedDocument(document) {
  return (
    document?.schemaVersion === 7 &&
    Array.isArray(document.floors) &&
    document.floors.length > 0 &&
    document.floors.some(floor => floor.id === document.activeFloorId) &&
    !!document.baseLighting &&
    !!document.combinedCameraSettings &&
    document.floors.every(
      floor =>
        floor?.id &&
        floor.scene?.settings &&
        ["walls", "items", "doors", "windows", "railings"].every(part => Array.isArray(floor.scene[part]))
    )
  );
}

/**
 * 缓存条目是否与当前草稿一致且可复用。
 * @param {object} preparedEntry `preload()` / `peek()` 返回的条目。
 * @param {{syncKey?: string}} options 当前草稿（`{scene, syncKey}`）。
 */
export function reusableScenePreparation(preparedEntry, options) {
  return (
    !!preparedEntry &&
    preparedEntry.version === SCENE_PREPARATION_VERSION &&
    typeof options?.syncKey === "string" &&
    !!options.syncKey &&
    preparedEntry.syncKey === options.syncKey &&
    isUsablePreparedDocument(preparedEntry.document)
  );
}

/**
 * 取一份可用的场景文档：命中缓存返回它的深拷贝（调用方随后会就地改字段，不能让它污染缓存条目），
 * @param {{scene: object, syncKey?: string}} record 后端返回的草稿记录。
 * @param {object|null} cachedEntry `preload()` / `peek()` 的结果。
 * @param {(scene: object) => object} generate 未命中时的生成函数。
 */
export function prepareSceneDocument(record, cachedEntry, generate) {
  const reused = reusableScenePreparation(cachedEntry, record);
  return {
    document: reused ? clonePreparedDocument(cachedEntry.document) : generate(record.scene),
    reused
  };
}

/**
 * 深拷贝一份场景文档。`structuredClone` 不可用时退回 JSON 往返；两者都失败时返回原对象
 */
function clonePreparedDocument(document) {
  try {
    return typeof structuredClone === "function" ? structuredClone(document) : JSON.parse(JSON.stringify(document));
  } catch {
    return document;
  }
}

/**
 * 创建场景持久缓存。
 * @param {object} [options.env] 运行环境（测试注入替身）。
 * @param {number} [options.timeoutMs] 单次 IDB 操作上限。
 */
export function createScenePersistentCache({
  env: env = globalThis,
  timeoutMs: timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const entryByKey = new Map();
  const preloadByKey = new Map();
  // 统计口径（只在 ?debug=1 的诊断日志里输出，没有其它消费方）：
  const stats = { hits: 0, misses: 0, writes: 0, fallbacks: 0 };

  const log = event => {
    debugLog("info", "[3D-scene-cache]", JSON.stringify({ event, ...stats }));
  };
  const noteFallback = () => {
    stats.fallbacks += 1;
    log("fallback");
  };

  const store = createIdbStore({
    env: env,
    name: SCENE_CACHE_DB_NAME,
    version: SCENE_CACHE_DB_VERSION,
    timeoutMs: timeoutMs,
    openTimeoutMs: MIN_OPEN_TIMEOUT_MS,
    onFallback: noteFallback,
    // 内存层也随页面卸载一起清掉：它只是 IDB 的一次性中转，留着只会让「下次会话」读到过期条目。
    onPagehide: () => entryByKey.clear(),
    upgrade: request => {
      if (!request.result.objectStoreNames.contains(SCENE_STORE)) {
        request.result.createObjectStore(SCENE_STORE, { keyPath: "key" });
      }
    }
  });

  /**
   * 预读某个键的缓存条目：读路径最多等一小段（默认 120ms），超时按未命中处理，数据库连接留给
   * @returns {Promise<object|null>}
   */
  function preload(key) {
    if (!key || store.isDisabled()) {
      return Promise.resolve(null);
    }
    if (entryByKey.has(key)) {
      return Promise.resolve(entryByKey.get(key));
    }
    if (preloadByKey.has(key)) {
      return preloadByKey.get(key);
    }
    const readState = { timedOut: false };
    const pending = store.runWithTimeout(settle => {
      store.open().then(opened => {
        if (!opened || store.isDisabled()) {
          settle(null);
          return;
        }
        try {
          const transaction = opened.transaction(SCENE_STORE, "readonly");
          const request = transaction.objectStore(SCENE_STORE).get(key);
          request.onerror = transaction.onabort = () => settle(null);
          request.onsuccess = () => {
            const entry = request.result;
            const usable =
              !store.isDisabled() &&
              entry?.version === SCENE_PREPARATION_VERSION &&
              Date.now() - entry.created < SCENE_CACHE_TTL_MS;
            if (!usable) {
              stats.misses += 1;
              settle(null);
              return;
            }
            // 条目本身合格，无论这次 preload 有没有超时都放进内存层：peek() 是同步的，只有
            entryByKey.set(key, entry);
            if (readState.timedOut) {
              settle(null);
              return;
            }
            stats.hits += 1;
            log("loaded");
            settle(entry);
          };
        } catch {
          settle(null);
        }
      });
    }, timeoutMs, readState);
    preloadByKey.set(key, pending);
    return pending;
  }

  /** 同步取出已预读的条目（未预读或已失效时为 null）。 */
  function peek(key) {
    return entryByKey.get(key) || null;
  }

  /**
   * 安排把一份归一后的场景写进缓存（空闲时执行、串行化、失败静默）。
   * @param {string} key `scenePreparationKey()` 的结果。
   * @param {{syncKey?: string}} record 当前草稿（要它的 syncKey）。
   * @param {object} document 归一后的场景文档。
   */
  function schedule(key, record, document) {
    if (!key || store.isDisabled() || !record?.syncKey || !isUsablePreparedDocument(document)) {
      return;
    }
    let entry;
    try {
      entry = {
        key,
        version: SCENE_PREPARATION_VERSION,
        syncKey: record.syncKey,
        document: structuredClone(document),
        created: Date.now()
      };
    } catch {
      return;
    }
    store.scheduleIdle(async () => {
      try {
        const opened = store.current() || (await store.open());
        if (!opened || store.isDisabled()) {
          return;
        }
        // 用 UTF-16 码元估算体积（与 IndexedDB 的存储口径同量级即可），超限就不写。
        entry.bytes = JSON.stringify(entry).length * 2;
        if (entry.bytes > MAX_SCENE_BYTES) {
          return;
        }
        const stored = await store.runWithTimeout(settle => {
          const transaction = opened.transaction(SCENE_STORE, "readwrite");
          const records = transaction.objectStore(SCENE_STORE);
          transaction.oncomplete = () => settle(true);
          transaction.onerror = transaction.onabort = () => settle(false);
          records.put(entry);
          // 条目自身就带 `bytes` 与 `created`，剪枝直接遍历主仓库即可（模型缓存另有一个
          store.prune({
            source: records,
            remove: pruneKey => records.delete(pruneKey),
            maxCount: MAX_SCENE_COUNT,
            maxTotalBytes: MAX_TOTAL_BYTES
          });
        }, SCENE_WRITE_TIMEOUT_MS);
        if (stored) {
          entryByKey.set(key, entry);
          preloadByKey.delete(key);
          stats.writes += 1;
          log("stored");
        } else {
          noteFallback();
        }
      } catch {
        noteFallback();
      }
    });
  }

  return {
    preload,
    peek,
    schedule,
    whenIdle: () => store.whenIdle(),
    stats: () => ({ ...stats })
  };
}
