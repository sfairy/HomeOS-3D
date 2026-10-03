<!--
  GeekVarKeyField.vue
  职责：geek-automation 编辑器内通用的「变量 key + 作用域」选择控件。
       组合框（combobox）形态：可自由输入 key，也可下拉选择已声明变量；
       支持就地声明新变量（触发 declare 事件由父级落库），并展示声明状态/当前值提示。
  所属模块：geek-automation（被触发/条件/动作表单中所有需要变量选择的字段复用）。
  关键依赖：
    - HosSelect：作用域选择（global / rule）。
    - @lucide/vue 的 ChevronDown：下拉箭头图标。
    - useClickOutside：点击外部关闭下拉。
    - useDropdownPosition + currentScale：Teleport 下拉面板的定位与缩放适配。
  Props：
    - modelValue：当前变量 key（字符串）。
    - scope：当前作用域（global / rule）。
    - label/placeholder：字段标签与输入占位。
    - showScope：是否展示作用域选择。
    - declared：已声明变量列表（含 key/scope/value）。
    - canUseRule：是否允许使用「本规则」作用域（需先保存自动化）。
    - allowDeclare：是否展示「创建到全局/本规则」按钮。
    - allowCustom：是否展示「输入新变量 key…」入口。
  Emits：
    - update:modelValue：变量 key 变更。
    - update:scope：作用域变更。
    - change：key 或作用域变更（用于触发父级刷新）。
    - declare：声明新变量（携带 { key, scope }，由父级写入变量库）。
  关键交互：
    - 输入框聚焦自动打开下拉；下拉面板 Teleport 到 body 以避免 overflow 裁切。
    - 选中已声明变量时自动同步其作用域；未声明 key 提供快速声明按钮。
    - KEY_RE 仅允许字母/数字/下划线；输入非法时给出错误提示。
    - 下拉面板支持向上展开（placement=top）以适配屏幕底部场景。
