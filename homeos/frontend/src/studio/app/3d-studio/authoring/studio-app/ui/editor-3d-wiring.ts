/**
 * 3D 视口编辑的装配层（0.8.7 `studio-app.js` 里 `createEditor3DOverlay({...})` 调用点的对应实现）。
 *
 * 职责边界刻意分开：
 * - `interaction/editor-picking.ts`        拾取（实例合批 / 祖先 tag / 包围盒回退）
 * - `interaction/editor-3d-gesture.ts`     几何（射线 / 平面 / 吸附）
 * - `ui/editor-3d-geometry.ts`             世界坐标换算（含楼层矩阵）
 * - `ui/editor-3d-selection.ts`            选中桥与场景索引
 * - `ui/editor-3d-overlay-state.ts`        叠层读取状态 / 离地目标 / 手势校验
 * - `ui/editor-3d-overlay.ts`              状态机与 DOM
 * - `ui/editor-3d-overlay-options.ts`      叠层选项装配
 * - `ui/editor-light-toolbar-options.ts`   灯带工具条选项装配
 *
 * 本文件只剩「事务 + 绑定生命周期」：不含算法，也不含回调拼装。
 */
import * as three from '/static/vendor/three/0.187.0/three.module.min.js'
import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { createSurfaceIndex } from '../interaction/editor-surface-index'
import { createEditor3DOverlay } from './editor-3d-overlay'
import {
  createOverlayWatchdog,
  SIGNATURE_LENGTH,
  writeCameraSignature,
  type OverlayWatchdog,
} from './editor-3d-overlay-watchdog'
import { createLightToolbar } from './editor-light-toolbar'
import { isLightItem } from './editor-3d-overlay-state'
import { createGeometry, findItem, type Geometry } from './editor-3d-geometry'
import { createSelectionBridge, type SelectionBridge } from './editor-3d-selection'
import { createOverlayOptions, type TransactionState } from './editor-3d-overlay-options'
import { createToolbarOptions } from './editor-light-toolbar-options'

export interface Editor3DBinding {
  update: () => void
  cancel: () => void
  /** 是否有 3D 拖动手势进行中（平面标尺据此整层收起）。 */
  isDragging: () => boolean
  dispose: () => void
}

const editor3DBindings = new WeakMap<object, Editor3DBinding>()
let armedRuntime: StudioAppRuntime | null = null

/** boot 结束时交给本模块的 runtime；渲染器可能还没创建，绑定推迟到第一次刷新。 */
export function armEditor3D(runtime: StudioAppRuntime): void {
  armedRuntime = runtime
}

/** 每次画布重绘 / UI 刷新后调用；未绑定时是空操作。 */
export function refreshEditor3D(appCtx: object): void {
  const existing = editor3DBindings.get(appCtx)
  if (existing) {
    existing.update()
    return
  }
  if (!armedRuntime || armedRuntime.appCtx !== appCtx) return
  bindEditor3D(armedRuntime).update()
}

/** 路由离开 / 舞台卸载时调用：摘掉画布与叠层的监听。 */
export function disposeEditor3D(appCtx: object): void {
  editor3DBindings.get(appCtx)?.dispose()
}

/** 结束进行中的 3D 编辑手势（工作区切换 / 场景重建 / 窗口失焦）。 */
export function cancelEditor3D(appCtx: object): void {
  editor3DBindings.get(appCtx)?.cancel()
}

/**
 * 灯带高度变化的强度补偿（0.8.7 `lightHeightResponse`）。
 *
 * 面光源越靠近被照面越亮是物理事实，但编辑时用户调的是「离地高度」，不是亮度：
 * 不补偿的话抬高 30cm 会让墙上的光斑突然消失。这里按高度比缩放强度，
 * 并把本次高度记为新的基准（下一次拖动的除数）。
 */
