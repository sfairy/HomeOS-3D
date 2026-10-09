<!--
组件：AccountListEditor.vue
所属模块：frontend / src / views / settings / connect / bindings
职责：能源账户列表编辑器。支持多账户行编辑、设主账户、粘贴逗号分隔号码自动拆行，
      按户号后 4 位检测命名冲突，并同步到 source 的 accountEntries / accountString。
关键依赖：
  - account.util：账户输入清洗、拆行、冲突检测与字符串同步
数据来源：父级透传的 source（账户配置对象，直接读写其 accountEntries）
-->
<template>
  <div class="account-list-editor">
    <label :class="['settings-form-label mb-1.5', labelClass]">{{ accountLabel }}</label>

    <div v-if="suffixConflicts.length" class="account-list-editor__warn">
      {{ '以下户号后 4 位重复，约定命名实体会冲突：' }}
      <span v-for="s in suffixConflicts" :key="s" class="account-list-editor__warn-tag">{{
        s
      }}</span>
    </div>

    <div class="account-list-editor__rows">
      <div v-for="(row, idx) in entries" :key="idx" class="account-list-editor__row">
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
        <input
          :ref="(el) => setNumberInputRef(el, idx)"
          :value="row.number"
          type="text"
          class="settings-field account-list-editor__number"
          :placeholder="numberPlaceholder"
          @input="onNumberInput(idx, $event)"
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
          :title="entries.length <= 1 ? '至少保留一行' : '删除'"
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
        {{
          '每行一个账号；也可粘贴逗号（, 或 ，）分隔的多个号码，会自动拆成多行。取户号后 4 位拼接为'
        }}
        <span :class="prefixClass">{{ prefix }}</span>
        {{ '{户号后4位}_{实体名}；★ 为主账户，用于概览与底栏默认显示。' }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import {
  expandAccountRowsFromInput,
  findAccountSuffixConflicts,
  hasAccountNumberSeparator,
  isLonelyAccountSeparator,
  resolveFirstAccountSegment,
  resolveFocusRowAfterCommaSplit,
  sanitizeAccountNumberInput,
  syncAccountString,
} from '@/utils/energy/account.util'
import { useBindingAccountListEditor } from './useBindingAccountListEditor'

// 入参：账户配置对象（直接读写）、标签/占位符/样式类与命名前缀
const props = defineProps({
  source: { type: Object, required: true },
  accountLabel: { type: String, default: '账户' },
  numberPlaceholder: { type: String, default: '输入账号/户号' },
  labelClass: { type: String, default: '' },
  prefixClass: { type: String, default: '' },
  prefix: { type: String, default: '' },
})

const source = props.source

// 确保 source 上存在 accountEntries 数组，缺失时初始化为一空行
function ensureRows() {
  if (!Array.isArray(source.accountEntries)) {
    source.accountEntries = [{ number: '', label: '' }]
  }
  return source.accountEntries
}

const entries = computed(() => source.accountEntries || [])

const { primaryIndex, setPrimary, removeRow } = useBindingAccountListEditor({
  source,
  entries,
  ensureEntries: ensureRows,
  sync: syncAccountString,
  createEmptyRow: () => ({ number: '', label: '' }),
})

// 户号后 4 位冲突列表
const suffixConflicts = computed(() => findAccountSuffixConflicts(entries.value))

const numberInputRefs = ref([])
// 拆行锁，避免粘贴逗号拆行过程中重复触发
const splittingRows = ref(false)

function setNumberInputRef(el, idx) {
  if (el) numberInputRefs.value[idx] = el
}

// 拆行后将目标行聚焦并把光标定位到末尾
async function focusNumberRow(idx) {
  await nextTick()
  const rows = ensureRows()
  if (rows[idx]) {
    rows[idx].number = sanitizeAccountNumberInput(rows[idx].number)
  }
  const input = numberInputRefs.value[idx]
  if (!input) return
  input.value = rows[idx]?.number ?? ''
  input.focus()
  const len = input.value.length
  input.setSelectionRange(len, len)
}

// 清理仅含分隔符的行（粘贴后残留的单独逗号），返回是否已清理
function clearLonelySeparatorRow(idx, event) {
  const rows = ensureRows()
  if (!rows[idx]) return false
  const raw = String(event?.target?.value ?? rows[idx].number ?? '')
  if (!isLonelyAccountSeparator(raw)) return false
  rows[idx].number = ''
  if (event?.target) event.target.value = ''
  syncAccountString(source)
  return true
}

function onRowChange() {
  syncAccountString(source)
}

// 号码输入处理：无分隔符时直接清洗同步；含分隔符时拆成多行并聚焦拆分后的首行
async function onNumberInput(idx, event) {
  const raw = String(event?.target?.value ?? '')

  if (clearLonelySeparatorRow(idx, event)) return

  if (!hasAccountNumberSeparator(raw)) {
    ensureRows()[idx].number = sanitizeAccountNumberInput(raw)
    syncAccountString(source)
    return
  }

  if (splittingRows.value) {
    clearLonelySeparatorRow(idx, event)
    return
  }

  splittingRows.value = true
  try {
    const focusIdx = resolveFocusRowAfterCommaSplit(idx, raw)
    const before = [...ensureRows()]
    const expanded = expandAccountRowsFromInput(before, idx, raw)
    if (expanded !== before) {
      source.accountEntries = expanded
    } else {
      const rows = ensureRows()
      if (rows[idx]) rows[idx].number = resolveFirstAccountSegment(raw)
    }
    syncAccountString(source)
    await focusNumberRow(focusIdx)
    clearLonelySeparatorRow(focusIdx, { target: numberInputRefs.value[focusIdx] })
  } finally {
    await nextTick()
    splittingRows.value = false
  }
}

function addRow() {
  ensureRows().push({ number: '', label: '' })
}
</script>
<style src="./styles/account-list-editor.css"></style>
