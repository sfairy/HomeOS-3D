/* 控件删除：确认后从文档移除，并把被删控件剔出当前选择。 */
import type { ComponentEditingDeps } from './component-editing'
import { findComponent as findComponent2 } from '../../component-tree'
import { componentLabel as componentLabel2, removeComponent } from '../../editor-component-collections'
import { confirmAction } from '../../../shared/ui-confirm'

export async function deleteComponentIds(deps: ComponentEditingDeps, deleteComponentId: unknown) {
  const nl5 = deps.removalPageEntry(deleteComponentId)
  if (!nl5.length) {
    deps.handleOperationError(new Error('没有找到要删除的控件。'))
    return
  }
  const targetLabel =
    nl5.length > 1
      ? '已选择的 ' + nl5.length + ' 个控件'
      : componentLabel2(
          findComponent2(deps.editorCtx.activeProject?.document, nl5[0])?.component || {
            type: '控件',
          },
        )
  const confirmed = await confirmAction({
    title: '删除控件',
    message: '确认删除“' + targetLabel + '”？\n删除后可在保存前通过顶部撤销按钮恢复。',
    confirmLabel: '确认删除',
    cancelLabel: '取消',
    tone: 'danger',
  })
  if (!confirmed) return
  const deleteIdSet = new Set(nl5)
  deps.editorCtx.selectedComponentIdsSet = new Set(
    [...deps.editorCtx.selectedComponentIdsSet].filter((deletedComponentId) => !deleteIdSet.has(deletedComponentId)),
  )
  if (deleteIdSet.has(deps.editorCtx.selectedComponentId))
    deps.editorCtx.selectedComponentId = deps.editorCtx.selectedComponentIdsSet.values().next().value || null
  if (deleteIdSet.has(deps.editorCtx.selectionAnchorComponentId))
    deps.editorCtx.selectionAnchorComponentId = deps.editorCtx.selectedComponentId
  deps.mutateDocument((documentDraft: unknown) => {
    for (const componentId of nl5) removeComponent(documentDraft, componentId)
  })
}
