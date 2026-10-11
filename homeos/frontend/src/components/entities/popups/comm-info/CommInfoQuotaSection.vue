/** - 渲染套餐标题与 CommInfoQuotaPack 卡片列表 */
<script setup>
import CommInfoQuotaPack from './CommInfoQuotaPack.vue'

defineProps({
  quotaCards: { type: Array, default: () => [] },
})
</script>

<template>
  <section class="comm-quota">
    <h3 class="comm-quota__title">{{ '套餐' }}</h3>
    <div class="comm-packages">
      <CommInfoQuotaPack v-for="pack in quotaCards" :key="pack.id" :pack="pack" />
    </div>
  </section>
</template>
