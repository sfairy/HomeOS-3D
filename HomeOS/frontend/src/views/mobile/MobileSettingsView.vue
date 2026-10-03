<!--
组件：MobileSettingsView.vue
所属模块：frontend / src / views
职责：移动端「设置」页——按桌面 NAV_STRUCTURE 分组列表 + 抽屉复用桌面设置面板。
数据来源：
  - 导航结构来自 settings-nav.util 的 NAV_STRUCTURE / groupLabel / tabLabel；
  - 未保存 tab 列表来自 getIndependentPendingTabIds；
  - 面板组件映射来自 settings/nav 的 PANEL_MAP / DEFAULT_TAB / resolveTab / isAdminOnlyTab。
关键交互：
  - 仅展示 MOBILE_SETTINGS_TABS 白名单中的 tab，且管理员独占 tab 受 isAdmin 控制；
  - 点击列表项打开底部抽屉，内嵌对应桌面设置面板（懒加载主题样式）；
  - 列表项右侧黄点表示该 tab 有未保存更改。
-->
<script setup lang="ts">
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/MobileSettingsView 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
/**
 * 移动端「设置」页：分组列表，抽屉内复用现有设置面板。
 */
import { computed, ref, type Component } from 'vue'
import { ChevronRight } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth.store'
import { NAV_STRUCTURE, groupLabel, tabLabel } from '@/utils/registry/settings-nav.util'
import { getIndependentPendingTabIds } from '@/composables/settings/pending.internals'
import { DEFAULT_TAB, isAdminOnlyTab, PANEL_MAP, resolveTab } from '@/views/settings/nav'
/** 抽屉复用桌面设置面板；与 /settings 是独立懒加载路由，必须自带主题样式 */
import '@/views/settings/shared/settings-theme.css'

const authStore = useAuthStore()

const isAdmin = computed(() => authStore.role === 'admin')

/** 设置分组：id + 中文标签 + 该组在移动端可见的 tab 列表。 */
interface SettingsGroup {
  id: string
  label: string
  tabs: string[]
}

// 未保存更改的独立 tab 列表：用于顶部「未保存」区与列表项黄点提示
const pendingTabIds = computed(() => getIndependentPendingTabIds())

// 移动端可见 tab 白名单：与桌面端不同，仅暴露适合小屏的子集
const MOBILE_SETTINGS_TABS = new Set([
  'connection',
  'bindings',
  'rooms',
  'env-health',
  'life-accounts',
  'smart-charge',
  'favorites',
  'general',
  'voice',
  'agent',
  'access',
  'alerts',
  'home-mode',
  'security-modes',
  'smart-services',
  'family',
  'retention',
  'network',
])

// 分组列表：基于 NAV_STRUCTURE 过滤白名单与管理员权限，空组自动隐藏
const groups = computed<SettingsGroup[]>(() =>
  NAV_STRUCTURE.map((g: { id: string; tabs: string[] }) => ({
    id: g.id,
    label: groupLabel(g.id),
    tabs: g.tabs.filter(
      (tab) => MOBILE_SETTINGS_TABS.has(tab) && (!isAdminOnlyTab(tab) || isAdmin.value),
    ),
  })).filter((g) => g.tabs.length > 0),
)

const openTab = ref('')
const sheetOpen = ref(false)

// 抽屉中渲染的面板组件：按 openTab 解析，未命中回退 DEFAULT_TAB
const activePanel = computed<Component>(() => {
  if (!openTab.value) return PANEL_MAP[DEFAULT_TAB]
  return PANEL_MAP[resolveTab(openTab.value) as keyof typeof PANEL_MAP] || PANEL_MAP[DEFAULT_TAB]
})

/** 打开某 tab 的抽屉：记录当前 tab 并展开 sheet。 */
function openPanel(tab: string) {
  openTab.value = tab
  sheetOpen.value = true
}

/** 关闭抽屉并清空当前 tab。 */
function closeSheet() {
  sheetOpen.value = false
  openTab.value = ''
}
</script>

