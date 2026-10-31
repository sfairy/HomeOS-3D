<script setup lang="ts">
import { computed, nextTick, useId } from "vue";
import type { AdminTabItem } from "@store/features/admin/composables/useAdminTabs";

const props = defineProps<{
  label: string;
  tabs: AdminTabItem[];
  active: string;
  /** 传入后 tab 与面板建立 aria-controls / id 关联，例如 "overview"。 */
  panelIdPrefix?: string;
}>();
const emit = defineEmits<{ pick: [string] }>();

const uid = useId();
const visibleTabs = computed(() => props.tabs.filter((item) => !item.hidden));
const activeKey = computed(
  () =>
    visibleTabs.value.find((tab) => tab.key === props.active)?.key ??
    visibleTabs.value[0]?.key ??
    "",
);

function tabId(key: string) {
  return props.panelIdPrefix
    ? `${props.panelIdPrefix}-tab-${key}`
    : `admin-tabs-${uid}-tab-${key}`;
}

function panelId(key: string) {
  return `${props.panelIdPrefix}-tabpanel-${key}`;
}

/** WAI-ARIA Tabs：左右方向键循环、Home/End 直达首尾，激活即切换面板。 */
function onTabKeydown(event: KeyboardEvent, key: string) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = visibleTabs.value;
  if (!tabs.length) return;
  const current = Math.max(
    0,
    tabs.findIndex((tab) => tab.key === key),
  );
  let next = current;
  if (event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
  else if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
  else if (event.key === "Home") next = 0;
  else next = tabs.length - 1;
  event.preventDefault();
  const target = tabs[next];
  if (!target) return;
  emit("pick", target.key);
  nextTick(() => document.getElementById(tabId(target.key))?.focus());
}
</script>

<template>
  <div class="admin-tabs" role="tablist" :aria-label="label">
    <button
      v-for="tab in visibleTabs"
      :id="tabId(tab.key)"
      :key="tab.key"
      class="admin-tabs__tab"
      type="button"
      role="tab"
      :data-tone="tab.tone"
      :data-tab-key="tab.key"
      :aria-selected="tab.key === activeKey ? 'true' : 'false'"
      :aria-controls="panelIdPrefix ? panelId(tab.key) : undefined"
      :tabindex="tab.key === activeKey ? 0 : -1"
      @click="emit('pick', tab.key)"
      @keydown="onTabKeydown($event, tab.key)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
