import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { remapOpeningsToWalls } from '../../../plan/studio-wall-openings'
import {
  clampWindowT as clampWindowT2,
  mergeCollinearWallSegments as mergeCollinearWallSegments2,
  remapWallAttachment as remapWallAttachment2,
} from '../../../plan/geometry'

export function markWallsChanged(runtime: StudioAppRuntime) {
  const tf3 = remapOpeningsToWalls(
    runtime.appCtx.studioState.walls,
    runtime.appCtx.studioState.windows,
    runtime.appCtx.studioState.doors,
    runtime.getPixelsPerMeter() || 1,
    runtime.appCtx.studioState.railings,
  )
  ;(runtime.appCtx.studioState.walls = tf3.walls),
    (runtime.appCtx.studioState.windows = tf3.windows),
    (runtime.appCtx.studioState.doors = tf3.doors),
    (runtime.appCtx.studioState.railings = tf3.railings)
}

export function rebuildWallIndex(runtime: StudioAppRuntime) {
  const wallByIdBeforeMerge = new Map(runtime.appCtx.studioState.walls.map((wallEntry) => [wallEntry.id, wallEntry])),
    mergedWallResult = mergeCollinearWallSegments2(runtime.appCtx.studioState.walls, 0.000001)
  if (mergedWallResult.walls.length === runtime.appCtx.studioState.walls.length) return 0
  const wallByIdAfterMerge = new Map(
      mergedWallResult.walls.map((mergedWallEntry: any) => [mergedWallEntry.id, mergedWallEntry]),
    ),
    remapWallAttachment = (attachmentRecord: any) => {
      const mergedWallId = mergedWallResult.wallIdMap.get(attachmentRecord.wallId),
        sourceWallRecord = wallByIdBeforeMerge.get(attachmentRecord.wallId),
        targetWallRecord = wallByIdAfterMerge.get(mergedWallId)
      if (!mergedWallId || !sourceWallRecord || !targetWallRecord) return attachmentRecord
      const remappedAttachment = remapWallAttachment2(attachmentRecord, sourceWallRecord, targetWallRecord)
      return (
        (remappedAttachment.t = clampWindowT2(targetWallRecord, remappedAttachment, runtime.getPixelsPerMeter() || 1)),
        remappedAttachment
      )
    },
    removedWallCount = runtime.appCtx.studioState.walls.length - mergedWallResult.walls.length
  return (
    (runtime.appCtx.studioState.walls = mergedWallResult.walls),
    (runtime.appCtx.studioState.windows = runtime.appCtx.studioState.windows.map(remapWallAttachment)),
    (runtime.appCtx.studioState.doors = runtime.appCtx.studioState.doors.map(remapWallAttachment)),
    (runtime.appCtx.studioState.railings = runtime.appCtx.studioState.railings.map(remapWallAttachment)),
    removedWallCount
  )
}

export function getPixelsPerMeter(runtime: StudioAppRuntime) {
  return runtime.appCtx.studioState.calibration?.pixelsPerMeter || 0
}

export function historyUndoDepth(runtime: StudioAppRuntime): number {
  return runtime.studioHistoryStore?.undoDepth ?? 0
}

export function historyRedoDepth(runtime: StudioAppRuntime): number {
  return runtime.studioHistoryStore?.redoDepth ?? 0
}

export function isStudioDraftReadonly(runtime: StudioAppRuntime): boolean {
  return runtime.studioDraftReadonly
}

/** 保存草稿副本：409 第三出口、只读横幅入口共用（纯本地下载，不动服务器状态）。 */
export function downloadStudioLocalCopy(runtime: StudioAppRuntime, localSceneOverride?: any): boolean {
  try {
    let localScene = localSceneOverride
    if (localScene === undefined) {
      try {
        localScene = runtime.getLocalSaveRevision()
      } catch {
        localScene = runtime.appCtx.studioProject || null
      }
    }
    const exportedCopy = {
      revision: runtime.studioDocumentStore.getLoadedRevision(),
      exportedAt: new Date().toISOString(),
      scene: localScene,
    }
    const localCopyBlob = new Blob([JSON.stringify(exportedCopy, null, 2)], {
      type: 'application/json',
    })
    const localCopyUrl = URL.createObjectURL(localCopyBlob)
    const downloadAnchor = document.createElement('a')
    downloadAnchor.href = localCopyUrl
    downloadAnchor.download = 'studio-draft-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'
    downloadAnchor.rel = 'noopener'
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(localCopyUrl), 1000)
    runtime.showToast('本地副本已导出。', 'success')
    return true
  } catch (exportFailure: any) {
    runtime.showToast(exportFailure?.message || '导出本地副本失败。', 'error')
    return false
  }
}

export function renderStudioReadonlyBanner(runtime: StudioAppRuntime, bannerMessage: string): void {
  if (runtime.isEmbeddedStage) return
  if (!runtime.studioReadonlyBannerElement) {
    const banner = document.createElement('div')
    banner.id = 'studio-readonly-banner'
    banner.setAttribute('role', 'status')
    banner.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:80;display:flex;gap:12px;align-items:center;' +
      'justify-content:center;padding:8px 16px;background:#7a2e2e;color:#fff;font-size:13px;'
    const bannerLabel = document.createElement('span')
    bannerLabel.className = 'studio-readonly-message'
    const retryLoadButton = document.createElement('button')
    retryLoadButton.type = 'button'
    retryLoadButton.textContent = '重试载入'
    retryLoadButton.addEventListener('click', () => {
      void runtime.retryStudioDraftLoad()
    })
    const exportCopyButton = document.createElement('button')
    exportCopyButton.type = 'button'
    exportCopyButton.textContent = '导出本地副本'
    exportCopyButton.addEventListener('click', () => {
      runtime.downloadStudioLocalCopy()
    })
    banner.append(bannerLabel, retryLoadButton, exportCopyButton)
    document.body.appendChild(banner)
    runtime.studioReadonlyBannerElement = banner
  }
  const bannerMessageElement = runtime.studioReadonlyBannerElement.querySelector('.studio-readonly-message')
  bannerMessageElement && (bannerMessageElement.textContent = bannerMessage)
  runtime.studioReadonlyBannerElement.hidden = false
}
