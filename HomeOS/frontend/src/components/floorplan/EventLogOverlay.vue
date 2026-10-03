<template>
  <!-- 事件日志浮层：半透明面板，滚动展示最新实体状态变化 -->
  <div class="event-log-overlay" :style="overlayStyle">
    <div
      class="event-log-overlay__panel bg-black/30 backdrop-blur-md rounded-xl border border-white/5 shadow-2xl overflow-hidden"
    >
      <!-- 日志滚动容器，隐藏滚动条 -->
      <div
        ref="scrollContainer"
        class="scroll-wrapper py-2 px-3 overflow-y-auto hide-scrollbar"
        :style="scrollStyle"
      >
        <!-- TransitionGroup 提供日志条目的进入/离开动画 -->
        <TransitionGroup name="log-list">
          <RouterLink
            v-for="evt in events"
            :key="evt.id"
            :to="evt.entityId ? `/device?id=${encodeURIComponent(evt.entityId)}` : '/events'"
            class="log-entry log-entry--link"
          >
            <span class="log-entry__state" :class="evt.colorClass">[{{ evt.state }}]</span>
            <span class="log-entry__time">{{ evt.timestamp }}</span>
            <span class="log-entry__name">{{ evt.name }}</span>
          </RouterLink>
        </TransitionGroup>
      </div>
      <!-- 底部"查看全部事件历史"入口，跳转到事件页 -->
      <RouterLink to="/events" class="event-log-overlay__footer">{{
        '查看全部事件历史 →'
      }}</RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file EventLogOverlay.vue
 * @module floorplan
 *
 * 事件日志浮层组件（即时消息墙）
 *
 * 职责：
 * - 在平面图上以半透明浮层形式实时显示 HA 实体的状态变化
 * - 每条日志可点击跳转到对应设备详情页（/device?id=xxx）
 * - 底部提供"查看全部事件历史"入口，跳转到 /events
 *
 * 依赖：
 * - vue-router：RouterLink 路由跳转
 * - @/composables/floorplan/useEventLogOverlay：日志数据、滚动样式、浮层样式
 * - ./styles/event-log-overlay.css：浮层样式
 */
import { RouterLink } from 'vue-router'
import { useEventLogOverlay } from '@/composables/floorplan/useEventLogOverlay'
import './styles/event-log-overlay.css'

// 解构组合式函数返回的响应式状态：滚动容器引用、日志列表、滚动样式、浮层样式
const { scrollContainer, events, scrollStyle, overlayStyle } = useEventLogOverlay()
</script>