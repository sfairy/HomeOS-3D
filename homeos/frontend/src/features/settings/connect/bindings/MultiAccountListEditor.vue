<!--
组件：MultiAccountListEditor.vue
所属模块：frontend / src / views / settings / connect / bindings
职责：多实体账户列表编辑器。每行绑定一个锚点 sensor 实体与备注，支持设主账户、增删行，
      并为每行维护 entityMap 字段映射，同步到 source 的 multiAccounts。
关键依赖：
  - EntityInput：实体选择
  - account.util：syncMultiAccounts 同步
数据来源：父级透传的 source（账户配置对象，直接读写其 multiAccounts）
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
          :placeholder="'sensor.gas_1234_balance'"
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
        {{ '每个账户指定锚点实体（通常为 balance）；下方为当前选中账户的字段映射；★ 为主账户。' }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import EntityInput from '@/components/common/EntityInput.vue'
import { syncMultiAccounts } from '@/utils/energy/account.util'
import { useBindingAccountListEditor } from './useBindingAccountListEditor'

// 入参：账户配置对象（直接读写）、账户标签
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
<style src="./styles/account-list-editor.css"></style>
