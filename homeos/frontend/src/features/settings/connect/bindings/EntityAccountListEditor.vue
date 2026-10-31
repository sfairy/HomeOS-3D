<!--
  实体账户列表编辑器。每行绑定一个综合 sensor 实体与备注，支持设主账户、增删行，
  并同步到 source 的 accountEntities。
-->
<template>
  <div class="account-list-editor">
    <label class="settings-form-label mb-1.5">{{ accountLabel }}</label>

    <div class="account-list-editor__rows">
      <div
        v-for="(row, idx) in entries"
        :key="idx"
        class="account-list-editor__row account-list-editor__row--entity"
      >
        <button
          type="button"
          :class="[
            'account-list-editor__primary',
            primaryIndex === idx && 'account-list-editor__primary--active',
          ]"
          :title="primaryIndex === idx ? '当前为主账户' : '设为主账户'"
          @click="setPrimary(idx)"
        >
          {{ primaryIndex === idx ? '★' : '☆' }}
        </button>
        <EntityInput
          v-model="row.entityId"
          domain-filter="sensor"
          wrapper-class="account-list-editor__entity"
          @update:model-value="onRowChange"
        />
        <input
          v-model="row.label"
          type="text"
          class="settings-field account-list-editor__label"
          :placeholder="'备注（可选）'"
          @input="onRowChange"
        />
        <button
          type="button"
          class="account-list-editor__remove"
          :disabled="entries.length <= 1"
          @click="removeRow(idx)"
        >
          ✕
        </button>
      </div>
    </div>

    <div class="account-list-editor__foot">
      <button type="button" class="settings-btn-ghost text-xs" @click="addRow">
        {{ '+ 添加账户' }}
      </button>
      <p class="bind-energy-hint account-list-editor__hint">
        {{ '每个账户绑定一个综合实体；字段映射对所有账户共用；★ 为主账户。' }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import EntityInput from '@/components/common/entity-input/EntityInput.vue'
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
<style src="./styles/account-list-editor.css"></style>
