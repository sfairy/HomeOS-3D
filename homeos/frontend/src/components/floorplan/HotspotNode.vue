<template>
  <!-- 热点节点：非弹窗模式渲染完整热点（图标/圆点 + 标签 + 可选弹窗） -->
  <div
    v-if="!popupOnly"
    ref="rootRef"
    v-memo="hotspotMemoDeps"
    :class="hotspotClasses"
    :style="hotspotStyle"
    role="button"
    tabindex="0"
    :aria-label="`${display.label}${display.stateText ? '：' + display.stateText : ''}`"
    @mousedown="emit('mousedown', $event)"
    @mouseup="emit('mouseup', $event)"
    @touchstart="emit('mousedown', $event)"
    @touchend="emit('mouseup', $event)"
    @touchcancel="emit('mouseup', $event)"
    @click.stop="emit('click', $event)"
    @keydown.enter.prevent="emit('click', $event)"
    @keydown.space.prevent="emit('click', $event)"
    @contextmenu.prevent
  >
    <div class="hotspot__body">
      <!-- 徽章型部件：优先展示状态图标，否则展示数值（含温度/湿度小图标） -->
      <template v-if="widget.type === 'BadgeWidget'">
        <img
          v-if="resolveStateIconUrl(widget.stateIcons?.[display.state])"
          :src="resolveStateIconUrl(widget.stateIcons[display.state])"
          class="hotspot__custom-icon"
          :style="stateIconStyle"
          draggable="false"
        />
        <span v-else class="hotspot__value" :style="badgeValueStyle">
          <HotspotReadingIcon
            v-if="display.readingKind === 'temperature' || display.readingKind === 'humidity'"
            :kind="display.readingKind"
          />
          {{ display.stateText }}
        </span>
      </template>
      <!-- 非徽章型部件：优先展示状态图标，否则展示发光圆点 -->
      <template v-else>
        <img
          v-if="resolveStateIconUrl(widget.stateIcons?.[display.state])"
          :src="resolveStateIconUrl(widget.stateIcons[display.state])"
          class="hotspot__custom-icon"
          :style="stateIconStyle"
          draggable="false"
        />
        <span
          v-else
          :class="['hotspot__dot', { 'hotspot__dot--glow': display.isOn && !widget.overlayImage }]"
          :style="dotStyle"
        />
      </template>

      <!-- 长按径向进度条（编辑模式外，长按进度 > 0 时显示） -->
      <div
        v-if="!isEditMode && longPressWidgetId === widget.id && longPressProgress > 0"
        class="hotspot__radial-conic"
        :style="{ '--lp-progress': longPressProgress }"
        aria-hidden="true"
      />

      <!-- 调光 HUD：展示当前亮度百分比 -->
      <div v-if="dimHud?.widgetId === widget.id" class="hotspot__dim-hud">{{ dimHud.pct }}%</div>

      <!-- 服务调用在途：小转圈提示用户指令已受理，等待 HA 回执 -->
      <div v-if="isCallPending && !isEditMode" class="hotspot__pending" aria-hidden="true" />

      <!-- 编辑模式选中态删除按钮 -->
      <button v-if="isEditMode && isSelected" class="hotspot__delete" @click.stop="emit('remove')">
        ✕
      </button>
    </div>

    <!-- 热点标签文本 -->
    <span class="hotspot__label">{{ display.label }}</span>

    <!-- 活跃弹窗（ErrorBoundary 防止弹窗内错误导致整点失效） -->
    <ErrorBoundary compact :title="widget.id">
      <component
        :is="popupComponent"
        v-if="isActivePopup && popupComponent"
        :key="widget.id"
        v-bind="popupProps"
        :x-pct="widget.xPct"
        :y-pct="widget.yPct"
        :anchor-x="popupAnchor?.anchorX"
        :anchor-y="popupAnchor?.anchorY"
        @close="emit('close-popup')"
      />
    </ErrorBoundary>
  </div>
  <!-- 弹窗专用渲染分支：仅渲染弹窗层（Canvas 预览路径下复用） -->
  <div
    v-else-if="isActivePopup && popupComponent"
    class="hotspot hotspot--popup-only"
    :style="hotspotStyle"
  >
    <ErrorBoundary compact :title="widget.id">
      <component
        :is="popupComponent"
        :key="widget.id"
        v-bind="popupProps"
        :x-pct="widget.xPct"
        :y-pct="widget.yPct"
        :anchor-x="popupAnchor?.anchorX"
        :anchor-y="popupAnchor?.anchorY"
        @close="emit('close-popup')"
      />
    </ErrorBoundary>
  </div>
