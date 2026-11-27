import { shellConfirm } from '@/studio/platform/shell-chrome'
import { type StudioAppRuntime } from '../runtime/studio-app-runtime'

/**
 * 把页面内 `<dialog>` 的「确认 / 取消 / ESC」收敛成一个 Promise。
 *
 * 为什么单独成模块：楼层删除、导出存档删除、灯光提示三处都是同一个模式 ——
 * 这些提示必须是 studio 自己的窄版弹窗（0.8.7 里有专用小标与配色），
 * 而 `openDialog` / `showModal` 的结算逻辑（含 ESC、点遮罩、重复打开）写三遍必然是复制粘贴。
 */

export interface DialogPromiseBinding {
  dialog: HTMLDialogElement
  /** 确认按钮；提示类弹窗可以传同一个「知道了」按钮。 */
  confirm: Element | null
  /** 取消 / 关闭按钮：点任意一个都按取消结算。 */
  cancels: Element[]
  /** 打开前的填充（把楼层名、存档名、灯数写进弹窗）。 */
  prepare?: () => void
}

/**
 * 打开并等待用户选择。
 *
 * @returns `true` = 确认，`false` = 取消 / ESC / 点遮罩关闭
 */
export function openDialogPromise(binding: DialogPromiseBinding): Promise<boolean> {
  binding.prepare?.()
  // 上一次没关干净时先关：`showModal()` 对已打开的 dialog 会抛 InvalidStateError。
  if (binding.dialog.open) binding.dialog.close()
  return new Promise<boolean>((resolve) => {
    const finish = (accepted: boolean) => {
      binding.dialog.removeEventListener('close', onClose)
      binding.confirm?.removeEventListener('click', onConfirm)
      for (const button of binding.cancels) button.removeEventListener('click', onCancel)
      if (binding.dialog.open) binding.dialog.close()
      resolve(accepted)
    }
    // ESC / 点遮罩都会派发 `close`，一律按取消处理。
    const onClose = () => finish(false)
    const onConfirm = (event: Event) => {
      event.preventDefault()
      finish(true)
    }
    const onCancel = (event: Event) => {
      event.preventDefault()
      finish(false)
    }
    binding.dialog.addEventListener('close', onClose)
    binding.confirm?.addEventListener('click', onConfirm)
    for (const button of binding.cancels) button.addEventListener('click', onCancel)
    binding.dialog.showModal()
  })
}

/** 按 id 取多个元素，滤掉不存在的（宿主页面可能没渲染全）。 */
export function elementsById(ids: string[]): HTMLElement[] {
  return ids.map((id) => globalThis.document.getElementById(id)).filter((element): element is HTMLElement => !!element)
}

/**
 * 户型绘制里走**页面内对话框**的确认 / 提示（0.8.7 `#floor-delete-dialog` / `#drawing-light-notice-dialog`）。
 *
 * 为什么不用外壳的 `shellConfirm`：0.8.7 这两个提示是 studio 自己的 `<dialog>`，
 * 带 `DELETE FLOOR` / `LIGHTING NOTICE` 的英文小标与专用配色；换成外壳通用确认框后
 * 弹窗位置、宽度、按钮层级都和参考站不一致（同一句文案、两套外观）。
 * 页面里找不到对应 dialog 时（例如被嵌入到别的页面）才回落到 `shellConfirm`，保证功能不丢。
 */

export function confirmFloorDeletion(floorName: string): Promise<boolean> {
  const documentNode = globalThis.document
  const dialog = documentNode.getElementById('floor-delete-dialog') as HTMLDialogElement | null
  const nameElement = documentNode.getElementById('floor-delete-name')
  const confirmButton = documentNode.getElementById('floor-delete-confirm')
  if (!dialog || !nameElement || !confirmButton) {
    return shellConfirm({
      title: '删除这个楼层？',
      message: '确定删除“' + floorName + '”吗？这一层的绘图数据不会保留，此操作无法撤销。',
      confirmLabel: '删除楼层',
      cancelLabel: '取消',
      tone: 'danger',
    })
  }
  return openDialogPromise({
    dialog,
    confirm: confirmButton,
    cancels: elementsById(['floor-delete-cancel', 'floor-delete-close']),
    prepare: () => {
      nameElement.textContent = floorName
    },
  })
}

