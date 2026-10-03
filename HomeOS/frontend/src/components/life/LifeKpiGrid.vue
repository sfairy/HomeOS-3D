<!--
组件：LifeKpiGrid.vue
所属模块：frontend / components / life
职责：生活域 KPI 卡片循环（纯展示）；容器 class 由调用方透传（life-module__kpis / life-care__kpis 等），
  卡片 class 前缀由 variant 切换，样式全部复用 life-view.css
-->
<template>
  <div>
    <article
      v-for="cell in kpis"
      :key="cell.key"
      :class="[kpiClass, cell.tone && `${kpiClass}--${cell.tone}`]"
    >
      <span :class="`${kpiClass}-label`">{{ cell.label }}</span>
      <strong
        :class="[`${kpiClass}-value`, cell.tone && `${kpiClass}-value--${cell.tone}`]"
        >{{ cell.value }}</strong
      >
      <span v-if="cell.hint" :class="`${kpiClass}-hint`">{{ cell.hint }}</span>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/** KPI 单元：tone/hint 可选（overview 变体展示 hint 副文案） */
interface LifeKpiCell {
  key: string
  label: string
  value: string | number
  tone?: string
  hint?: string
}

const props = withDefaults(
  defineProps<{
    /** KPI 单元列表（由调用方 computed 构造） */
    kpis?: LifeKpiCell[]
    /** 卡片 class 前缀变体：module → life-module__kpi；overview → life-overview__kpi */
    variant?: 'module' | 'overview'
  }>(),
  { kpis: () => [], variant: 'module' },
)

const kpiClass = computed(() =>
  props.variant === 'overview' ? 'life-overview__kpi' : 'life-module__kpi',
)
</script>
