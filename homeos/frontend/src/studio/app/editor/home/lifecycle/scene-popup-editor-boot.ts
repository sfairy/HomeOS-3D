/**
 * 情景弹窗编辑器接线（0.8.4）：弹窗生命周期、控件模式切换与预览弹窗收发。
 *
 * 弹窗实例与预览 dialog 仍住在宿主 `boot.ts`：其它切片通过 deps 的
 * `getScenePopupEditor()` 读它，状态必须留在宿主里才能保持一致。本模块只搬
 * 「怎么开、怎么关、和画布渲染器怎么配合」这一层编排，依赖袋由
 * `boot.ts` 的 `scenePopupEditorDeps()` 提供（键名与宿主侧一一对应）。
 */
import { createScenePopupEditor } from '../../scene-popup-editor'
import { scenePopupEnabled } from '../../../renderer/scene-popup-model'
import { openScenePopupEntityPicker, openScenePopupIconPicker } from '../functions/scene-popup-editor-wiring'

export function bindScenePopupEditorBoot(deps: any): void {
  const closeScenePopupEditor = () => {
    deps.getScenePopupEditor()?.close()
  }
  const openScenePopupEditor = () => {
    const editorCtx = deps.getEditorCtx(),
      scenePopupOwnerId = editorCtx.selectedComponentId,
      scenePopupProjectId = editorCtx.activeProject?.projectId,
      scenePopupPagePath = deps.getPageSelectElement().value,
      // 0.8.4 的宿主就是 `document.querySelector("main")`：编辑器绝对定位铺满整个编辑器区域，
      // 左右侧栏一起被盖住。挂在工作区里会只剩画布宽度，三栏布局直接被挤变形。
      scenePopupEditorHostElement = deps.getHostElement()
    const resolveScenePopupOwner = () =>
      editorCtx.activeProject?.projectId === scenePopupProjectId &&
      editorCtx.editorMode === 'edit' &&
      deps.getPageSelectElement().value === scenePopupPagePath &&
      editorCtx.selectedComponentId === scenePopupOwnerId
        ? deps.findComponent(editorCtx.activeProject?.document, scenePopupOwnerId)?.component || null
        : null
    const scenePopupOwner = resolveScenePopupOwner()
    if (!scenePopupOwner || !scenePopupEnabled(scenePopupOwner) || !scenePopupEditorHostElement) return
    closeScenePopupEditor()
    deps.setScenePopupEditor(
      createScenePopupEditor({
        host: scenePopupEditorHostElement,
        getOwner: resolveScenePopupOwner,
        // 与 0.8.4 一致：编辑态取编辑渲染器的实时状态（仪表盘预览渲染器此时通常还没创建）。
        states: () => editorCtx.editorRenderer?.states || editorCtx.dashboardPreviewRenderer?.states || new Map(),
        sceneStyle: () => deps.weatherSceneStyle(editorCtx.activeProject?.document, deps.currentPage()),
        entityName: (entityId: any) => {
          if (!entityId) return ''
          const matchedEntity = editorCtx.entities.find((candidateEntity: any) => candidateEntity.entityId === entityId)
          return matchedEntity ? deps.formatEntityLabel(matchedEntity) : entityId
        },
        status: () => ({
          dirty: !!editorCtx.hasUnsavedChanges,
          canSave: !!editorCtx.hasUnsavedChanges,
          canUndo: deps.historyState().undo.length > 0,
          canRedo: deps.historyState().redo.length > 0,
        }),
        change: (scenePopupMutator: (owner: any) => void) =>
          Promise.resolve(
            deps.mutateDocument(
              (workingDocument: any) => {
                const scenePopupTarget = deps.findComponent(workingDocument, scenePopupOwnerId)?.component
                scenePopupTarget && scenePopupMutator(scenePopupTarget)
              },
              undefined,
              { throwOnError: true },
            ),
          ) as Promise<any>,
        undo: () => deps.entityLoadError('undo'),
        redo: () => deps.entityLoadError('redo'),
        save: () => deps.saveDraft(),
        preview: () => {
          const previewOwner = resolveScenePopupOwner()
          if (!previewOwner) return
          // 与 0.8.4 一致：预览弹窗必须挂在**编辑画布**的渲染器上（上游 `_i()` = ensureEditorRenderer）。
          // 退回 `dashboardPreviewRenderer` 会把弹窗塞进隐藏的「仪表盘」面板，点了什么也看不到。
          const previewRenderer = deps.ensureEditorRenderer()
          if (!previewRenderer) return
          const previewDialog = previewRenderer.showScenePopup(previewOwner, { preview: true })
          if (!previewDialog) return
          deps.setPreviewDialog(previewDialog)
          deps.getScenePopupEditor()?.setPreviewing(true)
          previewDialog.addEventListener(
            'close',
            () => {
              deps.getPreviewDialog() === previewDialog && deps.setPreviewDialog(null)
              deps.getScenePopupEditor()?.setPreviewing(false)
            },
            { once: true },
          )
        },
        pickEntity: (triggerButton: HTMLElement, popupItem: any, onPick: any) =>
          openScenePopupEntityPicker(
            deps.copyBackupPickers(),
            triggerButton,
            popupItem.bindings?.entity?.entityId || '',
            onPick,
          ),
        pickIcon: (triggerButton: HTMLElement, popupItem: any, onPick: any) =>
          openScenePopupIconPicker(deps.copyBackupPickers(), triggerButton, popupItem.properties.icon || '', onPick),
        onError: deps.handleOperationError,
        onClose: () => {
          deps.setScenePopupEditor(null)
          // 预览弹窗挂在画布渲染器上，编辑器关掉时必须一起收走，否则会留下一个没人管的弹窗。
          deps.getPreviewDialog()?.open && deps.getPreviewDialog().close()
          deps.setPreviewDialog(null)
          document.getElementById('scene-popup-contents')?.focus({ preventScroll: true })
        },
      }),
    )
  }
  document.getElementById('scene-popup-mode')?.addEventListener('click', (scenePopupModeEvent: any) => {
    const popupModeButton = scenePopupModeEvent.target.closest('[data-scene-popup-enabled]')
    if (!popupModeButton) return
    const popupModeOwnerId = deps.getEditorCtx().selectedComponentId
    deps.mutateDocument((popupModeDocument: any) => {
      const popupModeComponent = deps.findComponent(popupModeDocument, popupModeOwnerId)?.component
      popupModeComponent?.type === 'scene-mode' &&
        (popupModeComponent.properties.popupEnabled = popupModeButton.dataset.scenePopupEnabled === 'true')
    })
  })
  document.getElementById('scene-popup-contents')?.addEventListener('click', () => openScenePopupEditor())
}
