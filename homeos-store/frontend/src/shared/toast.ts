/** 全局提示。前台用 `hb-toast`（单条），后台用 `admin-toast`（栈式）。 */

import { defineStore } from "pinia";
import { ref } from "vue";

type ToastTone = "info" | "success" | "warning" | "danger" | "err";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

let seq = 0;

interface ToastTimer {
  handle: number;
  due: number;
  remaining: number;
  paused: boolean;
}

/** 错误类提示停留更久；其余 3.6s，满足 WCAG 2.2.1 的“可延长/可关闭”。 */
const TOAST_DURATION = 3600;
const TOAST_ERROR_DURATION = 8000;

export const useToastStore = defineStore("toast", () => {
  /** 后台栈式提示。 */
  const items = ref<ToastItem[]>([]);
  const timers = new Map<number, ToastTimer>();

  function arm(id: number, ms: number) {
    const handle = window.setTimeout(() => dismiss(id), ms);
    timers.set(id, { handle, due: Date.now() + ms, remaining: ms, paused: false });
  }

  function push(message: string, tone: ToastTone = "success") {
    const id = ++seq;
    items.value.push({ id, message, tone });
    arm(id, tone === "danger" || tone === "err" ? TOAST_ERROR_DURATION : TOAST_DURATION);
    return id;
  }

  function dismiss(id: number) {
    const timer = timers.get(id);
    if (timer) window.clearTimeout(timer.handle);
    timers.delete(id);
    items.value = items.value.filter((item) => item.id !== id);
  }

  function pause(id: number) {
    const timer = timers.get(id);
    if (!timer || timer.paused) return;
    window.clearTimeout(timer.handle);
    timer.remaining = Math.max(0, timer.due - Date.now());
    timer.paused = true;
  }

  function resume(id: number) {
    const timer = timers.get(id);
    if (!timer || !timer.paused) return;
    timer.paused = false;
    arm(id, timer.remaining);
  }

  function pauseAll() {
    timers.forEach((_timer, id) => pause(id));
  }

  function resumeAll() {
    timers.forEach((_timer, id) => resume(id));
  }

  return { items, push, dismiss, pause, resume, pauseAll, resumeAll };
});

/** 前台单条 toast（沿用 `.hb-toast` 的显示/隐藏机制）。 */
export const useStoreToast = defineStore("storeToast", () => {
  const message = ref("");
  const tone = ref<ToastTone>("info");
  const visible = ref(false);
  let timer: number | undefined;
  let due = 0;
  let remaining = 0;
  let paused = false;

  function arm(ms: number) {
    remaining = ms;
    due = Date.now() + ms;
    timer = window.setTimeout(() => {
      visible.value = false;
    }, ms);
  }

  function show(text: string, next: ToastTone = "info") {
    message.value = text;
    tone.value = next;
    visible.value = true;
    window.clearTimeout(timer);
    paused = false;
    arm(next === "danger" || next === "err" ? 8000 : 3200);
  }

  function pause() {
    if (!visible.value || paused || timer === undefined) return;
    window.clearTimeout(timer);
    timer = undefined;
    remaining = Math.max(0, due - Date.now());
    paused = true;
  }

  function resume() {
    if (!visible.value || !paused) return;
    paused = false;
    arm(remaining);
  }

  function hide() {
    visible.value = false;
    paused = false;
    window.clearTimeout(timer);
    timer = undefined;
  }

  return { message, tone, visible, show, hide, pause, resume };
});
