/**
 * 缩放视口布局容器
 *
 * 职责：根据配置基准宽度缩放 app-shell，或在未开启缩放时流体布局。
 * - 大屏（宽于基准宽度）：按 transform: scale 等比缩放整个 app-shell 居中显示
 * - 未开启缩放：流式布局（width:100%），不缩放
 * - 内置 teleport-target 容器与天气层插槽（weather-fx），由 ScaledViewport 决定其层级顺序
 *
 * 关键依赖：
 * - composables/ui/useScaling：核心缩放逻辑（计算 scale、shellStyle、contentStyle）
 * - stores/layout、stores/entities：读取布局配置与实体数量
 * - utils/config/frontend-config：基准宽度、性能阈值（worker 派生阈值）
 * - utils/perf/adaptive-perf.util：性能自适应档位（高帧率才显示边框微光）
 */
<template>
  <!-- 外层 frame：承载边框微光（高帧率时显示）与外部样式注入 -->
  <div
    class="viewport-frame"
    :class="[frameClass, { 'viewport-frame--static-glow': pauseViewportGlow }]"
    :style="mergedFrameStyle"
  >
    <!-- 背景层插槽（如壁纸/视频背景），位于 app-shell 之下 -->
    <slot name="backdrop" />
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
      <!-- 内容容器：缩放模式下应用缩放尺寸；非缩放模式下走流式布局 -->
      <div
        class="app-shell__content"
        :class="{ 'app-shell__content--fluid': !scalingOn }"
        :style="wrapperContentStyle"
      >
        <slot />
        <!-- 天气层：static 档位时降至内容下方，避免遮挡 UI -->
        <div
          v-if="$slots['weather-fx']"
          class="app-shell__weather-layer"
          :class="{ 'app-shell__weather-layer--static': weatherFxStatic }"
          aria-hidden="true"
        >
          <slot name="weather-fx" />
        </div>
      </div>
      <!-- 全局通知组件（toast 等） -->
      <VNotification />
    </div>
  </div>
</template>

<script setup>
/**
 * 职责：定义 ScaledViewport 页面布局组件，组织导航栏与内容区域。
 * 关键依赖：Vue 3 SFC、主布局插槽、路由 `<router-view>` 与 stores 主题。
 * 约定：- 公共 UI 元素组件化；子布局使用 `<slot>` + 具名插槽组合。
 */
import { computed, toRef } from 'vue'
import VNotification from '@/components/common/base/VNotification.vue'
import { useLayoutStore } from '@/stores/layout.store'
import { useEntitiesStore } from '@/stores/entities.store'
import { useScaling } from '@/composables/ui/useScaling'
import {
  getConfigSection,
  configEpoch,
  getWorkerDerivedThreshold,
} from '@/utils/config/frontend-config'
import { adaptiveTier } from '@/utils/perf/adaptive-perf.util'

const props = defineProps({
  // 外层 frame 的附加 class（用于不同布局场景区分样式）
  frameClass: { type: [String, Array, Object], default: '' },
  // 外层 frame 的内联样式（通常用于注入导航栏宽度等动态值）
  frameStyle: { type: Object, default: () => ({}) },
  // app-shell 的附加 class（用于性能自适应 class 注入）
  shellClass: { type: [String, Array, Object], default: '' },
  // 覆盖单页最大宽度，未传时回退到 layoutConfig.pageMaxWidth / 配置基准宽度 / 1366
  pageMaxWidth: { type: Number, default: null },
  /** static 质量天气层降至内容下方，避免不透明 CSS 渐变遮挡 UI */
  weatherFxStatic: { type: Boolean, default: false },
  /** 独立全屏页（如部件构建器）强制整页等比缩放，不受用户缩放偏好影响 */
  forceScaling: { type: Boolean, default: false },
})

const layoutStore = useLayoutStore()
const entitiesStore = useEntitiesStore()

// 是否暂停 viewport 边框微光：实体数量超 worker 派生阈值 或 性能档位非 high 时关闭
// 读取 configEpoch 用于建立对前端配置变更的响应式依赖
const pauseViewportGlow = computed(() => {
  configEpoch.value
  return entitiesStore.totalCount >= getWorkerDerivedThreshold() || adaptiveTier.value !== 'high'
})

// 解析生效的最大宽度：props.pageMaxWidth > layoutConfig.pageMaxWidth > 配置 scaleBaseWidth > 1366
const resolvedMaxWidth = computed(() => {
  configEpoch.value
  if (props.pageMaxWidth != null && props.pageMaxWidth > 0) return props.pageMaxWidth
  return layoutStore.layoutConfig.pageMaxWidth || getConfigSection('ui').scaleBaseWidth || 1366
})

const {
  shellStyle: rawShellStyle,
  contentStyle,
  scalingOn,
  scale,
  isResizing,
} = useScaling(resolvedMaxWidth, { forceScaling: toRef(props, 'forceScaling') })

// 外层 frame 样式：直接合并传入的 frameStyle（保留外部对齐能力）
const mergedFrameStyle = computed(() => ({ ...props.frameStyle }))

// app-shell 的实际样式：缩放模式下注入 transform/缩放原点 + --hos-scale CSS 变量；
// 非缩放模式下注入 100% 宽高 + 最大宽度，--hos-scale 供子组件按比例调整字号/间距等
const computedShellStyle = computed(() => {
  if (scalingOn.value) {
    return {
      ...rawShellStyle.value,
      '--hos-scale': String(scale.value),
    }
  }
  return {
    width: '100%',
    height: '100%',
    maxWidth: `${resolvedMaxWidth.value}px`,
    '--hos-scale': '1',
  }
})

// 内容容器样式：缩放模式下注入内容尺寸/缩放原点；非缩放模式下不施加额外样式
const wrapperContentStyle = computed(() => (scalingOn.value ? contentStyle.value : undefined))
</script>
