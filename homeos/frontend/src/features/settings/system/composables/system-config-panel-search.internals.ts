/**
 * @file system-config-panel-search.internals.ts
 * @module frontend/src/views
 */
/** 高级参数面板：搜索与字段过滤派生 */
import { filterPricingSectionFields } from '@/composables/config/system-config-edit.util'
import { systemConfigFieldMatchesQuery } from '@/shared/utils/config/system-config/field.util'
import type { EditableConfigSection } from '@/shared/types/system-config-editor'
import { computed, type Ref } from 'vue'

export function useSystemConfigPanelSearch(opts: {
  globalSearch: Ref<string>
  sectionFilter: Ref<string>
  visibleSectionList: Ref<EditableConfigSection[]>
  currentSection: Ref<EditableConfigSection | null>
}) {
  const { globalSearch, sectionFilter, visibleSectionList, currentSection } = opts
  const isSearchMode = computed(() => globalSearch.value.trim().length > 0)

  const searchResults = computed(() => {
    const q = globalSearch.value.trim().toLowerCase()
    if (!q) return []
    const results = []
    for (const section of visibleSectionList.value) {
      for (const field of section.fields) {
        if (systemConfigFieldMatchesQuery(field, q, section.key)) {
          results.push({ section, field })
        }
      }
    }
    return results
  })

  const searchMatchMap = computed(() => {
    const map: Record<string, number> = {}
    for (const item of searchResults.value) {
      const sk = item.section.key
      map[sk] = (map[sk] || 0) + 1
    }
    return map
  })

  const displayFields = computed(() => currentSection.value?.fields || [])

  const filteredSectionFields = computed(() => {
    const q = sectionFilter.value.trim().toLowerCase()
    const sectionKey = currentSection.value?.key
    let fields = filterPricingSectionFields(displayFields.value, sectionKey)
    if (!q || !sectionKey) return fields
    return fields.filter((f) => systemConfigFieldMatchesQuery(f, q, sectionKey))
  })

  return {
    isSearchMode,
    searchResults,
    searchMatchMap,
    displayFields,
    filteredSectionFields,
  }
}
