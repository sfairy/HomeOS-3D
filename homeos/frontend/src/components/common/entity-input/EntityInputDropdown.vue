<template>
  <!-- EntityInputDropdown 实体输入下拉面板：展示实体列表，支持虚拟滚动、分组显示、域名筛选 -->
  <Teleport :to="teleportTarget" :disabled="teleportDisabled">
    <Transition name="ei-drop">
      <div
        v-if="show"
        :ref="bindDropdownEl"
        :class="['ei-dropdown', placement === 'top' && 'ei-dropdown--top']"
        :style="dropdownStyle"
      >
        <EntityInputDomainFilter
          :show="showDomainFilter"
          :selected-domain="selectedDomain"
          :menu-open="domainMenuOpen"
          :menu-placement="domainMenuPlacement"
          :menu-style="domainMenuStyle"
          :menu-teleport-target="domainMenuTeleportTarget"
          :menu-teleport-disabled="domainMenuTeleportDisabled"
          :available-domains="availableDomains"
          :domain-counts="domainCounts"
          :total-entity-count="totalEntityCount"
          :on-anchor-el="onDomainMenuAnchor"
          :on-panel-el="onDomainMenuPanel"
          @toggle-menu="emit('toggle-domain-menu')"
          @select-domain="emit('select-domain', $event)"
        />

        <!-- 实体列表主体：虚拟滚动或分组列表 -->
        <div v-if="groupedItems.length > 0" class="ei-list-body">
          <!-- 虚拟滚动列表：实体数量较多时启用，提升渲染性能 -->
          <VirtualList
            v-if="useVirtualDropdown"
            class="ei-virtual-list"
            :items="flatItems"
            :item-height="58"
            :item-gap="2"
            :virtual-threshold="120"
            :item-key="entityItemKey"
          >
            <template #default="{ item, index }">
              <div
                :class="['ei-item', { 'ei-item--active': index === activeFlatIdx }]"
                @mousedown.prevent="emit('select', item)"
                @mouseenter="emit('update:activeFlatIdx', index)"
              >
                <div class="ei-item-row">
                  <div class="ei-name">
                    <span class="ei-name-text">{{ item.name }}</span>
                    <span v-if="item.isSuggested" class="ei-suggested-badge">{{ '推荐' }}</span>
                  </div>
                  <span
                    v-if="item.entity_id && item.entity_id !== item.name"
                    class="ei-eid"
                  >{{ item.entity_id }}</span>
                </div>
              </div>
            </template>
          </VirtualList>
          <!-- 普通分组列表：实体数量较少时使用 -->
          <div v-else :class="['ei-grouped-list', !showDomainFilter && 'ei-grouped-list--compact']">
            <div v-for="group in groupedItems" :key="group.domain" class="ei-group">
              <div v-if="showGroupHeader" class="ei-group-header">
                <span class="ei-group-domain">{{ group.domain }}</span>
                <span class="ei-group-count">{{ group.items.length }}</span>
              </div>
              <div
                v-for="(item, idx) in group.items"
                :key="item.entity_id"
                :class="[
                  'ei-item',
                  {
                    'ei-item--active': isActive(item, idx, group),
                    'ei-item--suggested': item.isSuggested,
                  },
                ]"
                @mousedown.prevent="emit('select', item)"
                @mouseenter="emit('set-active', item, idx, group)"
              >
                <div class="ei-item-row">
                  <div class="ei-name">
                    <span class="ei-name-text">{{ item.name }}</span>
                    <span v-if="item.isSuggested" class="ei-suggested-badge">{{ '推荐' }}</span>
                  </div>
                  <span
                    v-if="item.entity_id && item.entity_id !== item.name"
                    class="ei-eid"
                  >{{ item.entity_id }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- 无匹配实体时的空状态提示 -->
        <div v-else class="ei-empty-hint">{{ '未找到匹配的实体' }}</div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * EntityInputDropdown - 实体输入下拉面板组件
 * 功能特性：
 * - 展示实体列表，支持按 domain 分组
 * - 支持虚拟滚动（大量实体时性能优化）
 * - 支持域名筛选器
 * - 支持键盘导航激活状态
 * - 使用 Teleport 渲染，避免被父容器裁剪
 * 依赖：
 * - VirtualList: 虚拟滚动列表组件
 * - EntityInputDomainFilter: 域名筛选器组件
 */
import type { CSSProperties, VNodeRef } from 'vue'
import VirtualList from '@/components/common/base/VirtualList.vue'
import EntityInputDomainFilter from '@/components/common/entity-input/EntityInputDomainFilter.vue'
import type { EntityInputGroup, EntityInputItem } from '@/composables/entity/useEntityInput'

const props = defineProps<{
  show: boolean
  /** Teleport 目标容器选择器或元素 */
  teleportTarget: string | HTMLElement
  teleportDisabled?: boolean
  /** 下拉面板样式对象 */
  dropdownStyle: CSSProperties
  /** 弹出方向 top/bottom */
  placement: string
  /** 是否显示域名筛选器 */
  showDomainFilter: boolean
  /** 当前选中的域名筛选 */
  selectedDomain: string
  /** 域名筛选菜单是否展开 */
  domainMenuOpen: boolean
  /** 域名菜单弹出方向 */
  domainMenuPlacement: string
  domainMenuStyle: CSSProperties
  domainMenuTeleportTarget: string | HTMLElement
  domainMenuTeleportDisabled?: boolean
  /** 可用域名列表 */
  availableDomains: string[]
  /** 各域名下的实体数量统计 */
  domainCounts: Record<string, number>
  /** 实体总数 */
  totalEntityCount: number
  /** 分组后的实体列表 */
  groupedItems: EntityInputGroup[]
  /** 扁平化的实体列表（用于虚拟滚动） */
  flatItems: EntityInputItem[]
  /** 是否使用虚拟滚动 */
  useVirtualDropdown: boolean
  /** 是否显示分组标题 */
  showGroupHeader: boolean
  /** 虚拟滚动列表中当前激活项索引 */
  activeFlatIdx: number
  onDomainMenuAnchor?: (el: HTMLElement | null) => void
  onDomainMenuPanel?: (el: HTMLElement | null) => void
  onDropdownEl?: (el: HTMLElement | null) => void
  /** 实体项 key 生成函数 */
  entityItemKey: (item: EntityInputItem) => string
  /** 判断实体项是否激活的函数 */
  isActive: (item: EntityInputItem, idx: number, group: EntityInputGroup) => boolean
}>()

const emit = defineEmits<{
  select: [item: EntityInputItem]
  'set-active': [item: EntityInputItem, idx: number, group: EntityInputGroup]
  'update:activeFlatIdx': [index: number]
  'toggle-domain-menu': []
  'select-domain': [domain: string]
}>()

/** 下拉面板元素引用绑定回调 */
const bindDropdownEl: VNodeRef = (el) => {
  props.onDropdownEl?.(el instanceof HTMLElement ? el : null)
}
</script>
