import { normalizeSceneStyle as normalizeSceneStyle2 } from '../../../../shared/scene-styles'
import { saveEmbeddedBaseLighting, type StudioApiFetch, type EmbeddedBaseLightingTarget } from '../lights/lighting'

/* 户型图自动导图的 iframe 桥接消息（楼层/灯光/相机/生成）。
 * 从 `studio-app/boot.ts` 整块搬出：读 `appCtx`、相机与导出句柄，写 `appCtx.*` 与 DOM。 */

export function bindAutoDiagramMessages(deps: Record<string, any>): void {
  const {
    DEFAULT_BASE_LIGHTING2,
    appCtx,
    applyBaseLighting,
    autoDiagramComponentId,
    baseLightControlsElement,
    clamp2,
    exportDialogElement,
    exportFolderNameInput,
    exportHeightInput,
    exportLockRatioInput,
    exportWidthInput,
    finite2,
    generateExportBundle,
    getActiveFloor,
    getCameraMode,
    getCameraView,
    getPreviewFloorMode,
    captureOverviewCamera,
    getCameraFocalLength,
    getCameraTopRotation,
    isAutoDiagramEmbed,
    openLightingDialog,
    postBridgeFloors,
    postBridgeState,
    refreshCanvasSizeUi,
    saveBaseLightingEdit,
    selectPreviewFloor,
  } = deps
  /*
   * 0.8.7：构图（cameraSnapshot）回传。
   * 用**独立的监听器**而不是并进下面按 `type` 串联的大 listener：
   * 主 listener 已经很长。这里只认一种消息，逻辑全在模块函数里。
   */
  const cameraBridgeState = { revision: 0, timer: 0 }
  const cameraBridgeDeps: AutoDiagramCameraBridgeDeps = {
    autoDiagramComponentId,
    isAutoDiagramEmbed,
    captureOverviewCamera,
    getCameraView,
    getCameraMode,
    getCameraTopRotation,
    getCameraFocalLength,
    getPreviewFloorMode,
  }
  appCtx.orbitControls?.addEventListener?.('end', () =>
    scheduleAutoDiagramCameraStatePost(cameraBridgeDeps, cameraBridgeState),
  )
  window.addEventListener('message', (cameraBridgeEvent) => {
    if (!isAutoDiagramEmbed || cameraBridgeEvent.origin !== window.location.origin) return
    const cameraBridgeData = cameraBridgeEvent.data
    if (cameraBridgeData?.type !== 'homeos-floorplan-auto-diagram-camera') return
    if (cameraBridgeData.componentId !== autoDiagramComponentId) return
    if (cameraBridgeEvent.source !== window.parent) return
    handleAutoDiagramCameraCommand(
      deps as unknown as AutoDiagramCameraCommandDeps,
      cameraBridgeDeps,
      cameraBridgeState,
      cameraBridgeData,
    )
  })

  window.addEventListener('message', (bridgeMessageEvent) => {
    if (
      !isAutoDiagramEmbed ||
      bridgeMessageEvent.origin !== window.location.origin ||
      bridgeMessageEvent.source !== window.parent
    )
      return
    const data2 = bridgeMessageEvent.data
    if (!(!data2 || data2.componentId !== autoDiagramComponentId)) {
      if (data2.type === 'homeos-floorplan-auto-diagram-floor') {
        if (data2.command === 'set-floor') {
          const bridgeFloorRecord = appCtx.studioProject.floors.find(
              (bridgeFloor: any) => bridgeFloor.id === data2.value,
            ),
            bridgeFloorId =
              data2.value === 'all' && appCtx.studioProject.floors.length > 1
                ? 'all'
                : bridgeFloorRecord?.id || getActiveFloor()?.id || appCtx.activeFloorId
          selectPreviewFloor(bridgeFloorId), postBridgeFloors()
        }
        return
      }
      if (data2.type === 'homeos-floorplan-auto-diagram-base-lighting') {
        data2.command === 'request-state'
          ? ((baseLightControlsElement.hidden = true),
            applyBaseLighting(appCtx.studioProject.baseLighting),
            postBridgeState('ready'))
          : data2.command === 'preview'
            ? ((baseLightControlsElement.hidden = true), applyBaseLighting(data2.lighting), postBridgeState('preview'))
            : data2.command === 'reset'
              ? ((baseLightControlsElement.hidden = true),
                applyBaseLighting(DEFAULT_BASE_LIGHTING2),
                postBridgeState('preview'))
              : data2.command === 'save'
                ? ((baseLightControlsElement.hidden = true),
                  applyBaseLighting(data2.lighting),
                  // 只把当前主题这一格写回服务器（见 `saveAutoDiagramLighting` 的注释）：
                  // 整场景 PUT 会在 iframe 打开很久后撞 409，并把父页面的改动一起覆盖。
                  void saveEmbeddedLighting(deps as unknown as EmbeddedLightingBridge, data2.lighting))
                : data2.command === 'cancel' || data2.command === 'close'
                  ? (openLightingDialog(), postBridgeState('cancelled'))
                  : saveBaseLightingEdit()
        return
      }
      if (data2.type === 'homeos-floorplan-auto-diagram-generate' && !appCtx.isInteractionLocked) {
        for (const bridgeCameraStateExportFileCheckbox of exportDialogElement.querySelectorAll(
          'input[data-export-file]',
        ))
          bridgeCameraStateExportFileCheckbox.checked = true
        ;(exportFolderNameInput.value = String(data2.folderName || '').trim()),
          (exportWidthInput.value = String(
            Math.round(clamp2(finite2(data2.width, exportWidthInput.value), 320, 4096)),
          )),
          (exportHeightInput.value = String(
            Math.round(clamp2(finite2(data2.height, exportHeightInput.value), 320, 4096)),
          )),
          (exportLockRatioInput.checked = true),
          refreshCanvasSizeUi(),
          generateExportBundle()
      }
    }
  })
}

