<!--
组件：MobileMoreView.vue
所属模块：frontend / src / views
职责：移动端「更多」页——功能入口网格（设备/安防/设置）。
数据来源：入口列表为本组件内置静态配置（id/label/desc/icon/path/accent）。
关键交互：点击卡片调 router.push 跳转到对应移动端子路由。
-->
<script setup lang="ts">
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/MobileMoreView 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
/**
 * 移动端「更多」页：功能入口网格。
 */
import { useRouter } from 'vue-router'
import { Cpu, Settings, ShieldCheck } from '@lucide/vue'

const router = useRouter()

// 入口列表：id 唯一 key；accent 控制卡片配色（RGB 三元组字符串用于 CSS 变量）
const entries = [
  { id: 'devices', label: '全部设备', desc: '按域分组浏览与控制全部实体', icon: Cpu, path: '/m/devices', accent: '56, 189, 248' },
  { id: 'security', label: '安防', desc: '布防状态与模式切换', icon: ShieldCheck, path: '/m/security', accent: '251, 113, 133' },
  { id: 'settings', label: '设置', desc: '面板部件、房间与系统设置', icon: Settings, path: '/m/settings', accent: '167, 139, 250' },
] as const

/** 点击入口卡片跳转到对应路由。 */
function go(path: string) {
  void router.push(path)
}
</script>

<template>
  <div class="m-page" style="--m-accent-rgb: 148, 163, 184">
    <header class="m-page__header">
      <p class="m-page__eyebrow">功能</p>
      <h1 class="m-page__title">更多</h1>
      <p class="m-page__sub">设备、安防与系统设置入口</p>
    </header>

    <div class="m-more-grid">
      <button
        v-for="entry in entries"
        :key="entry.id"
        type="button"
        class="m-more-card"
        :style="{ '--m-accent-rgb': entry.accent }"
        @click="go(entry.path)"
      >
        <span class="m-more-card__icon">
          <component :is="entry.icon" class="m-more-card__svg" />
        </span>
        <span class="m-more-card__body">
          <span class="m-more-card__label">{{ entry.label }}</span>
          <span class="m-more-card__desc">{{ entry.desc }}</span>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.m-more-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.m-more-card {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 76px;
  padding: 14px 16px;
  border-radius: var(--hos-radius-panel, 20px);
  border: var(--hos-hairline, 1px) solid rgba(255, 255, 255, 0.1);
  background:
    radial-gradient(ellipse 70% 90% at 0% 50%, rgba(var(--m-accent-rgb), 0.16), transparent 60%),
    rgba(0, 0, 0, 0.22);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.m-more-card__icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: var(--hos-radius-card);
  background: rgba(var(--m-accent-rgb), 0.18);
  border: var(--hos-hairline, 1px) solid rgba(var(--m-accent-rgb), 0.4);
}

.m-more-card__svg {
  width: 22px;
  height: 22px;
  color: rgb(var(--m-accent-rgb));
}

.m-more-card__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.m-more-card__label {
  font-size: var(--premium-fs-title);
  font-weight: 750;
}

.m-more-card__desc {
  font-size: var(--premium-fs-micro);
  color: var(--hos-text-secondary);
}
</style>
