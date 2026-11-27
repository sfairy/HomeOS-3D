/** 通用确认对话框（后台与前台共用一套 Promise 化接口）。 */

import { defineStore } from "pinia";
import { ref } from "vue";

interface ConfirmOptions {
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
    // 上一次确认还没结算就再次打开（键盘连按 / 两个入口同时触发）时，先按“取消”
    // 收敛旧的 Promise：否则它被下面的覆盖丢弃，调用方的 await 永久悬挂。
    resolver?.(false);
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