</template>
<script setup>
/**
 * @file HotspotNode.vue
 * @module floorplan
 *
 * 热点节点组件（DOM 渲染路径）
 *
 * 职责：
 * - 渲染单个热点：状态图标 / 发光圆点 / 徽章数值，含标签文本
 * - 处理鼠标/触摸/键盘交互，转发给父组件（点击/拖拽/滚轮调光/长按）
 * - 编辑模式：选中态高亮 + 删除按钮
 * - 活跃弹窗：动态解析实体对应的弹窗组件并渲染（ErrorBoundary 包裹）
 * - popupOnly 模式：仅渲染弹窗层（Canvas 预览路径下复用本组件渲染弹窗）
 *
 * 性能优化：
 * - v-memo：依赖 hotspotMemoDeps（含 state/isOn 等展示字段）；勿对活跃弹窗返回 []（等价 v-once，会冻结图标）
 * - useBatchDisplay：性能路径下使用父组件批量构建的 display，避免每热点独立 useEntity
 * - wheel 监听手动注册 passive:false，绕过 main.ts 全局被动补丁以支持 preventDefault
 *
 * 依赖：
 * - vue：computed / onMounted / onBeforeUnmount / ref
 * - @/utils/floorplan/floorplan-hotspot-layout.util：热点锚点解析
 * - @/composables/entity/useEntityProjection：实体投影快照
 * - @/composables/floorplan/useFloorplanEntityBatch：批量 display
 * - @/stores/entities.store：实体 Store
 * - @/components/common/ErrorBoundary.vue：错误边界
 * - @/components/floorplan/HotspotReadingIcon.vue：徽章读数图标
 * - @/utils/floorplan/floorplan-widget.util：展示状态构建与图标解析
 * - @/utils/ui/color.util：颜色工具（darkenHex / hexToRgba）
 * - @/utils/entity/entity-projection-display.util：实体展示投影
 * - @/utils/entity/entity-popup-registry：弹窗组件解析与 props
 * - @/assets/styles/floorplan-hotspot.css：样式
 */
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { resolveHotspotAnchorPct } from '@/utils/floorplan/hotspot-layout.util'
import { useEntityProjection } from '@/composables/entity/useEntityProjection'
import { useFloorplanDisplay } from '@/composables/floorplan/useFloorplanEntityBatch'
import { useEntitiesStore } from '@/stores/entities.store'
import ErrorBoundary from '@/components/common/ErrorBoundary.vue'
import HotspotReadingIcon from '@/components/floorplan/HotspotReadingIcon.vue'
import {
  buildWidgetDisplayState,
  resolveStateIconUrl,
} from '@/utils/floorplan/widget.util'
import { darkenHex, hexToRgba } from '@/utils/ui/color.util'
import { resolveEntityForDisplay } from '@/utils/entity/projection-display.util'
import {
  resolveEntityPopupComponent,
  getEntityPopupProps,
} from '@/utils/entity/popup-registry'
import '@/assets/styles/floorplan-hotspot.css'

