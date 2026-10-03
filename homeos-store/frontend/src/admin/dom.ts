/** DOM 与提示。 */

export const $ = (
  selector: string,
  root: ParentNode = document,
): HTMLElement | null => root.querySelector(selector);

export const $$ = (
  selector: string,
  root: ParentNode = document,
): HTMLElement[] => Array.from(root.querySelectorAll(selector));

export function toast(message: string, kind = 'success') {
  const box = document.createElement('div');
  box.className = `admin-toast__item is-${kind}`;
  box.textContent = message;
  const host = $('#admin-toast');
  if (!host) return;
  host.appendChild(box);
  setTimeout(() => box.remove(), 3600);
}


import { esc } from '../htmlsafe.js';

export { esc };

export function emptyRow(columns: number, text: string) {
  return `<tr><td colspan="${columns}"><div class="table-empty"><span>◌</span>${esc(text)}</div></td></tr>`;
}


 function selectNodeText(node: Node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

document.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const trigger = target.closest('[data-copy-target]') as HTMLElement | null;
  if (!trigger) return;
  const node = $(trigger.dataset.copyTarget || '');
  const text = node ? node.textContent?.trim() || '' : '';
  if (!text) return toast('没有可复制的内容', 'warning');
  selectNodeText(node!);
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else if (!document.execCommand('copy')) {
      throw new Error('copy rejected');
    }
    toast('已复制');
  } catch {
    toast('已选中内容，请按 Ctrl/Cmd + C 复制', 'warning');
  }
});
