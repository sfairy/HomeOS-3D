import { createGeometryPersistentCache } from './cache/geometry-persistent-cache'
import { createContactShadowPersistentCache } from './plan/contact-shadow'
import { contactShadowPreparationKey } from './plan/contact-shadow'
import { createReflectionPersistentCache } from './reflection/reflection-persistent-cache'
import { createScenePersistentCache, scenePreparationKey } from './cache/scene-persistent-cache'
import { isLegacyEmbedStageLighting } from './scene/studio-stage-lighting-mode'
import { createLoadTiming } from '@app/bridge/scene/load-timing'
import { createDashboardFonts } from '../app/shared/dashboard-fonts'

const STAGE_MODULE_PATH = '/api/v1/modules/interaction3d/core/stage.js'

/**
 * 舞台模块 URL 必须与 stage.html 里 `<link rel="modulepreload">` 的 href 逐字一致（含 `?v=`）：
 * 模块映射按完整 URL 去重，裸路径会让预加载白费、再下载一遍 stage.js。
 */
function preloadedStageModuleUrl(env: typeof globalThis = globalThis) {
  const preloadLink = env.document?.querySelector<HTMLLinkElement>(
    `link[rel="modulepreload"][href^="${STAGE_MODULE_PATH}"]`,
  )
  return preloadLink?.getAttribute('href') || STAGE_MODULE_PATH
}

/** 首批模型下载时才会按需 import 的加载器链：提前 modulepreload，第一份 GLB 到达时无需再等一轮模块往返。 */
const STAGE_LOADER_MODULES = [
  '/static/vendor/three/0.187.0/GLTFLoader.js',
  '/static/vendor/three/0.187.0/BufferGeometryUtils.js',
  '/static/vendor/three/0.187.0/SkeletonUtils.js',
]

function preloadStageLoaderModules(env: typeof globalThis) {
  const head = env.document?.head
  if (!head) return
  for (const href of STAGE_LOADER_MODULES) {
    if (head.querySelector(`link[rel="modulepreload"][href="${href}"]`)) continue
    const link = env.document.createElement('link')
    ;(link.rel = 'modulepreload'), (link.href = href), head.append(link)
  }
}

/** 宿主仪表盘字体（0.8.6）：与草稿往返并行加载，建场景前等它，名牌 / 电视画面首帧即用新字体。 */
function loadStageFonts(env: typeof globalThis, searchParams: URLSearchParams): Promise<unknown> {
  const root = env.document?.documentElement
  if (!searchParams.has('fontChinese') || !root) return Promise.resolve()
  const fonts = createDashboardFonts(root, { env, onError: (error) => env.console?.warn?.(error.message) })
  return Promise.resolve(
    fonts.apply({
      chinese: searchParams.get('fontChinese') || 'device',
      latin: searchParams.get('fontLatin') || 'device',
    }),
  )
}

/**
 * 加载舞台模块，失败时**换一个 URL 重试一次**。
 *
 * 两个真实场景都只能靠换 URL 解决，重试同一个地址没用：
 *
 * - **preload 失败污染**：`stage.html` 里有 `<link rel="modulepreload" href="…stage.js?v=X">`。
 *   这个预加载若失败（弱网、连接被复用打断），Safari 会把「该 URL 取不到」记在模块映射里，
 *   随后的 `import()` 同一个 URL **直接失败、不再发请求** —— 手机 / 平板最常见，
 *   桌面 Chrome 不会这样，所以症状看起来是「只有移动端坏」。
 * - **浏览器按 URL 缓存 import 失败**：同一会话内重试同址不会重新发请求。
 *
 * 重试 URL 只多一个查询参数：后端 `get_resource` 的入参是 manifest 里的相对路径，
 * 额外 query 不影响命中；`?v=` 不再匹配时它只把缓存策略降为 `no-cache`（仍然 200）。
 * 只重试一次：真断网时第二次也失败，立即让调用方给出可操作文案，而不是无限重试。
 */