export function showDrawingLightNotice(litLightCount: number): Promise<void> {
  const documentNode = globalThis.document
  const dialog = documentNode.getElementById('drawing-light-notice-dialog') as HTMLDialogElement | null
  const countElement = documentNode.getElementById('drawing-light-notice-count')
  if (!dialog || !countElement) {
    return shellConfirm({
      title: '灯光开启较多',
      message:
        '同时开启较多灯光可能导致卡顿，建议配置完成后关闭，需要时再开启。\n\n当前已开启：' + litLightCount + ' 盏',
      confirmLabel: '知道了',
      cancelLabel: '关闭',
    }).then(() => undefined)
  }
  return openDialogPromise({
    dialog,
    // 提示只有一个按钮：确认就够，ESC / 点遮罩同样关闭。
    confirm: dialog.querySelector('.primary-action'),
    cancels: [],
    prepare: () => {
      countElement.textContent = `${litLightCount} 盏`
    },
  }).then(() => undefined)
}

/**
 * Vue HMR / 壳层重挂会重建 StudioDialogs，boot 里缓存的 dialog 引用会变成
 * `isConnected === false`；对游离节点调 showModal 会抛 InvalidStateError，
 * 409 冲突框永远打不开，保存状态机也就卡死。
 */
function resolveLiveSaveConflictDialog(runtime: StudioAppRuntime): HTMLDialogElement | null {
  const cached = runtime.saveConflictDialogElement
  if (cached instanceof HTMLDialogElement && cached.isConnected) return cached
  const live = runtime.selectElement?.('#save-conflict-dialog')
  return live instanceof HTMLDialogElement && live.isConnected ? live : null
}

/** 确保「导出本地副本」按钮在（可能被 Vue 重建的）冲突对话框上仍然存在。 */
function ensureSaveConflictExportButton(dialog: HTMLDialogElement): void {
  if (dialog.querySelector('#save-conflict-export')) return
  const actions = dialog.querySelector('.dialog-actions')
  if (!actions) return
  const exportButton = document.createElement('button')
  exportButton.id = 'save-conflict-export'
  exportButton.type = 'button'
  exportButton.textContent = '导出本地副本'
  actions.append(exportButton)
}

/** 补导出按钮，并让 Esc 关不掉冲突框（三个出口必须选一个）；重复调用无副作用。 */
export function prepareSaveConflictDialog(dialog: unknown): void {
  if (!(dialog instanceof HTMLDialogElement)) return
  ensureSaveConflictExportButton(dialog)
  if (dialog.dataset.conflictCancelGuarded) return
  dialog.dataset.conflictCancelGuarded = '1'
  dialog.addEventListener('cancel', (event) => event.preventDefault())
}

/** 打开 409 冲突对话框；节点游离时改查直播 DOM，失败只 toast，绝不抛进 autosave。 */
export function openSaveConflictDialog(runtime: StudioAppRuntime): void {
  const dialog = resolveLiveSaveConflictDialog(runtime)
  if (!dialog) {
    runtime.showToast('保存冲突：找不到冲突对话框，请刷新页面后重试。', 'error')
    return
  }
  prepareSaveConflictDialog(dialog)
  try {
    if (!dialog.open) dialog.showModal()
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    runtime.showToast(message || '无法打开保存冲突对话框，请刷新页面后重试。', 'error')
  }
}

/** 记下 409 冲突现场（服务器最新 / 本地场景 / 目标版本）并弹出三出口对话框。 */
export function recordSaveConflict(
  runtime: StudioAppRuntime,
  conflictLatest: unknown,
  conflictLocalScene: unknown,
  conflictTargetVersion: unknown,
) {
  runtime.appCtx.pendingConflict = {
    latest: conflictLatest,
    localScene: conflictLocalScene,
    targetVersion: conflictTargetVersion,
  }
  runtime.showSaveState('等待处理保存冲突', 'error')
  openSaveConflictDialog(runtime)
}

/* 导出弹窗：尺寸/锁定比例/楼层选择/打包入口。
 * 从 `studio-app/boot.ts` 整块搬出：读 `appCtx` 与导出句柄，写 `appCtx.*` 与 DOM。 */
