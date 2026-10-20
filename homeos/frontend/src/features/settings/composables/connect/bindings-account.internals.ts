/**
 * @file bindings-account.internals.ts
 * @module frontend/src/views
 */
/** 绑定：单账户/多账户编辑区 */
import {
  createDefaultEnergySource,
} from '@/shared/energy/constants/energy-fields'
import {
  bootstrapAccountStructForMode,
  hasEntityAccountConfig,
  hasMultiAccountConfig,
  multiAccountEntryLabel,
  resolveAccountEntityEntries,
  resolveAccountNumbers,
  resolveMultiAccountEntries,
  syncMultiAccounts,
} from '@/shared/energy/utils/account.util'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { getEntityLeaf } from '@homeos/shared'
import type { Ref } from 'vue'
import { computed, ref, watch } from 'vue'

// ── useBindingsAccountSection ──
type EnergySource = ReturnType<typeof createDefaultEnergySource>

interface BindingsAccountSectionProps {
  modeOptions: Ref<Array<{ id: string; label: string }>>
  compositeEntityAttrs: Ref<string[]>
}

export function useBindingsAccountSection(
  categoryTab: Ref<string>,
  props: BindingsAccountSectionProps,
) {
  const layoutStore = useLayoutStore()
  const entitiesStore = useEntitiesStore()
  const editingMultiAccountIndex = ref(0)
  const editingMultiAccountKey = ref('0')
  const editingEntityAccountIndex = ref(0)
  const editingEntityAccountKey = ref('0')

  const activeSource = computed((): EnergySource => {
    const stats = layoutStore.layoutConfig.statsSensors
    if (!stats.energySources) stats.energySources = {}
    const cat = categoryTab.value
    if (!stats.energySources[cat]) {
      stats.energySources[cat] = createDefaultEnergySource()
    }
    const src = stats.energySources[cat] as EnergySource
    bootstrapAccountStructForMode(src)
    return src
  })

  watch(editingMultiAccountKey, (key) => {
    const keyIndex = Number.parseInt(String(key), 10)
    if (!Number.isNaN(keyIndex)) editingMultiAccountIndex.value = keyIndex
  })

  watch(editingEntityAccountKey, (key) => {
    const parsedIndex = Number.parseInt(String(key), 10)
    if (!Number.isNaN(parsedIndex)) editingEntityAccountIndex.value = parsedIndex
  })

  watch(
    () => activeSource.value?.mode,
    () => {
      editingMultiAccountIndex.value = 0
      editingMultiAccountKey.value = '0'
      editingEntityAccountIndex.value = 0
      editingEntityAccountKey.value = '0'
    },
  )

  const entityAccountEditTabs = computed(() => {
    const src = activeSource.value
    if (!src || src.mode !== 'entity') return []
    return resolveAccountEntityEntries(src).map((row, index) => ({
      id: String(index),
      label: (row.label?.trim() || getEntityLeaf(row.entityId) || `账户 ${index + 1}`).slice(
        0,
        12,
      ),
      emoji: index === (src.primaryAccountIndex ?? 0) ? '★' : '○',
      accent:
        index === (src.primaryAccountIndex ?? 0)
          ? 'var(--hos-color-accent-strong)'
          : 'var(--hos-fg-2)',
    }))
  })

  const activeEntityAccountRow = computed(() => {
    const src = activeSource.value
    const rows = src?.accountEntities
    if (!Array.isArray(rows) || !rows.length) {
      return { entityId: '', label: '' }
    }
    const editingIndex = Math.min(editingEntityAccountIndex.value, rows.length - 1)
    return rows[editingIndex] || rows[0]
  })

  const compositeEntityAttrsForEdit = computed(() => {
    const src = activeSource.value
    if (!src || src.mode !== 'entity') return props.compositeEntityAttrs.value
    const eid = activeEntityAccountRow.value?.entityId?.trim()
    if (!eid) return []
    const ent = entitiesStore.entities[eid]
    if (!ent?.attributes) return []
    return Object.keys(ent.attributes).filter((k) => !k.startsWith('friendly_'))
  })

  watch(
    () => activeSource.value?.accountEntities?.length,
    (len) => {
      if (len == null || len <= 0) return
      if (editingEntityAccountIndex.value >= len) {
        editingEntityAccountIndex.value = 0
        editingEntityAccountKey.value = '0'
      }
    },
  )

  watch(
    editingMultiAccountIndex,
    (accountIndex) => {
      const row = activeSource.value?.multiAccounts?.[accountIndex]
      if (row && !row.entityMap) row.entityMap = {}
    },
    { immediate: true },
  )

  const multiAccountEditTabs = computed(() => {
    const src = activeSource.value
    if (!src || src.mode !== 'multi') return []
    return resolveMultiAccountEntries(src).map((row, index) => ({
      id: String(index),
      label: multiAccountEntryLabel(row, index).slice(0, 12),
      emoji: index === (src.primaryAccountIndex ?? 0) ? '★' : '○',
      accent:
        index === (src.primaryAccountIndex ?? 0)
          ? 'var(--hos-color-accent-strong)'
          : 'var(--hos-fg-2)',
    }))
  })

  const activeMultiAccountRow = computed(() => {
    const src = activeSource.value
    const rows = src?.multiAccounts
    if (!Array.isArray(rows) || !rows.length) {
      return { entityId: '', label: '', entityMap: {} }
    }
    const multiEditingIndex = Math.min(editingMultiAccountIndex.value, rows.length - 1)
    return rows[multiEditingIndex] || rows[0]
  })

  watch(
    () => activeSource.value?.multiAccounts?.length,
    (len) => {
      if (len == null || len <= 0) return
      if (editingMultiAccountIndex.value >= len) {
        editingMultiAccountIndex.value = 0
        editingMultiAccountKey.value = '0'
      }
    },
  )

  const activeMultiAccountLabel = computed(() =>
    multiAccountEntryLabel(activeMultiAccountRow.value, editingMultiAccountIndex.value),
  )

  function syncMultiFromUi() {
    const row = activeMultiAccountRow.value
    if (row && !row.entityMap) row.entityMap = {}
    syncMultiAccounts(activeSource.value)
  }

  const activeModeLabel = computed(() => {
    const mode = activeSource.value?.mode
    return props.modeOptions.value.find((m) => m.id === mode)?.label || mode || '—'
  })

  const isConfigured = computed(() => {
    const src = activeSource.value
    if (!src) return false
    if (src.mode === 'convention') return resolveAccountNumbers(src).length > 0
    if (src.mode === 'entity') return hasEntityAccountConfig(src)
    if (src.mode === 'multi') return hasMultiAccountConfig(src)
    if (src.entityId?.trim()) return true
    const map = src.entityMap || {}
    return Object.values(map).some((v) => typeof v === 'string' && v.trim())
  })

  return {
    editingMultiAccountIndex,
    editingMultiAccountKey,
    editingEntityAccountIndex,
    editingEntityAccountKey,
    activeSource,
    entityAccountEditTabs,
    activeEntityAccountRow,
    compositeEntityAttrsForEdit,
    multiAccountEditTabs,
    activeMultiAccountRow,
    activeMultiAccountLabel,
    syncMultiFromUi,
    activeModeLabel,
    isConfigured,
  }
}

