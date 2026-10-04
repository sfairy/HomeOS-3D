<!--
  组件文件：Background.vue
  所属模块：frontend/src/components/common/screensaver
  组件职责：屏保页的纯装饰背景层。以三层绝对定位元素构建视觉氛围：两团不同位置的径向渐变光晕
    （ss-glow--1 / ss-glow--2，不同色调、位置、动画），加上 vignette 暗角叠加层；
    整体 aria-hidden=true 对屏幕阅读器隐藏，纯视觉无交互无状态。
  依赖关系：无外部 import，纯 scoped CSS 渲染渐变、混合模式与缩放动画；无 props/emits/store/composable。
-->
<template>
  <div class="ss-bg" aria-hidden="true">
    <div class="ss-glow ss-glow--1" />
    <div class="ss-glow ss-glow--2" />
    <div class="ss-vignette" />
  </div>
</template>
<script setup lang="ts">
/**
 * 职责：屏保装饰背景层 Background 组件的 SFC 壳声明；仅渲染渐变光晕与 vignette 暗角三层叠加元素（纯视觉无交互无状态），实际 DOM 在上方 <template>。
 * 关键依赖：无外部 import；scoped CSS 提供径向渐变、混合模式与呼吸式缩放动画。
 * 约定：
 *  - 组件保持无 props / emits / reactive，仅作为装饰层被屏保主组件引用；
 *  - 所有视觉元素 aria-hidden=true，屏幕阅读器完全忽略。
 */
// 纯视觉组件：无脚本逻辑。保留 <script setup> 块以承载 SFC 文件头注释（扫描规则要求头位于 script 块内部）。
</script>
