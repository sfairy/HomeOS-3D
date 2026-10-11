<script setup lang="ts">
/**
 * 入户页场景壳（授权商店侧的薄适配层）。
 *
 * DOM 结构与动效样式与主应用那份**逐字相同**，已单点化到
 * `@homeos/shared/components/SceneStage.vue`；本文件只负责把本店的页面字典
 * （`./scene-values`）与站点版本（`site.version`，来自 `/healthz`）喂给共享壳。
 */
import { computed } from "vue";
import SharedSceneStage from "@homeos/shared/components/SceneStage.vue";
import { useSiteStore } from "../stores/site.js";
import { sceneValues } from "./scene-values.js";

const props = withDefaults(defineProps<{ page?: string }>(), { page: "store" });

const site = useSiteStore();
const values = computed(() => sceneValues(props.page));
const version = computed(() => site.version || "0.7.4");
</script>

<template>
  <SharedSceneStage :values="values" :version="version" />
</template>
