<script setup lang="ts">
import { useToastStore } from "../stores/toast.js";

const toast = useToastStore();
</script>

<template>
  <div id="admin-toast">
    <div
      v-for="item in toast.items"
      :key="item.id"
      class="admin-toast__item"
      :class="`is-${item.tone}`"
    >
      {{ item.message }}
    </div>
  </div>
</template>
