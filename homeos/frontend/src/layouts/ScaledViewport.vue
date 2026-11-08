<template>
  <div
    class="viewport-frame"
    :class="[
      frameClass,
      {
        'viewport-frame--static-glow': pauseViewportGlow,
      },
    ]"
    :style="mergedFrameStyle"
  >
    <slot name="backdrop" />
    <!--
      viewport-stage：DOM 占位，始终 display:contents（不产生布局影响）。
      保留它是为了给「画布」一个语义上的包裹层，方便将来切换缩放策略。
    -->
    <div class="viewport-stage" :style="stageStyle">
      <!-- app-shell：实际被缩放/居中的主体，附加性能 class 与 resizing 过渡 class -->
      <div
        :class="[
          'app-shell',
          shellClass,
          {
            'app-shell--scaling': scalingOn,
            'app-shell--resizing': scalingOn && isResizing,
          },
        ]"
        :style="computedShellStyle"
      >
        <!-- 全局 teleport 挂载点：所有脱离文档流的浮层都会被 teleport 到这里 -->
        <div id="teleport-target" class="teleport-target" />
        <div
          class="app-shell__content"
          :class="{ 'app-shell__content--fluid': !scalingOn }"
          :style="wrapperContentStyle"
        >
          <slot />
        </div>
        <!-- 全局通知组件（toast 等）；主壳传 below-topbar，避免遮挡顶栏导航与全局操作 -->
        <VNotification :placement="notificationPlacement" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, toRef, watch, onUnmounted } from 'vue'
import VNotification from '@/components/common/base/VNotification.vue'
import { useLayoutStore } from '@/stores/layout.store'
import { useEntitiesStore } from '@/stores/entities.store'
import { useScaling, holdScaledCanvasFlag } from '@/composables/ui/useScaling'
import { getConfigSection, configEpoch, getWorkerDerivedThreshold } from '@/shared/utils/config/frontend-config'
import { resolveDesignMetrics } from '@/shared/utils/layout/canvas-layout.util'
import { adaptiveTier } from '@/shared/utils/perf/adaptive-perf.util'

const props = defineProps({
  // 外层 frame 的附加 class（用于不同布局场景区分样式）
  frameClass: { type: [String, Array, Object], default: '' },
  // 外层 frame 的内联样式（通常用于注入导航栏宽度等动态值）
  frameStyle: { type: Object, default: () => ({}) },
  // app-shell 的附加 class（用于性能自适应 class 注入）
  shellClass: { type: [String, Array, Object], default: '' },
  // 覆盖单页最大宽度，未传时回退到 layoutConfig.pageMaxWidth / 配置基准宽度 / 1366
  pageMaxWidth: { type: Number, default: null },
  /** 独立全屏页（如部件构建器）强制整页等比缩放，不受用户缩放偏好影响 */
  forceScaling: { type: Boolean, default: false },
  /** 全局通知位置：top（默认）| below-topbar（主壳顶栏下方） */
  notificationPlacement: { type: String, default: 'top' },
})

const layoutStore = useLayoutStore()
const entitiesStore = useEntitiesStore()

// 是否暂停 viewport 边框微光：实体数量超 worker 派生阈值 或 性能档位非 high 时关闭
// 读取 configEpoch 用于建立对前端配置变更的响应式依赖
const pauseViewportGlow = computed(() => {
  configEpoch.value
  return entitiesStore.totalCount >= getWorkerDerivedThreshold() || adaptiveTier.value !== 'high'
})

// 解析生效的设计基准宽度：props.pageMaxWidth > layoutConfig.pageMaxWidth > 配置 scaleBaseWidth > 1366
// 统一走 resolveDesignMetrics，保证设置页预览、屏保与真实壳层用同一套 fallback 顺序。
const resolvedMaxWidth = computed(() => {
  configEpoch.value
  return resolveDesignMetrics({
    pageMaxWidth: props.pageMaxWidth ?? layoutStore.layoutConfig.pageMaxWidth,
    ui: getConfigSection('ui'),
  }).width
})

