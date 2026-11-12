<!--
  实体账户列表编辑器。每行绑定一个综合 sensor 实体与备注，支持设主账户、增删行，
  并同步到 source 的 accountEntities。

  视图在共用的 `AccountListRows.vue`；本文件只决定「用哪份数据 / 用哪个同步函数」。
-->
<template>
  <AccountListRows
    :account-label="accountLabel"
    :entries="entries"
    :primary-index="primaryIndex"
    :hint="'每个账户绑定一个综合实体；字段映射对所有账户共用；★ 为主账户。'"
    :set-primary="setPrimary"
    :on-row-change="onRowChange"
    :add-row="addRow"
    :remove-row="removeRow"
  />
</template>

<script setup>
import { computed } from 'vue'
import AccountListRows from './AccountListRows.vue'
import { syncEntityAccounts } from '@/shared/energy/utils/account.util'
import { useBindingAccountListEditor } from './useBindingAccountListEditor'

const props = defineProps({
  source: { type: Object, required: true },
  accountLabel: { type: String, default: '综合实体账户' },
})

const source = props.source

function ensureEntries() {
  if (!Array.isArray(source.accountEntities)) {
    source.accountEntities = [{ entityId: '', label: '' }]
  }
  return source.accountEntities
}

const entries = computed(() => source.accountEntities || [])

const { primaryIndex, onRowChange, setPrimary, addRow, removeRow } = useBindingAccountListEditor({
  source,
  entries,
  ensureEntries,
  sync: syncEntityAccounts,
  createEmptyRow: () => ({ entityId: '', label: '' }),
})
</script>
