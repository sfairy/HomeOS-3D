/**
 * studio 引导期的资源释放（从 `studio-app/boot` 的 teardown 闭包里拆出）。
 *
 * 这里只有「对已经建好的句柄做释放」和「清掉挂在 document / window 上的残留」两类动作，
 * 不持有任何引导期状态 —— 于是可以从那个 4000 行的宿主函数里独立出来。
 */

import { disposeStudioFonts } from '../../boot/studio-boot'
import { releaseMetalEnvironmentTextures } from '../../../materials/studio-metal-environment'
import { releaseSurfaceDetailTextures } from '../../../materials/studio-surface-normal-maps'

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
