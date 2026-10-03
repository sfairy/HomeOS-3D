<template>
  <!-- 仅在 stats 存在时渲染（stats 由父组件通过 useDeviceGroupOffline 计算） -->
  <template v-if="stats">
    <!-- 低电量告警区：电量低于阈值的设备卡片网格 -->
    <div v-if="stats.critical.length > 0" class="dgm-section">
      <div class="dgm-section-head">
        <h3 class="dgm-section-title dgm-section-title--danger">{{ '低电量告警' }}</h3>
        <span class="dgm-section-count">{{ stats.critical.length }}</span>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <div v-for="item in stats.critical" :key="item.id" class="dgm-battery-card is-critical">
          <h3 class="dgm-battery-name">{{ getEntityDisplayName(item.id, item.entity) }}</h3>
          <div class="dgm-battery-main">
            <!-- 电量百分比与可视化电池条 -->
            <span class="dgm-battery-pct is-critical">{{ item.level }}<small>%</small></span>
            <div class="battery-body">
              <div class="battery-body-fill is-critical" :style="{ width: item.level + '%' }" />
              <div class="battery-body-tip" />
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- 运行良好区：电量正常的设备卡片网格 -->
    <div v-if="stats.normal.length > 0" class="dgm-section">
      <div class="dgm-section-head">
        <h3 class="dgm-section-title dgm-section-title--ok">{{ '运行良好' }}</h3>
        <span class="dgm-section-sub">≥ 30%</span>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <div v-for="item in stats.normal" :key="item.id" class="dgm-battery-card">
          <h3 class="dgm-battery-name">{{ getEntityDisplayName(item.id, item.entity) }}</h3>
          <div class="dgm-battery-main">
            <span class="dgm-battery-pct" :class="batteryColor(item.level).tone"
              >{{ item.level }}<small>%</small></span
            >
            <div class="battery-body">
              <div
                class="battery-body-fill"
                :class="batteryColor(item.level).tone"
                :style="{ width: item.level + '%' }"
              />
              <div class="battery-body-tip" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>
</template>

<script setup>
/**
 * @file DeviceGroupBatteryPanel.vue
 * @module components/entities/device-group
 * @description 设备群组电量信息面板
 *
 * 职责：
 * - 按「低电量告警」「运行良好」两个分组展示电量传感器卡片
 * - 通过 batteryColor 函数（父组件传入）映射不同电量等级的颜色样式
 * - 卡片内含百分比文字与可视化电池条
 *
 * 依赖：
 * - @/utils/entity/derived.util 的 getEntityDisplayName 用于渲染实体友好名称
 * - 父组件通过 props 传入 stats（含 critical/normal 分组）与 batteryColor 函数
 *
 * 使用场景：
 * - DeviceGroupModal 在 domain === 'battery' 时渲染此面板
 */
import { getEntityDisplayName } from '@/utils/entity/derived.util'

/**
 * 组件 Props 定义
 * @property {Object|null} stats - 电量统计对象，包含 critical（低电量）与 normal（正常）两个数组，元素结构为 { id, level, entity }
 * @property {Function} batteryColor - 由父组件传入的颜色映射函数，参数为电量百分比，返回包含 tone 字段的对象用于决定 CSS 类名
 */
defineProps({
  stats: { type: Object, default: null },
  batteryColor: { type: Function, required: true },
})
</script>