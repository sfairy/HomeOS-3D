/**
 * @file AssetManagerBody.vue
 * @module components/common/asset-manager
 * @description 资源管理器主体区域组件。负责根据当前视图模式（网格/列表）和加载状态
 *  渲染资源条目，并处理条目的点击、复制、删除等交互事件。
 *  依赖：VirtualGrid（虚拟网格）、AssetGridItem（网格单元）、AssetManagerListItem（列表项）、
 *  useAssetManager 中的 AssetItem 类型定义。
 */
<template>
  <div class="asset-body">
    <!-- 加载中且尚无数据时显示加载指示器 -->
    <div v-if="loading && items.length === 0" class="asset-body__state">
      <Loader2 class="w-8 h-8 amb-icon-info animate-spin" />
      <p class="text-xs amb-text-muted mt-3">{{ '加载中…' }}</p>
    </div>

    <!-- 非加载状态但无匹配项时显示空态 -->
    <div v-else-if="filteredItems.length === 0" class="asset-body__state">
      <div class="asset-body__empty-icon">
        <FolderOpen class="w-12 h-12" />
      </div>
      <p class="text-sm amb-text-muted mt-2">{{ '空空如也，或者没有匹配的项目' }}</p>
      <!-- 存在搜索关键词时给出进一步提示 -->
      <p v-if="searchQuery" class="text-xs amb-text-muted mt-1">{{ '试试其他关键词' }}</p>
    </div>

    <!-- 虚拟网格视图：当数据量较大且非嵌入模式时启用，提升渲染性能 -->
    <VirtualGrid
      v-if="viewMode === 'grid' && useVirtualGrid"
      :items="filteredItems"
      :columns="gridColumns"
      :row-height="gridRowHeight"
      :row-gap="10"
      container-class="asset-grid-virtual"
    >
      <template #row="{ row }">
        <div class="asset-grid-row">
          <AssetGridItem
            v-for="item in row"
            :key="item.name"
            :item="item"
            :is-picker="isPicker"
            :type="type"
            @click="onItemClick(item)"
            @copy="copyPath(item)"
            @delete="deleteItem(item)"
            @preview-error="onPreviewError"
          />
        </div>
      </template>
    </VirtualGrid>

    <!-- 普通网格视图：数据量较少或嵌入模式时使用 -->
    <div v-else-if="viewMode === 'grid'" class="asset-grid">
      <AssetGridItem
        v-for="item in filteredItems"
        :key="item.name"
        :item="item"
        :is-picker="isPicker"
        :type="type"
        @click="onItemClick(item)"
        @copy="copyPath(item)"
        @delete="deleteItem(item)"
        @preview-error="onPreviewError"
      />
    </div>

    <!-- 列表视图：以纵向列表形式展示条目，附带预览能力 -->
    <div v-else class="asset-list">
      <AssetManagerListItem
        v-for="item in filteredItems"
        :key="item.name"
        :item="item"
        :can-preview="canPreview"
        :is-image="isImage"
        :on-preview-error="onPreviewError"
        @click="onItemClick(item)"
        @copy="copyPath(item)"
        @delete="deleteItem(item)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 所属模块：frontend/components
 * 职责：实现 AssetManagerBody 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { Loader2, FolderOpen } from '@lucide/vue'
import VirtualGrid from '@/components/common/base/VirtualGrid.vue'
import AssetGridItem from '@/components/common/AssetGridItem.vue'
import AssetManagerListItem from './AssetManagerListItem.vue'
import type { AssetItem } from './useAssetManager'

// 组件属性：由父组件通过 useAssetManager 注入，包含渲染所需的状态与回调
defineProps<{
  /** 是否处于加载中 */
  loading: boolean
  /** 当前目录下全部条目（未经过滤） */
  items: AssetItem[]
  /** 经搜索过滤并排序后的条目列表 */
  filteredItems: AssetItem[]
  /** 当前搜索关键词 */
  searchQuery: string
  /** 视图模式：grid 网格 / list 列表 */
  viewMode: 'grid' | 'list'
  /** 是否启用虚拟网格（大数据量优化） */
  useVirtualGrid: boolean
  /** 网格列数 */
  gridColumns: number
  /** 网格行高（像素） */
  gridRowHeight: number
  /** 是否为选择器模式（点击文件即触发 select 事件） */
  isPicker?: boolean
  /** 资源类型：icon 图标 / floorplan 平面图等 */
  type: string
  /** 判断指定条目是否可预览 */
  canPreview: (item: AssetItem) => boolean
  /** 判断指定条目是否为图片类型 */
  isImage: (item: AssetItem) => boolean
  /** 预览失败时的回调（用于记录失败条目避免重复尝试） */
  onPreviewError: (name: string) => void
  /** 条目点击回调（目录则进入，文件则按 picker 模式触发选择） */
  onItemClick: (item: AssetItem) => void
  /** 复制条目路径回调 */
  copyPath: (item: AssetItem) => void
  /** 删除条目回调 */
  deleteItem: (item: AssetItem) => void
}>()
</script>

<style scoped>
/* ── 作用域语义色类（替代 Tailwind 颜色工具类） ── */
.amb-icon-info {
  color: var(--set-info, #7dd3fc);
}
.amb-text-muted {
  color: var(--set-text-secondary, rgba(255, 255, 255, 0.55));
}
</style>