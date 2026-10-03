<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from "vue";
import { registerRowMenu } from "./row-menu.js";
import { hidePopoverIfOpen, placePopover, showPopoverIfPossible } from "../../utils/popover.js";

withDefaults(defineProps<{ title?: string }>(), { title: "更多操作" });

const root = ref<HTMLElement | null>(null);
const toggleEl = ref<HTMLButtonElement | null>(null);
const popEl = ref<HTMLElement | null>(null);
const visible = ref(false);

function isOpen() {
  return visible.value;
}

function open() {
  const pop = popEl.value;
  const toggle = toggleEl.value;
  if (!pop || !toggle) return;
  pop.hidden = false;
  visible.value = true;
  showPopoverIfPossible(pop);
  void nextTick(() => {
    if (popEl.value && toggleEl.value) placePopover(popEl.value, toggleEl.value);
  });
}

function close() {
  if (!visible.value) return;
  visible.value = false;
  const pop = popEl.value;
  if (!pop) return;
  hidePopoverIfOpen(pop);
  pop.hidden = true;
}

const unregister = registerRowMenu({
  get root() {
    return root.value as HTMLElement;
  },
  isOpen,
  open,
  close,
});

onBeforeUnmount(() => {
  close();
  unregister();
});
</script>

<template>
  <div ref="root" class="menu" :class="{ 'is-open': visible }">
    <button
      ref="toggleEl"
      type="button"
      class="hb-button hb-button--secondary hb-button--sm menu__toggle"
      data-menu-toggle
      aria-haspopup="menu"
      :aria-label="title"
    >
      ⋯
    </button>
    <div ref="popEl" class="menu__pop" popover="manual" hidden>
      <slot :close="close" />
    </div>
  </div>
</template>
