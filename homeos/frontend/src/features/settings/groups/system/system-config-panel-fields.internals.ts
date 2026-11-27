/**
 * @file system-config-panel-fields.internals.ts
 * @module frontend/src/views
 */
/** 高级参数面板：字段标签 / 提示 / DOM id */
import type { EditableConfigField, EditableConfigSection } from '@/kernel/types/system-config'
import { resolveSystemConfigFieldLabel, systemConfigFieldHint } from '@/kernel/config/system-config'
import { getSectionLabels } from '@/domain/layout/system-config-core.internals'

export function createSystemConfigFieldHelpers(getActiveSectionKey: () => string | undefined) {
  function sectionLabel(key: string) {
    return getSectionLabels()[key] || '运行参数'
  }

  function fieldLabel(field: EditableConfigField, sectionKey?: string) {
    const sk = sectionKey || getActiveSectionKey()
    return resolveSystemConfigFieldLabel(field.key, sk)
  }

  function fieldHint(field: EditableConfigField, sectionKey?: string) {
    const sk = sectionKey || getActiveSectionKey()
    return systemConfigFieldHint(field.key, sk)
  }

  function fieldId(field: EditableConfigField) {
    return `${getActiveSectionKey()}-${field.key}`
  }

  function searchFieldId(item: { section: EditableConfigSection; field: EditableConfigField }) {
    return `search-${item.section.key}-${item.field.key}`
  }

  return { sectionLabel, fieldLabel, fieldHint, fieldId, searchFieldId }
}
