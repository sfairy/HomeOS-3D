<!--
  仪表板右侧（或左侧）信息面板停靠区。折叠按钮箭头根据停靠位置切换左右方向，
  折叠状态写入 localStorage（homeos.right-sidebar.collapsed）刷新后保留；
  展开时按 visiblePanelWidgets 顺序渲染 WidgetPanelSlot 容器（支持自定义高度/样式/类），
  内嵌 clock/weather/weatherForecast/quickActions/customHtml/systemTimeline/tempChart/
  climateCard/heroSwiper/mediaMini 等部件类型，所有部件通过 ErrorBoundary 隔离异常。
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
import { readLocalStorageFlag, writeLocalStorage } from '@/shared/utils/core/local-storage.util'
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
import { isTabletCompactViewport } from '@/shared/utils/config/viewport-breakpoints.util'
import { filterWidgetsForProfile } from '@/shared/widget/utils/profile-filter.util'
import type { PanelWidget } from '@/shared/types/layout'
import { getWidgetComponent, getWidgetProps } from '@/components/widgets/widget-registry'
import { getSidebarWidgetClass } from '@/shared/utils/registry/widget-registry-meta'
import { resolveSidebarWidgetHeightPx } from '@/shared/widget/utils/panel-widget-height.util'

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
