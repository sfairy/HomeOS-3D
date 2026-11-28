<template>
  <div class="asset-header">
    <div class="asset-header__left">
      <div class="asset-header__badge asset-header__badge--blue">
        <FolderOpen class="w-3.5 h-3.5" />
      </div>
      <template v-for="(crumb, idx) in breadcrumbs" :key="crumb.path">
        <button
          type="button"
          class="asset-header__crumb"
          :class="{ 'asset-header__crumb--active': idx === breadcrumbs.length - 1 }"
          @click="navigateTo(crumb.path)"
        >
          {{ crumb.name }}
        </button>
        <span v-if="idx < breadcrumbs.length - 1" class="asset-header__crumb-sep">/</span>
      </template>
    </div>

    <div class="asset-header__actions">
      <button
        type="button"
        class="asset-header__btn asset-header__btn--upload"
        :title="'上传背景图到当前目录'"
        :aria-label="'上传背景图到当前目录'"
        @click="triggerUpload"
      >
        <Upload class="w-4 h-4" />
      </button>
      <!-- 隐藏的文件输入不能放进 <button type="button">：button 内不允许交互式子元素 -->
      <input :ref="setFileInput" type="file" multiple class="hidden" @change="onUpload" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Upload, FolderOpen } from '@lucide/vue'

// 组件属性：由父组件通过 useAssetManager 注入
defineProps<{
  /** 面包屑数据：name 显示名 + path 跳转路径 */
  breadcrumbs: Array<{ name: string; path: string }>
  /** 注入文件输入 DOM 引用的回调 */
  setFileInput: (el: Element | import('vue').ComponentPublicInstance | null) => void
  navigateTo: (path: string) => void
  triggerUpload: () => void
  onUpload: (e: Event) => void
}>()
</script>
