<!--
  组件文件：SetupWizardProgress.vue
  所属模块：frontend/src/features/settings/connect/setup-wizard
  组件职责：初始化向导整页顶部的欢迎横幅 + 进度环形 + 时间线总览组件。顶部欢迎语
    「欢迎开启你的智能家居之旅」与当前步骤文案「第 X/Y 步 · 步骤名」；右侧 SVG 圆环
    显示当前整体进度百分比；中间展示能源学习期提示（如果已开始）；底部为可点击时间线
    节点（6 步：连接/安防/能源/环境/墙屏/完成），按状态着色并支持点击跳转已完成步骤。
  主要 props / emits：
    - props progress：整体百分比（0~100，驱动环形）
    - props learningStartedAt / learningDays：能源学习期起始日期与天数（可选）
    - props wizardSteps：步骤数组（含 id/label 等，渲染时间线）
    - props currentStep：当前步骤索引 0 起始
    - props status：向导状态对象（steps[stepId].done 判断节点完成状态）
    - props formatDate：格式化学习期日期的回调函数
    - emit go-to-step：点击已完成的时间线节点触发，payload 为步骤索引
  依赖关系：无 Pinia store；纯 UI 由 props 驱动；使用 Wifi/Shield/Zap/Thermometer/
    LayoutTemplate/PartyPopper 图标区分步骤类型，按 STEP_TONES 匹配颜色。
  注意事项：只有状态为 done 的时间线节点才可点击跳回；active/idle 状态节点不可点击；
    CSS 通过 --sw-pct 变量驱动 SVG 圆环 strokeDashoffset 百分比。
-->
<script setup>
/**
 * 职责：渲染 views/SetupWizardProgress 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { computed } from 'vue'
import { Wifi, Shield, Zap, Thermometer, LayoutTemplate, PartyPopper } from '@lucide/vue'

const props = defineProps({
  progress: { type: Number, default: 0 },
  learningStartedAt: { type: String, default: null },
  learningDays: { type: Number, default: 7 },
  wizardSteps: { type: Array, default: () => [] },
  currentStep: { type: Number, default: 0 },
  status: { type: Object, default: null },
  formatDate: { type: Function, required: true },
})

const emit = defineEmits(['go-to-step'])

const STEP_ICONS = {
  connection: Wifi,
  security: Shield,
  energy: Zap,
  environment: Thermometer,
  dashboard: LayoutTemplate,
  complete: PartyPopper,
}

const STEP_TONES = {
  connection: 'sky',
  security: 'rose',
  energy: 'amber',
  environment: 'teal',
  dashboard: 'sky',
  complete: 'emerald',
}

const learningHint = computed(() => {
  if (!props.learningStartedAt) return ''
  return `学习期自 ${props.formatDate(props.learningStartedAt)} 起 ${props.learningDays} 天`
})

function stepState(idx, stepId) {
  if (idx === props.currentStep) return 'active'
  if (props.status?.steps?.[stepId]?.done) return 'done'
  return 'idle'
}

const currentStepMeta = computed(() => props.wizardSteps[props.currentStep] || props.wizardSteps[0])
const stepIndicator = computed(() => {
  const total = props.wizardSteps.length
  if (!total) return ''
  return `第 ${props.currentStep + 1}/${total} 步 · ${currentStepMeta.value?.label || ''}`
})
</script>

<template>
  <div class="sw-welcome">
    <div class="sw-welcome__banner">
      <div class="sw-welcome__glow" aria-hidden="true" />
      <div class="sw-welcome__copy">
        <p class="sw-welcome__eyebrow">✨ 首装向导</p>
        <h2 class="sw-welcome__title">欢迎开启你的智能家居之旅</h2>
        <p class="sw-welcome__desc">跟着步骤走，大约 5 分钟就能完成基础配置</p>
        <p v-if="stepIndicator" class="sw-welcome__step">{{ stepIndicator }}</p>
      </div>
      <div class="sw-welcome__ring" :style="{ '--sw-pct': `${progress}%` }">
        <svg viewBox="0 0 72 72" class="sw-welcome__ring-svg" aria-hidden="true">
          <circle cx="36" cy="36" r="30" class="sw-welcome__ring-track" />
          <circle cx="36" cy="36" r="30" class="sw-welcome__ring-fill" />
        </svg>
        <span class="sw-welcome__ring-value">{{ progress }}<small>%</small></span>
      </div>
    </div>

    <p v-if="learningHint" class="sw-welcome__learning">{{ learningHint }}</p>

    <div class="sw-timeline">
      <template v-for="(s, idx) in wizardSteps" :key="s.id">
        <button
          type="button"
          :class="[
            'sw-timeline__node',
            `sw-timeline__node--${STEP_TONES[s.id] || 'emerald'}`,
            `sw-timeline__node--${stepState(idx, s.id)}`,
          ]"
          @click="emit('go-to-step', idx)"
        >
          <span class="sw-timeline__node-icon">
            <span class="sw-timeline__node-num">{{ s.num }}</span>
            <component :is="STEP_ICONS[s.id] || PartyPopper" class="sw-timeline__node-svg" />
          </span>
          <span class="sw-timeline__node-label">{{ s.label }}</span>
        </button>
        <div
          v-if="idx < wizardSteps.length - 1"
          :class="[
            'sw-timeline__line',
            `sw-timeline__line--${STEP_TONES[s.id] || 'emerald'}-to-${STEP_TONES[wizardSteps[idx + 1]?.id] || 'emerald'}`,
            (status?.steps?.[s.id]?.done || idx < currentStep) && 'sw-timeline__line--done',
          ]"
          aria-hidden="true"
        />
      </template>
    </div>
  </div>
</template>
<style src="./styles/setup-wizard.css"></style>
