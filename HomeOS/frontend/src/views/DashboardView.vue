<!--
  组件文件：DashboardView.vue
  所属模块：frontend/src/views
  组件职责：仪表板首页（HomeOS 核心展示页）。中央户型图 FloorplanCanvas 渲染楼层平面与可交互热点设备控件，
    左侧编辑态显示 EntitySidebar 实体工具箱，右侧预览态显示 RightSidebar 信息面板（天气、时钟、快捷操作）。
    编辑模式下支持撤销/重做、部件参数调整 WidgetSettings，底部能耗汇总栏 DashboardFooter 与快捷场景行
    FavoriteScenesRow，顶部装配门铃浮层 EventLogOverlay 与设备组批量弹窗 DeviceGroupModal。
  依赖关系：使用 Pinia 的 useEntitiesStore（实体数据）、useLayoutStore（楼层/热点/编辑态/撤销重做）、
    useChromeStore（壳层信息）；通过 vue-router 跳转设置页布局 Tab；懒加载 dashboard-chrome
    合并 chunk（FloorplanCanvas、RightSidebar 等 9 个子组件）以降低首屏请求数；调用 notifyError
    服务处理错误提示，isDevBuild 控制构建环境分支。
  注意事项：页面主色注入 --page-accent 为 emerald 主题变量，编辑态快捷键 Ctrl/Cmd+Z 撤销、
    Ctrl+Y/Ctrl+Shift+Z 重做；空态引导跳转设置页「仪表板布局」Tab 配置户型图。
-->
<script setup>
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/DashboardView 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
/**
 * 仪表板视图（主页面）- 内部实现说明
 * HomeOS 的核心展示页面，集成以下功能：
 *
 * 1. **平面图交互** - FloorplanCanvas 渲染户型图，设备热点控制
 * 2. **背景氛围** - AmbientStatic 静态光晕 + 灯光状态背景图
 * 3. **实体工具箱**（编辑模式）- EntitySidebar 可拖拽实体列表
 * 4. **右侧面板**（预览模式）- RightSidebar 天气/时钟/快捷操作
 * 5. **部件设置**（编辑模式）- WidgetSettings 调整热点参数
 * 6. **事件日志** - EventLogOverlay 实时门铃事件浮层
 * 7. **设备组弹窗** - DeviceGroupModal 批量设备控制
 * 8. **电量统计** - 底部 power-panel 能耗汇总栏
 * 9. **保存按钮** - 编辑模式下的布局保存 FAB
 */
