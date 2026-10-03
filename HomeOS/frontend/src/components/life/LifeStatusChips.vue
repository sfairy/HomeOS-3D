<!--
组件：LifeStatusChips.vue
所属模块：frontend / components / life
职责：生活域状态胶囊循环（纯展示）；容器 class 由调用方透传（life-care__status / life-env__status 等），
  胶囊 class 由 variant 生成（life-{variant}__status-chip），样式全部复用 life-view.css
-->
<template>
  <div>
    <span v-for="chip in chips" :key="chip.key" :class="[chipClass, `is-${chip.key}`]">
      <em>{{ chip.label }}</em>
      <strong>{{ chip.value }}</strong>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/** 状态胶囊：key 用于循环并生成 is-{key} 修饰类 */
interface LifeStatusChip {
  key: string
  label: string
  value: string | number
}

const props = withDefaults(
  defineProps<{
    /** 胶囊列表（由调用方 computed 构造） */
    chips?: LifeStatusChip[]
    /** 胶囊 class 变体：care / env / smart → life-{variant}__status-chip */
    variant: 'care' | 'env' | 'smart'
  }>(),
  { chips: () => [] },
)

const chipClass = computed(() => `life-${props.variant}__status-chip`)
</script>
