<template>
  <!-- 执行引擎徽标：根据动作特征判定需要由 HA 还是本地 HomeOS 引擎执行 -->
  <div :class="['wr-exec-engine', needsHa ? 'wr-exec-engine--ha' : 'wr-exec-engine--local']">
    <span class="wr-exec-engine__badge">
      {{ needsHa ? '需 HA 执行' : '本地引擎' }}
    </span>
    <!-- 当需要 HA 执行时展示判定原因列表 -->
    <ul v-if="needsHa && reasons.length" class="wr-exec-engine__reasons">
      <li v-for="r in reasons" :key="r.id">{{ r.label }}</li>
    </ul>
    <!-- 一键切换为 HA 执行：仅在判定需要 HA 且尚未切换时显示 -->
    <button
      v-if="needsHa && !runOnHa"
      type="button"
      class="wr-exec-engine__switch"
      @click="$emit('enable-ha')"
    >
      {{ '一键切换为 HA 执行' }}
    </button>
  </div>
</template>

<script setup>
/**
 * OrchestratorExecutionEngineBadge.vue
 *
 * 所属模块：dashboard / Orchestrator（联动编排器）
 * 职责：根据联动项所使用动作的类型，展示“本地引擎”或“需 HA 执行”徽标；
 *      当判定需 HA 执行时，列出原因列表并提供一键切换开关。
 * 依赖：@lucide/vue（图标）、Vue 3 defineProps/defineEmits。
 */

/**
 * 组件 Props
 * @property {boolean} needsHa    - 是否判定需要由 Home Assistant 引擎执行
 * @property {boolean} runOnHa     - 当前是否已切换为 HA 执行
 * @property {Array<{id:string,label:string}>} reasons - 需 HA 执行的原因列表
 */
defineProps({
  needsHa: { type: Boolean, default: false },
  runOnHa: { type: Boolean, default: false },
  reasons: { type: Array, default: () => [] },
})

/** 事件：点击“一键切换为 HA 执行”按钮时触发 */
defineEmits(['enable-ha'])
</script>

<style scoped src="./styles/OrchestratorExecutionEngineBadge.css"></style>