import { ref, computed, watch, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
import { useRouter } from 'vue-router'
import { Save, Loader2, Check, X, LayoutGrid, Undo2, Redo2 } from '@lucide/vue'
import '@/assets/styles/layout-edit-theme.css'
import VEmptyState from '@/components/common/base/VEmptyState.vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useChromeStore } from '@/stores/chrome.store'
import { notifyError } from '@/services/notify'
import { isDevBuild } from '@/utils/core/misc.util'
/** Dashboard 壳层合并为同一动态 chunk，降低首屏瀑布请求 */
const loadDashboardChrome = () => import('@/views/dashboard-chrome')
const FloorplanCanvas = defineAsyncComponent(() =>
  loadDashboardChrome().then((m) => m.FloorplanCanvas),
)
const DeviceGroupModal = defineAsyncComponent(() =>
  loadDashboardChrome().then((m) => m.DeviceGroupModal),
)
const FavoriteScenesRow = defineAsyncComponent(() =>
  loadDashboardChrome().then((m) => m.FavoriteScenesRow),
)
const DashboardFooter = defineAsyncComponent(() =>
  loadDashboardChrome().then((m) => m.DashboardFooter),
)
const EntitySidebar = defineAsyncComponent(() =>
  loadDashboardChrome().then((m) => m.EntitySidebar),
)
const EventLogOverlay = defineAsyncComponent(() =>
  loadDashboardChrome().then((m) => m.EventLogOverlay),
)
const RightSidebar = defineAsyncComponent(() =>
  loadDashboardChrome().then((m) => m.RightSidebar),
)
const WidgetSettings = defineAsyncComponent(() =>
  loadDashboardChrome().then((m) => m.WidgetSettings),
)
const ExitEditConfirmDialog = defineAsyncComponent(() =>
  loadDashboardChrome().then((m) => m.ExitEditConfirmDialog),
)
const entitiesStore = useEntitiesStore()
const layoutStore = useLayoutStore()
const chrome = useChromeStore()
const router = useRouter()

/** 跳转到设置页「仪表板布局」，用于户型图空态引导 */
function goToFloorplanSettings() {
  router.push({ path: '/settings', query: { tab: 'layout' } })
}

/**
 * 页面主色注入（Task 3：Dashboard 应用 emerald 主题）
 * 通过 :style 在根元素注入 --page-accent 与 --page-accent-rgb，
 * scoped CSS 中据此派生 --page-accent-bg/border/glow/text 等变量，
 * 同时为 status 指示器本地声明 --set-* 语义色（与 settings-tokens 保持一致）。
 */
const pageAccentStyle = {
  '--page-accent': 'var(--module-accent-dashboard)',
  '--page-accent-rgb': 'var(--module-accent-dashboard-rgb)',
  '--page-accent-secondary': 'var(--module-accent-dashboard-sub)',
  '--page-accent-secondary-rgb': 'var(--module-accent-dashboard-sub-rgb)',
}

/** 当前激活的楼层配置（无匹配时回退到第一个） */
const activeFloor = computed(() => {
  const floors = layoutStore.layoutConfig.floors || []
  return floors.find((f) => f.id === layoutStore.layoutConfig.activeFloorId) || floors[0] || null
})

/** 当前楼层上的所有控制热点部件 */
const activeFloorWidgets = computed(() => activeFloor.value?.widgets || [])

/** 编辑态下支持 Ctrl/Cmd+Z 撤销、Ctrl+Y / Ctrl+Shift+Z 重做 */
function onEditKeydown(e) {
  if (!layoutStore.isEditMode) return
  const tag = (e.target?.tagName || '').toLowerCase()
  if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return
  const mod = e.ctrlKey || e.metaKey
  if (!mod) return
  const key = e.key.toLowerCase()
  if (key === 'z' && !e.shiftKey) {
    e.preventDefault()
    layoutStore.undoEdit()
  } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
    e.preventDefault()
    layoutStore.redoEdit()
  }
}

onMounted(() => window.addEventListener('keydown', onEditKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onEditKeydown)
  if (saveSuccessTimer) {
    clearTimeout(saveSuccessTimer)
    saveSuccessTimer = null
  }
})

/** 事件日志已启用 且 非编辑模式 */
const showEventLog = computed(
  () => layoutStore.layoutConfig.eventLogConfig?.enabled !== false && !layoutStore.isEditMode,
)

const isSaving = ref(false) // 保存中标志
const saveSuccess = ref(false) // 保存成功提示标志
let saveSuccessTimer = null // 保存成功提示定时器句柄

/** 保存布局到服务端 */
async function onSaveClick() {
  isSaving.value = true
  try {
    const ok = await layoutStore.saveConfig()
    if (!ok) return // saveConfig 已弹出失败提示
    saveSuccess.value = true
    if (saveSuccessTimer) clearTimeout(saveSuccessTimer)
    saveSuccessTimer = setTimeout(() => {
      saveSuccess.value = false
      saveSuccessTimer = null
    }, 2000)
  } catch (e) {
    notifyError(e, '保存布局')
  } finally {
    isSaving.value = false
  }
}

/** 取消选中 */
function deselectWidget() {
  layoutStore.selectedWidgetId = null
}

/** 当前选中的热点部件（不存在时自动取消选择） */
const selectedWidget = computed(() => {
  const id = layoutStore.selectedWidgetId
  if (!id) return null
  return activeFloorWidgets.value.find((w) => w.id === id) ?? null
})

watch(selectedWidget, (w) => {
  if (layoutStore.selectedWidgetId && !w) layoutStore.selectedWidgetId = null
})

