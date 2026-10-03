<template>
  <div
    :class="['asset-manager', embedded && 'asset-manager--embedded', dragActive && 'asset-manager--drag']"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- 顶部：面包屑导航、搜索、视图切换、上传/新建文件夹 -->
    <AssetManagerHeader
      :type="type"
      :breadcrumbs="breadcrumbs"
      :search-query="searchQuery"
      :view-mode="viewMode"
      :set-search-input="setSearchInput"
      :set-file-input="setFileInput"
      :navigate-to="navigateTo"
      :create-folder="createFolder"
      :trigger-upload="triggerUpload"
      :on-upload="onUpload"
      @update:search-query="searchQuery = $event"
      @update:view-mode="viewMode = $event"
    />

    <!-- 主体：网格/列表视图，支持虚拟滚动 -->
    <AssetManagerBody
      :loading="loading"
      :items="items"
      :filtered-items="filteredItems"
      :search-query="searchQuery"
      :view-mode="viewMode"
      :use-virtual-grid="useVirtualGrid"
      :grid-columns="gridColumns"
      :grid-row-height="gridRowHeight"
      :is-picker="isPicker"
      :type="type"
      :can-preview="canPreview"
      :is-image="isImage"
      :on-preview-error="onPreviewError"
      :on-item-click="onItemClick"
      :copy-path="copyPath"
      :delete-item="deleteItem"
    />

    <!-- 底部：当前过滤后的项目数量 -->
    <div v-if="filteredItems.length > 0" class="asset-footer">
      <span class="text-xs am-text-muted">
        {{ `${filteredItems.length} 个项目` }}
      </span>
    </div>

    <!-- 拖拽上传落点提示：多楼层切片可一次性拖入，超过单次上限时会在提交阶段提示 -->
    <div v-if="dragActive" class="asset-drop-hint">
      <UploadCloud class="w-6 h-6" />
      <span class="asset-drop-hint__text">{{ '松开即可上传到当前目录' }}</span>
      <span class="asset-drop-hint__meta">{{ `单次最多 ${MAX_UPLOAD_FILES} 个` }}</span>
    </div>

    <!-- 分批上传进度：显示已完成/总数，避免大批量传输时界面无反馈 -->
    <div v-if="uploadProgress" class="asset-upload-bar">
      <Loader2 class="w-3.5 h-3.5 animate-spin" />
      <span class="asset-upload-bar__text">
        {{ `正在上传 ${uploadProgress.done} / ${uploadProgress.total}` }}
      </span>
      <div class="asset-upload-bar__track">
        <div
          class="asset-upload-bar__fill"
          :style="{ width: `${Math.round((uploadProgress.done / uploadProgress.total) * 100)}%` }"
        />
      </div>
    </div>

    <!-- 新建文件夹：黑曜石深色微晶弹窗（替代通用输入弹窗） -->
    <VFolderCreateModal
      v-model="folderModalOpen"
      :busy="folderModalBusy"
      :error="folderModalError"
      @confirm="confirmCreateFolder"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @file AssetManager.vue
 * @module common/AssetManager
 * @description 资源管理器组件 — 文件浏览器 / 图标拾取器
 *  职责：
 *    - 通过 useAssetManager 组合式函数管理目录列表、搜索、视图、上传、删除等状态；
 *    - 将 Header/Body 拆分为子组件，本组件仅做编排；
 *    - 拾取器模式（isPicker）下点击文件会向上 emit('select')；
 *    - 承载拖拽上传落点、分批上传进度与「新建文件夹」微晶弹窗。
 *  依赖：asset-manager 子目录下的 Header/Body 子组件与 useAssetManager composable、VFolderCreateModal。
 */
import { ref, type ComponentPublicInstance } from 'vue'
import { Loader2, UploadCloud } from '@lucide/vue'
import AssetManagerHeader from './asset-manager/AssetManagerHeader.vue'
import AssetManagerBody from './asset-manager/AssetManagerBody.vue'
import VFolderCreateModal from './base/VFolderCreateModal.vue'
import { MAX_UPLOAD_FILES, useAssetManager } from './asset-manager/useAssetManager'
import './asset-manager/styles/asset-manager.css'
import './asset-manager/styles/asset-manager-header.css'
import './asset-manager/styles/asset-manager-body.css'