-->
<template>
  <div class="gvk">
    <div class="gvk-row">
      <div class="gvk-field">
        <span>{{ label }}</span>
        <div ref="comboRef" class="gvk-combo" :class="{ 'is-open': menuOpen }">
          <input
            :value="modelValue"
            class="gvk-combo__input"
            :placeholder="placeholder || '变量 key'"
            spellcheck="false"
            autocomplete="off"
            @input="onKeyInput"
            @change="emitChange"
            @focus="onInputFocus"
            @keydown.down.prevent="openMenu"
            @keydown.escape.prevent="closeMenu"
          />
          <button
            type="button"
            class="gvk-combo__chev"
            :aria-expanded="menuOpen"
            :aria-label="'选择已声明变量'"
            @click.stop="toggleMenu"
          >
            <ChevronDown :size="14" :class="{ 'is-open': menuOpen }" />
          </button>
          <Teleport :to="teleportTarget" :disabled="teleportDisabled">
            <div
              v-if="menuOpen"
              ref="panelRef"
              class="gvk-combo__panel"
              :class="{ 'gvk-combo__panel--top': placement === 'top' }"
              :style="dropdownStyle"
              role="listbox"
            >
              <button
                v-for="opt in keyOptions"
                :key="`${opt.group}-${opt.value}`"
                type="button"
                class="gvk-combo__item"
                :class="{ 'is-selected': opt.value === modelValue }"
                role="option"
                @mousedown.prevent="pickKey(opt.value)"
              >
                <span>{{ opt.label }}</span>
                <em v-if="opt.hint">{{ opt.hint }}</em>
              </button>
              <p v-if="!keyOptions.length" class="gvk-combo__empty">
                {{ '暂无已声明变量，可直接在上方输入 key' }}
              </p>
              <button
                v-if="allowCustom"
                type="button"
                class="gvk-combo__item gvk-combo__item--action"
                @mousedown.prevent="openCustomFromMenu"
              >
                {{ '输入新变量 key…' }}
              </button>
            </div>
          </Teleport>
        </div>
      </div>
      <div v-if="showScope" class="gvk-field gvk-field--scope">
        <span>{{ '作用域' }}</span>
        <HosSelect
          :model-value="scope || 'global'"
          :options="scopeOptions"
          variant="orchestrator"
          size="sm"
          block
          :searchable="false"
          @update:model-value="onScopeChange"
          @change="onScopeChange"
        />
      </div>
    </div>
    <button
      v-if="allowCustom && !customOpen"
      type="button"
      class="gvk-custom-link"
      @click="openCustom"
    >
      {{ '输入新变量 key' }}
    </button>
    <div v-if="allowCustom && customOpen" class="gvk-custom">
      <input
        ref="customInputRef"
        v-model="customDraft"
        class="gvk-custom__input"
        :class="{ 'is-invalid': Boolean(customError) }"
        :placeholder="'输入新变量 key'"
        spellcheck="false"
        @input="customError = ''"
        @keydown.enter.prevent="commitCustom"
        @keydown.escape.prevent="cancelCustom"
      />
      <button type="button" class="gvk-custom__ok" @click="commitCustom">{{ '确定' }}</button>
      <button type="button" class="gvk-custom__cancel" @click="cancelCustom">{{ '取消' }}</button>
    </div>
    <p v-if="customError" class="gvk-custom-error">{{ customError }}</p>
    <div v-if="hint" class="gvk-status">
      <span :class="['gvk-pill', undeclared ? 'is-warn' : 'is-ok']">{{
        undeclared ? '未声明' : '已声明'
      }}</span>
      <em>{{ hintText }}</em>
      <button
        v-if="undeclared && modelValue && allowDeclare"
        type="button"
        class="gvk-declare"
        @click="emit('declare', { key: modelValue, scope: scope || 'global' })"
      >
        {{ scope === 'rule' ? '创建到本规则' : '创建到全局' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import { ChevronDown } from '@lucide/vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import { useClickOutside } from '@/composables/ui/useClickOutside'
import { useDropdownPosition } from '@/composables/ui/useDropdownPosition'
import { currentScale } from '@/composables/ui/useScaling'

/** 与后端 AutomationVariableService / 变量面板一致 */
const KEY_RE = /^[a-zA-Z0-9_]+$/

const props = defineProps({
  modelValue: { type: String, default: '' },
  scope: { type: String, default: 'global' },
  label: { type: String, default: '变量' },
  placeholder: { type: String, default: '' },
  showScope: { type: Boolean, default: true },
  declared: { type: Array, default: () => [] },
  canUseRule: { type: Boolean, default: true },
  allowDeclare: { type: Boolean, default: true },
  allowCustom: { type: Boolean, default: true },
})

const emit = defineEmits(['update:modelValue', 'update:scope', 'change', 'declare'])

const scopeOptions = computed(() => [
  { value: 'global', label: '全局' },
  { value: 'rule', label: '本规则', disabled: !props.canUseRule },
])

const customOpen = ref(false)
const customDraft = ref('')
const customError = ref('')
const customInputRef = ref(null)
const menuOpen = ref(false)
const comboRef = ref(null)
const panelRef = ref(null)

const { dropdownStyle, teleportTarget, teleportDisabled, placement, updatePosition } =
  useDropdownPosition(comboRef, menuOpen, {
    minWidth: () => {
      const s = currentScale.value || 1
      const vw = comboRef.value?.getBoundingClientRect().width ?? 0
      return Math.max(vw / s, 160)
    },
    maxHeight: 240,
    // 底部「输入新变量」动作行计入 chrome，避免向上展开时裁切列表末行
    chromeHeight: () => (props.allowCustom ? 40 : 0),
    minListHeight: 72,
    minRowHeight: 36,
    dropdownRef: panelRef,
  })

const keyScopeMap = computed(() => {
  const sc = props.scope === 'rule' ? 'rule' : 'global'
  const byKey = new Map()
  for (const v of props.declared) {
    const k = String(v?.key || '').trim()
    if (!k) continue
    const vScope = v.scope === 'rule' ? 'rule' : 'global'
    const prev = byKey.get(k)
    if (!prev || (prev !== sc && vScope === sc)) {
      byKey.set(k, vScope)
    }
  }
  return byKey
})

const keyOptions = computed(() => {
  const sc = props.scope === 'rule' ? 'rule' : 'global'
  const byKey = keyScopeMap.value
  return [...byKey.entries()]
    .map(([key, scope]) => ({ key, scope }))
    .sort((a, b) => {
      if (a.scope === sc && b.scope !== sc) return -1
      if (a.scope !== sc && b.scope === sc) return 1
      return a.key.localeCompare(b.key)
    })
    .map((v) => ({
      value: v.key,
      label: v.key,
      hint: v.scope === 'rule' ? '本规则' : '全局',
      group: v.scope === sc ? '当前作用域' : '其他作用域',
    }))
})

const undeclared = computed(() => {
  const k = String(props.modelValue || '').trim()
  if (!k) return false
  const sc = props.scope === 'rule' ? 'rule' : 'global'
  return !props.declared.some(
    (v) => String(v.key) === k && (v.scope === 'rule' ? 'rule' : 'global') === sc,
  )
})

const hint = computed(() => {
  const k = String(props.modelValue || '').trim()
  if (!k) return ''
  if (props.scope === 'rule' && !props.canUseRule) return 'need-save'
  if (undeclared.value) return 'undeclared'
  const hit = props.declared.find(
    (v) =>
      String(v.key) === k &&
      (v.scope === 'rule' ? 'rule' : 'global') === (props.scope === 'rule' ? 'rule' : 'global'),
  )
  if (hit && hit.value != null && hit.value !== '') return `value:${hit.value}`
  return 'ok'
})

const hintText = computed(() => {
  if (hint.value === 'need-save') return '本规则变量需先保存自动化'
  if (hint.value === 'undeclared') return '运行时可自动创建'
  if (String(hint.value).startsWith('value:')) return `当前 ${String(hint.value).slice(6)}`
  if (hint.value === 'ok') return ''
  return ''
})

function syncScopeForKey(key) {
  if (!props.showScope) return
  const mapped = keyScopeMap.value.get(key)
  if (!mapped) return
  const cur = props.scope === 'rule' ? 'rule' : 'global'
  if (mapped === cur) return
  if (mapped === 'rule' && !props.canUseRule) return
  emit('update:scope', mapped)
}

function onKeyInput(ev) {
  const k = String(ev.target?.value ?? '')
  customError.value = ''
  emit('update:modelValue', k)
}

function pickKey(value) {
  const k = String(value ?? '').trim()
  emit('update:modelValue', k)
  syncScopeForKey(k)
  closeMenu()
  emit('change')
}

function openMenu() {
  menuOpen.value = true
  nextTick(updatePosition)
}

function closeMenu() {
  menuOpen.value = false
}

function toggleMenu() {
  if (menuOpen.value) closeMenu()
  else openMenu()
}

function onInputFocus() {
  openMenu()
}

function openCustomFromMenu() {
  closeMenu()
  openCustom()
}

function openCustom() {
  customDraft.value = String(props.modelValue || '').trim()
  customError.value = ''
  customOpen.value = true
  nextTick(() => customInputRef.value?.focus())
}

function commitCustom() {
  const k = String(customDraft.value || '').trim()
  if (!k) {
    customError.value = '请输入变量 key'
    return
  }
  if (!KEY_RE.test(k)) {
    customError.value = '变量 key 仅允许字母、数字与下划线'
    return
  }
  customOpen.value = false
  customError.value = ''
  emit('update:modelValue', k)
  emit('change')
}

function cancelCustom() {
  customOpen.value = false
  customDraft.value = ''
  customError.value = ''
}

function onScopeChange(ev) {
  const value =
    typeof ev === 'string' || typeof ev === 'number' || typeof ev === 'boolean'
      ? String(ev)
      : ev?.target?.value ?? ''
  emit('update:scope', value)
  emit('change')
}

function emitChange() {
  const k = String(props.modelValue || '').trim()
  if (k && !KEY_RE.test(k)) {
    customError.value = '变量 key 仅允许字母、数字与下划线'
    return
  }
  customError.value = ''
  emit('change')
}

useClickOutside(() => [comboRef.value, panelRef.value].filter(Boolean), closeMenu)
</script>

<style scoped>
.gvk {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.gvk-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}
.gvk-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--premium-fs-micro);
  min-width: 0;
}
.gvk-field--scope {
  width: 96px;
}
.gvk-field > span {
  color: #94a3b8;
  font-size: var(--premium-fs-micro);
}
.gvk-combo {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 36px;
  border-radius: 7px;
  border: var(--hos-hairline, 1px) solid var(--premium-border-strong, rgba(148, 163, 184, 0.32));
  background: rgba(255, 255, 255, 0.045);
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.gvk-combo:hover,
.gvk-combo.is-open {
  border-color: rgba(59, 130, 246, 0.38);
  background: rgba(255, 255, 255, 0.07);
}
.gvk-combo.is-open {
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.08);
}
.gvk-combo__input {
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.88);
  font-size: var(--premium-fs-body-sm);
  font-family: inherit;
  padding: 7px 4px 7px 10px;
  outline: none;
}
.gvk-combo__input::placeholder {
  color: var(--hos-text-secondary);
}
.gvk-combo__chev {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--hos-text-secondary);
  cursor: pointer;
  padding: 6px 8px;
}
.gvk-combo__chev :deep(svg) {
  transition: transform 0.2s ease;
}
.gvk-combo__chev :deep(svg.is-open) {
  transform: rotate(180deg);
}
.gvk-custom-link {
  align-self: flex-start;
  border: 0;
  background: transparent;
  color: #93c5fd;
  font-size: var(--premium-fs-micro);
  cursor: pointer;
  padding: 0;
}
.gvk-custom-link:hover {
  text-decoration: underline;
}
.gvk-custom {
  display: flex;
  align-items: center;
  gap: 6px;
}
.gvk-custom__input {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 36px;
  padding: 7px 10px;
  border-radius: 7px;
  border: var(--hos-hairline, 1px) solid var(--premium-border-strong, rgba(148, 163, 184, 0.32));
  background: rgba(255, 255, 255, 0.045);
  color: rgba(255, 255, 255, 0.88);
  font-size: var(--premium-fs-body-sm);
  font-family: inherit;
  box-sizing: border-box;
}
.gvk-custom__input:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.38);
  background: rgba(255, 255, 255, 0.07);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.08);
}
.gvk-custom__input.is-invalid {
  border-color: rgba(248, 113, 113, 0.55);
}
.gvk-custom-error {
  margin: 0;
  font-size: var(--premium-fs-micro);
  color: #fca5a5;
}
.gvk-custom__ok,
.gvk-custom__cancel {
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  font-size: var(--premium-fs-micro);
  cursor: pointer;
  padding: 4px 6px;
}
.gvk-custom__ok {
  color: #93c5fd;
}
.gvk-custom__cancel {
  color: #94a3b8;
}
.gvk-custom__ok:hover,
.gvk-custom__cancel:hover {
  text-decoration: underline;
}
.gvk-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  min-height: 22px;
}
.gvk-pill {
  font-size: var(--premium-fs-micro);
  padding: 2px 7px;
  border-radius: var(--hos-radius-pill);
  border: 1px solid transparent;
}
.gvk-pill.is-ok {
  color: #86efac;
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(52, 211, 153, 0.25);
}
.gvk-pill.is-warn {
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.12);
  border-color: rgba(251, 191, 36, 0.28);
}
.gvk-status em {
  font-style: normal;
  font-size: var(--premium-fs-micro);
  color: #94a3b8;
}
.gvk-declare {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: #93c5fd;
  font-size: var(--premium-fs-micro);
  cursor: pointer;
  padding: 0;
}
.gvk-declare:hover {
  text-decoration: underline;
}
@media (max-width: 420px) {
  .gvk-row {
    grid-template-columns: 1fr;
  }
  .gvk-field--scope {
    width: auto;
  }
}
</style>

<style>
/* Teleport 面板（非 scoped） */
.gvk-combo__panel {
  position: fixed;
  z-index: var(--z-max);
  box-sizing: border-box;
  overflow: auto;
  padding: 6px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(15, 23, 42, 0.96);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
}
.gvk-combo__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.88);
  font-size: var(--hos-dd-fs-item-from-body-sm);
  text-align: left;
  padding: 8px 10px;
  cursor: pointer;
}
.gvk-combo__item:hover,
.gvk-combo__item.is-selected {
  background: rgba(59, 130, 246, 0.16);
}
.gvk-combo__item em {
  font-style: normal;
  font-size: var(--premium-fs-micro);
  color: #94a3b8;
}
.gvk-combo__item--action {
  color: #93c5fd;
  margin-top: 4px;
  border-top: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 0 0 8px 8px;
}
.gvk-combo__empty {
  margin: 0;
  padding: 10px;
  font-size: var(--premium-fs-micro);
  color: #94a3b8;
  text-align: center;
}
</style>
