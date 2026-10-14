<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    domain?: string;
    desc?: string;
    titleHtml?: string;
  }>(),
  { domain: "", desc: "", titleHtml: "" },
);
</script>

<template>
  <header class="panel-head">
    <div class="panel-head__text">
      <h2 v-if="titleHtml" v-html="titleHtml"></h2>
      <h2 v-else>{{ title }}</h2>
      <p v-if="desc" v-html="desc"></p>
    </div>
    <div class="panel-head__actions">
      <span v-if="domain" class="panel-head__domain">{{ domain }}</span>
      <slot />
    </div>
  </header>
</template>
