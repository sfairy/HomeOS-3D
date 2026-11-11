/**
 * 情景弹窗编辑器接线（0.8.4）：把编辑器宿主的 `pickEntity` / `pickIcon`
 * 接到主编辑器已有的分页选择器上，避免再实现一套选择器。
 *
 * 依赖袋由 `boot.ts` 的 `copyBackupPickersDeps()` 提供（键名与
 * `copy-backup-pickers.ts` 的 `CopyBackupPickersDeps` 保持一致）。
 */
import { EDITOR_PICKER_PAGE_SIZES, editorEntityPickerPage } from '@app/shared/picker/editor-picker-pagination'

const ENTITY_PICKER_HINT = '推荐去 HA 复制实体 ID，粘贴搜索。可精准选择。'

export function openScenePopupEntityPicker(
  deps: any,
  triggerButton: HTMLElement,
  currentEntityId: string,
  onPick: (entityId: string) => void,
) {
  const selectedEntity = deps.runPortion?.('scene-mode') ? undefined : undefined
  void selectedEntity
  triggerButton.setAttribute('disabled', 'true')
  try {
    deps.runCopyBackup({
      kind: 'entity',
      title: '选择实体',
      subtitle: '情景模式 · ' + (deps.entityPickerHintText || ENTITY_PICKER_HINT),
      searchPlaceholder: '搜索实体名称或 ID',
      triggerButton,
      pageSize: EDITOR_PICKER_PAGE_SIZES.entity,
      selectedText: currentEntityId || '不使用实体',
      emptyText: '没有匹配的实体',
      itemClass: 'entity-list',
      getPage({ query: entityQuery, page: entityPage }: any) {
        return editorEntityPickerPage(deps.editorEntityMatches('scene-mode', entityQuery), entityPage, null)
      },
      renderLeadingItems: () => [],
      renderSelectedContent: () => [
        deps.createEditorPickerCurrentEntity(
          deps.editorCtx.entities.find((candidateEntity: any) => candidateEntity.entityId === currentEntityId),
        ),
      ],
      renderSelectedActions: () => [deps.createEditorEntityPickerOption('不使用实体', !currentEntityId)],
      renderItem: (candidateEntity: any) => deps.createIconPickerOption(candidateEntity, currentEntityId),
      onSelect: (pickedEntityId: any) => onPick?.(pickedEntityId),
    })
  } finally {
    triggerButton.removeAttribute('disabled')
  }
}

export function openScenePopupIconPicker(
  deps: any,
  triggerButton: HTMLElement,
  currentIcon: string,
  onPick: (icon: string) => void,
) {
  const clearLabel = '不使用图标'
  triggerButton.setAttribute('disabled', 'true')
  try {
    deps.runCopyBackup({
      kind: 'icon',
      title: '选择情景图标',
      searchPlaceholder: '搜索图标名称',
      triggerButton,
      pageSize: EDITOR_PICKER_PAGE_SIZES.icon,
      selectedText: '',
      emptyText: '没有匹配的图标',
      itemClass: 'icon-grid',
      async getPage({ query: iconQuery, page: iconPage, pageSize }: any) {
        const iconOffset = (iconPage - 1) * pageSize
        const iconPayload = await deps.requestJson(
          '/icons?query=' + encodeURIComponent(iconQuery) + '&limit=' + pageSize + '&offset=' + iconOffset,
        )
        return { items: iconPayload.items || [], total: Number(iconPayload.total) || 0 }
      },
      renderLeadingItems: () => [],
      renderSelectedActions: () => [
        deps.createIconPickerClearOption(currentIcon, clearLabel),
        deps.createEditorEntityPickerOption(clearLabel, !currentIcon),
      ],
      renderItem: (iconEntry: any) => {
        const iconOptionElement = deps.createIconPickerClearOptionState(iconEntry, currentIcon, 'editorPickerValue')
        iconOptionElement.dataset.editorPickerValue = iconEntry.name
        return iconOptionElement
      },
      onSelect: (pickedIcon: any) => onPick?.(pickedIcon),
    })
  } finally {
    triggerButton.removeAttribute('disabled')
  }
}
