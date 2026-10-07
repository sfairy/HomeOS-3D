/**
 * @file AssetManagerListItem.vue
 * @module components/common/asset-manager
 * @description 资源管理器列表视图下的单个条目组件。负责渲染条目图标/缩略图、名称、类型标签，
 *  以及复制、删除等操作按钮。条目类型支持文件与目录。
 *  依赖：@lucide/vue 图标、AssetItem 类型。
 */
<template>
  <!-- 条目根容器：点击触发 click 事件（进入目录或选择文件） -->
  <div class="asset-list-item group" @click="emit('click')">
    <div class="asset-list-item__icon">
      <!-- 文件且可预览且为图片：显示缩略图，加载失败时回退到错误图标 -->
      <img
        v-if="item.type === 'file' && canPreview(item) && isImage(item)"
        :src="item.url"
        :alt="`${item.name} 预览`"
        class="asset-list-item__thumb"
        @error="onPreviewError(item.name)"
      />
      <!-- 目录：显示文件夹图标 -->
      <FolderOpen v-else-if="item.type === 'dir'" class="w-6 h-6 amli-icon-info" />
      <!-- 其他文件：显示图片文件占位图标 -->
      <FileImage v-else class="w-6 h-6 amli-icon-muted" />
    </div>

    <div class="asset-list-item__info">
      <span class="asset-list-item__name">{{ item.name }}</span>
      <!-- 类型标签：目录显示"文件夹"，文件显示"文件" -->
      <span class="asset-list-item__meta">{{ item.type === 'dir' ? '文件夹' : '文件' }}</span>
    </div>

    <div class="asset-list-item__actions">
      <!-- 复制按钮：仅文件且存在 URL 时显示，使用 .stop 避免冒泡触发条目点击 -->
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
      <!-- 删除按钮：危险操作，所有条目均显示 -->
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
/**
 * 职责：实现 AssetManagerListItem 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { FolderOpen, FileImage, Copy, Trash2 } from '@lucide/vue'
import type { AssetItem } from './useAssetManager'

// 组件属性
defineProps<{
  /** 当前条目数据 */
  item: AssetItem
  /** 判断条目是否可预览 */
  canPreview: (item: AssetItem) => boolean
  /** 判断条目是否为图片类型 */
  isImage: (item: AssetItem) => boolean
  /** 预览失败回调，用于记录失败条目 */
  onPreviewError: (name: string) => void
}>()

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