<template>
  <div class="m-page">
    <header class="m-page__header">
      <p class="m-page__eyebrow">系统</p>
      <h1 class="m-page__title">设置</h1>
      <p class="m-page__sub">环境健康、儿童模式、告警与系统设置</p>
    </header>

    <section v-if="pendingTabIds.length" class="m-settings-pending">
      <p class="m-page__card-label">未保存</p>
      <div class="m-settings-pending__list">
        <button
          v-for="tab in pendingTabIds"
          :key="tab"
          type="button"
          class="m-settings-pending__item"
          @click="openPanel(tab)"
        >
          {{ tabLabel(tab) }}
        </button>
      </div>
    </section>

    <section v-for="group in groups" :key="group.id" class="m-settings-group">
      <p class="m-page__card-label m-settings-group__label">{{ group.label }}</p>
      <ul class="m-settings-group__list">
        <li v-for="tab in group.tabs" :key="tab">
          <button type="button" class="m-settings-group__item" @click="openPanel(tab)">
            <span class="m-settings-group__name">{{ tabLabel(tab) }}</span>
            <span
              v-if="pendingTabIds.includes(tab)"
              class="m-settings-group__dot"
              title="有未保存更改"
            />
            <ChevronRight class="m-settings-group__chevron" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </section>

    <p v-if="!groups.length" class="m-page__hint">{{ '暂无可用设置项' }}</p>
    <p class="m-page__hint">{{ '户型布局、联动编辑器与高级参数请在电脑上配置。' }}</p>

    <div v-if="sheetOpen" class="m-page__sheet" @click.self="closeSheet">
      <div class="m-page__sheet-panel m-page__sheet-panel--tall m-settings-sheet">
        <div class="m-settings-sheet__head">
          <h2>{{ tabLabel(openTab) }}</h2>
          <button type="button" class="m-page__btn m-page__btn--ghost" @click="closeSheet">
            关闭
          </button>
        </div>
        <div class="m-settings-sheet__body">
          <component :is="activePanel" :key="openTab" :active-tab="openTab" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.m-settings-pending {
  margin: 0 0 16px;
}

.m-settings-pending__list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.m-settings-pending__item {
  min-height: 36px;
  padding: 6px 12px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(251, 191, 36, 0.3);
  background: rgba(251, 191, 36, 0.1);
  color: rgba(255, 255, 255, 0.88);
  font-size: var(--premium-fs-micro);
  font-weight: 700;
  cursor: pointer;
}

.m-settings-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.m-settings-group__label {
  margin: 0;
  padding: 0 4px;
}

.m-settings-group__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.m-settings-group__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 48px;
  padding: 0 14px;
  border-radius: var(--hos-radius-card, 14px);
  background: var(--set-glass-bg, rgba(255, 255, 255, 0.075));
  border: var(--hos-hairline, 1px) solid var(--set-border-subtle, rgba(255, 255, 255, 0.1));
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    opacity 0.2s ease;
}

.m-settings-group__item:hover {
  background: rgba(255, 255, 255, 0.11);
  border-color: rgba(255, 255, 255, 0.18);
}

.m-settings-group__item:active {
  opacity: 0.8;
}

.m-settings-group__name {
  flex: 1;
  font-size: var(--set-fs-body, 15px);
  font-weight: 700;
  color: var(--set-text-heading);
}

.m-settings-group__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fbbf24;
  flex-shrink: 0;
}

.m-settings-group__chevron {
  width: 18px;
  height: 18px;
  opacity: 0.45;
  flex-shrink: 0;
}

.m-settings-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.m-settings-sheet__head h2 {
  margin: 0;
  font-size: var(--premium-fs-title);
  font-weight: 800;
}

.m-settings-sheet {
  width: min(100%, 520px);
  max-width: calc(100vw - 32px);
  overflow-x: hidden;
}

.m-settings-sheet__body {
  min-width: 0;
  overflow-x: auto;
  overflow-y: visible;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.m-settings-sheet__body :deep(.settings-tab-panel-root),
.m-settings-sheet__body :deep(.settings-panel),
.m-settings-sheet__body :deep(.settings-acc) {
  min-width: 0;
  max-width: 100%;
}

.m-settings-sheet__body :deep(table),
.m-settings-sheet__body :deep(.settings-grid) {
  max-width: 100%;
}
</style>
