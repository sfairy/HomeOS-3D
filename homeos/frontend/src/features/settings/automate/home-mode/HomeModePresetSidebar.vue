<!--
组件：HomeModePresetSidebar.vue
所属模块：frontend / src / views / settings / automate / home-mode
职责：家庭模式预设包侧栏容器。包头部介绍与滚动区，内部复用 HomeModePresetCards 以
      单列堆叠形式展示预设卡片，安装事件向上透传。
关键依赖：HomeModePresetCards
数据来源：父级透传的 presets / installing
-->
<template>
  <aside class="hm-preset-sidebar" :aria-label="'全屋场景预设包'">
    <header class="hm-preset-sidebar__head">
      <div class="hm-preset-sidebar__icon">
        <Package class="w-4 h-4" />
      </div>
      <div class="hm-preset-sidebar__intro">
        <h3 class="hm-preset-sidebar__title">{{ '全屋场景预设包' }}</h3>
        <p class="hm-preset-sidebar__desc">
          {{ '一键安装回家/离家/睡眠等模式，安装前可映射实体 ID' }}
        </p>
      </div>
    </header>
    <div class="hm-preset-sidebar__scroll">
      <HomeModePresetCards
        stacked
        :presets="presets"
        :installing="installing"
        @install="emit('install', $event)"
      />
    </div>
  </aside>
</template>

<script setup>
import { Package } from '@lucide/vue'
import HomeModePresetCards from './HomeModePresetCards.vue'

defineProps({
  presets: { type: Array, default: () => [] },
  installing: { type: String, default: null },
})

const emit = defineEmits(['install'])
</script>

<style scoped src="./styles/HomeModePresetSidebar.css"></style>
