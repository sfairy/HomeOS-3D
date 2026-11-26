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
      <!-- 右停靠：展开时 ▷ 指向右=折叠方向 -->
      <!-- 左停靠：展开时 ◁ 指向左=折叠方向 -->
      <ChevronLeft v-if="collapseIcon === 'left'" class="w-3.5 h-3.5" />
      <ChevronRight v-else class="w-3.5 h-3.5" />
    </button>

    <aside v-if="!collapsed" class="info-panel" :class="{ 'info-panel--agent': agentOpen }">
      <!-- 0.8.9 侧边栏页面背景：与主页面共用同一份渲染实现（`page-background-layer`）。
           背景层是绝对定位 + pointer-events:none，不改变 `.info-panel` 的盒模型，
           所以不影响原有部件布局。 -->
      <div ref="backgroundHostRef" class="info-panel__background" aria-hidden="true" />
      <!-- 智能管家面板：与参考实现一致，直接替换信息栏内容（滑入 20px + 渐显），
           槽位由主布局注入，面板自己负责内部滚动。 -->
      <Transition name="slide-fade">
        <div v-if="agentOpen" class="sidebar-agent-container">
          <slot name="agent" />
        </div>
      </Transition>
      <template v-if="!agentOpen">
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
      </template>
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
import { onBeforeUnmount, ref, computed, watch } from 'vue'
import { mountPageBackgroundLayer } from '@/studio/app/renderer/controls/page-background-layer'
import { staticAssetImageSource } from '@/studio/app/renderer/registry/asset-state'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import ErrorBoundary from '@/components/common/ErrorBoundary.vue'
import WidgetPanelSlot from '@/components/dashboard/WidgetPanelSlot.vue'
import { useLayoutStore } from '@/stores/layout.store'
import { useScaling } from '@/composables/ui/useScaling'
import { useCanvasMetrics } from '@/composables/ui/useCanvasMetrics'
import { isTabletCompactViewport } from '@/shared/utils/config/viewport-breakpoints.util'
import { filterWidgetsForProfile } from '@/shared/widget/utils/profile-filter.util'
import type { PanelWidget } from '@/shared/types/layout'
import { getWidgetComponent, getWidgetProps } from '@/components/widgets/widget-registry'
import { getSidebarWidgetClass } from '@/shared/utils/registry/widget-registry-meta'
import { resolveSidebarWidgetHeightPx } from '@/shared/widget/utils/panel-widget-height.util'

const layoutStore = useLayoutStore()

/**
 * 侧边栏页面背景（0.8.9）。
 *
 * 与主页面共用 `mountPageBackgroundLayer`：预设 / 图片 / 铺满 / 自由 / 透明度全部同口径。
 * 配置缺失（`sidebarBackground` 为 undefined）时不插节点 —— 保持旧观感，而不是画一块空白。
 */
const backgroundHostRef = ref<HTMLElement | null>(null)

function renderSidebarBackground() {
  const host = backgroundHostRef.value
  if (!host) return
  host.replaceChildren()
  const background = layoutStore.layoutConfig.sidebarBackground
  if (!background) return
  const layer = mountPageBackgroundLayer({
    background,
    resolveAssetUrl: staticAssetImageSource,
    className: 'hb-page-background--sidebar',
  })
  if (layer) host.append(layer)
}

/**
 * 监听**指纹**而不是整对象：递归监听会在任意属性写入时触发全量比对，
 * 而这里真正消费的只有 9 个标量（来源 / 预设 / 素材 / 透明度 / 布局 / 四个位置）。
 * 指纹相同就不重绘，重绘也只发生在背景真的变了的时候。
 */
const sidebarBackgroundFingerprint = computed(() => {
  const background = layoutStore.layoutConfig.sidebarBackground
  if (!background) return ''
  const position = background.position
  return [
    background.source,
    background.preset,
    background.assetId,
    background.opacity,
    background.layoutMode,
    position?.x,
    position?.y,
    position?.width,
    position?.height,
  ].join('|')
})
watch(sidebarBackgroundFingerprint, () => renderSidebarBackground())
watch(backgroundHostRef, () => renderSidebarBackground())
onBeforeUnmount(() => {
  backgroundHostRef.value?.replaceChildren()
})

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
const { canvasWidth } = useCanvasMetrics()

const panelOuterStyle = computed(() => {
  if (collapsed.value) return { width: '0px' }
  let w = layoutStore.layoutConfig.rightPanelWidth || 260
  // 平板未开缩放：侧栏上限为画布 30%，避免在窄画布挤压户型图。
  // 基准用画布宽度而不是 window.innerWidth：流式模式下二者一致，缩放模式下窗口宽度会把
  // 宽敞的画布误判成紧凑档，把侧栏压窄。
  if (!scalingEnabled.value && isTabletCompactViewport(canvasWidth.value)) {
    w = Math.min(w, Math.round(canvasWidth.value * 0.3))
  }
  return { width: `${w}px` }
})

const visiblePanelWidgets = computed(() =>
  filterWidgetsForProfile(layoutStore.activeProfileId, layoutStore.layoutConfig.rightPanelWidgets || []).filter(
    (w) => w.visible !== false && getWidgetComponent(w.type),
  ),
)

const props = defineProps({
  panelPosition: { type: String, default: 'right' },
  /** 智能管家面板是否占位：为 true 时用面板替换部件内容（参考实现同形态） */
  agentOpen: { type: Boolean, default: false },
})

const emit = defineEmits<{
  (e: 'open-group', domain: string, sensors: unknown): void
}>()

/** 面板要占位时先展开：否则 aside 不渲染，用户点了「智能管家」什么也看不到 */
watch(
  () => props.agentOpen,
  (open) => {
    if (open) collapsed.value = false
  },
  { immediate: true },
)

function onOpenGroup(domain: string, sensors: unknown) {
  emit('open-group', domain, sensors)
}

const isLeft = computed(() => props.panelPosition === 'left')

/**
 * 折叠按钮图标方向：
 * 右停靠：展开 → ▷(right=折叠方向) | 折叠 → ◁(left=展开方向)
 * 左停靠：展开 → ◁(left=折叠方向) | 折叠 → ▷(right=展开方向)
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

<style scoped src="./styles/right-sidebar.css"></style>
