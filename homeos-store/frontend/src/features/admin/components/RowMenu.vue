<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from "vue";
import { nextRowMenuId, registerRowMenu } from "./row-menu";
import { hidePopoverIfOpen, placePopover, showPopoverIfPossible } from "@store/features/admin/utils/popover";

withDefaults(defineProps<{ title?: string }>(), { title: "更多操作" });

const root = ref<HTMLElement | null>(null);
const toggleEl = ref<HTMLButtonElement | null>(null);
const popEl = ref<HTMLElement | null>(null);
const visible = ref(false);
const popId = nextRowMenuId();

const FOCUSABLE = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(",");

function isOpen() {
  return visible.value;
}

/** 浮层里当前可聚焦的项（按 DOM 顺序），用于方向键与打开时的初始聚焦。 */
function focusables(): HTMLElement[] {
  const pop = popEl.value;
  if (!pop) return [];
  return Array.from(pop.querySelectorAll<HTMLElement>(FOCUSABLE));
}

function open() {
  const pop = popEl.value;
  const toggle = toggleEl.value;
  if (!pop || !toggle) return;
  pop.hidden = false;
  visible.value = true;
  showPopoverIfPossible(pop);
  void nextTick(() => {
    if (!popEl.value || !toggleEl.value) return;
    placePopover(popEl.value, toggleEl.value);
    // 打开即把焦点交给第一个操作项：键盘用户不用再 Tab 一次。
    focusables()[0]?.focus();
  });
}

/**
 * 关闭浮层。
 *
 * restoreFocus：只有 Esc 这种「用户主动取消、期望留在原地」的关闭才把焦点还给触发按钮；
 * 点击外部 / 滚动 / 数据刷新导致的关闭不抢焦点，否则会打断用户下一个动作。
 */
function close(options: { restoreFocus?: boolean } = {}) {
  if (!visible.value) return;
  visible.value = false;
  const pop = popEl.value;
  if (pop) {
    hidePopoverIfOpen(pop);
    pop.hidden = true;
  }
  if (options.restoreFocus) toggleEl.value?.focus();
}

function onPopKeydown(event: KeyboardEvent) {
  if (!visible.value) return;
  const list = focusables();
  const index = list.indexOf(document.activeElement as HTMLElement);
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    if (!list.length) return;
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = index < 0 ? 0 : (index + step + list.length) % list.length;
    list[next]?.focus();
    return;
  }
  if (event.key === "Home" && list.length) {
    event.preventDefault();
    list[0]?.focus();
    return;
  }
  if (event.key === "End" && list.length) {
    event.preventDefault();
    list[list.length - 1]?.focus();
  }
}

/** Tab 或点击把焦点带离整个组件时收起，避免「看不见却还在 tab 序里」的浮层。 */
function onFocusOut(event: FocusEvent) {
  if (!visible.value) return;
  const next = event.relatedTarget as Node | null;
  if (next && root.value?.contains(next)) return;
  close();
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
  <div ref="root" class="menu" :class="{ 'is-open': visible }" @focusout="onFocusOut">
    <button
      ref="toggleEl"
      type="button"
      class="hb-button hb-button--secondary hb-button--sm menu__toggle"
      data-menu-toggle
      aria-haspopup="true"
      :aria-expanded="visible ? 'true' : 'false'"
      :aria-controls="popId"
      :aria-label="title"
    >
      ⋯
    </button>
    <div :id="popId" ref="popEl" class="menu__pop" popover="manual" hidden @keydown="onPopKeydown">
      <slot :close="close" />
    </div>
  </div>
</template>
