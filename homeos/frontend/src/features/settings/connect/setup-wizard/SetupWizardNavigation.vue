<!--
  组件文件：SetupWizardNavigation.vue
  所属模块：frontend/src/features/settings/connect/setup-wizard
  组件职责：初始化向导的底部统一导航栏（小组件级），左为「上一步」按钮（第一步自动
    禁用），中为进度提示与校验反馈文案（成功绿字/失败红字），右为「下一步」按钮（
    根据 stepId 动态显示连接没问题/安防配好了/电表绑好了/完成向导，开始使用 等文案，
    最后一步切换为 PartyPopper 图标）。
  主要 props / emits：
    - props currentStep：当前步骤索引（0 起始，判断是否禁用上一步）
    - props saving：是否保存中（禁用下一步）
    - props stepId：步骤 ID（决定 nextLabel 文案）
    - props hint / hintOk：自定义中部提示与是否为成功样式
    - emit prev：点击「上一步」
    - emit next：点击「下一步」或「完成向导」
  依赖关系：纯 UI 子组件，无 store 与外部 API。
  注意事项：最后一步（stepId === complete）右侧按钮图标切换为庆祝图标；导航按钮只做
    事件触发不直接切步，切步逻辑由父组件控制。
-->
<script setup>
/**
 * 职责：渲染 views/SetupWizardNavigation 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { computed } from 'vue'
import { ChevronLeft, ChevronRight, PartyPopper } from '@lucide/vue'

const props = defineProps({
  currentStep: { type: Number, default: 0 },
  saving: { type: Boolean, default: false },
  stepId: { type: String, default: '' },
  hint: { type: String, default: '' },
  hintOk: { type: Boolean, default: true },
})

const emit = defineEmits(['prev', 'next'])

const nextLabel = computed(() => {
  if (props.saving) return '处理中…'
  const labels = {
    connection: '连接没问题，继续',
    security: '安防配好了，继续',
    energy: '电表绑好了，继续',
    environment: '环境配好了，继续',
    dashboard: '稍后完善，继续',
    complete: '完成向导，开始使用',
  }
  return labels[props.stepId] || '下一步'
})
</script>

<template>
  <div class="sw-nav">
    <button type="button" class="sw-nav__prev" :disabled="currentStep === 0" @click="emit('prev')">
      <ChevronLeft class="w-4 h-4" />
      {{ '上一步' }}
    </button>
    <p :class="['sw-nav__hint', hint && (hintOk ? 'sw-nav__hint--ok' : 'sw-nav__hint--err')]">
      {{ hint || (currentStep === 0 ? '随时可以回来修改' : '进度已自动保存') }}
    </p>
    <button type="button" class="sw-nav__next" :disabled="saving" @click.stop="emit('next')">
      <PartyPopper v-if="stepId === 'complete'" class="w-4 h-4" />
      <ChevronRight v-else class="w-4 h-4" />
      {{ nextLabel }}
    </button>
  </div>
</template>

<style scoped src="./styles/SetupWizardNavigation.css"></style>
