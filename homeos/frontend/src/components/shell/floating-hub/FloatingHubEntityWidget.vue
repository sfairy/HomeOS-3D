<template>
  <!-- 实体部件：展示燃气/水/通讯/电等公用事业实体的状态与单位 -->
  <div
    v-if="hub"
    class="afh-content afh-content--entity"
    :class="{ 'afh-content--clickable': hub.isUtilityEntity(String(widget.config.entityId || '')) }"
    @click.stop="hub.onWidgetClick(widget)"
  >
    <div class="flex items-center gap-3">
      <!-- 根据实体类别展示对应图标 emoji -->
      <div v-if="widget.config.showIcon" class="afh-icon-box">
        <span v-if="hub.isGasEntity(String(widget.config.entityId || ''))" class="afh-emoji"
          >🔥</span
        >
        <span v-else-if="hub.isWaterEntity(String(widget.config.entityId || ''))" class="afh-emoji"
          >💧</span
        >
        <span v-else-if="hub.isCommEntity(String(widget.config.entityId || ''))" class="afh-emoji"
          >📶</span
        >
        <span v-else class="afh-emoji">⚡</span>
      </div>
      <div class="flex flex-col">
        <!-- 优先使用配置的标题，回退到实体 friendly_name -->
        <span class="afh-label">
          {{ widget.config.title || hub.friendlyName(String(widget.config.entityId || '')) }}
        </span>
        <div class="flex items-baseline gap-1">
          <!-- 实体当前状态值与单位 -->
          <span class="afh-value">{{ hub.entityState(String(widget.config.entityId || '')) }}</span>
          <span class="afh-unit">{{ hub.unitLabel(String(widget.config.entityId || '')) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/** 浮动控制中心 - 实体部件 */
import { inject } from 'vue'
import { FloatingHubContextKey } from '@/shared/types/floating-hub'
import type { FloatingWidget } from '@/shared/types/layout'

// 部件实例（含 config.entityId 实体 ID）
defineProps<{
  widget: FloatingWidget
}>()

// 注入父组件上下文；允许为 null（在未提供上下文的诊断场景下不渲染）
const hub = inject(FloatingHubContextKey, null)
</script>