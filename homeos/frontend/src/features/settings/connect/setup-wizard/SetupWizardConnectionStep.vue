<!--
  组件文件：SetupWizardConnectionStep.vue
  所属模块：frontend/src/features/settings/connect/setup-wizard
  组件职责：初始化向导的第一步「连接」状态展示页（非输入表单，只读型）。顶部两张
    状态卡：HA 连接是否成功（✅/🔌）与实体数量；中部根据 steps.connection.done 显示
    未完成提示并提供前往 HA 连接设置的跳转按钮。
  主要 props / emits：
    - props status：向导状态对象（含 ha.connected / ha.entityCount / steps.connection 等字段）
  依赖关系：引用 SETTINGS_ROUTES.connection() 与 RouterLink 跳转连接设置；
    AlertTriangle / ExternalLink 图标组件；无写操作。
  注意事项：本步骤不直接修改任何配置，只提供状态可视化与跳转入口；用户需到连接页配置
    后再返回本页，status 会自动刷新。
-->
<script setup>
/**
 * 职责：渲染 views/SetupWizardConnectionStep 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { AlertTriangle, ExternalLink } from '@lucide/vue'
import { RouterLink } from 'vue-router'
import { SETTINGS_ROUTES } from '@/shared/utils/registry/settings-route.util'

defineProps({
  status: { type: Object, default: null },
})
</script>

<template>
  <div class="sw-step">
    <div class="sw-stat-grid">
      <div
        :class="['sw-stat-card', status?.ha?.connected ? 'sw-stat-card--ok' : 'sw-stat-card--warn']"
      >
        <span class="sw-stat-card__emoji">{{ status?.ha?.connected ? '✅' : '🔌' }}</span>
        <span class="sw-stat-card__label">{{ 'HA 状态' }}</span>
        <p
          :class="[
            'sw-stat-card__value',
            status?.ha?.connected ? 'sw-stat-card__value--ok' : 'sw-stat-card__value--warn',
          ]"
        >
          {{ status?.ha?.connected ? '已连接，很棒！' : '尚未连接' }}
        </p>
      </div>
      <div class="sw-stat-card sw-stat-card--neutral">
        <span class="sw-stat-card__emoji">📦</span>
        <span class="sw-stat-card__label">{{ '实体数量' }}</span>
        <p class="sw-stat-card__value">{{ status?.ha?.entityCount ?? '—' }}</p>
      </div>
    </div>

    <div v-if="!status?.steps?.connection?.done" class="sw-alert sw-alert--warn">
      <AlertTriangle class="w-4 h-4 shrink-0 mt-0.5" />
      <span>{{
        status?.steps?.connection?.hint || '请先在「HA 连接」中配置地址与 Token，回来这里会自动刷新'
      }}</span>
    </div>

    <div v-if="!status?.ha?.connected" class="sw-actions">
      <RouterLink :to="SETTINGS_ROUTES.connection()" class="sw-btn sw-btn--sky">
        <ExternalLink class="w-3.5 h-3.5" />
        {{ '前往 HA 连接设置' }}
      </RouterLink>
    </div>
  </div>
</template>
<style src="./styles/setup-wizard.css"></style>