function compensateStripLightIntensity(object: Record<string, unknown>, nextHeight: number): void {
  const height = Math.max(0.05, Number(nextHeight) || 0)
  type LightNode = { isRectAreaLight?: boolean; intensity?: number; userData?: Record<string, unknown> }
  const traversable = object as { traverse?: (callback: (node: LightNode) => void) => void }
  traversable.traverse?.((node) => {
    const data = node.userData || {}
    if (!node.isRectAreaLight || data.lightSourceType !== 'continuous-area-strip') return
    const previous = Number(data.lightHeightResponse) || height
    const factor = height / previous
    node.intensity = Number(node.intensity || 0) * factor
    data.lightOnIntensity = Number(data.lightOnIntensity || 0) * factor
    if (Number.isFinite(data.regionFullIntensity)) data.regionFullIntensity = Number(data.regionFullIntensity) * factor
    data.lightHeightResponse = height
  })
}

/** 提交后按新离地补偿灯带强度（只对灯带生效）。 */
function compensateLightsAfterCommit(runtime: StudioAppRuntime, selection: SelectionBridge): void {
  for (const id of selection.ids()) {
    const item = findItem(runtime, id)
    const object = selection.liveObject(id)
    if (item && object) compensateStripLightIntensity(object, Number(item.elevation || 0))
  }
}

/** 事务：开始记一份撤销快照，提交时用它校验 / 回滚 / 重建。 */
function createTransaction(runtime: StudioAppRuntime, tx: TransactionState) {
  const beginInteraction = (): void => {
    tx.snapshot = runtime.captureUndoSnapshot?.() ?? null
    runtime.handleOrbitStart?.()
  }
  const commit = (scope: 'items' | 'lights'): boolean => {
    const accepted = tx.snapshot === null ? true : runtime.validateSelectionChange(tx.snapshot)
    if (accepted) runtime.applyPlacementChange?.(tx.snapshot)
    runtime.markDocumentDirty?.()
    runtime.requestSceneRebuild?.({ scope, preserveLightCache: true })
    // 提交后同步属性面板：否则「3D 里拖完，右侧离地字段还是旧值」。
    runtime.refreshStudioUi?.()
    runtime.refreshStudioView?.()
    tx.snapshot = null
    return accepted
  }
  const endInteraction = (): void => {
    runtime.handleOrbitEnd?.()
  }
  return { beginInteraction, commit, endInteraction }
}

/** 场景 / 渲染器缺失时的空绑定（嵌入舞台只读、首帧未就绪）。 */
function emptyBinding(): Editor3DBinding {
  return { update: () => {}, cancel: () => {}, isDragging: () => false, dispose: () => {} }
}

/**
 * 是否有 3D 拖动手势进行中。
 *
 * 平面标尺用它决定是否整层收起（0.8.7 `nS()` 的 `On`）：拖动物件时标尺压在
 * 手柄上会既看不清读数、也点不到手柄。
 */
export function isEditor3DGestureActive(appCtx: object): boolean {
  return editor3DBindings.get(appCtx)?.isDragging() ?? false
}

/**
 * 绑定所需的一整套对象：几何、选中桥、台面索引、事务。
 *
 * 抽成函数是为了让 `bindEditor3D` 只做「建叠层 + 挂监听 + 返回」，
 * 不把初始化细节和生命周期混在一起。
 */
interface BindingCore {
  geometry: Geometry
  selection: SelectionBridge
  surfaceIndex: ReturnType<typeof createSurfaceIndex>
  transaction: ReturnType<typeof createTransaction>
  tx: TransactionState
}

function createBindingCore(runtime: StudioAppRuntime, canvas: HTMLCanvasElement, host?: HTMLElement): BindingCore {
  let ensureIndex = (): void => {}
  let liveObject = (_id: string): Record<string, unknown> | null => null
  const geometry = createGeometry(runtime, canvas, {
    ensureIndex: () => ensureIndex(),
    liveObject: (id) => liveObject(id),
    host,
  })
  const selection = createSelectionBridge(runtime, geometry.mapper)
  const surfaceIndex = createSurfaceIndex(three as never)
  ensureIndex = selection.ensureIndex
  liveObject = selection.liveObject
  const tx: TransactionState = { snapshot: null }
  return { geometry, selection, surfaceIndex, transaction: createTransaction(runtime, tx), tx }
}