// 组件 props
const props = defineProps({
  // 部件配置对象
  widget: { type: Object, required: true },
  // 是否编辑模式
  isEditMode: { type: Boolean, default: false },
  /** auto/canvas 性能路径：走批量 display，避免每热点独立 useEntity */
  useBatchDisplay: { type: Boolean, default: false },
  // 是否选中（编辑模式高亮）
  isSelected: { type: Boolean, default: false },
  // 是否拖拽中
  isDragging: { type: Boolean, default: false },
  // 是否为活跃弹窗
  isActivePopup: { type: Boolean, default: false },
  // 长按中的部件 ID
  longPressWidgetId: { type: String, default: null },
  // 长按进度（0-1）
  longPressProgress: { type: Number, default: 0 },
  // 调光 HUD 数据
  dimHud: { type: Object, default: null },
  /** 拖拽浅层预览坐标（仅当前拖拽热点使用，避免写 layoutConfig） */
  dragPreview: { type: Object, default: null },
  // 弹窗锚点信息
  popupAnchor: { type: Object, default: null },
  // 锚点容器高度（用于弹窗方向判断）
  anchorRectHeight: { type: Number, default: 0 },
  // 布局级热点锚点约定
  anchorConvention: { type: String, default: undefined },
  /** 仅渲染弹窗层（诊断/特殊场景） */
  popupOnly: { type: Boolean, default: false },
})

// 向父组件发射的事件
const emit = defineEmits([
  'mousedown',
  'mouseup',
  'wheel',
  'touchmove',
  'click',
  'remove',
  'close-popup',
])

// 根元素引用
const rootRef = ref(null)
/**
 * 滚轮调光需要 preventDefault，但 main.ts 的全局 addEventListener 补丁会把未显式
 * 指定 passive 的 wheel 监听强制为 passive（导致 preventDefault 失效）。
 * 这里以显式 { passive: false } 手动注册以绕过该补丁，而非依赖模板的 @wheel。
 */
function forwardWheel(event) {
  emit('wheel', event)
}
function forwardTouchMove(event) {
  emit('touchmove', event)
}
onMounted(() => {
  rootRef.value?.addEventListener('wheel', forwardWheel, { passive: false })
  // 竖滑调光需 preventDefault，显式 passive:false 绕过 main.ts 全局补丁
  rootRef.value?.addEventListener('touchmove', forwardTouchMove, { passive: false })
})
onBeforeUnmount(() => {
  rootRef.value?.removeEventListener('wheel', forwardWheel)
  rootRef.value?.removeEventListener('touchmove', forwardTouchMove)
})

// 实体 Store
const entitiesStore = useEntitiesStore()
/** 监听 state listener + derivedEpoch，驱动 display 重算 */
// 弹窗专用或批量模式时不独立订阅实体（由父组件统一驱动）
const entitySnap = useEntityProjection(() => {
  if (props.popupOnly || props.useBatchDisplay) return null
  return props.widget.id
})
// 批量 display（性能路径下由父组件注入）
const batchDisplay = useFloorplanDisplay(() => (props.useBatchDisplay ? props.widget.id : null))
/**
 * 部件展示状态
 * 故意访问 derivedEpoch 与 entitySnap.value 建立响应式追踪；
 * 批量模式优先用 batchDisplay，回退到独立构建。
 */
const display = computed(() => {
  void entitiesStore.derivedEpoch
  void entitySnap?.value
  const fallback = () =>
    buildWidgetDisplayState(props.widget, resolveEntityForDisplay(props.widget?.id))
  if (props.useBatchDisplay) {
    return batchDisplay?.value ?? fallback()
  }
  return fallback()
})

/** 是否为本节点的长按目标（避免 longPressProgress 污染全量 v-memo） */
const isLongPressTarget = computed(
  () => !!props.longPressWidgetId && props.longPressWidgetId === props.widget?.id,
)
/** 是否为本节点的调光 HUD 目标 */
const isDimHudTarget = computed(
  () => !!props.dimHud?.widgetId && props.dimHud.widgetId === props.widget?.id,
)
/** 实体服务调用在途：pendingEntityIds 为 reactive Set，computed 内调用可响应式跟踪 */
const isCallPending = computed(
  () => !!props.widget?.id && entitiesStore.isEntityCallPending?.(props.widget.id) === true,
)
/** 拖拽预览是否作用于本节点 */
const isDragPreviewTarget = computed(
  () => !!props.dragPreview?.widgetId && props.dragPreview.widgetId === props.widget?.id,
)