function loadStageModule(env: typeof globalThis = globalThis) {
  const url = preloadedStageModuleUrl(env)
  return import(/* @vite-ignore */ url).catch(
    () => import(/* @vite-ignore */ `${url}${url.includes('?') ? '&' : '?'}retry=1`),
  )
}

function beginStageStartup({
  env: env = globalThis,
  loadModule: loadModule = () => loadStageModule(env),
  createCache: createCache = createScenePersistentCache,
} = {}) {
  const configuredStagePath = (env as { HABridgeEmbed?: { path?: unknown } }).HABridgeEmbed?.path
  if (
    env.location?.pathname !== '/api/v1/modules/interaction3d/stage.html' &&
    // 嵌入方可用 HABridgeEmbed.path 指定舞台入口；两者都不匹配就不启动预热。
    (!configuredStagePath || env.location?.pathname !== configuredStagePath)
  )
    return null
  createLoadTiming('stage', env)('stage-startup-begin')
  const searchParams = new URLSearchParams(env.location.search),
    sceneId = searchParams.get('sceneId') || '',
    projectId = searchParams.get('projectId') || '',
    scenePath =
      '/modules/interaction3d/scenes/' +
      encodeURIComponent(sceneId) +
      '/current?projectId=' +
      encodeURIComponent(projectId),
    cache = createCache({ env }),
    // 场景准备缓存只认用户与项目；HA 离线时灯光历史作用域为空，后端另给一个稳定的缓存作用域。
    lightHistoryScope =
      env.document.body?.dataset.i3dSceneCacheScope || env.document.body?.dataset.i3dLightHistoryScope,
    // 构建版本进缓存键：引擎升级后旧的场景/几何准备结果自动失效（带 `?v=` 的舞台模块 URL 随构建变化）。
    studioAppSource = preloadedStageModuleUrl(env),
    preparationKey = scenePreparationKey(lightHistoryScope, projectId, sceneId, studioAppSource)
  cache.preload(preparationKey)
  const geometryCache = createGeometryPersistentCache({
    env: env,
    key: preparationKey,
  })
  geometryCache.preload()
  const furnitureCache = createGeometryPersistentCache({
    env: env,
    key: preparationKey ? JSON.stringify(['furniture-batches-v1', preparationKey]) : '',
  })
  furnitureCache.preload()
  const shadowCacheKey = contactShadowPreparationKey(lightHistoryScope, projectId, sceneId, studioAppSource, {
      legacy: searchParams.get('shadow-cache') === 'legacy',
    }),
    shadowCache = createContactShadowPersistentCache({
      env: env,
      key: shadowCacheKey,
    })
  shadowCache.preload()
  // 标准光影才跳过反射缓存预热：旧管线（含只写了 lightingMode 的老组件）继续用缓存。
  // 判据与舞台启动同源（`isLegacyEmbedStageLighting`），避免两处各判一遍后各走一条路。
  const reflectionCache = isLegacyEmbedStageLighting(searchParams)
    ? createReflectionPersistentCache({
        env: env,
        key: preparationKey,
      })
    : null
  reflectionCache?.preload()
  const preparationResponse = env.fetch('/api/v1' + scenePath, {
    cache: 'no-store',
    credentials: 'same-origin',
  })
  preparationResponse.catch(() => {})
  const stageModule = loadModule()
  preloadStageLoaderModules(env)
  return (
    stageModule.catch(() => {}),
    {
      path: scenePath,
      response: preparationResponse,
      module: stageModule,
      cache: cache,
      key: preparationKey,
      geometryCache: geometryCache,
      furnitureCache: furnitureCache,
      shadowCache: shadowCache,
      reflectionCache: reflectionCache,
      fontReady: loadStageFonts(env, searchParams),
    }
  )
}
export const stageStartup = beginStageStartup()
