<template>
  <!-- 批量操作工具条：仅在 show 为 true 时渲染，提供全部开启/关闭按钮与统计信息 -->
  <div v-if="show" class="dgm-batch-bar">
    <!-- 批量按钮区：根据 offOnly 决定是否显示「全部开启」按钮 -->
    <div class="dgm-batch-actions">
      <!-- climate 与其它域均显示开启/关闭 -->
      <button
        v-if="!offOnly"
        type="button"
        class="dgm-batch-btn dgm-batch-btn--on"
        :disabled="executing"
        @click="$emit('toggle', true)"
      >
        <Power class="w-3.5 h-3.5" />
        {{ '全部开启' }}
      </button>
      <!-- 全部关闭按钮：无运行项时禁用 -->
      <button
        type="button"
        class="dgm-batch-btn dgm-batch-btn--off"
        :disabled="executing || onCount === 0"
        @click="$emit('toggle', false)"
      >
        <Power class="w-3.5 h-3.5" />
        {{ '全部关闭' }}
      </button>
    </div>
    <!-- 批量状态统计：显示「已开启/运行中」数量与总数 -->
    <div class="dgm-batch-stat">
      <span class="dgm-batch-stat-num">{{ onCount }}</span>
      <span class="dgm-batch-stat-sep">/</span>
      <span class="dgm-batch-stat-total">{{ total }}</span>
      <span class="dgm-batch-stat-label">{{ statLabel }}</span>
    </div>
  </div>
</template>

<script setup>
/**
 * @file DeviceGroupBatchBar.vue
 * @module components/entities/device-group
 * @description 设备群组批量操作工具条
 *
 * 职责：
 * - 提供「全部开启 / 全部关闭」批量按钮
 * - 显示当前已开启（或运行中）的实体数量与总数
 * - 在批量执行期间禁用按钮，避免重复触发
 *
 * 依赖：
 * - @lucide/vue 的 Power 图标
 * - 父组件通过 props 控制 show/executing/onCount/total/offOnly/statLabel
 *
 * 使用场景：
 * - light/switch 域：显示开启/关闭按钮，统计「已开启」数量
 * - climate 域：仅显示关闭按钮（offOnly=true），统计「运行中」数量
 */
import { Power } from '@lucide/vue'

/**
 * 组件 Props 定义
 * @property {boolean} show - 是否显示批量工具条
 * @property {boolean} executing - 是否正在执行批量调用，用于禁用按钮
 * @property {number} onCount - 当前已开启（或运行中）的实体数量
 * @property {number} total - 实体总数
 * @property {boolean} offOnly - 是否仅显示关闭按钮（climate 域为 true）
 * @property {string} statLabel - 统计标签文案，如「已开启」「运行中」
 */
defineProps({
  show: { type: Boolean, default: false },
  executing: { type: Boolean, default: false },
  onCount: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  offOnly: { type: Boolean, default: false },
  statLabel: { type: String, default: '已开启' },
})

/**
 * 组件事件定义
 * @emits toggle - 用户点击开启/关闭按钮时触发，参数 true 表示开启、false 表示关闭
 */
defineEmits(['toggle'])
</script>