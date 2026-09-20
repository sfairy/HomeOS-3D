/*
 * 前端唯一的 HTML 转义实现。实现只有一份，转义集不一致就不可能发生。
 * 用法：admin.html / referrals.js / store.js 里 `const esc = HtmlSafe.esc;`（store.js 保留 escapeHtml 这个名字）。
 *
 * 约定：把值拼进 HTML 之前必须过一遍 esc()。判断用的属性读（如 `${row.expired ? a : b}` 里的
 * row.expired）不必过，但要显示出来的一律要过，尤其「数据属性直插进标记模板」的写法。
 * 单引号用 &#39; 而非 &apos;：后者旧版 HTML 解析器不识别，会原样显示。
 * 不碰 DOM，node 可直接 require 单测。
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
