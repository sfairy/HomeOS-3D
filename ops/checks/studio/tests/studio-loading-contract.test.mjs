/**
 * `/3d-studio` 首屏加载遮罩的跨文件契约（0.8.2 `fe-loading`）。
 *
 * 这套东西由四个互不相识的文件拼起来，任何一处改名都不会编译报错，只会「安静地不生效」：
 *
 * - `index.html`：标记（`#studio-loading` + `data-loading-*`）与外链顺序
 * - `public/static/3d-studio/studio-loading.js`：控制器与 `window.homeosStudioStartup`
 * - `public/static/3d-studio/studio-loading.css`：`[hidden]` 守卫、减动效兜底
 * - `public/static/boot-guard.js`：`#homeos-boot-overlay` 的揭示条件（层级比遮罩高）
 *
 * 典型失效：CSS 少了 `[hidden]` 守卫 → `ready()` 之后遮罩赖着不走整屏挡住编辑器；
 * boot-guard 少了守卫 → 慢启动时「正在连接…」把带阶段文案的遮罩盖住，用户看不到进度。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL('../../../../' + relativePath, import.meta.url)), 'utf8')

const shellHtml = read('homeos/frontend/index.html')
/**
 * 去掉 HTML 注释后的外壳。
 *
 * 所有位置/存在性断言都必须跑在这份上：`index.html` 里到处是用来说明 DOM 契约的注释
 * （例如「行内 `<style>` 会被 CSP 拦下，别挪回这里」），拿原文做匹配会把这些**说明**
 * 当成**实现**。测试要盯的是浏览器真正会解析的那部分。
 */
const shellMarkup = shellHtml.replace(/<!--[\s\S]*?-->/g, '')
const controller = read('homeos/frontend/public/static/3d-studio/studio-loading.js')
const stylesheet = read('homeos/frontend/public/static/3d-studio/studio-loading.css')
const bootGuard = read('homeos/frontend/public/static/boot-guard.js')
const tsFacade = read('homeos/frontend/src/shared/utils/ui/studio-startup.ts')

// --- 外壳标记 -------------------------------------------------------------

test('遮罩标记在 #app 之前：Vue 挂载会清空 #app，放里面会被瞬间抹掉', () => {
  const panel = shellMarkup.indexOf('<section id="studio-loading"')
  const app = shellMarkup.indexOf('<div id="app">')
  assert.ok(panel > 0, 'index.html 必须保留 #studio-loading 标记')
  assert.ok(app > 0)
  assert.ok(panel < app, '#studio-loading 必须写在 #app 之前')
})

test('遮罩默认 hidden，且带 aria-live=polite', () => {
  const tag = shellMarkup.slice(shellMarkup.indexOf('<section id="studio-loading"'))
  const openTag = tag.slice(0, tag.indexOf('>'))
  assert.match(openTag, /\bhidden\b/, '不默认隐藏的话每个路由都会闪一下遮罩')
  assert.match(openTag, /aria-live="polite"/)
})

test('DOM 契约：控制器查询的三个钩子都真实存在', () => {
  for (const attr of ['data-loading-title', 'data-loading-detail', 'data-loading-retry']) {
    assert.ok(shellMarkup.includes(attr), `index.html 缺少 ${attr}`)
    assert.ok(controller.includes(attr), `studio-loading.js 没在查 ${attr}`)
  }
})

test('失败态同时给出「重新加载」与「返回首页」两条出路', () => {
  const actions = shellMarkup.slice(shellMarkup.indexOf('class="studio-loading-actions"'))
  const block = actions.slice(0, actions.indexOf('</div>'))
  assert.match(block, /data-loading-retry/)
  assert.match(block, /href="\/"/)
})

test('样式走外链、脚本走经典脚本，且都排在前端入口之前', () => {
  const css = shellMarkup.indexOf('/static/3d-studio/studio-loading.css')
  const js = shellMarkup.indexOf('/static/3d-studio/studio-loading.js')
  const entry = shellMarkup.indexOf('<script type="module" src="/src/main.ts">')
  assert.ok(css > 0 && css < shellMarkup.indexOf('</head>'), '样式表必须在 </head> 前')
  assert.ok(js > 0 && js < entry, '遮罩脚本必须早于 module 入口执行')
})

