<template>
  <div ref="wrapRef" :class="['hos-select', rootClass]">
    <!--
      按 WAI-ARIA 1.2 的 button-combobox 模式声明：键盘焦点留在触发按钮上，
      用 `aria-activedescendant` 指向当前高亮项，而不是把焦点搬进列表里。
      注意 `aria-label` 必须显式给：`role="combobox"` 的可访问名只认作者标注，
      不再从按钮文字内容推导 —— 缺了它，空值/图标化时 `button-name` 是 axe critical。
    -->
    <button
      type="button"
      ref="triggerRef"
      :id="id || undefined"
      :class="triggerClass"
      :disabled="disabled"
      :title="title"
      role="combobox"
      :aria-expanded="open ? 'true' : 'false'"
      aria-haspopup="listbox"
      :aria-controls="panelId"
      :aria-activedescendant="open && !searchable ? activeOptionId : undefined"
      :aria-label="title || selectedLabel || placeholderText"
      @click.stop="toggle"
      @keydown.down.prevent="onTriggerArrow(1)"
      @keydown.up.prevent="onTriggerArrow(-1)"
      @keydown.enter.prevent="onTriggerEnter"
      @keydown.space.prevent="onTriggerEnter"
      @keydown.esc.prevent="close"
      @keydown.home.prevent="onTriggerEdge('first')"
      @keydown.end.prevent="onTriggerEdge('last')"
      @keydown.tab="close"
    >
      <span class="hos-select__value">{{ selectedLabel || placeholderText }}</span>
      <ChevronDown class="hos-select__chev" :class="{ 'hos-select__chev--open': open }" />
    </button>

    <!-- 下拉面板：Teleport 到 #teleport-target，支持上方/下方弹出并随整页等比缩放 -->
    <Teleport :to="teleportTarget" :disabled="teleportDisabled">
      <Transition name="hos-select-drop">
        <div
          v-if="open"
          :id="panelId"
          ref="dropdownRef"
          :class="['hos-select__panel', placement === 'top' && 'hos-select__panel--top']"
          :style="dropdownStyle"
          role="listbox"
          :aria-label="title || undefined"
        >
          <!-- 可搜索模式下焦点在输入框，所以 combobox 语义挂在这里而不是触发按钮。 -->
          <div v-if="searchable" class="hos-select__search-wrap">
            <Search class="hos-select__search-icon" aria-hidden="true" />
            <input
              ref="searchRef"
              v-model="query"
              type="text"
              class="hos-select__search"
              role="combobox"
              aria-autocomplete="list"
              :aria-expanded="open ? 'true' : 'false'"
              :aria-controls="panelId"
              :aria-activedescendant="activeOptionId"
              :aria-label="title || placeholderText"
              :placeholder="searchPlaceholderText"
              autocomplete="off"
              @keydown.down.prevent="moveDown"
              @keydown.up.prevent="moveUp"
              @keydown.enter.prevent="selectActive"
              @keydown.escape.prevent="close"
              @keydown.tab="close"
            />
          </div>

          <!--
            选项不进 Tab 序列（`tabindex="-1"`），键盘完全交给上面的触发按钮 / 搜索框，
            这是 combobox 模式的关键：Tab 一次就离开整个控件，不是逐个选项走。
          -->
          <div v-if="visibleOptions.length" class="hos-select__list" role="presentation">
            <template v-for="(opt, idx) in visibleOptions" :key="`${opt.value}-${idx}`">
              <div
                v-if="opt.group && (idx === 0 || visibleOptions[idx - 1].group !== opt.group)"
                class="hos-select__group-label"
                role="presentation"
              >
                {{ opt.group }}
              </div>
              <button
                type="button"
                :id="optionId(idx)"
                role="option"
                tabindex="-1"
                :data-active-option="idx === activeIdx ? 'true' : undefined"
                :aria-selected="isSelected(opt) ? 'true' : 'false'"
                :disabled="opt.disabled"
                :class="[
                  'hos-select__item',
                  isSelected(opt) && 'hos-select__item--selected',
                  idx === activeIdx && 'hos-select__item--active',
                ]"
                @click="pick(opt)"
                @mouseenter="activeIdx = idx"
              >
                <div class="hos-select__item-main">
                  <span class="hos-select__item-label">{{ opt.label }}</span>
                  <span v-if="opt.hint" class="hos-select__item-hint">{{ opt.hint }}</span>
                </div>
                <Check v-if="isSelected(opt)" class="hos-select__item-check" aria-hidden="true" />
              </button>
            </template>
          </div>
          <div v-else class="hos-select__empty">{{ emptyLabel }}</div>
        </div>
      </Transition>
    </Teleport>

    <!-- 隐藏的 slot 容器：用于收集 <option> 子元素 -->
    <div class="hos-select__slot-options" aria-hidden="true">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, useId, useSlots, onUpdated } from 'vue'
