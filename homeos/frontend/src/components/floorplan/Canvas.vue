<template>
  <!-- 平面图画布根容器：承载底图、热点、浮层、楼层切换器 -->
  <div class="floorplan-root" @click="onCanvasClick">
    <!-- 画布包装层：维持底图宽高比，处理拖放/点击/右键 -->
    <div
      ref="wrapperRef"
      class="floorplan-wrapper"
      :class="{
        'floorplan-wrapper--placement': isPlacementMode,
        'floorplan-wrapper--map-zoomed': isMapZoomed,
      }"
      :style="{ aspectRatio: wrapperAspectRatio }"
      @dragover.prevent
      @drop="onWidgetDrop"
      @click="onWrapperClick"
      @contextmenu.prevent
    >
      <!-- 不变量：DOM 热点（HotspotNode / Skeleton）与 Canvas 热点（FloorplanHotspotCanvas）共享此父容器。
           map-world 的 CSS transform = translate(panX, panY) scale(zoom) transform-origin 0 0；
           两种路径热点的布局坐标（xPct%/yPct%）相同，统一由父容器 transform 缩放→视觉位置一致。
           视口裁剪 useFloorplanViewportCull 需按同一变换公式（rect.left + panX + xPct% * rect.width * zoom）判断可见。 -->
      <div class="floorplan-map-world" :style="mapWorldStyle">
      <!-- 编辑模式网格覆盖层（辅助对齐） -->
      <div v-if="isEditMode" class="edit-grid-overlay" aria-hidden="true" />
      <!-- 放置模式横幅：提示用户点击户型图放置实体 -->
      <div v-if="isPlacementMode" class="placement-mode-banner">
        <MousePointerClick class="w-4 h-4" />
        <span>{{ `点击户型图放置「${placementLabel}」` }}</span>
        <button
          type="button"
          class="placement-mode-cancel"
          @click.stop="layoutStore.clearPlacementEntity()"
        >
          {{ '取消' }}
        </button>
      </div>

      <!-- 户型图底图 -->
      <img
        v-if="floor?.backgroundUrl"
        :src="floor.backgroundUrl"
        class="base-image"
        :alt="'户型图'"
        draggable="false"
        @load="onBaseImageLoad"
      />

      <!-- 未上传户型图时的占位提示 -->
      <div v-else class="empty-floorplan-placeholder">
        <div class="flex flex-col items-center gap-6 opacity-80">
          <div
            class="w-20 h-20 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center bg-white/5"
          >
            <span class="text-3xl fc-text-muted font-light">🏠</span>
          </div>
          <div class="text-center space-y-3">
            <span class="block text-base tracking-[0.12em] font-bold fc-text-muted">{{
              '未上传户型图'
            }}</span>
            <span class="block text-sm tracking-wide fc-text-muted">{{
              '请在设置中上传户型图底图，再回来放置设备热点'
            }}</span>
            <RouterLink
              :to="SETTINGS_ROUTES.assets()"
              class="empty-floorplan-cta"
              @click.stop
            >
              {{ '去上传户型图' }}
            </RouterLink>
            <RouterLink
              :to="SETTINGS_ROUTES.layout()"
              class="empty-floorplan-cta empty-floorplan-cta--ghost"
              @click.stop
            >
              {{ '布局设置' }}
            </RouterLink>
          </div>
        </div>
      </div>

      <!-- 叠加图层部件（如灯具光晕），根据实体状态淡入/淡出 -->
      <FloorplanOverlayImage
        v-for="widget in overlayWidgetList"
        :key="'ov-' + widget.id"
        :widget="widget"
      />
      <!-- 热点 Canvas2D 预览层：高性能路径下用 Canvas 绘制图标/圆点/标签 -->
      <FloorplanHotspotCanvas
        v-if="useCanvasPreview"
        :widgets="floorWidgets"
        :visible-ids="visibleIds"
        :active-popup-id="activePopupId"
        :anchor-convention="hotspotAnchorConvention"
        :is-edit-mode="isEditMode"
        :long-press-widget-id="longPressWidgetId"
        :long-press-progress="longPressProgress"
        :dim-hud="dimHud"
        @hotspot-click="onWidgetClick"
        @hotspot-pointer-down="onWidgetMouseDown"
        @hotspot-pointer-up="(_widget, e) => onWidgetMouseUp(e)"
        @hotspot-wheel="onWidgetWheel"
        @hotspot-touch-move="onWidgetTouchMove"
      />

      <!-- 热点骨架层：Canvas 预览准备期间显示占位圆点 -->
      <div v-if="showHotspotSkeleton" class="floorplan-hotspot-skeleton-layer" aria-hidden="true">
        <div
          v-for="w in floorWidgets"
          :key="'sk-' + w.id"
          class="hotspot hotspot--skeleton"
          :style="hotspotAnchorStyle(w)"
        />
      </div>

      <!-- DOM 热点节点：编辑模式或非 Canvas 预览路径下使用 -->
      <template v-for="widget in floorWidgets" :key="'hs-' + widget.id">
        <HotspotNode
          v-if="isWidgetVisible(widget.id) && (!useCanvasPreview || isEditMode)"
          :widget="widget"
          :is-edit-mode="isEditMode"
          :use-batch-display="useBatchDisplay"
          :is-selected="selectedWidgetId === widget.id"
          :is-dragging="draggingWidgetId === widget.id"
          :is-active-popup="!useCanvasPreview && activePopupId === widget.id"
          :long-press-widget-id="longPressWidgetId"
          :long-press-progress="longPressProgress"
          :dim-hud="dimHud"
          :drag-preview="dragPreview"
          :anchor-rect-height="wrapperClientHeight"
          :anchor-convention="hotspotAnchorConvention"
          :popup-anchor="activePopupId === widget.id ? activePopupAnchor : null"
          @mousedown="onWidgetMouseDown(widget, $event)"
          @mouseup="onWidgetMouseUp"
          @wheel="onWidgetWheel(widget, $event)"
          @touchmove="onWidgetTouchMove(widget, $event)"
          @click="onWidgetClick(widget)"
          @remove="onRemoveWidget(widget.id)"
          @close-popup="activePopupId = null"
        />
        <!-- 被视口裁剪的热点：保留占位 DOM 维持布局，避免重排 -->
        <div
          v-else-if="!showHotspotSkeleton && !isWidgetVisible(widget.id)"
          class="hotspot hotspot--culled"
          :style="hotspotAnchorStyle(widget)"
          aria-hidden="true"
        />
      </template>

      <!-- Canvas 预览路径下的弹窗热点：仅渲染弹窗层，不绘制图标 -->
      <template v-for="widget in floorWidgets" :key="'popup-' + widget.id">
        <HotspotNode
          v-if="useCanvasPreview && !isEditMode && activePopupId === widget.id"
          :widget="widget"
          popup-only
          :use-batch-display="useBatchDisplay"
          :is-active-popup="true"
          :anchor-rect-height="wrapperClientHeight"
          :anchor-convention="hotspotAnchorConvention"
          :popup-anchor="activePopupAnchor"
          @close-popup="activePopupId = null"
        />
      </template>

      <!-- 浮动控制中心：按楼层 key 重建，切换楼层时重置状态 -->
      <FloatingHub :key="floor?.id || 'default'" />
      </div>
    </div>

    <!-- 楼层切换器（多楼层时显示） -->
    <FloorSwitcher v-if="showFloorSwitcher" />

    <!-- 编辑模式空状态提示：引导用户拖入或点击放置热区 -->
    <div
      v-if="isEditMode && floor?.widgets?.length === 0 && !isPlacementMode"
      class="edit-hint-premium"
    >
      <div class="edit-hint-icon">
        <MousePointerClick class="w-5 h-5" />
      </div>
      <div>
        <p class="edit-hint-title">{{ '从左侧拖入或点击实体' }}</p>
        <p class="edit-hint-desc">
          {{ '拖拽松开、或选中实体后点击户型图即可放置热区；拖移热点可调整位置' }}
        </p>
      </div>
    </div>
  </div>
