<template>
  <!-- SearchableSelect 可搜索选择器：输入框+下拉列表，支持搜索过滤和键盘导航 -->
  <div ref="wrapRef" class="ss-wrap">
    <div class="ss-input-row">
      <input
        ref="inputRef"
        :value="displayValue"
        :placeholder="placeholderText"
        :class="[variant === 'list-page' ? 'ss-input--list-page' : 'settings-field', inputClass]"
        autocomplete="off"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="showDropdown"
        :aria-controls="listId"
        :aria-activedescendant="activeOptionId"
        @input="onInput"
        @focus="onFocus"
        @keydown.down.prevent="moveDown"
        @keydown.up.prevent="moveUp"
        @keydown.enter.prevent="selectCurrent"
        @keydown.escape.prevent="closeDropdown"
      />
      <button
        v-if="modelValue"
        type="button"
        class="ss-clear"
        :aria-label="clearLabel"
        @mousedown.prevent="clear"
      >
        <X class="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        class="ss-toggle"
        :aria-label="toggleLabel"
        @mousedown.prevent="toggleDropdown"
      >
        <ChevronDown class="w-4 h-4" :class="{ 'ss-toggle--open': showDropdown }" />
      </button>
    </div>

    <Teleport :to="teleportTarget" :disabled="teleportDisabled">
      <Transition name="ss-drop">
        <div
          v-if="showDropdown"
          ref="dropdownRef"
          :class="['ss-dropdown', placement === 'top' && 'ss-dropdown--top']"
          :style="dropdownStyle"
        >
          <div v-if="loading" class="ss-loading">{{ loadingText }}</div>
          <div
            v-else-if="filteredOptions.length"
            :id="listId"
            ref="listRef"
            class="ss-list"
            role="listbox"
            :aria-label="listLabel"
          >
            <button
              v-for="(opt, idx) in filteredOptions"
              :id="optionId(idx)"
              :key="`${opt.value}-${idx}`"
              type="button"
              role="option"
              :aria-selected="opt.value === modelValue"
              :class="['ss-item', idx === activeIdx && 'ss-item--active']"
              @mousedown.prevent="select(opt)"
              @mouseenter="activeIdx = idx"
            >
              <div class="ss-item-main">
                <span class="ss-item-label">{{ opt.label }}</span>
                <span v-if="opt.hint" class="ss-item-hint">{{ opt.hint }}</span>
              </div>
            </button>
          </div>
          <div v-else class="ss-empty">{{ emptyLabel }}</div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
/**
 * SearchableSelect - 可搜索的下拉选择组件
 * 功能特性：
 * - 带输入框的下拉选择器，支持实时搜索过滤
 * - 支持 selectOnly 模式（仅能从列表选择，输入不回写）
 * - 支持加载状态显示
 * - 完整的键盘导航（上下箭头、回车、Esc）
 * - 使用 Teleport 渲染下拉面板
 * 依赖：
 * - useClickOutside: 点击外部关闭下拉
 * - useDropdownPosition: 下拉面板定位计算
 */
import { ref, computed, nextTick, watch } from 'vue'
import { X, ChevronDown } from '@lucide/vue'
import { useClickOutside } from '@/composables/ui/useClickOutside'
import { useDropdownPosition } from '@/composables/ui/useDropdownPosition'
import { currentScale } from '@/composables/ui/useScaling'

/** 组件 Props 定义 */
const props = defineProps({
  /** v-model 绑定值 */
  modelValue: { type: String, default: '' },
  /** 选项数组，每项格式 {value, label, hint} */
  options: { type: Array, default: () => [] },
  /** 输入框占位文本 */
  placeholder: { type: String, default: '' },
  /** 输入框自定义 class */
  inputClass: { type: String, default: '' },
  /** 外观变体：settings（设置页风格）/ list-page（列表页风格） */
  variant: { type: String, default: 'settings' },
  /** 无匹配项时的文本 */
  emptyText: { type: String, default: '' },
  /** 清除按钮的 aria-label */
  clearAria: { type: String, default: '' },
  /** 展开按钮的 aria-label */
  toggleAria: { type: String, default: '' },
  /** 仅能从列表选择，输入时不回写 modelValue（用于实体筛选等） */
  selectOnly: { type: Boolean, default: false },
  /** 是否显示加载状态 */
  loading: { type: Boolean, default: false },
  /** 加载状态文本 */
  loadingText: { type: String, default: '搜索中…' },
})

