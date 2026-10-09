<script setup lang="ts">
import type { DiagnosticCheck } from "./types.js";

const LEVEL_CLASS: Record<string, string> = {
  pass: "is-pass",
  warn: "is-warn",
  fail: "is-fail",
  skip: "is-skip",
};
const LEVEL_ICON: Record<string, string> = { pass: "✓", warn: "!", fail: "✕", skip: "·" };

defineProps<{ checks: DiagnosticCheck[] }>();

function asText(value: unknown): string {
  return value == null ? "" : String(value);
}
function levelClass(level: unknown): string {
  return LEVEL_CLASS[asText(level)] || LEVEL_CLASS.skip!;
}
function levelIcon(level: unknown): string {
  return LEVEL_ICON[asText(level)] || LEVEL_ICON.skip!;
}
</script>

<template>
  <ul class="admin-diagnostic-list admin-grid__full">
    <li
      v-for="(check, index) in checks"
      :key="index"
      class="admin-diagnostic"
      :class="levelClass(check.level)"
      :title="`${check.label || ''}：${check.detail || ''}`"
    >
      <span class="admin-diagnostic__icon">{{ levelIcon(check.level) }}</span>
      <strong class="admin-diagnostic__label">{{ check.label || check.id }}</strong>
      <span class="admin-diagnostic__detail">{{ check.detail }}</span>
    </li>
  </ul>
</template>
