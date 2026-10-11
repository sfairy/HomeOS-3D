/**
 * 屏保顶部品牌标题区
 * 显示站点名称（siteTitle）。
 */
<template>
  <header class="ss-brand ss-fade-0">
    <h1 class="ss-brand-text">{{ siteTitle }}</h1>
  </header>
</template>

<script setup>
defineProps({
  /** 站点名称（屏保标题文案） */
  siteTitle: { type: String, required: true },
})
</script>
