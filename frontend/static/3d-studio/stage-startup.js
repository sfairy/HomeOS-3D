/**
 * 舞台页的「提前起跑」入口。
 */
import { createScenePersistentCache, scenePreparationKey } from "./scene-persistent-cache.js?v=2609271411";
import { SCENE_REQUEST_TIMEOUT_MS } from "../utils/api-fetch.js?v=2609271411";
import { withRequestTimeout } from "../utils/request-timeout.js?v=2609271411";

const STAGE_PAGE_PATH = "/api/v1/modules/interaction3d/stage.html";
/** 场景接口前缀（与 studio-app 里 requestStudioApi 的路径拼接保持一致）。 */
const SCENE_API_PREFIX = "/modules/interaction3d/scenes/";
/** 舞台模块地址：与 studio-app 中那次动态 import 用同一条戳，命中同一份模块实例。 */
const STAGE_MODULE_URL = "/api/v1/modules/interaction3d/core/stage.js?v=2609271411";

/**
 * 在舞台页发起提前加载。
 * @param {object} [options.env] 运行环境（测试注入替身）。
 * @param {() => Promise<unknown>} [options.loadModule] 预热模块用的加载函数（测试注入替身）。
 * @param {(options: object) => object} [options.createCache] 场景缓存工厂（测试注入替身）。
 * @returns {{path: string, response: Promise<unknown>, module: Promise<unknown>, cache: object, key: string}|null}
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
  const source =
    env.document.querySelector('script[src*="studio-app.js"]')?.src ||
    env.document.querySelector('script[src*="stage-startup.js"]')?.src ||
    "";
  const key = scenePreparationKey(env.document.body?.dataset.i3dLightHistoryScope, projectId, sceneId, source);
  cache.preload(key);
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
  response.catch(() => {});
  const module = loadModule();
  module.catch(() => {});
  return { path: path, response: response, module: module, cache: cache, key: key };
}

/** 本页的提前加载结果（非舞台页为 null），供 studio-app 取用其 cache / key。 */
export const stageStartup = beginStageStartup();