/** 桥接依赖里 `saveEmbeddedLighting` 实际用到的字段（其余键由调用方保留）。 */
interface EmbeddedLightingBridge {
  appCtx: {
    sceneStyle?: unknown
    studioProject?: EmbeddedBaseLightingTarget['project']
    loadedDraft?: { revision?: number } | null
  }
  fetchStudioApi: StudioApiFetch
  postBridgeState: (state: string, message?: string) => void
  showToast?: (message: string, level?: 'success' | 'warning' | 'error') => void
  studioDocumentStore?: { advanceLoadedRevision?: (revision: number) => void }
}

/**
 * 内嵌自动导图「保存光照」：只合并当前主题那一格（实现见 `saveEmbeddedBaseLighting`），
 * 并把服务器返回的新 revision 推进到本地，避免之后的自动保存拿旧 revision 撞 409。
 */
function saveEmbeddedLighting(deps: EmbeddedLightingBridge, lighting: Record<string, unknown>) {
  const { appCtx, postBridgeState } = deps
  return saveEmbeddedBaseLighting(
    {
      fetchStudioApi: deps.fetchStudioApi,
      sceneStyle: appCtx.sceneStyle,
      project: appCtx.studioProject,
      advanceRevision: (revision: number) => {
        deps.studioDocumentStore?.advanceLoadedRevision?.(revision)
        if (appCtx.loadedDraft) appCtx.loadedDraft = { ...appCtx.loadedDraft, revision }
      },
      onSaved: () => postBridgeState('saved'),
      // 失败不能报 saved（父页面会关面板，用户以为存上了）；同时把原因回传给父页面，
      // 让面板状态行显示具体失败原因而不是一直停在「正在保存并同步…」。
      onError: (message: string) => {
        deps.showToast?.(message, 'error')
        postBridgeState('error', message)
      },
    },
    normalizeSceneStyle2(appCtx.sceneStyle),
    lighting,
  )
}

/** 回传构图所需的只读依赖（显式传入，模块函数不读 bind 的闭包）。 */
interface AutoDiagramCameraBridgeDeps {
  autoDiagramComponentId: string
  isAutoDiagramEmbed: boolean
  captureOverviewCamera: () => unknown
  getCameraView: () => unknown
  getCameraMode: () => unknown
  getCameraTopRotation: () => unknown
  getCameraFocalLength: () => unknown
  getPreviewFloorMode: () => unknown
}

/** 相机指令落地需要写回的设置对象（`cameraSettings()` 的返回形状）。 */
interface AutoDiagramCameraSettings {
  cameraMode: string
  cameraView: string
  cameraTopRotation: number
  cameraFocalLength: number
}

/** 相机指令需要的可写依赖：在只读依赖之上补设置与重建函数。 */
interface AutoDiagramCameraCommandDeps extends AutoDiagramCameraBridgeDeps {
  cameraSettings: () => AutoDiagramCameraSettings
  setCameraMode: (mode: string, options?: { preserveView?: boolean }) => void
  setCameraView: (view: string, options?: { force?: boolean }) => void
  applyCameraFocalLength: () => void
  applyCameraState: (snapshot: unknown, viewportAspect?: number) => void
  refreshSceneRender: () => void
  finite2: (value: unknown, fallback: number) => number
  clamp2: (value: number, min: number, max: number) => number
  getCameraTopRotation: () => number
  getCameraFocalLength: () => number
}

/** 父窗口下发的相机消息。 */
interface AutoDiagramCameraMessage {
  command?: string
  cameraRevision?: unknown
  requestId?: unknown
  value?: unknown
}

/** 可变状态：revision 让迟到的旧 restore 失效，timer 做节流。 */
interface AutoDiagramCameraBridgeState {
  revision: number
  timer: number
}

/**
 * 子窗口 → 父窗口回传当前构图。
 *
 * 编辑器把它写进 `component.properties.cameraSnapshot`，于是撤销栈、草稿持久化与
 * 重新打开都能还原视角 —— 这正是 0.8.7「构图会单独保存到控件」的实现点。
 */
