/**
 * 3D 户型「已准备场景」的 IndexedDB 持久缓存。
 *
 * 为什么需要：一次冷启动里，`normalizeStudioDocument` 会把整份草稿逐层归一（迁移旧 schema、
 * 补默认值、重建场景记录），随后渲染还得按同样结构再走一遍 —— 「首次进入编辑器仪表盘后 3D
 * 户型偶发重新生成」就出在这条重复劳动上。把归一后的场景按「版本 + 变更令牌」缓存起来，
 * 第二次打开直接取回，跳过整段生成。
 *
 * **正确性优先于命中率**：只有三个条件同时成立才复用 —— 缓存版本号等于
 * `SCENE_PREPARATION_VERSION`、变更令牌（syncKey）与当前草稿一致、且条目未超过
 * `7 * 86400000`（7 天）的 TTL。版本不符或过期一律按未命中处理（返回 null），绝不把旧几何
 * 喂给新代码。syncKey 由后端对 scene 本身做规范化哈希得到（见 interaction3d 的
 * `/scenes/{id}/current`）：草稿一改，令牌就变，缓存自动失效。
 *
 * 缓存的值就是归一后的场景文档：`floors`（每层含 `items` / `doors` 等部件）、`baseLighting`、
 * `combinedCameraSettings` —— 即「已准备场景」的全部零件。库 / 仓库布局见模块底部常量。
 *
 * 与模型缓存同一条底线：IndexedDB 不可用（隐私模式 / 禁用 / 配额满）时所有接口都退化成空操作，
 * 调用方走原本的非缓存路径，不抛错、不产生未处理的 Promise 拒绝。
 */
import { debugLog } from "../utils/debug-log.js?v=2609262221";

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

/**
 * 生成场景缓存键：版本 + 光照历史作用域 + 项目 + 场景 + 入口脚本 URL。
 * 入口脚本 URL 参与是因为缓存的是「这份代码准备出来的场景」—— 发布换戳后键自然改变，
 * 不需要额外的清缓存动作。三段标识（作用域 / 项目 / 场景）任一缺失都返回空串，
 * 调用方据此跳过缓存（编辑器页正是这种情况：那里没有舞台注入的作用域）。
 */
export function scenePreparationKey(lightHistoryScope, projectId, sceneId, source = "") {
  if (!lightHistoryScope || !projectId || !sceneId) {
    return "";
  }
  return JSON.stringify([SCENE_PREPARATION_VERSION, lightHistoryScope, projectId, sceneId, source]);
}

