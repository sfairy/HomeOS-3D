<!--
  账户列表的**行区共用壳**：一行 = 主账户星标 + 实体选择 + 备注 + 删除，底部「添加账户」。

  此前 `EntityAccountListEditor.vue` 与 `MultiAccountListEditor.vue` 各抄了一份逐字相同的
  行区模板，差异只在三处：实体输入框 placeholder、底部提示文案、默认标题。模板重复的代价
  是「改一处星标语义要记得改两份」——两边都允许设主账户，漏一边就是两个入口行为不一样。

  注意与 `AccountListEditor.vue` 的区别：那个是**能源账户**编辑器（户号粘贴拆行、后 4 位
  冲突检测、号码输入框），行内是纯文本输入；本文件是**实体账户**行区（`EntityInput` 选实体）。

  本文件只负责视图；条目增删 / 主账户指针 / 同步仍在 `useBindingAccountListEditor`。
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
          :placeholder="entityPlaceholder"
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
        {{ hint }}
      </p>
    </div>
  </div>
</template>

<script setup>
import EntityInput from '@/components/common/entity-input/EntityInput.vue'

defineProps({
  /** 标题文案（各来源对「账户」的叫法不同）。 */
  accountLabel: { type: String, required: true },
  /** 每行条目（来自 useBindingAccountListEditor 的 entries）。 */
  entries: { type: Array, required: true },
  /** 当前主账户下标。 */
  primaryIndex: { type: Number, required: true },
  /** 底部提示文案。 */
  hint: { type: String, required: true },
  /** 实体输入框 placeholder（空串 = 用 EntityInput 自己的默认文案）。 */
  entityPlaceholder: { type: String, default: '' },
  /** 设主账户。 */
  setPrimary: { type: Function, required: true },
  /** 行内任何字段变化。 */
  onRowChange: { type: Function, required: true },
  addRow: { type: Function, required: true },
  removeRow: { type: Function, required: true },
})
</script>
<style src="./styles/account-list-editor.css"></style>