</template>
<script setup>
/**
 * @file FloorplanCanvas.vue
 * @module floorplan
 *
 * 平面图画布主组件
 *
 * 职责：
 * - 渲染户型图底图、叠加图层、热点（DOM 或 Canvas 两种路径）、浮动控制中心
 * - 编辑模式：支持拖放放置热区、拖拽调整位置、删除热点
 * - 放置模式：点击户型图放置选中的实体
 * - 预览模式：Canvas 高性能绘制热点 + 长按/滚轮/点击交互
 * - 多楼层切换（FloorSwitcher）、空状态引导
 *
 * 性能路径说明：
 * - useCanvasPreview=true：热点用 Canvas2D 绘制（auto 性能档），DOM 仅渲染弹窗
 * - useCanvasPreview=false：热点用 DOM HotspotNode 渲染（兼容档）
 * - showHotspotSkeleton：Canvas 预览准备期间的骨架占位
 * - visibleIds：视口裁剪，仅渲染可见热点；被裁剪的热点用空 div 占位避免重排
 *
 * 依赖：
 * - @lucide/vue：MousePointerClick 图标
 * - @/assets/styles/layout-edit-theme.css：编辑主题样式
 * - ./styles/floorplan-canvas.css：画布样式
 * - FloorSwitcher / FloatingHub / HotspotNode / FloorplanHotspotCanvas / FloorplanOverlayImage
 * - @/composables/floorplan/useFloorplanCanvas：画布核心逻辑（状态 + 事件处理）
 */
