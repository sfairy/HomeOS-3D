/**
 * 应用构建（`frontend/`）里唯一的 HTML 转义实现。
 *
 * 为什么必须有它：把值拼进标记之前要过一遍转义，而此前应用侧**一份都没有** —— 83 处
 * `innerHTML` 赋值全靠人工判断插值来源，唯一的一份实现是 `studio-asset-palette.js` 里的
 * 私有副本。现状是潜在而非现实的注入面（抽样到的插值全是常量或数字，且 `script-src 'self'`
 * 挡住了脚本注入），但**标记注入挡不住**：设备名 / 项目名一旦带 `<`，坏的是布局与 UI 可信度。
 *
 * 与 `store/static/htmlsafe.js` 的关系：商店是**另一个构建上下文**（`store/app.py` 只挂
 * `/store-static` 与 `/fonts`，没有 `/static`），它无法 import 本模块，只能各留一份。两份
 * 的转义集**必须逐字节相同**（无自动比对，改一边就得同步另一边的映射表）——
 * 转义集不一致的后果是「同一个值在两个页面里显示出不同的东西」，比缺转义更难发现。
 *
 * 单引号用 `&#39;` 而不是 `&apos;`：后者旧版 HTML 解析器不识别，会把它原样显示出来。
 */
const HTML_ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
const HTML_ESCAPE_PATTERN = /[&<>'"]/g;

/**
 * 转义一段要拼进 HTML 的文本。
 *
 * `null` / `undefined` 一律折成空串，调用点因此不必先判空 —— 这是刻意的：要求调用方判空
 * 只会让「忘了判」变成 `"undefined"` 直接显示在界面上。其余类型按字符串处理（数字、布尔都安全）。
 */
export function escapeHtml(value) {
  return String(value ?? '').replace(
    HTML_ESCAPE_PATTERN,
    character => HTML_ESCAPE_MAP[character]
  );
}
