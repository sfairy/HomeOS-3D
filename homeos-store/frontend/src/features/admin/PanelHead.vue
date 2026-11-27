<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    domain?: string;
    desc?: string;
  }>(),
  { domain: "", desc: "" },
);
</script>

<template>
  <header class="panel-head">
    <div class="panel-head__text">
      <h2>{{ title }}</h2>
      <p v-if="desc">{{ desc }}</p>
    </div>
    <div class="panel-head__actions">
      <span v-if="domain" class="panel-head__domain">{{ domain }}</span>
      <slot />
    </div>
  </header>
</template>