const props = defineProps({
  /** 初始路径（相对资源根目录） */
  initialPath: { default: '' },
  /** 是否为拾取器模式 */
  isPicker: { type: Boolean },
  /** 是否嵌入到非模态容器（影响样式） */
  embedded: { type: Boolean, default: false },
  /** 资源类型：'floorplan' / 'icon' / 'background' / 'room_image' */
  type: { default: 'floorplan' },
})

const emit = defineEmits(['select'])

// 资源管理核心状态与操作，全部由组合式函数提供
const {
  items,
  loading,
  viewMode,
  searchQuery,
  fileInput,
  searchInputRef,
  breadcrumbs,
  filteredItems,
  useVirtualGrid,
  gridColumns,
  gridRowHeight,
  canPreview,
  isImage,
  onPreviewError,
  navigateTo,
  onItemClick,
  uploadProgress,
  folderModalOpen,
  folderModalBusy,
  folderModalError,
  createFolder,
  confirmCreateFolder,
  triggerUpload,
  onUpload,
  onDropFiles,
  deleteItem,
  copyPath,
} = useAssetManager(props, emit)

/** 是否有文件正拖拽在本组件之上（用于显示落点提示） */
const dragActive = ref(false)
// 拖拽深度计数：dragenter/dragleave 会在子元素间反复触发，用计数避免提示层闪烁
let dragDepth = 0

/** 拖拽进入：累加计数并显示落点提示 */
function onDragEnter() {
  dragDepth += 1
  dragActive.value = true
}

/** 拖拽离开：递减计数，归零后才隐藏提示 */
function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dragActive.value = false
}

/**
 * 放下文件：交给组合式函数按批次上传。
 * @param e 拖拽事件
 */
function onDrop(e: DragEvent) {
  dragDepth = 0
  dragActive.value = false
  const files = e.dataTransfer?.files
  if (!files?.length) return
  void onDropFiles(Array.from(files))
}

/**
 * 设置隐藏文件输入框的 DOM 引用（供上传触发使用）
 * @param el 文件输入框元素（或组件实例）
 */
function setFileInput(el: Element | ComponentPublicInstance | null) {
  fileInput.value = el as HTMLInputElement | null
}

/**
 * 设置搜索框的 DOM 引用（供自动聚焦等使用）
 * @param el 搜索输入框元素（或组件实例）
 */
function setSearchInput(el: Element | ComponentPublicInstance | null) {
  searchInputRef.value = el as HTMLInputElement | null
}
</script>

<style scoped>
/* ── 作用域语义色类（替代 Tailwind 颜色工具类） ── */
.am-text-muted {
  color: var(--set-text-secondary, rgba(255, 255, 255, 0.55));
}

.asset-manager {
  position: relative;
}

/* ── 拖拽上传落点提示 ── */
.asset-drop-hint {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 14px;
  color: #dceaff;
  background: rgba(6, 10, 18, 0.82);
  border: 1px dashed rgba(130, 200, 255, 0.55);
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
  pointer-events: none;
}

.asset-drop-hint__text {
  font-size: 13px;
  font-weight: 600;
}

.asset-drop-hint__meta {
  font-size: 11px;
  color: rgba(220, 234, 255, 0.6);
}

/* ── 分批上传进度条 ── */
.asset-upload-bar {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 11px;
  font-size: 12px;
  color: #e8f1ff;
  background: rgba(8, 12, 20, 0.92);
  border: 1px solid rgba(130, 200, 255, 0.28);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}

.asset-upload-bar__text {
  flex-shrink: 0;
  white-space: nowrap;
}

.asset-upload-bar__track {
  flex: 1;
  min-width: 60px;
  height: 5px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.12);
}

.asset-upload-bar__fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(130, 200, 255, 0.9), rgba(168, 140, 255, 0.9));
  transition: width 0.25s ease;
}

@media (prefers-reduced-motion: reduce) {
  .asset-upload-bar__fill {
    transition: none;
  }
}
</style>
