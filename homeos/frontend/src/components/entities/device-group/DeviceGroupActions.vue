<template>
  <!-- 批量执行失败明细：成功/失败汇总已上移到批量工具条（紧跟「全部关闭」），这里只保留失败项与重试 -->
  <div v-if="failedItems.length" class="dgm-exec-result">
    <div class="dgm-exec-failures">
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
/** - 展示批量服务调用失败明细，并提供「重试失败项」入口 */
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
