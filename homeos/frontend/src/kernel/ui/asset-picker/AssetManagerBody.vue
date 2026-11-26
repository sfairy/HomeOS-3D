<template>
  <div class="asset-body">
    <div v-if="loading && items.length === 0" class="asset-body__state">
      <Loader2 class="w-8 h-8 amb-icon-info animate-spin" />
      <p class="text-xs amb-text-muted mt-3">{{ '加载中…' }}</p>
    </div>

    <div v-else-if="sortedItems.length === 0" class="asset-body__state">
      <div class="asset-body__empty-icon">
        <FolderOpen class="w-12 h-12" />
      </div>
      <p class="text-sm amb-text-muted mt-2">{{ '还没有背景图，点右上角上传' }}</p>
    </div>

    <VirtualGrid
      v-if="useVirtualGrid"
      :items="sortedItems"
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
            @click="onItemClick(item)"
            @copy="copyPath(item)"
            @delete="deleteItem(item)"
            @preview-error="onPreviewError"
          />
        </div>
      </template>
    </VirtualGrid>

    <div v-else class="asset-grid">
      <AssetGridItem
        v-for="item in sortedItems"
        :key="item.name"
        :item="item"
        :is-picker="isPicker"
        @click="onItemClick(item)"
        @copy="copyPath(item)"
        @delete="deleteItem(item)"
        @preview-error="onPreviewError"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Loader2, FolderOpen } from '@lucide/vue'
import VirtualGrid from '@/kernel/ui/primitives/VirtualGrid.vue'
import AssetGridItem from '@/kernel/ui/AssetGridItem.vue'
import type { AssetItem } from './useAssetManager'

// 组件属性：由父组件通过 useAssetManager 注入，包含渲染所需的状态与回调
defineProps<{
  loading: boolean
  /** 当前目录下全部条目（未排序） */
  items: AssetItem[]
  /** 排序后的条目列表（目录优先 + 名称升序） */
  sortedItems: AssetItem[]
  /** 是否启用虚拟网格（大数据量优化） */
  useVirtualGrid: boolean
  gridColumns: number
  /** 网格行高（像素） */
  gridRowHeight: number
  /** 是否为选择器模式（点击文件即触发 select 事件） */
  isPicker?: boolean
  canPreview: (item: AssetItem) => boolean
  /** 预览失败时的回调（用于记录失败条目避免重复尝试） */
  onPreviewError: (name: string) => void
  /** 条目点击回调（目录则进入，文件则按 picker 模式触发选择） */
  onItemClick: (item: AssetItem) => void
  /** 复制条目路径回调 */
  copyPath: (item: AssetItem) => void
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