/** 占位文本（优先使用 props.placeholder，默认'请选择'） */
const placeholderText = computed(() => props.placeholder || '请选择')
/** 空状态文本（加载中显示加载文本，否则显示无匹配项） */
const emptyLabel = computed(() => {
  if (props.loading) return props.loadingText || '搜索中…'
  return props.emptyText || '无匹配项'
})
/** 清除按钮的 aria-label 文本 */
const clearLabel = computed(() => props.clearAria || '清除')
/** 展开按钮的 aria-label 文本 */
const toggleLabel = computed(() => props.toggleAria || '展开选项')

/** 组件事件定义 */
const emit = defineEmits(['update:modelValue', 'select', 'open', 'search'])

/** 外层容器 ref，用于下拉定位 */
const wrapRef = ref(null)
/** 下拉面板 ref，用于定位和点击外部判断 */
const dropdownRef = ref(null)
/** 选项列表 ref：键盘导航选中项需要滚动到可视区域 */
const listRef = ref(null)
/** 输入框 ref，用于聚焦 */
const inputRef = ref(null)
/** 是否显示下拉面板 */
const showDropdown = ref(false)
/** 当前搜索关键词 */
const query = ref('')
/** 当前键盘导航激活的选项索引 */
const activeIdx = ref(0)

/**
 * 实例级唯一后缀：listbox / option 的 id 必须成对且全局唯一，
 * 同一表单可能同时挂多个选择器，因此拼一个随机后缀而不是写死字符串。
 */
const uid = `ss-${Math.random().toString(36).slice(2, 9)}`
/** listbox 的 id，供输入框 aria-controls 引用 */
const listId = computed(() => `${uid}-list`)
/** 列表可访问名：沿用占位文案（placeholder 是「选择什么」的语义来源）。
    不再回退到 props.clearAria——那是清除按钮的标签（如「清除」），
    拿它当列表框名会把「请选择房间」读成「清除」。 */
const listLabel = computed(() => props.placeholder || placeholderText.value)
/** 当前激活选项的 id：输入框 aria-activedescendant 指向它，读屏才播报高亮项 */
const activeOptionId = computed(() =>
  showDropdown.value && filteredOptions.value.length ? `${uid}-opt-${activeIdx.value}` : undefined,
)

/**
 * 选项 id 生成器（与 activeOptionId 同一套规则）。
 * @param idx 选项在过滤后列表中的索引
 */
function optionId(idx) {
  return `${uid}-opt-${idx}`
}

/**
 * 下拉面板定位逻辑
 * @property dropdownStyle - 面板定位样式
 * @property teleportTarget - Teleport 目标容器
 * @property teleportDisabled - 是否禁用 Teleport
 * @property placement - 弹出方向
 * @property updatePosition - 更新面板位置的方法
 */
const { dropdownStyle, teleportTarget, teleportDisabled, placement, updatePosition } =
  useDropdownPosition(wrapRef, showDropdown, {
    // getBoundingClientRect 为视口像素，须换算为画布单位再传入 minWidth
    minWidth: () => {
      const s = currentScale.value || 1
      const vw = wrapRef.value?.getBoundingClientRect().width ?? 0
      return Math.max(vw / s, 120)
    },
    maxHeight: 320,
    chromeHeight: 0,
    minListHeight: 96,
    dropdownRef,
  })

/** 当前选中项的标签文本 */
const selectedLabel = computed(() => {
  const opt = props.options.find((o) => o.value === props.modelValue)
  return opt?.label || props.modelValue || ''
})

/** 输入框显示值（展开时显示搜索词，收起时显示选中标签） */
const displayValue = computed(() => (showDropdown.value ? query.value : selectedLabel.value))

/** 过滤后的选项列表（根据搜索关键词匹配 label/value/hint） */
const filteredOptions = computed(() => {
  const options = Array.isArray(props.options) ? props.options : []
  const q = query.value.trim().toLowerCase()
  if (!q) return options
  return options.filter((o) => {
    const label = String(o.label || '').toLowerCase()
    const value = String(o.value || '').toLowerCase()
    const hint = String(o.hint || '').toLowerCase()
    return label.includes(q) || value.includes(q) || hint.includes(q)
  })
})

