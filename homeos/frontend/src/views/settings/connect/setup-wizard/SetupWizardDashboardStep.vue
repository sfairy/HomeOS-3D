<!--
  SetupWizardDashboardStep：户型图 / 热点入口 / 常用设备（可跳过）
-->
<script setup>
/**
 * 职责：渲染 views/SetupWizardDashboardStep 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { LayoutTemplate, MapPinned, Star, ArrowRight, CheckCircle2, Circle } from '@lucide/vue'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

const props = defineProps({
  status: { type: Object, default: null },
})

const done = computed(() => Boolean(props.status?.steps?.dashboard?.done))
const hint = computed(() => props.status?.steps?.dashboard?.hint || '')

const links = [
  {
    id: 'assets',
    icon: LayoutTemplate,
    title: '上传户型图',
    desc: '素材库上传楼层背景，总览才有真实平面',
    to: SETTINGS_ROUTES.assets(),
  },
  {
    id: 'layout',
    icon: MapPinned,
    title: '摆放设备热点',
    desc: '仪表板布局 → 楼层管理，对齐实体位置',
    to: SETTINGS_ROUTES.layout('floors'),
  },
  {
    id: 'favorites',
    icon: Star,
    title: '配置常用设备',
    desc: '至少收藏若干设备，供总览快捷入口',
    to: SETTINGS_ROUTES.favorites(),
  },
]
</script>

<template>
  <div class="sw-step sw-dashboard-step">
    <p class="sw-dashboard-step__lead">
      {{ '墙屏体验依赖户型与常用入口。本步可选，稍后也可在设置里补齐；完成后清单会提示剩余项。' }}
    </p>

    <div class="sw-dashboard-step__status" :class="done ? 'is-done' : 'is-pending'">
      <component :is="done ? CheckCircle2 : Circle" class="w-4 h-4 shrink-0" />
      <span>{{ done ? '仪表板基础已就绪' : hint || '建议上传户型或收藏至少 1 个常用设备' }}</span>
    </div>

    <ul class="sw-dashboard-step__links">
      <li v-for="item in links" :key="item.id">
        <RouterLink :to="item.to" class="sw-dashboard-step__link">
          <span class="sw-dashboard-step__orb">
            <component :is="item.icon" class="w-4 h-4" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="sw-dashboard-step__title">{{ item.title }}</span>
            <span class="sw-dashboard-step__desc">{{ item.desc }}</span>
          </span>
          <ArrowRight class="w-4 h-4 shrink-0 opacity-50" />
        </RouterLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.sw-dashboard-step__lead {
  margin: 0 0 14px;
  font-size: var(--premium-fs-caption);
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.62);
}

.sw-dashboard-step__status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 10px 12px;
  border-radius: var(--hos-radius-card);
  font-size: var(--set-fs-micro, 12px);
  font-weight: 600;
}

.sw-dashboard-step__status.is-done {
  background: rgba(52, 211, 153, 0.1);
  color: #6ee7b7;
  border: 1px solid rgba(52, 211, 153, 0.25);
}

.sw-dashboard-step__status.is-pending {
  background: rgba(251, 191, 36, 0.08);
  color: #fcd34d;
  border: 1px solid rgba(251, 191, 36, 0.22);
}

.sw-dashboard-step__links {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sw-dashboard-step__link {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 12px 14px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: inherit;
  text-decoration: none;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.sw-dashboard-step__link:hover {
  background: rgba(10, 132, 255, 0.1);
  border-color: rgba(10, 132, 255, 0.28);
}

.sw-dashboard-step__orb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--hos-radius-card);
  background: rgba(10, 132, 255, 0.14);
  color: #7dd3fc;
}

.sw-dashboard-step__title {
  display: block;
  font-size: var(--premium-fs-caption);
  font-weight: 700;
  color: rgba(255, 255, 255, 0.92);
}

.sw-dashboard-step__desc {
  display: block;
  margin-top: 2px;
  font-size: var(--set-fs-micro, 12px);
  color: var(--hos-text-secondary);
  line-height: 1.4;
}
</style>
