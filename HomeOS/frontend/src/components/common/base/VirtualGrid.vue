/**
 * @file VirtualGrid.vue
 * @module components/common/base
 * @description 按行虚拟化的网格组件。将传入的 items 按 columns 切分为多行，
 *  再交给 VirtualList 进行行级虚拟滚动，适用于大量条目的网格场景。
 *  依赖：VirtualList 子组件、vue computed。
 */
<template>
  <VirtualList
    :items="rows"
    :item-height="rowHeight"
    :item-gap="rowGap"
    :overscan="overscan"
    :virtual-threshold="virtualThreshold"
    :container-class="containerClass"
    :item-key="(row, index) => row.join('|') || index"
  >
    <!-- 行插槽：将单行数据透传给父组件渲染 -->
    <template #default="{ item: row, index: rowIndex }">
      <slot name="row" :row="row" :row-index="rowIndex" />
    </template>
    <template #empty>
      <slot name="empty" />
    </template>
  </VirtualList>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 VirtualGrid 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { computed } from 'vue'
import VirtualList from '@/components/common/base/VirtualList.vue'

/**
 * 将一维列表按列数切分为二维行数组。
 * @param items 一维列表
 * @param columns 每行列数（至少 1）
 * @returns 二维数组，每个子数组为一行的列数据
 */
function chunkIntoRows(items, columns) {
  const cols = Math.max(1, Number(columns) || 1)
  const rows = []
  for (let i = 0; i < items.length; i += cols) {
    rows.push(items.slice(i, i + cols))
  }
  return rows
}

const props = defineProps({
  /** 全部条目（一维） */
  items: { type: Array, default: () => [] },
  /** 每行列数 */
  columns: { type: Number, default: 4 },
  /** 行高（像素） */
  rowHeight: { type: Number, default: 132 },
  /** 行间距（含网格行 padding-bottom 等） */
  rowGap: { type: Number, default: 0 },
  /** 预渲染行数（视口外上下各渲染的行数） */
  overscan: { type: Number, default: 4 },
  /** 启用虚拟滚动的条目阈值 */
  virtualThreshold: { type: Number, default: 24 },
  /** 容器自定义类名 */
  containerClass: { type: String, default: '' },
})

// 将一维 items 切分为二维行，供 VirtualList 消费
const rows = computed(() => chunkIntoRows(props.items, props.columns))
</script>