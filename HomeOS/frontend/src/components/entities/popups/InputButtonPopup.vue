/**
 * @file InputButtonPopup.vue
 * @module components/entities/popups
 * @brief 输入按钮弹窗
 *
 * 职责：
 * - 基于 EntityPopupShell 渲染 input_button 域控制面板
 * - 提供按钮触发操作（press 服务），含按下反馈动画
 *
 * 依赖：
 * - vue（ref/computed/onUnmounted）、@lucide/vue（MousePointerClick）
 * - ./EntityPopupShell、./PopupHead
 * - @/composables/entity/useEntityPopupBase、@homeos/shared（getEntityDomain）
 */
<template>
  <!-- InputButtonPopup 输入按钮弹窗：触发 input_button 实体的按钮 -->
  <EntityPopupShell
    :entity="liveEntity"
    :x-pct="xPct"
    :y-pct="yPct"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :width="180"
    :height="150"
    accent="#60a5fa"
    accent-rgb="96, 165, 250"
    @close="$emit('close')"
  >
    <PopupHead :title="entityName" :icon="MousePointerClick" :eyebrow="domainLabel" />

    <div class="flex justify-center py-2">
      <button
        type="button"
        :class="['btn-action', pressing ? 'btn-action--pressed' : '']"
        :disabled="pressing"
        @click="executePress"
      >
        <MousePointerClick class="w-5 h-5" />
        <span>{{ pressing ? '执行中...' : '点击执行' }}</span>
      </button>
    </div>
  </EntityPopupShell>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 InputButtonPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * InputButtonPopup - 输入按钮弹窗组件
 * 功能特性：
 * - 展示 input_button 实体
 * - 提供按钮触发操作
 * - 弹出式面板
 */
import { ref, computed, onUnmounted } from 'vue'
import { MousePointerClick } from '@lucide/vue'
import EntityPopupShell from '@/components/entities/popups/EntityPopupShell.vue'
import PopupHead from '@/components/entities/popups/PopupHead.vue'
import { defineEntityPopupProps, useEntityPopupBase } from '@/composables/entity/useEntityPopupBase'
import { getEntityDomain } from '@homeos/shared'

const props = defineProps(defineEntityPopupProps())
defineEmits(['close'])

const { liveEntity, entityName, callService } = useEntityPopupBase(props)
const pressing = ref(false)
const domainLabel = computed(() => getEntityDomain(liveEntity.value?.entity_id || ''))

let pressTimer = null

async function executePress() {
  if (pressing.value) return
  pressing.value = true
  const domain = getEntityDomain(liveEntity.value.entity_id)
  try {
    await callService(domain, 'press', liveEntity.value.entity_id, undefined, '按钮执行失败')
  } finally {
    if (pressTimer) clearTimeout(pressTimer)
    pressTimer = setTimeout(() => {
      pressing.value = false
      pressTimer = null
    }, 500)
  }
}

onUnmounted(() => {
  if (pressTimer) clearTimeout(pressTimer)
})
</script>

<style src="./styles/PopupAccents.css"></style>
