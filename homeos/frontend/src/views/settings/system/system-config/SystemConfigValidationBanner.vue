<!--
组件：SystemConfigValidationBanner.vue
所属模块：frontend / src / views / settings / system / system-config
职责：高级参数校验错误横幅。展示字段校验错误列表，点击可跳转至对应分区。
Props：
  - errors：校验错误列表
  - sectionLabel：分区标签渲染函数
  - fieldLabel：字段标签渲染函数
Emits：
  - navigate：跳转分区
关键依赖：无外部依赖
数据来源：父级透传的 errors
-->
<template>
  <div class="params-validation-banner params-main__banner">
    <p class="params-validation-banner__title">{{ '以下字段校验未通过' }}</p>
    <ul class="params-validation-banner__list">
      <li
        v-for="(err, i) in errors"
        :key="`${err.section}-${err.key}-${i}`"
        class="params-validation-banner__item"
        role="button"
        tabindex="0"
        :title="'点击定位到该字段'"
        @click="$emit('navigate', err)"
        @keydown.enter="$emit('navigate', err)"
        @keydown.space.prevent="$emit('navigate', err)"
      >
        {{
          (sectionLabel(err.section) || err.section) +
          ' · ' +
          fieldLabel({ key: err.key }, err.section)
        }}：{{ err.message || '无效值' }}
      </li>
    </ul>
  </div>
</template>

<script setup>
defineProps({
  errors: { type: Array, required: true },
  sectionLabel: { type: Function, required: true },
  fieldLabel: { type: Function, required: true },
})

defineEmits(['navigate'])
</script>
