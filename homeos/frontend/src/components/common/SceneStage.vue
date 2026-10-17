<script setup lang="ts">
/**
 * 入户页场景壳（本应用侧的薄适配层）。
 *
 * DOM 结构与动效样式单点化到 `@homeos/shared/components/SceneStage.vue`；
 * 本文件只负责把本机的页面字典（`./scene-values`）与版本号喂给共享壳。
 */
import { computed } from 'vue'
import SharedSceneStage from '@homeos/shared/components/SceneStage.vue'
import pkg from '../../../package.json'
import { sceneValues } from './scene-values'

const props = withDefaults(defineProps<{ page?: string }>(), {
  page: 'login',
})

const values = computed(() => sceneValues(props.page))
</script>

<template>
  <SharedSceneStage :values="values" :version="pkg.version" />
</template>