/** 更新部件属性 */
function onWidgetUpdate(updatedWidget) {
  if (updatedWidget._entityId) {
    const oldId = updatedWidget.id
    const newId = updatedWidget._entityId
    const autoType = updatedWidget._autoType
    delete updatedWidget._entityId
    delete updatedWidget._autoType
    delete updatedWidget.id

    layoutStore.replaceWidgetId(oldId, newId)
    if (layoutStore.selectedWidgetId === oldId) layoutStore.selectedWidgetId = newId

    const patch = { ...updatedWidget }
    if (autoType) patch.type = autoType
    if (Object.keys(patch).length) layoutStore.updateWidget(newId, patch)
    return
  }
  layoutStore.updateWidget(updatedWidget.id, updatedWidget)
}
/** 删除部件 */
function onWidgetRemove(widgetId) {
  layoutStore.removeWidget(widgetId)
  if (layoutStore.selectedWidgetId === widgetId) layoutStore.selectedWidgetId = null
}

/** 打开设备群组弹窗 */
function onOpenGroup(domain, sensors) {
  chrome.openGroupModal(domain, sensors)
}

/** 检查是否有任意灯光开启（收藏灯走精准订阅，否则用派生 lightCount） */
const isAnyLightOn = computed(() => {
  void entitiesStore.derivedEpoch
  void entitiesStore.getDomainEpoch('light')
  const favLights = layoutStore.layoutConfig.favoriteEntities?.light || []
  if (favLights.length > 0) {
    for (const eid of favLights) {
      if (entitiesStore.entities[eid]?.state === 'on') return true
    }
    return false
  }
  return entitiesStore.lightCount > 0
})

const lightBgImage = computed(() =>
  isAnyLightOn.value
    ? layoutStore.layoutConfig.lightOnBackgroundUrl
    : layoutStore.layoutConfig.lightOffBackgroundUrl,
)

/** 有本地缓存实体时先展示平面图，HA 后台同步不再挡住整页 */
const showBlockingLoad = computed(() => {
  if (!layoutStore.isConfigLoaded) return true
  if (entitiesStore.entitiesStale && entitiesStore.totalCount === 0) return true
  return entitiesStore.loading && entitiesStore.totalCount === 0
})
</script>

