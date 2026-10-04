<template>
  <!-- 批量执行结果容器：仅在存在结果时渲染 -->
  <div v-if="result" class="dgm-exec-result">
    <!-- 顶部汇总条：根据整体成功状态切换样式（成功为绿色，失败为红色） -->
    <div
      class="dgm-exec-summary"
      :class="result.success ? 'dgm-exec-summary--ok' : 'dgm-exec-summary--fail'"
    >
      {{ result.executed }}/{{ result.total }} 成功
      <span class="dgm-exec-service">{{ result.service }}</span>
    </div>
    <!-- 失败项列表：仅当存在失败项时显示，并提供重试按钮 -->
    <div v-if="failedItems.length" class="dgm-exec-failures">
      <div v-for="item in failedItems" :key="item.entity_id" class="dgm-exec-fail-item">
        <span>{{ item.entity_id }}</span>
        <span class="dgm-exec-fail-err">{{ item.error || '失败' }}</span>
      </div>
      <button type="button" class="dgm-exec-retry" :disabled="executing" @click="$emit('retry')">
        重试失败项
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * @file DeviceGroupActions.vue
 * @module components/entities/device-group
 * @description 设备群组批量操作执行结果展示组件
 *
 * 职责：
 * - 展示批量服务调用的执行汇总（成功/失败数量、对应服务名）
 * - 列出失败实体及错误原因
 * - 提供「重试失败项」入口，由父组件重新发起批量调用
 *
 * 依赖：
 * - vue 的 computed 用于派生失败项列表
 * - 父组件通过 props 传入 result 与 executing 状态
 */
import { computed } from 'vue'

/**
 * 组件 Props 定义
 * @property {Object|null} result - 批量执行结果对象，包含 success/executed/total/service/results 等字段
 * @property {boolean} executing - 是否正在执行批量调用，用于禁用重试按钮避免重复触发
 */
const props = defineProps({
  result: { type: Object, default: null },
  executing: { type: Boolean, default: false },
})

/**
 * 组件事件定义
 * @emits retry - 用户点击「重试失败项」时触发，由父组件重新发起批量调用
 */
defineEmits(['retry'])

/**
 * 从执行结果中筛选出失败的实体项
 * @returns {Array<{entity_id: string, success: boolean, error?: string}>} 失败项列表
 */
const failedItems = computed(() => (props.result?.results || []).filter((r) => !r.success))
</script>