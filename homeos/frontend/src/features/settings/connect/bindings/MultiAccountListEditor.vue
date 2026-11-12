<!--
  多实体账户列表编辑器。每行绑定一个锚点 sensor 实体与备注，支持设主账户、增删行，
  并为每行维护 entityMap 字段映射，同步到 source 的 multiAccounts。

  视图在共用的 `AccountListRows.vue`；本文件只决定「用哪份数据 / 用哪个同步函数」，
  外加 multiAccounts 特有的 entityMap 兜底。
-->
<template>
  <AccountListRows
    :account-label="accountLabel"
    :entries="entries"
    :primary-index="primaryIndex"
    :hint="'每个账户指定锚点实体（通常为 balance）；下方为当前选中账户的字段映射；★ 为主账户。'"
    entity-placeholder="sensor.gas_1234_balance"
    :set-primary="setPrimary"
    :on-row-change="onRowChange"
    :add-row="addRow"
    :remove-row="removeRow"
  />
</template>

<script setup>
import { computed } from 'vue'
import AccountListRows from './AccountListRows.vue'
import { syncMultiAccounts } from '@/shared/energy/utils/account.util'
import { useBindingAccountListEditor } from './useBindingAccountListEditor'

const props = defineProps({
  source: { type: Object, required: true },
  accountLabel: { type: String, default: '多实体账户' },
})

const source = props.source

function ensureRowEntityMap(row) {
  if (!row.entityMap) row.entityMap = {}
}

function ensureEntries() {
  if (!Array.isArray(source.multiAccounts)) {
    source.multiAccounts = [{ entityId: '', label: '', entityMap: {} }]
  }
  return source.multiAccounts
}

const entries = computed(() => source.multiAccounts || [])

const { primaryIndex, onRowChange, setPrimary, addRow, removeRow } = useBindingAccountListEditor({
  source,
  entries,
  ensureEntries,
  sync: syncMultiAccounts,
  createEmptyRow: () => ({ entityId: '', label: '', entityMap: {} }),
  onBeforeSync: () => {
    for (const row of source.multiAccounts || []) ensureRowEntityMap(row)
  },
})
</script>
