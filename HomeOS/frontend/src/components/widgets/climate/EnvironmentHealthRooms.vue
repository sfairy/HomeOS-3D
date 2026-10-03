<template>
  <div class="eh-rooms">
    <!-- 顶部汇总：仅在有房间数据时展示，包含接入数量与风险计数 -->
    <div v-if="roomList.length" class="eh-rooms-summary">
      <span class="eh-rooms-summary__title">{{ '房间空气' }}</span>
      <span class="eh-rooms-summary__meta">{{ summaryText }}</span>
    </div>

    <!-- 房间卡片：未配置或风险等级非 safe 时增加状态修饰类 -->
    <div
      v-for="room in roomList"
      :key="room.roomId || room.name"
      :class="[
        'eh-room-card',
        !room.configured && 'eh-room-card--unconfigured',
        room.configured && room.risk && room.risk !== 'safe' && 'eh-room-card--risk',
      ]"
    >
      <div class="eh-room-header">
        <span class="eh-room-name">{{ room.name }}</span>
        <span v-if="!room.configured" class="eh-room-unconfigured">{{ '未配置' }}</span>
        <span
          v-else-if="room.risk && room.risk !== 'safe'"
          :class="['eh-room-risk', roomTagClass(room.risk)]"
        >
          {{ riskLabel(room.risk) }}
        </span>
      </div>

      <!-- 未配置提示：未绑定传感器时无法计算露点与霉菌风险 -->
      <div v-if="!room.configured" class="eh-room-unconfigured-hint">
        {{ '未绑定温湿度传感器，无法计算露点与霉菌风险' }}
      </div>
      <template v-else>
        <div class="eh-room-readings">
          <!-- 温度读数：偏离 22°C 超过 3°C 视为告警 -->
          <div class="eh-room-reading">
            <span class="eh-reading-label">{{ '温度' }}</span>
            <span
              :class="[
                'eh-reading-val',
                room.temperature != null && Math.abs(room.temperature - 22) > 3 && 'eh-reading-val--warn',
              ]"
              >{{ room.temperature != null ? `${room.temperature.toFixed(1)}°` : '--' }}</span
            >
            <div
              v-if="room.temperature != null"
              :class="[
                'eh-room-reading__bar',
                Math.abs(room.temperature - 22) > 3 && 'eh-room-reading__bar--warn',
              ]"
            >
              <i :style="{ width: `${tempBar(room.temperature)}%` }" />
            </div>
          </div>
          <!-- 湿度读数：偏离 50% 超过 15% 视为告警 -->
          <div class="eh-room-reading">
            <span class="eh-reading-label">{{ '湿度' }}</span>
            <span
              :class="[
                'eh-reading-val',
                room.humidity != null && Math.abs(room.humidity - 50) > 15 && 'eh-reading-val--warn',
              ]"
              >{{ room.humidity != null ? `${room.humidity.toFixed(0)}%` : '--' }}</span
            >
            <div
              v-if="room.humidity != null"
              :class="[
                'eh-room-reading__bar',
                Math.abs(room.humidity - 50) > 15 && 'eh-room-reading__bar--warn',
              ]"
            >
              <i :style="{ width: `${Math.max(6, Math.min(100, room.humidity))}%` }" />
            </div>
          </div>
          <!-- 露点读数：高于 15°C 提示霉菌风险 -->
          <div class="eh-room-reading">
            <span class="eh-reading-label">{{ '露点' }}</span>
            <span
              :class="[
                'eh-reading-val',
                room.dewPoint != null && room.dewPoint > 15 && 'eh-reading-val--warn',
              ]"
            >
              {{ room.dewPoint != null ? `${room.dewPoint.toFixed(1)}°` : '--' }}
            </span>
            <div
              v-if="room.dewPoint != null"
              :class="['eh-room-reading__bar', room.dewPoint > 15 && 'eh-room-reading__bar--warn']"
            >
              <i :style="{ width: `${dewBar(room.dewPoint)}%` }" />
            </div>
          </div>
        </div>

        <!-- 空气质量读数：仅在有 PM2.5/CO2/TVOC 任一项时展示 -->
        <div
          v-if="room.pm25 != null || room.co2 != null || room.tvoc != null"
          class="eh-room-readings eh-room-readings--air"
        >
          <div v-if="room.pm25 != null" class="eh-room-reading">
            <span class="eh-reading-label">{{ 'PM2.5' }}</span>
            <span :class="['eh-reading-val', room.pm25 > 35 && 'eh-reading-val--warn']">{{
              Math.round(room.pm25)
            }}</span>
          </div>
          <div v-if="room.co2 != null" class="eh-room-reading">
            <span class="eh-reading-label">{{ 'CO₂' }}</span>
            <span :class="['eh-reading-val', room.co2 > 800 && 'eh-reading-val--warn']">{{
              Math.round(room.co2)
            }}</span>
          </div>
          <div v-if="room.tvoc != null" class="eh-room-reading">
            <span class="eh-reading-label">{{ 'TVOC' }}</span>
            <span :class="['eh-reading-val', room.tvoc > 400 && 'eh-reading-val--warn']">{{
              Math.round(room.tvoc)
            }}</span>
          </div>
        </div>
      </template>
    </div>

    <!-- 空态：无任何房间数据时提供前往设置的入口 -->
    <VEmptyState v-if="!roomList.length" compact tone="emerald" :title="'暂无房间数据'">
      <template #action>
        <RouterLink :to="SETTINGS_ROUTES.envHealth()" class="v-empty__link v-empty__link--success">{{
          '前往环境与健康'
        }}</RouterLink>
      </template>
    </VEmptyState>
  </div>
