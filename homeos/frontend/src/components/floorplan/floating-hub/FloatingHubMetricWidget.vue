<template>
  <!-- 温度传感器：展示 temperature 属性，单位 ℃ -->
  <div v-if="widget.type === 'temp'" class="afh-content">
    <div class="flex items-center gap-2">
      <span class="afh-emoji">🌡️</span>
      <div class="flex items-baseline gap-1">
        <span class="afh-value">{{
          hub.sensorValue(String(widget.config.entityId || ''), ['temperature'])
        }}</span>
        <span class="afh-unit">°C</span>
      </div>
    </div>
  </div>

  <!-- 湿度传感器：展示 humidity 属性，单位 % -->
  <div v-else-if="widget.type === 'humidity'" class="afh-content">
    <div class="flex items-center gap-2">
      <span class="afh-emoji">💧</span>
      <div class="flex items-baseline gap-1">
        <span class="afh-value">{{
          hub.sensorValue(String(widget.config.entityId || ''), ['humidity'])
        }}</span>
        <span class="afh-unit">%</span>
      </div>
    </div>
  </div>

  <!-- 空气质量指数 AQI：约定实体 sensor.{城市名}_aqi -->
  <div v-else-if="widget.type === 'aqi'" class="afh-content">
    <div class="flex items-center gap-2">
      <span class="afh-emoji">🍃</span>
      <div class="flex items-baseline gap-1">
        <span
          :class="['afh-value', hub.aqiLevel(hub.aqiValue(String(widget.config.entityId || '')))]"
        >
          {{ hub.aqiValue(String(widget.config.entityId || '')) || '--' }}
        </span>
        <span class="afh-unit">AQI</span>
      </div>
    </div>
  </div>

  <!-- 电池电量：数值根据电量着色，单位 % -->
  <div v-else-if="widget.type === 'battery'" class="afh-content">
    <div class="flex items-center gap-2">
      <span class="afh-emoji">🔋</span>
      <div class="flex items-baseline gap-1">
        <span
          :class="[
            'afh-value',
            hub.batteryColor(
              hub.sensorValue(String(widget.config.entityId || ''), ['battery', 'battery_level']),
            ),
          ]"
        >
          {{
            hub.sensorValue(String(widget.config.entityId || ''), ['battery', 'battery_level']) ||
            '--'
          }}
        </span>
        <span class="afh-unit">%</span>
      </div>
    </div>
  </div>

  <!-- 功率/能耗：展示 power/energy/consumption 属性，单位 W -->
  <div v-else-if="widget.type === 'power'" class="afh-content">
    <div class="flex items-center gap-2">
      <span class="afh-emoji">⚡</span>
      <div class="flex items-baseline gap-1">
        <span class="afh-value">
          {{
            hub.sensorValue(String(widget.config.entityId || ''), [
              'power',
              'energy',
              'consumption',
            ])
          }}
        </span>
        <span class="afh-unit">W</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file FloatingHubMetricWidget.vue
 * @module floorplan/floating-hub
 *
 * 浮动控制中心 - 指标型部件渲染器
 *
 * 职责：
 * - 根据 widget.type 渲染不同传感器指标：温度/湿度/空气质量/电池/功率
 * - 通过 hub.sensorValue / hub.aqiValue 按关键字或约定实体提取数值
 * - AQI 与电池根据数值动态着色（aqiLevel / batteryColor）
 *
 * 依赖：
 * - vue：inject
 * - FloatingHubContextKey：父组件注入的上下文
 * - @/types/layout：FloatingWidget 部件类型定义
 */
import { inject } from 'vue'
import { FloatingHubContextKey } from '@/components/floorplan/floating-hub/context'
import type { FloatingWidget } from '@/types/layout'

// 部件实例（type 决定渲染分支，config.entityId 指向传感器实体）
defineProps<{
  widget: FloatingWidget
}>()

// 注入父组件上下文（非空断言：FloatingHub 父组件必定 provide）
const hub = inject(FloatingHubContextKey)!
</script>