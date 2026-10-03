/** 全局提示。前台用 `hb-toast`（单条），后台用 `admin-toast`（栈式）。 */

import { defineStore } from "pinia";
import { ref } from "vue";

export type ToastTone = "info" | "success" | "warning" | "danger" | "err";

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

let seq = 0;

export const useToastStore = defineStore("toast", () => {
  /** 后台栈式提示。 */
  const items = ref<ToastItem[]>([]);

  function push(message: string, tone: ToastTone = "success") {
    const id = ++seq;
    items.value.push({ id, message, tone });
    window.setTimeout(() => dismiss(id), 3600);
    return id;
  }

  function dismiss(id: number) {
    items.value = items.value.filter((item) => item.id !== id);
  }

  return { items, push, dismiss };
});

/** 前台单条 toast（沿用 `.hb-toast` 的显示/隐藏机制）。 */
export const useStoreToast = defineStore("storeToast", () => {
  const message = ref("");
  const tone = ref<ToastTone>("info");
  const visible = ref(false);
  let timer: number | undefined;

  function show(text: string, next: ToastTone = "info") {
    message.value = text;
    tone.value = next;
    visible.value = true;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      visible.value = false;
    }, 3200);
  }

  function hide() {
    visible.value = false;
    window.clearTimeout(timer);
  }

  return { message, tone, visible, show, hide };
});
