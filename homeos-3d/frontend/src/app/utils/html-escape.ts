/**
 * 应用构建（`frontend/`）里唯一的 HTML 转义实现。
 */
const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;",
};
const HTML_ESCAPE_PATTERN = /[&<>'"]/g;

/** 转义一段要拼进 HTML 的文本。 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(
    HTML_ESCAPE_PATTERN,
    (character) => HTML_ESCAPE_MAP[character] ?? character,
  );
}