</template>
<script setup>
/**
 * @file EnvironmentHealthRooms.vue
 * @module widgets/climate
 * @description 房间空气视图：按房间展示温度、湿度、露点及空气质量（PM2.5/CO2/TVOC）读数，
 *              并对未配置传感器或存在霉菌风险的房间进行视觉标记。
 * @dependencies
 *  - vue: computed 计算属性
 *  - vue-router: RouterLink 路由跳转
 *  - @/components/common/base/VEmptyState.vue: 空态组件
 *  - @/utils/registry/settings-route.util: 设置页路由常量
 *  - @/composables/climate/useEnvironmentHealthPanel: 风险标签与样式工具
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import VEmptyState from '@/components/common/base/VEmptyState.vue'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { riskLabel, roomTagClass } from '@/composables/climate/useEnvironmentHealthPanel'

const props = defineProps({
  roomList: { type: Array, default: () => [] },
})

/**
 * 顶部汇总文本：根据已接入房间数与风险房间数生成简要描述。
 * @returns {string} 汇总文案，如 "3/5 已接入 · 1 风险"
 */
const summaryText = computed(() => {
  const total = props.roomList.length
  const ready = props.roomList.filter((r) => r.configured).length
  const risk = props.roomList.filter((r) => r.configured && r.risk && r.risk !== 'safe').length
  if (!total) return ''
  if (risk) return `${ready}/${total} 已接入 · ${risk} 风险`
  return `${ready}/${total} 已接入`
})

/**
 * 温度进度条宽度计算：将温度区间 10~35°C 映射到 6~100%。
 * @param {number} t 当前温度（°C）
 * @returns {number} 进度条百分比
 */
function tempBar(t) {
  return Math.max(6, Math.min(100, Math.round(((t - 10) / 25) * 100)))
}

/**
 * 露点进度条宽度计算：将露点区间 0~22°C 映射到 6~100%。
 * @param {number} d 当前露点（°C）
 * @returns {number} 进度条百分比
 */
function dewBar(d) {
  return Math.max(6, Math.min(100, Math.round((d / 22) * 100)))
}
</script>