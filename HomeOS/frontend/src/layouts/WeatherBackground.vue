<!--
组件：WeatherBackground.vue
所属模块：frontend / src / layouts
职责：根据传入的质量档位渲染天气动态背景：
  - static：纯 CSS 静态渐变（无动画，最低开销）
  - full/lite：双 Canvas 渲染（环境光层 + 粒子层），由 useWeatherBackgroundAnimation 驱动动画
  - off：父组件已在外层 v-show 过滤，不会进入本组件
关键依赖：composables/ui/useWeatherBackgroundAnimation（Canvas 动画循环、粒子绘制、resize 适配）
-->
<template>
  <!-- 天气背景容器：根据质量档位切换 static 与 Canvas 渲染分支 -->
  <div class="weather-bg-stack" :class="{ 'weather-bg-stack--static': isStaticQuality }">
    <!-- 静态档位：仅 CSS 径向渐变，零 JS 开销 -->
    <div v-if="isStaticQuality" class="weather-bg-static" aria-hidden="true" />
    <template v-else>
      <!-- 环境光层 Canvas（云、雾、阳光等大面积环境效果） -->
      <canvas ref="canvasRef" class="weather-bg" />
      <!-- 粒子层 Canvas（雨滴、雪花、灰尘等粒子效果），key 变化时强制重建以重置动画状态 -->
      <canvas
        :key="particleCanvasKey"
        ref="particleCanvasRef"
        class="weather-bg weather-bg--particles"
      />
    </template>
  </div>
</template>

<script setup>
/**
 * 所属模块：frontend/layouts
 * 职责：定义 WeatherBackground 页面布局组件，组织导航栏与内容区域。
 * 关键依赖：Vue 3 SFC、主布局插槽、路由 `<router-view>` 与 stores 主题。
 * 约定：- 公共 UI 元素组件化；子布局使用 `<slot>` + 具名插槽组合。
 */
/**
 * 天气动态背景 — 单层 Canvas 完整渲染（环境光 + 粒子）
 *
 * 挂载位置：app-shell__weather-layer，绝对定位随 app-shell 缩放（由 ScaledViewport 控制）。
 * quality 档位由 MainLayout 综合性能模式/实体数量/帧率档位/调试强开计算得出。
 */
import { computed } from 'vue'
import { useWeatherBackgroundAnimation } from '@/composables/ui/useWeatherBackgroundAnimation'

const props = defineProps({
  /** @type {'full'|'lite'|'static'|'off'} 渲染质量档位，决定 Canvas 还是 CSS 静态渐变 */
  quality: { type: String, default: '' },
})

// 是否为静态档位：决定走 CSS 渐变分支
const isStaticQuality = computed(() => props.quality === 'static')

// Canvas 引用与粒子层重建 key 均由动画 composable 管理（自动响应 resize、设备像素比等）
const { canvasRef, particleCanvasRef, particleCanvasKey } = useWeatherBackgroundAnimation(props)
</script>

<style scoped>
.weather-bg-stack {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.weather-bg-static {
  position: absolute;
  inset: 0;
  /* 仅角落微光，不做中心压暗蒙版 */
  background:
    radial-gradient(ellipse 90% 70% at 20% 10%, rgba(10, 132, 255, 0.1) 0%, transparent 55%),
    radial-gradient(ellipse 70% 60% at 85% 80%, rgba(48, 209, 88, 0.06) 0%, transparent 50%);
}

.weather-bg-stack--static .weather-bg-static {
  opacity: 1;
}

.weather-bg {
  pointer-events: none;
  width: 100%;
  height: 100%;
  position: absolute;
  inset: 0;
  background: transparent;
}
</style>