// 流式模式的宽度上限。
// 旧行为：直接用 layoutConfig.pageMaxWidth（默认 1366）当 max-width，于是 1920/2560 的
// 大屏两侧永远空出一大条，视觉重心被压回中间 —— 这正是「大屏上看起来像 16:9 电视机里
// 嵌了一个 4:3 页面」的根因。新策略：
//   · 单页显式传入 pageMaxWidth（如全屏构建器）→ 尊重它
//   · 配置里用户改过 pageMaxWidth（> 旧默认 1366）→ 尊重用户
//   · 其余情况 → 用 canonical 内容最大宽 1680px，其余空间交给布局（右栏/页脚/3D 画布）
const LEGACY_DEFAULT_PAGE_MAX_WIDTH = 1366
const FLUID_CONTENT_MAX = 1680
const fluidMaxWidth = computed(() => {
  configEpoch.value
  if (props.pageMaxWidth != null && props.pageMaxWidth > 0) return props.pageMaxWidth
  const configured = layoutStore.layoutConfig.pageMaxWidth || 0
  if (configured > LEGACY_DEFAULT_PAGE_MAX_WIDTH) return configured
  return FLUID_CONTENT_MAX
})

const {
  shellStyle: rawShellStyle,
  contentStyle,
  scalingOn,
  scale,
  stageStyle,
  canvasVars,
  isResizing,
} = useScaling(resolvedMaxWidth, {
  forceScaling: toRef(props, 'forceScaling'),
  // 本组件是 .viewport-frame 的唯一渲染者，由它独占发布全局布局量
  publishGlobals: true,
})

// 外层 frame 样式：直接合并传入的 frameStyle（保留外部对齐能力）
const mergedFrameStyle = computed(() => ({ ...props.frameStyle }))

// app-shell 的实际样式：缩放模式下注入 transform/缩放原点 + --hos-scale CSS 变量；
// 非缩放模式下注入 100% 宽高 + 最大宽度，--hos-scale 供子组件按比例调整字号/间距等。
// --hos-vw/--hos-vh 只在缩放开启时注入（画布单位），未注入时子组件回退到 100vw/100vh。
const computedShellStyle = computed(() => {
  if (scalingOn.value) {
    return {
      ...rawShellStyle.value,
      ...canvasVars.value,
      '--hos-scale': String(scale.value),
    }
  }
  return {
    width: '100%',
    height: '100%',
    // 上限而不是固定宽：窄屏自然铺满，宽屏最多到 fluidMaxWidth，居中由 .viewport-frame 的 flex 完成
    maxWidth: `${fluidMaxWidth.value}px`,
    '--hos-scale': '1',
  }
})

// 内容容器样式：缩放模式下注入内容尺寸/缩放原点；非缩放模式下不施加额外样式
const wrapperContentStyle = computed(() => (scalingOn.value ? contentStyle.value : undefined))

/**
 * 缩放画布标记（`html.hos-canvas-scaled`）。
 *
 * 断点已统一迁到 `@container hos-canvas`（见 `.app-shell` 的 container-type），
 * 不再需要用这个 class 去门控 `@media`。保留它的原因只剩两点：
 *   1. 其它仍按窗口宽度决策的少量逻辑/样式需要知道「现在处于缩放态」；
 *   2. 便于 DevTools 与审计脚本快速识别当前模式。
 * 注意：新增样式**不要**再写 `html:not(.hos-canvas-scaled)` 门控，直接写容器查询。
 */
let releaseCanvasFlag = null
watch(
  scalingOn,
  (on) => {
    if (on && !releaseCanvasFlag) {
      releaseCanvasFlag = holdScaledCanvasFlag()
    } else if (!on && releaseCanvasFlag) {
      releaseCanvasFlag()
      releaseCanvasFlag = null
    }
  },
  { immediate: true },
)
onUnmounted(() => {
  releaseCanvasFlag?.()
  releaseCanvasFlag = null
})
</script>
