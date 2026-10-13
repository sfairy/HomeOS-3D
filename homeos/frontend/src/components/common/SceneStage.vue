<script setup lang="ts">
/**
 * 入户页场景壳（本应用侧的薄适配层）。
 *
 * DOM 结构与动效样式与商店那份**逐字相同**，已单点化到
 * `@homeos/shared/components/SceneStage.vue`；本文件只负责把本机的页面字典
 * （`./scene-values`）与版本号喂给共享壳。
 */
import { computed } from 'vue'
import SharedSceneStage from '@homeos/shared/components/SceneStage.vue'
import { sceneValues } from './scene-values'

const props = withDefaults(defineProps<{ page?: string; version?: string }>(), {
  page: 'login',
  version: '',
})

const values = computed(() => sceneValues(props.page))
</script>

<template>
  <!--
    版本号：入户页的四个调用方目前都不传 `version`，沿用既有的固定站点版本；
    真源在 `homeos/*/package.json`（由版本脚本同步），需要真实值时由调用方注入。
  -->
  <SharedSceneStage :values="values" :version="version || '0.7.5'" />
</template>
