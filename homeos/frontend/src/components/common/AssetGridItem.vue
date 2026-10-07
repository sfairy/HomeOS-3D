<template>
  <div
    class="agi-item group"
    :class="{
      'agi-item--picker': isPicker,
      'agi-item--image': type === 'background',
    }"
    @click="$emit('click')"
  >
    <!-- 文件夹图标 -->
    <FolderOpen v-if="item.type === 'dir'" class="agi-icon agi-icon--dir" />

    <!-- 图片文件预览 -->
    <div v-else class="agi-preview">
      <div class="agi-preview__inner">
        <img
          v-if="canPreview"
          :key="`${item.name}-${item.url}`"
          :src="item.url"
          :alt="`${item.name} 预览`"
          decoding="async"
          class="agi-preview__img"
          @error="$emit('previewError', item.name)"
        />
        <FileImage v-else class="agi-preview__fallback" />
      </div>
    </div>

    <!-- 文件名 -->
    <span class="agi-name">{{ item.name }}</span>

    <!-- 悬停操作按钮 -->
    <div class="agi-actions">
      <button
        v-if="item.type === 'file' && item.url"
        type="button"
        class="agi-actions__btn agi-actions__btn--copy"
        :aria-label="'复制'"
        @click.stop="$emit('copy')"
      >
        <Copy class="w-3 h-3" />
      </button>
      <button
        type="button"
        class="agi-actions__btn agi-actions__btn--delete"
        :aria-label="'删除'"
        @click.stop="$emit('delete')"
      >
        <Trash2 class="w-3 h-3" />
      </button>
    </div>

    <!-- Picker模式选中光晕 -->
    <div v-if="isPicker && item.type === 'file'" class="agi-pick-hint" />
  </div>
</template>

<script setup>
/**
 * @file AssetGridItem.vue
 * @module common/AssetGridItem
 * @description 资源网格项单卡片
 *  - 文件/文件夹统一展示；
 *  - 悬停操作按钮（复制路径 / 删除）；
 *  - Picker 模式视觉引导（光晕）。
 *  依赖：vue computed，@lucide/vue 图标库。
 *  调用场景：AssetManagerBody 网格视图渲染每张卡片。
 */
import { computed } from 'vue'
import { FolderOpen, FileImage, Copy, Trash2 } from '@lucide/vue'

const props = defineProps({
  /** 资源项对象，需包含 type/name/url 等字段 */
  item: { type: Object, required: true },
  /** 是否为拾取器模式（影响视觉与交互） */
  isPicker: { type: Boolean },
  /** 资源类型，'background' / 'icon'，影响默认样式 */
  type: { type: String, default: 'background' },
})

defineEmits(['click', 'copy', 'delete', 'previewError'])

/**
 * 是否可预览为图片
 * 仅当 item 为文件且 url 存在、扩展名为常见图片格式时返回 true
 * @returns {boolean}
 */
const canPreview = computed(() => {
  if (!props.item || props.item.type !== 'file' || !props.item.url) return false
  // 正则匹配常见图片扩展名（不区分大小写）
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(props.item.name)
})
</script>

<style scoped src="./styles/AssetGridItem.css"></style>