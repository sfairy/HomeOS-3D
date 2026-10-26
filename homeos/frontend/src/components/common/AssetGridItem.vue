<template>
  <div
    class="agi-item group"
    :class="{
      'agi-item--picker': isPicker,
      'agi-item--image': type === 'background',
    }"
  >
    <!--
      主操作（进入目录 / 选择文件）必须是真 <button>：原来 @click 挂在根 div 上，
      键盘完全不可达。右侧的复制/删除是绝对定位的同级按钮，不能塞进主按钮里
      （HTML 禁止按钮嵌套），所以拆成「主按钮 + 操作层」两段。
    -->
    <button
      type="button"
      class="agi-item__main"
      :aria-label="mainLabel"
      @click="$emit('click')"
    >
      <FolderOpen v-if="item.type === 'dir'" class="agi-icon agi-icon--dir" />

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

      <span class="agi-name">{{ item.name }}</span>
    </button>

    <!-- 悬停操作按钮（焦点在主按钮上时也显形，见 CSS 的 :focus-within） -->
    <div class="agi-actions">
      <button
        v-if="item.type === 'file' && item.url"
        type="button"
        class="agi-actions__btn agi-actions__btn--copy"
        :aria-label="`复制 ${item.name}`"
        @click.stop="$emit('copy')"
      >
        <Copy class="w-3 h-3" />
      </button>
      <button
        type="button"
        class="agi-actions__btn agi-actions__btn--delete"
        :aria-label="`删除 ${item.name}`"
        @click.stop="$emit('delete')"
      >
        <Trash2 class="w-3 h-3" />
      </button>
    </div>

    <div v-if="isPicker && item.type === 'file'" class="agi-pick-hint" />
  </div>
</template>

<script setup>
/** - 文件/文件夹统一展示； */
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

/**
 * 主操作按钮的无障碍名称：视觉上只有图标 / 缩略图和文件名，
 * 读屏需要「进入文件夹 X / 选择文件 X」才说得清这一格是干什么的。
 * @returns {string}
 */
const mainLabel = computed(() =>
  props.item?.type === 'dir'
    ? `进入文件夹 ${props.item?.name ?? ''}`
    : `选择文件 ${props.item?.name ?? ''}`,
)
</script>

<style scoped src="./styles/AssetGridItem.css"></style>