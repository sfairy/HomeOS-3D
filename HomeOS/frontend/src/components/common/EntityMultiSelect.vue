/**
 * @file EntityMultiSelect.vue
 * @module common/EntityMultiSelect
 * @description HA 实体多选输入框
 *  组合触发器（EntityMultiSelectTrigger）与下拉面板（EntityMultiSelectDropdown），
 *  支持域过滤、分组展示、键盘导航与虚拟滚动。
 *  依赖：entity-multi-select 子目录下的 Trigger/Dropdown 子组件与 useEntityMultiSelect composable。
 */
<template>
  <div :ref="bindWrapRef" :class="['ems-wrap', wrapperClass]">
    <!-- 触发器：展示已选项 chips、placeholder，点击展开下拉 -->
    <EntityMultiSelectTrigger
      :trigger-ref="bindTriggerRef"
      :show-dropdown="showDropdown"
      :selected-ids="selectedIds"
      :placeholder-text="placeholderText"
      :display-name="displayName"
      :open-dropdown="openDropdown"
      :close-dropdown="closeDropdown"
      :remove-id="removeId"
      :clear-all="clearAll"
      :input-id="inputId"
    />

    <!-- 下拉面板：搜索框、域过滤菜单、实体列表（分组/虚拟滚动） -->
    <EntityMultiSelectDropdown
      :teleport-target="teleportTarget"
      :teleport-disabled="teleportDisabled"
      :show-dropdown="showDropdown"
      :dropdown-ref="bindDropdownRef"
      :placement="placement"
      :dropdown-style="dropdownStyle"
      :search-ref="bindSearchRef"
      :query="query"
      :set-query="setQuery"
      :close-dropdown="closeDropdown"
      :domain-menu-anchor="bindDomainMenuAnchor"
      :domain-menu-panel-ref="bindDomainMenuPanelRef"
      :show-domain-filter="showDomainFilter"
      :selected-domain="selectedDomain"
      :domain-menu-open="domainMenuOpen"
      :domain-menu-placement="domainMenuPlacement"
      :domain-menu-style="domainMenuStyle"
      :domain-menu-teleport-target="domainMenuTeleportTarget"
      :domain-menu-teleport-disabled="domainMenuTeleportDisabled"
      :available-domains="availableDomains"
      :selected-ids="selectedIds"
      :select-filter-domain="selectFilterDomain"
      :toggle-domain-menu="toggleDomainMenu"
      :flat-items="flatItems"
      :grouped-items="groupedItems"
      :show-group-header="showGroupHeader"
      :is-selected="isSelected"
      :toggle-item="toggleItem"
    />
  </div>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 EntityMultiSelect 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import EntityMultiSelectTrigger from '@/components/common/entity-multi-select/EntityMultiSelectTrigger.vue'
import EntityMultiSelectDropdown from '@/components/common/entity-multi-select/EntityMultiSelectDropdown.vue'
import { useEntityMultiSelect } from '@/components/common/entity-multi-select/useEntityMultiSelect'
import './entity-multi-select/styles/entity-multi-select-dropdown.css'

const props = defineProps({
  /** 绑定的 entity_id 数组（v-model） */
  modelValue: { type: Array, default: () => [] },
  /** 允许的实体域白名单 */
  allowedDomains: { type: Array, default: () => ['person', 'device_tracker'] },
  /** placeholder 文案 */
  placeholder: { type: String, default: '' },
  /** 建议的 device_class，用于排序/高亮 */
  suggestDeviceClass: { type: String, default: '' },
  /** 外层 wrap 附加 class */
  wrapperClass: { type: String, default: '' },
  /** 供外部 label 点击聚焦的触发器 id */
  inputId: { type: String, default: '' },
  /** 下拉最小宽度（px） */
  dropdownMinWidth: { type: Number, default: 320 },
  /** 下拉最大高度（px） */
  dropdownMaxHeight: { type: Number, default: 360 },
  /** 最大选择数，0 表示不限 */
  maxSelection: { type: Number, default: 0 },
  /** 静态选项（不依赖 HA 实体列表时使用） */
  staticOptions: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue'])

// 多选核心状态与方法，由组合式函数统一管理
const {
  placeholderText,
  showDropdown,
  domainMenuOpen,
  selectedDomain,
  query,
  bindWrapRef,
  bindTriggerRef,
  bindDropdownRef,
  bindDomainMenuAnchor,
  bindDomainMenuPanelRef,
  bindSearchRef,
  dropdownStyle,
  teleportTarget,
  teleportDisabled,
  placement,
  domainMenuPlacement,
  domainMenuStyle,
  domainMenuTeleportTarget,
  domainMenuTeleportDisabled,
  selectedIds,
  availableDomains,
  groupedItems,
  flatItems,
  showDomainFilter,
  showGroupHeader,
  displayName,
  isSelected,
  toggleItem,
  removeId,
  clearAll,
  selectFilterDomain,
  toggleDomainMenu,
  setQuery,
  openDropdown,
  closeDropdown,
} = useEntityMultiSelect(props, emit)
</script>

<style>
@import './entity-multi-select/styles/entity-multi-select.css';
</style>