/** 编辑态须跟踪坐标/拖拽；预览态仅 memo 实体展示字段以减负 */
const hotspotMemoDeps = computed(() => {
  // 展示字段：弹窗打开时也必须纳入，否则 return [] 等价 v-once，图标状态冻结到关窗才刷新
  const d = display.value
  const displayDeps = [
    d?.state,
    d?.isOn,
    d?.stateText,
    d?.stateColor,
    d?.readingKind,
  ]
  if (props.isEditMode) {
    const preview = isDragPreviewTarget.value ? props.dragPreview : null
    // 编辑模式：跟踪坐标/缩放/旋转/类型/标签/选中/拖拽；预览坐标仅本节点订阅
    return [
      preview?.xPct ?? props.widget?.xPct,
      preview?.yPct ?? props.widget?.yPct,
      props.widget?.iconScale,
      props.widget?.iconRotate,
      props.widget?.type,
      props.widget?.label,
      props.isSelected,
      props.isDragging,
      ...displayDeps,
    ]
  }
  // 预览 / 弹窗打开：跟踪实体展示字段；长按进度 / dimHud 仅目标节点订阅
  return [
    ...displayDeps,
    props.isSelected,
    props.isActivePopup,
    isCallPending.value,
    isLongPressTarget.value ? props.longPressProgress : 0,
    isDimHudTarget.value ? props.dimHud?.pct : null,
  ]
})

// 热点锚点百分比坐标（拖拽中优先浅层 preview）
const hotspotAnchor = computed(() => {
  if (isDragPreviewTarget.value && props.dragPreview) {
    return { xPct: props.dragPreview.xPct, yPct: props.dragPreview.yPct }
  }
  return resolveHotspotAnchorPct(props.widget)
})

// 状态颜色（来自展示状态，无则为 null）
const stateColor = computed(() => display.value?.stateColor || null)

/**
 * 圆点样式：开启时径向渐变 + 多层光晕；关闭时半透明填充
 */
const dotStyle = computed(() => {
  const c = stateColor.value
  if (!c) return undefined
  if (display.value?.isOn && !props.widget?.overlayImage) {
    return {
      background: `radial-gradient(circle, ${c} 0%, ${darkenHex(c)} 100%)`,
      borderColor: hexToRgba(c, 0.65),
      boxShadow: `0 0 16px 4px ${hexToRgba(c, 0.5)}, 0 0 32px 2px ${hexToRgba(c, 0.22)}, 0 4px 12px rgba(0,0,0,0.3)`,
    }
  }
  return {
    background: hexToRgba(c, 0.38),
    borderColor: hexToRgba(c, 0.45),
    boxShadow: `0 0 8px ${hexToRgba(c, 0.2)}`,
  }
})

/**
 * 状态图标样式：根据开关状态调整 drop-shadow 光晕强度
 */
const stateIconStyle = computed(() => {
  const c = stateColor.value
  if (!c) return undefined
  const glow = display.value?.isOn ? 0.7 : 0.4
  return {
    filter: `drop-shadow(0 0 10px ${hexToRgba(c, glow)}) drop-shadow(0 3px 10px rgba(0,0,0,0.5))`,
  }
})

/**
 * 徽章数值样式：颜色跟随状态色
 */
const badgeValueStyle = computed(() => {
  const c = stateColor.value
  if (!c) return undefined
  return {
    color: c,
  }
})
/**
 * 热点内联样式：百分比定位 + 图标缩放/旋转 + 状态色 CSS 变量
 */
