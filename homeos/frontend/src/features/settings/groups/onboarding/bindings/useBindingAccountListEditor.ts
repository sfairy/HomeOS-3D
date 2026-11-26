import { computed, type ComputedRef } from 'vue'

type AccountSource = Record<string, unknown> & {
  primaryAccountIndex?: number
}

export function useBindingAccountListEditor(options: {
  source: AccountSource
  entries: ComputedRef<unknown[]>
  ensureEntries: () => unknown[]
  sync: (source: AccountSource) => void
  createEmptyRow: () => Record<string, unknown>
  onBeforeSync?: () => void
}) {
  const { source, entries, ensureEntries, sync, createEmptyRow, onBeforeSync } = options

  const primaryIndex = computed({
    get: () => source.primaryAccountIndex ?? 0,
    set: (v: number) => {
      source.primaryAccountIndex = v
      sync(source)
    },
  })

  function onRowChange() {
    onBeforeSync?.()
    sync(source)
  }

  function setPrimary(idx: number) {
    primaryIndex.value = idx
  }

  function addRow() {
    ensureEntries().push(createEmptyRow())
  }

  function removeRow(idx: number) {
    const rows = ensureEntries()
    if (rows.length <= 1) return
    rows.splice(idx, 1)
    if (primaryIndex.value >= rows.length) {
      source.primaryAccountIndex = Math.max(0, rows.length - 1)
    }
    sync(source)
  }

  return {
    entries,
    primaryIndex,
    onRowChange,
    setPrimary,
    addRow,
    removeRow,
  }
}