import { ChevronDown, Check, Search } from '@lucide/vue'
import { useClickOutside } from '@/composables/ui/useClickOutside'
import { useDropdownPosition } from '@/composables/ui/popup/useDropdownPosition'
import { entitySelectHint } from '@/shared/entity/utils/select.util'
import './styles/hos-select.css'

const props = defineProps({
  modelValue: { type: [String, Number], default: undefined },
  /** 兼容 v-bind:value 写法 */
  value: { type: [String, Number], default: undefined },
  /** 选项数组，每项可为 string/number 或 {value, label, hint, disabled, group} */
  options: { type: Array, default: null },
  placeholder: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  /** 是否显示为不支持状态（样式不同） */
  unsupported: { type: Boolean, default: false },
  /** 尺寸：sm / md / lg 等 */
  size: { type: String, default: '' },
  /** 外观变体：default / 其他自定义样式 */
  variant: { type: String, default: 'default' },
  /** 是否块级宽度（占满父容器） */
  block: { type: Boolean, default: false },
  fit: { type: Boolean, default: false },
  /** 是否可搜索：true=强制开启 / false=强制关闭 / auto=选项超过12个时自动开启 */
  searchable: { type: [Boolean, String], default: 'auto' },
  searchPlaceholder: { type: String, default: '' },
  emptyText: { type: String, default: '' },
  title: { type: String, default: '' },
  number: { type: Boolean, default: false },
  /** 下拉面板最小宽度（px） */
  minWidth: { type: Number, default: 0 },
  /** 下拉面板最大高度（px），超出滚动 */
  maxHeight: { type: Number, default: 280 },
  triggerClass: { type: String, default: '' },
  id: { type: String, default: '' },
  /** v-model 修饰符（如 .number） */
  modelModifiers: { type: Object, default: () => ({}) },
})

/** 组件事件定义：update:modelValue(v-model)、change（选中变化） */
const emit = defineEmits(['update:modelValue', 'change'])

/** 获取默认 slot 内容，用于解析 <option> 子元素 */
const slots = useSlots()
/** 从 slot 解析出的选项列表 */
const slotOptions = ref([])

/** 占位文本（优先使用 props.placeholder，默认'请选择'） */
const placeholderText = computed(() => props.placeholder || '请选择')
/** 无匹配项文本（优先使用 props.emptyText，默认'无匹配项'） */
const emptyLabel = computed(() => props.emptyText || '无匹配项')
/** 搜索框占位文本（优先使用 props.searchPlaceholder，默认'搜索…'） */
const searchPlaceholderText = computed(() => props.searchPlaceholder || '搜索…')

/** 外层容器 ref，用于下拉定位 */
const wrapRef = ref(null)
/** 下拉面板 ref，用于定位和点击外部判断 */
const dropdownRef = ref(null)
/** 搜索输入框 ref，用于自动聚焦 */
const searchRef = ref(null)
/** 触发按钮 ref：面板关闭后把焦点还给它（见 close） */
const triggerRef = ref(null)
/** 下拉面板是否展开 */
const open = ref(false)
/** 当前搜索关键词 */
const query = ref('')
/** 当前键盘导航激活的选项索引 */
const activeIdx = ref(0)

/**
 * 面板 / 选项的 id 前缀。
 *
 * 用 `useId()` 而不是固定字符串：同一个页面里往往有十几个 HosSelect，
 * 固定 id 会让 `aria-controls` / `aria-activedescendant` 全部指向第一个实例的选项。
 */
const panelId = useId()
/** 第 idx 个选项的 DOM id（combobox 的 `aria-activedescendant` 靠它定位高亮项）。 */
function optionId(idx) {
  return `${panelId}-opt-${idx}`
}
/** 当前高亮项 id：面板收起时不指向任何东西。 */
const activeOptionId = computed(() => (open.value ? optionId(activeIdx.value) : undefined))

/**
 * 下拉面板定位逻辑
 * @property dropdownStyle - 面板定位样式
 * @property teleportTarget - Teleport 目标容器
 * @property teleportDisabled - 是否禁用 Teleport
 * @property placement - 弹出方向（top/bottom）
 * @property updatePosition - 更新面板位置的方法
 */
const { dropdownStyle, teleportTarget, teleportDisabled, placement, updatePosition } = useDropdownPosition(
  wrapRef,
  open,
  {
    minWidth: props.minWidth || 120,
    maxHeight: props.maxHeight,
    // 可搜索时面板内含搜索栏，须计入 chrome，否则向上展开会裁切首行
    chromeHeight: () => (searchable.value ? 44 : 0),
    minListHeight: 80,
    minRowHeight: () => 40,
    dropdownRef,
  },
)

