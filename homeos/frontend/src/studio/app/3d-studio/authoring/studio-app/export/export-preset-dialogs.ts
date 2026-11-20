/** 导出存档的重命名 / 删除对话框。 */
import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import {
  normalizeActiveExportPresetSlot as normalizeActiveExportPresetSlot2,
  normalizeExportPresetSlots as normalizeExportPresetSlots2,
} from '../../../export/export-presets'
import { shellConfirm } from '@/studio/platform/shell-chrome'
import { elementsById, openDialogPromise } from '../ui/studio-dialog-promise'

export function closePresetRenameDialog(runtime: StudioAppRuntime) {
  runtime.exportPresetRenameDialogElement.open && runtime.exportPresetRenameDialogElement.close()
}

export function openPresetRenameDialog(runtime: StudioAppRuntime) {
  if (runtime.appCtx.isInteractionLocked) return
  runtime.saveExportPreset()
  const renamePresetSlots = normalizeExportPresetSlots2(runtime.appCtx.studioProject?.exportPresets),
    renameActiveSlot = normalizeActiveExportPresetSlot2(
      runtime.appCtx.studioProject?.activeExportPresetSlot,
      renamePresetSlots.length,
    )
  renamePresetSlots[renameActiveSlot] &&
    ((runtime.exportPresetRenameInputElement.value = runtime.formatPresetLabel(
      renamePresetSlots[renameActiveSlot],
      renameActiveSlot,
    )),
    runtime.exportPresetRenameDialogElement.showModal(),
    requestAnimationFrame(() => runtime.exportPresetRenameInputElement.select()))
}

export async function openPresetDeleteDialog(runtime: StudioAppRuntime) {
  if (runtime.appCtx.isInteractionLocked) return
  const deletePresetSlots = normalizeExportPresetSlots2(runtime.appCtx.studioProject?.exportPresets)
  if (deletePresetSlots.length <= 1) return
  const deleteActiveSlot = normalizeActiveExportPresetSlot2(
    runtime.appCtx.studioProject?.activeExportPresetSlot,
    deletePresetSlots.length,
  )
  const presetLabel = runtime.formatPresetLabel(deletePresetSlots[deleteActiveSlot], deleteActiveSlot)
  const confirmed = await confirmPresetDeletion(presetLabel)
  if (confirmed) confirmDeletePreset(runtime)
}

/**
 * 删除存档确认：优先用 0.8.7 的页面内 `#export-preset-delete-dialog`。
 *
 * 用页面内 `<dialog>` 而不是外壳 `shellConfirm` 的原因与楼层删除相同：
 * 0.8.7 的这两个提示是 studio 自己的窄版弹窗（DELETE PRESET 小标 + 红色确认按钮），
 * 换成通用确认框后宽度、位置与按钮层级都会和参考站不一致。
 */
function confirmPresetDeletion(presetLabel: string): Promise<boolean> {
  const documentNode = globalThis.document
  const dialog = documentNode.getElementById('export-preset-delete-dialog') as HTMLDialogElement | null
  const nameElement = documentNode.getElementById('export-preset-delete-name')
  const confirmButton = documentNode.getElementById('export-preset-delete-confirm')
  if (!dialog || !nameElement || !confirmButton) {
    return shellConfirm({
      title: '删除这个导出存档？',
      message: '确定删除“' + presetLabel + '”吗？只会删除保存的导出视角和设置，不会删除楼层或户型。',
      confirmLabel: '删除存档',
      cancelLabel: '取消',
      tone: 'danger',
    })
  }
  return openDialogPromise({
    dialog,
    confirm: confirmButton,
    cancels: elementsById(['export-preset-delete-cancel', 'export-preset-delete-close']),
    prepare: () => {
      nameElement.textContent = presetLabel
    },
  })
}

export function confirmDeletePreset(runtime: StudioAppRuntime) {
  const updatedPresetSlots = normalizeExportPresetSlots2(runtime.appCtx.studioProject?.exportPresets)
  if (updatedPresetSlots.length <= 1) return
  const deletedSlotIndex = normalizeActiveExportPresetSlot2(
      runtime.appCtx.studioProject?.activeExportPresetSlot,
      updatedPresetSlots.length,
    ),
    ja2 = runtime.formatPresetLabel(updatedPresetSlots[deletedSlotIndex], deletedSlotIndex)
  window.clearTimeout(runtime.appCtx.exportPreviewTimeoutId),
    (runtime.appCtx.exportPreviewTimeoutId = null),
    (runtime.appCtx.isExportPresetDirty = false),
    updatedPresetSlots.splice(deletedSlotIndex, 1),
    (runtime.appCtx.studioProject.exportPresets = updatedPresetSlots),
    (runtime.appCtx.studioProject.activeExportPresetSlot = Math.min(deletedSlotIndex, updatedPresetSlots.length - 1))
  const du3 = runtime.applyExportPreset(runtime.appCtx.studioProject.activeExportPresetSlot, {
    silent: true,
  })
  runtime.renderExportPresetSlots(),
    runtime.markDocumentDirty(),
    (runtime.exportStatusElement.textContent = du3 ? '已切换到相邻存档' : '当前存档尚未设置'),
    runtime.showToast('已删除“' + ja2 + '”，楼层和户型未受影响。', 'success')
}
