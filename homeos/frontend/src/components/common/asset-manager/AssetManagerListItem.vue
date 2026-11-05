<template>
  <div class="asset-list-item group">
    <!--
      主操作必须是一个**真的 button**：原来整行的 @click 挂在 div 上，键盘完全到不了
      （Tab 只会落到右边那两个操作按钮，而它们在鼠标悬停前还是 opacity:0 的）。
      不能把这一层 div 直接改成 button —— 里面还嵌着复制 / 删除两个 button，
      HTML 不允许按钮嵌按钮（浏览器会把它拆成两个兄弟节点）。
    -->
    <button
      type="button"
      class="asset-list-item__main"
      :aria-label="mainLabel"
      @click="emit('click')"
    >
      <div class="asset-list-item__icon">
        <img
          v-if="item.type === 'file' && canPreview(item) && isImage(item)"
          :src="item.url"
          :alt="`${item.name} 预览`"
          class="asset-list-item__thumb"
          @error="onPreviewError(item.name)"
        />
        <FolderOpen v-else-if="item.type === 'dir'" class="w-6 h-6 amli-icon-info" />
        <FileImage v-else class="w-6 h-6 amli-icon-muted" />
      </div>

      <div class="asset-list-item__info">
        <span class="asset-list-item__name">{{ item.name }}</span>
        <span class="asset-list-item__meta">{{ item.type === 'dir' ? '文件夹' : '文件' }}</span>
      </div>
    </button>

    <div class="asset-list-item__actions">
      <button
        v-if="item.type === 'file' && item.url"
        type="button"
        class="asset-list-action-btn"
        :aria-label="'复制'"
        @click.stop="emit('copy')"
        :title="'复制'"
      >
        <Copy class="w-3 h-3" />
      </button>
      <button
        type="button"
        class="asset-list-action-btn asset-list-action-btn--danger"
        :aria-label="'删除'"
        @click.stop="emit('delete')"
        :title="'删除'"
      >
        <Trash2 class="w-3 h-3" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { FolderOpen, FileImage, Copy, Trash2 } from '@lucide/vue'
import type { AssetItem } from './useAssetManager'

const props = defineProps<{
  item: AssetItem
  canPreview: (item: AssetItem) => boolean
  isImage: (item: AssetItem) => boolean
  /** 预览失败回调，用于记录失败条目 */
  onPreviewError: (name: string) => void
}>()

/**
 * 主操作按钮的无障碍名称：图标 + 名称的视觉组合对读屏无意义，
 * 显式给出「进入文件夹 X / 选择文件 X」，键盘与读屏用户才知道这一行能干什么。
 */
const mainLabel = computed(() =>
  props.item.type === 'dir' ? `进入文件夹 ${props.item.name}` : `选择文件 ${props.item.name}`,
)

// 事件定义：click 进入目录或选择文件；copy 复制路径；delete 删除条目
const emit = defineEmits<{
  click: []
  copy: []
  delete: []
}>()
</script>

<style scoped>
/* ── 作用域语义色类（替代 Tailwind 颜色工具类） ── */
.amli-icon-info {
  color: var(--set-info, #7dd3fc);
}
.amli-icon-muted {
  color: var(--set-text-secondary, rgba(255, 255, 255, 0.55));
}
</style>