/** 情景弹窗接缝：`scene-mode` 控件开启 `popupEnabled` 时，点击改为弹窗。 */
import type { PanelRenderer } from '../panel-renderer'
import { createSceneActionRequests } from '../scene-mode'
import { createScenePopupView } from '../scene-popup'
import { SCENE_POPUP_LAYOUT, scenePopupEnabled, scenePopupItems, scenePopupTitle } from '../scene-popup-model'
import { weatherSceneStyle } from '../weather-forecast'

export function showScenePopup(
  this: PanelRenderer,
  scenePopupComponent: any,
  { preview: isScenePreview = this.options.editable === true } = {},
): HTMLDialogElement | null {
  if (!scenePopupEnabled(scenePopupComponent)) return null
  this.closeRuntimeDialog()
  this.sceneActionRequests ||= createSceneActionRequests()
  const scenePopupDialog = document.createElement('dialog')
  ;(scenePopupDialog.className = 'hb-scene-popup-dialog'),
    (scenePopupDialog.dataset.componentId = String(scenePopupComponent.id || '')),
    scenePopupDialog.setAttribute('aria-label', scenePopupTitle(scenePopupComponent))
  const scenePopupView = createScenePopupView({
      component: scenePopupComponent,
      sceneStyle: weatherSceneStyle(this.document, this.page),
      editable: isScenePreview,
      onClose: () => scenePopupDialog.close(),
      context: {
        states: this.states,
        callEntityService: (...serviceCallArgs: [any, any, any, any?]) => this.callEntityService(...serviceCallArgs),
        sceneActionRequests: this.sceneActionRequests,
        sceneActionScope: this.document?.projectId,
        onError: (sceneError: any) => this.options.onError?.(sceneError),
      },
    }),
    scenePopupOverlay = document.createElement('div')
  ;(scenePopupOverlay.className = 'hb-renderer-runtime-dialog-layer hb-runtime-no-select'),
    (scenePopupOverlay.tabIndex = -1),
    scenePopupDialog.append(scenePopupView.card),
    scenePopupOverlay.append(scenePopupDialog),
    this.container.append(scenePopupOverlay),
    (this.detailsDialog = scenePopupDialog)
  // 每条情景的实体都要登记状态回调，否则弹窗里的「已开启 / 已关闭 / 不可用」永远停在打开时的快照。
  const scenePopupStateHandlers = new Map<string, ((nextState: any) => void)[]>()
  for (const popupItem of scenePopupItems(scenePopupComponent)) {
    const popupEntityId = popupItem.bindings?.entity?.entityId
    popupEntityId &&
      !scenePopupStateHandlers.has(popupEntityId) &&
      scenePopupStateHandlers.set(popupEntityId, [
        (nextState: any) => scenePopupView.syncState(popupEntityId, nextState),
      ])
  }
  this.detailsStateSync = {
    dialog: scenePopupDialog,
    handlers: scenePopupStateHandlers,
    reconcileSnapshot: () => {
      for (const snapshotEntityId of scenePopupStateHandlers.keys())
        scenePopupView.syncState(snapshotEntityId, this.states.get(snapshotEntityId) || { state: 'unavailable' })
    },
  }
  this.registerRuntimeDialogScale(
    scenePopupOverlay,
    scenePopupDialog,
    SCENE_POPUP_LAYOUT.width,
    SCENE_POPUP_LAYOUT.height,
  )
  this.bindRuntimeDialogOutsideDismiss(scenePopupOverlay, scenePopupDialog, scenePopupView.card)
  const handleScenePopupKeydown = (scenePopupKeyEvent: KeyboardEvent) => {
    scenePopupKeyEvent.key === 'Escape' &&
      scenePopupDialog.open &&
      this.detailsDialog === scenePopupDialog &&
      (scenePopupKeyEvent.preventDefault(), scenePopupKeyEvent.stopPropagation(), scenePopupDialog.close())
  }
  document.addEventListener('keydown', handleScenePopupKeydown, true),
    scenePopupDialog.addEventListener(
      'close',
      () => {
        document.removeEventListener('keydown', handleScenePopupKeydown, true),
          scenePopupView.dispose(),
          this.clearRuntimeDialogScale(scenePopupDialog),
          this.detailsDialog === scenePopupDialog && (this.detailsDialog = null),
          this.detailsStateSync?.dialog === scenePopupDialog && (this.detailsStateSync = null),
          scenePopupOverlay.remove()
      },
      { once: true },
    ),
    scenePopupDialog.show(),
    scenePopupDialog.focus({ preventScroll: true })
  return scenePopupDialog
}
