<script setup lang="ts">
import { computed } from "vue";
import { statusTone } from "../../utils/format.js";

const props = defineProps<{ status?: string | null; label?: string }>();
const tone = computed(() => statusTone(props.status));
</script>

<template>
  <span class="pill" :class="`pill--${tone}`">{{ label || status || "—" }}</span>
</template>
