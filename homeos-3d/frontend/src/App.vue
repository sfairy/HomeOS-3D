<script setup lang="ts">
import { watch } from "vue";
import { useRoute } from "vue-router";
import { applyPageAssets, PAGE_ASSETS, type PageAssets } from "./page-assets.js";
import LicenseRecoveryView from "./views/LicenseRecoveryView.vue";

const route = useRoute();

/**
 * 授权门禁就地渲染：后端在返回 SPA 外壳时给 `<html>` 标 `data-license-blocked="1"`，
 * 此时原样保留当前地址（/pair、/display/*、/3d-studio…）渲染授权恢复页，授权恢复后
 * 重载仍回到原地址。对应迁移前「就地返回 license-recovery.html」的行为。
 */
const licenseBlocked = document.documentElement.dataset.licenseBlocked === "1";

watch(
  // 必须监听 route.name 而不是 fullPath：SPA 首次导航前 route 是 START_LOCATION
  // （fullPath 恰好也是 "/"），当目标路由就是 "/"（编辑器）时 fullPath 不变、
  // immediate watcher 不会再触发，页面资产就永远不会挂上。
  () => route.name,
  () =>
    applyPageAssets(
      licenseBlocked ? PAGE_ASSETS.licenseRecovery : (route.meta.assets as PageAssets | undefined),
    ),
  { immediate: true },
);
</script>

<template>
  <LicenseRecoveryView v-if="licenseBlocked" />
  <router-view v-else />
</template>

<style>
/* 组件级样式留空：所有页面样式都来自各路由挂载的既有 CSS，见 page-assets.ts。 */
</style>