test('外壳里没有行内 <style>：CSP 是 style-src self，行内样式会被浏览器拦掉', () => {
  assert.equal(/<style[\s>]/i.test(shellMarkup), false)
})

// --- 控制器契约 -----------------------------------------------------------

test('暴露的六个成员与 TS 门面一一对应', () => {
  const frozen = controller.slice(controller.indexOf('window.homeosStudioStartup = Object.freeze({'))
  const body = frozen.slice(0, frozen.indexOf('\n  })'))
  for (const member of ['active', 'signal', 'phase', 'fail', 'wait', 'ready']) {
    assert.ok(body.includes(member), `控制器缺少成员 ${member}`)
  }
  for (const fn of ['studioStartupActive', 'studioStartupPhase', 'studioStartupFail', 'studioStartupReady', 'studioStartupWait']) {
    assert.ok(tsFacade.includes(`export function ${fn}`), `TS 门面缺少 ${fn}`)
  }
})

test('只服务 /3d-studio，且跳过 embed 与自动导图嵌入态', () => {
  assert.match(controller, /\^\\\/3d-studio\\\/\?\$/)
  assert.match(controller, /params\.get\("embed"\) === "1"/)
  assert.match(controller, /params\.get\("auto-diagram-component"\)/)
})

test('60s 超时只在页面可见时计时（后台标签页不该被判卡住）', () => {
  assert.match(controller, /STALL_TIMEOUT_MS = 60000/)
  assert.match(controller, /if \(!active \|\| failed \|\| document\.hidden\) return/)
  assert.match(controller, /visibilitychange/)
})

test('pagehide 中止但 bfcache 例外', () => {
  assert.match(controller, /if \(event\.persisted\) return/)
})

test('加载期间吞掉键盘事件，避免快捷键打到空壳上', () => {
  assert.match(controller, /addEventListener\("keydown", swallowKeydown, true\)/)
  assert.match(controller, /stopImmediatePropagation/)
})

test('ready() 必须同时撤掉 studio-starting 并隐藏面板', () => {
  const ready = controller.slice(controller.indexOf('ready: function ()'))
  const body = ready.slice(0, ready.indexOf('},\n  });'))
  assert.match(body, /active = false/)
  assert.match(body, /classList\.remove\("studio-starting"\)/)
  assert.match(body, /panel\.hidden = true/)
})

// --- 样式守卫 -------------------------------------------------------------

test('CSS 必须有 [hidden] 守卫：类选择器的 display:grid 会盖过 UA 的 [hidden]', () => {
  assert.match(stylesheet, /\.studio-loading\[hidden\] \{ display: none; \}/)
})

test('CSS 有 prefers-reduced-motion 兜底', () => {
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)/)
})

test('遮罩层级低于既有启动覆盖层：所以 boot-guard 必须主动让路', () => {
  const own = Number(stylesheet.match(/z-index:\s*(\d+)/)[1])
  assert.ok(own >= 2_000_000_000, '遮罩必须是顶层，否则会被页面内容压住')
})

// --- boot-guard 让路 ------------------------------------------------------

test('revealOverlay 在揭示前让路给可见的 3D 遮罩', () => {
  const fn = bootGuard.slice(bootGuard.indexOf('function revealOverlay()'))
  const body = fn.slice(0, fn.indexOf('function armDeferredOverlay'))
  assert.match(
    body,
    /if \(studioOverlayVisible\(\)\) return/,
    '缺这条守卫：慢启动时「正在连接…」会盖住带阶段文案的遮罩',
  )
})

test('hasVisibleContent 把可见遮罩算作内容，避免误升级成「白屏」诊断', () => {
  const fn = bootGuard.slice(bootGuard.indexOf('function hasVisibleContent()'))
  const body = fn.slice(0, fn.indexOf('HIDING_BODY_CLASSES'))
  assert.match(body, /studioOverlayVisible\(\)/)
})

test('studio-loading 在「不算页面内容」的覆盖层名单里', () => {
  assert.match(bootGuard, /NON_CONTENT_OVERLAY_IDS = \[OVERLAY_ID, 'studio-loading'\]/)
})
