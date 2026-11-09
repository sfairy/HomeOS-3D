import type { StudioAppRuntime } from '../runtime/studio-app-runtime'

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
