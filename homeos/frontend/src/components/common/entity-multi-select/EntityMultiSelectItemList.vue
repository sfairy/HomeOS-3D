<template>
  <!-- EntityMultiSelectItemList 实体候选列表：大列表走虚拟滚动，小列表保留分组渲染 -->
  <div v-if="flatItems.length" class="ems-list-body">
    <!-- 虚拟滚动：实体数超阈值时启用，避免大实例（数千实体）下拉一次性渲染全部 DOM -->
    <VirtualList
      v-if="useVirtualList"
      class="ems-list ems-list--virtual"
      :items="flatItems"
      :item-height="52"
      :item-gap="2"
      :virtual-threshold="VIRTUAL_THRESHOLD"
    >
      <template #default="{ item }">
        <div
          :class="['ems-item', isSelected(item.entity_id) && 'ems-item--selected']"
          @mousedown.prevent="toggleItem(item.entity_id)"
        >
          <span :class="['ems-check', isSelected(item.entity_id) && 'ems-check--on']">
            <Check v-if="isSelected(item.entity_id)" class="w-3 h-3" />
          </span>
          <div class="ems-item-row">
            <span class="ems-item-name">{{ item.name }}</span>
            <span
              v-if="item.entity_id && item.entity_id !== item.name"
              class="ems-item-id"
            >{{ item.entity_id }}</span>
          </div>
          <span v-if="isSelected(item.entity_id)" class="ems-item-badge">{{ '已选' }}</span>
        </div>
      </template>
    </VirtualList>
    <!-- 分组列表：实体数较少时保留域分组头 -->
    <div v-else class="ems-list">
      <div v-for="group in groupedItems" :key="group.domain" class="ems-group">
        <div v-if="showGroupHeader" class="ems-group-header">
          <span>{{ group.domain }}</span>
          <span>{{ group.items.length }}</span>
        </div>
        <div
          v-for="item in group.items"
          :key="item.entity_id"
          :class="['ems-item', isSelected(item.entity_id) && 'ems-item--selected']"
          @mousedown.prevent="toggleItem(item.entity_id)"
        >
          <span :class="['ems-check', isSelected(item.entity_id) && 'ems-check--on']">
            <Check v-if="isSelected(item.entity_id)" class="w-3 h-3" />
          </span>
          <div class="ems-item-row">
            <span class="ems-item-name">{{ item.name }}</span>
            <span
              v-if="item.entity_id && item.entity_id !== item.name"
              class="ems-item-id"
            >{{ item.entity_id }}</span>
          </div>
          <span v-if="isSelected(item.entity_id)" class="ems-item-badge">{{ '已选' }}</span>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="ems-empty">{{ '未找到匹配的实体' }}</div>
</template>

<script setup>
/**
 * EntityMultiSelectItemList - 实体候选列表组件
 * 功能特性：
 * - 实体数超过 VIRTUAL_THRESHOLD 时切换 VirtualList 虚拟滚动（平铺，无分组头）
 * - 小列表保留按域分组渲染
 * - 点击切换选中状态
 */
import { computed } from 'vue'
import { Check } from '@lucide/vue'
import VirtualList from '@/components/common/base/VirtualList.vue'

const VIRTUAL_THRESHOLD = 120

const props = defineProps({
  flatItems: { type: Array, required: true },
  groupedItems: { type: Array, required: true },
  showGroupHeader: { type: Boolean, required: true },
  isSelected: { type: Function, required: true },
  toggleItem: { type: Function, required: true },
})

const useVirtualList = computed(() => props.flatItems.length > VIRTUAL_THRESHOLD)
</script>
