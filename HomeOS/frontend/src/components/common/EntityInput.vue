<template>
  <div :class="['ei-wrap', wrapperClass]" ref="wrapRef">
    <div class="ei-input-row">
      <!-- 实体 ID 输入框：支持键盘上下方向键导航、回车选中、Esc 关闭 -->
      <input
        ref="inputRef"
        :id="inputId || undefined"
        :value="displayValue"
        @input="onInput"
        @focus="onFocus"
        @keydown.down.prevent="moveDown"
        @keydown.up.prevent="moveUp"
        @keydown.enter.prevent="selectCurrent"
        @keydown.escape.prevent="closeDropdown"
        :placeholder="placeholder || '选择或输入 entity_id'"
        :class="inputClass"
      />
      <!-- 清除按钮 -->
      <button
        v-if="showClearBtn"
        type="button"
        class="ei-clear"
        :aria-label="'清除实体 ID'"
        @mousedown.prevent="clear"
        @click.prevent
      >
        <X class="w-3 h-3" />
      </button>
    </div>
    <!-- 下拉建议面板（域过滤、分组、虚拟滚动） -->
    <EntityInputDropdown
      :show="showDropdown"
      :teleport-target="teleportTarget"
      :teleport-disabled="teleportDisabled"
      :dropdown-style="dropdownStyle"
      :placement="placement"
      :show-domain-filter="showDomainFilter"
      :selected-domain="selectedDomain"
      :domain-menu-open="domainMenuOpen"
      :domain-menu-placement="domainMenuPlacement"
      :domain-menu-style="domainMenuStyle"
      :domain-menu-teleport-target="domainMenuTeleportTarget"
      :domain-menu-teleport-disabled="domainMenuTeleportDisabled"
      :available-domains="availableDomains"
      :domain-counts="domainCounts"
      :total-entity-count="totalEntityCount"
      :grouped-items="groupedItems"
      :flat-items="flatItems"
      :use-virtual-dropdown="useVirtualDropdown"
      :show-group-header="showGroupHeader"
      :active-flat-idx="activeFlatIdx"
      :on-domain-menu-anchor="registerDomainMenuAnchor"
      :on-domain-menu-panel="registerDomainMenuPanel"
      :on-dropdown-el="registerDropdownEl"
      :entity-item-key="entityItemKey"
      :is-active="isActive"
      @select="select"
      @set-active="setActive"
      @update:active-flat-idx="activeFlatIdx = $event"
      @toggle-domain-menu="toggleDomainMenu"
      @select-domain="selectFilterDomain"
    />
  </div>
</template>

<script setup>
/**
 * @file EntityInput.vue
 * @module common/EntityInput
 * @description HA 实体 ID 单选输入框
 *  职责：
 *    - 输入框 + 自动补全下拉（支持域过滤、分组、虚拟滚动）；
 *    - 键盘导航（上/下/回车/Esc）；
 *    - 通过 v-model 与父级双向绑定 entity_id 字符串。
 *  依赖：useEntityInput 组合式函数、EntityInputDropdown 子组件、entity-input 样式。
 */
import { ref } from 'vue'
import { X } from '@lucide/vue'
import { useEntityInput } from '@/composables/entity/useEntityInput'
import EntityInputDropdown from '@/components/common/entity-input/EntityInputDropdown.vue'
import './entity-input/index.css'

const props = defineProps({
  /** 绑定的 entity_id 字符串（v-model） */
  modelValue: { type: String, default: '' },
  /** 输入框 placeholder */
  placeholder: { type: String, default: '' },
  /** 域过滤（如 'light' / 'switch'），仅展示该域的实体 */
  domainFilter: { type: String, default: '' },
  /** 输入框附加 class */
  inputClass: { type: String, default: '' },
  /** 外层 wrap 附加 class */
  wrapperClass: { type: String, default: '' },
  /** 供 label[for] 关联的 input id */
  inputId: { type: String, default: '' },
  /** 建议的 device_class，用于排序/高亮匹配项 */
  suggestDeviceClass: { type: String, default: '' },
  /** 下拉最小宽度（px） */
  dropdownMinWidth: { type: Number, default: 280 },
  /** 下拉最大高度（px） */
  dropdownMaxHeight: { type: Number, default: 360 },
})

const emit = defineEmits(['update:modelValue'])

/** 输入框 DOM 引用，传给 composable 用于聚焦/失焦控制 */
const inputRef = ref(null)

// 实体输入核心状态与方法，由组合式函数统一管理
const {
  wrapRef,
  showDropdown,
  domainMenuOpen,
  selectedDomain,
  activeFlatIdx,
  displayValue,
  showClearBtn,
  dropdownStyle,
  teleportTarget,
  teleportDisabled,
  placement,
  domainMenuPlacement,
  domainMenuStyle,
  domainMenuTeleportTarget,
  domainMenuTeleportDisabled,
  totalEntityCount,
  domainCounts,
  availableDomains,
  groupedItems,
  flatItems,
  showDomainFilter,
  showGroupHeader,
  useVirtualDropdown,
  entityItemKey,
  isActive,
  setActive,
  onInput,
  onFocus,
  select,
  clear,
  moveDown,
  moveUp,
  selectCurrent,
  closeDropdown,
  selectFilterDomain,
  toggleDomainMenu,
  registerDropdownEl,
  registerDomainMenuAnchor,
  registerDomainMenuPanel,
} = useEntityInput(props, emit, inputRef)
</script>