<script setup lang="ts">
import type { AdminTabItem } from "../../composables/useAdminTabs.js";

defineProps<{ label: string; tabs: AdminTabItem[]; active: string }>();
const emit = defineEmits<{ pick: [string] }>();
</script>

<template>
  <div class="admin-tabs" role="tablist" :aria-label="label">
    <button
      v-for="tab in tabs.filter((item) => !item.hidden)"
      :key="tab.key"
      class="admin-tabs__tab"
      type="button"
      role="tab"
      :data-tone="tab.tone"
      :aria-selected="tab.key === active ? 'true' : 'false'"
      :tabindex="tab.key === active ? 0 : -1"
      @click="emit('pick', tab.key)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
