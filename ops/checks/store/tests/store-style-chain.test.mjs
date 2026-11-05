/**
 * 商店首屏样式链的契约测试（路线图 `store-lcp`）。
 *
 * 首屏现在分两组揭幕：`critical`（图标 / 顶栏骨架 / 首页）齐活就揭掉占位壳，
 * `rest`（场景与后台用的 5 张）随后自己再切一次。这条链上有三个**不会报错**的失败模式，
 * 全靠本用例守住：
 *
 * 1. 某张首屏真正用到的表被误归到 `rest`：首帧先按缺样式排版，critical 揭幕时再重排 ——
 *    这正是上一版「裸排版 → 完整样式」的老问题，只是挪到了两组之间。
 * 2. `rest` 里混进 `html` / `body` / `:root` 规则：第二次切换会改整页底色 / 主题变量，
 *    用户看到的是遮罩撤掉之后整屏再变一次色。
 * 3. `main.ts` 又在等「全部 8 张」：分组就白分了，首屏继续等那 220KB。
 *
 * 断言的是**契约**而不是字面量：分组按 `data-defer-style` 的取值校验，样式表内部按
 * 选择器形态校验，所以改文案 / 调顺序不会误报，但把表搬家或往 rest 里加根级规则会。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const STORE_ROOT = new URL('../../../../homeos-store/frontend/', import.meta.url)
const INDEX_HTML = readFileSync(new URL('index.html', STORE_ROOT), 'utf8')
const MAIN_TS = readFileSync(new URL('src/main.ts', STORE_ROOT), 'utf8')
const STYLES_READY_TS = readFileSync(new URL('src/shared/utils/styles-ready.ts', STORE_ROOT), 'utf8')

/** 首屏真正需要的三张：图标字形、顶栏骨架、首页（含档位）。 */
const CRITICAL_SHEETS = ['/store-static/font.min.css', '/store-static/store-shell.css', '/store-static/store-home.css']

/** 与首屏无关、可以晚到的五张。 */
const REST_SHEETS = [
  '/store-static/scene/fonts.css',
  '/store-static/scene/page.css',
  '/store-static/scene/scene.css',
  '/store-static/scene/panel.css',
  '/store-static/store.css',
]

/** 抽出 `link[data-defer-style]` 的 (href, group) 对。 */
function deferredSheets() {
  return [...INDEX_HTML.matchAll(/<link\b[^>]*\bdata-defer-style(?:="([^"]*)")?[^>]*>/gi)].map((tag) => ({
    tag: tag[0],
    group: tag[1] ?? '',
    href: (tag[0].match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1] || '',
  }))
}

test('首屏三张表归 critical，其余五张归 rest', () => {
  const sheets = deferredSheets()
  assert.equal(sheets.length, 8)

  for (const sheet of sheets) {
    assert.ok(sheet.group === 'critical' || sheet.group === 'rest', `${sheet.href} 缺少分组取值`)
    // 懒加载表必须是 media=print + data-defer-style，否则内联脚本不会替它切 all
    assert.match(sheet.tag, /media\s*=\s*["']print["']/i)
  }

  const critical = sheets.filter((sheet) => sheet.group === 'critical').map((sheet) => sheet.href)
  const rest = sheets.filter((sheet) => sheet.group === 'rest').map((sheet) => sheet.href)
  assert.deepEqual(critical.sort(), [...CRITICAL_SHEETS].sort())
  assert.deepEqual(rest.sort(), [...REST_SHEETS].sort())
})

/**
 * rest 组的安全边界：第二次揭幕不能改整页底色 / 主题令牌。
 *
 * 允许 `scene/page.css` 的 `:root` 存在 —— 它定义的是 `--hos-*`（场景页令牌），与首屏用的
 * `--hb-*` 完全不相交（2026-11-05 实测：page.css 的 101 个变量没有一个出现在 theme.css
 * 的 162 个里）；它里面的 `html.hos-shell body` 也只作用于场景页外壳，不进商店前台。
 * 所以这里校验的是两条真正的红线，而不是「不许出现 html/body 字样」：
 *   1. 不得重新声明 `--hb-*` 令牌（会推翻 theme.css 已生效的配色）；
 *   2. 不得给裸 `html` / `body` 规则设 `background*` / `color`（会让整屏二次变色）。
 */
test('rest 组不得重定义 --hb-* 令牌，也不得给裸 html/body 着色', () => {
  for (const href of REST_SHEETS) {
    const file = new URL(`public/static/${href.replace('/store-static/', '')}`, STORE_ROOT)
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

    const redefined = [...css.matchAll(/(?:^|[;{\s])(--hb-[\w-]+)\s*:/g)].map((match) => match[1])
    assert.deepEqual(redefined, [], `${href} 重新定义了 ${redefined.join(', ')}：首屏配色会被第二次揭幕推翻`)

    const bareDocumentRules = [...css.matchAll(/(^|[}{;])\s*(html|body)\s*(?:,[^{]*)?\{([^}]*)\}/g)]
    const colored = bareDocumentRules.filter((match) => /background|(?<!-)color\s*:/.test(match[3]))
    assert.deepEqual(
      colored.map((match) => match[2]),
      [],
      `${href} 给裸 html/body 设了底色/前景色：首屏会在遮罩撤掉后再变一次色`,
    )
  }
})

test('内联揭幕脚本：两组各切一次，并保留 ?styles=all 基线开关', () => {
  assert.match(INDEX_HTML, /get\("styles"\) === "all"/)
  assert.match(INDEX_HTML, /mark\("data-styles-ready"/)
  assert.match(INDEX_HTML, /mark\("data-styles-rest-ready"/)
  // 基线（critical 为空）时必须由 rest 组置位就绪标记，不能提前揭壳
  assert.match(INDEX_HTML, /var hasCritical = critical\.length > 0/)
  assert.match(INDEX_HTML, /if \(!hasCritical\) mark\("data-styles-ready"/)
  // 超时兜底仍在：不能把首屏锁死在一张永远不返回的表上
  assert.match(INDEX_HTML, /\}, 5000\)/)
})

test('main.ts 只等 critical 揭幕，且揭壳顺序不变', () => {
  assert.match(MAIN_TS, /await waitForDeferredStyles\(\)/)
  const order = ['waitForDeferredStyles()', 'ensureAdminStylesheet()', 'app.mount("#app")', 'store-boot-shell']
  let previous = -1
  for (const token of order) {
    const position = MAIN_TS.indexOf(token)
    assert.notEqual(position, -1, `main.ts 丢失了 ${token}`)
    assert.ok(position > previous, `main.ts 里 ${token} 的顺序被打乱`)
    previous = position
  }
})

test('styles-ready 的等待上限不小于 index.html 的兜底（否则壳比样式多留一截）', () => {
  const indexCap = Number((INDEX_HTML.match(/硬上限[\s\S]*?\}, (\d+)\);/) || [])[1])
  const moduleCap = Number((STYLES_READY_TS.match(/STYLES_TIMEOUT_MS = (\d+)/) || [])[1])
  assert.ok(Number.isFinite(indexCap) && indexCap > 0, 'index.html 缺少揭幕兜底时长')
  assert.ok(Number.isFinite(moduleCap) && moduleCap > 0, 'styles-ready.ts 缺少等待上限')
  assert.ok(moduleCap >= indexCap, `styles-ready 的 ${moduleCap}ms 小于 index.html 的 ${indexCap}ms`)
})
