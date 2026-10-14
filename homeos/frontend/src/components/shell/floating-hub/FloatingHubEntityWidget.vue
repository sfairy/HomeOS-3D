<template>
  <!-- 实体部件：展示燃气/水/通讯/电等公用事业实体的状态与单位 -->
  <!--
    可点击性只在「公用事业实体」上成立（onWidgetClick 对其它实体直接 return），
    所以只有可点击时元素才是有语义的 <button>：键盘可 Tab 到、Enter/Space 可触发。
    不可点击时仍是普通 div，不会被读屏当成可操作控件。
  -->
  <component
    :is="clickable ? 'button' : 'div'"
    v-if="hub"
    class="afh-content afh-content--entity"
    :class="{ 'afh-content--clickable': clickable, 'afh-content--btn': clickable }"
    v-bind="clickable ? { type: 'button', 'aria-label': activateLabel } : {}"
    @click.stop="clickable && hub.onWidgetClick(widget)"
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
          {{ entityLabel }}
        </span>
        <div class="flex items-baseline gap-1">
          <!-- 实体当前状态值与单位 -->
          <span class="afh-value">{{ hub.entityState(String(widget.config.entityId || '')) }}</span>
          <span class="afh-unit">{{ hub.unitLabel(String(widget.config.entityId || '')) }}</span>
        </div>
      </div>
    </div>
  </component>
</template>

<script setup lang="ts">
/** 浮动控制中心 - 实体部件 */
import { computed, inject } from 'vue'
import { FloatingHubContextKey } from '@/shared/types/floating-hub'
import type { FloatingWidget } from '@/shared/types/layout'

// 部件实例（含 config.entityId 实体 ID）
const props = defineProps<{
  widget: FloatingWidget
}>()

// 注入父组件上下文；允许为 null（在未提供上下文的诊断场景下不渲染）
const hub = inject(FloatingHubContextKey, null)

/** 实体 ID：config.entityId 可能为空串，统一在这里兜底 */
const entityId = computed(() => String(props.widget.config.entityId || ''))

/** 部件显示名：优先配置标题，回退实体 friendly_name */
const entityLabel = computed(() =>
  props.widget.config.title || hub?.friendlyName(entityId.value) || '',
)

/** 仅公用事业实体（燃气/水/通讯/电）可点击弹出详情面板 */
const clickable = computed(() => !!hub && hub.isUtilityEntity(entityId.value))

/** 按钮的无障碍名称：说明点击后会发生什么（切换详情面板） */
const activateLabel = computed(() => `切换 ${entityLabel.value} 详情面板`)
</script>