/**
 * 判断一份归一后的场景文档是否完整到可以复用。
 * 判据与生成端一一对应：schemaVersion 7、楼层非空且 activeFloorId 命中某一层、
 * 顶层光照与相机设置存在、每层的 `scene.settings` 与
 * walls / items / doors / windows / railings 都在（且四个部件都是数组）。
 * 任何一项缺失都说明这是半成品或被改坏的文档，宁可重新生成。
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
 * 未命中则调用 `generate(record.scene)`（通常是 `normalizeStudioDocument`）现场生成。
 *
 * 返回 `reused` 让调用方决定要不要把新生成的结果 `schedule()` 回去，也让埋点区分两条路径。
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
 * （调用方仍能工作，只是可能污染内存缓存）—— 缓存层不该成为故障源，所以这里刻意不抛错。
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
  let openingPromise = null;
  let database = null;
  let disabled = false;
  let writeChain = Promise.resolve();
  // 内存层：preload 读到的条目在这里等 peek，避免同一份文档在一次加载里读两遍 IDB。
  const entryByKey = new Map();
  const preloadByKey = new Map();
  // 统计口径（只在 ?debug=1 的诊断日志里输出，没有其它消费方）：
  //   hits      预读到「版本 + TTL 都合格」的条目 —— 这不等于最终复用，复用还要过
  //             reusableScenePreparation 的 syncKey 校验（键里刻意不含 syncKey）。
  //   misses    预读正常完成但没拿到合格条目（不存在 / 版本不符 / 过期）。
  //   writes    成功写入。
  //   fallbacks 任何一次超时 / 异常（含写入失败）；与上面几项可能重叠，单独看。
  const stats = { hits: 0, misses: 0, writes: 0, fallbacks: 0 };

  const log = event => {
    debugLog("info", "[3D-scene-cache]", JSON.stringify({ event, ...stats }));
  };
  const noteFallback = () => {
    stats.fallbacks += 1;
    log("fallback");
  };

  function isAvailable() {
    try {
      return !disabled && !!env.indexedDB;
    } catch {
      return false;
    }
  }

  /**
   * 把一次 IDB 操作包进超时：超时或抛错都解析为 null。只降级这一次调用，不把实例标记成
   * disabled —— 库「暂时慢」与「打不开」是两回事，后者由 open 的 onerror / onblocked 明确标记。
   */
  function runWithTimeout(run, duration = timeoutMs, state = null) {
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
        // state 由调用方传入时用来标记「这次是超时」：迟到的成功结果据此不再重复记一次命中。
        if (state) {
          state.timedOut = true;
        }
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
          const request = env.indexedDB.open(SCENE_CACHE_DB_NAME, SCENE_CACHE_DB_VERSION);
          request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(SCENE_STORE)) {
              request.result.createObjectStore(SCENE_STORE, { keyPath: "key" });
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
            opened.onversionchange = () => {
              disabled = true;
              opened.close();
            };
            database = opened;
            settle(opened);
          };
        },
        // 首次建库要跑 onupgradeneeded，比单条读写慢得多，预算必须放宽：这一条超了只表示
        // 「这次没等到」，连接到了仍然会存下来，`peek()` / `schedule()` 都还能用上。
        Math.max(timeoutMs, MIN_OPEN_TIMEOUT_MS)
      );
    }
    return openingPromise;
  }

  /**
   * 预读某个键的缓存条目：读路径最多等一小段（默认 120ms），超时按未命中处理，数据库连接留给
   * 后台继续打开。结果同时写进内存层供 `peek()` 同步取用。返回的 Promise 永不拒绝。
   * @returns {Promise<object|null>}
   */
  function preload(key) {
    if (!key || disabled) {
      return Promise.resolve(null);
    }
    if (entryByKey.has(key)) {
      return Promise.resolve(entryByKey.get(key));
    }
    if (preloadByKey.has(key)) {
      return preloadByKey.get(key);
    }
    const readState = { timedOut: false };
    const pending = runWithTimeout(settle => {
      openDatabase().then(opened => {
        if (!opened || disabled) {
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
              !disabled &&
              entry?.version === SCENE_PREPARATION_VERSION &&
              Date.now() - entry.created < SCENE_CACHE_TTL_MS;
            if (!usable) {
              stats.misses += 1;
              settle(null);
              return;
            }
            // 条目本身合格，无论这次 preload 有没有超时都放进内存层：peek() 是同步的，只有
            // 放进来才可能被本会话取用。超时的那次不再记命中（那一刻已经记过 fallback）。
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
    if (!key || disabled || !record?.syncKey || !isUsablePreparedDocument(document)) {
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
    writeChain = writeChain.then(
      () =>
        new Promise(resolve => {
          const run = async () => {
            try {
              const opened = database || (await openDatabase());
              if (!opened || disabled) {
                return;
              }
              // 用 UTF-16 码元估算体积（与 IndexedDB 的存储口径同量级即可），超限就不写。
              entry.bytes = JSON.stringify(entry).length * 2;
              if (entry.bytes > MAX_SCENE_BYTES) {
                return;
              }
              const stored = await runWithTimeout(settle => {
                const transaction = opened.transaction(SCENE_STORE, "readwrite");
                const store = transaction.objectStore(SCENE_STORE);
                transaction.oncomplete = () => settle(true);
                transaction.onerror = transaction.onabort = () => settle(false);
                store.put(entry);
                const allEntries = store.getAll();
                allEntries.onsuccess = () => {
                  const entries = allEntries.result.sort((a, b) => a.created - b.created);
                  let totalBytes = entries.reduce((sum, item) => sum + (item.bytes || 0), 0);
                  let count = entries.length;
                  for (const item of entries) {
                    if (count <= MAX_SCENE_COUNT && totalBytes <= MAX_TOTAL_BYTES) {
                      break;
                    }
                    store.delete(item.key);
                    count -= 1;
                    totalBytes -= item.bytes || 0;
                  }
                };
              }, SCENE_WRITE_TIMEOUT_MS);
              if (stored) {
                // 同步内存层：否则本会话再读同一个键只会拿回那份旧条目（或 preloadByKey 里
                // 已 resolve 的 null —— 它从不清理），刚写进去的条目永远读不回来。
                entryByKey.set(key, entry);
                preloadByKey.delete(key);
                stats.writes += 1;
                log("stored");
              } else {
                // 配额满 / 事务被中止：这是真实的写入失败，过去完全静默、连 fallback 都不记。
                noteFallback();
              }
            } catch {
              noteFallback();
            } finally {
              resolve();
            }
          };
          if (env.requestIdleCallback) {
            env.requestIdleCallback(run, { timeout: 3000 });
          } else {
            env.setTimeout(run, 250);
          }
        })
    );
  }

  try {
    env.addEventListener?.(
      "pagehide",
      () => {
        disabled = true;
        entryByKey.clear();
        database?.close();
      },
      { once: true }
    );
  } catch {
    // 测试替身没有 addEventListener：忽略。
  }

  return {
    preload,
    peek,
    schedule,
    whenIdle: () => writeChain,
    stats: () => ({ ...stats })
  };
}
