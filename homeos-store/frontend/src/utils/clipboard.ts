/** 复制到剪贴板（与旧 `admin/dom.ts` 的 `data-copy-target` 同口径）。 */

import { useToastStore } from "../stores/toast.js";

export async function copyText(text: string, emptyMessage = "没有可复制的内容"): Promise<boolean> {
  const toast = useToastStore();
  const value = String(text || "").trim();
  if (!value) {
    toast.push(emptyMessage, "warning");
    return false;
  }
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
    } else {
      const node = document.createElement("textarea");
      node.value = value;
      node.setAttribute("readonly", "");
      node.style.position = "fixed";
      node.style.opacity = "0";
      document.body.appendChild(node);
      node.select();
      const ok = document.execCommand("copy");
      node.remove();
      if (!ok) throw new Error("copy rejected");
    }
    toast.push("已复制");
    return true;
  } catch {
    toast.push("复制失败，请手动选中后复制", "warning");
    return false;
  }
}
