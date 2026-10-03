<template>
  <!-- TemplateEntityTypeSelect 模板实体类型选择：选择要创建的实体类型 -->
  <div ref="wrapRef" class="wr-type-select">
    <button
      type="button"
      class="wr-type-select__trigger"
      :class="{
        'wr-type-select__trigger--open': open,
        'wr-type-select__trigger--empty': !modelValue,
      }"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggle"
    >
      <span class="wr-type-select__trigger-body">
        <span v-if="selectedGroupLabel" class="wr-type-select__group-tag">{{
          selectedGroupLabel
        }}</span>
        <span class="wr-type-select__value">{{ selectedLabel || placeholder }}</span>
      </span>
      <span class="wr-type-select__chevron" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          :class="{ 'wr-type-select__chevron--open': open }"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </span>
    </button>

    <Teleport :to="teleportTarget" :disabled="teleportDisabled">
      <Transition name="wr-type-drop">
        <div
          v-if="open"
          ref="dropdownRef"
          class="wr-type-select__panel"
          :class="{ 'wr-type-select__panel--top': placement === 'top' }"
          :style="dropdownStyle"
          role="listbox"
        >
          <div class="wr-type-select__search-wrap">
            <svg
              class="wr-type-select__search-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="16.5" y1="16.5" x2="21" y2="21" />
            </svg>
            <input
              ref="searchRef"
              v-model="query"
              type="search"
              class="wr-type-select__search"
              :placeholder="searchPlaceholder"
              autocomplete="off"
              @keydown.down.prevent="moveDown"
              @keydown.up.prevent="moveUp"
              @keydown.enter.prevent="selectActive"
              @keydown.escape.prevent="close"
            />
          </div>

          <div v-if="filteredGroups.length" class="wr-type-select__list">
            <div v-for="group in filteredGroups" :key="group.id" class="wr-type-select__group">
              <div class="wr-type-select__group-head">{{ group.label }}</div>
              <button
                v-for="opt in group.options"
                :key="opt.id"
                type="button"
                role="option"
                :aria-selected="modelValue === opt.id"
                :class="[
                  'wr-type-select__option',
                  modelValue === opt.id && 'wr-type-select__option--selected',
                  flatIndex(opt.id) === activeIdx && 'wr-type-select__option--active',
                ]"
                @mousedown.prevent="pick(opt.id)"
                @mouseenter="activeIdx = flatIndex(opt.id)"
              >
                <span class="wr-type-select__option-main">
                  <span class="wr-type-select__option-label">{{ opt.label }}</span>
                  <span v-if="opt.sub" class="wr-type-select__option-sub">{{ opt.sub }}</span>
                </span>
                <span v-if="opt.hint" class="wr-type-select__option-hint">{{ opt.hint }}</span>
                <svg
                  v-if="modelValue === opt.id"
                  class="wr-type-select__option-check"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
            </div>
          </div>
          <div v-else class="wr-type-select__empty">{{ emptyText }}</div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
/**
 * TemplateEntityTypeSelect - 模板实体类型选择组件
 * 功能特性：
 * - 展示可选的实体类型
 * - 支持搜索过滤
 * - 用于模板实体创建向导
 */
import { ref, computed, watch, nextTick } from 'vue'
import { useClickOutside } from '@/composables/ui/useClickOutside'
import { useDropdownPosition } from '@/composables/ui/useDropdownPosition'

interface TemplateEntityTypeOption {
  id: string
  label: string
  hint?: string
  sub?: string
  keywords?: string
}

interface TemplateEntityTypeGroup {
  id: string
  label: string
  options: TemplateEntityTypeOption[]
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    groups: TemplateEntityTypeGroup[]
    placeholder?: string
    searchPlaceholder?: string
    emptyText?: string
    minWidth?: number
    maxHeight?: number
  }>(),
  {
    placeholder: '请选择家电或高级模式…',
    searchPlaceholder: '搜索类型，如：空调、洗衣机、电视…',
    emptyText: '未找到匹配类型',
    minWidth: 280,
    maxHeight: 340,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  select: [value: string]
}>()

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
    chromeHeight: 44,
    minListHeight: 120,
    dropdownRef,
  },
)

const flatOptions = computed(() =>
  props.groups.flatMap((g) => g.options.map((o) => ({ ...o, groupLabel: g.label }))),
)

const selectedMeta = computed(() => flatOptions.value.find((o) => o.id === props.modelValue))
const selectedLabel = computed(() => selectedMeta.value?.label || '')
const selectedGroupLabel = computed(() => selectedMeta.value?.groupLabel || '')

const filteredGroups = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.groups
  return props.groups
    .map((group) => ({
      ...group,
      options: group.options.filter((opt) => {
        const hay =
          `${opt.label} ${opt.id} ${opt.hint || ''} ${opt.sub || ''} ${opt.keywords || ''}`.toLowerCase()
        return hay.includes(q)
      }),
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
