/**
 * DOM 与提示。
 *
 * 选择器短名、转义、轻提示、表格空行，以及点账号邮箱整段选中。
 *
 * 选择器短名、HTML 转义、轻提示与表格空行 —— 每个面板都要用的那一层。
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

// HTML 转义。实现在 store/static/htmlsafe.js（唯一一份）：
// 这里只取别名，不再自己维护转义集 —— 两处实现并存时，少转一个字符不会有任何
// 报错，只会让某个拼接点变成注入点。
export const esc = HtmlSafe.esc;

// 空态：图标 + 文案，避免只剩一行灰字显得像加载失败
export function emptyRow(columns, text) {
  return `<tr><td colspan="${columns}"><div class="table-empty"><span>◌</span>${esc(text)}</div></td></tr>`;
}

// 翻页统一在文档级委托（全部列表共用同一套分页条）；复制按钮也走这一个处理器 ——
// 激活码、订单号、客户邮箱手工敲一遍必然出错。无论如何先建立选区：剪贴板 API 可能因
// 非安全上下文 / 缺用户激活 / 权限策略而失败，此时用户已有选中内容，按一次 Ctrl/Cmd+C 即可。
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
