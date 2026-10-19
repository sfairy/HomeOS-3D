/** 以及复制、删除等操作按钮。条目类型支持文件与目录。 */
<template>
  <!-- 条目根容器：主操作（进入目录 / 选择文件）是里面那个 button，复制与删除是它的同级按钮。 -->
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
    </button>

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
import { computed } from 'vue'
import { FolderOpen, FileImage, Copy, Trash2 } from '@lucide/vue'
import type { AssetItem } from './useAssetManager'

// 组件属性
const props = defineProps<{
  /** 当前条目数据 */
  item: AssetItem
  /** 判断条目是否可预览 */
  canPreview: (item: AssetItem) => boolean
  /** 判断条目是否为图片类型 */
  isImage: (item: AssetItem) => boolean
  /** 预览失败回调，用于记录失败条目 */
  onPreviewError: (name: string) => void
}>()

/**
 * 主操作按钮的无障碍名称：图标 + 名称的视觉组合对读屏无意义，
 * 显式给出「进入文件夹 X / 选择文件 X」，键盘与读屏用户才知道这一行能干什么。
 */
const mainLabel = computed(() =>
  props.item.type === 'dir'
    ? `进入文件夹 ${props.item.name}`
    : `选择文件 ${props.item.name}`,
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
  color: var(--hos-color-info-text);
}
.amli-icon-muted {
  color: var(--hos-fg-2);
}
</style>