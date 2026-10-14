/** 通用确认对话框（后台与前台共用一套 Promise 化接口）。 */

import { defineStore } from "pinia";
import { ref } from "vue";

export interface ConfirmOptions {
  kicker?: string;
  title?: string;
  message?: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  warning?: boolean;
  icon?: string;
  tone?: "danger" | "primary" | "warning" | "success";
}

export const useConfirmStore = defineStore("confirm", () => {
  const open = ref(false);
  const options = ref<ConfirmOptions>({});
  let resolver: ((value: boolean) => void) | null = null;

  function confirm(next: ConfirmOptions = {}): Promise<boolean> {
    options.value = next;
    open.value = true;
    return new Promise<boolean>((resolve) => {
      resolver = resolve;
    });
  }

  function settle(value: boolean) {
    open.value = false;
    resolver?.(value);
    resolver = null;
  }

  return { open, options, confirm, settle };
});