function postAutoDiagramCameraState(
  deps: AutoDiagramCameraBridgeDeps,
  state: AutoDiagramCameraBridgeState,
  requestId = '',
): void {
  if (!deps.isAutoDiagramEmbed || window === window.parent) return
  window.parent.postMessage(
    {
      type: 'homeos-floorplan-auto-diagram-camera-state',
      componentId: deps.autoDiagramComponentId,
      ...(requestId ? { requestId } : {}),
      cameraRevision: state.revision,
      floorSelection: deps.getPreviewFloorMode(),
      camera: {
        view: deps.getCameraView(),
        mode: deps.getCameraMode(),
        topRotation: deps.getCameraTopRotation(),
        focalLength: deps.getCameraFocalLength(),
        snapshot: deps.captureOverviewCamera(),
      },
    },
    window.location.origin,
  )
}

/** 拖动时每帧都在变，收尾后再回传：180ms 节流，跟手又不刷爆消息队列。 */
function scheduleAutoDiagramCameraStatePost(
  deps: AutoDiagramCameraBridgeDeps,
  state: AutoDiagramCameraBridgeState,
): void {
  if (!deps.isAutoDiagramEmbed) return
  window.clearTimeout(state.timer)
  state.timer = window.setTimeout(() => postAutoDiagramCameraState(deps, state), 180)
}

/**
 * 处理父窗口发来的相机指令。
 *
 * `restore` 的 `snapshot` 是保存过的构图；没有 snapshot 的旧文档退回按
 * view/mode/topRotation/focalLength 重建，保证老草稿也能打开。
 */
export function handleAutoDiagramCameraCommand(
  deps: AutoDiagramCameraCommandDeps,
  bridgeDeps: AutoDiagramCameraBridgeDeps,
  state: AutoDiagramCameraBridgeState,
  message: AutoDiagramCameraMessage,
): void {
  // 父窗口带 revision 时只接受不比本地旧的指令，避免乱序消息把新视角打回去。
  const incomingRevision = Number(message.cameraRevision)
  if (Number.isInteger(incomingRevision)) {
    if (incomingRevision < state.revision) return
    state.revision = incomingRevision
  }
  if (message.command === 'capture') {
    postAutoDiagramCameraState(bridgeDeps, state, String(message.requestId || ''))
    return
  }
  applyAutoDiagramCameraCommand(deps, message)
  deps.refreshSceneRender()
}

/**
 * 相机指令落地：用分发表而不是 if 链。
 * 拆成每个命令一个 5 行以内的处理器最稳。
 */
const AUTO_DIAGRAM_CAMERA_COMMANDS: Record<
  string,
  (deps: AutoDiagramCameraCommandDeps, message: AutoDiagramCameraMessage) => void
> = {
  restore: (deps, message) =>
    restoreAutoDiagramCamera(deps, (message.value as Record<string, unknown> | undefined) || {}),
  'set-view': (deps, message) => {
    const view = message.value === 'top' ? 'top' : 'free'
    deps.cameraSettings().cameraView = view
    deps.setCameraView(view)
  },
  'set-mode': (deps, message) => {
    const mode = message.value === 'perspective' ? 'perspective' : 'orthographic'
    deps.cameraSettings().cameraMode = mode
    deps.setCameraMode(mode)
  },
  'rotate-top': (deps) => {
    deps.setCameraView('top', { force: true })
    deps.cameraSettings().cameraTopRotation = (deps.getCameraTopRotation() + 90) % 360
  },
  'set-focal-length': (deps, message) => {
    deps.cameraSettings().cameraFocalLength = deps.clamp2(
      deps.finite2(message.value, deps.getCameraFocalLength()),
      18,
      120,
    )
    deps.applyCameraFocalLength()
  },
}

function applyAutoDiagramCameraCommand(deps: AutoDiagramCameraCommandDeps, message: AutoDiagramCameraMessage): void {
  AUTO_DIAGRAM_CAMERA_COMMANDS[message.command ?? '']?.(deps, message)
}

/**
 * `restore`：有 snapshot 就整体还原机位（用户拖出来的构图）；
 * 没有 snapshot 的老文档按 view/mode/topRotation/focalLength 重建。
 */
function restoreAutoDiagramCamera(deps: AutoDiagramCameraCommandDeps, restored: Record<string, unknown>): void {
  const settings = deps.cameraSettings()
  settings.cameraMode = restored.mode === 'perspective' ? 'perspective' : 'orthographic'
  settings.cameraView = restored.view === 'top' ? 'top' : 'free'
  settings.cameraTopRotation = (((Math.round(deps.finite2(restored.topRotation, 0) / 90) * 90) % 360) + 360) % 360
  settings.cameraFocalLength = deps.clamp2(deps.finite2(restored.focalLength, 50), 18, 120)
  const snapshot = restored.snapshot as { viewportAspect?: number } | null | undefined
  if (snapshot) {
    deps.applyCameraState(snapshot, snapshot.viewportAspect)
    return
  }
  deps.setCameraMode(settings.cameraMode, { preserveView: true })
  deps.setCameraView(settings.cameraView, { force: true })
  deps.applyCameraFocalLength()
}
