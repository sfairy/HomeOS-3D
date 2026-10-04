<!--
  组件文件：RightSidebar.vue
  所属模块：frontend/src/components/dashboard
  组件职责：仪表板右侧（或左侧）信息面板停靠区。折叠按钮箭头根据停靠位置切换左右方向，
    折叠状态写入 localStorage（homeos.right-sidebar.collapsed）刷新后保留；
    展开时按 visiblePanelWidgets 顺序渲染 WidgetPanelSlot 容器（支持自定义高度/样式/类），
    内嵌 clock/weather/weatherForecast/quickActions/customHtml/systemTimeline/tempChart/
    climateCard/heroSwiper/mediaMini 等部件类型，所有部件通过 ErrorBoundary 隔离异常。
  主要 props / emits：
    - props.panelPosition：'right' 或 'left'，决定停靠方向与折叠箭头。
    - emit open-group(domain, sensors)：quickActions 类部件点击设备组时向父级透传展开事件，
      payload 为域名与传感器组。
  依赖关系：Pinia useLayoutStore（读 layoutConfig 与部件列表）；composable useScaling（视口缩放）；
    ErrorBoundary/WidgetPanelSlot 子组件；utils：viewport-breakpoints（平板紧凑视口）、
    widget/profile-filter.util（按用户角色/家庭模式过滤部件）、registry/widget-registry
    （getWidgetComponent/getWidgetProps/getSidebarWidgetClass）、resolveSidebarWidgetHeightPx。
-->
<template>
  <div
    class="info-panel-outer"
    :class="{ 'info-panel-outer--left': isLeft }"
    :style="panelOuterStyle"
  >
    <button
      type="button"
      class="panel-collapse-btn"
      :aria-label="collapsed ? '展开面板' : '折叠面板'"
      @click="toggleCollapse"
      :title="collapsed ? '展开面板' : '折叠面板'"
    >
      <!-- 右停靠：展开时 ◁ 指向左=折叠方向 -->
      <!-- 左停靠：展开时 ▷ 指向右=折叠方向 -->
      <ChevronLeft v-if="collapseIcon === 'left'" class="w-3.5 h-3.5" />
      <ChevronRight v-else class="w-3.5 h-3.5" />
    </button>

    <aside v-if="!collapsed" class="info-panel">
      <WidgetPanelSlot
        v-for="widget in visiblePanelWidgets"
        :key="widget.id"
        :widget-id="widget.id"
        :widget-type="widget.type"
        :wrapper-class="[
          'widget-wrapper',
          getWidgetClass(widget.type),
          { 'widget-wrapper--custom-h': hasCustomHeight(widget) },
        ]"
        :wrapper-style="getWidgetStyle(widget)"
        v-slot="{ panelVisible }"
      >
        <div v-if="widget.type === 'clock'" class="info-card info-card--widget">
          <ErrorBoundary compact fill :title="widget.type">
            <component
              :is="getWidgetComponent(widget.type)"
              :config="widget.config"
              v-bind="getWidgetProps(widget.type, widget)"
            />
          </ErrorBoundary>
        </div>
        <ErrorBoundary v-else compact fill :title="widget.type">
          <component
            :is="getWidgetComponent(widget.type)"
            :config="widget.config"
            :panel-visible="panelVisible"
            v-bind="getWidgetProps(widget.type, widget)"
            class="h-full min-h-0"
            @open-group="onOpenGroup"
          />
        </ErrorBoundary>
      </WidgetPanelSlot>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { readLocalStorageFlag, writeLocalStorage } from '@/utils/core/local-storage.util'
/**
 * 职责：实现 RightSidebar 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * 右侧信息面板
 * 仪表板右侧区域，以部件（Widget）形式展示天气、时钟、快捷操作等信息。
 *
 * 支持部件类型：
 * - clock：时钟
 * - weather：天气
 * - weatherForecast：未来天气预报
 * - quickActions：快捷操作（灯光/温控/媒体等）
 * - customHtml：自定义 HTML 部件
 * - systemTimeline：系统时间线
 * - tempChart/climateCard：温度图表/温控卡片
 * - heroSwiper：轮播图
 * - mediaMini：媒体迷你控制器
 *
 * 卡片高度：有自定义 cardHeight 用自定义，否则用类型预设像素。
 * 「恢复预设」与保存同一数值时主页高度一致。时钟无自定义时按内容自适应。
 */