export function bindExportDialogWiring(deps: Record<string, any>): void {
  const {
    appCtx,
    closeExportCompleteDialog,
    closePresetRenameDialog,
    exportDialogElement,
    exportFloorSelectElement,
    exportHeightInput,
    exportLockRatioInput,
    exportPackageButton,
    exportPresetAddButton,
    exportPresetDeleteButton,
    exportPresetRenameButton,
    exportPresetRenameDialogElement,
    exportPresetRenameFormElement,
    exportPresetRenameInputElement,
    exportPresetSlotsElement,
    exportWidthInput,
    formatPresetLabel,
    generateExportBundle,
    handleCanvasSizeInput,
    makeUniquePresetName,
    markDocumentDirty,
    normalizeActiveExportPresetSlot2,
    normalizeExportPresetSlots2,
    openExportDialog,
    openPresetDeleteDialog,
    openPresetRenameDialog,
    refreshCanvasSizeUi,
    renderExportPresetSlots,
    saveAsNewPreset,
    selectElement,
    selectExportPresetSlot,
    selectPreviewFloor,
    showToast,
    stateViewportAspectGetCanvasSize,
    syncExportControls,
  } = deps
  selectElement('#export-complete-close').addEventListener('click', closeExportCompleteDialog),
    selectElement('#export-complete-confirm').addEventListener('click', closeExportCompleteDialog),
    exportPresetSlotsElement.addEventListener('click', (presetSlotClickEvent: any) => {
      const closestPresetSlotButton = presetSlotClickEvent.target.closest('[data-export-preset-slot]')
      closestPresetSlotButton && selectExportPresetSlot(Number(closestPresetSlotButton.dataset.exportPresetSlot))
    }),
    exportPresetAddButton.addEventListener('click', saveAsNewPreset),
    exportPresetRenameButton.addEventListener('click', openPresetRenameDialog),
    exportPresetDeleteButton.addEventListener('click', openPresetDeleteDialog),
    selectElement('#export-preset-rename-close').addEventListener('click', closePresetRenameDialog),
    selectElement('#export-preset-rename-cancel').addEventListener('click', closePresetRenameDialog),
    exportPresetRenameDialogElement.addEventListener('cancel', (presetRenameDialogCancelEvent: any) => {
      presetRenameDialogCancelEvent.preventDefault(), closePresetRenameDialog()
    }),
    exportPresetRenameFormElement.addEventListener('submit', (presetRenameSubmitEvent: any) => {
      presetRenameSubmitEvent.preventDefault()
      const presetRenameSubmitEventExportPresetSlots = normalizeExportPresetSlots2(appCtx.studioProject?.exportPresets),
        activePresetSlotIndex = normalizeActiveExportPresetSlot2(
          appCtx.studioProject?.activeExportPresetSlot,
          presetRenameSubmitEventExportPresetSlots.length,
        ),
        activePresetSlotIndexActivePresetSlot = presetRenameSubmitEventExportPresetSlots[activePresetSlotIndex]
      if (!activePresetSlotIndexActivePresetSlot) {
        closePresetRenameDialog()
        return
      }
      const ja7 = formatPresetLabel(activePresetSlotIndexActivePresetSlot, activePresetSlotIndex),
        hf3 = makeUniquePresetName(exportPresetRenameInputElement.value, activePresetSlotIndex)
      ;(activePresetSlotIndexActivePresetSlot.name = hf3),
        (appCtx.studioProject.exportPresets = presetRenameSubmitEventExportPresetSlots),
        closePresetRenameDialog(),
        renderExportPresetSlots(),
        markDocumentDirty(),
        hf3 !== ja7 && showToast('已重命名为“' + hf3 + '”。', 'success')
    }),
    /* 导出存档删除已迁 shellConfirm（openPresetDeleteDialog 内确认） */
    exportDialogElement.addEventListener('input', (exportDialogInputEvent: any) => {
      exportDialogInputEvent.target?.closest?.('#export-preset-slots') || syncExportControls()
    }),
    exportDialogElement.addEventListener('change', (exportDialogChangeEvent: any) => {
      exportDialogChangeEvent.target?.closest?.('#export-preset-slots') || syncExportControls()
    }),
    exportDialogElement.addEventListener('click', (exportDialogClickEvent: any) => {
      exportDialogClickEvent.target?.closest?.('[data-camera-view], [data-camera-mode], [data-camera-rotate-top]') &&
        syncExportControls()
    }),
    exportWidthInput.addEventListener('input', () => handleCanvasSizeInput('width')),
    exportHeightInput.addEventListener('input', () => handleCanvasSizeInput('height')),
    exportWidthInput.addEventListener('change', () => handleCanvasSizeInput('width', true)),
    exportHeightInput.addEventListener('change', () => handleCanvasSizeInput('height', true)),
    exportLockRatioInput.addEventListener('change', () => {
      const { width: viewportPixelWidth, height: viewportPixelHeight } = stateViewportAspectGetCanvasSize()
      exportLockRatioInput.checked && (appCtx.exportAspectRatio = viewportPixelWidth / viewportPixelHeight),
        refreshCanvasSizeUi()
    }),
    selectElement('#export-use-fixed').addEventListener('click', openExportDialog),
    exportFloorSelectElement.addEventListener('change', () => selectPreviewFloor(exportFloorSelectElement.value)),
    exportPackageButton.addEventListener('click', generateExportBundle)
}
