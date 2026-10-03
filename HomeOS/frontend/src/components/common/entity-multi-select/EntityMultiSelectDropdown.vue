<template>
  <!-- EntityMultiSelectDropdown 多选下拉面板：支持多选实体、域名筛选、搜索过滤 -->
  <Teleport :to="teleportTarget" :disabled="teleportDisabled">
    <Transition name="ems-drop">
      <div
        v-if="showDropdown"
        :ref="dropdownRef"
        :class="['ems-dropdown', placement === 'top' && 'ems-dropdown--top']"
        :style="dropdownStyle"
      >
        <div class="ems-search-wrap">
          <Search class="ems-search-icon w-3.5 h-3.5" />
          <input
            :ref="searchRef"
            :value="query"
            type="text"
            class="ems-search"
            :placeholder="'搜索名称或 entity_id'"
            @input="onSearchInput"
            @keydown.escape.prevent="closeDropdown"
          />
        </div>

        <EntityMultiSelectDomainFilter
          :domain-menu-anchor="domainMenuAnchor"
          :domain-menu-panel-ref="domainMenuPanelRef"
          :show-domain-filter="showDomainFilter"
          :selected-domain="selectedDomain"
          :domain-menu-open="domainMenuOpen"
          :domain-menu-placement="domainMenuPlacement"
          :domain-menu-style="domainMenuStyle"
          :domain-menu-teleport-target="domainMenuTeleportTarget"
          :domain-menu-teleport-disabled="domainMenuTeleportDisabled"
          :available-domains="availableDomains"
          :selected-count="selectedIds.length"
          :select-filter-domain="selectFilterDomain"
          :toggle-domain-menu="toggleDomainMenu"
        />

        <EntityMultiSelectItemList
          :flat-items="flatItems"
          :grouped-items="groupedItems"
          :show-group-header="showGroupHeader"
          :is-selected="isSelected"
          :toggle-item="toggleItem"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
/**
 * EntityMultiSelectDropdown - 实体多选下拉面板组件
 * 功能特性：
 * - 支持多选实体
 * - 支持域名筛选
 * - 支持搜索过滤
 * - 支持推荐实体高亮
 * - 分组显示实体
 * 依赖：
 * - EntityMultiSelectDomainFilter: 域名筛选组件
 * - VirtualList: 虚拟滚动列表
 */
import { Search } from '@lucide/vue'
import EntityMultiSelectDomainFilter from './EntityMultiSelectDomainFilter.vue'
import EntityMultiSelectItemList from './EntityMultiSelectItemList.vue'

const props = defineProps({
  /** Teleport 目标容器 */
  teleportTarget: { type: [String, Object], required: true },
  /** 是否禁用 Teleport */
  teleportDisabled: { type: Boolean, default: false },
  /** 是否显示下拉面板 */
  showDropdown: { type: Boolean, required: true },
  /** 下拉面板元素 ref 绑定回调（供父级定位使用） */
  dropdownRef: { type: Function, required: true },
  /** 弹出方向（top/bottom） */
  placement: { type: String, required: true },
  /** 下拉面板定位样式 */
  dropdownStyle: { type: Object, required: true },
  /** 搜索输入框 ref 绑定回调 */
  searchRef: { type: Function, required: true },
  /** 当前搜索关键词 */
  query: { type: String, required: true },
  /** 设置搜索关键词的回调 */
  setQuery: { type: Function, required: true },
  /** 关闭下拉面板的回调 */
  closeDropdown: { type: Function, required: true },
  /** 域名菜单触发器 ref 绑定回调 */
  domainMenuAnchor: { type: Function, required: true },
  /** 域名菜单面板 ref 绑定回调 */
  domainMenuPanelRef: { type: Function, required: true },
  /** 是否显示域名筛选 */
  showDomainFilter: { type: Boolean, required: true },
  /** 当前选中的域名（空字符串表示全部） */
  selectedDomain: { type: String, required: true },
  /** 域名菜单是否展开 */
  domainMenuOpen: { type: Boolean, required: true },
  /** 域名菜单弹出方向 */
  domainMenuPlacement: { type: String, required: true },
  /** 域名菜单定位样式 */
  domainMenuStyle: { type: Object, required: true },
  /** 域名菜单 Teleport 目标 */
  domainMenuTeleportTarget: { type: [String, Object], required: true },
  /** 是否禁用域名菜单 Teleport */
  domainMenuTeleportDisabled: { type: Boolean, default: false },
  /** 可用域名列表 */
  availableDomains: { type: Array, required: true },
  /** 已选实体 ID 列表 */
  selectedIds: { type: Array, required: true },
  /** 选择域名筛选回调 */
  selectFilterDomain: { type: Function, required: true },
  /** 切换域名菜单展开/收起回调 */
  toggleDomainMenu: { type: Function, required: true },
  /** 扁平化实体列表（虚拟滚动用） */
  flatItems: { type: Array, required: true },
  /** 分组实体列表（普通渲染用） */
  groupedItems: { type: Array, required: true },
  /** 是否显示分组标题 */
  showGroupHeader: { type: Boolean, required: true },
  /** 判断实体是否选中的函数 */
  isSelected: { type: Function, required: true },
  /** 切换实体选中状态的函数 */
  toggleItem: { type: Function, required: true },
})

/**
 * 搜索输入回调：将输入值通过 setQuery 回写给父级，由父级统一驱动搜索过滤
 * @param {Event} event input 事件对象
 */
function onSearchInput(event) {
  props.setQuery(event.target.value)
}
</script>
