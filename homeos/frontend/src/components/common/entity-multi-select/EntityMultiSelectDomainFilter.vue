<!--
  组件文件：EntityMultiSelectDomainFilter.vue
  所属模块：frontend/src/components/common/entity-multi-select
  组件职责：实体多选下拉面板的域名筛选条（与 EntityInputDomainFilter 结构相似但更精简）。
    左：「全部类型/域」按钮 + Teleport 菜单；右：「已选 N」计数展示；
    菜单展开/折叠与菜单项点击通过 props 传入的 toggleDomainMenu / selectFilterDomain 回调执行。
  主要 props：
    - props.domainMenuAnchor / domainMenuPanelRef：函数式 ref 绑定（供父级定位）；
      props.showDomainFilter / selectedDomain / domainMenuOpen / domainMenuPlacement /
      domainMenuStyle / domainMenuTeleportTarget / domainMenuTeleportDisabled：显隐与定位；
      props.availableDomains：可用域名列表；props.selectedCount：已选实体数量（展示文案）；
      props.selectFilterDomain(domain) / toggleDomainMenu()：父级回调。
  依赖关系：@lucide/vue ChevronDown 图标；无 stores 或 composables。
-->
<template>
  <div v-if="showDomainFilter" class="ems-filter-bar">
    <div class="ems-domain-dropdown" :ref="domainMenuAnchor">
      <button
        type="button"
        class="ems-domain-btn"
        :class="{ 'ems-domain-btn--active': selectedDomain }"
        @click.prevent.stop="toggleDomainMenu"
      >
        <span>{{ selectedDomain || '全部类型' }}</span>
        <ChevronDown class="w-3 h-3" :class="{ 'ems-domain-chev--open': domainMenuOpen }" />
      </button>
      <Teleport :to="domainMenuTeleportTarget" :disabled="domainMenuTeleportDisabled">
        <Transition name="ems-drop">
          <div
            v-if="domainMenuOpen"
            :ref="domainMenuPanelRef"
            :class="['ems-domain-menu', domainMenuPlacement === 'top' && 'ems-domain-menu--top']"
            :style="domainMenuStyle"
          >
            <div
              :class="['ems-domain-item', !selectedDomain && 'ems-domain-item--active']"
              @mousedown.prevent.stop="selectFilterDomain('')"
            >
              {{ '全部类型' }}
            </div>
            <div
              v-for="dom in availableDomains"
              :key="dom"
              :class="['ems-domain-item', selectedDomain === dom && 'ems-domain-item--active']"
              @mousedown.prevent.stop="selectFilterDomain(dom)"
            >
              {{ dom }}
            </div>
          </div>
        </Transition>
      </Teleport>
    </div>
    <span class="ems-count">{{ `已选 ${selectedCount}` }}</span>
  </div>
</template>

<script setup>
/**
 * @file EntityMultiSelectDomainFilter.vue
 * @module common/entity-multi-select
 * @description 实体多选下拉面板的域名筛选器
 *  职责：
 *    - 渲染「全部类型 / 各域」下拉按钮，点击切换域名筛选；
 *    - 通过 Teleport 渲染菜单面板，由父级负责定位；
 *    - 展示已选实体数量。
 *  依赖：@lucide/vue ChevronDown 图标。
 */
import { ChevronDown } from '@lucide/vue'

defineProps({
  /** 触发器元素 ref 绑定回调（供父级定位使用） */
  domainMenuAnchor: { type: Function, required: true },
  /** 菜单面板元素 ref 绑定回调（供父级定位使用） */
  domainMenuPanelRef: { type: Function, required: true },
  /** 是否显示筛选条 */
  showDomainFilter: { type: Boolean, required: true },
  /** 当前选中的域名（空字符串表示全部） */
  selectedDomain: { type: String, required: true },
  /** 域名菜单是否展开 */
  domainMenuOpen: { type: Boolean, required: true },
  /** 域名菜单弹出方向（top/bottom） */
  domainMenuPlacement: { type: String, required: true },
  /** 域名菜单定位样式 */
  domainMenuStyle: { type: Object, required: true },
  /** 域名菜单 Teleport 目标 */
  domainMenuTeleportTarget: { type: [String, Object], required: true },
  /** 是否禁用域名菜单 Teleport */
  domainMenuTeleportDisabled: { type: Boolean, default: false },
  /** 可用域名列表 */
  availableDomains: { type: Array, required: true },
  /** 已选实体数量 */
  selectedCount: { type: Number, required: true },
  /** 选择域名筛选回调（空字符串表示全部） */
  selectFilterDomain: { type: Function, required: true },
  /** 切换域名菜单展开/收起回调 */
  toggleDomainMenu: { type: Function, required: true },
})
</script>
