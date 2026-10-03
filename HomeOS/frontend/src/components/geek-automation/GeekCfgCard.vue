<!--
  GeekCfgCard.vue
  职责：geek-automation 节点 Inspector 内通用的「配置卡片」外壳组件。
       统一承载标题 / 描述 / 预览三段式排版，并允许通过默认插槽填充字段表单。
  所属模块：geek-automation。
  Props：
    - title：卡片标题（如动作类型对应中文标签）。
    - desc：卡片描述说明。
    - preview：预览摘要（用于非编辑态展示当前配置概要）。
    - accent：是否强调态（视觉上突出当前选中节点）。
  Slots：default —— 卡片主体内容（字段表单）。
-->
<!-- 配置节点通用卡片壳：标题 / 说明 / 预览 -->
<template>
  <div :class="['geek-cfg-card', accent && 'geek-cfg-card--accent']">
    <header v-if="title || desc" class="geek-cfg-card__head">
      <p v-if="title" class="geek-cfg-card__title">{{ title }}</p>
      <p v-if="desc" class="geek-cfg-card__desc">{{ desc }}</p>
    </header>
    <div v-if="$slots.default" class="geek-cfg-card__body">
      <slot />
    </div>
    <p v-if="preview" class="geek-cfg-card__preview">{{ preview }}</p>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: '' },
  desc: { type: String, default: '' },
  preview: { type: String, default: '' },
  accent: { type: Boolean, default: false },
})
</script>