import { MousePointerClick } from '@lucide/vue'
import { RouterLink } from 'vue-router'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import '@/assets/styles/layout-edit-theme.css'
import './styles/floorplan-canvas.css'
import FloorSwitcher from '@/components/floorplan/FloorSwitcher.vue'
import FloatingHub from '@/components/floorplan/FloatingHub.vue'
import HotspotNode from '@/components/floorplan/HotspotNode.vue'
import FloorplanHotspotCanvas from '@/components/floorplan/HotspotCanvas.vue'
import FloorplanOverlayImage from '@/components/floorplan/OverlayImage.vue'
import { useFloorplanCanvas } from '@/composables/floorplan/useFloorplanCanvas'

// 画布核心逻辑组合式函数
const canvas = useFloorplanCanvas()
// 解构响应式状态与事件处理函数
const {
  layoutStore,
  wrapperRef,
  wrapperClientHeight,
  hotspotAnchorConvention,
  hotspotAnchorStyle,
  draggingWidgetId,
  activePopupId,
  isEditMode,
  longPressProgress,
  longPressWidgetId,
  onWidgetMouseDown,
  onWidgetMouseUp,
  onWidgetClick,
  dimHud,
  onWidgetWheel,
  onWidgetTouchMove,
  isPlacementMode,
  placementLabel,
  selectedWidgetId,
  floor,
  wrapperAspectRatio,
  mapWorldStyle,
  isMapZoomed,
  onBaseImageLoad,
  showFloorSwitcher,
  floorWidgets,
  useBatchDisplay,
  useCanvasPreview,
  visibleIds,
  isWidgetVisible,
  showHotspotSkeleton,
  overlayWidgetList,
  activePopupAnchor,
  onCanvasClick,
  onRemoveWidget,
  onWrapperClick,
  onWidgetDrop,
  dragPreview,
} = canvas
</script>

<style scoped>
/* ── Scoped 语义化颜色类（替代 Tailwind 颜色工具类）── */
.fc-text-muted {
  color: var(--set-text-secondary, rgba(255, 255, 255, 0.55));
}

.empty-floorplan-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--touch-min, 44px);
  margin-top: 8px;
  padding: 0 18px;
  border-radius: var(--hos-radius-card);
  font-size: var(--premium-fs-body-sm);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #fff;
  background: var(--accent, #0a84ff);
  text-decoration: none;
}

.empty-floorplan-cta--ghost {
  margin-top: 4px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.22);
  color: rgba(255, 255, 255, 0.75);
  font-weight: 600;
  font-size: var(--premium-fs-caption);
}
</style>