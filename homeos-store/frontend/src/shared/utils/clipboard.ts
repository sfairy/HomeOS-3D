/** 复制到剪贴板（带提示的包装）。
 *
 * 纯拷贝内核（安全上下文用 Clipboard API、HTTP 下降级 execCommand）在共享包
 * `@homeos/shared/utils/clipboard`，与主应用同一份；这里只加本店的空值提示与 toast 文案。
 */

import { copyTextToClipboard } from "@homeos/shared/utils/clipboard";
import { useToastStore } from "@store/shared/stores/toast";

export async function copyText(text: string, emptyMessage = "没有可复制的内容"): Promise<boolean> {
  const toast = useToastStore();
  const value = String(text || "").trim();
  if (!value) {
    toast.push(emptyMessage, "warning");
    return false;
  }
  if (await copyTextToClipboard(value)) {
    toast.push("已复制");
    return true;
  }
  toast.push("复制失败，请手动选中后复制", "warning");
  return false;
}
