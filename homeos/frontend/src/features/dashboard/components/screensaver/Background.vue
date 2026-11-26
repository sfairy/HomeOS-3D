<!--
  屏保页的纯装饰背景层。以三层绝对定位元素构建视觉氛围：两团不同位置的径向渐变光晕
  （ss-glow--1 / ss-glow--2，不同色调、位置、动画），加上 vignette 暗角叠加层；
  整体 aria-hidden=true 对屏幕阅读器隐藏，纯视觉无交互无状态。
-->
<template>
  <div class="ss-bg" aria-hidden="true">
    <div class="ss-glow ss-glow--1" />
    <div class="ss-glow ss-glow--2" />
    <div class="ss-vignette" />
  </div>
</template>
<script setup lang="ts">
// 纯视觉组件：无脚本逻辑。保留 <script setup> 块以承载 SFC 文件头注释（扫描规则要求头位于 script 块内部）。
</script>