import { ref, computed } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import ErrorBoundary from '@/components/common/ErrorBoundary.vue'
import WidgetPanelSlot from '@/components/dashboard/WidgetPanelSlot.vue'
import { useLayoutStore } from '@/stores/layout.store'
import { useScaling } from '@/composables/ui/useScaling'
import { isTabletCompactViewport } from '@/utils/config/viewport-breakpoints.util'
import { filterWidgetsForProfile } from '@/utils/widget/profile-filter.util'
import type { PanelWidget } from '@/types/layout'
import {
  getWidgetComponent,
  getWidgetProps,
  getSidebarWidgetClass,
} from '@/utils/registry/widget-registry'
import { resolveSidebarWidgetHeightPx } from '@/utils/widget/panel-widget-height.util'

const layoutStore = useLayoutStore()

/** 折叠状态持久化键：刷新后保持用户偏好 */
const COLLAPSE_STORAGE_KEY = 'homeos.right-sidebar.collapsed'
const collapsed = ref(readCollapsedState())

function readCollapsedState(): boolean {
  try {
    return readLocalStorageFlag(COLLAPSE_STORAGE_KEY)
  } catch {
    return false
  }
}

function toggleCollapse() {
  collapsed.value = !collapsed.value
  try {
    writeLocalStorage(COLLAPSE_STORAGE_KEY, collapsed.value ? '1' : '0')
  } catch {
    /* 隐私模式等场景写入失败不影响交互 */
  }
}

const { scalingEnabled } = useScaling(computed(() => layoutStore.layoutConfig.pageMaxWidth))

const panelOuterStyle = computed(() => {
  if (collapsed.value) return { width: '0px' }
  let w = layoutStore.layoutConfig.rightPanelWidth || 260
  // 平板未开缩放：侧栏不超过视口 30%，避免挤压户型图。
  // 采用 Math.min 结构直接以 30% 视口宽为上限，避免旧实现的 220px 下限
  // 在窄视口下反向挤压主体区域。
  if (!scalingEnabled.value && isTabletCompactViewport()) {
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : w
    w = Math.min(w, Math.round(viewportW * 0.3))
  }
  return { width: `${w}px` }
})

const visiblePanelWidgets = computed(() =>
  filterWidgetsForProfile(
    layoutStore.activeProfileId,
    layoutStore.layoutConfig.rightPanelWidgets || [],
  ).filter((w) => w.visible !== false && getWidgetComponent(w.type)),
)

const props = defineProps({
  panelPosition: { type: String, default: 'right' },
})

const emit = defineEmits<{
  (e: 'open-group', domain: string, sensors: unknown): void
}>()

function onOpenGroup(domain: string, sensors: unknown) {
  emit('open-group', domain, sensors)
}

const isLeft = computed(() => props.panelPosition === 'left')

/**
 * 折叠按钮图标方向：
 * 右停靠：展开 → ◁(left=折叠方向) | 折叠 → ▷(right=展开方向)
 * 左停靠：展开 → ▷(right=折叠方向) | 折叠 → ◁(left=展开方向)
 *
 * 规则：isLeft ^ collapsed → show left arrow
 */
const collapseIcon = computed(() => {
  return isLeft.value !== collapsed.value ? 'left' : 'right'
})

function getWidgetClass(type: string) {
  return getSidebarWidgetClass(type)
}

/** 已解析出明确像素高度（自定义或类型预设）；时钟无自定义时为 false */
function hasCustomHeight(widget: PanelWidget) {
  return resolveSidebarWidgetHeightPx(widget.type, widget?.config?.cardHeight) > 0
}

/**
 * 恢复预设与自定义使用同一套高度：有 cardHeight 用自定义，否则用类型预设。
 * 不用 !important，以便窄屏横向布局的 max-height 仍能封顶。
 * 解析结果为 0（内容自适应，如时钟）时不锁定像素高度，仅保留
 * .info-card--widget 的全局下限，由面板整体 overflow:auto 兜底滚动。
 */
function getWidgetStyle(widget: PanelWidget) {
  const h = resolveSidebarWidgetHeightPx(widget.type, widget?.config?.cardHeight)
  if (!(h > 0)) return { flex: 'none' }
  const px = `${h}px`
  return { flex: 'none', height: px, minHeight: px, maxHeight: px }
}
</script>

<style scoped src="./styles/RightSidebar.css"></style>
