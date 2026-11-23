/**
 * studio 引导期的资源释放（从 `studio-app/boot` 的 teardown 闭包里拆出）。
 *
 * 这里只有「对已经建好的句柄做释放」和「清掉挂在 document / window 上的残留」两类动作，
 * 不持有任何引导期状态 —— 于是可以从那个 4000 行的宿主函数里独立出来。
 */

import { disposeStudioFonts } from '../../boot/studio-boot'
import { releaseMetalEnvironmentTextures } from '../../../materials/studio-metal-environment'
import { releaseSurfaceDetailTextures } from '../../../materials/studio-surface-normal-maps'
import { releaseSurfaceStyleTextures } from '../../../materials/studio-surface-textures'
import { disposeOverlapAndPreview } from '../ui/overlap-and-preview-wiring'

type DisposableLike = { dispose?: () => void }
type RendererLike = DisposableLike & { forceContextLoss?: () => void }

/** teardown 需要回收的 three.js 句柄（`appCtx` 的子集）。 */
type StudioRendererHandles = {
  orbitControls?: DisposableLike | null
  contextResources?: DisposableLike | null
  threeRenderer?: RendererLike | null
  threeScene?: unknown
  threeCamera?: unknown
  sceneRootNode?: unknown
}

/**
 * 按依赖顺序释放渲染器相关资源。
 *
 * `contextResources` 必须在 `threeRenderer.dispose()` 之前：它还原 EventDispatcher 补丁并
 * 清空登记表，晚于 renderer 释放就再也拿不到那些对象了。
 */
export function releaseStudioRenderer(appCtx: StudioRendererHandles): void {
  try {
    appCtx.orbitControls?.dispose?.()
  } catch {
    /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */
  }
  try {
    appCtx.contextResources?.dispose?.()
  } catch {
    /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */
  }
  appCtx.contextResources = null
  try {
    // 模块级共享纹理跨实例存活，必须趁渲染器还在时释放，否则它们的 dispose 监听留住旧渲染器与画布。
    releaseMetalEnvironmentTextures()
    releaseSurfaceDetailTextures()
    releaseSurfaceStyleTextures()
  } catch {
    /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */
  }
  try {
    appCtx.threeRenderer?.dispose?.()
  } catch {
    /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */
  }
  try {
    appCtx.threeRenderer?.forceContextLoss?.()
  } catch {
    /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */
  }
  appCtx.threeRenderer = null
  appCtx.threeScene = null
  appCtx.threeCamera = null
  appCtx.orbitControls = null
  appCtx.sceneRootNode = null
}

/** studio 实例级资源：`StudioAppRuntime` 上能取到的四张「按规格共享」缓存。 */
type StudioSharedCaches = {
  geometryCacheByKey?: Map<unknown, unknown> | null
  floorGroupCacheByKey?: Map<unknown, unknown> | null
  textureCacheByKey?: Map<unknown, unknown> | null
  materialCacheByKey?: Map<unknown, unknown> | null
}

/** 地毯缓存条目：一份 base 几何 + 一份 inset 面（运行时是裸 three 对象，这里只关心 dispose）。 */
type RugGeometryRecord = { base?: DisposableLike; inset?: DisposableLike }

/**
 * 释放「只挂在 pagehide 上、SPA 路由切换永远等不到」的实例级资源。
 *
 * 三样东西每进出一次 studio 就会留一份：
 * - 素材缩略图 / 重叠浮层用的**第二个** `WebGLRenderer`（浏览器同时存活的上下文上限约 16 个，
 *   被挤掉的会是主画布 —— 表现为整块黑屏 / `Context Lost`）；
 * - 外部模型管理器持有的 GLTF 模板（每个 itemType 一份几何 + 贴图，是单笔最大的一块）；
 * - 按规格共享的架构几何 / 材质：`disposeObjectTree` 刻意跳过带 `shared` 标记的资源，
 *   所以必须在这里单独收尾（`textureCacheByKey` 里放的是材质，不是纹理，历史命名）。
 */
/** 释放按规格共享的架构几何（含地毯的 base / inset 两份）。 */
function disposeSharedGeometries(caches?: StudioSharedCaches): void {
  const geometrySet = new Set<DisposableLike>()
  for (const sharedGeometry of caches?.geometryCacheByKey?.values() ?? [])
    if (sharedGeometry) geometrySet.add(sharedGeometry as DisposableLike)
  for (const rugEntry of caches?.floorGroupCacheByKey?.values() ?? []) {
    const rugRecord = rugEntry as RugGeometryRecord | null
    if (rugRecord?.base) geometrySet.add(rugRecord.base)
    if (rugRecord?.inset) geometrySet.add(rugRecord.inset)
  }
  for (const sharedGeometry of geometrySet) sharedGeometry.dispose?.()
  caches?.geometryCacheByKey?.clear()
  caches?.floorGroupCacheByKey?.clear()
}

/** 释放按规格共享的材质（`textureCacheByKey` 里放的也是材质，历史命名）。 */
function disposeSharedMaterials(caches?: StudioSharedCaches): void {
  const materialSet = new Set<DisposableLike>()
  for (const cachedMaterial of caches?.textureCacheByKey?.values() ?? [])
    if (cachedMaterial) materialSet.add(cachedMaterial as DisposableLike)
  for (const cachedMaterial of caches?.materialCacheByKey?.values() ?? [])
    if (cachedMaterial) materialSet.add(cachedMaterial as DisposableLike)
  for (const sharedMaterial of materialSet) sharedMaterial.dispose?.()
  caches?.textureCacheByKey?.clear()
  caches?.materialCacheByKey?.clear()
}

export function releaseStudioOwnedResources(
  runtime: unknown,
  externalModelRegistry?: DisposableLike | null,
  caches?: StudioSharedCaches,
): void {
  try {
    disposeOverlapAndPreview(runtime as never)
  } catch {
    /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */
  }
  try {
    externalModelRegistry?.dispose?.()
  } catch {
    /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */
  }
  disposeSharedGeometries(caches)
  disposeSharedMaterials(caches)
}

/** 引导期写在 DOM 上的诊断标记：嵌入式 stage 的 body 类、dataset 键与 window 内部契约。 */
export function clearStudioDocumentResidue(): void {
  disposeStudioFonts()
  document.body.classList.remove('auto-diagram-embedded')
  document.documentElement.classList.remove('list-drag-active')
  const documentDataset = document.documentElement.dataset
  for (const datasetKey of [
    'lightRenderCache',
    'renderStatsTest',
    'performanceDiagnostics',
    'modelExportReady',
    'modelExportError',
    'materialTestStage',
    'materialTestStats',
    'materialTestReady',
    'materialTestError',
    'instanceTestStats',
    'instanceTestReady',
    'instanceTestError',
    'effectCacheStats',
    'interactionBatchStats',
    'shadowReceiverTrial',
    // 灯光路径的诊断标记：舞台/编辑器模式、「已退回原生逐灯」的结论、锥体参数就地同步计数。
    'stageLightingMode',
    'lightingFallback',
    'lightShapeSync',
  ]) {
    delete documentDataset[datasetKey]
  }
  // 挂在 window 上的内部契约（`__homeosStudioModuleVersion` 是模块求值期写入的版本标记，
  // 不随本次引导产生，因此这里不动它）。
  const windowContract = window as unknown as Record<string, unknown>
  delete windowContract.__homeosWallRuntimeProfile
  delete windowContract.__homeosDeferExternalModel
  delete windowContract.__homeosReleasingDeferredModels
  delete windowContract.__homeosExportFurnitureJson
  delete windowContract.externalModelLoadsDeferred
}
