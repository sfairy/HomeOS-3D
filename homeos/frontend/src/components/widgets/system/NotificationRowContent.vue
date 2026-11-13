<script setup>
import { ChevronRight, Sparkles, X } from '@lucide/vue'
import { notificationSourceLabel } from '@homeos/shared'

/**
 * 通知行内容（级别图标 + 正文 + 跳转箭头 + 关闭按钮）。
 *
 * 为什么单独成文件：`NotificationCenter` 里「固定分页列表」与「虚拟列表插槽」两处
 * 各写了一遍这 30 行标记 —— 两边的 @click.stop / aria-hidden / 图标尺寸必须一起改，
 * 而它们分处文件两端，改一处漏一处是必然。
 *
 * `icon` / `iconClass` 由调用方传给（而不是这里再算一遍级别映射）：映射表归
 * `useNotificationCenter` 所有，复制到这里就变成「图标改了颜色没改」的第二处真相。
 */
defineProps({
  /** 通知对象（id / level / message / source / time / deliveredAt / actionPrompt） */
  n: { type: Object, required: true },
  /** 级别对应的 lucide 图标组件，由 levelIcon(n.level) 算好传进来 */
  icon: { type: [Object, Function], required: true },
  /** 级别对应的文字颜色 class，由 levelColor(n.level) 算好传进来 */
  iconClass: { type: String, default: '' },
  /** 是否展示「可跳转」箭头（判定同样留在调用方） */
  hasLink: { type: Boolean, default: false },
})

defineEmits(['action-prompt', 'dismiss'])
</script>

<template>
  <div class="nc-item__icon-wrap" :class="`nc-item__icon-wrap--${n.level || 'info'}`">
    <component :is="icon" class="nc-item__icon" :class="iconClass" />
  </div>
  <div class="nc-item__body">
    <p class="nc-text">{{ n.message }}</p>
    <div class="nc-meta">
      <span class="nc-source">{{ notificationSourceLabel(n.source) }}</span>
      <span class="nc-meta-sep" aria-hidden="true">·</span>
      <span class="nc-time">{{ n.time }}{{ n.deliveredAt ? ` · ${'已推送'}` : '' }}</span>
      <button v-if="n.actionPrompt" type="button" class="nc-action-prompt" @click.stop="$emit('action-prompt')">
        <Sparkles class="nc-action-prompt__icon" aria-hidden="true" />
        {{ '让管家处理' }}
      </button>
    </div>
  </div>
  <ChevronRight v-if="hasLink" class="nc-item__chevron" aria-hidden="true" />
  <button class="nc-dismiss" :aria-label="'关闭通知'" @click.stop="$emit('dismiss')">
    <X class="nc-dismiss__icon" />
  </button>
</template>