// 监听过滤选项、下拉状态、加载状态变化，展开时重新计算面板位置并保证激活项可见
watch([filteredOptions, showDropdown, () => props.loading], () => {
  if (!showDropdown.value) return
  nextTick(() => updatePosition())
  scrollActiveOptionIntoView()
})

/**
 * 把当前激活项滚动进可视区。
 * 下拉列表自身有 max-height（默认 320px），键盘上下键移动高亮时若目标项在可视区外，
 * 用户会「看得见输入框、看不见高亮」，等于键盘导航失效。
 * `block: 'nearest'` 只滚动最近的滚动祖先、且仅在需要时滚动，不会带动整个页面跳动。
 */
function scrollActiveOptionIntoView() {
  if (!showDropdown.value) return
  nextTick(() => {
    const items = listRef.value?.querySelectorAll('.ss-item')
    const target = items?.[activeIdx.value]
    target?.scrollIntoView({ block: 'nearest' })
  })
}

// 键盘导航 / 鼠标悬停改变激活项时同步滚动（鼠标悬停时目标通常已在视口内，scrollIntoView 无副作用）
watch(activeIdx, () => scrollActiveOptionIntoView())

/** 展开下拉面板：同步搜索词为当前选中值、激活索引对齐选中项、触发 open 事件 */
function openDropdown() {
  query.value = props.modelValue ? selectedLabel.value : ''
  showDropdown.value = true
  // 激活索引落在当前选中项上：打开即可见高亮，配合 scrollIntoView 直接滚到该项，
  // 长列表下不必从第一项一路按方向键找回来。
  const options = filteredOptions.value
  const selectedIdx = options.findIndex((o) => o.value === props.modelValue)
  activeIdx.value = selectedIdx >= 0 ? selectedIdx : 0
  // activeIdx 未变化时上面的 watch 不会触发，这里兜底滚一次
  scrollActiveOptionIntoView()
  emit('open')
  nextTick(updatePosition)
}

/** 关闭下拉面板并清空搜索关键词 */
function closeDropdown() {
  showDropdown.value = false
  query.value = ''
}

/** 切换下拉面板展开/收起状态 */
function toggleDropdown() {
  if (showDropdown.value) closeDropdown()
  else {
    openDropdown()
    inputRef.value?.focus()
  }
}

/** 输入框聚焦时自动展开下拉面板 */
function onFocus() {
  openDropdown()
}

/** 输入变化时：更新搜索词、可选回写 v-model、触发 search 事件 */
function onInput(e) {
  query.value = e.target.value
  if (!props.selectOnly) {
    emit('update:modelValue', query.value.trim())
  }
  emit('search', query.value.trim())
  showDropdown.value = true
  activeIdx.value = 0
  nextTick(updatePosition)
}

/** 选择一个选项：更新 v-model、触发 select 事件、关闭下拉 */
function select(opt) {
  emit('update:modelValue', opt.value)
  emit('select', opt.value)
  closeDropdown()
}

/** 清除选择：清空 v-model、触发 select 事件、关闭下拉 */
function clear() {
  emit('update:modelValue', '')
  emit('select', '')
  closeDropdown()
}

/** 键盘向下导航：未展开时先展开，激活索引 +1 */
function moveDown() {
  if (!showDropdown.value) openDropdown()
  activeIdx.value = Math.min(activeIdx.value + 1, filteredOptions.value.length - 1)
}

/** 键盘向上导航：激活索引 -1，不小于 0 */
function moveUp() {
  activeIdx.value = Math.max(activeIdx.value - 1, 0)
}

/** 键盘回车选择：选中当前激活的选项 */
function selectCurrent() {
  const opt = filteredOptions.value[activeIdx.value]
  if (opt) select(opt)
}

/** 点击外部区域时关闭下拉面板 */
function onClickOutside() {
  closeDropdown()
}

// 点击外部区域时关闭下拉面板
useClickOutside(() => [wrapRef.value, dropdownRef.value].filter(Boolean), onClickOutside)
</script>

<style scoped src="./styles/SearchableSelect.css"></style>
