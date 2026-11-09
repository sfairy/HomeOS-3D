/**
 * 焦点退出 / 显示层相机锁定相关的 window 监听（从 mountStage 拆出）。
 */

export type FocusExitListeners = {
  onFocusExitWindowBlur: () => void
  onDisplayViewLock: () => void
  onDisplayResetCamera: () => void
  install: () => void
  uninstall: () => void
}

/** 创建并返回可对称 install/uninstall 的具名监听。 */
export function createFocusExitListeners(params: {
  releaseFocusExit: (event: { pointerId?: number }) => void
  getFocusExitPointer: () => { pointerId?: number } | null | undefined
  syncCameraInteraction: () => void
  setCameraView?: (view: string) => void
}): FocusExitListeners {
  const onFocusExitWindowBlur = () => {
    const pointer = params.getFocusExitPointer()
    pointer &&
      params.releaseFocusExit({
        pointerId: pointer.pointerId,
      })
  }
  const onDisplayViewLock = () => {
    params.syncCameraInteraction()
  }
  const onDisplayResetCamera = () => {
    try {
      params.setCameraView?.('free')
    } catch {
      /* ignore */
    }
    params.syncCameraInteraction()
  }
  return {
    onFocusExitWindowBlur,
    onDisplayViewLock,
    onDisplayResetCamera,
    install: () => {
      window.addEventListener('blur', onFocusExitWindowBlur)
      window.addEventListener('homeos:display-view-lock', onDisplayViewLock)
      window.addEventListener('homeos:display-reset-camera', onDisplayResetCamera)
    },
    uninstall: () => {
      window.removeEventListener('blur', onFocusExitWindowBlur)
      window.removeEventListener('homeos:display-view-lock', onDisplayViewLock)
      window.removeEventListener('homeos:display-reset-camera', onDisplayResetCamera)
    },
  }
}
