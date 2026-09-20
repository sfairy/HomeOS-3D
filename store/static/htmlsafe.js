/*
 * 前端唯一的 HTML 转义实现（S38 / S39）。
 *
 * 为什么单独成一个文件：后台的 `esc()`、前台的 `escapeHtml()`、邀请页的 `esc()`
 * 原本是三份各写各的实现，转义集还不一致 —— 后台那份漏了单引号。少转一个字符
 * 不会有任何报错，只会让某个拼接点变成注入点，而那种点位上写的是别人的邮箱、
 * 订单备注、商品名。实现只有一份，不一致就不可能发生。
 *
 * 用法：
 *   admin.html / referrals.js / store.js 里 `const esc = HtmlSafe.esc;`
 *   （store.js 保留 `escapeHtml` 这个名字，它已有 20+ 处调用点）
 *
 * 约定（S39）：把值拼进 HTML 之前必须过一遍 `esc()`。判断用的属性读
 * （`${row.expired ? a : b}` 里的 `row.expired`）不必过，但**要显示出来的数据**
 * 一律要过 —— 尤其是「数据属性直插进标记模板」这一类写法。
 *
 * 单引号用 `&#39;` 而不是 `&apos;`：后者在旧版 HTML 解析器里不被识别，会原样
 * 显示出来。
 *
 * 这个文件不碰 DOM，所以 node 可以直接 require 它单测。
 */
(function (global) {
  const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
  const ESCAPE_PATTERN = /[&<>'"]/g;

  function esc(value) {
    // null / undefined → 空串（调用点不必先判空）；其余一律按字符串处理。
    return String(value ?? '').replace(ESCAPE_PATTERN, character => ESCAPE_MAP[character]);
  }

  global.HtmlSafe = { esc };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.HtmlSafe;
  }
})(typeof window !== 'undefined' ? window : globalThis);
