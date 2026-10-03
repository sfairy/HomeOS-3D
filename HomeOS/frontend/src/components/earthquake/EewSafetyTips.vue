/**
 * @file EewSafetyTips.vue
 * @module components/earthquake
 * @brief 地震预警避险提示卡片组件
 *
 * 职责：
 * - 在地震预警覆盖层中展示四条核心避险要领（保持冷静 / 躲避桌底 / 远离窗户 / 严禁电梯）
 * - 支持紧凑模式（compact），用于竖屏布局下节省纵向空间
 * - 每条提示由图标、文案与彩色边框组成，颜色按危险等级区分
 *
 * 依赖：
 * - @lucide/vue：图标库（Heart / Shield / TriangleAlert / Ban）
 * - 外部样式 ./styles/EewSafetyTips.css
 */
<template>
  <!-- 避险提示容器：紧凑模式下整体缩小，便于竖屏展示 -->
  <div class="eew-safety" :class="{ 'eew-safety--compact': compact }">
    <!-- 逐条渲染避险卡片，使用 label 作为 key 保证稳定 -->
    <div v-for="tip in tips" :key="tip.label" class="eew-safety-card">
      <!-- 图标容器，按紧凑模式调整尺寸；inline style 注入背景与边框颜色 -->
      <div class="eew-safety-icon" :class="compact ? 'eew-safety-icon--sm' : ''" :style="tip.style">
        <component :is="tip.icon" class="w-5 h-5" :class="tip.iconClass" />
      </div>
      <!-- 提示文案，颜色随提示等级变化 -->
      <span class="text-xs font-bold" :class="tip.textClass">{{ tip.label }}</span>
    </div>
  </div>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 EewSafetyTips 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { Ban, Heart, Shield, TriangleAlert } from '@lucide/vue'

/**
 * Props 定义
 * @property {boolean} compact - 是否启用紧凑模式（竖屏布局使用）
 */
defineProps({
  compact: { type: Boolean, default: false },
})

/**
 * 避险提示清单
 * 每项包含：
 * - icon：lucide 图标组件
 * - label：中文文案（用户可见）
 * - iconClass / textClass：图标与文案的色调类名（est-info/est-warn/est-danger/est-muted）
 * - style：行内样式，控制图标的半透明背景与边框颜色
 * 顺序按行动优先级排列：冷静 → 躲避 → 远离 → 禁忌
 */
const tips = [
  {
    icon: Heart,
    label: '保持冷静',
    iconClass: 'est-info',
    textClass: 'est-info',
    style: 'background: rgb(59 130 246 / 0.1); border-color: rgb(59 130 246 / 0.2)',
  },
  {
    icon: Shield,
    label: '躲避桌底',
    iconClass: 'est-warn',
    textClass: 'est-warn',
    style: 'background: rgb(245 158 11 / 0.1); border-color: rgb(245 158 11 / 0.2)',
  },
  {
    icon: TriangleAlert,
    label: '远离窗户',
    iconClass: 'est-danger',
    textClass: 'est-danger',
    style: 'background: rgb(239 68 68 / 0.1); border-color: rgb(239 68 68 / 0.2)',
  },
  {
    icon: Ban,
    label: '严禁电梯',
    iconClass: 'est-muted',
    textClass: 'est-muted',
    style: 'background: rgb(107 114 128 / 0.1); border-color: rgb(107 114 128 / 0.2)',
  },
]
</script>

<style scoped src="./styles/EewSafetyTips.css"></style>