/**
 * 判据五「圆角尺度单一化」的解析与判定（与 `check-token-contract.mjs` 分离，便于注入式自检）。
 *
 * 为什么单列一个模块：这条判据是**纯文本 → 结论**的变换，自检可以直接喂合成样式文本、
 * 断言拦与不拦（见 `_token_contract_selftest.mjs`）。留在门禁主文件里就只能靠「跑真仓库」
 * 验证，而真仓库永远是干净的 —— 判据写坏了也没人知道。
 *
 * 判据内容：
 *   ① 规范族 `--hos-radius-<role>`：值必须是登记过的具体长度（`RADIUS_CANONICAL_VALUES`），
 *      或属于「折叠到同族别名」的白名单（`RADIUS_REFERRING`，目前只有 `--hos-radius-shell`）。
 *   ② 旧族 `--radius-*` / `--radius-ipad-*`：值必须是 `var(--hos-radius-…)` —— 只做别名，
 *      不许出现自己的长度。
 *
 * 为什么值也要看：只查名字的话，`--radius-sm: 12px` 完全合法（名字在旧族、值是个合法长度），
 * 但它让实际用到的圆角尺度在「control/card/panel/pill」之外多出一档，且**新增尺度不需要新增
 * 任何令牌**，评审时看不出异常 —— 审计里「6 套圆角尺度」正是这样长出来的。
 */

/** 规范族前缀：唯一允许承载具体长度的命名族。 */
export const RADIUS_CANONICAL_PREFIX = '--hos-radius-'

/** 旧族：只能作为规范族的别名出现。 */
export const RADIUS_LEGACY_RE = /^--(radius|radius-ipad)-/

/** 声明匹配（值取到 `;`/`}` 为止；注释已被调用方抹白）。 */
export const RADIUS_DECL_RE = /(--(?:hos-)?radius[a-z0-9-]*)\s*:\s*([^;{}]+)/g

/** 规范族允许出现的具体长度：新增一档必须显式改这一行（改动会在评审里被看见）。 */
export const RADIUS_CANONICAL_VALUES = new Set(['8px', '12px', '14px', '20px', '9999px'])

/** 规范族里「引用同族另一档」的合法项（别名折叠，避免出现第三档容器圆角）。 */
export const RADIUS_REFERRING = new Set(['--hos-radius-shell'])

/** 旧族允许的唯一形态：指向规范族的别名。 */
export const RADIUS_LEGACY_ALIAS_RE = /^var\(\s*--hos-radius-[a-z0-9-]+\s*\)$/

/**
 * 抽取样式文本里的圆角声明。
 * @param {string} style 已抹白注释的样式文本
 * @param {string} [file] 归属（打印用，如 `homeos:src/assets/styles/main.css`）
 */
export function radiusDeclarations(style, file = '') {
  return [...style.matchAll(RADIUS_DECL_RE)].map((m) => ({
    name: m[1],
    value: m[2].trim(),
    file,
    line: style.slice(0, m.index).split('\n').length,
  }))
}

/**
 * 判定一批圆角声明是否有问题。
 * @param {Array<{name: string, value: string, file?: string, line?: number}>} declarations
 * @returns {string[]} 问题列表（空数组表示合规）
 */
export function radiusProblemsOf(declarations) {
  const problems = []
  for (const decl of declarations) {
    const where = decl.file ? `${decl.file}:${decl.line}` : '合成的样式文本'
    if (decl.name.startsWith(RADIUS_CANONICAL_PREFIX)) {
      if (RADIUS_CANONICAL_VALUES.has(decl.value) || RADIUS_REFERRING.has(decl.name)) continue
      problems.push(
        `规范族圆角 ${decl.name}: ${decl.value}（${where}）—— 新尺度要显式登记进 RADIUS_CANONICAL_VALUES；` +
          `只想折叠别名请用 ${[...RADIUS_REFERRING].join(' / ')} 的写法`,
      )
      continue
    }
    if (RADIUS_LEGACY_RE.test(decl.name)) {
      if (RADIUS_LEGACY_ALIAS_RE.test(decl.value)) continue
      problems.push(
        `旧族圆角 ${decl.name}: ${decl.value}（${where}）—— 必须写成 var(--hos-radius-…)，` +
          '裸长度会让尺度在契约之外悄悄多出一档',
      )
      continue
    }
    problems.push(
      `未归类的圆角令牌 ${decl.name}（${where}）—— 名字要么进 --hos-radius-* 规范族，要么进 --radius-* / --radius-ipad-* 别名族`,
    )
  }
  return problems
}
