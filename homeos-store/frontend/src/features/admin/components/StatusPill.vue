<script setup lang="ts">
import { computed } from "vue";
import { statusTone } from "@store/features/admin/utils/format";

const props = defineProps<{ status?: string | null; label?: string }>();
const tone = computed(() => statusTone(props.status));
</script>

<template>
  <span class="pill" :class="`pill--${tone}`">{{ label || status || "—" }}</span>
</template>
