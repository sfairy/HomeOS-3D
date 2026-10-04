<!--
组件：SystemConfigNestedObjectEditor.vue
所属模块：frontend / src / views / settings / shared / system-config
职责：高级参数嵌套对象编辑器。按字段 key 选择 record-table（键值表格）/ fixed-form（固定表单）/ json（原始文本）
      三种编辑模式，支持原始 JSON 切换、重复键检测与固定表单范围校验。
Props：
  - fieldKey：字段 key（决定编辑器类型）
  - modelValue：JSON 字符串形式的对象
  - inputId：输入 id
Emits：
  - update:modelValue：值变更
关键依赖：
  - nested-editor.util：编辑器类型判定、记录行转换、JSON 解析/序列化、重复键与范围校验
数据来源：父级透传的 modelValue
-->
<template>
  <div class="nested-obj-editor">
    <template v-if="!rawMode && editorKind === 'record-table'">
      <p v-if="jsonParseError" class="nested-obj-editor__warn nested-obj-editor__warn--err">
        {{ jsonParseError }}
        <button type="button" class="nested-obj-editor__inline-link" @click="enterRawMode">
          {{ '编辑 JSON 源码' }}
        </button>
      </p>
      <div class="nested-obj-editor__table-wrap">
        <table class="nested-obj-editor__table">
          <thead>
            <tr>
              <th>{{ recordMeta.keyLabel }}</th>
              <th>{{ recordMeta.valueLabel }}</th>
              <th class="nested-obj-editor__col-action" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, rowIndex) in recordRows"
              :key="row.id"
              :class="{ 'nested-obj-editor__row--dup': isDuplicateKey(row.key) }"
            >
              <td>
                <input
                  v-model="row.key"
                  :id="rowIndex === 0 ? inputId || undefined : undefined"
                  type="text"
                  class="params-cell-input font-mono text-xs"
                  :placeholder="recordMeta.keyPlaceholder"
                  @input="syncRecordTable"
                />
              </td>
              <td>
                <input
                  v-model="row.value"
                  type="number"
                  step="any"
                  class="params-cell-input font-mono text-xs"
                  :min="recordMeta.valueMin"
                  :max="recordMeta.valueMax"
                  @input="syncRecordTable"
                  @blur="syncRecordTable"
                />
              </td>
              <td class="nested-obj-editor__col-action">
                <button
                  type="button"
                  class="nested-obj-editor__icon-btn"
                  :title="'删除行'"
                  :aria-label="'删除行'"
                  @click="removeRecordRow(row.id)"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
            <tr v-if="recordRows.length === 0">
              <td colspan="3" class="nested-obj-editor__empty">{{ '暂无条目，点击下方添加' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <button
        type="button"
        class="nested-obj-editor__add"
        :id="recordRows.length === 0 ? inputId || undefined : undefined"
        @click="addRecordRow"
      >
        <Plus class="w-3.5 h-3.5" />
        {{ '添加一行' }}
      </button>
      <p v-if="duplicateKeys.length" class="nested-obj-editor__warn">
        {{ `键名重复：${duplicateKeys.join('、')}（保存时后者会覆盖前者）` }}
      </p>
    </template>

    <template v-else-if="!rawMode && editorKind === 'fixed-form'">
      <p v-if="jsonParseError" class="nested-obj-editor__warn nested-obj-editor__warn--err">
        {{ jsonParseError }}
        <button type="button" class="nested-obj-editor__inline-link" @click="enterRawMode">
          {{ '编辑 JSON 源码' }}
        </button>
      </p>
      <div class="nested-obj-editor__fixed-grid">
        <label
          v-for="(spec, specIndex) in fixedFields"
          :key="spec.key"
          class="nested-obj-editor__fixed-item"
        >
          <span class="nested-obj-editor__fixed-label">{{ spec.label }}</span>
          <input
            v-model="fixedValues[spec.key]"
            :id="specIndex === 0 ? inputId || undefined : undefined"
            type="number"
            step="any"
            class="params-cell-input font-mono text-xs"
            :min="spec.min"
            :max="spec.max"
            @input="syncFixedForm"
            @blur="onFixedBlur(spec.key)"
          />
        </label>
      </div>
      <p v-if="fixedFormErrors.length" class="nested-obj-editor__warn">
        {{ fixedFormErrors.join('；') }}
      </p>
    </template>

    <textarea
      v-else
      :id="inputId"
      :value="modelValue"
      rows="6"
      :placeholder="'结构化配置（JSON 格式）'"
      class="params-cell-input font-mono text-xs min-h-[120px]"
      @input="onRawInput"
    />

    <button
      v-if="editorKind !== 'json'"
      type="button"
      class="nested-obj-editor__toggle"
      @click="toggleRawMode"
    >
      {{ rawMode ? '返回表格编辑' : '编辑 JSON 源码' }}
    </button>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Plus, Trash2 } from '@lucide/vue'
import {
  getNestedObjectEditorKind,
  NESTED_RECORD_TABLE_META,
  NESTED_FIXED_OBJECT_FIELDS,
  parseNestedObjectJson,
  tryParseNestedObjectJson,
  stringifyNestedObject,
  recordRowsFromObject,
  objectFromRecordRows,
  findDuplicateRecordKeys,
  findFixedFormRangeErrors,
} from './nested-editor.util'

const props = defineProps({
  fieldKey: { type: String, required: true },
  modelValue: { type: String, default: '{}' },
  inputId: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

const rawMode = ref(false)
const editorKind = computed(() => getNestedObjectEditorKind(props.fieldKey))
const recordMeta = computed(
  () =>
    NESTED_RECORD_TABLE_META[props.fieldKey] || {
      keyLabel: '键',
      valueLabel: '值',
    },
)
const fixedFields = computed(() => NESTED_FIXED_OBJECT_FIELDS[props.fieldKey]?.fields || [])

const recordRows = ref([])
const fixedValues = ref({})

const duplicateKeys = computed(() => findDuplicateRecordKeys(recordRows.value))

const jsonParseError = computed(() => {
  if (rawMode.value) return ''
  const parsed = tryParseNestedObjectJson(props.modelValue)
  if (parsed.ok) return ''
  const text = String(props.modelValue ?? '').trim()
  if (!text) return ''
  return 'JSON 格式无效，无法解析为表格'
})

const fixedFormErrors = computed(() => findFixedFormRangeErrors(props.fieldKey, fixedValues.value))

function isDuplicateKey(key) {
  const k = String(key || '').trim()
  return k && duplicateKeys.value.includes(k)
}

function emitValue(text) {
  emit('update:modelValue', text)
}

function loadFromModel() {
  const obj = parseNestedObjectJson(props.modelValue)
  if (editorKind.value === 'record-table') {
    recordRows.value = recordRowsFromObject(obj)
  } else if (editorKind.value === 'fixed-form') {
    const next = {}
    for (const spec of fixedFields.value) {
      const v = obj[spec.key]
      next[spec.key] = v == null || v === '' ? '' : Number(v)
    }
    fixedValues.value = next
  }
}

watch(
  () => props.modelValue,
  () => {
    if (rawMode.value) return
    loadFromModel()
  },
  { immediate: true },
)

watch(
  () => props.fieldKey,
  () => {
    rawMode.value = false
    loadFromModel()
  },
)

function syncRecordTable() {
  emitValue(stringifyNestedObject(objectFromRecordRows(recordRows.value)))
}

function addRecordRow() {
  recordRows.value.push({
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    key: '',
    value: '',
  })
}

function removeRecordRow(id) {
  recordRows.value = recordRows.value.filter((r) => r.id !== id)
  syncRecordTable()
}

function syncFixedForm() {
  const prev = parseNestedObjectJson(props.modelValue)
  const out = {}
  for (const spec of fixedFields.value) {
    const raw = fixedValues.value[spec.key]
    // 清空时保留原值，避免 Number('') === 0 或键被删掉
    if (raw === '' || raw == null) {
      const p = Number(prev[spec.key])
      if (Number.isFinite(p)) out[spec.key] = p
      continue
    }
    const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
    if (Number.isFinite(n)) out[spec.key] = n
  }
  emitValue(stringifyNestedObject(out))
}

function onFixedBlur(specKey) {
  const raw = fixedValues.value[specKey]
  if (raw === '' || raw == null) {
    const prev = parseNestedObjectJson(props.modelValue)
    const p = Number(prev[specKey])
    if (Number.isFinite(p)) fixedValues.value[specKey] = p
  }
  syncFixedForm()
}

function onRawInput(event) {
  emitValue(event.target.value)
}

function enterRawMode() {
  rawMode.value = true
}

function toggleRawMode() {
  if (!rawMode.value) {
    enterRawMode()
    return
  }
  rawMode.value = false
  loadFromModel()
}
</script>

<style scoped src="./styles/SystemConfigNestedObjectEditor.css"></style>