/** 所有选项（合并 props.options 和 slot 选项，统一归一化格式） */
const allOptions = computed(() => {
  if (Array.isArray(props.options) && props.options.length) {
    return props.options.map(normalizeOption)
  }
  return slotOptions.value
})

/** 是否显示搜索框（auto 模式下超过 12 个选项自动开启） */
const searchable = computed(() => {
  if (props.searchable === true) return true
  if (props.searchable === false) return false
  return allOptions.value.length > 12
})

/** 过滤后的可见选项（根据搜索关键词匹配 label/value/hint） */
const visibleOptions = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!searchable.value || !q) return allOptions.value
  return allOptions.value.filter((opt) => {
    const label = String(opt.label || '').toLowerCase()
    const value = String(opt.value ?? '').toLowerCase()
    const hint = String(opt.hint || '').toLowerCase()
    return label.includes(q) || value.includes(q) || hint.includes(q)
  })
})

/** 解析后的当前值（优先 modelValue，兼容 value prop） */
const resolvedValue = computed(() => {
  if (props.modelValue !== undefined && props.modelValue !== null) return props.modelValue
  if (props.value !== undefined && props.value !== null) return props.value
  return ''
})

/** 当前选中项的显示文本（找不到选项时显示原始值） */
const selectedLabel = computed(() => {
  const currentValue = resolvedValue.value
  const opt = allOptions.value.find((o) => String(o.value) === String(currentValue))
  return opt?.label ?? (currentValue !== '' && currentValue != null ? String(currentValue) : '')
})

/** 根元素 class 组合（根据 props 动态生成） */
const rootClass = computed(() => [
  props.block && 'hos-select--block',
  props.fit && 'hos-select--fit',
  props.size && `hos-select--${props.size}`,
  props.variant !== 'default' && `hos-select--${props.variant}`,
])

/** 触发按钮 class 组合（根据状态动态生成） */
const triggerClass = computed(() => [
  'hos-select__trigger',
  open.value && 'hos-select__trigger--open',
  !selectedLabel.value && 'hos-select__trigger--empty',
  props.unsupported && 'hos-select__trigger--unsupported',
  props.triggerClass,
])

/** 将原始选项归一化为统一格式 {value, label, hint, disabled, group} */
function normalizeOption(opt) {
  if (opt == null) return { value: '', label: '', hint: '', disabled: false, group: '' }
  if (typeof opt === 'string' || typeof opt === 'number') {
    const value = opt
    return {
      value,
      label: String(opt),
      hint: entitySelectHint(value),
      disabled: false,
      group: '',
    }
  }
  const value = opt.value ?? ''
  return {
    value,
    label: opt.label ?? String(opt.value ?? ''),
    hint: entitySelectHint(value, opt.hint),
    disabled: !!opt.disabled,
    group: opt.group ?? '',
  }
}

/** 从 VNode 中递归提取文本内容（用于解析 <option> 标签内的文本） */
function extractVNodeText(vnode) {
  if (!vnode) return ''
  if (typeof vnode.children === 'string') return vnode.children.trim()
  if (Array.isArray(vnode.children)) {
    return vnode.children
      .map((child) => (typeof child === 'string' ? child : extractVNodeText(child)))
      .join('')
      .trim()
  }
  return ''
}

/** 判断 VNode 是否为 <option> 元素 */
function isOptionVNode(vnode) {
  const type = vnode?.type
  return type === 'option' || (typeof type === 'string' && type === 'option')
}

/** 判断 VNode 是否为 <optgroup> 元素 */
function isGroupVNode(vnode) {
  const type = vnode?.type
  return type === 'optgroup' || (typeof type === 'string' && type === 'optgroup')
}

/** 判断 VNode 是否为 Fragment 节点 */
function isFragmentVNode(vnode) {
  const type = vnode?.type
  return type === Symbol.for('v-fgt') || type === 'Fragment'
}

/** 递归收集 slot 中的 option VNode（支持 optgroup 分组和 Fragment） */
function collectOptionVnodes(nodes, out = [], group = '') {
  for (const vnode of nodes) {
    if (!vnode) continue
    if (isOptionVNode(vnode)) {
      out.push({ vnode, group })
      continue
    }
    if (isGroupVNode(vnode)) {
      const label = String(vnode.props?.label ?? '').trim()
      const children = Array.isArray(vnode.children) ? vnode.children : []
      collectOptionVnodes(children, out, label)
      continue
    }
    if (isFragmentVNode(vnode)) {
      const children = Array.isArray(vnode.children) ? vnode.children : []
      collectOptionVnodes(children, out, group)
    }
  }
  return out
}

