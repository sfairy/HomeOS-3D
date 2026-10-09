<!--
  列表页查询工具栏外壳：events / notifications 等 premium 视图共用的
  __toolbar → __query-card → __query-grid 结构；字段内容由默认 slot 注入。
-->
<script setup>
defineProps({
  viewPrefix: { type: String, required: true },
})
</script>

<template>
  <div :class="`${viewPrefix}__toolbar`">
    <div :class="`${viewPrefix}__query-card`">
      <div :class="`${viewPrefix}__query-grid`">
        <slot />
      </div>
    </div>
  </div>
</template>