function createOverlayBinding(
  runtime: StudioAppRuntime,
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  core: BindingCore,
) {
  const { geometry, selection, surfaceIndex, transaction } = core
  return createEditor3DOverlay(
    createOverlayOptions({
      runtime,
      geometry,
      selection,
      host,
      canvas,
      surfaceIndex,
      beginInteraction: () => {
        selection.rebuildIndex()
        // 台面索引按需重建：拖动开始 / 场景重建后，不在每帧遍历网格。
        surfaceIndex.rebuild(runtime.appCtx.sceneRootNode)
        transaction.beginInteraction()
      },
      commit: () => {
        const accepted = transaction.commit('items')
        compensateLightsAfterCommit(runtime, selection)
        selection.invalidate()
        geometry.clearCache()
        return accepted
      },
      endInteraction: () => {
        transaction.endInteraction()
        selection.invalidate()
      },
    }),
  )
}

function createToolbarBinding(runtime: StudioAppRuntime, core: BindingCore) {
  const { geometry, selection, tx, transaction } = core
  return createLightToolbar(
    createToolbarOptions({
      runtime,
      geometry,
      selection,
      tx,
      beginInteraction: () => {
        selection.rebuildIndex()
        transaction.beginInteraction()
      },
      commitLights: () => {
        // gizmo 现在也服务家具：家具改的是位置/旋转，走 items 作用域才会重算
        // 接触阴影与合批；灯具仍按 lights 作用域保留灯光缓存。
        const id = selection.ids()[0]
        const item = id ? findItem(runtime, id) : null
        transaction.commit(item && !isLightItem(item) ? 'items' : 'lights')
        selection.invalidate()
      },
    }),
  )
}

export function bindEditor3D(runtime: StudioAppRuntime): Editor3DBinding {
  const host = globalThis.document.getElementById('preview-3d')
  const canvas = runtime.appCtx.threeRenderer?.domElement as HTMLCanvasElement | undefined
  if (!host || !canvas) return emptyBinding()
  const core = createBindingCore(runtime, canvas, host)
  const overlay = createOverlayBinding(runtime, canvas, host, core)
  const toolbar = createToolbarBinding(runtime, core)
  // 上一次真正重排叠层时的相机签名。`update()` 自己写它，看门狗只比对 ——
  // 否则「渲染末尾刷一次」与看门狗会在同一帧各写一次 DOM：两次读相机的时间点不同，
  // 相机在阻尼滑行时每帧都会变，第二次写入就比第一帧晚半帧，整层灯位圆点会在两个
  // 位置之间来回闪（这正是「旋转 / 缩放时灯光图抖动」的直接原因）。
  const previousSignature: number[] = new Array<number>(SIGNATURE_LENGTH).fill(0)
  writeCameraSignature(runtime, previousSignature)
  let watchdog: OverlayWatchdog | null = null
  const update = (): void => {
    overlay.update()
    toolbar.update()
    // 签名在**写完**之后记录：`project()` 会刷新 `camera.updateMatrixWorld()`，
    // 记在前面的签名可能已经过期，下一帧看门狗会再刷一次（多余的一次 DOM 写）。
    writeCameraSignature(runtime, previousSignature)
    watchdog?.touch()
  }
  watchdog = createOverlayWatchdog(runtime, globalThis.document, canvas, previousSignature, update)
  watchdog.start()

  const binding: Editor3DBinding = {
    update,
    isDragging: () => overlay.isDragging(),
    cancel: () => {
      overlay.cancel()
      toolbar.cancel()
      update()
    },
    dispose() {
      watchdog?.dispose()
      overlay.dispose()
      toolbar.dispose()
      editor3DBindings.delete(runtime.appCtx)
    },
  }
  editor3DBindings.set(runtime.appCtx, binding)
  return binding
}