/** 解析默认 slot 中的 <option>/<optgroup>，转换为选项数据 */
function parseSlotOptions() {
  const nodes = slots.default?.() || []
  const parsed = []
  for (const { vnode, group } of collectOptionVnodes(nodes)) {
    const value = vnode.props?.value
    parsed.push({
      value: value ?? '',
      label: extractVNodeText(vnode) || String(value ?? ''),
      hint: entitySelectHint(value),
      disabled: !!vnode.props?.disabled,
      group,
    })
  }
  slotOptions.value = parsed
}

/** 转换输出值的类型（如果配置了 number 模式则转为数字） */
function coerceEmitValue(raw) {
  const asNumber = props.number || props.modelModifiers?.number || typeof resolvedValue.value === 'number'
  if (asNumber) {
    const num = Number(raw)
    return Number.isNaN(num) ? raw : num
  }
  return raw
}

/** 判断选项是否被选中（转字符串比较，避免类型不一致） */
function isSelected(opt) {
  return String(opt.value) === String(resolvedValue.value)
}

/** 展开下拉面板：重置搜索、定位到选中项、更新位置、聚焦搜索框 */
function openPanel() {
  if (props.disabled) return
  open.value = true
  query.value = ''
  const idx = visibleOptions.value.findIndex((o) => isSelected(o))
  activeIdx.value = idx >= 0 ? idx : 0
  nextTick(() => {
    updatePosition()
    if (searchable.value) searchRef.value?.focus()
  })
}

/** 关闭下拉面板并清空搜索关键词 */
function close() {
  // 键盘用户在搜索框里按 Enter 选中后，搜索框会随面板一起卸载 ——
  // 焦点会掉到 <body>，下一次按 Tab 得从页面开头重来。这里把焦点还给触发按钮。
  const active = document.activeElement
  const focusWasInPanel = !!dropdownRef.value && active instanceof HTMLElement && dropdownRef.value.contains(active)
  open.value = false
  query.value = ''
  if (focusWasInPanel) triggerRef.value?.focus?.()
}

/** 切换下拉面板展开/收起状态 */
function toggle() {
  if (open.value) close()
  else openPanel()
}

/** 选择一个选项并更新 v-model、触发 change 事件 */
function pick(opt) {
  if (opt.disabled) return
  const next = coerceEmitValue(opt.value)
  emit('update:modelValue', next)
  emit('change', next)
  close()
}

/** 键盘向下导航：激活索引 +1，不超过最后一项 */
function moveDown() {
  if (!visibleOptions.value.length) return
  activeIdx.value = Math.min(activeIdx.value + 1, visibleOptions.value.length - 1)
  scrollActiveIntoView()
}

/** 键盘向上导航：激活索引 -1，不小于 0 */
function moveUp() {
  activeIdx.value = Math.max(activeIdx.value - 1, 0)
  scrollActiveIntoView()
}

/**
 * 把高亮项滚进可视区。
 *
 * 用 `block: 'nearest'`：元素本来就可见时是 no-op，只有被面板高度裁掉才滚，
 * 且只滚最近的滚动祖先 —— 不会像默认 `start` 那样把整页翻一下。
 */
function scrollActiveIntoView() {
  nextTick(() => {
    const el = dropdownRef.value?.querySelector('[data-active-option="true"]')
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  })
}

/** 触发按钮上按上下键：收起时先展开（展开会定位到当前选中项），展开后继续移动 */
function onTriggerArrow(dir) {
  if (!open.value) {
    openPanel()
    return
  }
  if (dir > 0) moveDown()
  else moveUp()
}

/** 触发按钮上按 Enter / Space：收起时展开；已展开且有搜索框时把焦点交给搜索框 */
function onTriggerEnter() {
  if (!open.value) {
    openPanel()
    return
  }
  if (searchable.value) {
    searchRef.value?.focus()
    return
  }
  selectActive()
}

/** 触发按钮上按 Home / End：跳到首项 / 末项 */
function onTriggerEdge(edge) {
  if (!open.value) openPanel()
  if (!visibleOptions.value.length) return
  activeIdx.value = edge === 'first' ? 0 : visibleOptions.value.length - 1
  scrollActiveIntoView()
}

/** 键盘回车选择：选中当前激活的选项 */
function selectActive() {
  const opt = visibleOptions.value[activeIdx.value]
  if (opt) pick(opt)
}

// 监听可见选项或展开状态变化，展开时重新计算面板位置（选项数量变化影响高度）
watch([visibleOptions, open], () => {
  if (!open.value) return
  nextTick(updatePosition)
})

// 初始解析 slot 选项
parseSlotOptions()
// 组件更新后重新解析 slot（响应 slot 内容变化）
onUpdated(parseSlotOptions)

// 点击外部区域时关闭下拉面板
useClickOutside(() => [wrapRef.value, dropdownRef.value].filter(Boolean), close)
</script>