const hotspotStyle = computed(() => ({
  left: (hotspotAnchor.value?.xPct ?? 0) + '%',
  top: (hotspotAnchor.value?.yPct ?? 0) + '%',
  '--icon-scale': (props.widget?.iconScale || 100) / 100,
  '--icon-rotate': (props.widget?.iconRotate || 0) + 'deg',
  '--badge-blur': 'none',
  ...(stateColor.value
    ? {
        '--state-color': stateColor.value,
        '--state-color-glow': hexToRgba(stateColor.value, 0.5),
      }
    : {}),
}))

/**
 * 热点 class 集合：基础类 + 部件类型类 + 状态类（选中/编辑/弹窗/拖拽）
 */
const hotspotClasses = computed(() => [
  'hotspot',
  {
    'gpu-isolate-light': props.isActivePopup || props.isDragging,
    'hotspot--on': !!display.value?.isOn,
    'hotspot--badge': props.widget?.type === 'BadgeWidget',
    'hotspot--climate': props.widget?.type === 'ClimateWidget',
    'hotspot--fan': props.widget?.type === 'FanWidget',
    'hotspot--water-heater': props.widget?.type === 'WaterHeaterWidget',
    'hotspot--media': props.widget?.type === 'MediaWidget',
    'hotspot--cover': props.widget?.type === 'CoverWidget',
    'hotspot--purifier': props.widget?.type === 'WaterPurifierWidget',
    'hotspot--air-purifier': props.widget?.type === 'AirPurifierWidget',
    'hotspot--dispenser': props.widget?.type === 'DispenserWidget',
    'hotspot--fridge': props.widget?.type === 'FridgeWidget',
    'hotspot--fresh-air': props.widget?.type === 'FreshAirWidget',
    'hotspot--washer': props.widget?.type === 'WashingMachineWidget',
    'hotspot--hood': props.widget?.type === 'RangeHoodWidget',
    'hotspot--stove': props.widget?.type === 'GasStoveWidget',
    'hotspot--motion': props.widget?.type === 'MotionSensorWidget',
    'hotspot--leak': props.widget?.type === 'LeakSensorWidget',
    'hotspot--gas-sensor': props.widget?.type === 'GasSensorWidget',
    'hotspot--smoke': props.widget?.type === 'SmokeSensorWidget',
    'hotspot--co': props.widget?.type === 'CoSensorWidget',
    'hotspot--env-sensor': props.widget?.type === 'EnvironmentSensorWidget',
    'hotspot--lock': props.widget?.type === 'LockWidget',
    'hotspot--vacuum': props.widget?.type === 'VacuumWidget',
    'hotspot--camera': props.widget?.type === 'CameraWidget',
    'hotspot--humidifier': props.widget?.type === 'HumidifierWidget',
    'hotspot--scene': props.widget?.type === 'SceneWidget',
    'hotspot--alarm': props.widget?.type === 'AlarmWidget',
    'hotspot--siren': props.widget?.type === 'SirenWidget',
    'hotspot--valve': props.widget?.type === 'ValveWidget',
    'hotspot--remote': props.widget?.type === 'RemoteWidget',
    'hotspot--selected': props.isSelected && props.isEditMode,
    'hotspot--edit': props.isEditMode,
    'hotspot--active-popup': props.isActivePopup,
    'hotspot--pending': isCallPending.value,
    'is-dragging': props.isDragging,
  },
])

/**
 * 弹窗组件：仅活跃弹窗时解析对应实体类型的弹窗组件
 */
const popupComponent = computed(() => {
  if (!props.isActivePopup || !props.widget?.id) return null
  return resolveEntityPopupComponent(props.widget.id, entitiesStore.entities)
})

/**
 * 弹窗 props：通过 getEntityPopupProps 解析实体对应的弹窗属性
 */
const popupProps = computed(() => {
  if (!props.isActivePopup || !props.widget?.id) return {}
  return getEntityPopupProps(props.widget.id, (id) => entitiesStore.getEntity(id))
})
</script>