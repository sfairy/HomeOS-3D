import type { StudioAppRuntime } from '../runtime/studio-app-runtime'

export function closeOpenPopovers(runtime: StudioAppRuntime) {
  ;(runtime.appCtx.pendingFloorMenuId = ''), runtime.floorRenameDialogElement.close()
}

export function applyLightGroupRename(runtime: StudioAppRuntime) {
  ;(runtime.appCtx.renamingLightGroupId = ''), runtime.lightGroupRenameDialogElement.close()
}

export function createLightGroup(runtime: StudioAppRuntime) {
  ;(runtime.appCtx.pendingLightPropertyApply = null), runtime.lightPropertyApplyDialogElement.close()
}
