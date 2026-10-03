<!--
  组件文件：SetupWizardStepHero.vue
  所属模块：frontend/src/views/settings/connect/setup-wizard
  组件职责：初始化向导每一步顶部统一的 Hero 横幅（纯展示小组件），根据 stepId 匹配
    对应表情包/emoji、主题色 tone、标题、副标题与小提示；渲染统一的光晕 + emoji +
    标题区三段式布局。
  主要 props / emits：
    - props stepId：当前步骤 ID（connection/security/energy/environment/dashboard/
      complete），用于查找 STEP_HERO 映射
  依赖关系：无外部 store/API；仅依赖内置 computed 与 Sparkles 图标组件。
  注意事项：传入未知 stepId 时自动回退到「连接」步骤的 Hero 配置，避免空白；
    CSS 按 tone（sky/rose/amber/teal/emerald）提供差异化光晕配色。
-->
<script setup>
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/SetupWizardStepHero 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { computed } from 'vue'
import { Sparkles } from '@lucide/vue'

const props = defineProps({
  stepId: { type: String, required: true },
})

const STEP_HERO = {
  connection: {
    emoji: '🏠',
    tone: 'sky',
    title: '先连上你的家',
    desc: '确认 Home Assistant 在线，实体已同步到 HomeOS',
    tip: '通常 1 分钟就能完成',
  },
  security: {
    emoji: '🛡️',
    tone: 'rose',
    title: '守护家门与动静',
    desc: '绑定门铃触发与摄像头，可选配置运动传感器',
    tip: '至少添加一路门铃即可继续',
  },
  energy: {
    emoji: '⚡',
    tone: 'amber',
    title: '看清用电情况',
    desc: '绑定主电表与可选分路，能源页将展示用量趋势',
    tip: '分路可稍后再补，不影响向导完成',
  },
  environment: {
    emoji: '🌡️',
    tone: 'teal',
    title: '感知每个房间',
    desc: '为房间绑定温湿度与空气质量传感器',
    tip: '试试「智能推断」，可自动匹配大部分传感器',
  },
  dashboard: {
    emoji: '🗺️',
    tone: 'sky',
    title: '铺开墙屏界面',
    desc: '上传户型图、摆放热点，并收藏常用设备（可跳过）',
    tip: '跳过也不影响完成向导，首装清单会继续提醒',
  },
  complete: {
    emoji: '🎉',
    tone: 'emerald',
    title: '大功告成！',
    desc: '启用能源学习期，减少初期功率突增误报',
    tip: '完成后仍可随时回来调整配置',
  },
}

const hero = computed(() => STEP_HERO[props.stepId] || STEP_HERO.connection)
</script>

<template>
  <div :class="['sw-step-hero', `sw-step-hero--${hero.tone}`]">
    <div class="sw-step-hero__glow" aria-hidden="true" />
    <div class="sw-step-hero__emoji" aria-hidden="true">{{ hero.emoji }}</div>
    <div class="sw-step-hero__body">
      <h3 class="sw-step-hero__title">{{ hero.title }}</h3>
      <p class="sw-step-hero__desc">{{ hero.desc }}</p>
      <p class="sw-step-hero__tip">
        <Sparkles class="w-3.5 h-3.5 shrink-0" />
        <span>{{ hero.tip }}</span>
      </p>
    </div>
  </div>
</template>

<style scoped src="./styles/SetupWizardStepHero.css"></style>
