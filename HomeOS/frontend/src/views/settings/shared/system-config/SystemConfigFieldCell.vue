<!--
组件：SystemConfigFieldCell.vue
所属模块：frontend / src / views / settings / shared / system-config
职责：高级参数字段单元格。按字段类型渲染对应输入控件（文本/数字/开关/选择/实体/多选/嵌套对象），
      支持掩码切换、开发 key 显示、修改标记与紧凑模式。
Props：
  - field：字段定义对象（含 value / type）
  - inputId / label / hint：输入 id、标签、提示
  - showDevKey / sectionTag / allowObject / compact / modified：显示与行为开关
Emits：
  - update:value：值变更
  - update:isMasked：掩码切换
关键依赖：
  - HosSelect / EntityInput / EntityMultiSelect：各类输入控件
  - SystemConfigNestedObjectEditor：嵌套对象编辑
  - haEntityDomainFilter / systemConfigCellClass / systemConfigSelectOptions：字段元数据
  - joinCommaEntityIds / parseCommaEntityIds：逗号分隔实体 id
  - getNestedObjectEditorKind：嵌套编辑器类型判定
数据来源：父级透传的 field
-->
<template>
  <div
    :data-field-id="inputId"
    :class="[
      'params-cell',
      cellClass,
      compact && 'params-cell--compact',
      modified && 'params-cell--modified',
      rowLayout && 'params-cell--row',
      isStructuredObject && 'params-cell--structured',
    ]"
  >
    <div class="params-cell-head">
      <div class="params-cell-head-top">
        <label :for="nativeLabelFor || undefined" class="params-cell-label" @click="onLabelClick">{{
          label
        }}</label>
        <span v-if="typeBadge && showDevKey" class="params-cell-type">{{ typeBadge }}</span>
      </div>
      <span v-if="sectionTag" class="params-section-tag">{{ sectionTag }}</span>
      <p v-if="showDevKey" class="params-cell-key">{{ field.key }}</p>
      <p v-if="hint && !compact" class="params-cell-hint">{{ hint }}</p>
      <p v-else-if="hint && compact" class="params-cell-hint params-cell-hint--compact">{{ hint }}</p>
    </div>
    <div :class="['params-cell-control', field.type === 'boolean' && 'params-cell-control--bool']">
      <template v-if="field.type === 'boolean'">
        <button
          type="button"
          :id="inputId"
          class="toggle-btn shrink-0"
          :class="{ on: fieldValue }"
          :aria-label="(fieldValue ? '关闭' : '启用') + label"
          :aria-pressed="!!fieldValue"
          @click="fieldValue = !fieldValue"
        >
          <div class="toggle-dot" :class="{ on: fieldValue }" />
        </button>
      </template>
      <input
        v-else-if="field.type === 'number'"
        :id="inputId"
        :value="numberDraft"
        type="number"
        step="any"
        class="params-cell-input"
        @focus="onNumberFocus"
        @input="onNumberDraftInput"
        @change="commitNumberDraft"
        @blur="commitNumberDraft"
      />
      <input
        v-else-if="field.type === 'password'"
        :id="inputId"
        :value="fieldValue"
        type="password"
        autocomplete="new-password"
        :placeholder="field.isMasked ? '已设置，输入新值覆盖' : '留空表示不设置'"
        class="params-cell-input font-mono"
        @input="onPasswordInput"
      />
      <SystemConfigNestedObjectEditor
        v-else-if="allowObject && field.type === 'object' && nestedEditorKind !== 'json'"
        :field-key="field.key"
        :input-id="inputId"
        v-model="fieldValue"
      />
      <textarea
        v-else-if="allowObject && field.type === 'object'"
        :id="inputId"
        v-model="fieldValue"
        rows="6"
        :placeholder="'结构化配置（JSON 格式）'"
        class="params-cell-input font-mono text-xs min-h-[120px]"
      />
      <input
        v-else-if="field.type === 'array'"
        :id="inputId"
        v-model="fieldValue"
        type="text"
        :placeholder="'逗号分隔多个值'"
        class="params-cell-input font-mono"
      />
      <EntityInput
        v-else-if="field.type === 'entity'"
        v-model="fieldValue"
        :input-id="inputId"
        :domain-filter="entityDomainFilter"
        input-class="params-cell-input font-mono"
        wrapper-class="params-cell-entity-wrap"
        :placeholder="entityPlaceholder"
      />
      <EntityMultiSelect
        v-else-if="field.type === 'entity-list'"
        v-model="entityListIds"
        :input-id="inputId"
        :allowed-domains="entityAllowedDomains"
        :placeholder="entityPlaceholder"
        wrapper-class="params-cell-entity-wrap"
      />
      <HosSelect
        variant="settings"
        block
        trigger-class="params-cell-input params-cell-select"
        v-else-if="field.type === 'select'"
        :id="inputId"
        v-model="fieldValue"
      >
        <option v-for="opt in selectOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </HosSelect>
      <input v-else :id="inputId" v-model="fieldValue" type="text" class="params-cell-input" />
    </div>
  </div>
