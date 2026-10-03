<!--
  组件文件：EntityInputDomainFilter.vue
  所属模块：frontend/src/components/common/entity-input
  组件职责：实体输入下拉面板的域名筛选按钮条。渲染一个「全部类型 / 当前域」按钮，点击 emit toggle-menu；
    菜单面板由 Teleport 渲染（父级负责计算定位 menuStyle 与 placement 方向）；
    菜单项包括「全部类型 + totalEntityCount」与各 availableDomains + 对应计数 domainCounts；
    选中某项 emit select-domain(domain) 回传父级。
  主要 props / emits：
    - props.show / selectedDomain / menuOpen / menuPlacement / menuStyle：显示与定位；
      props.menuTeleportTarget / menuTeleportDisabled：Teleport 目标开关；
      props.availableDomains / domainCounts / totalEntityCount：域名列表与计数；
      props.onAnchorEl(el) / onPanelEl(el)：触发器/面板 DOM 回填给父级计算定位。
    - emits：toggle-menu（用户点击筛选按钮）；select-domain(domain)（选中某个域或空串全部）。
  依赖关系：仅 vue CSSProperties/VNodeRef 类型；无 lucide/icon（用 inline SVG chevron）、无 store/composable。
-->
<template>
  <div v-if="show" class="ei-filter-bar">
    <div class="ei-domain-dropdown" :ref="bindAnchor">
      <button
        class="ei-domain-btn"
        :class="{ 'ei-domain-btn--active': selectedDomain }"
        @click.prevent.stop="emit('toggle-menu')"
      >
        <span class="ei-domain-btn-label">{{ selectedDomain || '全部类型' }}</span>
        <svg
          class="ei-domain-chev"
          :class="{ 'ei-domain-chev--open': menuOpen }"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <Teleport :to="menuTeleportTarget" :disabled="menuTeleportDisabled">
        <Transition name="ei-drop">
          <div
            v-if="menuOpen"
            :ref="bindPanel"
            :class="['ei-domain-menu', menuPlacement === 'top' && 'ei-domain-menu--top']"
            :style="menuStyle"
          >
            <div
              :class="['ei-domain-item', !selectedDomain ? 'ei-domain-item--active' : '']"
              @mousedown.prevent.stop="emit('select-domain', '')"
            >
              <span>{{ '全部类型' }}</span>
              <span class="ei-domain-item-count">{{ totalEntityCount }}</span>
            </div>
            <div class="ei-domain-menu-divider" />
            <div
              v-for="dom in availableDomains"
              :key="dom"
              :class="['ei-domain-item', selectedDomain === dom ? 'ei-domain-item--active' : '']"
              @mousedown.prevent.stop="emit('select-domain', dom)"
            >
              <span>{{ dom }}</span>
              <span class="ei-domain-item-count">{{ domainCounts[dom] || 0 }}</span>
            </div>
          </div>
        </Transition>
      </Teleport>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file EntityInputDomainFilter.vue
 * @module common/entity-input
 * @description 实体输入下拉面板的域名筛选器
 *  职责：
 *    - 渲染「全部类型 / 各域」下拉按钮，点击切换域名筛选；
 *    - 通过 Teleport 渲染菜单面板，由父级负责定位计算；
 *    - 各域展示对应实体数量统计。
 *  依赖：vue 的 CSSProperties/VNodeRef 类型。
 */
import type { CSSProperties, VNodeRef } from 'vue'

const props = defineProps<{
  /** 是否显示筛选条 */
  show: boolean
  /** 当前选中的域名（空字符串表示全部） */
  selectedDomain: string
  /** 域名菜单是否展开 */
  menuOpen: boolean
  /** 域名菜单弹出方向（top/bottom） */
  menuPlacement: string
  /** 域名菜单定位样式 */
  menuStyle: CSSProperties
  /** 域名菜单 Teleport 目标 */
  menuTeleportTarget: string | HTMLElement
  /** 是否禁用域名菜单 Teleport */
  menuTeleportDisabled?: boolean
  /** 可用域名列表 */
  availableDomains: string[]
  /** 各域名对应的实体数量 */
  domainCounts: Record<string, number>
  /** 实体总数（用于「全部类型」展示） */
  totalEntityCount: number
  /** 触发器元素引用回填回调（供父级定位使用） */
  onAnchorEl?: (el: HTMLElement | null) => void
  /** 菜单面板元素引用回填回调（供父级定位使用） */
  onPanelEl?: (el: HTMLElement | null) => void
}>()

const emit = defineEmits<{
  /** 切换域名菜单展开/收起 */
  'toggle-menu': []
  /** 选择某个域名（空字符串表示全部） */
  'select-domain': [domain: string]
}>()

/**
 * 触发器元素 ref 绑定函数：将 DOM 元素回填给父级
 * @param {Element|ComponentPublicInstance|null} el Vue 透传的元素引用
 */
const bindAnchor: VNodeRef = (el) => {
  props.onAnchorEl?.(el instanceof HTMLElement ? el : null)
}

/**
 * 菜单面板元素 ref 绑定函数：将 DOM 元素回填给父级
 * @param {Element|ComponentPublicInstance|null} el Vue 透传的元素引用
 */
const bindPanel: VNodeRef = (el) => {
  props.onPanelEl?.(el instanceof HTMLElement ? el : null)
}
</script>
