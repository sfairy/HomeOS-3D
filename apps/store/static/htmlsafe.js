/*
 * 前端唯一的 HTML 转义实现。实现只有一份，转义集不一致就不可能发生。
 */
const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
const ESCAPE_PATTERN = /[&<>'"]/g;

export function esc(value) {
  // null / undefined → 空串（调用点不必先判空）；其余一律按字符串处理。
  return String(value ?? '').replace(ESCAPE_PATTERN, character => ESCAPE_MAP[character]);
}

