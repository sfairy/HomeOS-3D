/**
 * @file AssetManagerHeader.vue
 * @module components/common/asset-manager
 * @description 资源管理器头部组件。渲染面包屑导航、搜索框、上传/新建文件夹按钮以及
 *  网格/列表视图切换控件，是用户与资源管理器交互的主要入口。
 *  依赖：@lucide/vue 图标库；父组件注入的 setSearchInput/setFileInput ref 回调。
 */
<template>
  <div class="asset-header">
    <!-- 左侧：类型徽标 + 面包屑导航 -->
    <div class="asset-header__left">
      <div class="asset-header__badge" :class="type === 'icon' ? '' : 'asset-header__badge--blue'">
        <Sparkles v-if="type === 'icon'" class="w-3.5 h-3.5" />
        <FolderOpen v-else class="w-3.5 h-3.5" />
      </div>
      <!-- 面包屑：逐级展示当前路径，点击可跳转至对应层级 -->
      <template v-for="(crumb, idx) in breadcrumbs" :key="crumb.path">
        <button
          class="asset-header__crumb"
          :class="{ 'asset-header__crumb--active': idx === breadcrumbs.length - 1 }"
          @click="navigateTo(crumb.path)"
        >
          {{ crumb.name }}
        </button>
        <span v-if="idx < breadcrumbs.length - 1" class="asset-header__crumb-sep">/</span>
      </template>
    </div>

    <!-- 右侧：搜索框、操作按钮、视图切换 -->
    <div class="asset-header__actions">
      <div class="asset-header__search">
        <Search class="asset-header__search-icon" />
        <input
          :ref="setSearchInput"
          :value="searchQuery"
          type="text"
          :placeholder="'搜索...'"
          class="asset-header__search-input"
          @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
          @keydown.escape="emit('update:searchQuery', '')"
        />
        <!-- 清除搜索按钮：仅在有输入内容时显示 -->
        <button
          v-if="searchQuery"
          type="button"
          class="asset-header__search-clear"
          aria-label="清除搜索"
          @click="emit('update:searchQuery', '')"
        >
          <X class="w-3 h-3" />
        </button>
      </div>

      <div class="asset-header__divider" />

      <!-- 新建文件夹按钮 -->
      <button
        type="button"
        class="asset-header__btn"
        :title="'新建文件夹'"
        aria-label="新建文件夹"
        @click="createFolder"
      >
        <FolderPlus class="w-4 h-4" />
      </button>

      <!-- 上传按钮：图标模式仅接受 .svg 文件 -->
      <button
        type="button"
        class="asset-header__btn asset-header__btn--upload"
        :title="type === 'icon' ? '上传 SVG 到当前目录' : '上传到当前目录'"
        :aria-label="type === 'icon' ? '上传 SVG 到当前目录' : '上传到当前目录'"
        @click="triggerUpload"
      >
        <Upload class="w-4 h-4" />
        <input
          :ref="setFileInput"
          type="file"
          :accept="type === 'icon' ? '.svg' : ''"
          multiple
          class="hidden"
          @change="onUpload"
        />
      </button>

      <div class="asset-header__divider" />

      <!-- 视图切换：网格 / 列表 -->
      <div class="asset-header__view-toggle">
        <button
          type="button"
          class="asset-header__view-btn"
          :class="{ 'asset-header__view-btn--active': viewMode === 'grid' }"
          :title="'网格视图'"
          aria-label="网格视图"
          @click="emit('update:viewMode', 'grid')"
        >
          <LayoutGrid class="w-4 h-4" />
        </button>
        <button
          type="button"
          class="asset-header__view-btn"
          :class="{ 'asset-header__view-btn--active': viewMode === 'list' }"
          :title="'列表视图'"
          aria-label="列表视图"
          @click="emit('update:viewMode', 'list')"
        >
          <List class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 所属模块：frontend/components
 * 职责：实现 AssetManagerHeader 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import {
  Search,
  Upload,
  FolderOpen,
  FolderPlus,
  Sparkles,
  LayoutGrid,
  List,
  X,
} from '@lucide/vue'

// 组件属性：由父组件通过 useAssetManager 注入
defineProps<{
  /** 资源类型：icon / floorplan 等，影响徽标样式与上传限制 */
  type: string
  /** 面包屑数据：name 显示名 + path 跳转路径 */
  breadcrumbs: Array<{ name: string; path: string }>
  /** 当前搜索关键词（双向绑定） */
  searchQuery: string
  /** 当前视图模式（双向绑定） */
  viewMode: 'grid' | 'list'
  /** 注入搜索框 DOM 引用的回调 */
  setSearchInput: (el: Element | import('vue').ComponentPublicInstance | null) => void
  /** 注入文件输入 DOM 引用的回调 */
  setFileInput: (el: Element | import('vue').ComponentPublicInstance | null) => void
  /** 跳转至指定路径 */
  navigateTo: (path: string) => void
  /** 触发新建文件夹流程 */
  createFolder: () => void
  /** 触发文件选择对话框 */
  triggerUpload: () => void
  /** 文件选择后的上传处理 */
  onUpload: (e: Event) => void
}>()

// 事件定义：用于双向绑定 searchQuery 与 viewMode
const emit = defineEmits<{
  'update:searchQuery': [value: string]
  'update:viewMode': [value: 'grid' | 'list']
}>()
</script>