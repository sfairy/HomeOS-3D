<!--
组件：SystemConfigMobileNav.vue
所属模块：frontend / src / views / settings / system / system-config
职责：高级参数分区顶栏。桌面端左对齐标题与上一组/下一组导航；窄屏保留分组切换。
Emits：
  - prev / next：上一组/下一组
关键依赖：@lucide/vue 的 ChevronLeft / ChevronRight
数据来源：父级透传的 hasPrevSection / hasNextSection
-->
<template>
  <div class="params-inline-head params-section-toolbar">
    <div class="params-inline-head__center">
      <button
        type="button"
        class="params-inline-head__nav-btn"
        :disabled="!hasPrevSection"
        :title="'上一组'"
        :aria-label="'上一组'"
        @click="$emit('prev')"
      >
        <ChevronLeft class="w-4 h-4" />
      </button>
      <div class="params-inline-head__main">
        <div class="params-inline-head__title-row">
          <h3 class="params-inline-head__title">{{ section.label }}</h3>
          <span class="params-inline-head__meta">{{
            '{n} 项'.replace('{n}', String(filteredFieldCount))
          }}</span>
        </div>
        <p v-if="sectionMeta(section.key).desc" class="params-inline-head__desc">{{
          sectionMeta(section.key).desc
        }}</p>
      </div>
      <button
        type="button"
        class="params-inline-head__nav-btn"
        :disabled="!hasNextSection"
        :title="'下一组'"
        :aria-label="'下一组'"
        @click="$emit('next')"
      >
        <ChevronRight class="w-4 h-4" />
      </button>
    </div>
    <div class="params-inline-head__actions">
      <div v-if="displayFieldCount > 8" class="params-inline-filter">
        <Search class="w-3.5 h-3.5 shrink-0 opacity-35" aria-hidden="true" />
        <input
          :value="sectionFilter"
          type="search"
          :aria-label="'筛选本组参数'"
          :placeholder="'筛选本组…'"
          class="params-inline-filter__input"
          @input="$emit('update:sectionFilter', $event.target.value)"
        />
      </div>
      <button
        type="button"
        class="params-inline-head__btn"
        @click="$emit('reset-section', section.key)"
      >
        <RotateCcw class="w-3.5 h-3.5" />
        <span class="params-inline-head__btn-label">{{ '恢复本组' }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { Search, RotateCcw, ChevronLeft, ChevronRight } from '@lucide/vue'
import { sectionMeta } from '@/composables/config/system-config-core.internals'

defineProps({
  section: { type: Object, required: true },
  hasPrevSection: { type: Boolean, default: false },
  hasNextSection: { type: Boolean, default: false },
  displayFieldCount: { type: Number, default: 0 },
  filteredFieldCount: { type: Number, default: 0 },
  sectionFilter: { type: String, default: '' },
})

defineEmits(['prev', 'next', 'reset-section', 'update:sectionFilter'])
</script>
