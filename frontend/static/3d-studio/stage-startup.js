/**
 * 舞台页的「提前起跑」入口。
 *
 * 为什么需要：`3d-studio.html` 同时被编辑器（`/3d-studio`）与舞台页
 * （`/api/v1/modules/interaction3d/stage.html`，由父窗口 iframe 嵌入）两处使用，而舞台页是首屏
 * 体验最敏感的一处 —— 它要多等一次 HTML、一次场景接口、一次 stage 模块下载才开始画。这里在
 * 入口脚本之前插一脚，把这三件事提前发出去：
 *
 *   1. `preload()` 读场景持久缓存：命中就直接拿到「已准备场景」，省掉一次逐层归一
 *      （见 `scene-persistent-cache.js`）；未命中也会在后台把库打开，供后续 `schedule()` 直接写。
 *   2. `fetch('/scenes/{id}/current')` 提前把场景接口发出去，并在 studio-app 里**被直接收下**
 *      （同一个 URL、同一份头，见其 requestStudioApi 的第三参）：整份户型只传一次。
 *   3. `import()` 预热 `/core/stage.js`：这是舞台页最后才动态 import 的大模块，提前发起能让它
 *      与场景渲染并行下载；studio-app 等的是同一个模块 Promise。
 *
 * **本模块是 `3d-studio.html` 里 studio-app.js 之前唯一的 module。** 它自己不做任何编排 ——
 * `stageStartup` 只是个「已经提前发出的动作」的记录，studio-app 拿它的 `cache` / `key` 去接缓存。
 *
 * 降级：不在舞台页（编辑器页、或路径被改写）时整体返回 null，一个字节的请求都不发。三个动作各自
 * 吞掉自己的错误：缓存读不出来就当作未命中、接口预热失败就由 studio-app 重新请求、模块预热失败就
 * 由 studio-app 自己 import —— 「没有提前」永远不等于「不能加载」。
 */
import { createScenePersistentCache, scenePreparationKey } from "./scene-persistent-cache.js?v=2609260842";
// 场景接口的超时预算与 studio-app 同源：预热的这一份也必须是有界的，否则 studio-app 等它时
// 会失去「20 秒就报错」这条底线（预热 Promise 挂在网络层，apiFetch 的计时器覆盖不到它）。
import { SCENE_REQUEST_TIMEOUT_MS } from "../utils/api-fetch.js?v=2609260842";
import { withRequestTimeout } from "../utils/request-timeout.js?v=2609260842";

/** 舞台页的服务端路径：只有它挂载了 body 上的灯光历史作用域，其它地址一律不预热。 */
const STAGE_PAGE_PATH = "/api/v1/modules/interaction3d/stage.html";
/** 场景接口前缀（与 studio-app 里 requestStudioApi 的路径拼接保持一致）。 */
const SCENE_API_PREFIX = "/modules/interaction3d/scenes/";
/** 舞台模块地址：与 studio-app 中那次动态 import 用同一条戳，命中同一份模块实例。 */
const STAGE_MODULE_URL = "/api/v1/modules/interaction3d/core/stage.js?v=2609260842";

/**
 * 在舞台页发起提前加载。
 * @param {object} [options.env] 运行环境（测试注入替身）。
 * @param {() => Promise<unknown>} [options.loadModule] 预热模块用的加载函数（测试注入替身）。
 * @param {(options: object) => object} [options.createCache] 场景缓存工厂（测试注入替身）。
 * @returns {{path: string, response: Promise<unknown>, module: Promise<unknown>, cache: object, key: string}|null}
 *   非舞台页返回 null。
 */
export function beginStageStartup({
  env: env = globalThis,
  loadModule: loadModule = () => import(STAGE_MODULE_URL),
  createCache: createCache = createScenePersistentCache
} = {}) {
  if (env.location?.pathname !== STAGE_PAGE_PATH) {
    return null;
  }
  const searchParams = new URLSearchParams(env.location.search);
  const sceneId = searchParams.get("sceneId") || "";
  const projectId = searchParams.get("projectId") || "";
  const path = SCENE_API_PREFIX + encodeURIComponent(sceneId) + "/current?projectId=" + encodeURIComponent(projectId);
  const cache = createCache({ env: env });
  // 缓存键里的 source 段是「准备这份场景的代码版本」：优先取 studio-app 的脚本地址（同一份
  // ?v= 戳），取不到（本脚本排在它前面、标签还没被解析）时退回本脚本自己的地址 —— 两者同目录、
  // 同一条全局戳，换成哪一条都能在代码更新后让旧缓存自动失配。
  const source =
    env.document.querySelector('script[src*="studio-app.js"]')?.src ||
    env.document.querySelector('script[src*="stage-startup.js"]')?.src ||
    "";
  const key = scenePreparationKey(env.document.body?.dataset.i3dLightHistoryScope, projectId, sceneId, source);
  cache.preload(key);
  // 场景接口预热：与 studio-app 的 requestStudioApi 同 URL、同 cache/no-store、同 credentials，
  // 于是这一份响应可以直接交给它用（省掉第二次传整份户型）。带超时是因为这份 Promise 会在
  // studio-app 里被 await：没有上界的话，一个挂住的请求会让首屏一直转圈。
  const response = withRequestTimeout(
    SCENE_REQUEST_TIMEOUT_MS,
    abortSignal =>
      env.fetch("/api/v1" + path, {
        cache: "no-store",
        credentials: "same-origin",
        signal: abortSignal
      })
  );
  // 这里只关心「提前发出」。resolve 与 reject 都要收掉：未处理的拒绝会在控制台留下报错，
  // 而预热失败本来就是允许的（网络慢、被取消、离线）。
  response.catch(() => {});
  const module = loadModule();
  module.catch(() => {});
  return { path: path, response: response, module: module, cache: cache, key: key };
}

/** 本页的提前加载结果（非舞台页为 null），供 studio-app 取用其 cache / key。 */
export const stageStartup = beginStageStartup();
