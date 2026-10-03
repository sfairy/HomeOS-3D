<!--
组件：SettingsGroupedSelect.vue
所属模块：frontend / src / views / settings / shared / layout
职责：分组下拉选择器。按 group → option 两级结构展示选项，支持搜索过滤、点击外部收起、
      动态定位（防溢出/翻转）。用于设置页中按域分组的实体/服务选择。
Props：
  - modelValue：当前选中 id
  - groups：SettingsGroupedSelectGroup[] 分组选项
  - placeholder / searchable / searchPlaceholder / emptyText：占位/搜索/空态
  - minWidth / maxHeight：下拉宽高约束
Emits：
  - update:modelValue：选中变更
导出类型：
  - SettingsGroupedSelectOption / SettingsGroupedSelectGroup：选项与分组结构
关键依赖：
  - useClickOutside：点击外部收起
  - useDropdownPosition：下拉动态定位
数据来源：父级透传的 groups
-->
<template>
  <div ref="wrapRef" class="settings-grouped-select">
    <button
      type="button"
      class="settings-grouped-select__trigger"
      :class="{ 'settings-grouped-select__trigger--open': open }"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggle"
    >
      <span class="settings-grouped-select__trigger-body">
        <span v-if="selectedGroupLabel" class="settings-grouped-select__group-tag">{{
          selectedGroupLabel
        }}</span>
        <span class="settings-grouped-select__value">{{ selectedLabel || placeholderText }}</span>
      </span>
      <span class="settings-grouped-select__chevron" aria-hidden="true">
        <ChevronDown
          class="w-4 h-4"
          :class="{ 'settings-grouped-select__chevron-icon--open': open }"
        />
      </span>
    </button>

    <Teleport :to="teleportTarget" :disabled="teleportDisabled">
      <Transition name="sgs-drop">
        <div
          v-if="open"
          ref="dropdownRef"
          class="settings-grouped-select__panel"
          :class="{ 'settings-grouped-select__panel--top': placement === 'top' }"
          :style="dropdownStyle"
          role="listbox"
        >
          <div v-if="searchable" class="settings-grouped-select__search-wrap">
            <Search class="settings-grouped-select__search-icon" aria-hidden="true" />
            <input
              ref="searchRef"
              v-model="query"
              type="text"
              class="settings-grouped-select__search"
              :placeholder="searchPlaceholderText"
              autocomplete="off"
              @keydown.down.prevent="moveDown"
              @keydown.up.prevent="moveUp"
              @keydown.enter.prevent="selectActive"
              @keydown.escape.prevent="close"
            />
          </div>

          <div v-if="filteredGroups.length" class="settings-grouped-select__list no-scrollbar">
            <div
              v-for="group in filteredGroups"
              :key="group.id"
              class="settings-grouped-select__group"
            >
              <div v-if="showGroupHeaders" class="settings-grouped-select__group-head">
                {{ group.label }}
              </div>
              <button
                v-for="opt in group.options"
                :key="opt.id"
                type="button"
                role="option"
                :aria-selected="modelValue === opt.id"
                :class="[
                  'settings-grouped-select__option',
                  modelValue === opt.id && 'settings-grouped-select__option--selected',
                  flatIndex(opt.id) === activeIdx && 'settings-grouped-select__option--active',
                ]"
                @mousedown.prevent="pick(opt.id)"
                @mouseenter="activeIdx = flatIndex(opt.id)"
              >
                <span class="settings-grouped-select__option-label">{{ opt.label }}</span>
                <Check
                  v-if="modelValue === opt.id"
                  class="settings-grouped-select__option-check"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
          <div v-else class="settings-grouped-select__empty">{{ emptyLabel }}</div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { ChevronDown, Check, Search } from '@lucide/vue'
import { useClickOutside } from '@/composables/ui/useClickOutside'
import { useDropdownPosition } from '@/composables/ui/useDropdownPosition'

interface SettingsGroupedSelectOption {
  id: string
  label: string
}

interface SettingsGroupedSelectGroup {
  id: string
  label: string
  options: SettingsGroupedSelectOption[]
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    groups: SettingsGroupedSelectGroup[]
    placeholder?: string
    searchable?: boolean
    searchPlaceholder?: string
    emptyText?: string
    minWidth?: number
    maxHeight?: number
  }>(),
  {
    placeholder: '',
    searchable: true,
    searchPlaceholder: '',
    emptyText: '',
    minWidth: 240,
    maxHeight: 320,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  select: [value: string]
}>()

const placeholderText = computed(() => props.placeholder || '请选择')
const searchPlaceholderText = computed(() => props.searchPlaceholder || '搜索…')
const emptyLabel = computed(() => props.emptyText || '无匹配项')

const wrapRef = ref<HTMLElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)
const open = ref(false)
const query = ref('')
const activeIdx = ref(0)

const { dropdownStyle, teleportTarget, teleportDisabled, placement, updatePosition } =
  useDropdownPosition(
  wrapRef,
  open,
  {
    minWidth: props.minWidth,
    maxHeight: props.maxHeight,
    chromeHeight: () => (props.searchable ? 44 : 0),
    minListHeight: 120,
    dropdownRef,
  },
)

const showGroupHeaders = computed(() => props.groups.length > 1)

const flatOptions = computed(() =>
  props.groups.flatMap((g) => g.options.map((o) => ({ ...o, groupLabel: g.label }))),
)

const selectedMeta = computed(() => flatOptions.value.find((o) => o.id === props.modelValue))

const selectedLabel = computed(() => selectedMeta.value?.label || '')
const selectedGroupLabel = computed(() =>
  showGroupHeaders.value ? selectedMeta.value?.groupLabel || '' : '',
)

const filteredGroups = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.groups
  return props.groups
    .map((group) => ({
      ...group,
      options: group.options.filter(
        (opt) => opt.label.toLowerCase().includes(q) || opt.id.toLowerCase().includes(q),
      ),
    }))
    .filter((group) => group.options.length > 0)
})

const filteredFlat = computed(() => filteredGroups.value.flatMap((g) => g.options))

watch([filteredFlat, open], () => {
  if (!open.value) return
  const idx = filteredFlat.value.findIndex((o) => o.id === props.modelValue)
  activeIdx.value = idx >= 0 ? idx : 0
  nextTick(updatePosition)
})

function flatIndex(id: string) {
  return filteredFlat.value.findIndex((o) => o.id === id)
}

function openPanel() {
  open.value = true
  query.value = ''
  nextTick(() => {
    updatePosition()
    searchRef.value?.focus()
  })
}

function close() {
  open.value = false
  query.value = ''
}

function toggle() {
  if (open.value) close()
  else openPanel()
}

function pick(id: string) {
  emit('update:modelValue', id)
  emit('select', id)
  close()
}

function moveDown() {
  if (!filteredFlat.value.length) return
  activeIdx.value = Math.min(activeIdx.value + 1, filteredFlat.value.length - 1)
}

function moveUp() {
  activeIdx.value = Math.max(activeIdx.value - 1, 0)
}

function selectActive() {
  const opt = filteredFlat.value[activeIdx.value]
  if (opt) pick(opt.id)
}

useClickOutside(() => [wrapRef.value, dropdownRef.value].filter(Boolean) as HTMLElement[], close)
</script>

<style scoped src="./styles/settings-grouped-select.css"></style>