</template>

<script setup>
import HosSelect from '@/components/common/base/HosSelect.vue'
import { computed, ref, watch } from 'vue'
import EntityInput from '@/components/common/EntityInput.vue'
import EntityMultiSelect from '@/components/common/EntityMultiSelect.vue'
import SystemConfigNestedObjectEditor from '@/views/settings/shared/system-config/SystemConfigNestedObjectEditor.vue'
import {
  haEntityDomainFilter,
  systemConfigCellClass,
  systemConfigSelectOptions,
} from '@/utils/config/system-config/field.util'
import { getNestedObjectEditorKind } from '@/views/settings/shared/system-config/nested-editor.util'
import { joinCommaEntityIds, parseCommaEntityIds } from '@/utils/entity/comma-entity-ids.util'
import { parseOptionalNumber } from '@/utils/core/misc.util'
const props = defineProps({
  field: { type: Object, required: true },
  inputId: { type: String, required: true },
  label: { type: String, required: true },
  hint: { type: String, default: '' },
  showDevKey: { type: Boolean, default: false },
  sectionTag: { type: String, default: '' },
  allowObject: { type: Boolean, default: true },
  compact: { type: Boolean, default: false },
  modified: { type: Boolean, default: false },
})

const emit = defineEmits(['update:value', 'update:isMasked'])

const fieldValue = computed({
  get: () => props.field.value,
  set: (value) => emit('update:value', value),
})

const numberDraft = ref('')
const numberFocused = ref(false)

function formatNumberDraft(value) {
  if (value == null || value === '') return ''
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? String(n) : ''
}

watch(
  () => props.field.value,
  (v) => {
    if (props.field.type !== 'number') return
    if (!numberFocused.value) numberDraft.value = formatNumberDraft(v)
  },
  { immediate: true },
)

watch(
  () => props.field.key,
  () => {
    numberFocused.value = false
    if (props.field.type === 'number') numberDraft.value = formatNumberDraft(props.field.value)
  },
)

function onNumberFocus() {
  numberFocused.value = true
  numberDraft.value = formatNumberDraft(props.field.value)
}

function onNumberDraftInput(event) {
  numberDraft.value = event.target.value
}

function commitNumberDraft() {
  numberFocused.value = false
  const parsed = parseOptionalNumber(numberDraft.value)
  if (parsed != null) {
    fieldValue.value = parsed
    numberDraft.value = String(parsed)
    return
  }
  // 清空或非法：恢复原值，不写入 NaN/0
  numberDraft.value = formatNumberDraft(props.field.value)
}

function onPasswordInput(event) {
  fieldValue.value = event.target.value
  if (props.field.isMasked) {
    emit('update:isMasked', false)
  }
}

const cellClass = computed(() => systemConfigCellClass(props.field))

const rowLayout = computed(() => {
  if (props.compact || props.field.type === 'boolean') return false
  const wide =
    props.field.type === 'password' ||
    props.field.type === 'array' ||
    props.field.type === 'object' ||
    props.field.type === 'entity' ||
    props.field.type === 'entity-list'
  return !wide
})

const typeBadge = computed(() => {
  const map = {
    boolean: '开关',
    number: '数值',
    password: '密钥',
    object: '对象',
    array: '列表',
    entity: '实体',
    'entity-list': '实体列表',
    select: '选项',
  }
  return map[props.field.type] || ''
})

const selectOptions = computed(() => systemConfigSelectOptions(props.field.key))

const entityDomainFilter = computed(() => haEntityDomainFilter(props.field.key))

const entityAllowedDomains = computed(() => {
  const domain = entityDomainFilter.value
  return domain ? [domain] : []
})

const entityPlaceholder = computed(() => {
  const domain = entityDomainFilter.value
  return domain ? `搜索并选择 ${domain} 实体` : '搜索并选择实体'
})

const entityListIds = computed({
  get: () =>
    Array.isArray(fieldValue.value)
      ? fieldValue.value.map(String).filter(Boolean)
      : parseCommaEntityIds(fieldValue.value),
  set: (ids) => {
    fieldValue.value = joinCommaEntityIds(ids)
  },
})

const nestedEditorKind = computed(() => {
  if (props.field.type !== 'object') return 'json'
  return getNestedObjectEditorKind(props.field.key)
})

const isStructuredObject = computed(
  () =>
    props.allowObject &&
    props.field.type === 'object' &&
    nestedEditorKind.value !== 'json',
)

/** div[role=combobox] 等非 labelable 控件不能用原生 for，需手动聚焦 */
const nativeLabelFor = computed(() => {
  if (props.field.type === 'entity-list') return ''
  return props.inputId
})

function onLabelClick(event) {
  if (nativeLabelFor.value) return
  event.preventDefault()
  const el = document.getElementById(props.inputId)
  if (el && typeof el.focus === 'function') el.focus()
}
</script>

<style scoped src="./styles/system-config-field-cell.css"></style>