<template>
  <div
    class="dashboard-inner flex flex-col h-full w-full relative overflow-hidden"
    :style="pageAccentStyle"
  >
    <div
      class="absolute inset-0 z-[5] pointer-events-none transition-all duration-1500"
      :style="{
        backgroundImage: `url(${lightBgImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        opacity: 0.9,
        filter: 'brightness(1.0) saturate(1.0)',
      }"
    />

    <section
      :class="[
        'dashboard-main flex-1 flex overflow-hidden relative z-10',
        layoutStore.layoutConfig.panelPosition === 'left' ? 'flex-row-reverse' : '',
      ]"
    >
      <EntitySidebar v-if="layoutStore.isEditMode && !layoutStore.selectedWidgetId" />

      <div
        class="floorplan-area"
        :class="{
          'animate-stagger-1': !showBlockingLoad,
          'floorplan-area--edit': layoutStore.isEditMode,
        }"
      >
        <div v-if="!layoutStore.isEditMode" class="dashboard-top-chrome">
          <div class="dashboard-top-chrome__scenes"><FavoriteScenesRow /></div>
        </div>

        <div v-if="showBlockingLoad" class="dashboard-skeleton">
          <VSkeleton variant="card" height="100%" class="dashboard-skeleton__floor" />
          <p class="dashboard-skeleton__hint">
            {{ !layoutStore.isConfigLoaded ? '正在加载布局配置...' : '正在同步 HA 实体状态...' }}
          </p>
        </div>

        <FloorplanCanvas v-else-if="activeFloor" />

        <!-- 未配置任何楼层时的空态引导 -->
        <div v-else class="floorplan-empty">
          <VEmptyState
            icon="🗺️"
            title="尚未配置户型"
            description="请先配置户型并添加楼层，即可在此查看设备热点与楼层布局"
            tone="emerald"
          >
            <template #action>
              <button type="button" class="v-empty__link" @click="goToFloorplanSettings">
                <LayoutGrid class="w-3.5 h-3.5" aria-hidden="true" />
                {{ '前往设置配置户型' }}
              </button>
            </template>
          </VEmptyState>
        </div>

        <div v-if="!showBlockingLoad && entitiesStore.loading" class="sync-hint">
          <span class="sync-hint-dot" aria-hidden="true" />
          {{ 'HA 同步中' }}
        </div>

        <EventLogOverlay v-if="showEventLog && !showBlockingLoad" />

        <div v-if="isDevBuild && layoutStore.layoutConfig.debugMode" class="debug-monitor">
          <div :class="['debug-indicator', { ok: !entitiesStore.loading }]">
            {{ 'HA 同步' }}: {{ entitiesStore.loading ? '等待中' : '就绪' }}
          </div>
          <div :class="['debug-indicator', { ok: layoutStore.isConfigLoaded }]">
            {{ '方案' }}: {{ layoutStore.isConfigLoaded ? layoutStore.activeProfileId : '加载中' }}
          </div>
          <div :class="['debug-indicator', { ok: layoutStore.layoutConfig.floors.length > 0 }]">
            {{ '楼层数' }}: {{ layoutStore.layoutConfig.floors.length }}
          </div>
        </div>

        <div v-if="layoutStore.isEditMode" class="edit-command-dock">
          <div class="edit-command-panel">
            <div class="edit-command-glow" />
            <div class="edit-command-brand">
              <span class="edit-command-badge">
                <span class="edit-command-badge-dot" />
                <LayoutGrid class="w-3 h-3" />
                {{ '布局编辑' }}
              </span>
              <span class="edit-command-meta"
                >{{ activeFloor?.name || '当前楼层' }} ·
                {{ '{n} 个热区'.replace('{n}', String(activeFloorWidgets.length)) }}</span
              >
              <span v-if="layoutStore.layoutDirty" class="edit-command-dirty">{{ '未保存' }}</span>
            </div>
            <div class="edit-command-actions">
              <button
                type="button"
                class="edit-exit-btn"
                :disabled="!layoutStore.canUndoEdit"
                @click="layoutStore.undoEdit()"
              >
                <Undo2 class="w-4 h-4" />
                {{ '撤销' }}
              </button>
              <button
                type="button"
                class="edit-exit-btn"
                :disabled="!layoutStore.canRedoEdit"
                @click="layoutStore.redoEdit()"
              >
                <Redo2 class="w-4 h-4" />
                {{ '重做' }}
              </button>
              <button type="button" class="edit-exit-btn" @click="layoutStore.toggleEditMode()">
                <X class="w-4 h-4" />
                {{ '退出' }}
              </button>
              <button
                type="button"
                class="edit-save-btn"
                :class="{
                  'edit-save-btn--success': saveSuccess,
                  'edit-save-btn--loading': isSaving,
                }"
                :disabled="isSaving"
                @click="onSaveClick"
              >
                <Loader2 v-if="isSaving" class="w-4 h-4 animate-spin" />
                <Check v-else-if="saveSuccess" class="w-4 h-4" />
                <Save v-else class="w-4 h-4" />
                {{ isSaving ? '保存中...' : saveSuccess ? '已保存' : '保存布局' }}
              </button>
            </div>
          </div>
        </div>

        <ExitEditConfirmDialog />
      </div>

      <RightSidebar
        v-if="!layoutStore.isEditMode && !showBlockingLoad"
        class="animate-stagger-2"
        :panel-position="layoutStore.layoutConfig.panelPosition || 'right'"
        @open-group="onOpenGroup"
      />

      <WidgetSettings
        v-if="layoutStore.isEditMode && layoutStore.selectedWidgetId && selectedWidget"
        :key="layoutStore.selectedWidgetId"
        :widget-id="layoutStore.selectedWidgetId"
        :widget="selectedWidget"
        @update="onWidgetUpdate"
        @remove="onWidgetRemove(layoutStore.selectedWidgetId)"
        @close="deselectWidget"
      />

      <DeviceGroupModal
        :is-open="chrome.isGroupModalOpen"
        :domain="chrome.groupModalDomain"
        :stats-sensors="chrome.groupModalSensors"
        @close="chrome.closeGroupModal()"
      />
    </section>

    <DashboardFooter />
  </div>
</template>

<style scoped src="./styles/DashboardView.css"></style>
