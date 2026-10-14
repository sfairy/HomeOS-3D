#!/usr/bin/env node
/**
 * 选择器位置的 `var()` 检测 + 「毛玻璃禁用组两份清单一致」比对。
 *
 * 为什么是独立模块而不是塞进门禁脚本里：门禁脚本在模块顶层就跑完整扫描并
 * `process.exit`，没法被自检 import；把**判据**提成纯函数，门禁与自检才能共用同一份实现
 * （自检要能证明「注入缺陷就会红」，而那必须调用真判据）。
 *
 * ## 判据一：选择器位置不得出现 `var()`
 *
 * `var()` 只在**声明值**位置被替换。写进**选择器**位置（`:is(var(--list))`、
 * `@media (min-width: var(--x))`）时，整条规则在解析期就非法、被静默丢弃 ——
 * 不报错、不进 devtools 的「invalid」提示，只是那段样式不存在。
 *
 * 实际翻过的车：`main.css` 用 `:is(var(--glass-fallback-selectors))` 关闭低性能模式下的
 * `backdrop-filter`，两条令牌门禁都只看**声明值**里的 `var()`，因此看不见这条规则从未生效 ——
 * 约 30 个组件在触屏 / 静态模式下的毛玻璃一直没被关掉。
 *
 * ## 判据二：两份禁用清单必须逐项一致
 *
 * 同一个清单在一个文件里出现两次（coarse 触屏组 + `data-glass-effect="static"` 组）。
 * 两处都是字面量内联，天然会漂移；门禁比对它们，新增 blur 使用点时两处都要登记。
 */

/** 去掉注释但保持换行，便于按行号定位。 */
export function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
}

/**
 * 选择器段里的 `var()`。
 *
 * 判定：对每个 `var(`，它到**下一个 `{`** 之间若没有 `;` 或 `}`，就说明它处在规则前导
 * （即选择器 / at-rule 条件）里，而不是某条声明的值里。
 *
 * 为什么这个近似够用：合法声明里的 `var()` 与它所属规则的 `{` 之间必然隔着至少一个 `;`
 * （声明以分号结尾）或 `}`（最后一条）；而规则前导里两者都不会出现。实测在整个仓库的
 * 样式文本上零误报（`.vue` 模板属性里的 `var(...)` 不在样式文本内，天然排除）。
 */
export function findSelectorVar(styleText) {
  const text = stripComments(styleText)
  const hits = []
  for (const match of text.matchAll(/var\(/g)) {
    const at = match.index
    const openBrace = text.indexOf('{', at)
    if (openBrace === -1) continue
    const semi = text.indexOf(';', at)
    if (semi !== -1 && semi < openBrace) continue
    const closeBrace = text.indexOf('}', at)
    if (closeBrace !== -1 && closeBrace < openBrace) continue
    const line = text.slice(0, at).split('\n').length
    const snippet = text.split('\n')[line - 1].trim().slice(0, 120)
    hits.push({ line, snippet })
  }
  return hits
}

/** 解析 `:is(a, b, c)` 的实参列表（去空白、忽略空项）。 */
export function parseIsArgs(raw) {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

//: coarse 触屏禁用组的定位锚：紧跟 `.widget-wrapper { will-change: auto … }` 之后。
const COARSE_ANCHOR = /\.widget-wrapper\s*\{[^}]*\}[^{]*?:is\(([^)]*)\)/s
//: 静态模式禁用组的定位锚：`html[data-glass-effect="static"] :is(…)`。
const STATIC_ANCHOR = /html\[data-glass-effect=["']static["']\]\s*:is\(([^)]*)\)/

/**
 * 取出毛玻璃禁用组的两份选择器清单。
 *
 * 用**锚点**而不是「扫所有 `:is()`」：后者会把恰好也设 `backdrop-filter: none` 的无关
 * 分组卷进来，制造与本次修复无关的失败。锚点找不到时返回 `null`，
 * 调用方必须报**解析失败**而不是静默通过 —— 规则被删掉也必须被发现。
 */
export function glassFallbackLists(styleText) {
  const text = stripComments(styleText)
  const coarse = COARSE_ANCHOR.exec(text)
  const staticMode = STATIC_ANCHOR.exec(text)
  return {
    coarse: coarse ? parseIsArgs(coarse[1]) : null,
    static: staticMode ? parseIsArgs(staticMode[1]) : null,
  }
}
