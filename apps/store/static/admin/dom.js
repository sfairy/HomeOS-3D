/**
 * DOM 与提示。
 */

export const $ = (selector, root = document) => root.querySelector(selector);

export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function toast(message, kind = 'success') {
  const box = document.createElement('div');
  box.className = `admin-toast__item is-${kind}`;
  box.textContent = message;
  $('#admin-toast').appendChild(box);
  setTimeout(() => box.remove(), 3600);
}

// HTML 转义。实现在 apps/store/static/htmlsafe.js（唯一一份）：
import { esc } from "../htmlsafe.js?v=2609271411";

export { esc };

export function emptyRow(columns, text) {
  return `<tr><td colspan="${columns}"><div class="table-empty"><span>◌</span>${esc(text)}</div></td></tr>`;
}

// 翻页统一在文档级委托（全部列表共用同一套分页条）；复制按钮也走这一个处理器 ——
export function selectNodeText(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

document.addEventListener('click', async (event) => {
  const trigger = event.target.closest('[data-copy-target]');
  if (!trigger) return;
  const node = $(trigger.dataset.copyTarget);
  const text = node ? node.textContent.trim() : '';
  if (!text) return toast('没有可复制的内容', 'warning');
  selectNodeText(node);
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else if (!document.execCommand('copy')) {
      throw new Error('copy rejected');
    }
    toast('已复制');
  } catch (error) {
    toast('已选中内容，请按 Ctrl/Cmd + C 复制', 'warning');
  }
});
